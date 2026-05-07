import { db, sqlClient } from "@/lib/db/client";
import { memoryFacts } from "@/lib/db/schema";
import { embedText, toVectorLiteral } from "@/lib/embeddings";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

// Memory-fact extractor model. Migrated to OpenAI 2026-05-05 alongside the
// chat agent and rerank — gpt-5-mini keeps the same per-turn cost as
// embeddings (effectively zero on top of the chat call itself).
const EXTRACTION_MODEL = "gpt-5-mini";

/**
 * Top-K semantic retrieval of memory facts for a user, against a query.
 * Falls back to most-recent-N if either the query or the fact lacks an
 * embedding (e.g. dev mode without OPENAI_API_KEY).
 */
export async function retrieveRelevantFacts(opts: {
  userId: string;
  query: string;
  k?: number;
}): Promise<Array<{ fact: string; source: string }>> {
  const k = opts.k ?? 8;
  if (!process.env.OPENAI_API_KEY) {
    const rows = await sqlClient<Array<{ fact: string; source: string }>>`
      SELECT fact, source
      FROM memory_facts
      WHERE user_id = ${opts.userId}
      ORDER BY confidence DESC, created_at DESC
      LIMIT ${k}
    `;
    return rows;
  }
  const embedding = await embedText(opts.query);
  const literal = toVectorLiteral(embedding);
  const rows = await sqlClient<Array<{ fact: string; source: string }>>`
    SELECT fact, source
    FROM memory_facts
    WHERE user_id = ${opts.userId}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${k}
  `;
  if (rows.length === 0) {
    // No embedded facts yet — fall back to recency.
    return await sqlClient`
      SELECT fact, source FROM memory_facts
      WHERE user_id = ${opts.userId}
      ORDER BY created_at DESC LIMIT ${k}
    `;
  }
  return rows;
}

/** Insert a new memory fact (with embedding if possible). Idempotent on (user, fact). */
export async function rememberFact(opts: {
  userId: string;
  fact: string;
  source: "explicit-onboarding" | "extracted-from-chat" | "inferred-from-reactions";
  confidence?: number;
  sessionId?: string;
}): Promise<boolean> {
  const fact = opts.fact.trim();
  if (!fact) return false;
  let embeddingLiteral: string | null = null;
  if (process.env.OPENAI_API_KEY) {
    try {
      const vec = await embedText(fact);
      embeddingLiteral = toVectorLiteral(vec);
    } catch {
      embeddingLiteral = null;
    }
  }
  const result = await sqlClient`
    INSERT INTO memory_facts (
      user_id, fact, embedding, source, confidence, session_id
    ) VALUES (
      ${opts.userId}, ${fact},
      ${embeddingLiteral ? sqlClient`${embeddingLiteral}::vector` : null},
      ${opts.source}, ${opts.confidence ?? 70}, ${opts.sessionId ?? null}
    )
    ON CONFLICT (user_id, fact) DO NOTHING
    RETURNING id
  `;
  return result.length > 0;
}

export async function forgetAll(userId: string) {
  await db.delete(memoryFacts).where(eq(memoryFacts.userId, userId));
}

const ExtractionSchema = z.object({
  facts: z
    .array(
      z.object({
        fact: z
          .string()
          .min(8)
          .max(200)
          .describe(
            "A self-contained statement about the user's preferences, role, work, or interests that should be remembered for future sessions."
          ),
        confidence: z.number().int().min(20).max(100),
      })
    )
    .max(8),
});

/**
 * Mine new facts from the most recent chat turns. Designed to be invoked
 * fire-and-forget after each user/assistant turn. Cheap on tokens because
 * we only show the LLM the last few turns plus a short list of facts we
 * already know (to deduplicate).
 */
export async function extractFactsFromTurns(opts: {
  userId: string;
  sessionId: string;
  recentTurns: Array<{ role: string; text: string }>;
  knownFacts: string[];
}): Promise<number> {
  if (!process.env.OPENAI_API_KEY) return 0;
  if (opts.recentTurns.length === 0) return 0;

  const transcript = opts.recentTurns
    .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
    .join("\n");

  try {
    const { object } = await generateObject({
      model: openai(EXTRACTION_MODEL),
      schema: ExtractionSchema,
      system: [
        "You are a memory-extractor for a personal AI news agent.",
        "Read recent chat turns. Output ONLY new, durable facts about the user worth remembering across sessions.",
        "Good facts: stated preferences, role/team, projects, products they use, vendors they avoid, topics they want more or less of, decisions they've made.",
        "Bad facts (skip): one-off questions, transient context, anything already in 'knownFacts'.",
        "Keep facts in third person ('user prefers …'). Be conservative — output 0 facts if nothing durable is stated.",
      ].join("\n"),
      prompt: [
        "## Known facts (do not duplicate)",
        opts.knownFacts.length > 0
          ? opts.knownFacts.map((f) => `- ${f}`).join("\n")
          : "(none)",
        "",
        "## Recent chat turns",
        transcript,
        "",
        "Now extract any new durable facts. Be conservative.",
      ].join("\n"),
      temperature: 0.2,
    });
    let inserted = 0;
    for (const f of object.facts) {
      const ok = await rememberFact({
        userId: opts.userId,
        fact: f.fact,
        source: "extracted-from-chat",
        confidence: f.confidence,
        sessionId: opts.sessionId,
      });
      if (ok) inserted++;
    }
    return inserted;
  } catch {
    return 0;
  }
}
