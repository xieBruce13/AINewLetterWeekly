import json, sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
data = json.loads(Path('newsletter_runs/2026-05-06/raw_scraped.json').read_text('utf-8'))
items = data if isinstance(data, list) else data.get('items', [])
hits = [i for i in items if 'luma' in (i.get('title','') or '').lower() or 'luma' in (i.get('summary','') or '').lower()]
print(f"Luma items: {len(hits)}")
for h in hits:
    print(f"  {h.get('title','')[:100]}")

# Also show all creative tool companies missing
missing = ['luma','runway','pika','kling','sora','midjourney','stable diff','flux','comfy','firefly','canva','figma']
print("\nMissing creative tool coverage:")
for kw in missing:
    count = sum(1 for i in items if kw in (i.get('title','') or '').lower() or kw in (i.get('source','') or '').lower())
    print(f"  {kw}: {count} items")
