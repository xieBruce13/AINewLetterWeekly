"""
scraped_to_raw.py — Convert raw_scraped.json → raw_model_records.json + raw_product_records.json.

Uses GPT-4o-mini to select + lightly format the most relevant scraped items
into the collector output schema that the rest of the pipeline expects.
Real URLs from the scraper are preserved, so the URL validator will pass.

Usage:
    python tools/scraped_to_raw.py newsletter_runs/2026-05-06 \
        --focus "agent,design,workflow,browser-agent,creative-tool,coding,UX,product" \
        --exclude "biotech,finance,executive-quotes" \
        --audience "product-manager-AI-tools"
"""
from __future__ import annotations
import argparse, json, os, sys, textwrap
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

REPO_ROOT = Path(__file__).resolve().parent.parent

def call_llm(system: str, user: str, model: str = "gpt-4o-mini") -> str:
    from openai import OpenAI
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    r = client.chat.completions.create(
        model=model,
        temperature=0.2,
        max_completion_tokens=8192,
        messages=[{"role": "system", "content": system},
                  {"role": "user",   "content": user}],
    )
    txt = r.choices[0].message.content or ""
    # strip fences
    import re
    m = re.search(r"```json\s*(.+?)\s*```", txt, re.DOTALL)
    return m.group(1).strip() if m else txt.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", help="Path to the run folder (newsletter_runs/YYYY-MM-DD)")
    ap.add_argument("--focus",   default="agent,design,workflow,creative-tool,browser-agent,coding,UX,product")
    ap.add_argument("--exclude", default="biotech,finance,executive-quotes,funding-only")
    ap.add_argument("--audience",default="product-manager-AI-tools")
    ap.add_argument("--max-per-module", type=int, default=20)
    args = ap.parse_args()

    run_dir = Path(args.run_dir)
    scraped_path = run_dir / "raw_scraped.json"
    if not scraped_path.exists():
        sys.exit(f"[ERROR] {scraped_path} not found. Run scraper.py first.")

    raw = json.loads(scraped_path.read_text("utf-8"))
    # Support both list and {"items": [...]} formats
    scraped = raw if isinstance(raw, list) else raw.get("items", raw)
    print(f"Loaded {len(scraped)} scraped items.", flush=True)

    # Compact representation for the LLM context window
    compact = []
    for i, item in enumerate(scraped):
        compact.append({
            "idx": i,
            "title": item.get("title","")[:120],
            "url": item.get("url",""),
            "source": item.get("source",""),
            "module_hint": item.get("module_hint"),
            "tier": item.get("tier","press"),
            "published": item.get("published",""),
            "summary": (item.get("summary") or "")[:200],
            "tags": item.get("tags",[]),
        })

    compact_str = json.dumps(compact, ensure_ascii=False)
    # Truncate to ~80k chars to fit context window
    if len(compact_str) > 80000:
        compact = compact[:200]
        compact_str = json.dumps(compact, ensure_ascii=False)
        print(f"  Truncated to {len(compact)} items for context window.", flush=True)

    system = textwrap.dedent("""
        You are a newsletter editor selecting AI news items for a weekly digest.
        Your job: from a list of scraped articles, pick the most newsworthy and
        relevant ones and return them in the required JSON schema.

        SELECTION RULES:
        - Prefer official announcements, product launches, and concrete capability changes.
        - Prefer topics matching the focus list. Deprioritize excluded topics.
        - For MODEL module: new model releases, significant capability updates, benchmark results.
        - For PRODUCT module: new tools, UI/UX launches, agent frameworks, creative tools, workflow builders.
        - Include items from diverse companies (not too many from the same company).
        - Each selected item MUST use the original URL from the scraped data unchanged.

        OUTPUT: A JSON object with two keys: "model" and "product".
        Each is an array of record objects. Each record must have:
          name (string), company (string), source_tier ("official"|"press"|"community"),
          raw_urls (array with exactly 1 url — the original scraped url),
          published_date (YYYY-MM-DD), summary (1-2 sentences, in ENGLISH),
          tags (array of 3-6 slugs like "agent", "design", "coding", "workflow")
        """).strip()

    user = textwrap.dedent(f"""
        AUDIENCE: {args.audience}
        FOCUS TOPICS: {args.focus}
        EXCLUDE TOPICS: {args.exclude}
        MAX per module: {args.max_per_module}

        SCRAPED ITEMS (pick the best, preserve URLs exactly):
        {compact_str}

        Return a JSON object with keys "model" and "product".
        Each value is an array of up to {args.max_per_module} records.
        Use ONLY the urls from the scraped data — do not invent urls.
        """).strip()

    print("Calling GPT-4o-mini to select + format records...", flush=True)
    raw_text = call_llm(system, user)

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        # Try to find JSON in the response
        import re
        m = re.search(r'\{[\s\S]*\}', raw_text)
        if m:
            result = json.loads(m.group(0))
        else:
            sys.exit(f"[ERROR] Could not parse LLM response:\n{raw_text[:500]}")

    model_records = result.get("model", [])
    product_records = result.get("product", [])

    # Write outputs
    (run_dir / "raw_model_records.json").write_text(
        json.dumps(model_records, ensure_ascii=False, indent=2), "utf-8"
    )
    (run_dir / "raw_product_records.json").write_text(
        json.dumps(product_records, ensure_ascii=False, indent=2), "utf-8"
    )
    print(f"[OK] raw_model_records.json: {len(model_records)} items", flush=True)
    print(f"[OK] raw_product_records.json: {len(product_records)} items", flush=True)
    print("Now run: py tools/run_pipeline.py --date <YYYY-MM-DD> --start-at 2 --stop-at 9")


if __name__ == "__main__":
    main()
