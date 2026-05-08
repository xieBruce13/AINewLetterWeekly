"""
tools/ai_filter.py — AI enrichment for pre-filtered news items.

UPDATED ARCHITECTURE
====================
This step now only *enriches* items; it no longer decides which items are
relevant (that is handled upstream by rule_filter.py — zero AI calls).

New pipeline:

  [scraper.py]     → raw_scraped.json      (all items, ~200+)
  [rule_filter.py] → filtered_scraped.json (rule-ranked subset, ~50-80)
  [ai_filter.py]   → raw_{model,product}_records.json
                      (top N enriched to newsletter schema)

Benefits vs. old approach:
  - AI sees only pre-ranked items, not a raw dump → shorter prompts, lower cost
  - Module + importance are already provided by rule_filter → AI confirms/adjusts
    rather than classifying from scratch
  - ~70% fewer tokens than the previous two-step batch-filter + enrich

Backward compatibility
======================
Accepts EITHER raw_scraped.json (old path) OR filtered_scraped.json (new path).
When the input looks like a raw dump (missing "rule_filtered" keys), a lightweight
in-process pre-filter is applied automatically so the script still works standalone.

Usage:
    python tools/ai_filter.py \
        --input  newsletter_runs/YYYY-MM-DD/filtered_scraped.json \
        --issue-date YYYY-MM-DD \
        --top 30 \
        --out-dir newsletter_runs/YYYY-MM-DD/

Requires OPENAI_API_KEY in environment or web/.env.local.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

try:
    from openai import OpenAI
except ImportError:
    print("Missing openai package. Run: pip install openai", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ENRICH_MODEL = "gpt-4.1"        # richer model for schema normalization
FAST_MODEL   = "gpt-4.1-mini"   # used only for the fallback batch-filter
MAX_ITEMS_PER_ENRICH_CALL = 15  # items per enrichment API call (batched)
TOP_N_DEFAULT = 30


# ---------------------------------------------------------------------------
# Fallback lightweight filter (used only when input is NOT pre-filtered)
# ---------------------------------------------------------------------------

_FALLBACK_FILTER_SYSTEM = """
You are an editorial filter for an AI industry newsletter.
Given a numbered list of article titles and short summaries, return a JSON OBJECT
with a single key "items" whose value is an array with one object per input item:
{"items": [
  {"idx": 0, "relevant": true, "module": "model"|"product"|"operation"|null,
   "importance": 1-10, "reason": "one sentence"},
  ...
]}

Skip: pure speculation/hype, non-AI news, duplicates, old news, opinion without facts.
""".strip()


def _fallback_filter(client: OpenAI, items: list[dict]) -> list[dict]:
    """Lightweight batch filter — used only when rule_filter was not run upstream."""
    lines = []
    for i, item in enumerate(items[:150]):
        title   = (item.get("title") or "")[:200]
        summary = (item.get("summary") or "")[:200].replace("\n", " ")
        lines.append(f"{i}. [{item.get('tier','?')}] {title} | {summary}")

    resp = client.chat.completions.create(
        model=FAST_MODEL,
        messages=[
            {"role": "system", "content": _FALLBACK_FILTER_SYSTEM},
            {"role": "user",   "content": "Rate each item:\n\n" + "\n".join(lines)},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )
    raw = resp.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
        for key in ("items", "results", "data", "records"):
            if key in parsed and isinstance(parsed[key], list):
                return parsed[key]
        for v in parsed.values():
            if isinstance(v, list):
                return v
    except json.JSONDecodeError:
        pass
    return []


# ---------------------------------------------------------------------------
# Enrichment — convert filtered items into full newsletter record schema
# ---------------------------------------------------------------------------

ENRICH_SYSTEM = """
You are a research analyst normalizing AI news items for a weekly newsletter
targeting Chinese-speaking AI practitioners and product builders.

Each input item may already contain:
  - module          (rule-classified; confirm or adjust)
  - importance_score (rule estimate 0-10; use as a guide)
  - matched_company (rule-extracted; confirm or correct)
  - matched_tags    (rule-extracted; extend as needed)

