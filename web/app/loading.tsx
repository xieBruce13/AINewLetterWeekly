import { NewsCardSkeleton } from "@/components/news-card";

/**
 * Instant loading shell for `/`. Mirrors the new HomeShell — reading column
 * 75 %, Agent chat column 25 %. The week-highlights card sits at the top of
 * the reading column so the skeleton matches the same layout the resolved
 * page renders with.
 */
export default function HomeLoading() {
  return (
    <>
      {/* Toolbar */}
      <div className="border-b border-claude-hairline dark:border-white/10">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-5 py-3 sm:px-8">
          <div className="flex-1">
            <div className="h-3 w-32 animate-pulse rounded bg-claude-surface-card" />
            <div className="mt-1.5 h-5 w-2/3 max-w-md animate-pulse rounded bg-claude-surface-card" />
          </div>
          <div className="h-8 w-32 animate-pulse rounded bg-claude-surface-card" />
        </div>
      </div>

      {/* Split body — 3:1 (reading : chat) */}
      <div className="mx-auto w-full max-w-[1400px] lg:grid lg:grid-cols-[3fr_1fr] lg:gap-4">
        {/* Reading column — week highlights card + news cards */}
        <div className="px-5 py-6 sm:px-6">
          {/* Week highlights skeleton */}
          <div className="mb-14 rounded-xl border border-claude-hairline bg-white p-7 dark:border-white/10 dark:bg-white/[0.03] sm:p-9">
            <div className="h-3 w-32 animate-pulse rounded bg-claude-surface-card" />
            <div className="mt-3 h-7 w-3/4 animate-pulse rounded bg-claude-surface-card" />
            <div className="mt-6 space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-claude-surface-card" />
                  <div className="h-14 w-20 shrink-0 animate-pulse rounded-md bg-claude-surface-card" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-full animate-pulse rounded bg-claude-surface-card" />
                    <div className="h-4 w-2/3 animate-pulse rounded bg-claude-surface-card" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-5 h-7 w-24 animate-pulse rounded bg-claude-surface-card" />
          <div className="flex flex-col gap-5">
            {[0, 1, 2].map((i) => (
              <NewsCardSkeleton key={i} variant="wired" />
            ))}
          </div>
        </div>

        {/* Chat column */}
        <aside className="hidden border-l border-claude-hairline px-3 py-4 dark:border-white/10 lg:block">
          <div className="rounded-lg border border-claude-hairline bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="h-3 w-24 animate-pulse rounded bg-claude-surface-card" />
            <div className="mt-3 space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-9 w-full animate-pulse rounded-lg bg-claude-surface-card"
                />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
