import Link from "next/link";
import { sqlClient } from "@/lib/db/client";

// Re-render at most once an hour. /about has no per-user state and only
// reads two lightweight aggregates from `news_items`, so there's no reason
// to pay the dynamic-render cost on every navigation.
export const revalidate = 3600;

export const metadata = {
  title: "如何运作 · ZenoNews",
  description:
    "ZenoNews 的内容流水线、更新频率与后台数据库说明。",
};

/**
 * "How it works" — explains the editorial pipeline, the weekly cadence, and
 * the database / personalization architecture in plain Chinese.
 *
 * Live numbers (item count, latest issue) come from a small SQL query so the
 * page stays honest as we publish more issues.
 */
export default async function AboutPage() {
  const stats = await loadStats();

  return (
    <article className="bg-claude-canvas dark:bg-claude-dark">
      <div className="container-tight py-12 sm:py-20">
        <div className="text-[12px] font-medium uppercase tracking-uc text-claude-coral">
          关于
        </div>
        <h1 className="mt-4 max-w-3xl font-display text-[40px] leading-[1.1] tracking-display text-claude-ink dark:text-white sm:text-[52px]">
          这份周报是<span className="text-claude-coral">怎么做出来的</span>
        </h1>
        <p className="mt-5 max-w-3xl text-[18px] leading-[1.6] text-claude-body dark:text-white/80">
          九个 agent 的流水线 · 每周一发布一期 · 个性化在你登录的瞬间发生。
          下面把它拆开讲清楚。
        </p>

        <StatStrip stats={stats} />

        {/* 1. Pipeline */}
        <Section title="01 · 内容流水线" eyebrow="九个 agent，一次跑完">
          <p>
            上游是一个九步骤的多 agent 流水线（在仓库的{" "}
            <Code>.claude/agents/</Code> 下），由 <Code>newsletter-orchestrator
            </Code>{" "}
            协调。每一步只做一件事，把状态写到{" "}
            <Code>newsletter_runs/YYYY-MM-DD/</Code>{" "}
            目录里的一个 JSON 文件，下一步从那里继续。
          </p>

          <ol className="mt-6 space-y-3">
            <PipelineStep
              n={1}
              name="scope-lock"
              out="scope.json"
              desc="锁定本期的扫描范围（截止日期、覆盖语种、模块权重）。"
            />
            <PipelineStep
              n={2}
              name="collector"
              out="raw_model_records.json / raw_product_records.json"
              desc="按官方 → 技术信号 → newsletter → 社区四层抓候选；每条带 source URL 和 source_tier。"
            />
            <PipelineStep
              n={3}
              name="filter"
              out="filtered_records.json"
              desc="跑 rubric 里的 gate：明显不及格的丢掉，边缘的进 watchlist。"
            />
            <PipelineStep
              n={4}
              name="normalizer"
              out="normalized_records.json"
              desc="把过 gate 的条目按 record_schemas.json 展开成结构化 JSON（官方声明、第三方验证、社区反馈分别字段化）。"
            />
            <PipelineStep
              n={5}
              name="verifier"
              out="verified_records.json"
              desc="把每一条官方声明对到一手来源；每条主条目还要从 Reddit 抓 2–4 条真实用户引用。"
            />
            <PipelineStep
              n={6}
              name="scorer"
              out="scored_records.json"
              desc="按模块的 rubric 给每个维度打分 + 一句理由。"
            />
            <PipelineStep
              n={7}
              name="triage"
              out="triage_decisions.json"
              desc="把每条分到 main / brief / drop；执行多样性、初创、编辑覆写。"
            />
            <PipelineStep
              n={8}
              name="writer"
              out="newsletter_draft.md"
              desc="把保留的条目写成最终的 markdown 周报草稿。"
            />
            <PipelineStep
              n={9}
              name="qa"
              out="（PASS / 修订意见）"
              desc="跑编辑 QA checklist，不通过则把意见返给 writer 再写一遍。"
            />
            <PipelineStep
              n={10}
              name="publisher"
              out="HTML / PDF / DB rows"
              desc="转 HTML/PDF，并执行最重要的一步：调用 sync_to_db.py 把所有最终条目 upsert 到 Postgres，让网站能看到。"
            />
          </ol>

          <p className="mt-6 text-claude-muted">
            最后一步的 <Code>sync_to_db.py</Code>{" "}
            就是「PDF / Markdown 周报」与「这个网站」之间唯一的桥梁。改 record schema、加新字段，只要 sync 脚本会带过去，详情页立刻能用。
          </p>
        </Section>

        {/* 2. Cadence */}
        <Section title="02 · 更新频率" eyebrow="周一发布、按需补丁">
          <ul className="space-y-3">
            <Bullet>
              <strong>每周一上午发布一期</strong>。
              扫描窗口是「上一周一 00:00 → 本周日 23:59 (UTC)」，所以你每周一打开看到的是过去 7 天的事。
            </Bullet>
            <Bullet>
              <strong>每天一次自动 collector pass</strong>。
              每天夜里跑一次 collector，把候选写进
              <Code>newsletter_runs/YYYY-MM-DD/</Code>
              的 raw 文件，但<em>不</em>触发后续步骤。这样下周一编辑跑全流水线时，候选已经新鲜。
            </Bullet>
            <Bullet>
              <strong>突发新闻会另起一期</strong>（例如 GPT 5 / Claude 5
              发布日）。带 <Code>--midweek</Code>{" "}
              标志的人工触发，跑完整流水线但只产出 1–3 条主条目，issue_date 是触发当天。
            </Bullet>
            <Bullet>
              <strong>个性化是在线发生的</strong> ——
              不是每周一才更新。你每次登录、修改档案、保存或屏蔽一条，下一次刷新都会按你最新的偏好重排（见 03 节）。
            </Bullet>
          </ul>

          <Aside>
            想看历史所有期？翻一下{" "}
            <Code>newsletter_runs/</Code>{" "}
            目录就是 —— 一个文件夹一期，按 ISO 日期命名。每个文件夹都自带完整的 JSON 工件，可以重新 sync 到任意数据库。
          </Aside>
        </Section>

        {/* 3. Database */}
        <Section title="03 · 后台数据库" eyebrow="Postgres + pgvector，9 张表">
          <p>
            一个 Postgres 实例（本地用 docker 起 <Code>pgvector/pgvector:pg16
            </Code>{" "}
            镜像，生产指向托管 Postgres）。建表脚本在{" "}
            <Code>db/migrations/0000_initial.sql</Code>{" "}
            ，schema 定义在
            <Code>web/lib/db/schema.ts</Code> （Drizzle ORM）。
          </p>

          <SchemaGroup
            label="新闻内容"
            tables={[
              {
                name: "news_items",
                purpose:
                  "每条新闻一行。flat 字段（headline, tags, total_score, item_tier, published_at, primary_image…）+ 完整的 record JSONB（保留官方声明、外部验证、引用、scenarios 等所有结构化字段）。",
              },
            ]}
          />
          <SchemaGroup
            label="账号 / 鉴权"
            tables={[
              {
                name: "users",
                purpose: "Auth.js 标准用户表（id, email, name, image）。",
              },
              {
                name: "accounts / sessions / verificationToken",
                purpose:
                  "Auth.js drizzle adapter 标准三件套，用于第三方登录与邮件 magic link。",
              },
            ]}
          />
          <SchemaGroup
            label="个性化"
            tables={[
              {
                name: "user_profiles",
                purpose:
                  "你的角色、公司、当前在做的项目、关注话题 / dislikes，以及一个 1536 维的 profile_embedding（用于 cheap rerank）。",
              },
              {
                name: "user_item_state",
                purpose:
                  "(user_id, item_id) 对的状态：是否保存 / 屏蔽 / 点赞，以及 LLM 重排结果的缓存 (personalized_blurb / personalized_reason / personalized_rank)。",
              },
              {
                name: "memory_facts",
                purpose:
                  "从 onboarding、聊天和你的反应里提炼出的长期事实（带 embedding，按相似度查询）。chat agent 每轮回答前会拉取与当前话题最相关的 5 条作为上下文。",
              },
            ]}
          />
          <SchemaGroup
            label="对话"
            tables={[
              {
                name: "chat_sessions",
                purpose: "一次和 agent 的对话 = 一行（id, title, 时间戳）。",
              },
              {
                name: "chat_messages",
                purpose:
                  "Vercel AI SDK 形态的消息内容 + 此条引用到的 news_items.id 数组。",
              },
            ]}
          />

          <p className="mt-6">
            <strong>个性化的两层重排</strong>：
            首页加载时先在 Postgres 里做一次「便宜重排」（你 profile embedding 与每条的 cosine 相似度 + tag 重合度 - dislikes 重合度 - 被屏蔽公司），取 top 30；再把它们交给 Claude Sonnet 做「智能重排」并为留下来的每条写一段中文 blurb / reason。结果缓存在{" "}
            <Code>user_item_state</Code>{" "}
            ，下次刷新直接命中缓存（除非你的 profile 改了 / 你触发了 invalidate）。
          </p>
        </Section>

        {/* 4. From pipeline to website */}
        <Section title="04 · 从流水线到网站" eyebrow="一条命令，30 秒">
          <p>
            一期跑完之后，把它推到网站需要做的就是：
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-claude-dark p-5 text-[13px] leading-[1.65] text-claude-on-dark">
            <code>{`# 在仓库根目录
python tools/sync_to_db.py newsletter_runs/2026-05-02

#   → 读 verified_records.json / triage_decisions.json
#   → 派生 tags、计算 OpenAI text-embedding-3-small 向量
#   → 按 slug upsert 到 news_items（已有的更新、新的插入）
#   → 网站会立刻看到新一期内容（首页查 latest issue_date）`}</code>
          </pre>

          <p className="mt-6">
            想跳过 LLM 调用、纯刷一波 demo 数据：
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-claude-dark p-5 text-[13px] leading-[1.65] text-claude-on-dark">
            <code>{`python tools/seed_demo_data.py
#   → 生成 newsletter_runs/<today>/verified_records.json
#   → 自动调 sync_to_db.py 上库`}</code>
          </pre>
        </Section>

        {/* 5. Personalization layer */}
        <Section title="05 · 个性化是怎么发生的" eyebrow="三个时间点，三个动作">
          <ol className="space-y-3">
            <NumberedItem n={1} label="onboarding 完成时">
              你的回答会被合成一段「档案概述」，OpenAI 跑一次 embedding，写到{" "}
              <Code>user_profiles.profile_embedding</Code>。
            </NumberedItem>
            <NumberedItem n={2} label="每次首页加载时">
              先在 Postgres 里做便宜重排（cosine + tag），再交给 Claude Sonnet 智能重排。第一次会调一次 LLM，之后命中缓存直接返回。
            </NumberedItem>
            <NumberedItem n={3} label="每次保存 / 屏蔽 / 聊天时">
              动作写进 <Code>user_item_state</Code> 与{" "}
              <Code>memory_facts</Code> 。屏蔽某家公司 N 次以上，那家会进 dismissed_companies 自动降权。聊天里说出来的偏好（「我只在乎 coding agent」）会被后台抽成 fact 存下来供下次重排参考。
            </NumberedItem>
          </ol>
        </Section>

        <FooterNote />
      </div>
    </article>
  );
}