For each item produce a JSON record matching this schema:
{
  "name": "Short product/model name (English OK)",
  "company": "Company name",
  "module": "model|product|operation",
  "updated_at": "YYYY-MM-DD",
  "headline": "One factual sentence (English)",
  "one_line_judgment": "Concise editorial verdict (English)",
  "official_claims": ["claim1", "claim2"],
  "external_validation_summary": "What independent sources say, or null",
  "real_change_notes": "What concretely changed (models), or null",
  "core_positioning": "What this is and why it matters (products), or null",
  "user_scenarios": ["scenario1", "scenario2"],
  "business_model": "Pricing/distribution summary, or null",
  "price_speed_cost_notes": "Specific numbers if available, or null",
  "user_market_feedback": {"good": ["..."], "bad": ["..."]},
  "ecosystem_echo": "Industry/community reaction summary, or null",
  "relevance_to_us": "Why relevant to AI-native product teams (English)",
  "raw_urls": ["url1"],
  "item_tier": "main|brief",
  "tags": ["tag1", "tag2", "tag3"],

  "summary_zh": "一句中文新闻稿式标题（30-70字，含公司名、产品/动作、核心变化、关键事实/数字）",
  "key_points_zh": "核心技术能力或产品亮点（中文，2-4点，分号分隔）",
  "scenarios_zh": "谁会用、怎么用（中文，面向AI工程师和产品经理）",
  "business_model_zh": "商业模式与定价（中文，有具体数字最好）",
  "feedback_zh": "用户与社区反馈（中文，好坏各一两点）",
  "judgment_zh": "编辑判断（中文，给AI产品团队的一句话结论）",
  "relevance_zh": "与读者的关系（中文，为什么这条对AI工程师/PM重要）",
  "official_zh": "官方核心声明（中文，1-2句）",
  "community_zh": "社区与外部反馈（中文，1-2句）"
}

item_tier rules:
  main  = importance >= 7 AND substantial new information
  brief = importance 5-6 OR limited new information

CRITICAL RULES for summary_zh — this is THE headline shown on the website.
It must read like a real news headline, NOT a personalized note.

  GOOD examples:
    - "Anthropic 发布新旗舰模型 Claude Opus 4.7，SWE-bench Verified 87.6% 把工程能力基准拉高一档，价格不变"
    - "Adobe 推出 Firefly AI Assistant，把 Photoshop / Premiere / Illustrator 抽象成单一对话驱动的 agent 工作流"
    - "Google 在 Chrome 中推出 Skills 功能，把 Gemini prompt 固化为一键复用的浏览器内技能层"
    - "OpenAI Gemini API 引入 Webhooks，长任务延迟从轮询级降到事件级"

  BAD examples (do NOT generate these):
    - "AlphaEvolve 编码代理应用于多领域"  ← too vague, no concrete change
    - "为AI团队提供跨领域应用参考"  ← editorial commentary, not news
    - "你的工程方向值得看：……"  ← personalized "你/your" framing
    - "本周值得关注的产品更新"  ← meta, not the actual news

  REQUIRED format:
    [主体公司] + [动作动词：发布/推出/更新/开源/收购/融资] + [产品或技术名] + [核心变化或关键数字]

Other zh field rules:
- All zh fields MUST be in simplified Chinese
- Never use "你/你的/your" framing — these are facts, not advice
- Keep summaries factual; the personalized angle comes from a separate layer
- If no information available for a field, use null

Base answers ONLY on the provided information — do not hallucinate numbers.

