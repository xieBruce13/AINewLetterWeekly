import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getItemBySlug, getUserItemState } from "@/lib/db/queries";
import { ItemActions } from "@/components/item-actions";
import { WhyShown } from "@/components/why-shown";
import { ArrowLeft, MessageSquare, ExternalLink } from "lucide-react";
import { storyDate } from "@/lib/utils";
import { moduleLabel } from "@/lib/modules";

export const dynamic = "force-dynamic";

/**
 * Long-read for one news item. Section order mirrors the printed newsletter
 * (`newsletter_runs/2026-04-19/newsletter_draft.md`):
 *
 *   1. Eyebrow + serif headline + meta (story date, not issue date)
 *   2. TLDR pill callout
 *   3. 核心定位 / 核心能力变化
 *   4. 谁会用、怎么用 (role-tagged scenarios)
 *   5. 商业模式与定价
 *   6. 落点 (landing notes — who is and isn't affected)
 *   7. 用户反馈 (好 / 坏 split)
 *   8. 真实引用 (block quotes with attribution)
 *   9. 信息分层 (官方声明 ｜ 外部验证 ｜ 社区反馈 ｜ 编辑判断)
 *  10. 编辑评分 + 参考来源
 *
 * Intentionally NOT rendered: `与我们的关系` and `我们要做的事`. These were
 * useful for an internal editorial team but felt navel-gazing to the
 * reader — dropped per editorial direction.
 */
