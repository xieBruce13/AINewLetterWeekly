import psycopg2, json, sys
sys.stdout.reconfigure(encoding="utf-8")
DB = "postgresql://postgres:fTjaIachqVRFfVXIXbkoGtsyjtEVcfZY@shuttle.proxy.rlwy.net:35509/railway"
conn = psycopg2.connect(DB)
cur = conn.cursor()

# News items in DB
cur.execute("SELECT id, slug, headline, module, tags FROM news_items WHERE issue_date='2026-05-06' ORDER BY id")
items = cur.fetchall()
print(f"=== news_items for 2026-05-06 ({len(items)} rows) ===")
for row in items:
    print(f"  [{row[3]}] slug={row[1]} | {row[2][:60]}")

# Issue summary bullets
cur.execute("SELECT theme, bullets FROM issue_summaries WHERE issue_date='2026-05-06'")
row = cur.fetchone()
if row:
    print(f"\n=== issue_summaries ===")
    print(f"theme: {row[0]}")
    bullets = row[1] if isinstance(row[1], list) else json.loads(row[1])
    item_slugs = {r[1] for r in items}
    for b in bullets:
        slugs = b.get('slugs', [])
        match = [s for s in slugs if s in item_slugs]
        print(f"  bullet: {b.get('text','')[:60]} | slugs={slugs} | match={match}")
else:
    print("No issue_summaries found for 2026-05-06")

# User profile
cur.execute("SELECT role, company, focus_topics, current_projects FROM user_profiles LIMIT 3")
rows = cur.fetchall()
print(f"\n=== user_profiles ===")
for r in rows:
    print(f"  role={r[0]}, company={r[1]}, focus={r[2]}, projects={str(r[3])[:80]}")
conn.close()