IMPORTANT: Return a JSON OBJECT with a single top-level key "records" whose value is
an array containing one record per input item:
{"records": [ {record1}, {record2}, ... ]}
""".strip()


def enrich_batch(
    client: OpenAI,
    batch: list[dict],
    issue_date: str,
) -> list[dict]:
    """Enrich a batch of items into full newsletter records via one LLM call."""
    prompt = (
        f"Issue date: {issue_date}\n\n"
        f"Normalize these {len(batch)} items:\n\n"
        + json.dumps(batch, ensure_ascii=False, indent=2)
    )
    resp = client.chat.completions.create(
        model=ENRICH_MODEL,
        messages=[
            {"role": "system", "content": ENRICH_SYSTEM},
            {"role": "user",   "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    raw = resp.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
        # The LLM may return a bare array or wrap in {"records": [...]} etc.
        # We want the list whose elements are dicts (the actual records).
        if isinstance(parsed, list):
            records = parsed
        else:
            records = []
            for v in parsed.values():
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    records = v
                    break
        return [r for r in records if isinstance(r, dict)]
    except json.JSONDecodeError as e:
        print(f"Warning: could not parse enrich response: {e}", file=sys.stderr)
    return []


def enrich_items(
    client: OpenAI,
    items: list[dict],
    issue_date: str,
    top_n: int = TOP_N_DEFAULT,
) -> list[dict]:
    """
    Build enrichment inputs from the top_n items and call the LLM in batches.

    Items are expected to already have `importance_score`, `module`, etc. from
    rule_filter.py. If those fields are missing (raw input) they default gracefully.
    """
    # Sort by importance descending, take top_n
    sorted_items = sorted(
        items,
        key=lambda x: -(x.get("importance_score") or x.get("importance") or 0),
    )[:top_n]

    enrich_inputs = []
    # Side table: keep the raw item alongside the enrich input so we can
    # carry through fields like image_candidates that we don't want the LLM
    # to see (would pollute the prompt and risk hallucinated URLs).
    side_data: list[dict] = []
    for item in sorted_items:
        enrich_inputs.append({
            "title":          item.get("title", ""),
            "url":            item.get("url", ""),
            "source":         item.get("source", ""),
            "published_at":   item.get("published_at", issue_date),
            "summary":        (item.get("summary") or "")[:500],
            "module_hint":    item.get("module") or item.get("module_hint"),
            "importance_hint":item.get("importance_score") or item.get("importance", 5),
            "company_hint":   item.get("matched_company"),
            "tags_hint":      item.get("matched_tags") or item.get("source_tags") or [],
        })
        side_data.append({
            "url":              item.get("url", ""),
            "image_candidates": item.get("image_candidates") or [],
        })

    print(
        f"  Enriching {len(enrich_inputs)} items via AI "
        f"(batches of {MAX_ITEMS_PER_ENRICH_CALL})...",
        file=sys.stderr,
    )

    all_records: list[dict] = []
    for start in range(0, len(enrich_inputs), MAX_ITEMS_PER_ENRICH_CALL):
        batch = enrich_inputs[start : start + MAX_ITEMS_PER_ENRICH_CALL]
        side  = side_data[start : start + MAX_ITEMS_PER_ENRICH_CALL]
        print(
            f"    → batch {start // MAX_ITEMS_PER_ENRICH_CALL + 1} "
            f"({len(batch)} items)...",
            file=sys.stderr,
        )
        records = enrich_batch(client, batch, issue_date)
        for i, rec in enumerate(records):
            rec.setdefault("updated_at", issue_date)
            rec.setdefault("issue_date", issue_date)
            # Carry the source URL + image candidates from the original item.
            # `i` is the LLM's output index — we trust it to preserve order
            # within the batch, which it does in practice for these calls.
            if i < len(side):
                if not rec.get("raw_urls"):
                    rec["raw_urls"] = [side[i].get("url", "")]
                if not rec.get("image_candidates"):
                    rec["image_candidates"] = side[i].get("image_candidates") or []
        all_records.extend(records)

    return all_records


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",       required=True,
                        help="Path to filtered_scraped.json (preferred) or raw_scraped.json")
    parser.add_argument("--issue-date",  default=str(date.today()),
                        help="Issue date YYYY-MM-DD")
    parser.add_argument("--top",         type=int, default=TOP_N_DEFAULT,
                        help="Max items to enrich with AI (default: 30)")
    parser.add_argument("--out-dir",     required=True,
                        help="Output directory for raw_model_records.json + raw_product_records.json")
    args = parser.parse_args()

    # Load API key
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        env_path = Path(__file__).parent.parent / "web" / ".env.local"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("OPENAI_API_KEY="):
                    api_key = line.split("=", 1)[1].strip()
                    break
    if not api_key:
        print("Error: OPENAI_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    print(f"Loading {args.input}...", file=sys.stderr)
    with open(args.input, encoding="utf-8") as fh:
        data = json.load(fh)
    items: list[dict] = data.get("items", data) if isinstance(data, dict) else data
    print(f"  {len(items)} items loaded", file=sys.stderr)

    # Detect whether the input is already rule-filtered
    pre_filtered = any(item.get("rule_filtered") for item in items[:5])

    if not pre_filtered:
        print(
            "\nInput does not appear to be rule-filtered. "
            "Running fallback AI batch-filter...",
            file=sys.stderr,
        )
        scores = _fallback_filter(client, items)
        relevant_idxs = {
            s["idx"] for s in scores
            if s.get("relevant") and s.get("importance", 0) >= 5
        }
        # Annotate items with importance from fallback filter
        for s in scores:
            if s["idx"] < len(items):
                items[s["idx"]]["importance_score"] = s.get("importance", 5)
                items[s["idx"]]["module"] = s.get("module")
        items = [it for i, it in enumerate(items) if i in relevant_idxs]
        print(f"  {len(items)} items after fallback filter", file=sys.stderr)
    else:
        print(
            f"  Input is pre-filtered by rule_filter.py. "
            f"Skipping AI batch-filter step.",
            file=sys.stderr,
        )

    print(f"\nEnriching top {args.top} items...", file=sys.stderr)
    records = enrich_items(client, items, args.issue_date, top_n=args.top)
    print(f"  {len(records)} records normalized", file=sys.stderr)

    # Split by module
    models   = [r for r in records if r.get("module") == "model"]
    products = [r for r in records if r.get("module") in ("product", "operation")]

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    model_path   = out_dir / "raw_model_records.json"
    product_path = out_dir / "raw_product_records.json"

    with open(model_path,   "w", encoding="utf-8") as fh:
        json.dump(models,   fh, ensure_ascii=False, indent=2)
    with open(product_path, "w", encoding="utf-8") as fh:
        json.dump(products, fh, ensure_ascii=False, indent=2)

    print(f"\n✓ {len(models)} model records   → {model_path}", file=sys.stderr)
    print(f"✓ {len(products)} product records → {product_path}", file=sys.stderr)
    print("\nNext: run sync_to_db.py (or the full pipeline writer/QA steps).", file=sys.stderr)


if __name__ == "__main__":
    main()
