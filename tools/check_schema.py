import psycopg2, sys, json
sys.stdout.reconfigure(encoding="utf-8")
DB = "postgresql://postgres:fTjaIachqVRFfVXIXbkoGtsyjtEVcfZY@shuttle.proxy.rlwy.net:35509/railway"
conn = psycopg2.connect(DB)
cur = conn.cursor()
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='issue_summaries' ORDER BY ordinal_position")
for row in cur.fetchall():
    print(row)
conn.close()
