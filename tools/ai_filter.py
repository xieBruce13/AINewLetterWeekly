"""
tools/ai_filter.py — AI filter + rank on pre-scraped items.

Takes raw_scraped.json (output of scraper.py), sends all titles+summaries
to the LLM in ONE batch call, gets back a ranked shortlist with relevance
judgments, then enriches the top N items in a second batch call.

Usage:
    python tools/ai_filter.py \
        --input  newsletter_runs/YYYY-MM-DD/raw_scraped.json \
        --output newsletter_runs/YYYY-MM-DD/raw_model_records.json \
                 newsletter_runs/YYYY-MM-DD/raw_product_records.json \
        --issue-date YYYY-MM-DD \
        --top 30

Requires OPENAI_API_KEY in environment (or .env.local).
"""

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

FILTER_MODEL  = "gpt-4.1-mini"   # fast + cheap for batch filtering
ENRICH_MODEL  = "gpt-4.1"        # stronger for record normalization
MAX_ITEMS_IN_FILTER_PROMPT = 150  # batch size sent to LLM
TOP_N_TO_ENRICH = 30             # how many pass to the enrichment step


# ---------------------------------------------------------------------------
# Step 1 — Batch filter + score
# ---------------------------------------------------------------------------

FILTER_SYSTEM = """
You are an editorial filter for an AI industry weekly newsletter aimed at
AI engineers and product managers at AI-native companies.

You receive a numbered list of article titles and short summaries.
For each item decide:
  - relevant: true/false — is this substantive AI industry news?
  - module: "model" | "product" | "operation" | null
    model    = base model releases, benchmarks, capability changes
    product  = end-user AI products, tools, workflows, integrations
    operation= AI infra, MLOps, eval, cost, deployment, open-source frameworks
  - importance: 1-10 (10 = major industry-defining event)
  - reason: one short English sentence explaining the score

Skip: pure hype/speculation without substance, non-AI news, duplicates,
opinion pieces with no new information, content older than the window.

Return JSON array (same order as input):
[{"idx": 0, "relevant": true, "module": "model", "importance": 8, "reason": "..."},
 {"idx": 1, "relevant": false, ...}, ...]
""".strip()


