"""
tools/weekly_summary.py — Generate weekly_summary.json from enriched records.

Takes the per-item records produced by ai_filter.py (raw_model_records.json +
raw_product_records.json) and produces a single LLM call that yields:

  {
    "theme":  "本周一句话主题（带核心判断）",
    "bullets": [
      {"text": "**Anthropic / Claude**：…", "slugs": ["2026-05-07-anthropic-..."]},
      ...
    ]
  }

The site's home page reads this from the issue_summaries table (via
sync_to_db.py's upsert_summary).

Usage:
    python tools/weekly_summary.py \
        --run-dir newsletter_runs/2026-05-07 \
        --issue-date 2026-05-07
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

try:
    from openai import OpenAI
except ImportError:
    print("Missing openai package. Run: pip install openai", file=sys.stderr)
    sys.exit(1)


SUMMARY_MODEL = "gpt-4.1"


SYSTEM_PROMPT = """
You are the editor-in-chief of a Chinese AI industry weekly newsletter aimed at
AI engineers and product builders.

You'll receive the week's curated items (each with a name, company, module,
summary_zh, judgment_zh, and slug). Produce a 30-second weekly digest:

{
  "theme":   "一句话本周主题（中文，带核心判断，20-40 字）",
  "bullets": [
    {
      "text":  "**主体名称**：本周关键事件与影响（中文，35-60 字，开头加粗主体名）",
      "slugs": ["primary-slug-of-the-bullet", "optional-related-slug"]
    },
    ... (5-7 bullets total)
  ]
}

CRITICAL DIVERSITY RULES (enforce strictly):
- AT MOST 2 bullets can share the same company. Even if Amazon ships 10
  things this week, you MUST consolidate them into AT MOST 2 bullets
  (e.g. "Amazon Bedrock 系列" + "Amazon SageMaker 系列").
- Spread bullets across modules: at least 1 model bullet, at least 1
  product bullet, at least 1 operation/infra bullet (when those modules
  have any items in the input).
- Prefer items with item_tier=main over brief.
- Surface at least 1 non-mega-cap player (startup, OSS, smaller lab) when
  available in the input — readers want signal beyond AWS/Google.

Editorial rules:
- The theme MUST capture the editorial through-line of the week —
  what's the pattern? what's the shift? Don't just say "本周AI动态".
- Each bullet:
  - Starts with **粗体主体名** (company or product) followed by 「：」
  - Then ONE concrete fact + WHY it matters
  - Mentions concrete numbers or capabilities when available
  - 35-60 Chinese characters total
- "slugs" lists the slug(s) of the item(s) the bullet refers to. The
  primary item is first; up to 2 related items can follow.
- Output JSON ONLY, no prose.
- Write everything in simplified Chinese.
""".strip()


def _slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"-+", "-", s).strip("-")[:80] or "item"


def _slug_for_record(rec: dict, issue_date: str) -> str:
    seed = f"{issue_date}-{rec.get('company','')}-{rec.get('name','')}"
    if rec.get("version"):
        seed += f"-{rec['version']}"
    return _slugify(seed)


def build_input(records: list[dict], issue_date: str) -> list[dict]:
    """Compact each record to what the summary LLM needs."""
    out = []
    for r in records:
        slug = _slug_for_record(r, issue_date)
        out.append({
            "slug":         slug,
            "name":         r.get("name", ""),
            "company":      r.get("company", ""),
            "module":       r.get("module", ""),
            "item_tier":    r.get("item_tier", "brief"),
            "summary_zh":   r.get("summary_zh", ""),
            "judgment_zh":  r.get("judgment_zh", ""),
            "headline":     r.get("headline", ""),
            "tags":         r.get("tags", []),
            "importance":   r.get("importance_score") or r.get("total_score") or 5,
        })
    return out


def generate_summary(client: OpenAI, items: list[dict], issue_date: str) -> dict:
    """Call the LLM once to produce theme + bullets."""
    prompt = (
        f"Issue date: {issue_date}\n\n"
        f"This week's {len(items)} curated items:\n\n"
        + json.dumps(items, ensure_ascii=False, indent=2)
    )
    resp = client.chat.completions.create(
        model=SUMMARY_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
    )
    raw = resp.choices[0].message.content or "{}"
    parsed = json.loads(raw)

    # Normalise — allow common synonyms
    theme = (parsed.get("theme") or parsed.get("title") or "").strip()
    bullets_raw = parsed.get("bullets") or parsed.get("items") or []

    bullets: list[dict] = []
    for b in bullets_raw:
        if isinstance(b, str):
            bullets.append({"text": b.strip(), "slugs": []})
        elif isinstance(b, dict):
            text = (b.get("text") or b.get("body") or "").strip()
            slugs = b.get("slugs") or b.get("slug") or []
            if isinstance(slugs, str):
                slugs = [slugs]
            slugs = [s for s in slugs if isinstance(s, str) and s.strip()]
            if text:
                bullets.append({"text": text, "slugs": slugs})

    return {"theme": theme, "bullets": bullets[:7]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir",    required=True,
                        help="Path to newsletter_runs/YYYY-MM-DD")
    parser.add_argument("--issue-date", default=str(date.today()),
                        help="Issue date YYYY-MM-DD")
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.exists():
        print(f"Error: run dir not found: {run_dir}", file=sys.stderr)
        return 1

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
        return 1

    client = OpenAI(api_key=api_key)

    # Load both record files (model + product)
    records: list[dict] = []
    for fname in ("raw_model_records.json", "raw_product_records.json"):
        p = run_dir / fname
        if p.exists():
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, list):
                records.extend(data)

    if not records:
        print(f"Warning: no records found in {run_dir}", file=sys.stderr)
        return 1

    # Sort: main > brief, then by importance.
    records.sort(
        key=lambda r: (
            0 if r.get("item_tier") == "main" else 1,
            -(r.get("importance_score") or r.get("total_score") or 0),
        )
    )

    # Round-robin by company so the LLM doesn't see 12 AWS items in a row
    # and write 6 AWS bullets. Per-company cap: at most 3 items contributed.
    PER_COMPANY_CAP = 3
    by_company: dict[str, list[dict]] = {}
    for r in records:
        company = (r.get("company") or "Unknown").strip().lower()
        by_company.setdefault(company, []).append(r)

    selected: list[dict] = []
    seen_count: dict[str, int] = {}
    # Repeatedly take one item from each company in score order until we
    # have ~16 candidates or every company is exhausted / capped.
    while len(selected) < 16:
        progressed = False
        for company, items in by_company.items():
            if seen_count.get(company, 0) >= PER_COMPANY_CAP:
                continue
            if items:
                selected.append(items.pop(0))
                seen_count[company] = seen_count.get(company, 0) + 1
                progressed = True
                if len(selected) >= 16:
                    break
        if not progressed:
            break
    records = selected

    items = build_input(records, args.issue_date)
    print(f"Generating weekly summary from {len(items)} items...", file=sys.stderr)

    summary = generate_summary(client, items, args.issue_date)
    print(f"  theme: {summary['theme']}", file=sys.stderr)
    print(f"  bullets: {len(summary['bullets'])}", file=sys.stderr)

    out_path = run_dir / "weekly_summary.json"
    out_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Written to {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
