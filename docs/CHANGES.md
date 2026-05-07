# Change Log

## 2026-05-06 — Bug fixes + fast pipeline

### Website bug fixes

#### 1. React crash on item detail pages (`出错了`)
- **Root cause**: `score_breakdown.justifications` is stored as `{}` (empty object) in the DB and was rendered directly as a React child inside `ScoreBreakdown`, causing "Objects are not valid as a React child (found: object with keys {})".
- **Fix**: `web/app/items/[slug]/page.tsx` — `ScoreBreakdown` now filters entries to `typeof v === "number"` only. Added `str()` helper that safely coerces any JSON value (object/array/number) to a display string before rendering.

#### 2. 25-30s page load (personalized feed)
- **Root cause**: `getPersonalizedFeed()` in `web/lib/personalization/rerank.ts` had a broken cache check: `allCached` required **all 60 candidates** to have cached blurbs, but only the top 12 are ever written to cache. So the condition was **never true** — the LLM rerank ran on every single page load.
- **Fix**: Removed the `allCached` condition entirely. Cache now hits correctly when `cachedTopN.length >= Math.min(TOP_N, candidates.length)`.

#### 3. Dead bookmark/like/dislike buttons for anonymous users
- **Root cause**: `NewsCard` rendered `<ItemActions>` unconditionally. Anonymous users saw the buttons but clicks returned 401 and the error was silently swallowed.
- **Fix**: `web/components/news-card.tsx` — `ItemActions` is now only rendered when `state !== undefined` (i.e., the user is signed in and their state was fetched).

---

### New fast scrape pipeline

**Problem**: The old AI-browsing collector had an AI agent manually browse 10-20 web pages, taking 60-120 minutes per run.

**New architecture** (7-10 min total):

| Step | Script | What it does | AI calls |
|------|--------|--------------|----------|
| 1 | `tools/scraper.py` | Pull from 18 RSS feeds + HN API + 6 Reddit subs | 0 |
| 2 | `tools/ai_filter.py` | Batch filter 150 items → normalize top 30 | 2 |
| 3 | `tools/sync_to_db.py` | Embed + push to Postgres | N embeddings |

**Run it**:
```bash
python tools/run_fast_pipeline.py --issue-date 2026-05-13
```

**Sources scraped** (zero AI):
- Official: OpenAI, Anthropic, Google DeepMind, Meta AI, Mistral, HuggingFace, Cohere, xAI, Cursor, Vercel, LangChain, Midjourney
- Press: TechCrunch AI, VentureBeat AI, The Verge AI, Ars Technica, Wired, MIT Tech Review
- Community: HN (AI-keyword filtered), r/MachineLearning, r/LocalLLaMA, r/artificial, r/singularity, r/ChatGPT, r/ClaudeAI

**To adjust**:
- Add/remove RSS sources in `tools/scraper.py` → `RSS_SOURCES` list
- Change AI models: `FILTER_MODEL` / `ENRICH_MODEL` in `tools/ai_filter.py`
- Adjust scoring thresholds: `importance >= 5` gate in `ai_filter.py → enrich_items()`

---

## TODO / known issues to revisit

- [ ] `score_breakdown` fields are all `null` in current DB records (scorer agent wasn't run). Once the scorer runs properly, scores will appear on item detail pages.
- [ ] `operation` module items are not in the current DB — the "运营" nav tab shows empty. Need to add operation-module records to the next pipeline run.
- [ ] `OPENAI_API_KEY` is not set — personalization uses cheap rerank only (no LLM blurbs), chat API returns 503. Set the key in `web/.env.local` to enable full personalization + chat.
- [ ] Fast pipeline output skips the verifier + scorer + writer steps — items appear in the DB with minimal editorial enrichment. For high-quality editorial output, still run the full Claude agent pipeline (or use the fast pipeline as a first pass, then manually trigger scorer/writer).
