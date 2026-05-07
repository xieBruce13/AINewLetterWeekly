import { db, sqlClient } from "@/lib/db/client";
import { newsItems, userItemState, userProfiles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getCheapRerank, type CheapRerankRow } from "@/lib/db/queries";
import { toVectorLiteral } from "@/lib/embeddings";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// Smart-rerank model. After the 2026-05-05 single-key migration this is
// served via OpenAI; gpt-5-mini handles 30 candidates → 12 ranked items
// with reasonable Chinese-output quality at a fraction of Sonnet's cost.
const RERANK_MODEL = "gpt-4o-mini";
const TOP_N = 12; // size of the final feed
/** How many issues back the cross-issue rerank pulls from. 4 weeks of
 *  history × ~7 items/issue ≈ 28 candidates, which is enough headroom for
 *  the LLM step to actually choose between alternatives. */
const LOOKBACK_ISSUES = 4;
/** Top-K memory facts to feed into the cheap rerank as semantic boost. */
const MEMORY_FACTS_K = 6;

export interface PersonalizedItem extends CheapRerankRow {
  personalizedBlurb: string;
  personalizedReason: string;
  personalizedRank: number;
  state?: {
    saved: boolean;
    dismissed: boolean;
    reaction: string | null;
  };
}

const RerankSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.number(),
        blurb: z
          .string()
          .min(10)
          .max(80)
          .describe(
            "Short personalized angle (15-40 Chinese chars). Tells THIS reader why this matters to their work — NOT a re-summary of the news. Example: '影响你 RAG 流水线的 chunking 策略' or '你的多模态 demo 可以直接用'. Do NOT restate the news headline."
          ),
        reason: z
          .string()
          .min(40)
          .max(420)
          .describe(
            "2-3 sentence justification of why THIS user should care, referencing their profile concretely."
          ),
      })
    )
    .min(1)
    .max(20),
});

function profileSummary(p: {
  role: string | null;
  company: string | null;
  currentProjects: string | null;
  focusTopics: string[];
  dislikes: string[];
}): string {
  const lines: string[] = [];
  if (p.role) lines.push(`角色：${p.role}`);
  if (p.company) lines.push(`公司：${p.company}`);
  if (p.currentProjects) lines.push(`当前在做：${p.currentProjects}`);
  if (p.focusTopics.length)
    lines.push(`关注话题：${p.focusTopics.join("、")}`);
  if (p.dislikes.length)
    lines.push(`不感兴趣：${p.dislikes.join("、")}`);
  return lines.join("\n") || "（档案为空）";
}

function compactItemForPrompt(row: CheapRerankRow): string {
  // Prefer the Chinese factual summary when the pipeline produced one —
  // gives the rerank LLM a clean factual seed in the right language.
  const rec = (row.record ?? {}) as Record<string, unknown>;
  const summaryZh = typeof rec.summary_zh === "string" ? rec.summary_zh : "";
  const judgmentZh = typeof rec.judgment_zh === "string" ? rec.judgment_zh : "";
  return [
    `id=${row.id}`,
    `module=${row.module}`,
    `name=${row.name}`,
    `company=${row.company}`,
    `tags=${row.tags.join(",")}`,
    `headline=${summaryZh || row.headline}`,
    `judgment=${judgmentZh || row.one_line_judgment || ""}`,
    `relevance_to_us=${row.relevance_to_us ?? ""}`,
  ].join(" | ");
}

/**
 * Returns the top-N items personalized for this user, complete with cached
 * blurbs and reasons. Cache is keyed on (user_id, issue_date) and lives in
 * `user_item_state` — we recompute only if the user's profile changed since
 * the last rerank or the cached rows are missing.
 */
