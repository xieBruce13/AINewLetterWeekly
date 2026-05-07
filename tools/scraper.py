"""
tools/scraper.py — Fast RSS/API feed collector. Zero AI calls.

Collects raw AI news items from structured sources defined in tools/sources.yaml
(RSS/Atom feeds, Hacker News API, Reddit JSON) and writes a flat JSON list.

Usage:
    python tools/scraper.py --days 7 --out newsletter_runs/YYYY-MM-DD/raw_scraped.json

Then feed raw_scraped.json into rule_filter.py (deterministic) → ai_filter.py (AI
enrichment) instead of having an AI agent manually browse the web.

Source registry: tools/sources.yaml  ← edit that file to add/remove feeds.
"""

import argparse
import json
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

try:
    import yaml  # PyYAML
except ImportError:
    print(
        "PyYAML is required. Run: pip install pyyaml",
        file=sys.stderr,
    )
    sys.exit(1)

# ---------------------------------------------------------------------------
# Load source registry from YAML
# ---------------------------------------------------------------------------

SOURCES_YAML = Path(__file__).parent / "sources.yaml"


def _load_sources() -> dict:
    """Load and return the parsed sources.yaml dict."""
    if not SOURCES_YAML.exists():
        print(
            f"Warning: sources.yaml not found at {SOURCES_YAML}. "
            "Using empty source list.",
            file=sys.stderr,
        )
        return {}
    with SOURCES_YAML.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def _rss_sources(config: dict) -> list[dict]:
    """Return active RSS/Atom source dicts."""
    return [
        s for s in (config.get("rss_sources") or [])
        if s.get("active", True)
    ]


def _reddit_sources(config: dict) -> list[dict]:
    """Return active Reddit source dicts."""
    return [
        s for s in (config.get("reddit_sources") or [])
        if s.get("active", True)
    ]


def _hn_config(config: dict) -> dict:
    """Return the HackerNews config block (with defaults)."""
    hn = config.get("hacker_news") or {}
    return {
        "enabled": hn.get("enabled", True),
        "max_stories": hn.get("max_stories", 500),
        "min_score": hn.get("min_score", 50),
        "keywords": [str(k).lower() for k in (hn.get("keywords") or [])],
    }


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

HEADERS = {
    "User-Agent": "AI-Newsletter-Scraper/1.0 (newsletter aggregator; not for commercial use)",
    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
}


