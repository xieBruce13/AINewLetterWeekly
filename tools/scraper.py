"""
tools/scraper.py — Fast RSS/API feed collector. Zero AI calls.

Collects raw AI news items from structured sources (RSS feeds, HN API,
Reddit JSON) and writes a flat JSON list to stdout or a file.

Usage:
    python tools/scraper.py --days 7 --out newsletter_runs/YYYY-MM-DD/raw_scraped.json

Then feed raw_scraped.json into the AI filter+rank step instead of
having an AI agent manually browse the web.
"""

import argparse
import json
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# ---------------------------------------------------------------------------
# Source registry
# ---------------------------------------------------------------------------

RSS_SOURCES = [
    # ── Official model labs ──────────────────────────────────────────────
    {"name": "OpenAI Blog",          "url": "https://openai.com/blog/rss/",                                   "tier": "official", "module_hint": "model"},
    {"name": "Anthropic News",       "url": "https://www.anthropic.com/news/rss.xml",                         "tier": "official", "module_hint": "model"},
    {"name": "Google DeepMind",      "url": "https://deepmind.google/blog/feed/basic/",                       "tier": "official", "module_hint": "model"},
    {"name": "Google AI Blog",       "url": "https://blog.google/technology/ai/rss/",                         "tier": "official", "module_hint": "model"},
    {"name": "Meta AI Blog",         "url": "https://ai.meta.com/blog/rss/",                                  "tier": "official", "module_hint": "model"},
    {"name": "Mistral AI News",      "url": "https://mistral.ai/news/rss.xml",                                "tier": "official", "module_hint": "model"},
    {"name": "HuggingFace Blog",     "url": "https://huggingface.co/blog/feed.xml",                           "tier": "official", "module_hint": "model"},
    {"name": "Cohere Blog",          "url": "https://cohere.com/blog/rss",                                    "tier": "official", "module_hint": "model"},
    {"name": "xAI News",             "url": "https://x.ai/news/rss",                                          "tier": "official", "module_hint": "model"},
    {"name": "Stability AI Blog",    "url": "https://stability.ai/news/rss.xml",                              "tier": "official", "module_hint": "model"},
    # ── AI Creative / Image / Video / Design tools ───────────────────────
    {"name": "Luma AI Blog",         "url": "https://lumalabs.ai/blog/rss.xml",                               "tier": "official", "module_hint": "product"},
    {"name": "Runway Blog",          "url": "https://runwayml.com/blog/rss.xml",                              "tier": "official", "module_hint": "product"},
    {"name": "Runway Research",      "url": "https://research.runwayml.com/feed.xml",                         "tier": "official", "module_hint": "product"},
    {"name": "Pika Blog",            "url": "https://pika.art/blog/rss.xml",                                  "tier": "official", "module_hint": "product"},
    {"name": "Midjourney Updates",   "url": "https://updates.midjourney.com/rss.xml",                         "tier": "official", "module_hint": "product"},
    {"name": "Adobe Blog AI",        "url": "https://blog.adobe.com/en/topics/ai-ml/feed",                    "tier": "official", "module_hint": "product"},
    {"name": "Figma Blog",           "url": "https://www.figma.com/blog/rss.xml",                             "tier": "official", "module_hint": "product"},
    {"name": "Canva Newsroom",       "url": "https://www.canva.com/newsroom/rss.xml",                         "tier": "official", "module_hint": "product"},
    {"name": "ElevenLabs Blog",      "url": "https://elevenlabs.io/blog/rss.xml",                             "tier": "official", "module_hint": "product"},
    {"name": "Suno Blog",            "url": "https://suno.com/blog/rss.xml",                                  "tier": "official", "module_hint": "product"},
    {"name": "Udio Blog",            "url": "https://www.udio.com/blog/rss.xml",                              "tier": "official", "module_hint": "product"},
    {"name": "Krea AI Blog",         "url": "https://www.krea.ai/blog/rss.xml",                               "tier": "official", "module_hint": "product"},
    # ── Coding / Agent tooling ───────────────────────────────────────────
    {"name": "Cursor Changelog",     "url": "https://cursor.com/changelog/rss.xml",                           "tier": "official", "module_hint": "product"},
    {"name": "Vercel Blog",          "url": "https://vercel.com/blog/rss.xml",                                "tier": "official", "module_hint": "product"},
    {"name": "LangChain Blog",       "url": "https://blog.langchain.dev/rss/",                                "tier": "official", "module_hint": "product"},
    {"name": "Linear Blog",          "url": "https://linear.app/blog/rss.xml",                                "tier": "official", "module_hint": "product"},
    # ── Tech press ───────────────────────────────────────────────────────
    {"name": "TechCrunch AI",        "url": "https://techcrunch.com/category/artificial-intelligence/feed/",  "tier": "press", "module_hint": None},
    {"name": "VentureBeat AI",       "url": "https://venturebeat.com/ai/feed/",                               "tier": "press", "module_hint": None},
    {"name": "The Verge AI",         "url": "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml", "tier": "press", "module_hint": None},
    {"name": "Ars Technica AI",      "url": "https://feeds.arstechnica.com/arstechnica/technology-lab",       "tier": "press", "module_hint": None},
    {"name": "Wired AI",             "url": "https://www.wired.com/feed/tag/ai/latest/rss",                   "tier": "press", "module_hint": None},
    {"name": "MIT Tech Review AI",   "url": "https://www.technologyreview.com/feed/",                         "tier": "press", "module_hint": None},
    {"name": "9to5Mac AI",           "url": "https://9to5mac.com/guides/artificial-intelligence/feed/",       "tier": "press", "module_hint": None},
    {"name": "The Information AI",   "url": "https://www.theinformation.com/feed",                            "tier": "press", "module_hint": None},
]

