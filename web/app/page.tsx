import { Suspense } from "react";
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
import { HomeShell, type ShellItem } from "@/components/home-shell";
import { NewsFeed, NewsFeedSkeleton } from "@/components/news-feed";
import { isModule, type Module } from "@/lib/modules";

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
    const items = await getAnonymousFeed(issueDate, 15).catch(
      () => [] as Awaited<ReturnType<typeof getAnonymousFeed>>
    );
    const anonFeed: ShellItem[] = items.map((item) => ({
      id: item.id,
      slug: item.slug,
      module: item.module,
      name: item.name,
      company: item.company,
      headline: item.headline,
      tags: item.tags ?? [],
      item_tier: item.itemTier,
      published_at: item.publishedAt,
      issue_date: item.issueDate,
      primary_image: item.primaryImage,
      image_urls: item.imageUrls,
      record: item.record as Record<string, unknown> | null,
      personalizedBlurb: "",
      personalizedReason: "",
    }));
    return (
      <HomeShell
        issueDate={issueDate}
        focusModule={focusModule}
        weekSummary={summary}
        weekSummaryThumbs={bulletThumbs}
        feed={anonFeed}
        feedContent={<NewsFeed items={anonFeed} focusModule={focusModule} />}
        isAnonymous={true}
      />
    );
  }

  const profile = await getProfile(session.user.id).catch(() => null);
  if (!profile?.onboardedAt) redirect("/onboarding");

  // Stream the personalized feed: the toolbar / week highlights / chat panel
  // ship immediately; the heavy LLM-rerank-driven `<NewsFeed>` arrives on a
  // separate flush so users aren't staring at the loading skeleton for 5–15s
  // while OpenAI generates Chinese blurbs. Cache hits resolve in <500 ms;
  // only the first visit per issue per user pays the LLM round-trip.
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
      feedContent={
        <Suspense fallback={<NewsFeedSkeleton />}>
          <PersonalizedFeedSection
            userId={session.user.id}
            issueDate={issueDate}
            focusModule={focusModule}
          />
        </Suspense>
      }
    />
  );
}

/**
 * Async server component that resolves the personalized feed. Wrapped in
 * `<Suspense>` by the home page so the rest of the shell doesn't block on
 * it. Errors fall through to an empty list — the user still sees the week
 * highlights and can chat with the agent while we recover.
 */
async function PersonalizedFeedSection({
  userId,
  issueDate,
  focusModule,
}: {
  userId: string;
  issueDate: string;
  focusModule: Module | null;
}) {
  let ranked: Awaited<ReturnType<typeof getPersonalizedFeed>> = [];
  try {
    ranked = await getPersonalizedFeed(userId, issueDate);
  } catch (err) {
    console.error(
      "[home] getPersonalizedFeed failed, rendering empty feed:",
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

  return <NewsFeed items={finalFeed} focusModule={focusModule} />;
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
