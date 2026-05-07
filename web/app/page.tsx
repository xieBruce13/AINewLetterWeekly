import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getAnonymousFeed,
  getIssueSlugs,
  getIssueSummary,
  getLatestIssueDate,
  getProfile,
} from "@/lib/db/queries";
import { getPersonalizedFeed } from "@/lib/personalization/rerank";
import { NewsCard } from "@/components/news-card";
import { formatIssueDate } from "@/lib/utils";
import {
  MODULE_BLURB,
  MODULE_LABEL_ZH,
  MODULES,
  type Module,
  isModule,
} from "@/lib/modules";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

interface SearchParams {
  module?: string;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  const issueDate = await getLatestIssueDate();
  const sp = await searchParams;
  const focusModule: Module | null = isModule(sp.module) ? sp.module : null;

  if (!issueDate) return <EmptyIssue />;

  // Pull the summary AND the set of slugs that actually exist for this
  // issue. Bullets get their slug list filtered to live items only —
  // if a record was dropped by the validator, its bullet still renders
  // (text is intact), it just stops trying to link to a 404.
  const [rawSummary, validSlugs] = await Promise.all([
    getIssueSummary(issueDate),
    getIssueSlugs(issueDate),
  ]);
  const summary = rawSummary
    ? {
        ...rawSummary,
        bullets: (rawSummary.bullets ?? []).map((b) => ({
          ...b,
          slugs: (b.slugs ?? []).filter((s) => validSlugs.has(s)),
        })),
      }
    : null;

  // Anonymous landing — quiet hero + week summary + 6-card preview + CTA.
  if (!session?.user?.id) {
    const items = await getAnonymousFeed(issueDate, 6);
    return (
      <>
        <Hero issueDate={issueDate} signedIn={false} />
        <div className="container-page py-12">
          {summary && <WeekSummary summary={summary} />}
          <SectionHeader
            label="本周编辑精选"
            blurb="登录后，同样的新闻会按你的角色重写。"
          />
          <CardGrid>
            {items.map((item, i) => (
              <NewsCard
                key={item.id}
                rank={i}
                item={item}
                personalizedBlurb={item.headline}
                personalizedReason="登录后可以看到这条新闻为何对你重要。"
              />
            ))}
          </CardGrid>
          <SignInBanner />
        </div>
      </>
    );
  }

  const profile = await getProfile(session.user.id);
  if (!profile?.onboardedAt) redirect("/onboarding");

  const ranked = await getPersonalizedFeed(session.user.id, issueDate);
  const visibleAll = ranked.filter((r) => !r.state?.dismissed);
  const sourceList = visibleAll.length > 0 ? visibleAll : ranked;
  const display = focusModule
    ? sourceList.filter((r) => r.module === focusModule)
    : sourceList;

  return (
    <>
      <Hero
        issueDate={issueDate}
        signedIn
        profileSnippet={
          profile.role
            ? `${profile.role}${profile.company ? `，${profile.company}` : ""}`
            : undefined
        }
        focusModule={focusModule}
      />
      <div className="container-page pb-24 pt-10">
        {summary && !focusModule && <WeekSummary summary={summary} />}
        {display.length === 0 ? (
          <p className="rounded-lg bg-white p-12 text-center text-claude-muted shadow-hairline">
            本周没有匹配你偏好的内容。可以去
            <Link
              href="/onboarding"
              className="ml-1 text-claude-coral underline"
            >
              扩大关注话题
            </Link>
            。
          </p>
        ) : focusModule ? (
          <SingleModuleView module={focusModule} items={display} />
        ) : (
          <ModuleSections items={display} />
        )}
      </div>
    </>
  );
}

/* ---------- subcomponents ---------- */

function EmptyIssue() {
  return (
    <div className="container-tight py-24 text-center">
      <h1 className="font-display text-display-md text-claude-ink dark:text-white">
        还没有任何一期内容
      </h1>
      <p className="mt-4 text-claude-body dark:text-white/70">
        请先在仓库根目录跑{" "}
        <code className="rounded bg-claude-surface-card px-1.5 py-0.5 font-mono text-[13px]">
          python tools/seed_demo_data.py
        </code>{" "}
        写入一期 demo 数据。
      </p>
    </div>
  );
}

