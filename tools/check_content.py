import psycopg2, json, sys
sys.stdout.reconfigure(encoding="utf-8")
DB = "postgresql://postgres:fTjaIachqVRFfVXIXbkoGtsyjtEVcfZY@shuttle.proxy.rlwy.net:35509/railway"
conn = psycopg2.connect(DB)
cur = conn.cursor()
cur.execute("SELECT slug, headline, record FROM news_items WHERE issue_date='2026-05-06' ORDER BY id LIMIT 3")
for slug, headline, record in cur.fetchall():
    rec = record if isinstance(record, dict) else json.loads(record)
    print(f"\n=== {headline} ===")
    print(f"slug: {slug}")
    for field in ["what_it_is_zh","summary_zh","scenarios_zh","relevance_zh","judgment_zh","source_name","source_url"]:
        val = rec.get(field,"")
        if val:
            print(f"  [{field}]: {str(val)[:120]}")
    kp = rec.get("key_points_zh",[])
    if kp:
        print(f"  [key_points_zh]: {len(kp)} bullets")
        for b in kp[:2]: print(f"    - {b[:80]}")
conn.close()
