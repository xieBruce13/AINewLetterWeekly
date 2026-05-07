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
    ap.add_argument("--focus", default="agent,design,workflow,creative-tool,coding,UX,product,AI-tool")
    ap.add_argument("--audience", default="product-manager-building-AI-tools")
    args = ap.parse_args()

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
    You are an AI newsletter editor producing a weekly digest for: {args.audience}.
    Focus topics: {args.focus}

    From a list of scraped AI news articles, select the {args.n} most impactful,
    genuinely newsworthy items from this week. For each one produce:
    - headline_zh: Chinese headline (max 40 chars), specific: company + change + key number
    - summary_zh: 2-3 sentence Chinese summary of what changed and why it matters
    - key_points_zh: JSON array of 3-5 Chinese bullet strings (key facts)
    - tags: array of 3-6 English slug tags (e.g. agent, design, coding, workflow, UX)
    - module: "model" (new model / capability) or "product" (new tool / product launch)
    - company: company name in English
    - name: product/feature name in English

    Return JSON: {{"items": [{{idx, name, company, module, tags, headline_zh, summary_zh, key_points_zh}}]}}
    Pick diverse companies. Prefer official blog posts over Reddit/HN discussion links.
    """).strip()

    USER = f"""Pick the best {args.n} items. Date today: {args.date}.

ARTICLES:
{compact_str}

Return JSON with key "items". Each item must have: idx, name, company, module, tags, headline_zh, summary_zh, key_points_zh."""

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
                "summary_zh": sel.get("summary_zh", ""),
                "key_points_zh": sel.get("key_points_zh", []),
                "headline_zh": headline_zh,
                "raw_urls": [url] if url else [],
                "source_url": url,
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

    # Also write a simple weekly summary for the issue
    theme = f"本周 AI 动态：{len(records)} 条精选新闻，涵盖模型发布与产品更新"
    bullets = []
    for r in records[:5]:
        bullets.append({"text": f"**{r['company']}**: {r['headline']}", "slugs": [r["slug"]]})

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
