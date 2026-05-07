"""
tools/run_fast_pipeline.py — Full fast pipeline orchestrator.

NEW architecture (replaces the slow AI-browsing collector):

  [scraper.py]      — RSS/API collection,  ~2 min,  0 AI calls
  [ai_filter.py]    — Filter + normalize,  ~3 min,  2 AI calls
  [sync_to_db.py]   — Push to Postgres,    ~2 min,  N embed calls

Total: ~7-10 min vs ~60-120 min with the old AI-browsing collector.

Usage:
    python tools/run_fast_pipeline.py --issue-date 2026-05-06

Or let it auto-detect today's date:
    python tools/run_fast_pipeline.py
"""

import argparse
import subprocess
import sys
import os
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent.parent


def run(cmd: list[str], cwd: Path = ROOT) -> int:
    print(f"\n$ {' '.join(str(c) for c in cmd)}", flush=True)
    result = subprocess.run(cmd, cwd=cwd)
    return result.returncode


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--issue-date", default=str(date.today()), help="YYYY-MM-DD")
    parser.add_argument("--days",       type=int, default=7,         help="Look-back window for scraper")
    parser.add_argument("--top",        type=int, default=30,        help="Max items to enrich with AI")
    parser.add_argument("--skip-db",    action="store_true",         help="Skip sync_to_db (dry run)")
    parser.add_argument("--no-embed",   action="store_true",         help="Pass --no-embed to sync_to_db")
    args = parser.parse_args()

    run_dir = ROOT / "newsletter_runs" / args.issue_date
    run_dir.mkdir(parents=True, exist_ok=True)

    scraped_path = run_dir / "raw_scraped.json"

    # ── Step 1: Scrape (no AI) ───────────────────────────────────────────
    print("\n" + "="*60)
    print("STEP 1 — RSS/API scrape (no AI)")
    print("="*60)
    rc = run([sys.executable, "tools/scraper.py",
              "--days", str(args.days),
              "--out",  str(scraped_path)])
    if rc != 0:
        print(f"Scraper failed (exit {rc}). Aborting.", file=sys.stderr)
        sys.exit(rc)

    # ── Step 2: AI filter + normalize ───────────────────────────────────
    print("\n" + "="*60)
    print("STEP 2 — AI filter + normalize (2 LLM calls)")
    print("="*60)
    rc = run([sys.executable, "tools/ai_filter.py",
              "--input",      str(scraped_path),
              "--issue-date", args.issue_date,
              "--top",        str(args.top),
              "--out-dir",    str(run_dir)])
    if rc != 0:
        print(f"AI filter failed (exit {rc}). Aborting.", file=sys.stderr)
        sys.exit(rc)

    # ── Step 3: Sync to DB ───────────────────────────────────────────────
    if not args.skip_db:
        print("\n" + "="*60)
        print("STEP 3 — Sync to Postgres")
        print("="*60)

        # Build a minimal verified_records.json from the AI filter output
        # by merging model + product records
        import json
        model_file   = run_dir / "raw_model_records.json"
        product_file = run_dir / "raw_product_records.json"
        models   = json.loads(model_file.read_text())   if model_file.exists()   else []
        products = json.loads(product_file.read_text()) if product_file.exists() else []

        # Fast-pipeline verified_records: mark everything as verified
        for r in models + products:
            r.setdefault("verification_status", "partially-verified")
            r.setdefault("confidence", "medium")
            r.setdefault("score_breakdown", {"total": r.get("importance", 5)})
            r.setdefault("total_score", r.get("importance", 5))

        verified_path = run_dir / "verified_records.json"
        verified_path.write_text(json.dumps({
            "meta": {"run_date": args.issue_date, "pipeline": "fast"},
            "models":   models,
            "products": products,
        }, ensure_ascii=False, indent=2))

        # Build minimal triage_decisions.json
        triage = {"decisions": []}
        for r in models + products:
            triage["decisions"].append({
                "name": r.get("name", ""),
                "company": r.get("company", ""),
                "module": r.get("module", ""),
                "final_tier": r.get("item_tier", "brief"),
                "final_rank": 0,
                "drop_reason": "",
            })
        (run_dir / "triage_decisions.json").write_text(
            json.dumps(triage, ensure_ascii=False, indent=2)
        )

        sync_cmd = [sys.executable, "tools/sync_to_db.py", str(run_dir)]
        if args.no_embed:
            sync_cmd.append("--no-embed")
        rc = run(sync_cmd)
        if rc != 0:
            print(f"DB sync failed (exit {rc}).", file=sys.stderr)
            sys.exit(rc)
    else:
        print("\nSkipping DB sync (--skip-db).")

    print("\n" + "="*60)
    print(f"✓ Fast pipeline complete! Run dir: {run_dir}")
    print("="*60)
    print("\nOptional next steps:")
    print("  • Run the full Claude agent pipeline for deeper editorial judgment:")
    print("    (orchestrator handles scorer → triage → writer → QA → publisher)")
    print("  • Or use the fast output directly — items are now in the DB.")


if __name__ == "__main__":
    main()