HN_AI_KEYWORDS = [
    "gpt", "claude", "llm", "openai", "anthropic", "gemini", "mistral",
    "deepseek", "llama", "ai ", " ai,", "artificial intelligence",
    "machine learning", "neural", "transformer", "diffusion", "midjourney",
    "stable diffusion", "cursor", "copilot", "agentic", "agent",
    "embedding", "rag", "vector", "hugging face", "huggingface",
    "inference", "fine-tun", "quantiz", "grok", "xai", "runway",
    "sora", "veo", "imagen", "firefly", "luma", "pika", "kling",
    "flux", "comfyui", "image gen", "video gen", "text-to-image",
    "text-to-video", "elevenlabs", "suno", "udio", "figma", "adobe",
    "canva", "creative", "design tool", "multimodal",
]

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

HEADERS = {
    "User-Agent": "AI-Newsletter-Scraper/1.0 (newsletter aggregator; not for commercial use)",
    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
}


def fetch(url: str, timeout: int = 10) -> bytes | None:
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
    "atom": "http://www.w3.org/2005/Atom",
    "dc":   "http://purl.org/dc/elements/1.1/",
    "media":"http://search.yahoo.com/mrss/",
    "content": "http://purl.org/rss/1.0/modules/content/",
}


def _text(el, *tags):
    """Return stripped text from the first matching tag, or ''."""
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
            dt = datetime.strptime(s.strip(), fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def parse_rss_atom(raw: bytes, source: dict) -> list[dict]:
    items = []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []

    tag = root.tag.lower()

    # ── Atom feed ────────────────────────────────────────────────────────
    if "atom" in tag or root.tag.endswith("}feed") or root.tag == "{http://www.w3.org/2005/Atom}feed":
        for entry in root.findall("{http://www.w3.org/2005/Atom}entry"):
            link_el = entry.find("{http://www.w3.org/2005/Atom}link[@rel='alternate']")
            if link_el is None:
                link_el = entry.find("{http://www.w3.org/2005/Atom}link")
            url = (link_el.attrib.get("href", "") if link_el is not None else "")
            title = _text(entry, "{http://www.w3.org/2005/Atom}title")
            summary = _text(entry, "{http://www.w3.org/2005/Atom}summary",
                            "{http://www.w3.org/2005/Atom}content")
            pub = _text(entry, "{http://www.w3.org/2005/Atom}published",
                        "{http://www.w3.org/2005/Atom}updated")
            items.append({
                "title": title, "url": url,
                "summary": summary[:600], "published_raw": pub,
                "source": source["name"], "tier": source["tier"],
                "module_hint": source["module_hint"],
            })
    else:
        # ── RSS 2.0 / 1.0 ────────────────────────────────────────────────
        channel = root.find("channel") or root
        for item in channel.findall("item"):
            url = _text(item, "link")
            title = _text(item, "title")
            summary = _text(item, "description", "content:encoded", "dc:description")
            pub = _text(item, "pubDate", "dc:date")
            items.append({
                "title": title, "url": url,
                "summary": summary[:600], "published_raw": pub,
                "source": source["name"], "tier": source["tier"],
                "module_hint": source["module_hint"],
            })

    return items


def fetch_hacker_news(cutoff: datetime, max_stories: int = 500) -> list[dict]:
    """Pull top HN stories, filter for AI keywords, keep those within cutoff."""
    print("  ↳ Fetching Hacker News top stories...", file=sys.stderr)
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
        url = item.get("url") or f"https://news.ycombinator.com/item?id={story_id}"
        # Filter for AI relevance
        if not any(kw in title for kw in HN_AI_KEYWORDS):
            continue
        ts = item.get("time")
        pub_dt = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None
        if pub_dt and pub_dt < cutoff:
            continue
        results.append({
            "title": item.get("title", ""),
            "url": url,
            "summary": f"HN score: {item.get('score',0)} | comments: {item.get('descendants',0)}",
            "published_raw": pub_dt.isoformat() if pub_dt else "",
            "source": "Hacker News",
            "tier": "community",
            "module_hint": None,
            "hn_score": item.get("score", 0),
            "hn_comments": item.get("descendants", 0),
        })
        # Be polite — small delay between item fetches
        time.sleep(0.05)

    print(f"    → {len(results)} AI-relevant HN stories", file=sys.stderr)
    return results


def fetch_reddit(subreddit: str, cutoff: datetime, limit: int = 50) -> list[dict]:
    """Fetch new posts from a subreddit via JSON endpoint."""
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
            "title": p.get("title", ""),
            "url": p.get("url") or f"https://reddit.com{p.get('permalink','')}",
            "summary": (p.get("selftext") or "")[:400],
            "published_raw": pub_dt.isoformat(),
            "source": f"r/{subreddit}",
            "tier": "community",
            "module_hint": None,
            "reddit_score": p.get("score", 0),
            "reddit_comments": p.get("num_comments", 0),
        })
    return results


