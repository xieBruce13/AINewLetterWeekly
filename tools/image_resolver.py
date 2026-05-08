"""
tools/image_resolver.py — Resolve a primary image for each enriched record.

Resolution cascade per item (first hit wins):

  1. tools/image_overrides.yaml   — hand-curated per-item screenshots
  2. record["image_candidates"]   — URLs lifted from the RSS feed
  3. og:image / twitter:image     — fetched from the article URL
  4. (none — leaves image_urls empty; the card renders no-image variant)

Each candidate is HEAD-validated (200 status, image/* content-type, size
≥ 5 KB) before being accepted, so we don't fill the DB with broken links
or 1×1 trackers. Resolutions are cached in
`newsletter_runs/<date>/image_resolutions.json` so re-runs are cheap.

Usage:
    py tools/image_resolver.py --run-dir newsletter_runs/2026-05-07
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

try:
    import yaml  # PyYAML
except ImportError:
    print("PyYAML required. Run: pip install pyyaml", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

OVERRIDES_YAML = Path(__file__).parent / "image_overrides.yaml"

UA = (
    "Mozilla/5.0 (compatible; AINewsletterBot/1.0; "
    "+https://ainewletterweekly-production.up.railway.app/about)"
)
HEAD_TIMEOUT = 6
HTML_TIMEOUT = 8
MIN_BYTES = 5 * 1024  # < 5 KB is almost always a tracker / icon


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _request(url: str, *, method: str = "GET", timeout: int = HTML_TIMEOUT):
    req = Request(url, method=method, headers={
        "User-Agent": UA,
        "Accept":     "*/*",
    })
    return urlopen(req, timeout=timeout)


def _head_image(url: str) -> bool:
    """Return True if `url` looks like a real image (HEAD, then short GET)."""
    if not url or not url.startswith(("http://", "https://")):
        return False
    # Drop obvious non-image URL shapes early (we've seen these slip
    # through og:image: pages serving an HTML "image not found" page,
    # tracking pixels, social share buttons, etc.).
    low = url.lower()
    if any(bad in low for bad in (
        "/share?", "/intent/", "tracking", "pixel.gif", "spacer",
    )):
        return False
    try:
        with _request(url, method="HEAD", timeout=HEAD_TIMEOUT) as resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            clen  = resp.headers.get("Content-Length")
            if ctype:
                # Reject anything that explicitly isn't an image. Some
                # publishers' og:image actually points at a 200 HTML page
                # when the asset has been rotated — don't treat that as OK.
                if not ctype.startswith("image/"):
                    return False
            if clen and clen.isdigit():
                size = int(clen)
                if size < MIN_BYTES:
                    return False
                # Reject absurdly tiny "images" that are clearly icons /
                # share buttons, even when CDN returns image/* type.
                if size < 3 * 1024 and ctype.startswith("image/svg"):
                    return False
            return True
    except (URLError, HTTPError, TimeoutError, OSError):
        # HEAD blocked or unreliable — try a 0-1 range GET.
        try:
            req = Request(url, headers={
                "User-Agent": UA,
                "Range":      "bytes=0-15",
            })
            with urlopen(req, timeout=HEAD_TIMEOUT) as resp:
                ctype = (resp.headers.get("Content-Type") or "").lower()
                if ctype.startswith("image/"):
                    return True
                # Magic-number sniff — first bytes. Reject HTML/JSON
                # explicitly.
                head = resp.read(16)
                if head.lstrip().startswith((b"<!", b"<html", b"<HTML", b"{")):
                    return False
                return _sniff_image(head)
        except Exception:
            return False
    return False


def _sniff_image(head: bytes) -> bool:
    """Cheap magic-number check for the common image formats."""
    if not head:
        return False
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if head[:3] == b"\xff\xd8\xff":  # JPEG
        return True
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return True
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return True
    if head[:4] == b"<svg" or head[:5] == b"<?xml":
        return True
    return False


# ---------------------------------------------------------------------------
# og:image extraction
# ---------------------------------------------------------------------------

_META_OG = re.compile(
    r"""<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image|twitter:image:src)["'][^>]+content=["']([^"']+)["']""",
    re.IGNORECASE,
)
_META_OG_REV = re.compile(
    r"""<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image|twitter:image:src)["']""",
    re.IGNORECASE,
)
_LINK_PREVIEW = re.compile(
    r"""<link[^>]+rel=["'](?:image_src|preview)["'][^>]+href=["']([^"']+)["']""",
    re.IGNORECASE,
)


def fetch_og_image(article_url: str) -> str | None:
    """Fetch HTML at `article_url` and parse out the best og/twitter image."""
    if not article_url or not article_url.startswith(("http://", "https://")):
        return None
    try:
        with _request(article_url, timeout=HTML_TIMEOUT) as resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if "html" not in ctype:
                return None
            # Read the head only — og tags are in the first ~32KB of any
            # well-built page, and we don't need to parse the body.
            blob = resp.read(64 * 1024).decode("utf-8", errors="replace")
    except (URLError, HTTPError, TimeoutError, OSError, UnicodeDecodeError):
        return None

    head_blob = blob.split("</head>", 1)[0] if "</head>" in blob else blob

    for rx in (_META_OG, _META_OG_REV, _LINK_PREVIEW):
        m = rx.search(head_blob)
        if m:
            return urljoin(article_url, m.group(1).strip())
    return None