function Hero({
  issueDate,
  signedIn,
  profileSnippet,
  focusModule,
}: {
  issueDate: string;
  signedIn: boolean;
  profileSnippet?: string;
  focusModule?: Module | null;
}) {
  return (
    <section className="border-b border-claude-hairline dark:border-white/10">
      <div className="container-page py-14 sm:py-20">
        <div className="text-[12px] font-medium uppercase tracking-uc text-claude-coral">
          AI 周报 · {formatIssueDate(issueDate)}
        </div>
        <h1 className="mt-4 max-w-3xl font-display text-[40px] leading-[1.1] tracking-display text-claude-ink dark:text-white sm:text-[56px]">
          {focusModule ? (
            <>
              本周{MODULE_LABEL_ZH[focusModule]}层
              <span className="text-claude-coral">的关键变化</span>
            </>
          ) : signedIn ? (
            <>
              这一周的 AI，<span className="text-claude-coral">为你而写</span>
            </>
          ) : (
            <>
              这一周的 AI，<span className="text-claude-coral">为你而写</span>
            </>
          )}
        </h1>
        {signedIn && profileSnippet && (
          <p className="mt-4 max-w-2xl text-[18px] text-claude-body dark:text-white/70">
            以「{profileSnippet}」的视角重排和改写。
          </p>
        )}
        {!signedIn && (
          <p className="mt-4 max-w-2xl text-[18px] text-claude-body dark:text-white/70">
            同一份编辑流水线、同一套编辑判断 ——
            但每一条标题都按你的角色与当前在做的事重新讲一遍。
          </p>
        )}
      </div>
    </section>
  );
}

function SectionHeader({
  label,
  blurb,
  count,
  focusHref,
}: {
  label: string;
  blurb?: string;
  count?: number;
  focusHref?: string;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h2 className="font-display text-[28px] tracking-display text-claude-ink dark:text-white">
          {label}
          {typeof count === "number" && (
            <span className="ml-3 text-[14px] font-normal text-claude-muted">
              {count} 条
            </span>
          )}
        </h2>
        {blurb && (
          <p className="mt-1 max-w-2xl text-[14px] text-claude-muted">
            {blurb}
          </p>
        )}
      </div>
      {focusHref && (
        <Link
          href={focusHref}
          className="text-[13px] font-medium text-claude-coral hover:underline"
        >
          只看这个模块 →
        </Link>
      )}
    </header>
  );
}

/**
 * Top-of-page bullet strip — 1 theme line + 3-5 short takeaways. Sits above
 * the module sections so a returning reader can scan the whole week in
 * 30 seconds without reading any cards.
 *
 * Each bullet is `{ text, slugs }`. The whole bullet card is a Link to the
 * primary slug (slugs[0]); secondary slugs render as small inline chips so
 * the reader can jump straight to the supporting items.
 *
 * `text` supports a single `**bold**:` lead-in to give each takeaway a
 * 2-4 word headline before the explanation.
 */
function WeekSummary({
  summary,
}: {
  summary: { theme: string; bullets: { text: string; slugs?: string[] }[] };
}) {
  const bullets = summary.bullets ?? [];
  if (bullets.length === 0) return null;
  return (
    <section
      aria-label="本周要点"
      className="mb-14 rounded-xl border border-claude-hairline bg-white p-7 sm:p-9 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <p className="text-[12px] font-semibold uppercase tracking-uc text-claude-coral">
        本周要点 · 30 秒看完
      </p>
      <p className="prose-cjk mt-3 font-display text-[22px] leading-[1.35] tracking-display text-claude-ink dark:text-white sm:text-[26px]">
        {summary.theme}
      </p>
      <ul className="mt-6 space-y-2.5">
        {bullets.map((b, i) => (
          <SummaryBullet key={i} index={i} bullet={b} />
        ))}
      </ul>
    </section>
  );
}

