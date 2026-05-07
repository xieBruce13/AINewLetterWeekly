import { db, sqlClient } from "./client";
import {
  newsItems,
  userItemState,
  userProfiles,
  issueSummaries,
  type NewsItem,
  type UserProfile,
  type IssueSummary,
} from "./schema";
import { and, desc, eq, sql } from "drizzle-orm";

export async function getIssueSummary(
  issueDate: string
): Promise<IssueSummary | null> {
  try {
    const rows = await db
      .select()
      .from(issueSummaries)
      .where(eq(issueSummaries.issueDate, issueDate))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    // Table may not exist yet on a fresh install — return null so the home
    // page just hides the bullet strip rather than crashing.
    return null;
  }
}

/** Return the set of `news_items.slug` values present for an issue. Used
 *  by the home page to filter out dead links from the weekly summary
 *  bullets (e.g. an item dropped by sync_to_db's freshness gate). */
export async function getIssueSlugs(issueDate: string): Promise<Set<string>> {
  const rows = await db
    .select({ slug: newsItems.slug })
    .from(newsItems)
    .where(eq(newsItems.issueDate, issueDate));
  return new Set(rows.map((r) => r.slug));
}

export async function getLatestIssueDate(): Promise<string | null> {
  const rows = await db
    .select({ issueDate: newsItems.issueDate })
    .from(newsItems)
    .orderBy(desc(newsItems.issueDate))
    .limit(1);
  return rows[0]?.issueDate ?? null;
}