export async function getPersonalizedFeed(
  userId: string,
  issueDate: string
): Promise<PersonalizedItem[]> {
  const profile = (
    await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1)
  )[0];

  const profileEmbeddingLiteral = profile?.profileEmbedding
    ? toVectorLiteral(profile.profileEmbedding as unknown as number[])
    : null;

  // Pull this user's top-K memory facts (extracted from chat) as embeddings,
  // so the cheap rerank can push items that look like things they've talked
  // about with the agent. We take the most-confident facts that have an
  // embedding — facts without one (no OPENAI_API_KEY at extraction time)
  // simply don't contribute, no harm.
  // pgvector renders to text as `[0.1,0.2,...]` — we read it as text and
  // pass it through unchanged into the cheap-rerank as a vector literal.
  const memoryRows = await sqlClient<Array<{ embedding: string }>>`
    SELECT embedding::text AS embedding
    FROM memory_facts
    WHERE user_id = ${userId}
      AND embedding IS NOT NULL
    ORDER BY confidence DESC, created_at DESC
    LIMIT ${MEMORY_FACTS_K}
  `;
  const userMemoryEmbeddingLiterals = memoryRows
    .map((r) => (typeof r.embedding === "string" ? r.embedding : null))
    .filter((s): s is string => !!s && s.startsWith("["));

  const candidates = await getCheapRerank({
    userId,
    issueDate,
    profileEmbeddingLiteral,
    userMemoryEmbeddingLiterals,
    focusTopics: profile?.focusTopics ?? [],
    dislikes: profile?.dislikes ?? [],
    dismissedCompanies: profile?.dismissedCompanies ?? [],
    limit: 60,
    lookbackIssues: LOOKBACK_ISSUES,
  });

  if (candidates.length === 0) return [];

  // Look up any cached rerank rows for this issue.
  const cachedStates = await db
    .select()
    .from(userItemState)
    .where(
      and(
        eq(userItemState.userId, userId),
        eq(userItemState.rerankIssue, issueDate)
      )
    );
  const cacheMap = new Map(cachedStates.map((s) => [s.itemId, s]));

  const candidateIds = new Set(candidates.map((c) => c.id));
  // Some cached rows may exist but be from a stale candidate set — only count
  // the ones still in the top-N.
  const cachedTopN = [...cacheMap.values()]
    .filter((s) => candidateIds.has(s.itemId))
    .filter((s) => s.personalizedBlurb && s.personalizedReason)
    .sort((a, b) => (a.personalizedRank ?? 999) - (b.personalizedRank ?? 999))
    .slice(0, TOP_N);

  if (cachedTopN.length >= Math.min(TOP_N, candidates.length)) {
    const ranked = cachedTopN
      .map((s) => {
        const cand = candidates.find((c) => c.id === s.itemId);
        if (!cand) return null;
        return {
          ...cand,
          personalizedBlurb: s.personalizedBlurb!,
          personalizedReason: s.personalizedReason!,
          personalizedRank: s.personalizedRank ?? 999,
          state: {
            saved: s.saved,
            dismissed: s.dismissed,
            reaction: s.reaction,
          },
        } as PersonalizedItem;
      })
      .filter(Boolean) as PersonalizedItem[];
    return ranked;
  }

  // Cache miss → call the LLM to rerank + write personalized blurbs.
  const ranked = await llmRerank({
    profile: profile ?? null,
    candidates,
  });

  // Write through to the cache. We also tag dismissed/saved state if it
  // already existed for these items.
  await Promise.all(
    ranked.map((r, idx) =>
      sqlClient`
        INSERT INTO user_item_state (
          user_id, item_id, personalized_blurb, personalized_reason,
          personalized_rank, rerank_issue, updated_at
        ) VALUES (
          ${userId}, ${r.id}, ${r.personalizedBlurb}, ${r.personalizedReason},
          ${idx}, ${issueDate}, now()
        )
        ON CONFLICT (user_id, item_id) DO UPDATE SET
          personalized_blurb  = EXCLUDED.personalized_blurb,
          personalized_reason = EXCLUDED.personalized_reason,
          personalized_rank   = EXCLUDED.personalized_rank,
          rerank_issue        = EXCLUDED.rerank_issue,
          updated_at          = now()
      `
    )
  );

  // Hydrate state from existing rows (saved/dismissed/reaction).
  const stateMap = new Map(cachedStates.map((s) => [s.itemId, s]));
  return ranked.map((r) => ({
    ...r,
    state: {
      saved: stateMap.get(r.id)?.saved ?? false,
      dismissed: stateMap.get(r.id)?.dismissed ?? false,
      reaction: stateMap.get(r.id)?.reaction ?? null,
    },
  }));
}