export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) notFound();

  const session = await auth();
  const state = session?.user?.id
    ? await getUserItemState(session.user.id, item.id)
    : null;

  const rec = (item.record ?? {}) as Record<string, any>;

  // Prefer Chinese fields when available, fall back to English.
  const tldr =
    rec.summary_zh ||
    rec.one_line_judgment ||
    rec.tldr ||
    rec.summary ||
    item.headline ||
    item.name;
  const personalizedTitle =
    state?.personalizedBlurb ?? item.headline ?? item.name;

  const officialClaims = arr(rec.official_claims);
  const externalValidation = str(
    rec.external_zh ||
    rec.external_validation_summary ||
    rec.external_validation
  );
  const communityReaction = str(
    rec.community_zh ||
    rec.market_signal_strength ||
    rec.community_reaction ||
    rec.ecosystem_echo
  );
  const editorialJudgment = str(
    rec.judgment_zh ||
    rec.one_line_judgment ||
    rec.editor_judgment ||
    rec.summary
  );

  // Chinese key-points — can be a pre-formatted string OR an array of bullets.
  const keyPointsZhArr = Array.isArray(rec.key_points_zh)
    ? (rec.key_points_zh as string[]).filter(Boolean)
    : [];
  const keyPointsZh = keyPointsZhArr.length > 0 ? null : str(rec.key_points_zh);
  const relevanceZh = str(rec.relevance_zh);
  const judgmentZh = str(rec.judgment_zh);
  const whatItIsZh = str(rec.what_it_is_zh || rec.what_it_is);
  const sourceUrl: string | undefined =
    str(rec.source_url) ||
    (Array.isArray(rec.raw_urls) ? str(rec.raw_urls[0]) : undefined);
  const sourceName: string | undefined = str(rec.source_name);
  const scenariosZh = str(rec.scenarios_zh);
  const businessModelZh = str(rec.business_model_zh);
  const feedbackZh = str(rec.feedback_zh);
  const quotesZh = Array.isArray(rec.quotes_zh)
    ? (rec.quotes_zh as string[]).filter(Boolean)
    : [];

  const productHighlights = arr(rec.product_highlights);
  const keyFindings = arr(
    rec.real_change_notes
      ? [rec.real_change_notes]
      : rec.key_findings || []
  );

  const scenarios = arr(
    rec.user_scenarios || rec.new_use_cases || rec.scenarios
  );
  const feedback = rec.user_market_feedback || rec.market_feedback;
  const quotes = Array.isArray(rec.quotes) ? rec.quotes : [];

  return (
    <article className="bg-claude-canvas dark:bg-claude-dark">
      <div className="mx-auto w-full max-w-[1120px] px-5 py-10 sm:px-8 sm:py-16">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1 text-[13px] text-claude-coral hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回新闻首页
        </Link>

        {/* Header — full width */}
        <header className="border-b border-claude-hairline pb-10 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium uppercase tracking-uc text-claude-coral">
            <span>{moduleLabel(item.module)}</span>
            <Sep />
            <span className="normal-case tracking-normal text-claude-muted">
              {item.company}
            </span>
            <Sep />
            <span className="normal-case tracking-normal text-claude-muted">
              {storyDate(item.publishedAt, item.issueDate)}
            </span>
            {item.itemTier === "brief" && (
              <span className="ml-2 chip text-[10px] normal-case tracking-normal">
                简讯
              </span>
            )}
          </div>
          <h1 className="mt-5 font-display text-[36px] leading-[1.15] tracking-display text-claude-ink dark:text-white sm:text-[48px]">
            {personalizedTitle}
          </h1>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={`/chat?item=${item.id}`} className="btn-coral press">
              <MessageSquare className="h-4 w-4" />
              和 Agent 讨论这条
            </Link>
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-claude-hairline bg-white px-4 py-2.5 text-[14px] font-medium text-claude-ink transition-colors hover:border-claude-coral/40 hover:text-claude-coral dark:border-white/15 dark:bg-white/[0.04] dark:text-white/90"
              >
                <ExternalLink className="h-4 w-4" />
                阅读原文
              </a>
            )}
            {session?.user?.id && (
              <ItemActions
                itemId={item.id}
                state={
                  state
                    ? {
                        saved: state.saved,
                        dismissed: state.dismissed,
                        reaction: state.reaction,
                      }
                    : undefined
                }
              />
            )}
          </div>

          {/* Personalized relevance callout */}
          {relevanceZh && !state?.personalizedReason && (
            <div className="mt-6 flex items-start gap-2.5 rounded-lg bg-claude-coral/8 px-4 py-3">
              <span className="mt-0.5 text-[13px] text-claude-coral">▶</span>
              <p className="text-[14px] leading-[1.55] text-claude-body-strong dark:text-white/90">
                {relevanceZh}
              </p>
            </div>
          )}

          {state?.personalizedReason && (
            <div className="mt-6">
              <WhyShown reason={state.personalizedReason} />
            </div>
          )}
        </header>

        {/* Two-column grid: wide main content + sticky sidebar */}
        <div className="mt-10 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[1fr_320px]">

          {/* ── LEFT: main article ── */}
          <div className="min-w-0">

            {/* TLDR */}
            <section className="rounded-lg bg-claude-surface-soft p-6 dark:bg-white/[0.04]">
              <p className="text-[12px] font-semibold uppercase tracking-uc text-claude-coral">
                TL;DR
              </p>
              <p className="mt-3 font-display text-[22px] leading-[1.35] tracking-display text-claude-ink dark:text-white sm:text-[26px]">
                {tldr}
              </p>
            </section>

        {/* 这是什么? */}
        {whatItIsZh && (
          <section className="mt-8 border-l-4 border-claude-coral pl-5">
            <p className="text-[12px] font-semibold uppercase tracking-uc text-claude-coral">
              {item.name} 是什么
            </p>
            <p className="prose-cjk mt-2 text-[16px] text-claude-body-strong dark:text-white/90">
              {whatItIsZh}
            </p>
          </section>
        )}

        {/* 核心定位 / 核心能力变化 — prefer Chinese key_points_zh block */}
        {(keyPointsZhArr.length > 0 ||
          keyPointsZh ||
          rec.core_positioning ||
          rec.problem_it_solves ||
          rec.real_change_notes ||
          officialClaims.length > 0 ||
          productHighlights.length > 0 ||
          rec.workflow_change ||
          rec.access_barrier_change) && (
          <Section title={item.module === "model" ? "核心能力变化" : "核心定位"}>
            {keyPointsZhArr.length > 0 ? (
              <ul className="space-y-2 mt-1">
                {keyPointsZhArr.map((pt, i) => (
                  <li key={i} className="flex gap-2.5 text-[16px] leading-[1.65] text-claude-body dark:text-white/85">
                    <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-claude-coral" />
                    {pt}
                  </li>
                ))}
              </ul>
            ) : keyPointsZh ? (
              <BulletText text={keyPointsZh} />
            ) : (
              <>
                {rec.core_positioning && (
                  <p className="text-[17px] leading-[1.65] text-claude-body-strong dark:text-white/90">
                    {rec.core_positioning}
                  </p>
                )}
                {rec.problem_it_solves && (
                  <KV label="解决的问题" value={rec.problem_it_solves} />
                )}
                {item.module !== "model" && rec.workflow_change && (
                  <KV label="工作流改变" value={rec.workflow_change} />
                )}
                {item.module !== "model" && rec.access_barrier_change && (
                  <KV label="门槛变化" value={rec.access_barrier_change} />
                )}
                {(officialClaims.length > 0 || productHighlights.length > 0) && (
                  <>
                    <Subhead>
                      {item.module === "model" ? "关键发现" : "产品重点"}
                    </Subhead>
                    <Bulleted
                      items={
                        item.module === "model" ? officialClaims : productHighlights
                      }
                    />
                  </>
                )}
                {item.module === "model" && rec.real_change_notes && (
                  <p className="mt-5 text-[16px] leading-[1.65] text-claude-body dark:text-white/85">
                    {rec.real_change_notes}
                  </p>
                )}
              </>
            )}
          </Section>
        )}

        {/* 谁会用、怎么用 */}
        {(scenariosZh || scenarios.length > 0) && (
          <Section title="谁会用、怎么用">
            {scenariosZh ? (
              <p className="prose-cjk text-[16px] leading-[1.65] text-claude-body dark:text-white/85">
                {scenariosZh}
              </p>
            ) : (
              <Bulleted items={scenarios} markdown />
            )}
          </Section>
        )}

        {/* 编辑判断 — from judgment_zh */}
        {judgmentZh && (
          <Section title="编辑判断">
            <div className="rounded-lg bg-claude-dark p-5 text-claude-on-dark">
              <p className="prose-cjk text-[15px] leading-[1.65]">{judgmentZh}</p>
            </div>
          </Section>
        )}

        {/* 商业模式与定价 — prefer Chinese business_model_zh */}
        {(businessModelZh ||
          rec.business_model ||
          rec.price_speed_cost_notes ||
          rec.app_api_workflow_notes) && (
          <Section title="商业模式与定价">
            {businessModelZh ? (
              <p className="text-[17px] leading-[1.65] text-claude-body-strong dark:text-white/90">
                {businessModelZh}
              </p>
            ) : (
              <>
                {rec.business_model && (
                  <p className="text-[17px] leading-[1.65] text-claude-body-strong dark:text-white/90">
                    {rec.business_model}
                  </p>
                )}
                {rec.price_speed_cost_notes && (
                  <KV label="价格 / 速度" value={rec.price_speed_cost_notes} />
                )}
                {rec.app_api_workflow_notes && (
                  <KV label="上线渠道" value={rec.app_api_workflow_notes} />
                )}
              </>
            )}
          </Section>
        )}

        {/* 落点 */}
        {rec.landing_notes && (
          <Section title="落点 — 谁受影响、谁不受影响">
            <p className="text-[16px] leading-[1.65] text-claude-body dark:text-white/85">
              {rec.landing_notes}
            </p>
          </Section>
        )}

        {/* 用户反馈 — prefer Chinese feedbackZh */}
        {feedbackZh ? (
          <Section title="用户反馈">
            <BulletText text={feedbackZh} />
          </Section>
        ) : (
          feedback && <FeedbackBlock feedback={feedback} />
        )}

        {/* 真实引用 — prefer Chinese quotes_zh, fallback to English */}
        {(quotesZh.length > 0 || quotes.length > 0) && (
          <Section title="真实引用">
            {quotesZh.length > 0 ? (
              <ul className="space-y-5">
                {quotesZh.map((q, i) => (
                  <li
                    key={i}
                    className="rounded-lg border-l-4 border-claude-coral bg-claude-surface-soft p-5 dark:bg-white/[0.04]"
                  >
                    <p className="prose-cjk text-[16px] leading-[1.65] text-claude-body-strong dark:text-white/95">
                      {q}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-5">
                {quotes.map((q: any, i: number) => (
                  <li
                    key={i}
                    className="rounded-lg border-l-4 border-claude-coral bg-claude-surface-soft p-5 dark:bg-white/[0.04]"
                  >
                    <p className="text-[16px] leading-[1.65] text-claude-body-strong dark:text-white/95">
                      「{q.text}」
                    </p>
                    <p className="mt-2 text-[13px] text-claude-muted">
                      — {q.author}
                      {q.source && (
                        <>
                          ，<span className="italic">{q.source}</span>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

          </div> {/* end left column */}

          {/* ── RIGHT: sticky sidebar ── */}
          <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">

            {/* Tags */}
            {item.tags.length > 0 && (
              <SideCard label="标签">
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {item.tags.map((t) => (
                    <span key={t} className="chip text-[11px]">{t}</span>
                  ))}
                </div>
              </SideCard>
            )}

            {/* 编辑评分 */}
            {rec.score_breakdown && (
              <SideCard label="编辑评分">
                <ScoreBreakdown breakdown={rec.score_breakdown} module={item.module} />
              </SideCard>
            )}

            {/* 信息分层 */}
            {(officialClaims.length > 0 || externalValidation || communityReaction || editorialJudgment) && (
              <SideCard label="信息分层">
                <div className="space-y-3">
                  {editorialJudgment && (
                    <div className="rounded-md bg-claude-dark p-3 text-claude-on-dark">
                      <p className="text-[10px] font-semibold uppercase tracking-uc text-claude-coral">编辑判断</p>
                      <p className="mt-1 text-[13px] leading-[1.55]">{editorialJudgment}</p>
                    </div>
                  )}
                  {externalValidation && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-uc text-claude-coral">外部验证</p>
                      <p className="mt-1 text-[13px] leading-[1.55] text-claude-body dark:text-white/85">{externalValidation}</p>
                    </div>
                  )}
                  {communityReaction && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-uc text-claude-coral">社区反馈</p>
                      <p className="mt-1 text-[13px] leading-[1.55] text-claude-body dark:text-white/85">{communityReaction}</p>
                    </div>
                  )}
                  {officialClaims.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-uc text-claude-coral">官方声明</p>
                      <ul className="mt-1 space-y-1">
                        {officialClaims.map((c, i) => (
                          <li key={i} className="flex gap-2 text-[13px] text-claude-body dark:text-white/85">
                            <span className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-claude-coral" />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </SideCard>
            )}

            {/* 参考来源 */}
            {(sourceUrl || (Array.isArray(rec.raw_urls) && rec.raw_urls.length > 0)) && (
              <SideCard label="参考来源">
                <ul className="space-y-2">
                  {(sourceUrl ? [sourceUrl] : rec.raw_urls as string[]).map((url: string) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="group inline-flex items-start gap-2 rounded-md border border-claude-hairline bg-claude-surface-soft px-3 py-2.5 text-[13px] transition-colors hover:border-claude-coral/40 hover:bg-white dark:border-white/10 dark:bg-white/[0.03]"
                      >
                        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-claude-coral" />
                        <span>
                          {sourceName && (
                            <span className="block font-medium text-claude-ink dark:text-white group-hover:text-claude-coral">
                              {sourceName}
                            </span>
                          )}
                          <span className="break-all text-[11px] text-claude-muted">{url}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </SideCard>
            )}

          </aside>
        </div>{/* end grid */}
      </div>
    </article>
  );
}

/* ---------- helpers ---------- */

/** Coerce any JSON value to a displayable string, or undefined if empty. */
function str(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.filter(Boolean).join(", ") || undefined;
  return undefined;
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

function Sep() {
  return (
    <span className="text-claude-muted-soft" aria-hidden>
      ·
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="mb-5 font-display text-[26px] tracking-display text-claude-ink dark:text-white">
        {title}
      </h2>
      <div className="text-[16px] leading-[1.65] text-claude-body dark:text-white/85">
        {children}
      </div>
    </section>
  );
}

function SideCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-claude-hairline bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-uc text-claude-coral">
        {label}
      </p>
      {children}
    </div>
  );
}

function Subhead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 mb-2 font-display text-[18px] text-claude-ink dark:text-white">
      {children}
    </h3>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-3">
      <span className="text-claude-ink dark:text-white">{label}：</span>
      <span className="text-claude-body dark:text-white/85">{value}</span>
    </p>
  );
}

/**
 * Renders bulleted list items. When `markdown=true`, recognises a leading
 * `**Label**:` and renders the label in bold (used for role-tagged scenarios
 * like `**软件工程师**：…`).
 */
function Bulleted({
  items,
  small = false,
  markdown = false,
}: {
  items: string[];
  small?: boolean;
  markdown?: boolean;
}) {
  return (
    <ul
      className={
        small
          ? "mt-2 space-y-2 text-[14px] text-claude-body dark:text-white/85"
          : "mt-3 space-y-3 text-[16px] text-claude-body dark:text-white/85"
      }
    >
      {items.map((c, i) => {
        let label: string | null = null;
        let body = c;
        if (markdown) {
          const m = c.match(/^\*\*([^*]+)\*\*[：:]\s*(.*)$/s);
          if (m) {
            label = m[1];
            body = m[2];
          }
        }
        return (
          <li key={i} className="flex gap-3">
            <span className="mt-[0.55em] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-claude-coral" />
            <span className="flex-1 leading-[1.65]">
              {label && (
                <strong className="font-semibold text-claude-ink dark:text-white">
                  {label}：
                </strong>
              )}
              {body}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Quadrant({
  label,
  emphasis = false,
  children,
}: {
  label: string;
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        emphasis
          ? "rounded-lg bg-claude-dark p-5 text-claude-on-dark"
          : "rounded-lg bg-white p-5 shadow-hairline dark:bg-white/[0.04]"
      }
    >
      <p className="text-[12px] font-semibold uppercase tracking-uc text-claude-coral">
        {label}
      </p>
      <div
        className={
          emphasis
            ? "mt-2 text-[15px] leading-[1.55] text-claude-on-dark"
            : "mt-2 text-[15px] leading-[1.55] text-claude-body dark:text-white/85"
        }
      >
        {children}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-claude-muted-soft dark:text-white/40">
      {children}
    </span>
  );
}

/**
 * Renders a freeform Chinese bullet-text block from the newsletter draft.
 * Splits on ● (newsletter bullet) and 好：/坏：（section headers).
 * Lines without ● are rendered as paragraphs.
 */
function BulletText({ text }: { text: string }) {
  const segments = text.split(/(?=●)/).filter(Boolean);
  if (segments.length <= 1) {
    // Plain paragraph — may contain inline ● markers
    const lines = text.split(/\s*●\s*/).filter(Boolean);
    if (lines.length <= 1) {
      return (
        <p className="prose-cjk text-[17px] leading-[1.65] text-claude-body-strong dark:text-white/90">
          {text}
        </p>
      );
    }
    return (
      <ul className="mt-3 space-y-3 text-[16px] text-claude-body dark:text-white/85">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-[0.55em] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-claude-coral" />
            <span className="prose-cjk flex-1 leading-[1.65]">{line.trim()}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="mt-3 space-y-3 text-[16px] text-claude-body dark:text-white/85">
      {segments.map((seg, i) => {
        const line = seg.replace(/^●\s*/, "").trim();
        return (
          <li key={i} className="flex gap-3">
            <span className="mt-[0.55em] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-claude-coral" />
            <span className="prose-cjk flex-1 leading-[1.65]">{line}</span>
          </li>
        );
      })}
    </ul>
  );
}

function FeedbackBlock({
  feedback,
}: {
  feedback: { good?: string[]; bad?: string[] };
}) {
  const good = arr(feedback.good);
  const bad = arr(feedback.bad);
  if (good.length === 0 && bad.length === 0) return null;
  return (
    <Section title="用户反馈">
      <div className="grid gap-4 sm:grid-cols-2">
        {good.length > 0 && (
          <div className="rounded-lg bg-white p-5 shadow-hairline dark:bg-white/[0.04]">
            <p className="text-[12px] font-semibold uppercase tracking-uc text-claude-teal">
              好评
            </p>
            <ul className="mt-3 space-y-2 text-[15px]">
              {good.map((q, i) => (
                <li
                  key={i}
                  className="leading-[1.55] text-claude-body dark:text-white/85"
                >
                  「{q}」
                </li>
              ))}
            </ul>
          </div>
        )}
        {bad.length > 0 && (
          <div className="rounded-lg bg-white p-5 shadow-hairline dark:bg-white/[0.04]">
            <p className="text-[12px] font-semibold uppercase tracking-uc text-claude-coral">
              批评
            </p>
            <ul className="mt-3 space-y-2 text-[15px]">
              {bad.map((q, i) => (
                <li
                  key={i}
                  className="leading-[1.55] text-claude-body dark:text-white/85"
                >
                  「{q}」
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}

const SCORE_LABELS_MODEL: Record<string, string> = {
  real_capability_change: "真实能力变化",
  selection_impact: "选型影响",
  evidence_quality: "证据质量",
  ecosystem_echo: "生态联动",
  durability: "可持续性",
  hype_penalty: "炒作扣分",
  total: "总分",
};
const SCORE_LABELS_PRODUCT: Record<string, string> = {
  user_visibility: "用户可见度",
  access_barrier_change: "门槛变化",
  workflow_change: "工作流改变",
  distribution_change: "分发改变",
  user_reaction: "用户反应",
  relevance_to_our_direction: "与我们方向相关性",
  evidence_quality: "证据质量",
  hype_penalty: "炒作扣分",
  total: "总分",
};

function ScoreBreakdown({
  breakdown,
  module: m,
}: {
  breakdown: Record<string, number>;
  module: string;
}) {
  const labels = m === "model" ? SCORE_LABELS_MODEL : SCORE_LABELS_PRODUCT;
  const entries = Object.entries(breakdown).filter(
    ([k, v]) => k !== "total" && typeof v === "number"
  );
  const total = breakdown.total;
  return (
    <div className="overflow-hidden rounded-lg shadow-hairline">
      <table className="w-full text-[14px]">
        <tbody>
          {entries.map(([k, v]) => (
            <tr
              key={k}
              className="border-b border-claude-hairline last:border-0 dark:border-white/10"
            >
              <td className="px-4 py-2.5 text-claude-body dark:text-white/85">
                {labels[k] ?? k}
              </td>
              <td className="px-4 py-2.5 text-right font-medium tabular-nums text-claude-ink dark:text-white">
                {v > 0 ? `+${v}` : v}
              </td>
            </tr>
          ))}
          {typeof total === "number" && (
            <tr className="bg-claude-surface-soft dark:bg-white/[0.06]">
              <td className="px-4 py-3 font-semibold text-claude-ink dark:text-white">
                {labels.total}
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-claude-coral">
                {total}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
