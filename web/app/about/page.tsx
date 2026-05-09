import Link from "next/link";
import { sqlClient } from "@/lib/db/client";

// Dynamic — revalidate on every request so pipeline / PRD changes
// are visible immediately without waiting for cache expiry.
export const revalidate = 0;

export const metadata = {
  title: "如何运作 · ZenoNews",
  description:
    "ZenoNews 的编辑流水线、个性化机制、数据来源与成本参考。",
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
          如何运作
        </div>
        <h1 className="mt-4 max-w-3xl font-display text-[40px] leading-[1.1] tracking-display text-claude-ink dark:text-white sm:text-[52px]">
          这份周报是<span className="text-claude-coral">怎么做出来的</span>
        </h1>
        <p className="mt-5 max-w-3xl text-[18px] leading-[1.6] text-claude-body dark:text-white/80">
          上游是一条十步的多 agent 编辑流水线，把原始信号收敛成可追溯的结构化周报；
          下游是个性化阅读站，同一套入库数据按你的画像重排、生成解释，并支持对话。
        </p>

        <StatStrip stats={stats} />

        {/* 1. Pipeline */}
        <Section title="01 · 编辑流水线" eyebrow="10 步 · 专职 agent · 一步一产物">
          <p>
            流水线由{" "}
            <Code>newsletter-orchestrator</Code>{" "}
            按顺序调度，定义见{" "}
            <Code>skill/SKILL.md</Code>，角色提示在{" "}
            <Code>.claude/agents/</Code>。每一步只做一件事，把中间产物写进{" "}
            <Code>newsletter_runs/YYYY-MM-DD/</Code>{" "}
            ，下一步读取后继续。
          </p>

          <ol className="mt-6 space-y-3">
            <PipelineStep
              n={0}
              name="orchestrator"
              out="run_header.md"
              desc="范围锁定：时间窗、模块、语言、深度等写进本期 run header。"
            />
            <PipelineStep
              n={1}
              name="newsletter-collector"
              out="raw_*_records.json"
              desc="按 SKILL 规定的 Tier 扫信源（官方 changelog、技术信号、行业简报、社区）；候选带可点击 URL。"
            />
            <PipelineStep
              n={2}
              name="newsletter-filter"
              out="filtered_records.json"
              desc="按 rubric gate 预筛：明显不合格丢弃，边缘进 watchlist。"
            />
            <PipelineStep
              n={3}
              name="newsletter-normalizer"
              out="normalized_records.json"
              desc="按 record_schemas.json 展开：官方声明、第三方验证、社区反馈分字段存放。"
            />
            <PipelineStep
              n={4}
              name="newsletter-verifier"
              out="verified_records.json"
              desc="官方 claim 对一手出处；主条目从 Reddit 等取 2–4 条真实用户原话。"
            />
            <PipelineStep
              n={5}
              name="newsletter-scorer"
              out="scored_records.json"
              desc="按模块 rubric 各维度打分并写一句理由。"
            />
            <PipelineStep
              n={6}
              name="newsletter-triage"
              out="triage_decisions.json"
              desc="main / brief / drop 分档；多样性、初创 inclusion、编辑覆写。"
            />
            <PipelineStep
              n={7}
              name="newsletter-writer"
              out="newsletter_draft.md"
              desc="按 output_template 写成稿（用户引用译成中文等）。"
            />
            <PipelineStep
              n={8}
              name="newsletter-qa"
              out="PASS / 修订意见"
              desc="对照 SKILL 质检清单；不过则退回 writer。"
            />
            <PipelineStep
              n={9}
              name="newsletter-publisher"
              out="HTML / sync → Postgres"
              desc="排版、下图、转 HTML/PDF；运行 sync_to_db.py 把条目 upsert 到 news_items，网站立即可读。"
            />
          </ol>

          <p className="mt-6 text-claude-muted">
            每一档内容（官方声明 / 第三方验证 / 社区声音 / 编辑判断）在流程里分字段存放，
            不混写。最终由{" "}
            <Code>sync_to_db.py</Code>{" "}
            upsert 到 Postgres，网站立即可读。
          </p>
        </Section>

        {/* 2. Cadence */}
        <Section title="02 · 更新节奏" eyebrow="素材滚动 · 按需出刊 · 个性化实时">
          <ul className="space-y-3">
            <Bullet>
              <strong>素材窗口默认 7 天</strong>。
              每期扫描「过去 7 天」的信号，范围可在出刊前的范围锁定步骤（Step 0）按需调整。
            </Bullet>
            <Bullet>
              <strong>入库新鲜度由运行频率决定</strong>。
              可以每日跑一次{" "}
              <Code>ai_filter → sync_to_db</Code>
              {" "}保持数据库新鲜，也可以每周跑完整的多 agent 流水线后一次性入库——两种路径产物结构相同，不互斥。
            </Bullet>
            <Bullet>
              <strong>个性化实时计算</strong>。
              登录、改档案、保存或屏蔽一条，下次刷新首页都会按最新画像重排，不需要等下一期出刊。
            </Bullet>
            <Bullet>
              <strong>个性化候选追溯约 4 期</strong>。
              首页排序不只看当期，会从近 4 期内容里挑最贴合你画像的条目，避免「本期恰好没你关心的」时首页空洞。
            </Bullet>
          </ul>
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
            首页加载时先在 Postgres 里做一次「便宜重排」（profile 向量与条目的 cosine、标签重合、排除不感兴趣项与被屏蔽公司），取一批候选；再调用{" "}
            <strong>OpenAI</strong>（代码默认 <Code>gpt-4o-mini</Code>，可改为更强模型）生成每条的中文短摘要与「为何与你相关」的理由。结果缓存在{" "}
            <Code>user_item_state</Code>{" "}
            ；档案变更或显式失效后会重算。
          </p>
        </Section>

        {/* 4. From pipeline to website */}
        <Section title="04 · 从流水线到网站" eyebrow="一条命令同步">
          <p>
            一期流水线跑完后，把结果推到网站只需一步：
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-claude-dark p-5 text-[13px] leading-[1.65] text-claude-on-dark">
            <code>{`python tools/sync_to_db.py newsletter_runs/YYYY-MM-DD

# → 读取 verified_records.json / triage_decisions.json
# → 计算 text-embedding-3-small 向量
# → upsert 到 news_items（已有的更新，新的插入）
# → 首页立刻看到新一期内容`}</code>
          </pre>
          <p className="mt-5 text-claude-muted">
            这一步是「PDF / Markdown 周报」与「网站」之间唯一的桥梁。
            schema 字段有变化，只要 sync 脚本带过去，详情页立刻能用。
          </p>
        </Section>

        {/* 5. Personalization layer */}
        <Section title="05 · 个性化是怎么发生的" eyebrow="三个时间点，三个动作">
          <ol className="space-y-3">
            <NumberedItem n={1} label="onboarding 完成时">
              你的回答会被合成一段「档案概述」，OpenAI 跑一次 embedding，写到{" "}
              <Code>user_profiles.profile_embedding</Code>。
            </NumberedItem>
            <NumberedItem n={2} label="每次首页加载时">
              先在 Postgres 里做便宜重排（向量 + 标签），再交给 OpenAI（默认{" "}
              <Code>gpt-4o-mini</Code>
              ）写个性化文案。首次请求会调 LLM，之后命中{" "}
              <Code>user_item_state</Code> 缓存。
            </NumberedItem>
            <NumberedItem n={3} label="每次保存 / 屏蔽 / 聊天时">
              动作写进 <Code>user_item_state</Code> 与{" "}
              <Code>memory_facts</Code> 。屏蔽某家公司 N 次以上，那家会进 dismissed_companies 自动降权。聊天里说出来的偏好（「我只在乎 coding agent」）会被后台抽成 fact 存下来供下次重排参考。
            </NumberedItem>
          </ol>
        </Section>

        <Section title="06 · 数据来源" eyebrow="自动化 RSS + 人工深读">
          <ul className="space-y-3">
            <Bullet>
              <strong>程序化抓取</strong>：<Code>tools/sources.yaml</Code>{" "}
              是唯一配置源，当前接入约 54 条官方与媒体 RSS、11 个 Reddit 子版、Hacker News 前 500 条按分数过滤。增删信源只需改 YAML，不动 Python。
            </Bullet>
            <Bullet>
              <strong>深度出刊另补</strong>：TLDR AI、Import AI、Ben&apos;s Bites 等行业 Newsletter；Y Combinator 公司目录；Product Hunt AI 日榜；各产品官方 Release Notes。由编辑或 agent 按需浏览，不全部进 YAML。
            </Bullet>
            <Bullet>
              <strong>分层权重</strong>：官方源 +3 分 / 科技媒体 +1 分 / 社区 0 分（用帖子热度代替）。规则过滤在 AI 扩写之前完成，AI 只对「头部候选」做深度结构化。
            </Bullet>
            <Bullet>
              <strong>配图</strong>：卡片主视觉默认走{" "}
              <strong>Unsplash</strong> Search API；品牌标识使用各公司官方{" "}
              <strong>Logo</strong>，与 Unsplash 图并存。可选 OpenAI 图像 API 生成插画封面，成本另计。
            </Bullet>
          </ul>
        </Section>

        <Section title="07 · 模型与运营成本" eyebrow="OpenAI API · 示意非账单">
          <ul className="space-y-3">
            <Bullet>
              <strong>入库扩写</strong>：<Code>gpt-4.1</Code>（每期约 30 条，批量处理）
            </Bullet>
            <Bullet>
              <strong>向量</strong>：<Code>text-embedding-3-small</Code>（入库与检索共用）
            </Bullet>
            <Bullet>
              <strong>首页精排 / 聊天 / 记忆</strong>：默认{" "}
              <Code>gpt-4o-mini</Code>，可换成更强模型
            </Bullet>
          </ul>
          <Aside>
            <strong>参考预算（50 名活跃用户 · 日更入库）</strong>：对话与记忆用{" "}
            <Code>gpt-4o</Code>，首页精排用缓存 + mini 或改为周更，
            OpenAI 文本与向量账单建议控制在{" "}
            <strong>人民币 200–400 元 / 月</strong>（约 28–55 美元）。
            若每人每天用 <Code>gpt-4o</Code>{" "}
            做全量精排，账单会明显升高。完整算式见{" "}
            <Code>docs/Newsletter机制说明.md</Code> 第六章。
          </Aside>
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
      <Stat label="素材时间窗" value="7 天滚动" />
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
          · 产品说明文档：<Code>docs/Newsletter机制说明.md</Code>
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
