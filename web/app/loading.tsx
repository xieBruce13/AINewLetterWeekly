import { NewsCardSkeleton } from "@/components/news-card";

/**
 * Instant loading shell for `/`. Next.js mounts this immediately when
 * the user navigates here, before the (slow) personalized feed and LLM
 * rerank resolve. The skeleton matches the real layout closely so the
 * page doesn't visibly reflow on hand-off.
 */
export default function HomeLoading() {
  return (
    <>
      <section className="border-b border-claude-hairline dark:border-white/10">
        <div className="container-page py-14 sm:py-20">
          <div className="h-3 w-40 animate-pulse rounded bg-claude-surface-card" />
          <div className="mt-5 h-12 w-2/3 animate-pulse rounded bg-claude-surface-card sm:h-16" />
          <div className="mt-4 h-5 w-1/2 animate-pulse rounded bg-claude-surface-card" />
        </div>
      </section>

      <div className="container-page py-12">
        <div className="mb-14 rounded-xl border border-claude-hairline bg-white p-7 sm:p-9 dark:border-white/10 dark:bg-white/[0.03]">
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

        <div className="mb-6 h-7 w-32 animate-pulse rounded bg-claude-surface-card" />
        <div className="flex flex-col gap-6">
          {[0, 1, 2].map((i) => (
            <NewsCardSkeleton key={i} variant="wired" />
          ))}
        </div>
      </div>
    </>
  );
}
