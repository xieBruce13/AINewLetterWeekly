"""
tools/run_fast_pipeline.py — Full fast pipeline orchestrator.

Architecture:

  Step 1 — scraper.py        RSS/API collection    ~2 min   0 AI calls
  Step 2 — rule_filter.py    Deterministic filter  ~5 sec   0 AI calls
  Step 3 — ai_filter.py      AI enrichment only    ~2 min   N calls (batched)
  Step 4 — weekly_summary.py Theme + bullets       ~30 sec  1 AI call
  Step 5 — image_resolver.py Override+og:image     ~1-2 min 0 AI calls
  Step 6 — sync_to_db.py     Push to Postgres      ~2 min   N embed calls

Total: ~7 min vs ~60-120 min with the old AI-browsing collector.

AI usage drops ~70% vs the old two-step (batch-filter + enrich) because
rule_filter.py pre-ranks and module-classifies items deterministically, so
ai_filter.py only enriches the top N rather than scanning 150+ items.

Sources are configured in tools/sources.yaml — no code changes needed to
add/remove/update feeds.

Usage:
    python tools/run_fast_pipeline.py --issue-date 2026-05-07

Or let it auto-detect today's date:
    python tools/run_fast_pipeline.py
"""

import argparse
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent.parent


def run(cmd: list[str], cwd: Path = ROOT) -> int:
    print(f"\n$ {' '.join(str(c) for c in cmd)}", flush=True)
    result = subprocess.run(cmd, cwd=cwd)
    return result.returncode


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--issue-date",  default=str(date.today()),
                        help="YYYY-MM-DD")
    parser.add_argument("--days",        type=int, default=7,
                        help="Look-back window for scraper (default: 7)")
    parser.add_argument("--filter-top",  type=int, default=80,
                        help="Max items rule_filter passes downstream (default: 80)")
    parser.add_argument("--enrich-top",  type=int, default=30,
                        help="Max items ai_filter enriches via LLM (default: 30)")
    parser.add_argument("--skip-db",     action="store_true",
                        help="Skip sync_to_db (dry run)")
    parser.add_argument("--no-embed",    action="store_true",
                        help="Pass --no-embed to sync_to_db")
    parser.add_argument("--sources",     type=str, default=None,
                        help="Custom sources.yaml path (default: tools/sources.yaml)")
    args = parser.parse_args()

    run_dir      = ROOT / "newsletter_runs" / args.issue_date
    run_dir.mkdir(parents=True, exist_ok=True)

    scraped_path  = run_dir / "raw_scraped.json"
    filtered_path = run_dir / "filtered_scraped.json"

    # ── Step 1: Scrape (no AI) ───────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 1 — RSS/API scrape (no AI)")
    print("=" * 60)
    scrape_cmd = [
        sys.executable, "tools/scraper.py",
        "--days", str(args.days),
        "--out",  str(scraped_path),
    ]
    if args.sources:
        scrape_cmd += ["--sources", args.sources]

    rc = run(scrape_cmd)
    if rc != 0:
        print(f"Scraper failed (exit {rc}). Aborting.", file=sys.stderr)
        sys.exit(rc)

    # ── Step 2: Deterministic rule filter (no AI) ─────────────────────
    print("\n" + "=" * 60)
    print("STEP 2 — Rule-based filter + classify (no AI)")
    print("=" * 60)
    rc = run([
        sys.executable, "tools/rule_filter.py",
        "--input",          str(scraped_path),
        "--output",         str(filtered_path),
        "--top",            str(args.filter_top),
        "--stats",
    ])
    if rc not in (0, 2):
        print(f"Rule filter failed (exit {rc}). Aborting.", file=sys.stderr)
        sys.exit(rc)
    if rc == 2:
        print("Warning: rule_filter returned 0 items — check sources/keywords.", file=sys.stderr)

    # ── Step 3: AI enrichment only ────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 3 — AI enrichment (schema normalization)")
    print("=" * 60)
    rc = run([
        sys.executable, "tools/ai_filter.py",
        "--input",      str(filtered_path),
        "--issue-date", args.issue_date,
        "--top",        str(args.enrich_top),
        "--out-dir",    str(run_dir),
    ])
    if rc != 0:
        print(f"AI filter failed (exit {rc}). Aborting.", file=sys.stderr)
        sys.exit(rc)

    # ── Step 4: Weekly summary (theme + bullets) ─────────────────────
    print("\n" + "=" * 60)
    print("STEP 4 — Weekly summary (theme + bullets, 1 AI call)")
    print("=" * 60)
    rc = run([
        sys.executable, "tools/weekly_summary.py",
        "--run-dir",    str(run_dir),
        "--issue-date", args.issue_date,
    ])
    if rc != 0:
        print(
            f"Weekly summary failed (exit {rc}). Continuing anyway — "
            "the home page will fall back to no top-strip.",
            file=sys.stderr,
        )

    # ── Step 5: Image resolver (overrides → RSS → og:image) ──────────
    print("\n" + "=" * 60)
    print("STEP 5 — Image resolver (no AI calls)")
    print("=" * 60)
    rc = run([
        sys.executable, "tools/image_resolver.py",
        "--run-dir",    str(run_dir),
        "--issue-date", args.issue_date,
    ])
    if rc != 0:
        print(
            f"Image resolver failed (exit {rc}). Continuing anyway — "
            "cards will render the no-image variant.",
            file=sys.stderr,
        )

    # ── Step 6: Sync to DB ───────────────────────────────────────────────
    if not args.skip_db:
        print("\n" + "=" * 60)
        print("STEP 6 — Sync to Postgres")
        print("=" * 60)

        # Build verified_records.json from AI filter output
        model_file   = run_dir / "raw_model_records.json"
        product_file = run_dir / "raw_product_records.json"
        models   = json.loads(model_file.read_text())   if model_file.exists()   else []
        products = json.loads(product_file.read_text()) if product_file.exists() else []

        for r in models + products:
            r.setdefault("verification_status", "partially-verified")
            r.setdefault("confidence", "medium")
            r.setdefault("score_breakdown", {"total": r.get("importance_score") or r.get("importance", 5)})
            r.setdefault("total_score",     r.get("importance_score") or r.get("importance", 5))

        verified_path = run_dir / "verified_records.json"
        verified_path.write_text(json.dumps({
            "meta":     {"run_date": args.issue_date, "pipeline": "fast"},
            "models":   models,
            "products": products,
        }, ensure_ascii=False, indent=2))

        triage = {"decisions": []}
        for r in models + products:
            triage["decisions"].append({
                "name":       r.get("name", ""),
                "company":    r.get("company", ""),
                "module":     r.get("module", ""),
                "final_tier": r.get("item_tier", "brief"),
                "final_rank": 0,
                "drop_reason": "",
            })
        (run_dir / "triage_decisions.json").write_text(
            json.dumps(triage, ensure_ascii=False, indent=2)
        )

        sync_cmd = [sys.executable, "tools/sync_to_db.py", str(run_dir), "--allow-stale"]
        if args.no_embed:
            sync_cmd.append("--no-embed")
        rc = run(sync_cmd)
        if rc != 0:
            print(f"DB sync failed (exit {rc}).", file=sys.stderr)
            sys.exit(rc)
    else:
        print("\nSkipping DB sync (--skip-db).")

    print("\n" + "=" * 60)
    print(f"[OK] Fast pipeline complete! Run dir: {run_dir}")
    print("=" * 60)
    print("\nOutput files:")
    print(f"  raw_scraped.json       — all scraped items")
    print(f"  filtered_scraped.json  — rule-filtered + classified subset")
    print(f"  raw_model_records.json — AI-enriched model records")
    print(f"  raw_product_records.json — AI-enriched product records")
    print(f"  verified_records.json  — merged, ready for DB")
    print("\nOptional next steps:")
    print("  • Run the full Claude agent pipeline for deeper editorial judgment")
    print("  • Edit tools/sources.yaml to add/remove news feeds")


if __name__ == "__main__":
    main()