def fetch(url: str, timeout: int = 12) -> bytes | None:
    try:
        req = Request(url, headers=HEADERS)
        with urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except (URLError, HTTPError, TimeoutError, OSError) as e:
        print(f"  ⚠  {url}: {e}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

NS = {
    "atom":    "http://www.w3.org/2005/Atom",
    "dc":      "http://purl.org/dc/elements/1.1/",
    "media":   "http://search.yahoo.com/mrss/",
    "content": "http://purl.org/rss/1.0/modules/content/",
}


def _text(el, *tags):
    """Return stripped text from the first matching child tag, or ''."""
    for tag in tags:
        child = el.find(tag, NS) or el.find(tag)
        if child is not None and child.text:
            return child.text.strip()
    return ""


def _parse_date(s: str) -> datetime | None:
    if not s:
        return None
    formats = [
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S GMT",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            d = datetime.strptime(s.strip(), fmt)
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            return d
        except ValueError:
            continue
    return None


def _make_item(title: str, url: str, summary: str, pub_raw: str,
               source: dict) -> dict:
    """Build a normalised raw item dict from feed data + source metadata."""
    return {
        "title": title,
        "url": url,
        "summary": summary[:600],
        "published_raw": pub_raw,
        "source": source["name"],
        "tier": source["tier"],
        "module_hint": source.get("module") or source.get("module_hint"),
        "source_tags": source.get("tags") or [],
    }


def parse_rss_atom(raw: bytes, source: dict) -> list[dict]:
    items = []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []

    tag = root.tag.lower()

    # ── Atom feed ────────────────────────────────────────────────────────
    if ("atom" in tag
            or root.tag.endswith("}feed")
            or root.tag == "{http://www.w3.org/2005/Atom}feed"):
        for entry in root.findall("{http://www.w3.org/2005/Atom}entry"):
            link_el = entry.find("{http://www.w3.org/2005/Atom}link[@rel='alternate']")
            if link_el is None:
                link_el = entry.find("{http://www.w3.org/2005/Atom}link")
            url = link_el.attrib.get("href", "") if link_el is not None else ""
            title = _text(entry, "{http://www.w3.org/2005/Atom}title")
            summary = _text(
                entry,
                "{http://www.w3.org/2005/Atom}summary",
                "{http://www.w3.org/2005/Atom}content",
            )
            pub = _text(
                entry,
                "{http://www.w3.org/2005/Atom}published",
                "{http://www.w3.org/2005/Atom}updated",
            )
            items.append(_make_item(title, url, summary, pub, source))
    else:
        # ── RSS 2.0 / 1.0 ────────────────────────────────────────────────
        channel = root.find("channel") or root
        for item in channel.findall("item"):
            url     = _text(item, "link")
            title   = _text(item, "title")
            summary = _text(item, "description", "content:encoded", "dc:description")
            pub     = _text(item, "pubDate", "dc:date")
            items.append(_make_item(title, url, summary, pub, source))

    return items


def fetch_hacker_news(hn_cfg: dict, cutoff: datetime) -> list[dict]:
    """Pull top HN stories, keyword-filter for AI relevance, respect cutoff."""
    if not hn_cfg.get("enabled"):
        return []

    max_stories = hn_cfg["max_stories"]
    min_score   = hn_cfg["min_score"]
    keywords    = hn_cfg["keywords"]

    print(f"  ↳ Fetching Hacker News top stories (top {max_stories})...", file=sys.stderr)
    raw = fetch("https://hacker-news.firebaseio.com/v0/topstories.json")
    if not raw:
        return []
    ids = json.loads(raw)[:max_stories]

    results = []
    for story_id in ids:
        raw_item = fetch(f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json")
        if not raw_item:
            continue
        item = json.loads(raw_item)
        title = (item.get("title") or "").lower()
        score = item.get("score", 0) or 0
        if score < min_score:
            continue
        if not any(kw in title for kw in keywords):
            continue
        url = item.get("url") or f"https://news.ycombinator.com/item?id={story_id}"
        ts = item.get("time")
        pub_dt = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None
        if pub_dt and pub_dt < cutoff:
            continue
        results.append({
            "title":        item.get("title", ""),
            "url":          url,
            "summary":      f"HN score: {score} | comments: {item.get('descendants', 0)}",
            "published_raw": pub_dt.isoformat() if pub_dt else "",
            "source":       "Hacker News",
            "tier":         "community",
            "module_hint":  None,
            "source_tags":  ["hacker-news"],
            "hn_score":     score,
            "hn_comments":  item.get("descendants", 0),
        })
        time.sleep(0.05)  # polite per-item delay

    print(f"    → {len(results)} AI-relevant HN stories", file=sys.stderr)
    return results


def fetch_reddit(source: dict, cutoff: datetime, limit: int = 50) -> list[dict]:
    """Fetch new posts from a subreddit via the public JSON endpoint."""
    subreddit = source["subreddit"]
    url = f"https://www.reddit.com/r/{subreddit}/new.json?limit={limit}"
    raw = fetch(url)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    results = []
    for post in data.get("data", {}).get("children", []):
        p = post.get("data", {})
        ts = p.get("created_utc", 0)
        pub_dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        if pub_dt < cutoff:
            continue
        results.append({
            "title":         p.get("title", ""),
            "url":           p.get("url") or f"https://reddit.com{p.get('permalink', '')}",
            "summary":       (p.get("selftext") or "")[:400],
            "published_raw": pub_dt.isoformat(),
            "source":        f"r/{subreddit}",
            "tier":          "community",
            "module_hint":   source.get("module_hint"),
            "source_tags":   source.get("tags") or [],
            "reddit_score":  p.get("score", 0),
            "reddit_comments": p.get("num_comments", 0),
        })
    return results


# ---------------------------------------------------------------------------
# Main collector
# ---------------------------------------------------------------------------

def collect(days: int = 7, sources_config: dict | None = None) -> list[dict]:
    if sources_config is None:
        sources_config = _load_sources()

    rss_srcs    = _rss_sources(sources_config)
    reddit_srcs = _reddit_sources(sources_config)
    hn_cfg      = _hn_config(sources_config)

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    all_items: list[dict] = []
    seen_urls: set[str] = set()

    # ── RSS/Atom sources ─────────────────────────────────────────────────
    print(f"\nCollecting from {len(rss_srcs)} RSS/Atom sources...", file=sys.stderr)
    for source in rss_srcs:
        print(f"  ↳ {source['name']}...", file=sys.stderr)
        raw = fetch(source["url"])
        if not raw:
            continue
        items = parse_rss_atom(raw, source)
        fresh = 0
        for item in items:
            if not item["title"] or not item["url"]:
                continue
            if item["url"] in seen_urls:
                continue
            pub = _parse_date(item["published_raw"])
            if pub and pub < cutoff:
                continue
            item["published_at"] = pub.isoformat() if pub else None
            seen_urls.add(item["url"])
            all_items.append(item)
            fresh += 1
        print(f"    → {fresh} fresh items", file=sys.stderr)
        time.sleep(0.3)

    # ── Hacker News ──────────────────────────────────────────────────────
    print("\nCollecting from Hacker News...", file=sys.stderr)
    for item in fetch_hacker_news(hn_cfg, cutoff):
        if item["url"] not in seen_urls:
            pub = _parse_date(item["published_raw"])
            item["published_at"] = pub.isoformat() if pub else None
            seen_urls.add(item["url"])
            all_items.append(item)

    # ── Reddit ───────────────────────────────────────────────────────────
    print(f"\nCollecting from {len(reddit_srcs)} subreddits...", file=sys.stderr)
    for source in reddit_srcs:
        sub = source["subreddit"]
        print(f"  ↳ r/{sub}...", file=sys.stderr)
        items = fetch_reddit(source, cutoff)
        added = 0
        for item in items:
            if item["url"] not in seen_urls:
                seen_urls.add(item["url"])
                all_items.append(item)
                added += 1
        print(f"    → {added} items", file=sys.stderr)
        time.sleep(0.5)

    # Sort: tier priority first, then social signal strength
    tier_order = {"official": 0, "press": 1, "community": 2}
    all_items.sort(
        key=lambda x: (
            tier_order.get(x.get("tier"), 9),
            -(x.get("hn_score") or x.get("reddit_score") or 0),
        )
    )

    return all_items


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape AI news from RSS/API feeds.")
    parser.add_argument("--days", type=int, default=7,
                        help="Look-back window in days (default: 7)")
    parser.add_argument("--out",  type=str, default=None,
                        help="Output JSON file (default: stdout)")
    parser.add_argument("--sources", type=str, default=None,
                        help="Path to a custom sources.yaml (default: tools/sources.yaml)")
    args = parser.parse_args()

    if args.sources:
        import yaml as _yaml  # noqa
        with open(args.sources, encoding="utf-8") as fh:
            sources_config = _yaml.safe_load(fh)
    else:
        sources_config = _load_sources()

    rss_count    = len(_rss_sources(sources_config))
    reddit_count = len(_reddit_sources(sources_config))
    print(
        f"Collecting AI news from the last {args.days} days "
        f"({rss_count} RSS feeds, {reddit_count} subreddits, HN)...",
        file=sys.stderr,
    )

    items = collect(days=args.days, sources_config=sources_config)
    print(f"\nTotal: {len(items)} items collected", file=sys.stderr)

    output = {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "days": args.days,
        "total": len(items),
        "items": items,
    }
    payload = json.dumps(output, ensure_ascii=False, indent=2)

    if args.out:
        import os
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(payload, encoding="utf-8")
        print(f"Written to {args.out}", file=sys.stderr)
    else:
        print(payload)


if __name__ == "__main__":
    main()
