"""
tools/fetch_unsplash_covers.py — Pick an Unsplash photo as the cover for each
newsletter item.

For every record in a run folder we run a short keyword query against Unsplash
Search Photos, pick a landscape result, and persist the photo's ix-cropped
URL plus attribution onto the record. `tools/sync_to_db.py` will then publish
that URL as `primary_image` exactly like any other cover.

Why a separate publish-time step instead of doing it from the web app:
  - Unsplash demo keys are 50 req/hour. Running it at publish (~once a week)
    keeps us comfortably under the limit AND removes Unsplash from the live
    request path — if their CDN blips, served pages don't care.
  - The chosen URL is stable (`images.unsplash.com/...`), so once written it
    behaves like any other hotlinked image we already serve.

Cache: queries are deduped via `tools/.unsplash_query_cache.json`. Identical
queries across items or re-runs cost zero API calls. Pass `--no-cache` to
ignore it.

Compliance: per Unsplash's API guidelines we hit the photo's
`links.download_location` once per pick (it's a tracking ping, not a download)
and store photographer attribution so the UI can credit them later.

Usage:
    python tools/fetch_unsplash_covers.py newsletter_runs/2026-05-07
    python tools/fetch_unsplash_covers.py newsletter_runs/2026-05-07 --limit 6
    python tools/fetch_unsplash_covers.py newsletter_runs/2026-05-07 --dry-run
    python tools/fetch_unsplash_covers.py newsletter_runs/2026-05-07 --overwrite

Env:
    UNSPLASH_ACCESS_KEY   Required unless --dry-run is passed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote

try:
    import requests
except ImportError as exc:  # pragma: no cover
    sys.stderr.write("requests is required. pip install requests\n")
    raise exc


REPO_ROOT = Path(__file__).resolve().parent.parent

# Same record files generate_cover_images.py walks, so the two tools see the
# same set of records and the same skip logic.
RECORD_FILES = (
    "verified_records.json",
    "normalized_records.json",
    "scored_records.json",
    "filtered_records.json",
    "raw_model_records.json",
    "raw_product_records.json",
)

UNSPLASH_API_BASE = "https://api.unsplash.com"
QUERY_CACHE_PATH = REPO_ROOT / "tools" / ".unsplash_query_cache.json"

# Photo URL parameters: Unsplash's `urls.raw` is an imgix endpoint, so we can
# request an exact 16:9 crop. That keeps `CardImage` from auto-flipping to
# letterbox and removes the colored frame around the image.
PHOTO_W = 1600
PHOTO_H = 900
PHOTO_PARAMS = (
    f"&w={PHOTO_W}&h={PHOTO_H}&fit=crop&crop=entropy"
    "&fm=jpg&q=80&auto=format"
)


# ---------------------------------------------------------------------------
# Record file walker (mirrors tools/generate_cover_images.py)
# ---------------------------------------------------------------------------

@dataclass
class RecordRef:
    path: Path
    record: dict[str, Any]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def slugify(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return re.sub(r"-+", "-", value).strip("-")[:80] or "item"


def record_slug(rec: dict[str, Any], issue_date: str) -> str:
    seed = f"{issue_date}-{rec.get('company', '')}-{rec.get('name', '')}"
    if rec.get("version"):
        seed += f"-{rec['version']}"
    return slugify(seed)


def load_record_refs(run_dir: Path) -> tuple[dict[Path, Any], list[RecordRef]]:
    documents: dict[Path, Any] = {}
    refs: list[RecordRef] = []

    def visit(path: Path, value: Any) -> None:
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict) and item.get("name"):
                    refs.append(RecordRef(path=path, record=item))
                elif isinstance(item, (dict, list)):
                    visit(path, item)
        elif isinstance(value, dict):
            for key, item in value.items():
                if key in {"dropped", "watchlist"}:
                    continue
                if isinstance(item, (dict, list)):
                    visit(path, item)

    for fname in RECORD_FILES:
        path = run_dir / fname
        if not path.exists():
            continue
        data = read_json(path)
        documents[path] = data
        visit(path, data)

    return documents, refs


# ---------------------------------------------------------------------------
# Query construction
# ---------------------------------------------------------------------------

# Tags that don't help Unsplash find a relevant photo (they describe meta
# attributes of the news item, not the visual subject).
_GENERIC_TAGS = {
    "model", "product", "operation", "release", "launch", "update", "news",
    "preview", "beta", "ga", "general-availability", "ai", "machine-learning",
    "ml", "research",
}

# PRIMARY subjects are tried before SECONDARY ones. They describe a
# concrete domain (payments, video, biology, etc.) and almost always
# yield a more relevant photo than the generic shape of the news
# (agent / infra / api). Putting "payment" in PRIMARY means a record
# tagged ["agent", "operation", "payment", "integration"] picks
# fintech imagery instead of a literal robot.
_PRIMARY_TAG_TO_SUBJECT = {
    "payment": "fintech digital payment",
    "fintech": "fintech digital payment",
    "finance": "financial district",
    "trading": "trading floor",
    "video": "cinema",
    "image": "studio lighting",
    "image-gen": "studio lighting",
    "creative": "creative studio",
    "media": "creative studio",
    "voice": "audio waveform",
    "audio": "audio waveform",
    "speech": "audio waveform",
    "asr": "audio waveform",
    "robotics": "humanoid robot",
    "biology": "microscope",
    "science": "microscope",
    "health": "medical lab",
    "medical": "medical lab",
    "security": "cybersecurity",
    "privacy": "cybersecurity",
    "compliance": "cybersecurity",
    "vision": "camera lens",
    "marketing": "marketing campaign",
    "ecommerce": "shopping",
    "shopping": "shopping",
    "education": "library books",
    "learning": "library books",
    "search": "discovery",
}

# SECONDARY subjects are abstract / shape-of-news tags. They're
# fallbacks — if no PRIMARY tag matched, pick the first SECONDARY
# tag from the record. Keeping "agent" non-literal here ("automation
# network" vs the previous "robotics") so we don't keep landing on
# toy-robot photos for every agent story.
_SECONDARY_TAG_TO_SUBJECT = {
    "agent": "automation network",
    "coding": "developer workspace",
    "ide": "developer workspace",
    "developer": "developer workspace",
    "data": "data center",
    "infra": "data center",
    "infrastructure": "data center",
    "cloud": "data center",
    "gpu": "computer chip",
    "chip": "computer chip",
    "hardware": "computer chip",
    "inference": "server room",
    "training": "server room",
    "benchmark": "abstract chart",
    "evaluation": "abstract chart",
    "eval": "abstract chart",
    "workflow": "office workflow",
    "productivity": "office workflow",
    "enterprise": "modern office",
    "multimodal": "abstract pattern",
    "rl": "abstract pattern",
    "api": "abstract grid",
    "webhook": "abstract grid",
    "notebook": "writing desk",
    "writing": "writing desk",
    "consumer": "smartphone",
    "mobile": "smartphone",
    "desktop": "minimal workspace",
    "browser": "minimal workspace",
}

# Combined view used for `extra`-tag deduping (a tag that already gave
# us a subject must not be re-emitted as a freeform extra).
_TAG_TO_SUBJECT = {**_PRIMARY_TAG_TO_SUBJECT, **_SECONDARY_TAG_TO_SUBJECT}


def _ascii_only(text: str) -> str:
    """Drop non-ASCII (Chinese / emoji) so Unsplash sees a clean English query."""
    return re.sub(r"[^\x00-\x7f]+", " ", text or "").strip()


def _clean_token(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    text = re.sub(r"[^a-zA-Z0-9\s-]+", " ", text or "")
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text


def build_query(rec: dict[str, Any]) -> str:
    """Return a short English query string suited for Unsplash search.

    We prefer (in order):
      1. the first concept-tag we recognise (mapped to a photo-friendly noun),
      2. one extra non-generic tag,
      3. the module ('agent', 'product', 'model'),
      4. an English token from `name` if the name is mostly ASCII.

    The whole thing is capped at ~5 tokens because Unsplash search ranks
    poorly on long sentences.
    """
    tags = [str(t).lower() for t in (rec.get("tags") or []) if isinstance(t, str)]

    subject: str | None = None
    # PRIMARY first — a record tagged ["agent", "payment"] should pick
    # fintech imagery, not robots.
    for t in tags:
        if t in _PRIMARY_TAG_TO_SUBJECT:
            subject = _PRIMARY_TAG_TO_SUBJECT[t]
            break
    if not subject:
        for t in tags:
            if t in _SECONDARY_TAG_TO_SUBJECT:
                subject = _SECONDARY_TAG_TO_SUBJECT[t]
                break

    extra: list[str] = []
    for t in tags:
        if t in _GENERIC_TAGS or t in _TAG_TO_SUBJECT:
            continue
        extra.append(t.replace("-", " "))
        if len(extra) >= 1:
            break

    name_ascii = _clean_token(_ascii_only(str(rec.get("name") or "")))
    name_token = ""
    if name_ascii and len(name_ascii.split()) <= 4:
        name_token = name_ascii

    parts: list[str] = []
    if subject:
        parts.append(subject)
    parts.extend(extra)
    if not subject and not extra:
        # No usable tags — fall back to module and (maybe) the product name.
        module = _clean_token(str(rec.get("module") or ""))
        if module and module not in _GENERIC_TAGS:
            parts.append(module)
        if name_token:
            parts.append(name_token)

    if not parts:
        # Absolute last resort: a generic technology query. Better to send a
        # bland but valid query than no query at all.
        parts = ["modern technology"]

    query = " ".join(parts).strip()
    # Hard cap: 6 tokens. Anything longer hurts Unsplash relevance.
    return " ".join(query.split()[:6])


def normalize_query(query: str) -> str:
    return _clean_token(query)


# ---------------------------------------------------------------------------
# Unsplash API
# ---------------------------------------------------------------------------

class UnsplashError(RuntimeError):
    pass


def unsplash_session(access_key: str) -> requests.Session:
    sess = requests.Session()
    sess.headers.update({
        "Authorization": f"Client-ID {access_key}",
        "Accept-Version": "v1",
    })
    return sess


def search_photo(
    sess: requests.Session,
    query: str,
    *,
    per_page: int = 5,
) -> dict[str, Any] | None:
    """Run a Search Photos request and return the best landscape result, or None."""
    url = (
        f"{UNSPLASH_API_BASE}/search/photos"
        f"?query={quote(query)}&per_page={per_page}&orientation=landscape"
        "&content_filter=high"
    )
    resp = sess.get(url, timeout=15)
    if resp.status_code == 403:
        # Most often: hourly rate limit hit.
        raise UnsplashError(f"Unsplash 403 (rate limit?): {resp.text[:200]}")
    if resp.status_code != 200:
        raise UnsplashError(f"Unsplash {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    results = data.get("results") or []
    if not results:
        return None
    # Prefer the widest landscape with reasonable resolution. The API already
    # filtered to landscape, so picking the first result is usually fine, but
    # we still skip anything tiny just in case.
    for r in results:
        width = r.get("width") or 0
        height = r.get("height") or 0
        if width >= 1200 and width >= height:
            return r
    return results[0]


def ping_download(sess: requests.Session, photo: dict[str, Any]) -> None:
    """Hit the photo's download_location once. Required by Unsplash API guidelines."""
    links = photo.get("links") or {}
    loc = links.get("download_location")
    if not loc:
        return
    try:
        sess.get(loc, timeout=10)
    except requests.RequestException:
        # Tracking ping is best-effort; never fail the run because of it.
        pass


