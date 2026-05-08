import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getAnonymousFeed,
  getIssueSlugs,
  getIssueSummary,
  getItemThumbsBySlug,
  getLatestIssueDate,
  getProfile,
} from "@/lib/db/queries";
import { getPersonalizedFeed } from "@/lib/personalization/rerank";
import { NewsCard } from "@/components/news-card";
import { HomeShell, type ShellItem } from "@/components/home-shell";
import { formatIssueDate } from "@/lib/utils";
import { isModule, type Module } from "@/lib/modules";
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
  // The DB might be unreachable in dev (local Postgres down) or wedged for
  // a moment in prod. Catch every read so the home page always renders
  // *something* instead of bubbling up the global error boundary.
  const issueDate = await getLatestIssueDate().catch(() => null);
  const sp = await searchParams;
  const focusModule: Module | null = isModule(sp.module) ? sp.module : null;

  if (!issueDate) return <EmptyIssue />;

  // Pull the summary AND the set of slugs that actually exist for this
  // issue. Bullets get their slug list filtered to live items only —
  // dropped records still render their bullet text but stop linking to 404s.
  const [rawSummary, validSlugs] = await Promise.all([
    getIssueSummary(issueDate).catch(() => null),
    getIssueSlugs(issueDate).catch(() => new Set<string>()),
  ]);
  // Cap bullets to the top 3 most-important takeaways. The LLM ranks them
  // by importance when generating, so we just take the head.
  const summary = rawSummary
    ? {
        ...rawSummary,
        bullets: (rawSummary.bullets ?? [])
          .map((b) => ({
            ...b,
            slugs: (b.slugs ?? []).filter((s) => validSlugs.has(s)),
          }))
          .slice(0, 3),
      }
    : null;

  // Resolve thumbnails for each bullet's primary slug so the chat-side
  // WeekHighlightsCard can render them inline. We pass a plain object
  // (not a Map) since this crosses the server→client component boundary.
  const bulletPrimarySlugs = (summary?.bullets ?? [])
    .map((b) => (b.slugs ?? [])[0])
    .filter((s): s is string => !!s);
  const thumbMap = await getItemThumbsBySlug(bulletPrimarySlugs).catch(
    () => new Map()
  );
  const bulletThumbs: Record<
    string,
    { primaryImage: string | null; company: string; name: string }
  > = {};
  for (const [slug, thumb] of thumbMap.entries()) bulletThumbs[slug] = thumb;

  /* ---------------- Anonymous landing ---------------- */
  if (!session?.user?.id) {
    const items = await getAnonymousFeed(issueDate, 6).catch(
      () => [] as Awaited<ReturnType<typeof getAnonymousFeed>>
    );
    return (
      <>
        <Hero issueDate={issueDate} signedIn={false} />
        <div className="container-page py-12">
          <CardGrid>
            {items.map((item, i) => (
              <NewsCard
                key={item.id}
                rank={i}
                item={item}
                personalizedBlurb=""
                personalizedReason="登录后可以看到这条新闻为何对你重要。"
                variant="compact"
              />
            ))}
          </CardGrid>
          <SignInBanner />
        </div>
      </>
    );
  }

  const profile = await getProfile(session.user.id).catch(() => null);
  if (!profile?.onboardedAt) redirect("/onboarding");

  // The personalized rerank can fail in production (LLM hiccup, DB cache,
  // null embedding column, etc.). Don't let any of that take down the home
  // page — degrade to the anonymous feed instead.
  let ranked: Awaited<ReturnType<typeof getPersonalizedFeed>> = [];
  try {
    ranked = await getPersonalizedFeed(session.user.id, issueDate);
  } catch (err) {
    console.error(
      "[home] getPersonalizedFeed failed, falling back to anonymous feed:",
      err
    );
  }

  const visibleRanked = ranked.filter((r) => !r.state?.dismissed);
  const feed: ShellItem[] = visibleRanked.map(toShellItemFromRanked);

  // If the user is filtering to one module, only pass items in that module.
  // Fall back to the full list if the filter would otherwise empty the feed.
  const filtered = focusModule
    ? feed.filter((r) => isModule(r.module) && r.module === focusModule)
    : feed;
  const finalFeed = filtered.length > 0 ? filtered : feed;

  return (
    <HomeShell
      issueDate={issueDate}
      profileSnippet={
        profile.role
          ? `${profile.role}${profile.company ? `，${profile.company}` : ""}`
          : undefined
      }
      focusModule={focusModule}
      weekSummary={summary}
      weekSummaryThumbs={bulletThumbs}
      focusTopics={profile.focusTopics ?? []}
      forRole={profile.role ?? undefined}
      feed={finalFeed}
    />
  );
}

/* ---------------- helpers / subcomponents ---------------- */

/** Shape the LLM-ranked personalized item into the shell's card schema. */
function toShellItemFromRanked(
  r: Awaited<ReturnType<typeof getPersonalizedFeed>>[number]
): ShellItem {
  return {
    id: r.id,
    slug: r.slug,
    module: r.module,
    name: r.name,
    company: r.company,
    headline: r.headline,
    tags: r.tags,
    item_tier: r.item_tier,
    published_at: r.published_at,
    issue_date: r.issue_date,
    primary_image: r.primary_image,
    image_urls: r.image_urls,
    record: r.record as Record<string, unknown> | null,
    personalizedBlurb: r.personalizedBlurb,
    personalizedReason: r.personalizedReason,
    state: r.state,
  };
}

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
}: {
  issueDate: string;
  signedIn: boolean;
}) {
  return (
    <section className="border-b border-claude-hairline dark:border-white/10">
      <div className="container-page py-14 sm:py-20">
        <div className="text-[12px] font-medium uppercase tracking-uc text-claude-coral">
          ZenoNews · {formatIssueDate(issueDate)}
        </div>
        <h1 className="mt-4 max-w-3xl font-display text-[40px] leading-[1.1] tracking-display text-claude-ink dark:text-white sm:text-[56px]">
          这一周的 AI，<span className="text-claude-coral">为你而写</span>
        </h1>
        {!signedIn && (
          <p className="mt-4 max-w-2xl text-[18px] text-claude-body dark:text-white/70">
            同一份编辑流水线、同一套 Zeno判断 ——
            但每一条标题都按你的角色与当前在做的事重新讲一遍。
          </p>
        )}
      </div>
    </section>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid auto-rows-fr grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
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
        className="press mt-6 inline-flex h-10 items-center gap-1 rounded-md bg-white px-5 text-[14px] font-medium text-claude-coral-active hover:bg-white/95"
      >
        生成我的简报 <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
