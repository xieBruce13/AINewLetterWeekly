import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
    /** Full normalized record — we read summary_zh / judgment_zh from here. */
    record?: Record<string, unknown> | null;
  };
  personalizedBlurb: string;
  personalizedReason: string;
  state?: { saved: boolean; dismissed: boolean; reaction: string | null };
}

/** Pull the first non-empty string from `record` keys, in priority order. */
function pickStr(rec: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  if (!rec) return null;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * The card. ONE variant — text-only, hairline border on cream, equal height
 * inside any grid. No images, no hero/feature/standard variants.
 *
 * Visual order (post-2026-05-07 redesign):
 *   1. Eyebrow (module · company · 简讯)
 *   2. FACTUAL news headline (summary_zh / headline) — pure news, no "你"
 *   3. Editor judgment one-liner (judgment_zh / one_line_judgment)
 *   4. Tags (max 3 pills)
 *   5. Divider
 *   6. Action row: "阅读 & 聊这条" + icon actions
 *   7. "为你而推" — short personalized note from the rerank LLM
 */
export function NewsCard({
  rank: _rank,
  item,
  personalizedBlurb,
  personalizedReason,
  state,
}: NewsCardProps) {
  // Factual headline shown to everyone — never "你/your" framing.
  const factualHeadline =
    pickStr(item.record, "summary_zh") ||
    item.headline ||
    item.name;

  // One-line editor judgment under the headline.
  const judgment =
    pickStr(item.record, "judgment_zh", "one_line_judgment") || null;

  // Personalized angle (small, below the divider). Hidden when it's
  // identical to the factual headline (anonymous feed reuses headline).
  const personalNote =
    personalizedBlurb && personalizedBlurb !== factualHeadline
      ? personalizedBlurb
      : null;

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

      {/* Factual news headline (serif) — written like real news, never "你". */}
      <Link href={`/items/${item.slug}`} className="block">
        <h2 className="font-display text-[22px] leading-[1.3] tracking-display text-claude-ink line-clamp-3 hover:text-claude-coral dark:text-white dark:hover:text-claude-coral">
          {factualHeadline}
        </h2>
      </Link>

      {/* Editor one-liner judgment */}
      {judgment && (
        <p className="mt-3 line-clamp-2 text-[14px] leading-[1.55] text-claude-body dark:text-white/70">
          {judgment}
        </p>
      )}

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
            阅读 &amp; 聊这条 <ArrowRight className="h-3 w-3" />
          </Link>
          {state !== undefined && <ItemActions itemId={item.id} state={state} />}
        </div>
        {/* Personalized angle (separate from factual headline). */}
        {personalNote && (
          <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-[1.5] text-claude-muted">
            <span className="mr-1 font-medium text-claude-coral">为你而推</span>
            {personalNote}
          </p>
        )}
        {personalizedReason && (
          <div className="mt-1.5 text-[12px]">
            <WhyShown reason={personalizedReason} />
          </div>
        )}
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
