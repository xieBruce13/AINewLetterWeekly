# The Brief — personalized AI newsletter web app

Next.js 15 app that turns the upstream multi-agent newsletter pipeline into a personalized, interactive surface: every reader sees the same week's news, but reranked, rewritten, and chat-able in their own context.

## Architecture summary

```
┌────────────────────────────┐         ┌──────────────────────────────┐
│ Multi-agent pipeline       │  JSON   │ tools/sync_to_db.py          │
│ (.claude/agents/*)         │ ──────► │ embeds + upserts             │
│ produces verified_records  │         │                              │
└────────────────────────────┘         └─────────────┬────────────────┘
                                                     │
                                              ┌──────▼──────┐
                                              │ Postgres    │
                                              │ + pgvector  │
                                              └──────┬──────┘
                                                     │
       ┌─────────────────────────────────────────────┼─────────────────────────────────┐
       │                                             │                                 │
┌──────▼──────┐                            ┌─────────▼─────────┐                ┌──────▼──────┐
│ Personalized│                            │ Card detail view  │                │ Chat agent  │
│ feed (SSR)  │                            │ (full record)     │                │ (streaming) │
│ rerank.ts   │                            │                   │                │ + memory    │
└─────────────┘                            └───────────────────┘                └─────────────┘
```

## Quick start

```bash
# 1. Spin up Postgres with pgvector. Easiest: Supabase or Neon (free tier).
#    Locally: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres ankane/pgvector`

# 2. Bootstrap the schema (creates extensions + tables).
psql "$DATABASE_URL" -f ../db/migrations/0000_initial.sql

# 3. Install web deps.
cd web && npm install

# 4. Copy env template and fill in DATABASE_URL, AUTH_SECRET, OPENAI_API_KEY,
#    and (optional) AUTH_RESEND_KEY. As of 2026-05-05 OpenAI is the single
#    LLM provider — no Anthropic key required.
cp .env.example .env.local
$EDITOR .env.local

# 5. Push some demo content into the DB so the app has something to render.
cd .. && python tools/seed_demo_data.py

# 6. Run.
cd web && npm run dev
```

Visit `http://localhost:3000`, sign in (magic link or Google), complete onboarding, and you'll see the personalized feed.

## Pages

- `/` — personalized card feed (Server Component, runs the rerank).
- `/items/[slug]` — full editorial detail of one story.
- `/chat` — chat agent. `/chat?item=<id>` pins a specific story.
- `/onboarding` — capture role / company / projects / focus topics.
- `/profile` — view + edit profile, see what the agent remembers.
- `/saved` — bookmarked items.
- `/signin` — magic-link or Google sign-in.

## Personalization model

Two-layer rerank in `lib/personalization/rerank.ts`:

1. **Cheap** — pure SQL, scored as
   `total_score + 5·cosine(profile_emb, item_emb) + 3·tag_overlap(focus, item_tags) − 5·tag_overlap(dislikes, item_tags) − 2·(company in dismissed_companies)`. Pulls the top 30.
2. **Smart** — OpenAI `gpt-5-mini` reranks those 30 down to ~12 and writes the personalized headline + 2-3-sentence "why this for you" reason. Cached in `user_item_state` per `(user_id, issue_date)`.

The cache invalidates whenever the user updates their profile or dislikes a story.

## Chat agent

In `lib/agent/`:

- `system-prompt.ts` composes per-turn context: profile + top-K retrieved memories (pgvector cosine vs. the user's last message) + any pinned story.
- `tools.ts` exposes `search_news`, `get_item`, `save_item`, `dismiss_item`, `remember`. The `remember` tool is what makes the agent get smarter across sessions.
- `memory.ts` writes to `memory_facts` (deduped via unique index on `(user_id, fact)`). After every turn we also kick off a small fact-extraction pass to mine new durable preferences from the conversation.

## Weekly email digest

`/api/cron/digest` is a cron-friendly endpoint (registered in `vercel.json` for Mondays 14:00 UTC). It runs the personalized rerank for every onboarded user and emails the top 5 via Resend. Protect it with `CRON_SECRET`.