# ---------------------------------------------------------------------------
# Main collector
# ---------------------------------------------------------------------------

def collect(days: int = 7) -> list[dict]:
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    all_items: list[dict] = []
    seen_urls: set[str] = set()

    # ── RSS/Atom sources ─────────────────────────────────────────────────
    for source in RSS_SOURCES:
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
    hn_items = fetch_hacker_news(cutoff)
    for item in hn_items:
        if item["url"] not in seen_urls:
            pub = _parse_date(item["published_raw"])
            item["published_at"] = pub.isoformat() if pub else None
            seen_urls.add(item["url"])
            all_items.append(item)

    # ── Reddit ───────────────────────────────────────────────────────────
    reddit_subs = [
        "MachineLearning", "LocalLLaMA", "artificial", "singularity",
        "ChatGPT", "ClaudeAI",
        # AI creative tool communities
        "StableDiffusion", "midjourney", "aivideo", "AIArt",
        "ChatGPTPromptEngineering", "artificial",
    ]
    for sub in reddit_subs:
        print(f"  ↳ r/{sub}...", file=sys.stderr)
        items = fetch_reddit(sub, cutoff)
        added = 0
        for item in items:
            if item["url"] not in seen_urls:
                seen_urls.add(item["url"])
                all_items.append(item)
                added += 1
        print(f"    → {added} items", file=sys.stderr)
        time.sleep(0.5)

    # Sort by source tier priority, then recency
    tier_order = {"official": 0, "press": 1, "community": 2}
    all_items.sort(
        key=lambda x: (tier_order.get(x["tier"], 9), -(x.get("hn_score") or x.get("reddit_score") or 0))
    )

    return all_items


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape AI news from RSS/API feeds.")
    parser.add_argument("--days", type=int, default=7, help="Look-back window in days (default: 7)")
    parser.add_argument("--out", type=str, default=None, help="Output JSON file (default: stdout)")
    args = parser.parse_args()

    print(f"Collecting AI news from the last {args.days} days...", file=sys.stderr)
    items = collect(days=args.days)
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
        os.makedirs(os.path.dirname(args.out), exist_ok=True) if os.path.dirname(args.out) else None
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload)
        print(f"Written to {args.out}", file=sys.stderr)
    else:
        print(payload)


if __name__ == "__main__":
    main()
