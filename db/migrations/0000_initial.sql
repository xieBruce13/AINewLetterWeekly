-- Personalized AI Newsletter — initial schema
-- Run this against a fresh Postgres database (Supabase / Neon / local) BEFORE
-- starting the Next.js app. Everything else (Drizzle migrations) layers on top.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- News content
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_items (
  id                  serial PRIMARY KEY,
  slug                varchar(255) NOT NULL UNIQUE,
  module              varchar(32)  NOT NULL,
  name                text         NOT NULL,
  company             text         NOT NULL,
  version             text,
  issue_date          varchar(16)  NOT NULL,
  published_at        timestamptz  NOT NULL DEFAULT now(),

  item_tier           varchar(16)  NOT NULL,
  total_score         integer      NOT NULL DEFAULT 0,
  source_tier         varchar(64),
  verification_status varchar(32),
  confidence          varchar(16),

  headline            text         NOT NULL,
  one_line_judgment   text,
  relevance_to_us     text,

  tags                text[]       NOT NULL DEFAULT '{}'::text[],
  image_urls          text[]       NOT NULL DEFAULT '{}'::text[],
  primary_image       text,

  record              jsonb        NOT NULL,
  embedding           vector(1536),

  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_items_issue_idx
  ON news_items (issue_date);
CREATE INDEX IF NOT EXISTS news_items_module_tier_idx
  ON news_items (module, item_tier);
CREATE INDEX IF NOT EXISTS news_items_company_idx
  ON news_items (company);
-- IVFFlat for similarity search on news embeddings.
-- Build the index once you have ~1000 rows; lists ≈ sqrt(rowcount).
CREATE INDEX IF NOT EXISTS news_items_embedding_ivfflat
  ON news_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- Auth.js standard tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              text PRIMARY KEY,
  name            text,
  email           text NOT NULL UNIQUE,
  "emailVerified" timestamptz,
  image           text,
  display_name    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  "userId"            text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                text NOT NULL,
  provider            text NOT NULL,
  "providerAccountId" text NOT NULL,
  refresh_token       text,
  access_token        text,
  expires_at          integer,
  token_type          text,
  scope               text,
  id_token            text,
  session_state       text,
  PRIMARY KEY (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS sessions (
  "sessionToken" text PRIMARY KEY,
  "userId"       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires        timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "verificationToken" (
  identifier text NOT NULL,
  token      text NOT NULL,
  expires    timestamptz NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- ---------------------------------------------------------------------------
-- Profiles + per-item state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id              text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role                 text,
  company              text,
  current_projects     text,
  focus_topics         text[]       NOT NULL DEFAULT '{}'::text[],
  dislikes             text[]       NOT NULL DEFAULT '{}'::text[],
  dismissed_companies  text[]       NOT NULL DEFAULT '{}'::text[],
  profile_embedding    vector(1536),
  onboarded_at         timestamptz,
  updated_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_item_state (
  user_id             text    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id             integer NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  seen_at             timestamptz,
  saved               boolean NOT NULL DEFAULT false,
  dismissed           boolean NOT NULL DEFAULT false,
  reaction            varchar(16),
  personalized_blurb  text,
  personalized_reason text,
  personalized_rank   integer,
  rerank_issue        varchar(16),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS user_item_state_user_issue_idx
  ON user_item_state (user_id, rerank_issue);

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id                    serial PRIMARY KEY,
  session_id            text NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role                  varchar(16) NOT NULL,
  content               jsonb       NOT NULL,
  referenced_item_ids   integer[]   NOT NULL DEFAULT '{}'::int[],
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_session_idx
  ON chat_messages (session_id);

-- ---------------------------------------------------------------------------
-- Long-term memory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_facts (
  id          serial PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact        text NOT NULL,
  embedding   vector(1536),
  source      varchar(32) NOT NULL,
  confidence  integer NOT NULL DEFAULT 50,
  session_id  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_facts_user_idx ON memory_facts (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS memory_facts_user_fact_uniq
  ON memory_facts (user_id, fact);
CREATE INDEX IF NOT EXISTS memory_facts_embedding_ivfflat
  ON memory_facts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