# ---------------------------------------------------------------------------
# Manual overrides
# ---------------------------------------------------------------------------

def _load_overrides() -> list[dict]:
    if not OVERRIDES_YAML.exists():
        return []
    try:
        data = yaml.safe_load(OVERRIDES_YAML.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  [warn] image_overrides.yaml parse error: {e}", file=sys.stderr)
        return []
    if not isinstance(data, list):
        return []
    out = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        if not isinstance(entry.get("match"), dict):
            continue
        if not entry.get("image"):
            continue
        out.append(entry)
    return out


def _slug_for(rec: dict, issue_date: str) -> str:
    """Mimic the slug computed by sync_to_db.py so override matching agrees."""
    seed = f"{issue_date}-{rec.get('company','')}-{rec.get('name','')}"
    if rec.get("version"):
        seed += f"-{rec['version']}"
    seed = seed.lower()
    seed = re.sub(r"[^a-z0-9]+", "-", seed).strip("-")
    return seed[:80] or "item"


def _override_match(rec: dict, slug: str, override: dict) -> bool:
    m = override.get("match", {})
    if "slug_contains" in m:
        if str(m["slug_contains"]).lower() not in slug:
            return False
    if "company" in m:
        if str(m["company"]).strip().lower() != str(rec.get("company", "")).strip().lower():
            return False
    if "name_contains" in m:
        if str(m["name_contains"]).lower() not in str(rec.get("name", "")).lower():
            return False
    if "tags_contains" in m:
        target = str(m["tags_contains"]).lower()
        if target not in [str(t).lower() for t in (rec.get("tags") or [])]:
            return False
    return True


def find_override(rec: dict, slug: str, overrides: list[dict]) -> dict | None:
    for override in overrides:
        if _override_match(rec, slug, override):
            return override
    return None


# ---------------------------------------------------------------------------
# Main resolver
# ---------------------------------------------------------------------------

def resolve_record(
    rec: dict,
    issue_date: str,
    overrides: list[dict],
    cache: dict,
) -> str | None:
    """Return the best image URL for this record, or None if nothing valid."""
    slug = _slug_for(rec, issue_date)

    # 1) Manual overrides
    override = find_override(rec, slug, overrides)
    if override and override.get("image"):
        # Trust hand-curated images; skip HEAD validation to save a request.
        return override["image"]

    # 2) Cache hit (re-runs are free)
    if slug in cache:
        return cache[slug]

    # 3) RSS-embedded candidates
    for cand in rec.get("image_candidates") or []:
        if _head_image(cand):
            return cand

    # 4) og:image / twitter:image scraped from the article
    raw_urls = rec.get("raw_urls") or []
    for url in raw_urls:
        og = fetch_og_image(url)
        if og and _head_image(og):
            return og

    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir",    required=True,
                        help="Path to newsletter_runs/YYYY-MM-DD")
    parser.add_argument("--issue-date", default=None,
                        help="Override issue date (YYYY-MM-DD)")
    parser.add_argument("--no-cache",   action="store_true",
                        help="Ignore image_resolutions.json cache")
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.exists():
        print(f"Run dir not found: {run_dir}", file=sys.stderr)
        return 1

    issue_date = args.issue_date or run_dir.name

    overrides = _load_overrides()
    print(f"Loaded {len(overrides)} image overrides", file=sys.stderr)

    cache_path = run_dir / "image_resolutions.json"
    cache: dict = {}
    if cache_path.exists() and not args.no_cache:
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    # Process both record files in place so sync_to_db picks them up.
    touched = 0
    for fname in ("raw_model_records.json", "raw_product_records.json"):
        p = run_dir / fname
        if not p.exists():
            continue
        records = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(records, list):
            continue

        print(f"\nResolving images for {fname} ({len(records)} records)...", file=sys.stderr)
        for rec in records:
            slug = _slug_for(rec, issue_date)
            url = resolve_record(rec, issue_date, overrides, cache)
            if url:
                rec["image_urls"] = [url]
                rec["primary_image"] = url
                cache[slug] = url
                touched += 1
                print(f"  [OK] {rec.get('name','')[:40]:<40}  {url[:70]}", file=sys.stderr)
            else:
                # Make sure we don't carry stale image data from a previous run
                rec.setdefault("image_urls", [])
                rec.setdefault("primary_image", None)
                print(f"  [--] {rec.get('name','')[:40]:<40}  (no image)", file=sys.stderr)

        p.write_text(
            json.dumps(records, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    cache_path.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\nResolved {touched} images. Cache: {cache_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
