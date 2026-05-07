import { tool } from "ai";
import { z } from "zod";
import { db, sqlClient } from "@/lib/db/client";
import { newsItems, userItemState } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { embedText, toVectorLiteral } from "@/lib/embeddings";
import { rememberFact } from "./memory";
import { invalidateRerankCache } from "@/lib/personalization/rerank";

export function buildAgentTools(opts: {
  userId: string;
  sessionId: string;
}) {
  return {
    search_news: tool({
      description:
        "Semantic + filter search over the news_items library. Use when the user asks about a topic, company, model, or product. Returns up to 10 matches with id, name, company, headline, and module.",
      parameters: z.object({
        query: z
          .string()
          .describe("Natural language search query — what the user is asking about."),
        module: z
          .enum(["model", "product", "any"])
          .default("any")
          .describe("Filter by module."),
        company: z
          .string()
          .optional()
          .describe("Restrict to a single company (case-insensitive substring)."),
        limit: z.number().int().min(1).max(15).default(8),
      }),
      execute: async ({ query, module, company, limit }) => {
        let embeddingLiteral: string | null = null;
        if (process.env.OPENAI_API_KEY) {
          try {
            const vec = await embedText(query);
            embeddingLiteral = toVectorLiteral(vec);
          } catch {
            embeddingLiteral = null;
          }
        }
        const moduleFilter = module === "any" ? null : module;
        const companyFilter = company ? `%${company.toLowerCase()}%` : null;
        const rows = await sqlClient<
          Array<{
            id: number;
            slug: string;
            name: string;
            company: string;
            module: string;
            headline: string;
            issue_date: string;
          }>
        >`
          SELECT id, slug, name, company, module, headline, issue_date
          FROM news_items
          WHERE item_tier IN ('main', 'brief')
            AND (${moduleFilter}::text IS NULL OR module = ${moduleFilter})
            AND (${companyFilter}::text IS NULL OR lower(company) LIKE ${companyFilter})
          ORDER BY
            ${
              embeddingLiteral
                ? sqlClient`embedding <=> ${embeddingLiteral}::vector NULLS LAST,`
                : sqlClient``
            }
            total_score DESC,
            issue_date DESC
          LIMIT ${limit}
        `;
        return { results: rows };
      },
    }),

    get_item: tool({
      description:
        "Fetch the full normalized record for a single news item by id. Use this AFTER search_news when the user wants details, or when an item id is referenced in the conversation.",
      parameters: z.object({
        id: z.number().int().positive(),
      }),
      execute: async ({ id }) => {
        const [row] = await db
          .select()
          .from(newsItems)
          .where(eq(newsItems.id, id))
          .limit(1);
        if (!row) return { error: "not found" };
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          company: row.company,
          module: row.module,
          headline: row.headline,
          one_line_judgment: row.oneLineJudgment,
          relevance_to_us: row.relevanceToUs,
          tags: row.tags,
          record: row.record,
        };
      },
    }),

    save_item: tool({
      description:
        "Save a news item to the user's saved list. Use when the user says 'save this', 'keep this for later', 'bookmark', etc.",
      parameters: z.object({
        id: z.number().int().positive(),
      }),
      execute: async ({ id }) => {
        await sqlClient`
          INSERT INTO user_item_state (user_id, item_id, saved, updated_at)
          VALUES (${opts.userId}, ${id}, true, now())
          ON CONFLICT (user_id, item_id) DO UPDATE SET saved = true, updated_at = now()
        `;
        return { ok: true };
      },
    }),

    dismiss_item: tool({
      description:
        "Hide a news item from the user's feed. Use when the user explicitly says 'hide this', 'I don't want to see this', etc. Do NOT call for mild disinterest — use the `remember` tool for nuanced preferences instead.",
      parameters: z.object({
        id: z.number().int().positive(),
      }),
      execute: async ({ id }) => {
        await sqlClient`
          INSERT INTO user_item_state (user_id, item_id, dismissed, updated_at)
          VALUES (${opts.userId}, ${id}, true, now())
          ON CONFLICT (user_id, item_id) DO UPDATE SET dismissed = true, updated_at = now()
        `;
        await invalidateRerankCache(opts.userId);
        return { ok: true };
      },
    }),

    remember: tool({
      description:
        "Store a durable preference fact about the user. Use whenever the user states something they care about, dislike, or want more/less of. Call this PROACTIVELY — it's how the agent gets smarter over time.",
      parameters: z.object({
        fact: z
          .string()
          .min(8)
          .max(200)
          .describe(
            "A self-contained statement in third person: 'User prefers X', 'User does NOT want Y', 'User works on Z'."
          ),
        confidence: z
          .number()
          .int()
          .min(40)
          .max(100)
          .default(80)
          .describe("How sure are you the user actually wants this remembered."),
      }),
      execute: async ({ fact, confidence }) => {
        const stored = await rememberFact({
          userId: opts.userId,
          fact,
          source: "extracted-from-chat",
          confidence,
          sessionId: opts.sessionId,
        });
        if (stored) await invalidateRerankCache(opts.userId);
        return { stored };
      },
    }),
  };
}
