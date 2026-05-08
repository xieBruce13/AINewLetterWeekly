"""
Backfill summary_zh / judgment_zh / etc. on older news_items rows that were
synced before the new factual-headline prompt existed.

Reads rows (by default: missing summary_zh). With --expand-narrative, also
targets rows whose Chinese body is still "stub" sized (no or short lead_zh)
so you can revamp content after prompt changes.

Usage:
    py tools/backfill_summary_zh.py --since 2026-04-01
    py tools/backfill_summary_zh.py --since 2026-05-01 --expand-narrative
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
You are the lead Chinese-language writer for a B2B AI weekly newsletter aimed at engineers and PMs.
Editorial benchmark: TLDR AI / Axios Pro / reputable tech digests — each item reads as a short article, not bullets only.

Given each input JSON object with id, name, company, module, headline, tags, relevance_to_us, hints (prior record fields):

Return a JSON object with key "items" whose value is an array. Each element MUST include input "id" and these fields:

  summary_zh —  headline, 30-70 Chinese characters, news style: Company + Verb + Product + Fact. No 「你/你的」.
  what_it_is_zh — 80-160 chars: what category is this and how it differs from sibling products/features.
  lead_zh — 140-320 chars, 2-4 FULL sentences — deck paragraph (who/when/what changed/why it matters NOW).
  deep_dive_zh — 260-520 chars, 4-8 sentences: context, mechanism/how it works at a practitioner level,
                   ecosystem impact, and at least ONE sentence on limits/unknowns/unverified claims.
  key_points_zh — strongly prefer JSON array of 4-6 strings, each bullet >= 38 characters; ELSE one string with
                  4-6 clauses separated by ；
  scenarios_zh — 180-380 chars; cover TWO+ roles (e.g. infra engineer + PM, or ML + compliance) with concrete usage.
  business_model_zh — null if unknowable; otherwise >=90 chars on availability, SKU, GA/preview, pricing shape.
  feedback_zh — >=140 chars; MUST include BOTH upside and downside/skepticism.
  judgment_zh — 110-260 chars, 2-4 sentences — editorial verdict + explicit risk/watch-out.
  relevance_zh — >=110 chars, tie to practitioner outcomes (latency, eval, roadmap, procurement), not hype.
  official_zh — null or >=85 chars paraphrasing company claims faithfully.
  community_zh — >=85 chars independent discussion; if none, explain the gap («公开讨论仍然有限……»).

Rules:
- Simplified Chinese only for all *_zh values.
- Never fabricate metrics; cite uncertainty as「未披露」/「尚需验证」.
- Base expansions strictly on headline + hints; do NOT invent unrelated products.

OUTPUT SHAPE EXAMPLE:
{"items": [{"id": 1, "summary_zh": "...", ...}, ...]}
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


def record_hints(record: dict | None) -> dict:
    """Pass forward only grounding fields so the payload stays bounded."""
    if not record:
        return {}
    keys = (
        "headline", "summary_zh", "one_line_judgment", "official_claims",
        "core_positioning", "real_change_notes", "business_model",
        "relevance_to_us", "lead_zh", "deep_dive_zh", "key_points_zh",
        "raw_urls",
    )
    out: dict = {}
    for k in keys:
        if k not in record or record[k] in (None, "", []):
            continue
        v = record[k]
        out[k] = v if k != "raw_urls" else (v[:3] if isinstance(v, list) else v)
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--since",      default="2026-04-01")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--dry-run",    action="store_true")
    parser.add_argument(
        "--expand-narrative",
        action="store_true",
        help=(
            "Also pick up rows whose lead_zh is missing or very short (<100 chars after trim), "
            "so skinny legacy content gets rewritten with the new newsletter-depth rules."
        ),
    )
    args = parser.parse_args()

    api_key = get_api_key()
    if not api_key:
        print("OPENAI_API_KEY not set", file=sys.stderr)
        return 1
    client = OpenAI(api_key=api_key)

    conn = psycopg2.connect(get_db_url())
    cur  = conn.cursor()
    expanded_filter = ""
    if args.expand_narrative:
        expanded_filter = """ OR (
            length(trim(COALESCE(record->>'lead_zh',''))) < 100
          )"""

    cur.execute(
        f"""
        SELECT id, name, company, module, headline, tags, relevance_to_us, record
        FROM news_items
        WHERE issue_date >= %s
          AND (
               (record->>'summary_zh' IS NULL OR record->>'summary_zh' = '')
               {expanded_filter}
              )
        ORDER BY issue_date DESC, id ASC
        """,
        (args.since,),
    )
    rows = cur.fetchall()
    print(
        f"Found {len(rows)} candidate rows since {args.since} "
        f"({'missing summary_zh' if not args.expand_narrative else 'missing summary or skinny lead_zh'})"
    )
    if not rows:
        return 0

    updated = 0
    for i in range(0, len(rows), args.batch_size):
        batch = rows[i : i + args.batch_size]
        prompt_items = [
            {
                "id":               r[0],
                "name":             r[1],
                "company":          r[2],
                "module":           r[3],
                "headline":         r[4],
                "tags":             r[5] or [],
                "relevance_to_us": r[6] or "",
                "hints":           record_hints((r[7] or {}) if isinstance(r[7], dict) else {}),
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
            "summary_zh", "what_it_is_zh", "lead_zh", "deep_dive_zh",
            "judgment_zh", "key_points_zh", "scenarios_zh",
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
            if not isinstance(existing_record, dict):
                existing_record = {}
            merged = dict(existing_record)
            for k in zh_keys:
                v = zh.get(k)
                if v is None:
                    continue
                if k == "key_points_zh":
                    if isinstance(v, list):
                        cleaned = [s.strip() for s in v if isinstance(s, str) and s.strip()]
                        if cleaned:
                            merged[k] = cleaned
                    elif isinstance(v, str) and v.strip():
                        merged[k] = v.strip()
                elif isinstance(v, str) and v.strip():
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
