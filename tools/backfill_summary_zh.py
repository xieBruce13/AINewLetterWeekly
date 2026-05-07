"""
Backfill summary_zh / judgment_zh / etc. on older news_items rows that were
synced before the new factual-headline prompt existed.

Reads rows where record->>'summary_zh' IS NULL, sends each (name, company,
headline, module, tags, relevance_to_us) to the LLM, gets back the 9
*_zh fields, and merges them into news_items.record + updates news_items.headline.

Usage:
    py tools/backfill_summary_zh.py --since 2026-04-01
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import psycopg2
from psycopg2.extras import Json

try:
    from openai import OpenAI
except ImportError:
    print("Missing openai package", file=sys.stderr)
    sys.exit(1)


MODEL = "gpt-4o-mini"


SYSTEM = """
You are normalizing AI news items for a Chinese-language weekly newsletter.

For each input item produce ONLY these 9 Chinese fields, all in simplified
Chinese, returned as a JSON object with key "items":

{
  "items": [
    {
      "id": <input id>,
      "summary_zh":        "一句中文新闻稿式标题（30-70字，含公司名、产品/动作、核心变化、关键事实/数字）",
      "judgment_zh":       "编辑判断（中文，给AI产品团队的一句话结论）",
      "key_points_zh":     "核心技术能力或产品亮点（中文，2-4点，分号分隔）",
      "scenarios_zh":      "谁会用、怎么用（中文）",
      "business_model_zh": "商业模式与定价（中文，可为 null）",
      "feedback_zh":       "用户与社区反馈（中文，好坏各一两点，可为 null）",
      "relevance_zh":      "与AI工程师/PM的关系（中文）",
      "official_zh":       "官方核心声明（中文，1-2句，可为 null）",
      "community_zh":      "社区与外部反馈（中文，1-2句，可为 null）"
    },
    ...
  ]
}

CRITICAL summary_zh rules — this is THE headline.
- Format: [主体公司] + [动作动词] + [产品名] + [核心变化或关键数字]
- GOOD: "Anthropic 发布 Claude Opus 4.7，SWE-bench Verified 87.6% 把工程能力基准拉高一档"
- BAD:  "你的工程方向值得看：……"   ← personalized "你/your"
- BAD:  "AlphaEvolve 应用于多领域"   ← too vague
- Never use "你/你的/your" framing
- Base on input only; do not hallucinate numbers
""".strip()


def get_db_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    return "postgresql://postgres:fTjaIachqVRFfVXIXbkoGtsyjtEVcfZY@shuttle.proxy.rlwy.net:35509/railway"


def get_api_key() -> str | None:
    if k := os.environ.get("OPENAI_API_KEY"):
        return k
    env_path = Path(__file__).parent.parent / "web" / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("OPENAI_API_KEY="):
                return line.split("=", 1)[1].strip()
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--since",      default="2026-04-01")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--dry-run",    action="store_true")
    args = parser.parse_args()

    api_key = get_api_key()
    if not api_key:
        print("OPENAI_API_KEY not set", file=sys.stderr)
        return 1
    client = OpenAI(api_key=api_key)

    conn = psycopg2.connect(get_db_url())
    cur  = conn.cursor()
    cur.execute(
        """
        SELECT id, name, company, module, headline, tags, relevance_to_us, record
        FROM news_items
        WHERE issue_date >= %s
          AND (record->>'summary_zh' IS NULL OR record->>'summary_zh' = '')
        ORDER BY issue_date DESC, id ASC
        """,
        (args.since,),
    )
    rows = cur.fetchall()
    print(f"Found {len(rows)} rows missing summary_zh since {args.since}")
    if not rows:
        return 0

    updated = 0
    for i in range(0, len(rows), args.batch_size):
        batch = rows[i : i + args.batch_size]
        prompt_items = [
            {
                "id":              r[0],
                "name":            r[1],
                "company":         r[2],
                "module":          r[3],
                "headline":        r[4],
                "tags":            r[5] or [],
                "relevance_to_us": r[6] or "",
            }
            for r in batch
        ]

        print(f"Batch {i//args.batch_size + 1}: enriching {len(batch)} items via {MODEL}…")
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM},
                    {"role": "user",   "content": json.dumps(prompt_items, ensure_ascii=False)},
                ],
                response_format={"type": "json_object"},
                temperature=0.3,
            )
            parsed = json.loads(resp.choices[0].message.content or "{}")
            items = parsed.get("items") or parsed.get("records") or []
        except Exception as e:
            print(f"  LLM call failed: {e}", file=sys.stderr)
            continue

        zh_keys = (
            "summary_zh", "judgment_zh", "key_points_zh", "scenarios_zh",
            "business_model_zh", "feedback_zh", "relevance_zh",
            "official_zh", "community_zh",
        )

        by_id = {x.get("id"): x for x in items if isinstance(x, dict)}
        for r in batch:
            item_id = r[0]
            zh = by_id.get(item_id)
            if not zh:
                print(f"  [{item_id}] {r[1]}: no LLM output, skipped")
                continue
            existing_record = r[7] or {}
            merged = dict(existing_record)
            for k in zh_keys:
                v = zh.get(k)
                if v and isinstance(v, str) and v.strip():
                    merged[k] = v.strip()
            new_summary = merged.get("summary_zh") or r[4]
            print(f"  [{item_id}] {r[1][:30]}…")
            print(f"      summary_zh: {merged.get('summary_zh')}")

            if not args.dry_run:
                cur.execute(
                    "UPDATE news_items SET record = %s, headline = %s, updated_at = now() WHERE id = %s",
                    (Json(merged), new_summary, item_id),
                )
                updated += 1

        if not args.dry_run:
            conn.commit()
        time.sleep(0.5)

    cur.close()
    conn.close()
    print(f"\nUpdated {updated} rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