async function llmRerank(args: {
  profile:
    | {
        role: string | null;
        company: string | null;
        currentProjects: string | null;
        focusTopics: string[];
        dislikes: string[];
      }
    | null;
  candidates: CheapRerankRow[];
}): Promise<PersonalizedItem[]> {
  const profile = args.profile ?? {
    role: null,
    company: null,
    currentProjects: null,
    focusTopics: [],
    dislikes: [],
  };

  const profileBlock = profileSummary(profile);
  const candidateLines = args.candidates.map(compactItemForPrompt).join("\n");

  // Defensive: if no OpenAI key, return cheap-rerank order with template
  // blurbs so the page still renders in dev. The same key drives both
  // embeddings and generation now, so this is the only check needed.
  if (!process.env.OPENAI_API_KEY) {
    return args.candidates.slice(0, TOP_N).map((c, idx) => ({
      ...c,
      personalizedBlurb: c.headline,
      personalizedReason:
        c.relevance_to_us ??
        c.one_line_judgment ??
        "本周得分较高的一条。",
      personalizedRank: idx,
    }));
  }

  const { object } = await generateObject({
    model: openai(RERANK_MODEL),
    schema: RerankSchema,
    system: [
      "你是 AI 行业周报的个人编辑（中文输出）。",
      "在候选条目里为这位读者按相关性重排，并对每条保留的条目写两段。",
      "",
      "blurb（最关键，也是最容易写错的）：",
      "  - 长度：15–40 字。一句短句。",
      "  - 内容：仅写「这条对这位读者意味着什么」的角度词组 —— 不是新闻摘要、不是新闻标题、不是新闻改写。",
      "  - 用「你/你的团队」是允许的，但要落到具体技术/产品/流程上。",
      "  - 一定要短 —— blurb 出现在卡片底部小字处，不是主标题。",
      "",
      "  示例（GOOD）：",
      "    「直接影响你的 RAG chunking 策略」",
      "    「跟你做的 AI 创作工具同一赛道」",
      "    「降低你视频生成成本的关键」",
      "    「你 PM 类产品可以原生接入」",
      "",
      "  示例（BAD，不要写成这样）：",
      "    「你需要要关注 Luma Uni 的推出，增强你的创作工具功能！」  ← 在改写新闻标题",
      "    「OpenAI 的卡片式个性化 feed 将为你的产品设计提供灵感！」  ← 在复述新闻 + 加感叹号",
      "    「Amazon 的 GRPO 为你的强化学习提供了更透明的训练管道！」  ← 在复述新闻",
      "    「LangSmith 的评估工具将帮助你优化个性化和聊天代理的表现！」",
      "  以上四条都是错的 —— 它们在「润色新闻标题 + 加你/你的」，而不是写一个「角度」。",
      "  不要用感叹号。",
      "",
      "reason：2–3 句中文，落到具体 workflow / 成本 / 竞品 / 读者能据此做的决定。",
      "",
      `按相关性从高到低返回 6 到 ${TOP_N} 条。明显不相关（dislikes 覆盖、与角色相距甚远）的跳过。`,
      "不要编造候选里没有的事实。不要提 tier / 分数 / 流水线相关的术语。",
    ].join("\n"),
    prompt: [
      "## 读者档案",
      profileBlock,
      "",
      "## 候选新闻（每行一条）",
      candidateLines,
      "",
      "请为这位读者做重排，并为每条保留的新闻写出中文 blurb 与 reason。",
    ].join("\n"),
    temperature: 0.4,
  });

  const byId = new Map(args.candidates.map((c) => [c.id, c]));
  const out: PersonalizedItem[] = [];
  object.items.forEach((entry, idx) => {
    const cand = byId.get(entry.id);
    if (!cand) return;
    out.push({
      ...cand,
      personalizedBlurb: entry.blurb,
      personalizedReason: entry.reason,
      personalizedRank: idx,
    });
  });
  return out.slice(0, TOP_N);
}

/** Wipe a user's cached rerank for a given issue — used when their profile
 * changes or they take an action that should refresh recommendations. */
export async function invalidateRerankCache(userId: string, issueDate?: string) {
  if (issueDate) {
    await sqlClient`
      UPDATE user_item_state
      SET personalized_blurb = NULL,
          personalized_reason = NULL,
          personalized_rank = NULL,
          rerank_issue = NULL,
          updated_at = now()
      WHERE user_id = ${userId} AND rerank_issue = ${issueDate}
    `;
  } else {
    await sqlClient`
      UPDATE user_item_state
      SET personalized_blurb = NULL,
          personalized_reason = NULL,
          personalized_rank = NULL,
          rerank_issue = NULL,
          updated_at = now()
      WHERE user_id = ${userId}
    `;
  }
}