function SummaryBullet({
  index,
  bullet,
}: {
  index: number;
  bullet: { text: string; slugs?: string[] };
}) {
  const slugs = bullet.slugs ?? [];
  const primary = slugs[0];
  const secondary = slugs.slice(1);
  const m = bullet.text.match(/^\*\*([^*]+)\*\*[：:]?\s*(.*)$/s);
  const lead = m?.[1] ?? null;
  const body = m?.[2] ?? bullet.text;

  // Two-zone layout: the headline + body wrap into a single <Link> (the
  // primary jump target). Secondary chips live OUTSIDE that link as their
  // own <Link>s — anchors can't nest.
  const headline = (
    <p className="prose-cjk text-[15.5px] text-claude-body dark:text-white/85">
      {lead && (
        <span className="font-semibold text-claude-ink dark:text-white group-hover:text-claude-coral">
          {lead}：
        </span>
      )}
      {body}
      {primary && (
        <ArrowRight className="ml-1 inline h-3.5 w-3.5 align-text-bottom text-claude-muted-soft transition-colors group-hover:text-claude-coral" />
      )}
    </p>
  );

  return (
    <li className="-mx-2 rounded-lg px-2 py-2 transition-colors hover:bg-claude-surface-soft dark:hover:bg-white/[0.04]">
      <div className="flex gap-4">
        <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-claude-coral/10 text-[12px] font-semibold text-claude-coral">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          {primary ? (
            <Link
              href={`/items/${primary}`}
              className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-coral/30 rounded"
            >
              {headline}
            </Link>
          ) : (
            headline
          )}
          {secondary.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-claude-muted">
              <span className="text-claude-muted-soft">相关条目</span>
              {secondary.map((s) => (
                <Link
                  key={s}
                  href={`/items/${s}`}
                  className="chip text-[11px] hover:text-claude-coral"
                >
                  {prettySlug(s)}
                </Link>
              ))}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

/** Fallback chip label for a slug — strips the date prefix and prettifies. */
function prettySlug(slug: string): string {
  return slug.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " ");
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid auto-rows-fr grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

type Item = Awaited<ReturnType<typeof getPersonalizedFeed>>[number];

function ModuleSections({ items }: { items: Item[] }) {
  const grouped: Record<Module, Item[]> = {
    model: [],
    product: [],
    operation: [],
  };
  for (const it of items) if (isModule(it.module)) grouped[it.module].push(it);

  return (
    <div className="space-y-16">
      {MODULES.map((m) => {
        const list = grouped[m];
        if (list.length === 0) return null;
        return (
          <section key={m} aria-labelledby={`mod-${m}`}>
            <SectionHeader
              label={MODULE_LABEL_ZH[m]}
              blurb={MODULE_BLURB[m]}
              count={list.length}
              focusHref={`/?module=${m}`}
            />
            <CardGrid>
              {list.map((item, i) => (
                <NewsCard
                  key={item.id}
                  rank={i}
                  item={item}
                  personalizedBlurb={item.personalizedBlurb}
                  personalizedReason={item.personalizedReason}
                  state={item.state}
                />
              ))}
            </CardGrid>
          </section>
        );
      })}
    </div>
  );
}

function SingleModuleView({
  module: m,
  items,
}: {
  module: Module;
  items: Item[];
}) {
  return (
    <section>
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-[13px] text-claude-coral hover:underline"
      >
        ← 返回全部模块
      </Link>
      <SectionHeader
        label={MODULE_LABEL_ZH[m]}
        blurb={MODULE_BLURB[m]}
        count={items.length}
      />
      <CardGrid>
        {items.map((item, i) => (
          <NewsCard
            key={item.id}
            rank={i}
            item={item}
            personalizedBlurb={item.personalizedBlurb}
            personalizedReason={item.personalizedReason}
            state={item.state}
          />
        ))}
      </CardGrid>
    </section>
  );
}

function SignInBanner() {
  return (
    <div className="mt-12 rounded-lg bg-claude-coral p-10 text-center text-white">
      <h3 className="font-display text-[28px] tracking-display text-white">
        让这份周报真正写给你
      </h3>
      <p className="mx-auto mt-2 max-w-xl text-white/85">
        告诉我们你的角色、所在团队、当前在做的项目 ——
        同样的新闻会以你能用得上的角度重写。
      </p>
      <Link
        href="/signin"
        className="mt-6 inline-flex h-10 items-center gap-1 rounded-md bg-white px-5 text-[14px] font-medium text-claude-coral-active hover:bg-white/95 press"
      >
        生成我的简报 <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