def crop_url(photo: dict[str, Any]) -> str:
    """Return a 16:9 crop URL anchored on the photo's salient region."""
    urls = photo.get("urls") or {}
    raw = urls.get("raw") or urls.get("full") or urls.get("regular")
    if not raw:
        return ""
    # `urls.raw` already contains a `?ixid=...` query string, so additional
    # params are appended with `&`.
    return f"{raw}{PHOTO_PARAMS}"


def attribution_for(photo: dict[str, Any]) -> dict[str, str]:
    user = photo.get("user") or {}
    user_links = user.get("links") or {}
    photo_links = photo.get("links") or {}
    return {
        "photographer_name": user.get("name") or "",
        "photographer_username": user.get("username") or "",
        "photographer_url": user_links.get("html") or "",
        "photo_url": photo_links.get("html") or "",
    }


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

def load_query_cache() -> dict[str, Any]:
    if not QUERY_CACHE_PATH.exists():
        return {}
    try:
        return json.loads(QUERY_CACHE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_query_cache(cache: dict[str, Any]) -> None:
    QUERY_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    QUERY_CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Record updates
# ---------------------------------------------------------------------------

def should_skip(rec: dict[str, Any], *, overwrite: bool, respect_ai: bool) -> bool:
    if overwrite:
        return False
    kind = rec.get("cover_image_kind")
    if kind == "unsplash":
        return True
    if respect_ai and kind == "ai-generated":
        return True
    return False


def matches_filters(
    rec: dict[str, Any],
    *,
    name_contains: str | None,
    only_tier: str | None,
) -> bool:
    if name_contains:
        needle = name_contains.lower()
        haystack = " ".join(
            str(rec.get(key) or "")
            for key in ("name", "company", "headline")
        ).lower()
        if needle not in haystack:
            return False
    if only_tier:
        tier = str(rec.get("item_tier") or "").lower()
        if tier != only_tier.lower():
            return False
    return True


def apply_unsplash_cover(
    rec: dict[str, Any],
    *,
    image_url: str,
    photo: dict[str, Any],
    query: str,
) -> None:
    old_urls = rec.get("image_urls") or []
    if not isinstance(old_urls, list):
        old_urls = []
    source_urls = [
        u for u in old_urls
        if isinstance(u, str) and "images.unsplash.com" not in u
    ]
    if source_urls and "source_image_urls" not in rec:
        rec["source_image_urls"] = source_urls
    rec["image_urls"] = [image_url] + [u for u in old_urls if u != image_url]
    rec["primary_image"] = image_url
    rec["cover_image_kind"] = "unsplash"
    rec["unsplash_photo_id"] = photo.get("id") or ""
    rec["unsplash_query"] = query
    rec["unsplash_attribution"] = attribution_for(photo)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", help="Path to newsletter_runs/YYYY-MM-DD")
    parser.add_argument("--limit", type=int, default=None, help="Maximum records to update")
    parser.add_argument(
        "--name-contains",
        default=None,
        help="Only process records whose name/company/headline contains this text",
    )
    parser.add_argument(
        "--only-tier",
        default=None,
        choices=["main", "brief"],
        help="Restrict to records with this item_tier",
    )
    parser.add_argument("--overwrite", action="store_true",
                        help="Re-pick covers even when one is already set")
    parser.add_argument("--respect-ai-covers", action="store_true",
                        help="Skip records whose cover_image_kind is already 'ai-generated'")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print queries and chosen URLs but write nothing")
    parser.add_argument("--no-cache", action="store_true",
                        help="Ignore the local query cache for this run")
    parser.add_argument("--sleep", type=float, default=0.3,
                        help="Seconds to wait between *uncached* API calls")
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.exists():
        raise SystemExit(f"Run dir not found: {run_dir}")
    issue_date = run_dir.name
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", issue_date):
        raise SystemExit(f"Run folder must be named YYYY-MM-DD, got: {issue_date}")

    access_key = os.environ.get("UNSPLASH_ACCESS_KEY", "").strip()
    if not args.dry_run and not access_key:
        raise SystemExit("UNSPLASH_ACCESS_KEY is required unless --dry-run is passed")

    documents, refs = load_record_refs(run_dir)
    seen_ids: set[int] = set()
    candidates: list[RecordRef] = []
    for ref in refs:
        ident = id(ref.record)
        if ident in seen_ids:
            continue
        if should_skip(
            ref.record,
            overwrite=args.overwrite,
            respect_ai=args.respect_ai_covers,
        ):
            continue
        if not matches_filters(
            ref.record,
            name_contains=args.name_contains,
            only_tier=args.only_tier,
        ):
            continue
        seen_ids.add(ident)
        candidates.append(ref)

    if args.limit is not None:
        candidates = candidates[: args.limit]

    print(
        f"Loaded {len(refs)} record refs; {len(candidates)} eligible for Unsplash covers."
    )

    cache = {} if args.no_cache else load_query_cache()
    sess = unsplash_session(access_key) if access_key else None

    manifest: list[dict[str, Any]] = []
    touched_paths: set[Path] = set()
    api_calls = 0
    cache_hits = 0
    misses = 0
    failures = 0

    for idx, ref in enumerate(candidates, start=1):
        rec = ref.record
        slug = record_slug(rec, issue_date)
        query = build_query(rec)
        norm = normalize_query(query)
        print(
            f"[{idx}/{len(candidates)}] {rec.get('company', '')} — "
            f"{rec.get('name', '')[:50]}  q={query!r}"
        )

        cached = cache.get(norm) if norm else None
        photo: dict[str, Any] | None = None
        image_url = ""

        if cached:
            cache_hits += 1
            image_url = cached.get("url") or ""
            photo = {
                "id": cached.get("photo_id") or "",
                "links": {"html": cached.get("attribution", {}).get("photo_url", "")},
                "user": {
                    "name": cached.get("attribution", {}).get("photographer_name", ""),
                    "username": cached.get("attribution", {}).get("photographer_username", ""),
                    "links": {
                        "html": cached.get("attribution", {}).get("photographer_url", ""),
                    },
                },
                # No download_location in cache — that's fine; the ping is one-shot
                # at first selection.
            }
        elif args.dry_run:
            print("  [dry-run] would call Unsplash search")
            manifest.append({"slug": slug, "query": query, "dry_run": True, "url": ""})
            continue
        else:
            assert sess is not None
            try:
                photo = search_photo(sess, query)
                api_calls += 1
            except UnsplashError as exc:
                print(f"  [err] {exc}")
                failures += 1
                time.sleep(args.sleep)
                continue
            if not photo:
                print(f"  [--] no Unsplash results for {query!r}")
                misses += 1
                time.sleep(args.sleep)
                continue
            image_url = crop_url(photo)
            if not image_url:
                print(f"  [--] photo missing urls.raw")
                misses += 1
                time.sleep(args.sleep)
                continue
            ping_download(sess, photo)
            cache[norm] = {
                "photo_id": photo.get("id") or "",
                "url": image_url,
                "attribution": attribution_for(photo),
            }
            time.sleep(args.sleep)

        if not image_url or not photo:
            continue

        apply_unsplash_cover(rec, image_url=image_url, photo=photo, query=query)
        touched_paths.add(ref.path)
        manifest.append({
            "slug": slug,
            "query": query,
            "url": image_url,
            "photo_id": photo.get("id") or "",
            "from_cache": bool(cached),
        })
        print(f"  [OK] {image_url[:90]}")

    if not args.dry_run:
        for path, data in documents.items():
            if path not in touched_paths:
                continue
            write_json(path, data)
        if not args.no_cache:
            save_query_cache(cache)

    manifest_path = run_dir / "unsplash_covers_manifest.json"
    write_json(manifest_path, manifest)

    print()
    print(f"API calls: {api_calls}  cache hits: {cache_hits}  "
          f"empty results: {misses}  failures: {failures}")
    print(f"Wrote manifest: {manifest_path}")
    if args.dry_run:
        print("Dry run only; no records were modified.")
    else:
        print("Next step: run tools/sync_to_db.py for this run.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
