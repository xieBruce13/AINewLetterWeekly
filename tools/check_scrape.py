import json; from pathlib import Path
data = json.loads(Path('newsletter_runs/2026-05-06/raw_scraped.json').read_text('utf-8'))
items = data if isinstance(data, list) else data.get('items', [])
print(f"Total items: {len(items)}")
print("\nSample dates (published_at) from first 10:")
for it in items[:10]:
    print(f"  [{it.get('published_at','?')}] {it.get('title','')[:70]}")

# Check what dates exist
dates = [it.get('published_at','') for it in items if it.get('published_at')]
dates.sort(reverse=True)
print(f"\nMost recent published_at values:")
for d in dates[:10]:
    print(f"  {d}")
print(f"\nOldest: {dates[-1] if dates else 'none'}")
print(f"Total with published_at: {len(dates)}")