export async function getProfile(
  userId: string
): Promise<UserProfile | null> {
  const rows = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getItemBySlug(slug: string): Promise<NewsItem | null> {
  const rows = await db
    .select()
    .from(newsItems)
    .where(eq(newsItems.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function getItemById(id: number): Promise<NewsItem | null> {
  const rows = await db
    .select()
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserItemState(userId: string, itemId: number) {
  const rows = await db
    .select()
    .from(userItemState)
    .where(
      and(eq(userItemState.userId, userId), eq(userItemState.itemId, itemId))
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Items the user has explicitly saved, most recent first. */
export async function getSavedItems(userId: string) {
  return await db
    .select({
      item: newsItems,
      state: userItemState,
    })
    .from(userItemState)
    .innerJoin(newsItems, eq(newsItems.id, userItemState.itemId))
    .where(and(eq(userItemState.userId, userId), eq(userItemState.saved, true)))
    .orderBy(desc(userItemState.updatedAt));
}

/** Latest issue's items joined with this user's per-item state. */
export async function getIssueItemsForUser(userId: string, issueDate: string) {
  return await db
    .select({
      item: newsItems,
      state: userItemState,
    })
    .from(newsItems)
    .leftJoin(
      userItemState,
      and(
        eq(userItemState.itemId, newsItems.id),
        eq(userItemState.userId, userId)
      )
    )
    .where(eq(newsItems.issueDate, issueDate))
    .orderBy(desc(newsItems.totalScore));
}

/**
 * Fallback to anon ranking (no user) — pure score order, used on the public
 * landing page or before a user has a profile.
 */
export async function getAnonymousFeed(issueDate: string, limit = 12) {
  return await db
    .select()
    .from(newsItems)
    .where(eq(newsItems.issueDate, issueDate))
    .orderBy(desc(newsItems.totalScore))
    .limit(limit);
}

/**
 * Cheap personalized rerank, executed entirely in Postgres.
 *
 * `score = total_score
 *        + 5 * cosine_similarity(profile_embedding, item.embedding)
 *        + 3 * tag_overlap(focus_topics, tags)
 *        - 5 * tag_overlap(dislikes, tags)
 *        - 2 * (item.company in dismissed_companies)`
 *
 * Returns the top `limit` candidates (default 30) for the LLM rerank to
 * narrow further.
 */
/**
 * Cross-issue cheap rerank.
 *
 * What changed vs v1:
 *   1. Pulls from the last `lookbackIssues` issues (not just the current one),
 *      so even a thin current week + 3 historic weeks gives the LLM rerank
 *      something to actually choose from (~30-80 candidates instead of 7).
 *   2. Recency decay: items that came out N issues ago lose `recency_penalty`
 *      points per issue back. The current issue gets 0 penalty.
 *   3. Memory-fact semantic boost: when `userMemoryEmbeddingLiterals` is
 *      non-empty, we take the MAX cosine-similarity between the item embedding
 *      and any of the user's top memory_facts, and add `memoryWeight ×` that.
 *      Lets "we use Cursor", "I'm building a RAG product" etc. influence the
 *      ranking even before the LLM step.
 *   4. Saved-history boost: items whose `tags` overlap with tags the user has
 *      already saved get a small `+ savedTagWeight × overlap` bonus.
 *   5. Dismissed-item exclusion: items the user already dismissed earlier
 *      stay out (we don't want them re-surfacing each refresh).
 *
 * Score formula:
 *   personalized_score =
 *       total_score                                                    // editorial
 *     + 5 × profile_similarity                                         // role/projects
 *     + 3 × |tags ∩ focus_topics|                                      // explicit interest
 *     + memoryWeight × max(memory_fact_similarity)                     // implicit interest (chat memory)
 *     + savedTagWeight × |tags ∩ saved_tag_history|                    // implicit interest (behavior)
 *     - 5 × |tags ∩ dislikes|
 *     - 2 × dismissed_company
 *     - recency_penalty × issues_back
 */
export async function getCheapRerank(opts: {
  userId: string;
  issueDate: string;
  profileEmbeddingLiteral: string | null;
  /** Top-K memory facts as pgvector literals — the cheap rerank takes
   *  MAX similarity across all of them. Pass [] to disable. */
  userMemoryEmbeddingLiterals?: string[];
  focusTopics: string[];
  dislikes: string[];
  dismissedCompanies: string[];
  limit?: number;
  /** How many recent issues to consider. 1 = current only (legacy v1). */
  lookbackIssues?: number;
  /** Score deduction per issue back (0 disables). Default 0.5. */
  recencyPenalty?: number;
  /** Multiplier on the max memory-fact similarity. Default 4. */
  memoryWeight?: number;
  /** Multiplier on the saved-tag overlap. Default 1. */
  savedTagWeight?: number;
}) {
  const limit = opts.limit ?? 60;
  const lookbackIssues = opts.lookbackIssues ?? 4;
  const recencyPenalty = opts.recencyPenalty ?? 0.5;
  const memoryWeight = opts.memoryWeight ?? 4;
  const savedTagWeight = opts.savedTagWeight ?? 1;
  // Memory-fact literals are inlined via `unsafe` (see below), so guard
  // against any input that doesn't match the strict pgvector text format
  // `[0.1,0.2,...]`. Defence in depth — these come from our own DB today,
  // but locking the format prevents future call-sites from accidentally
  // routing user input through.
  const VECTOR_LITERAL_RE = /^\[-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?:,-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)*\]$/;
  const memoryLiterals = (opts.userMemoryEmbeddingLiterals ?? []).filter(
    (l) => VECTOR_LITERAL_RE.test(l)
  );

  // Build the memory-MAX-similarity SQL expression. With 0 facts we
  // substitute 0; with N facts we GREATEST() across all the cosine
  // similarities. We can't build this with a parameterized array because
  // pgvector's `<=>` doesn't accept array operands, so we splat them
  // inline as separate sub-expressions (validated above).
  const memSimExpr = memoryLiterals.length
    ? sqlClient.unsafe(
        "GREATEST(" +
          memoryLiterals
            .map((lit) => `(1 - (i.embedding <=> '${lit}'::vector))`)
            .join(", ") +
          ")"
      )
    : sqlClient`0::float8`;

  const rows = await sqlClient<
    Array<{
      id: number;
      slug: string;
      module: string;
      name: string;
      company: string;
      issue_date: string;
      published_at: Date;
      item_tier: string;
      total_score: number;
      headline: string;
      one_line_judgment: string | null;
      relevance_to_us: string | null;
      tags: string[];
      image_urls: string[];
      primary_image: string | null;
      record: Record<string, unknown>;
      personalized_score: number;
      similarity: number | null;
      memory_similarity: number | null;
      tag_overlap: number;
      saved_tag_overlap: number;
      dislike_overlap: number;
      dismissed_company: boolean;
      issues_back: number;
    }>
  >`
    WITH recent_issues AS (
      SELECT DISTINCT issue_date
      FROM news_items
      WHERE issue_date <= ${opts.issueDate}
      ORDER BY issue_date DESC
      LIMIT ${lookbackIssues}
    ),
    -- For "boost items whose tags I've previously saved": collect every
    -- tag from rows the user has saved, anywhere in history.
    saved_tags AS (
      SELECT DISTINCT unnest(i.tags) AS tag
      FROM user_item_state s
      JOIN news_items i ON i.id = s.item_id
      WHERE s.user_id = ${opts.userId} AND s.saved = true
    ),
    -- And every item the user explicitly dismissed (any time) — exclude.
    dismissed_items AS (
      SELECT item_id FROM user_item_state
      WHERE user_id = ${opts.userId} AND dismissed = true
    )
    SELECT
      i.id, i.slug, i.module, i.name, i.company, i.issue_date, i.published_at,
      i.item_tier, i.total_score, i.headline, i.one_line_judgment,
      i.relevance_to_us, i.tags, i.image_urls, i.primary_image, i.record,
      ${
        opts.profileEmbeddingLiteral
          ? sqlClient`(1 - (i.embedding <=> ${opts.profileEmbeddingLiteral}::vector))`
          : sqlClient`NULL::float8`
      } AS similarity,
      ${memoryLiterals.length ? memSimExpr : sqlClient`NULL::float8`} AS memory_similarity,
      cardinality(
        ARRAY(SELECT unnest(i.tags) INTERSECT SELECT unnest(${opts.focusTopics}::text[]))
      ) AS tag_overlap,
      cardinality(
        ARRAY(
          SELECT unnest(i.tags)
          INTERSECT
          SELECT tag FROM saved_tags
        )
      ) AS saved_tag_overlap,
      cardinality(
        ARRAY(SELECT unnest(i.tags) INTERSECT SELECT unnest(${opts.dislikes}::text[]))
      ) AS dislike_overlap,
      (i.company = ANY(${opts.dismissedCompanies}::text[])) AS dismissed_company,
      -- "How many issues back from the current one" using dense ranking
      -- of recent_issues (0 = current).
      COALESCE(
        (SELECT rk - 1 FROM (
          SELECT issue_date, dense_rank() OVER (ORDER BY issue_date DESC) AS rk
          FROM recent_issues
        ) r WHERE r.issue_date = i.issue_date),
        0
      ) AS issues_back,
      (
        i.total_score
        + COALESCE(${
          opts.profileEmbeddingLiteral
            ? sqlClient`5 * (1 - (i.embedding <=> ${opts.profileEmbeddingLiteral}::vector))`
            : sqlClient`0`
        }, 0)
        + ${memoryWeight}::float8 * COALESCE(${memoryLiterals.length ? memSimExpr : sqlClient`0::float8`}, 0)
        + 3 * cardinality(
            ARRAY(SELECT unnest(i.tags) INTERSECT SELECT unnest(${opts.focusTopics}::text[]))
          )
        + ${savedTagWeight}::float8 * cardinality(
            ARRAY(SELECT unnest(i.tags) INTERSECT SELECT tag FROM saved_tags)
          )
        - 5 * cardinality(
            ARRAY(SELECT unnest(i.tags) INTERSECT SELECT unnest(${opts.dislikes}::text[]))
          )
        - CASE WHEN i.company = ANY(${opts.dismissedCompanies}::text[]) THEN 2 ELSE 0 END
        - ${recencyPenalty}::float8 * COALESCE(
            (SELECT rk - 1 FROM (
              SELECT issue_date, dense_rank() OVER (ORDER BY issue_date DESC) AS rk
              FROM recent_issues
            ) r WHERE r.issue_date = i.issue_date),
            0
          )
      ) AS personalized_score
    FROM news_items i
    WHERE i.issue_date IN (SELECT issue_date FROM recent_issues)
      AND i.item_tier IN ('main', 'brief')
      AND i.id NOT IN (SELECT item_id FROM dismissed_items)
    ORDER BY personalized_score DESC
    LIMIT ${limit}
  `;
  return rows;
}

export type CheapRerankRow = Awaited<ReturnType<typeof getCheapRerank>>[number];
