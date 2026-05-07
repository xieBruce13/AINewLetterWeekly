import Link from "next/link";
import { ArrowRight, MessageSquare } from "lucide-react";
import { ItemActions } from "./item-actions";
import { WhyShown } from "./why-shown";
import { moduleLabel } from "@/lib/modules";
import { cn, storyDate } from "@/lib/utils";

interface NewsCardProps {
  rank: number;
  item: {
    id: number;
    slug: string;
    module: string;
    name: string;
    company: string;
    headline: string;
    tags: string[];
    /** Drizzle schema field (camelCase). */
    itemTier?: string;
    /** Raw SQL row field (snake_case) — either form is accepted. */
    item_tier?: string;
    publishedAt?: Date | string | null;
    published_at?: Date | string | null;
    issueDate?: string;
    issue_date?: string;
  };
  personalizedBlurb: string;
  personalizedReason: string;
  state?: { saved: boolean; dismissed: boolean; reaction: string | null };
}

/**
 * The card. ONE variant — text-only, hairline border on cream, equal height
 * inside any grid. No images, no hero/feature/standard variants. Designed to
 * sit cleanly in a 1/2/3-column grid without ever wrapping awkwardly.
 *
 * Visual order:
 *   1. Eyebrow (module · company · 简讯)
 *   2. Personalized headline (serif, hard-clamped to 3 lines)
 *   3. Editor one-liner (sans, clamped to 2 lines)
 *   4. Tags (max 3 pills)
 *   5. Hairline divider
 *   6. Action row: "讨论" link + icon actions (saved/like/dislike/hide)
 *   7. Tiny inline "为何推荐 ▾" disclosure (collapsed by default)
 */
export function NewsCard({
  rank: _rank,
  item,
  personalizedBlurb,
  personalizedReason,
  state,
}: NewsCardProps) {
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col rounded-lg bg-white p-6 shadow-hairline transition-shadow hover:shadow-[inset_0_0_0_1px_#cc785c40]",
        "dark:bg-white/[0.03] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] dark:hover:shadow-[inset_0_0_0_1px_rgba(204,120,92,0.4)]",
        state?.dismissed && "opacity-50"
      )}
    >
      {/* Eyebrow: module · company · 故事发生日 */}
      <div className="mb-4 flex items-center gap-2 text-[12px] font-medium uppercase tracking-uc text-claude-coral">
        <span>{moduleLabel(item.module)}</span>
        <span className="text-claude-muted-soft" aria-hidden>·</span>
        <span className="truncate text-claude-muted normal-case tracking-normal">
          {item.company}
        </span>
        {(item.publishedAt ||
          item.published_at ||
          item.issueDate ||
          item.issue_date) && (
          <>
            <span className="text-claude-muted-soft" aria-hidden>·</span>
            <span className="text-claude-muted-soft normal-case tracking-normal">
              {storyDate(
                item.publishedAt ?? item.published_at ?? null,
                item.issueDate ?? item.issue_date
              )}
            </span>
          </>
        )}
        {(item.item_tier ?? item.itemTier) === "brief" && (
          <span className="ml-auto chip text-[10px] normal-case tracking-normal">
            简讯
          </span>
        )}
      </div>

      {/* Headline (serif) */}
      <Link href={`/items/${item.slug}`} className="block">
        <h2 className="font-display text-[22px] leading-[1.25] tracking-display text-claude-ink line-clamp-3 hover:text-claude-coral dark:text-white dark:hover:text-claude-coral">
          {personalizedBlurb}
        </h2>
      </Link>

      {/* Editor one-liner */}
      <p className="mt-3 line-clamp-2 text-[14px] leading-[1.55] text-claude-body dark:text-white/70">
        {item.headline}
      </p>

      {/* Tags */}
      {item.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="chip">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Spacer pushes the action row to the bottom of every card. */}
      <div className="flex-1" />

      {/* Divider + action row.
       *
       * Layout: the top row keeps a left CTA (阅读全文) and the right icon
       * cluster. The bottom row puts 「为何推荐」on the left and 「和 Agent
       * 讨论」on the right. Both bottom items use whitespace-nowrap +
       * shrink-0 so neither ever wraps onto two lines on a narrow card —
       * if the card is ever too narrow to hold both, the chat link gets
       * its label hidden and shows just the icon (≥ sm always shows full).
       */}
      <div className="mt-5 border-t border-claude-hairline pt-3 dark:border-white/10">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/items/${item.slug}`}
            className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-claude-coral hover:underline"
          >
            阅读全文 <ArrowRight className="h-3 w-3" />
          </Link>
          {state !== undefined && <ItemActions itemId={item.id} state={state} />}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
          <div className="min-w-0 flex-1">
            <WhyShown reason={personalizedReason} />
          </div>
          <Link
            href={`/chat?item=${item.id}`}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-claude-muted hover:text-claude-coral"
            title="和 Agent 讨论这条"
          >
            <MessageSquare className="h-3 w-3" />
            <span className="hidden sm:inline">和 Agent 讨论</span>
            <span className="sm:hidden">讨论</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

export function NewsCardSkeleton() {
  return (
    <div className="rounded-lg bg-white p-6 shadow-hairline">
      <div className="h-3 w-1/3 animate-pulse rounded bg-claude-surface-card" />
      <div className="mt-4 h-5 w-full animate-pulse rounded bg-claude-surface-card" />
      <div className="mt-2 h-5 w-3/4 animate-pulse rounded bg-claude-surface-card" />
      <div className="mt-4 h-3 w-5/6 animate-pulse rounded bg-claude-surface-card" />
    </div>
  );
}