/* ---------- helpers ---------- */

async function loadStats() {
  try {
    const rows = await sqlClient<
      Array<{ total: number; main: number; latest: string | null }>
    >`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE item_tier = 'main')::int AS main,
        MAX(issue_date) AS latest
      FROM news_items
    `;
    return rows[0] ?? { total: 0, main: 0, latest: null };
  } catch {
    return { total: 0, main: 0, latest: null };
  }
}

function StatStrip({
  stats,
}: {
  stats: { total: number; main: number; latest: string | null };
}) {
  return (
    <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="本周主条目" value={String(stats.main)} unit="条" />
      <Stat label="累计入库" value={String(stats.total)} unit="条" />
      <Stat label="最新一期" value={stats.latest ?? "—"} />
      <Stat label="发布频率" value="每周一" />
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-hairline dark:bg-white/[0.04]">
      <p className="text-[12px] font-medium uppercase tracking-uc text-claude-muted">
        {label}
      </p>
      <p className="mt-2 font-display text-[28px] tracking-display text-claude-ink dark:text-white">
        {value}
        {unit && (
          <span className="ml-1 text-[14px] font-normal text-claude-muted">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16">
      {eyebrow && (
        <p className="text-[12px] font-medium uppercase tracking-uc text-claude-coral">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 font-display text-[28px] tracking-display text-claude-ink dark:text-white sm:text-[32px]">
        {title}
      </h2>
      <div className="mt-5 text-[16px] leading-[1.7] text-claude-body dark:text-white/85">
        {children}
      </div>
    </section>
  );
}

function PipelineStep({
  n,
  name,
  out,
  desc,
}: {
  n: number;
  name: string;
  out: string;
  desc: string;
}) {
  return (
    <li className="flex gap-4 rounded-md bg-white p-4 shadow-hairline dark:bg-white/[0.04]">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-claude-coral text-[12px] font-semibold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Code>{name}</Code>
          <span className="text-[12px] text-claude-muted">→ {out}</span>
        </div>
        <p className="mt-1 text-[15px] text-claude-body dark:text-white/85">
          {desc}
        </p>
      </div>
    </li>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[0.55em] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-claude-coral" />
      <span className="flex-1 leading-[1.65]">{children}</span>
    </li>
  );
}

function NumberedItem({
  n,
  label,
  children,
}: {
  n: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-claude-coral text-[13px] font-semibold text-white">
        {n}
      </span>
      <div className="flex-1">
        <p className="text-[15px] font-semibold text-claude-ink dark:text-white">
          {label}
        </p>
        <p className="mt-1 leading-[1.65] text-claude-body dark:text-white/85">
          {children}
        </p>
      </div>
    </li>
  );
}

function SchemaGroup({
  label,
  tables,
}: {
  label: string;
  tables: { name: string; purpose: string }[];
}) {
  return (
    <div className="mt-6">
      <p className="text-[12px] font-medium uppercase tracking-uc text-claude-muted">
        {label}
      </p>
      <ul className="mt-3 space-y-2">
        {tables.map((t) => (
          <li
            key={t.name}
            className="rounded-md bg-white p-4 shadow-hairline dark:bg-white/[0.04]"
          >
            <Code>{t.name}</Code>
            <p className="mt-1.5 text-[15px] leading-[1.6] text-claude-body dark:text-white/85">
              {t.purpose}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Aside({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg bg-claude-surface-soft p-5 text-[15px] leading-[1.6] text-claude-body-strong dark:bg-white/[0.04] dark:text-white/85">
      {children}
    </div>
  );
}

function FooterNote() {
  return (
    <div className="mt-20 border-t border-claude-hairline pt-8 text-[14px] text-claude-muted dark:border-white/10">
      想直接看代码？仓库里：
      <ul className="mt-2 space-y-1">
        <li>
          · 流水线：<Code>.claude/agents/</Code>
        </li>
        <li>
          · sync 脚本：<Code>tools/sync_to_db.py</Code>
        </li>
        <li>
          · 数据库 schema：<Code>web/lib/db/schema.ts</Code>
        </li>
        <li>
          · 个性化重排：<Code>web/lib/personalization/rerank.ts</Code>
        </li>
        <li>
          · Chat agent：<Code>web/lib/agent/</Code>
        </li>
      </ul>
      <p className="mt-6">
        <Link href="/" className="text-claude-coral hover:underline">
          ← 回首页看本周的内容
        </Link>
      </p>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-claude-surface-card px-1.5 py-0.5 font-mono text-[13px] text-claude-body-strong dark:bg-white/10 dark:text-white/90">
      {children}
    </code>
  );
}
