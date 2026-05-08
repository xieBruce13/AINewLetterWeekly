/**
 * Skeleton shown while a news item's data is fetched. Matches the live
 * detail page's structure so the layout doesn't reflow when content
 * lands.
 */
export default function ItemLoading() {
  return (
    <article className="bg-claude-canvas dark:bg-claude-dark">
      <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 sm:py-16 lg:px-12">
        <div className="mb-8 h-3.5 w-32 animate-pulse rounded bg-claude-surface-card" />

        <div className="mb-8 aspect-[16/9] w-full max-w-[50rem] animate-pulse rounded-xl bg-claude-surface-card sm:aspect-[2/1]" />

        <div className="border-b border-claude-hairline pb-10 dark:border-white/10">
          <div className="flex gap-2">
            <div className="h-3 w-20 animate-pulse rounded bg-claude-surface-card" />
            <div className="h-3 w-16 animate-pulse rounded bg-claude-surface-card" />
          </div>
          <div className="mt-5 space-y-3">
            <div className="h-10 w-full animate-pulse rounded bg-claude-surface-card sm:h-12" />
            <div className="h-10 w-3/4 animate-pulse rounded bg-claude-surface-card sm:h-12" />
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px] xl:gap-x-14">
          <div className="min-w-0 max-w-[46rem] space-y-6 xl:max-w-[50rem]">
            <div className="rounded-lg bg-claude-surface-soft p-6 dark:bg-white/[0.04]">
              <div className="h-3 w-12 animate-pulse rounded bg-claude-surface-card" />
              <div className="mt-3 h-7 w-full animate-pulse rounded bg-claude-surface-card" />
              <div className="mt-2 h-7 w-2/3 animate-pulse rounded bg-claude-surface-card" />
            </div>
            <div className="space-y-2">
              <div className="h-5 w-32 animate-pulse rounded bg-claude-surface-card" />
              <div className="h-4 w-full animate-pulse rounded bg-claude-surface-card" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-claude-surface-card" />
            </div>
          </div>
          <aside className="space-y-4">
            <div className="h-32 animate-pulse rounded-xl bg-claude-surface-card" />
            <div className="h-40 animate-pulse rounded-xl bg-claude-surface-card" />
          </aside>
        </div>
      </div>
    </article>
  );
}
