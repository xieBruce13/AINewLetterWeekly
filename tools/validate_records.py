"""validate_records.py — freshness + URL reachability checks.

Hard policy enforced by sync_to_db.py before any record reaches the
database. Two failure modes catch most "stale or fabricated content"
incidents:

  1. Freshness — every record must have `published_date` within the last
     `--max-age` days (default 14). Older items are rejected unless the
     editor passes `--allow-stale`.

  2. Source reachability — every URL in the record's `raw_urls` array
     must respond to a HEAD request without 4xx/5xx. We follow redirects
     (a published article often canonicalises). Items with NO URLs are
     also rejected — every claim has to be sourceable.

Usage as library:

    from tools.validate_records import validate_records, ValidationError
    issues = validate_records(records, today, max_age_days=14)
    if issues:
        ...

Usage from CLI (independent of sync):

    python tools/validate_records.py newsletter_runs/2026-05-02
    python tools/validate_records.py newsletter_runs/2026-05-02 --max-age 21
    python tools/validate_records.py newsletter_runs/2026-05-02 --no-url-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

try:
    import requests
except ImportError:  # pragma: no cover
    sys.stderr.write("requests is required. pip install requests\n")
    raise


# --------------------------------------------------------------------------
# Types
# --------------------------------------------------------------------------

@dataclass
class RecordIssue:
    """A single problem detected against one record."""

    name: str
    kind: str           # 'stale' | 'no-url' | 'url-broken' | 'bad-date'
    message: str
    url: str | None = None


@dataclass
class ValidationResult:
    issues: list[RecordIssue] = field(default_factory=list)
    ok_records: list[dict[str, Any]] = field(default_factory=list)
    failed_records: list[dict[str, Any]] = field(default_factory=list)

    def has_failures(self) -> bool:
        return bool(self.failed_records)


class ValidationError(Exception):
    pass


# --------------------------------------------------------------------------
# Per-record checks
# --------------------------------------------------------------------------

def _parse_date(value: str | None) -> dt.date | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return dt.date.fromisoformat(value[:10])
    except ValueError:
        return None


def check_freshness(
    rec: dict[str, Any],
    today: dt.date,
    max_age_days: int,
) -> RecordIssue | None:
    name = rec.get("name") or "(unnamed)"
    pub = _parse_date(rec.get("published_date") or rec.get("story_date"))
    if not pub:
        return RecordIssue(name, "bad-date", "missing or unparseable published_date")
    age = (today - pub).days
    if age < 0:
        # Future-dated: warn but don't reject (could be a planned launch).
        return None
    if age > max_age_days:
        return RecordIssue(
            name,
            "stale",
            f"published {age}d ago (cutoff = {max_age_days}d)",
        )
    return None


# Browsers that don't 4xx random crawlers. Some sites block default
# python-requests UA — pretend to be a real browser.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 NewsletterBot/1.0"
)


def _head_url(url: str, timeout: float = 8.0) -> tuple[bool, int | None, str]:
    """Return (ok, status_code, message). Try HEAD then fall back to GET."""
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    try:
        # HEAD first (cheap). Some sites return 405 to HEAD — fall back to GET.
        r = requests.head(url, allow_redirects=True, timeout=timeout, headers=headers)
        if r.status_code in (405, 403, 501):
            r = requests.get(
                url,
                allow_redirects=True,
                timeout=timeout,
                headers=headers,
                stream=True,
            )
            r.close()
        ok = r.status_code < 400
        msg = "ok" if ok else f"HTTP {r.status_code}"
        return ok, r.status_code, msg
    except requests.exceptions.Timeout:
        return False, None, "timeout"
    except requests.exceptions.RequestException as e:
        return False, None, f"{type(e).__name__}: {e}"


def check_urls(
    rec: dict[str, Any],
    require_url: bool = True,
) -> list[RecordIssue]:
    name = rec.get("name") or "(unnamed)"
    urls = rec.get("raw_urls") or []
    if not isinstance(urls, list):
        urls = []
    urls = [u for u in urls if isinstance(u, str) and u.startswith(("http://", "https://"))]
    if not urls:
        if require_url:
            return [
                RecordIssue(name, "no-url", "no raw_urls — every claim must be sourceable")
            ]
        return []

    issues: list[RecordIssue] = []
    for url in urls:
        ok, status, msg = _head_url(url)
        if not ok:
            issues.append(RecordIssue(name, "url-broken", msg, url=url))
    return issues


# --------------------------------------------------------------------------
# Top-level
# --------------------------------------------------------------------------

def validate_records(
    records: Iterable[dict[str, Any]],
    today: dt.date | None = None,
    max_age_days: int = 14,
    check_urls_flag: bool = True,
    parallel: int = 8,
) -> ValidationResult:
    today = today or dt.date.today()
    records = list(records)
    result = ValidationResult()

    # Freshness is fast — do it serially.
    fresh_failed: set[int] = set()
    for idx, rec in enumerate(records):
        if not isinstance(rec, dict):
            continue
        issue = check_freshness(rec, today, max_age_days)
        if issue:
            result.issues.append(issue)
            fresh_failed.add(idx)

    # URL check is slow — do it in parallel. Skip records that already
    # failed freshness so we don't pound dead URLs.
    if check_urls_flag:
        with ThreadPoolExecutor(max_workers=parallel) as ex:
            futures = {
                ex.submit(check_urls, rec): idx
                for idx, rec in enumerate(records)
                if isinstance(rec, dict) and idx not in fresh_failed
            }
            for fut in as_completed(futures):
                idx = futures[fut]
                for issue in fut.result():
                    result.issues.append(issue)

    # Bucket records.
    failed_names = {i.name for i in result.issues}
    for rec in records:
        if not isinstance(rec, dict):
            continue
        if rec.get("name") in failed_names:
            result.failed_records.append(rec)
        else:
            result.ok_records.append(rec)

    return result


def format_report(result: ValidationResult) -> str:
    if not result.issues:
        return "[OK] All records passed freshness + URL checks."
    lines = [
        f"[!] {len(result.issues)} validation issues across "
        f"{len(result.failed_records)} records:"
    ]
    by_record: dict[str, list[RecordIssue]] = {}
    for i in result.issues:
        by_record.setdefault(i.name, []).append(i)
    for name, issues in by_record.items():
        lines.append(f"  - {name}")
        for i in issues:
            tail = f" ({i.url})" if i.url else ""
            lines.append(f"      [{i.kind}] {i.message}{tail}")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def _read_records(run_dir: Path) -> list[dict[str, Any]]:
    for fname in (
        "verified_records.json",
        "normalized_records.json",
        "filtered_records.json",
    ):
        p = run_dir / fname
        if p.exists():
            with p.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                out = []
                for k in ("model_records", "product_records", "records"):
                    v = data.get(k)
                    if isinstance(v, list):
                        out.extend(v)
                if out:
                    return out
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", help="Run folder (YYYY-MM-DD)")
    parser.add_argument(
        "--max-age",
        type=int,
        default=14,
        help="Max age in days for published_date. Default 14.",
    )
    parser.add_argument(
        "--no-url-check",
        action="store_true",
        help="Skip the URL reachability check (offline / fast).",
    )
    parser.add_argument(
        "--allow-stale",
        action="store_true",
        help="Treat stale-date issues as warnings instead of failures.",
    )
    args = parser.parse_args()

    run_dir = Path(args.path).resolve()
    if not run_dir.exists():
        print(f"Path not found: {run_dir}", file=sys.stderr)
        return 2

    records = _read_records(run_dir)
    if not records:
        print(f"No records found under {run_dir}.", file=sys.stderr)
        return 2

    result = validate_records(
        records,
        max_age_days=args.max_age,
        check_urls_flag=not args.no_url_check,
    )
    print(format_report(result))
    if not args.allow_stale and result.has_failures():
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
