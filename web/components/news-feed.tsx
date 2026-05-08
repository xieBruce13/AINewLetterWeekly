import Link from "next/link";
import { NewsCard, NewsCardSkeleton } from "@/components/news-card";
import {
  MODULE_BLURB,
  MODULE_LABEL_ZH,
  MODULES,
  isModule,
  type Module,
} from "@/lib/modules";
import type { ShellItem } from "@/components/home-shell";
import { cn } from "@/lib/utils";

/**
 * Server-rendered news feed. Pulled out of HomeShell so the home page can
 * stream it in behind a `<Suspense>` while the rest of the shell (toolbar,
 * week highlights, chat panel) ships immediately. Pure layout — no hooks,
 * safe to render on the server.
 */
export function NewsFeed({
  items,
  focusModule,
}: {
  items: ShellItem[];
  focusModule: Module | null;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg bg-white p-12 text-center text-claude-muted shadow-hairline dark:bg-white/[0.04]">
        本周没有匹配你偏好的内容。可以去
        <Link
          href="/onboarding"
          className="ml-1 text-claude-coral underline"
        >
          扩大关注话题
        </Link>
        。
      </p>
    );
  }

  if (focusModule) {
    return <SingleModuleView module={focusModule} items={items} />;
  }
  return <ModuleSections items={items} />;
}

/**
 * Skeleton matching the layout of `<NewsFeed>` — used as the Suspense
 * fallback while the personalized rerank is in flight.
 */
export function NewsFeedSkeleton() {
  return (
    <div className="space-y-12">
      {[0, 1].map((g) => (
        <section key={g}>
          <div className="mb-5">
            <div className="h-6 w-24 animate-pulse rounded bg-claude-surface-card" />
            <div className="mt-2 h-4 w-2/3 max-w-md animate-pulse rounded bg-claude-surface-card" />
          </div>
          <div className="flex flex-col gap-5">
            {[0, 1].map((i) => (
              <NewsCardSkeleton key={i} variant="wired" />
            ))}
          </div>
        </section>
      ))}
    </div>
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
    <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h2 className="font-display text-[24px] tracking-display text-claude-ink dark:text-white sm:text-[26px]">
          {label}
          {typeof count === "number" && (
            <span className="ml-3 text-[14px] font-normal text-claude-muted">
              {count} 条
            </span>
          )}
        </h2>
        {blurb && (
          <p className="mt-1 max-w-2xl text-[13.5px] text-claude-muted">
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

function ModuleSections({ items }: { items: ShellItem[] }) {
  const grouped: Record<Module, ShellItem[]> = {
    model: [],
    product: [],
    operation: [],
  };
  for (const it of items) if (isModule(it.module)) grouped[it.module].push(it);

  return (
    <div className="space-y-12">
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
            <div className={cn("flex flex-col gap-5")}>
              {list.map((item, i) => (
                <NewsCard
                  key={item.id}
                  rank={i}
                  item={item}
                  personalizedBlurb={item.personalizedBlurb}
                  personalizedReason={item.personalizedReason}
                  state={item.state}
                  variant="wired"
                />
              ))}
            </div>
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
  items: ShellItem[];
}) {
  return (
    <section>
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1 text-[13px] text-claude-coral hover:underline"
      >
        ← 返回全部模块
      </Link>
      <SectionHeader
        label={MODULE_LABEL_ZH[m]}
        blurb={MODULE_BLURB[m]}
        count={items.length}
      />
      <div className="flex flex-col gap-5">
        {items.map((item, i) => (
          <NewsCard
            key={item.id}
            rank={i}
            item={item}
            personalizedBlurb={item.personalizedBlurb}
            personalizedReason={item.personalizedReason}
            state={item.state}
            variant="wired"
          />
        ))}
      </div>
    </section>
  );
}
