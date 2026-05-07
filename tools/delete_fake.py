import psycopg2, os, sys
sys.stdout.reconfigure(encoding="utf-8")
DB = "postgresql://postgres:fTjaIachqVRFfVXIXbkoGtsyjtEVcfZY@shuttle.proxy.rlwy.net:35509/railway"
conn = psycopg2.connect(DB)
cur = conn.cursor()
cur.execute("DELETE FROM news_items WHERE issue_date = '2026-05-06'")
print("Deleted rows:", cur.rowcount)
conn.commit()
conn.close()
