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
You are the lead writer for a weekly B2B newsletter for Chinese-speaking AI engineers,
PMs, and technical leads. Editorial reference: professional tech digests (TLDR AI,
The Information-style depth, NOT Twitter threads). Each item must feel like a mini-article,
not a tweet-sized stub.

Each input item may contain rule hints: module, importance_score, matched_company, matched_tags.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEWSLETTER CRAFT (follow this ladder for every item):
  1. summary_zh   — sharp headline (still one line).
  2. lead_zh      — the "deck": who did what, why now, what's new (2–4 sentences).
  3. deep_dive_zh — body: context + concrete mechanism + who wins/loses + caveats
                     (professionals expect trade-offs, not cheerleading).
  4. key points   — scannable bullets (inverted pyramid: most important first).
  5. scenarios    — role-based "how you'd use this" with enough detail to act on.
  6. judgment_zh  — editor take: signal vs noise + one risk/limitation to watch.

Voice: factual, authoritative, concise Chinese. NEVER use 「你/你的」or English "your".
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For each input item produce ONE JSON record matching this schema (English scaffolding +
rich Chinese narrative fields):

{
  "name": "Short product/model name (English OK)",
  "company": "Company name",
  "module": "model|product|operation",
  "updated_at": "YYYY-MM-DD",
  "headline": "One factual sentence (English)",
  "one_line_judgment": "Concise editorial verdict (English)",
  "official_claims": ["claim1", "claim2"],
  "external_validation_summary": "Independent view, or null",
  "real_change_notes": "Concrete delta (models), or null",
  "core_positioning": "Products: what shipped and why it matters; or null",
  "user_scenarios": ["scenario1", "scenario2"],
  "business_model": "Pricing/distribution, or null",
  "price_speed_cost_notes": "Numbers if grounded in source, or null",
  "user_market_feedback": {"good": ["..."], "bad": ["..."]},
  "ecosystem_echo": "Industry reaction, or null",
  "relevance_to_us": "Why AI-native teams care (English)",
  "raw_urls": ["url1"],
  "item_tier": "main|brief",
  "tags": ["tag1", "tag2", "tag3"],

  "summary_zh": "中文标题式一句话（30–70个汉字），含公司+动作+产品/技术+关键事实/数字",
  "what_it_is_zh": "用80–160个汉字解释「这到底是什么」：类别、与相邻产品/路线关系，避免空洞形容词",
  "lead_zh": "导语：140–320个汉字，2–4个完整句子。交代主体、动作、时间/范围、与读者工作的连接点",
  "deep_dive_zh": "深度解读：260–520个汉字，4–8句。含：背景或动机、技术/产品机制（能落地到能力变化）、对生态/采购/安全的影响、至少一句局限或待验证点",
  "key_points_zh": "prefer JSON array of 4-6 strings (≥38 chars each); else semicolon-separated string",
  "scenarios_zh": "180–380个汉字。分两段或带换行意象：覆盖至少两类角色（如工程/PM/平台/合规/运营）各自如何落地",
  "business_model_zh": "商业模式与可得性：若无公开信息则用 null；若有则≥ 90个汉字（渠道、计费形态、预览/GA）",
  "feedback_zh": "≥ 140个汉字。必须同时包含「正面反响或机会」与「担忧、差评或边界条件」两部分",
  "judgment_zh": "110–260个汉字。2–4句编辑部结论：信号强度；对团队的意义；要明确写出至少一个风险或未决问题",
  "relevance_zh": "≥ 110个汉字。说明与AI工程师/PM/创业者的具体关联，避免口号",
  "official_zh": "官方表述要点：若无则 null；若有则≥ 85个汉字，可改编自 official_claims",
  "community_zh": "≥ 85个汉字的外部/社区视角；若信息不足则写「公开讨论有限…」并说明缺口，不要 null 为空泛"
}

item_tier rules:
  main  = importance >= 7 AND substantial new information
  brief = importance 5–6 OR thin source — STILL meet minimum zh lengths where possible;
          if the source is extremely thin, prioritize accuracy over length and note the gap in deep_dive_zh.

CRITICAL — summary_zh (website headline):
  Format: [主体公司] + [动作：发布/推出/更新/开源/融资/收购] + [产品/技术名] + [核心变化或关键数字]
  GOOD: "Google Gemini API 推出事件驱动 Webhooks，长任务由轮询改为推送通知"
  BAD:  vague labels, meta phrases ("值得关注"), or any 「你/你的」framing.

Hard rules:
- All *_zh fields: simplified Chinese only.
- Count Chinese characters (汉字) for length floors — do not pad with punctuation.
- Do not invent metrics, prices, or dates not present in the source; say「未披露」when unknown.
- Total narrative depth: lead_zh + deep_dive_zh + scenarios_zh + judgment_zh should make the item
  comfortably readable for 90–180 seconds (professional newsletter bar).

IMPORTANT: Return ONLY a JSON OBJECT: {"records": [ {...}, ... ]}
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
