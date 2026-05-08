"""
tools/backfill_images.py — Resolve a primary_image for every news_items row
that doesn't already have one.

Reuses tools/image_resolver.py logic (manual overrides → og:image fallback).
RSS candidates aren't available retroactively, so existing rows lean almost
entirely on overrides + og:image.

Usage:
    py tools/backfill_images.py                # all rows
    py tools/backfill_images.py --since 2026-04-01
    py tools/backfill_images.py --dry-run
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

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from tools.image_resolver import (  # noqa: E402
    _load_overrides,
    _slug_for,
    fetch_og_image,
    find_override,
    _head_image,
)


def get_db_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    return (
        "postgresql://postgres:fTjaIachqVRFfVXIXbkoGtsyjtEVcfZY"
        "@shuttle.proxy.rlwy.net:35509/railway"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since",   default=None, help="Only rows with issue_date >= YYYY-MM-DD")
    parser.add_argument("--limit",   type=int, default=None, help="Cap number of rows processed")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force",   action="store_true",
                        help="Re-resolve rows that already have a primary_image")
    args = parser.parse_args()

    overrides = _load_overrides()
    print(f"Loaded {len(overrides)} image overrides")

    conn = psycopg2.connect(get_db_url())
    cur  = conn.cursor()

    where = []
    params: list = []
    if not args.force:
        where.append("(primary_image IS NULL OR primary_image = '')")
    if args.since:
        where.append("issue_date >= %s")
        params.append(args.since)
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""
    limit_sql = f" LIMIT {int(args.limit)}" if args.limit else ""

    cur.execute(
        f"""
        SELECT id, slug, issue_date, name, company, version, tags, record
        FROM news_items
        {where_sql}
        ORDER BY issue_date DESC, id ASC
        {limit_sql}
        """,
        params,
    )
    rows = cur.fetchall()
    print(f"Found {len(rows)} rows needing images")
    if not rows:
        return 0

    updated = 0
    skipped = 0
    for (item_id, slug, issue_date, name, company, version, tags, record) in rows:
        rec_json = record or {}
        # raw_urls live inside the JSONB record blob.
        raw_urls = rec_json.get("raw_urls") or []
        if not isinstance(raw_urls, list):
            raw_urls = []
        rec = {
            "name":     name,
            "company":  company,
            "version":  version,
            "tags":     tags or [],
            "raw_urls": raw_urls,
        }
        # Use the DB slug if present; otherwise reconstruct.
        match_slug = slug or _slug_for({**rec, "issue_date": str(issue_date)},
                                       str(issue_date))

        # 1) Manual override
        url: str | None = None
        override = find_override(rec, match_slug, overrides)
        if override and override.get("image"):
            url = override["image"]

        # 2) Image candidates already stored on the record (newer rows only)
        if not url:
            cands = rec_json.get("image_candidates") or []
            for cand in cands:
                if _head_image(cand):
                    url = cand
                    break

        # 3) og:image scrape
        if not url:
            for source_url in raw_urls:
                og = fetch_og_image(source_url)
                if og and _head_image(og):
                    url = og
                    break

        if not url:
            print(f"  [--] {item_id} {name[:40]}: no image found")
            skipped += 1
            continue

        print(f"  [OK] {item_id} {name[:40]:<40}  {url[:70]}")
        if args.dry_run:
            continue

        cur.execute(
            """
            UPDATE news_items
            SET image_urls    = %s::text[],
                primary_image = %s,
                updated_at    = now()
            WHERE id = %s
            """,
            ([url], url, item_id),
        )
        updated += 1
        if updated % 5 == 0:
            conn.commit()
        # Be polite to OG endpoints.
        time.sleep(0.2)

    if not args.dry_run:
        conn.commit()
    cur.close()
    conn.close()

    print(f"\nUpdated {updated} rows. Skipped {skipped}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
