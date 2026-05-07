"""
direct_news_sync.py — Bypass the broken pipeline chain.
Reads raw_scraped.json → AI picks + translates → writes directly to news_items.

Usage:
    py tools/direct_news_sync.py --date 2026-05-06 --n 15
"""
import argparse, json, os, re, sys, textwrap, datetime as dt
from pathlib import Path
import psycopg2
from openai import OpenAI
sys.stdout.reconfigure(encoding="utf-8")

REPO = Path(__file__).parent.parent
DB_URL = os.environ.get("DATABASE_URL",
    "postgresql://postgres:fTjaIachqVRFfVXIXbkoGtsyjtEVcfZY@shuttle.proxy.rlwy.net:35509/railway")
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def call_llm(system: str, user: str) -> str:
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.3,
        max_completion_tokens=8192,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
    )
    return resp.choices[0].message.content or "{}"


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text[:80]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=dt.date.today().isoformat())
    ap.add_argument("--n", type=int, default=12, help="Max items to pick")
    ap.add_argument("--focus", default="")
    ap.add_argument("--exclude", default="biotech,healthcare,climate,defense,finance,enterprise-SaaS")
    ap.add_argument("--audience", default="")
    ap.add_argument("--use-profile", action="store_true",
                    help="Load focus/audience from the first user_profile in DB")
    ap.add_argument("--add-url", nargs="*", default=[],
                    help="Manually inject known article URLs (e.g. official blog posts without RSS)")
    args = ap.parse_args()

    # Optionally load profile from DB
    focus = args.focus or "creative-tool,design,multimodal,image-gen,video-gen,agent,workflow,coding,UX"
    exclude = args.exclude
    audience = args.audience or "product-manager-building-AI-creative-tools"
    if args.use_profile:
        try:
            conn0 = psycopg2.connect(DB_URL)
            cur0 = conn0.cursor()
            cur0.execute("SELECT role, company, focus_topics, current_projects FROM user_profiles LIMIT 1")
            row = cur0.fetchone()
            conn0.close()
            if row:
                role, company, focus_topics, projects = row
                if focus_topics:
                    focus = ",".join(focus_topics)
                audience = f"{role or 'product-manager'} working on {projects or 'AI tools'}"
                print(f"Profile loaded: role={role}, focus={focus}, audience={audience[:80]}", flush=True)
        except Exception as e:
            print(f"[WARN] Could not load profile: {e}", flush=True)

    run_dir = REPO / "newsletter_runs" / args.date
    scraped_path = run_dir / "raw_scraped.json"
    if not scraped_path.exists():
        print(f"Not found: {scraped_path}")
        sys.exit(1)

    raw = json.loads(scraped_path.read_text("utf-8"))
    items = raw if isinstance(raw, list) else raw.get("items", [])
    print(f"Loaded {len(items)} scraped items.", flush=True)

    # Filter to items with dates (ignore Reddit/HN spam without dates)
    dated = [i for i in items if i.get("published_at")]
    print(f"Items with published_at: {len(dated)}", flush=True)

    # Manually inject URLs the user knows about but aren't in RSS feeds
    if args.add_url:
        print(f"Manually injecting {len(args.add_url)} URL(s)...", flush=True)
        import urllib.request as _ur, html as _html
        for url in args.add_url:
            try:
                req = _ur.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with _ur.urlopen(req, timeout=10) as r:
                    body = r.read().decode("utf-8", errors="replace")[:8000]
                # Grab <title>
                import re as _re
                title_m = _re.search(r"<title[^>]*>([^<]+)</title>", body, _re.I)
                title = _html.unescape(title_m.group(1).strip()) if title_m else url
                dated.insert(0, {
                    "title": title, "url": url, "summary": body[:600],
                    "published_at": args.date + "T00:00:00+00:00",
                    "source": url.split("/")[2], "tier": "official",
                    "module_hint": "product",
                })
                print(f"  + {title[:80]}", flush=True)
            except Exception as e:
                print(f"  [WARN] Could not fetch {url}: {e}", flush=True)

    # Build compact list for LLM context
    compact = []
    for i, it in enumerate(dated[:200]):
        pub = (it.get("published_at") or "")[:10]
        compact.append({
            "idx": i,
            "title": it.get("title", "")[:120],
            "source": it.get("source", ""),
            "url": it.get("url", ""),
            "summary": (it.get("summary", "") or "")[:200],
            "date": pub,
        })
    compact_str = json.dumps(compact, ensure_ascii=False)

    SYSTEM = textwrap.dedent(f"""
    You are a senior AI newsletter editor writing for: {audience}.
    FOCUS on these topics: {focus}
    EXCLUDE these topics: {exclude}

    From a list of scraped AI news articles, select the {args.n} most relevant and
    newsworthy items. Strongly prefer items about:
    - AI creative tools (image gen, video gen, music gen, design tools)
    - AI product launches and UX improvements
    - Multimodal AI (vision, audio, video)
    - AI coding assistants and workflow tools
    - Agent frameworks and automation

    SKIP items about: {exclude}

    For EACH selected item, produce a COMPLETE, RICH article record with ALL fields below.
    Every field must be fully written in Chinese (except company/name/tags/module/source_name).
    Do NOT leave any field empty or null.

    Required fields per item:
    - idx: the original index from the articles list
    - name: product/feature name (English)
    - company: company name (English)
    - module: "model" or "product"
    - tags: array of 3-6 English slug tags
    - source_name: human-readable source name (e.g. "Cursor Changelog", "TechCrunch")

    ALL Chinese fields (must be fully written, no empty strings):
    - headline_zh: 25-40 chars. Specific: company + concrete change + key number if any.
      Example: "Cursor发布代理上下文分析，支持实时监控Token消耗"
    - what_it_is_zh: 2-3 sentences. What is this product/feature/model in plain language.
      Who makes it, what it does, what problem it solves.
    - summary_zh: 3-4 sentences. Full summary of what changed, what's new, key details.
      Include specific numbers, dates, pricing if available.
    - key_points_zh: JSON array of 5-7 Chinese bullet strings. Each bullet = 1 concrete fact.
      Include: capabilities, numbers, pricing, availability, technical details.
    - scenarios_zh: 2-3 sentences. How can {audience} use this in their daily work?
      Give concrete, actionable examples tied to AI product/creative tool workflows.
    - relevance_zh: 1-2 sentences. Why does THIS specific news matter to {audience}?
      Reference their role (产品经理) and context (AI创作者工具) directly.
    - judgment_zh: 1-2 sentences. Editorial opinion: is this a big deal? Why or why not?

    Return JSON: {{"items": [{{idx, name, company, module, tags, source_name,
      headline_zh, what_it_is_zh, summary_zh, key_points_zh,
      scenarios_zh, relevance_zh, judgment_zh}}]}}

    Quality bar: every field must be substantive. A reader should be able to fully
    understand the news and its implications from your output alone, without reading
    the original source.
    """).strip()

    USER = f"""Audience: {audience}
Select and fully write up the best {args.n} items. Date today: {args.date}.

ARTICLES:
{compact_str}

Return JSON with key "items". Every Chinese field must be complete and substantive — no empty strings."""

    print("Calling GPT-4o-mini to select and translate...", flush=True)
    result_text = call_llm(SYSTEM, USER)
    result = json.loads(result_text)
    selected = result.get("items", [])
    print(f"Selected {len(selected)} items.", flush=True)

    # Merge AI output with original scraped data
    records = []
    for sel in selected:
        idx = sel.get("idx")
        if idx is None or idx >= len(dated):
            continue
        orig = dated[idx]
        pub_date = (orig.get("published_at") or args.date)[:10]
        url = orig.get("url", "")
        company = sel.get("company") or orig.get("source", "Unknown")
        name = sel.get("name") or orig.get("title", "")[:60]
        headline_zh = sel.get("headline_zh") or orig.get("title", "")[:40]
        slug = slugify(f"{company}-{name}")

        records.append({
            "slug": slug,
            "name": name,
            "company": company,
            "module": sel.get("module", "product"),
            "tags": sel.get("tags", []),
            "headline": headline_zh,
            "issue_date": args.date,
            "published_at": pub_date + "T00:00:00+00:00",
            "item_tier": "main",
            "source_tier": orig.get("tier", "press"),
            "total_score": 50,
            "record": {
                "headline_zh": headline_zh,
                "summary_zh": sel.get("summary_zh", ""),
                "what_it_is_zh": sel.get("what_it_is_zh", ""),
                "key_points_zh": sel.get("key_points_zh", []),
                "scenarios_zh": sel.get("scenarios_zh", ""),
                "relevance_zh": sel.get("relevance_zh", ""),
                "judgment_zh": sel.get("judgment_zh", ""),
                "raw_urls": [url] if url else [],
                "source_url": url,
                "source_name": sel.get("source_name") or orig.get("source", ""),
                "original_title": orig.get("title", ""),
                "source_tier": orig.get("tier", "press"),
                "published_date": pub_date,
            },
        })

    if not records:
        print("No records to sync.")
        sys.exit(0)

    print(f"\nSyncing {len(records)} records to DB...", flush=True)
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    upserted = 0
    for r in records:
        cur.execute("""
            INSERT INTO news_items
              (slug, name, company, module, tags, headline, issue_date, published_at,
               item_tier, source_tier, total_score, record, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now(), now())
            ON CONFLICT (slug) DO UPDATE SET
              headline   = EXCLUDED.headline,
              record     = news_items.record || EXCLUDED.record,
              updated_at = now()
        """, (
            r["slug"], r["name"], r["company"], r["module"],
            r["tags"], r["headline"], r["issue_date"], r["published_at"],
            r["item_tier"], r["source_tier"],
            r["total_score"], json.dumps(r["record"], ensure_ascii=False),
        ))
        upserted += 1
        print(f"  ✓ [{r['module']}] {r['headline']}", flush=True)

    conn.commit()

    # Write a personalized weekly summary
    product_items = [r for r in records if r["module"] == "product"]
    model_items   = [r for r in records if r["module"] == "model"]
    theme = (f"本周 AI 创作者工具动态：{len(product_items)} 款产品更新、"
             f"{len(model_items)} 项模型进展，为 {audience.split(' ')[0]} 精选")
    bullets = []
    for r in (records[:6]):
        rel = r["record"].get("relevance_zh", "")
        text = f"**{r['company']}**: {r['headline']}"
        if rel:
            text += f"——{rel}"
        bullets.append({"text": text, "slugs": [r["slug"]]})

    cur.execute("""
        INSERT INTO issue_summaries (issue_date, theme, bullets, updated_at)
        VALUES (%s, %s, %s, now())
        ON CONFLICT (issue_date) DO UPDATE SET
          theme = EXCLUDED.theme,
          bullets = EXCLUDED.bullets,
          updated_at = now()
    """, (args.date, theme, json.dumps(bullets, ensure_ascii=False)))
    conn.commit()
    conn.close()

    print(f"\n✓ Synced {upserted} items to news_items for issue {args.date}.")


if __name__ == "__main__":
    main()
