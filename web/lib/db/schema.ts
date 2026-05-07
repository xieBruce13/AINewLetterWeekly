import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// pgvector custom type. Stores Float32 arrays in Postgres `vector(N)` columns.
// We use 1536 dims (OpenAI text-embedding-3-small).
export const VECTOR_DIM = 1536;

const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? VECTOR_DIM})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    if (Array.isArray(value)) return value as unknown as number[];
    const trimmed = value.replace(/^\[/, "").replace(/\]$/, "");
    if (!trimmed) return [];
    return trimmed.split(",").map((n) => Number(n));
  },
});

// ---------------------------------------------------------------------------
// News content (mirrors skill/record_schemas.json, flattened for query speed)
// ---------------------------------------------------------------------------

export const newsItems = pgTable(
  "news_items",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    module: varchar("module", { length: 32 }).notNull(), // 'model' | 'product'
    name: text("name").notNull(),
    company: text("company").notNull(),
    version: text("version"),
    issueDate: varchar("issue_date", { length: 16 }).notNull(), // YYYY-MM-DD of newsletter run
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Editorial classification from the pipeline
    itemTier: varchar("item_tier", { length: 16 }).notNull(), // 'main' | 'brief' | 'dropped'
    totalScore: integer("total_score").notNull().default(0),
    sourceTier: varchar("source_tier", { length: 64 }),
    verificationStatus: varchar("verification_status", { length: 32 }),
    confidence: varchar("confidence", { length: 16 }),

    // Headline + summary for cards
    headline: text("headline").notNull(),
    oneLineJudgment: text("one_line_judgment"),
    relevanceToUs: text("relevance_to_us"),

    // Tags help cheap rerank without hitting the LLM. Examples: 'coding', 'agent',
    // 'long-context', 'image-gen', 'workflow', 'startup'.
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),

    // Image candidates already vetted by the publisher.
    imageUrls: text("image_urls").array().notNull().default(sql`'{}'::text[]`),
    primaryImage: text("primary_image"),

    // Full normalized record (raw JSON dump from the pipeline) for the detail
    // view. Mirrors the union of model_record / product_record shapes.
    record: jsonb("record").notNull().$type<Record<string, unknown>>(),

    // Embedding of (name + headline + tags + relevance_to_us) used by the
    // SQL rerank.
    embedding: vector("embedding", { dimensions: VECTOR_DIM }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    issueIdx: index("news_items_issue_idx").on(t.issueDate),
    moduleTierIdx: index("news_items_module_tier_idx").on(t.module, t.itemTier),
    companyIdx: index("news_items_company_idx").on(t.company),
  })
);

// ---------------------------------------------------------------------------
// Issue summaries — one row per weekly issue, holding the overarching theme
// and 3-5 bullet takeaways that surface at the top of the home page.
// ---------------------------------------------------------------------------

export const issueSummaries = pgTable("issue_summaries", {
  issueDate: varchar("issue_date", { length: 16 }).primaryKey(),
  theme: text("theme").notNull(),
  /**
   * Editor-written bullets. Each entry is `{ text, slugs }`:
   * - `text`: the bullet copy (supports a single `**lead-in**` prefix).
   * - `slugs`: array of `news_items.slug` values referenced by the bullet,
   *   used to make the bullet clickable. First slug is the primary jump
   *   target; subsequent slugs render as compact "+N 相关" chips.
   * Stored as JSONB so we don't need a join table for what is at most a
   * handful of bullets per issue.
   */
  bullets: jsonb("bullets")
    .notNull()
    .default(sql`'[]'::jsonb`)
    .$type<{ text: string; slugs?: string[] }[]>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Auth.js tables (drizzle-adapter standard shape)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
  displayName: text("display_name"),
  /**
   * bcrypt hash of the user's password. Nullable so adapter-created rows
   * (e.g. from a magic-link sign-in) don't need to backfill it. The
   * sign-in flow refuses to log in any row whose hash is NULL via the
   * password provider — those users have to go through their original
   * provider (or set a password later).
   */
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  })
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  })
);

// ---------------------------------------------------------------------------
// User profiles, preferences, and per-item state
// ---------------------------------------------------------------------------

export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role"), // free text + suggested chip
  company: text("company"),
  currentProjects: text("current_projects"),
  focusTopics: text("focus_topics").array().notNull().default(sql`'{}'::text[]`),
  dislikes: text("dislikes").array().notNull().default(sql`'{}'::text[]`),
  // Companies the user has dismissed N+ items from — auto-populated from actions.
  dismissedCompanies: text("dismissed_companies")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  profileEmbedding: vector("profile_embedding", { dimensions: VECTOR_DIM }),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userItemState = pgTable(
  "user_item_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => newsItems.id, { onDelete: "cascade" }),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    saved: boolean("saved").notNull().default(false),
    dismissed: boolean("dismissed").notNull().default(false),
    reaction: varchar("reaction", { length: 16 }), // 'like' | 'dislike' | null
    personalizedBlurb: text("personalized_blurb"),
    personalizedReason: text("personalized_reason"), // longer "why this was shown" copy
    personalizedRank: integer("personalized_rank"), // 0 = top of feed
    rerankIssue: varchar("rerank_issue", { length: 16 }), // issue_date this rerank pertains to
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.itemId] }),
    userIssueIdx: index("user_item_state_user_issue_idx").on(
      t.userId,
      t.rerankIssue
    ),
  })
);

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const chatSessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).notNull(), // 'user' | 'assistant' | 'tool' | 'system'
    content: jsonb("content").notNull(), // AI SDK message parts
    referencedItemIds: integer("referenced_item_ids")
      .array()
      .notNull()
      .default(sql`'{}'::int[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    sessionIdx: index("chat_messages_session_idx").on(t.sessionId),
  })
);

// ---------------------------------------------------------------------------
// Long-term memory: extracted facts about the user, queried by similarity.
// ---------------------------------------------------------------------------

export const memoryFacts = pgTable(
  "memory_facts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fact: text("fact").notNull(),
    embedding: vector("embedding", { dimensions: VECTOR_DIM }),
    source: varchar("source", { length: 32 }).notNull(), // explicit-onboarding | extracted-from-chat | inferred-from-reactions
    confidence: integer("confidence").notNull().default(50), // 0-100
    sessionId: text("session_id"), // chat session this fact came from, if any
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("memory_facts_user_idx").on(t.userId),
    uniqUserFact: uniqueIndex("memory_facts_user_fact_uniq").on(t.userId, t.fact),
  })
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
  itemState: many(userItemState),
  chatSessions: many(chatSessions),
  memoryFacts: many(memoryFacts),
}));

export const newsItemsRelations = relations(newsItems, ({ many }) => ({
  states: many(userItemState),
}));

export const userItemStateRelations = relations(userItemState, ({ one }) => ({
  user: one(users, { fields: [userItemState.userId], references: [users.id] }),
  item: one(newsItems, {
    fields: [userItemState.itemId],
    references: [newsItems.id],
  }),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, { fields: [chatSessions.userId], references: [users.id] }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));

export type NewsItem = typeof newsItems.$inferSelect;
export type NewsItemInsert = typeof newsItems.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type UserItemState = typeof userItemState.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type MemoryFact = typeof memoryFacts.$inferSelect;
export type IssueSummary = typeof issueSummaries.$inferSelect;