def batch_filter(client: OpenAI, items: list[dict]) -> list[dict]:
    """Send up to MAX_ITEMS_IN_FILTER_PROMPT items, get back scored list."""
    lines = []
    for i, item in enumerate(items[:MAX_ITEMS_IN_FILTER_PROMPT]):
        title = item.get("title", "")[:200]
        summary = (item.get("summary") or "")[:200].replace("\n", " ")
        lines.append(f"{i}. [{item.get('tier','?')}] {title} | {summary}")

    prompt = "Rate each item:\n\n" + "\n".join(lines)

    response = client.chat.completions.create(
        model=FILTER_MODEL,
        messages=[
            {"role": "system", "content": FILTER_SYSTEM},
            {"role": "user",   "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )
    raw = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
        # Handle both {"items": [...]} and direct array
        if isinstance(parsed, list):
            return parsed
        for key in ("items", "results", "data", "records"):
            if key in parsed and isinstance(parsed[key], list):
                return parsed[key]
        # Fallback: find the first list value
        for v in parsed.values():
            if isinstance(v, list):
                return v
    except json.JSONDecodeError:
        pass
    return []


# ---------------------------------------------------------------------------
# Step 2 — Enrich top items to normalized schema
# ---------------------------------------------------------------------------

ENRICH_SYSTEM = """
You are a research analyst normalizing AI news items for a weekly newsletter.

For each item, produce a structured JSON record matching this schema:
{
  "name": "Short product/model name",
  "company": "Company name",
  "module": "model|product|operation",
  "updated_at": "YYYY-MM-DD",
  "headline": "One sentence factual headline (English)",
  "one_line_judgment": "Concise editorial verdict (English)",
  "official_claims": ["claim1", "claim2"],
  "external_validation_summary": "What independent sources say, or null",
  "real_change_notes": "What concretely changed (for models), or null",
  "core_positioning": "What is this and why does it matter (for products), or null",
  "user_scenarios": ["scenario1", "scenario2"],
  "business_model": "Pricing / distribution summary, or null",
  "price_speed_cost_notes": "Specific price/speed numbers if available, or null",
  "user_market_feedback": {"good": ["...", "..."], "bad": ["...", "..."]},
  "ecosystem_echo": "Industry/community reaction summary, or null",
  "relevance_to_us": "Why relevant to AI-native product teams",
  "raw_urls": ["url1"],
  "item_tier": "main|brief",
  "tags": ["tag1", "tag2", "tag3"]
}

item_tier rules:
  main  = importance >= 7 AND has substantial new information
  brief = importance 5-6 OR limited new information

Base your answers ONLY on the information provided — do not hallucinate.
Return a JSON array of records.
""".strip()


def enrich_items(client: OpenAI, items: list[dict], scores: list[dict], issue_date: str) -> list[dict]:
    """Normalize top items into the newsletter record schema."""
    # Build index from filter scores
    score_map = {s["idx"]: s for s in scores if s.get("relevant")}

    # Pick the top items by importance
    top = sorted(
        [(i, score_map[i]) for i in score_map if score_map[i].get("importance", 0) >= 5],
        key=lambda x: -x[1].get("importance", 0)
    )[:TOP_N_TO_ENRICH]

    if not top:
        return []

    enrich_inputs = []
    for orig_idx, score in top:
        item = items[orig_idx] if orig_idx < len(items) else {}
        enrich_inputs.append({
            "idx": orig_idx,
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "source": item.get("source", ""),
            "published_at": item.get("published_at", issue_date),
            "summary": (item.get("summary") or "")[:500],
            "module_hint": score.get("module") or item.get("module_hint"),
            "importance": score.get("importance", 5),
            "filter_reason": score.get("reason", ""),
        })

    prompt = (
        f"Issue date: {issue_date}\n\n"
        f"Normalize these {len(enrich_inputs)} items into newsletter records:\n\n"
        + json.dumps(enrich_inputs, ensure_ascii=False, indent=2)
    )

    response = client.chat.completions.create(
        model=ENRICH_MODEL,
        messages=[
            {"role": "system", "content": ENRICH_SYSTEM},
            {"role": "user",   "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    raw = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
        records = parsed if isinstance(parsed, list) else next(
            (v for v in parsed.values() if isinstance(v, list)), []
        )
    except json.JSONDecodeError:
        print("Warning: could not parse enrich response", file=sys.stderr)
        return []

    # Add issue_date + source metadata
    for r in records:
        r.setdefault("updated_at", issue_date)
        r.setdefault("issue_date", issue_date)
        # Find original URL if not set
        orig_idx = r.get("_orig_idx")
        if not r.get("raw_urls") and orig_idx is not None and orig_idx < len(items):
            r["raw_urls"] = [items[orig_idx].get("url", "")]

    return records


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="AI filter + normalize scraped items.")
    parser.add_argument("--input",      required=True,  help="Path to raw_scraped.json")
    parser.add_argument("--issue-date", required=False, default=str(date.today()), help="Issue date YYYY-MM-DD")
    parser.add_argument("--top",        type=int, default=TOP_N_TO_ENRICH, help="Max items to enrich")
    parser.add_argument("--out-dir",    required=True,  help="Output directory for raw_model_records.json + raw_product_records.json")
    args = parser.parse_args()

    # Load env from web/.env.local if OPENAI_API_KEY not set
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
    with open(args.input, encoding="utf-8") as f:
        scraped = json.load(f)
    items = scraped.get("items", scraped) if isinstance(scraped, dict) else scraped
    print(f"  {len(items)} items loaded", file=sys.stderr)

    # Step 1 — filter
    print(f"\nStep 1: Batch filtering {min(len(items), MAX_ITEMS_IN_FILTER_PROMPT)} items...", file=sys.stderr)
    scores = batch_filter(client, items)
    relevant = [s for s in scores if s.get("relevant")]
    print(f"  {len(relevant)} relevant items (importance ≥ 5: "
          f"{sum(1 for s in relevant if s.get('importance',0)>=5)})", file=sys.stderr)

    # Step 2 — enrich
    global TOP_N_TO_ENRICH
    TOP_N_TO_ENRICH = args.top
    print(f"\nStep 2: Enriching top {args.top} items...", file=sys.stderr)
    records = enrich_items(client, items, scores, args.issue_date)
    print(f"  {len(records)} records normalized", file=sys.stderr)

    # Split into model vs product+operation
    models   = [r for r in records if r.get("module") == "model"]
    products = [r for r in records if r.get("module") in ("product", "operation")]

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    model_path   = out_dir / "raw_model_records.json"
    product_path = out_dir / "raw_product_records.json"

    with open(model_path,   "w", encoding="utf-8") as f:
        json.dump(models,   f, ensure_ascii=False, indent=2)
    with open(product_path, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)

    print(f"\n✓ {len(models)} model records  → {model_path}", file=sys.stderr)
    print(f"✓ {len(products)} product records → {product_path}", file=sys.stderr)
    print(f"\nNext: run the normalizer + verifier + scorer pipeline on these files.", file=sys.stderr)


if __name__ == "__main__":
    main()
