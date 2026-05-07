"""
improve_headlines.py — Use GPT-4o-mini to rewrite news_items.headline to be
more informative (company + concrete change + key number if available).

Only updates headlines where summary_zh is available (our richest items).
"""
import json, os, sys, psycopg2
sys.stdout.reconfigure(encoding="utf-8")

from openai import OpenAI

DB = "postgresql://postgres:fTjaIachqVRFfVXIXbkoGtsyjtEVcfZY@shuttle.proxy.rlwy.net:35509/railway"
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

conn = psycopg2.connect(DB)
conn.autocommit = False
cur = conn.cursor()

# Fetch items with Chinese summary available
cur.execute("""
    SELECT id, name, company, module, headline,
           record->>'summary_zh' as summary_zh,
           record->>'key_points_zh' as kp_zh
    FROM news_items
    WHERE issue_date = '2026-05-06'
      AND record->>'summary_zh' IS NOT NULL
    ORDER BY total_score DESC
""")
rows = cur.fetchall()
print(f"Found {len(rows)} items to improve.")

batch = []
for row in rows:
    iid, name, company, module, headline, summary_zh, kp_zh = row
    batch.append({
        "id": iid,
        "name": name,
        "company": company,
        "module": module,
        "current_headline": headline,
        "summary_zh": summary_zh or "",
        "key_points_zh": (kp_zh or "")[:300],
    })

if not batch:
    print("Nothing to update.")
    sys.exit(0)

SYSTEM = """You are a Chinese AI newsletter headline writer.
Rewrite each headline to be more informative and specific.
A good headline includes: company name + concrete change + key metric/number if available.
Keep it under 40 Chinese characters. Do not add quotes or punctuation at start/end.
Return a JSON array of objects: [{id, headline}]"""

USER = f"""Rewrite these headlines. Use the summary_zh for context.
Return ONLY a JSON array [{{"id": ..., "headline": "..."}}].

{json.dumps(batch, ensure_ascii=False)}"""

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    temperature=0.3,
    max_completion_tokens=4096,
    messages=[{"role": "system", "content": SYSTEM},
              {"role": "user",   "content": USER}],
)
txt = resp.choices[0].message.content or ""

import re
m = re.search(r'\[[\s\S]+\]', txt)
if not m:
    print("Could not parse response:", txt[:300])
    sys.exit(1)

results = json.loads(m.group(0))
updated = 0
for r in results:
    new_headline = r.get("headline","").strip()
    iid = r.get("id")
    if not new_headline or not iid:
        continue
    cur.execute("UPDATE news_items SET headline=%s, updated_at=now() WHERE id=%s",
                (new_headline, iid))
    updated += 1
    print(f"  [{iid}] {new_headline}")

conn.commit()
conn.close()
print(f"\n✓ Updated {updated} headlines.")
