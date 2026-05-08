import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ItemActions } from "./item-actions";
import { WhyShown } from "./why-shown";
import { CardImage } from "./card-image";
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
    primaryImage?: string | null;
    primary_image?: string | null;
    imageUrls?: string[] | null;
    image_urls?: string[] | null;
    /** Full normalized record — we read summary_zh / judgment_zh from here. */
    record?: Record<string, unknown> | null;
  };
  personalizedBlurb: string;
  personalizedReason: string;
  state?: { saved: boolean; dismissed: boolean; reaction: string | null };
  /**
   * `wired`   — horizontal image-left layout used for the personalized,
   *             signed-in feed. One per row, image ~40% width.
   * `compact` — original equal-height card used for the 3-col anonymous
   *             grid and any other compact context.
   */
  variant?: "wired" | "compact";
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
 * Build the "deck" — a 2-3 sentence body paragraph that gives the actual
 * news content (vs the headline, which is only one factual sentence).
 *
 * Source priority:
 *   1. `key_points_zh` — what the product/feature actually IS / does
 *   2. `scenarios_zh` — who uses it, how
 *   3. `relevance_zh` — relevance to AI engineers/PMs
 *
 * `key_points_zh` arrives in two shapes from the LLM:
 *   - a string with `；` / `;` separated points
 *   - an array of bullet strings
 * We normalise both to a single paragraph because that reads better
 * inside a card (a 3-bullet list inside a card competes visually with
 * the headline).
 */
function buildDeck(rec: Record<string, unknown> | null | undefined): string | null {
  if (!rec) return null;
  const kp = rec["key_points_zh"];
  let points: string[] = [];
  if (Array.isArray(kp)) {
    points = kp.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  } else if (typeof kp === "string" && kp.trim()) {
    points = kp.split(/[;；]\s*/).map((s) => s.trim()).filter(Boolean);
  }
  if (points.length > 0) {
    // Use a Chinese full-stop only between points, not at the end —
    // matches the way these are written in newsletters.
    return points.slice(0, 3).join("；") + "。";
  }
  return pickStr(rec, "scenarios_zh", "relevance_zh", "what_it_is_zh");
}

/** Pick the best available image URL across the two field-name conventions. */
function pickImage(item: NewsCardProps["item"]): string | null {
  if (item.primaryImage) return item.primaryImage;
  if (item.primary_image) return item.primary_image;
  if (Array.isArray(item.imageUrls) && item.imageUrls[0]) return item.imageUrls[0];
  if (Array.isArray(item.image_urls) && item.image_urls[0]) return item.image_urls[0];
  return null;
}

/**
 * Wired-style news card.
 *
 * Layout:
 *   - desktop (≥md): horizontal — image on left ~40%, content on right
 *   - mobile  (<md): stack — image on top (16:9), content below
 *
 * When no image is available, the image slot becomes a soft gradient
 * panel with the company initial — keeps the alignment, no broken
 * 1×1 placeholder.
 */
export function NewsCard({
  rank: _rank,
  item,
  personalizedBlurb,
  personalizedReason,
  state,
  variant = "wired",
}: NewsCardProps) {
  const factualHeadline =
    pickStr(item.record, "summary_zh") || item.headline || item.name;

  // Lead paragraph — what this product/feature actually IS / does.
  // Sits between the headline and the editor judgment.
  const deck = buildDeck(item.record);

  const judgment =
    pickStr(item.record, "judgment_zh", "one_line_judgment") || null;

  const personalNote =
    personalizedBlurb && personalizedBlurb !== factualHeadline
      ? personalizedBlurb
      : null;

  const image = pickImage(item);
  const tier = item.item_tier ?? item.itemTier;
  const isCompact = variant === "compact";

  if (isCompact) {
    return (
      <article
        className={cn(
          "group relative flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-hairline transition-shadow hover:shadow-[inset_0_0_0_1px_#cc785c40]",
          "dark:bg-white/[0.03] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] dark:hover:shadow-[inset_0_0_0_1px_rgba(204,120,92,0.4)]",
          state?.dismissed && "opacity-50"
        )}
      >
        <CardImage
          image={image}
          company={item.company}
          name={item.name}
          slug={item.slug}
          aspect="aspect-[16/9]"
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        <div className="flex flex-1 flex-col p-6">
          <CardEyebrow item={item} tier={tier} />
          <Link href={`/items/${item.slug}`} className="block">
            <h2 className="font-display text-[20px] leading-[1.3] tracking-display text-claude-ink line-clamp-3 hover:text-claude-coral dark:text-white dark:hover:text-claude-coral">
              {factualHeadline}
            </h2>
          </Link>
          {deck && (
            <p className="prose-cjk mt-3 line-clamp-3 text-[14px] leading-[1.65] text-claude-body dark:text-white/85">
              {deck}
            </p>
          )}
          {judgment && (
            <p className="mt-2 line-clamp-2 text-[13px] italic leading-[1.55] text-claude-muted dark:text-white/60">
              <span className="font-medium not-italic text-claude-coral">编辑判断 · </span>
              {judgment}
            </p>
          )}
          {item.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {item.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex-1" />
          <CardActionRow
            slug={item.slug}
            itemId={item.id}
            state={state}
            personalNote={personalNote}
            personalizedReason={personalizedReason}
          />
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl bg-white shadow-hairline transition-shadow hover:shadow-[inset_0_0_0_1px_#cc785c40] md:flex-row",
        "dark:bg-white/[0.03] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] dark:hover:shadow-[inset_0_0_0_1px_rgba(204,120,92,0.4)]",
        state?.dismissed && "opacity-50"
      )}
    >
      <Link
        href={`/items/${item.slug}`}
        aria-label={factualHeadline}
        className="block w-full shrink-0 md:w-[38%] md:min-w-[260px] md:max-w-[400px]"
      >
        <CardImage
          image={image}
          company={item.company}
          name={item.name}
          slug={item.slug}
          aspect="aspect-[16/9] md:aspect-[4/3] md:h-full"
          sizes="(min-width: 768px) 38vw, 100vw"
          rounded="md:rounded-l-xl md:rounded-tr-none"
        />
      </Link>

      <div className="flex flex-1 flex-col p-6 md:p-7">
        <CardEyebrow item={item} tier={tier} />

        <Link href={`/items/${item.slug}`} className="block">
          <h2 className="font-display text-[22px] leading-[1.25] tracking-display text-claude-ink line-clamp-3 hover:text-claude-coral dark:text-white dark:hover:text-claude-coral md:text-[26px]">
            {factualHeadline}
          </h2>
        </Link>

        {deck && (
          <p className="prose-cjk mt-4 line-clamp-4 text-[15px] leading-[1.7] text-claude-body dark:text-white/85 md:text-[15.5px]">
            {deck}
          </p>
        )}

        {judgment && (
          <div className="mt-4 rounded-md border-l-2 border-claude-coral/60 bg-claude-coral/5 px-3 py-2 dark:bg-claude-coral/10">
            <p className="line-clamp-2 text-[13.5px] leading-[1.6] text-claude-body-strong dark:text-white/85">
              <span className="font-medium text-claude-coral">编辑判断 · </span>
              {judgment}
            </p>
          </div>
        )}

        {item.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {item.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="chip">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex-1" />

        <CardActionRow
          slug={item.slug}
          itemId={item.id}
          state={state}
          personalNote={personalNote}
          personalizedReason={personalizedReason}
        />
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------------ */

function CardEyebrow({
  item,
  tier,
}: {
  item: NewsCardProps["item"];
  tier?: string;
}) {
  const dateStr = storyDate(
    item.publishedAt ?? item.published_at ?? null,
    item.issueDate ?? item.issue_date
  );
  return (
    <div className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-uc text-claude-coral">
      <span>{moduleLabel(item.module)}</span>
      <span className="text-claude-muted-soft" aria-hidden>
        ·
      </span>
      <span className="truncate text-claude-muted normal-case tracking-normal">
        {item.company}
      </span>
      {dateStr && (
        <>
          <span className="text-claude-muted-soft" aria-hidden>
            ·
          </span>
          <span className="text-claude-muted-soft normal-case tracking-normal">
            {dateStr}
          </span>
        </>
      )}
      {tier === "brief" && (
        <span className="ml-auto chip text-[10px] normal-case tracking-normal">
          简讯
        </span>
      )}
    </div>
  );
}

function CardActionRow({
  slug,
  itemId,
  state,
  personalNote,
  personalizedReason,
}: {
  slug: string;
  itemId: number;
  state?: NewsCardProps["state"];
  personalNote: string | null;
  personalizedReason: string;
}) {
  return (
    <div className="mt-5 border-t border-claude-hairline pt-3 dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/items/${slug}`}
          className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-claude-coral hover:underline"
        >
          阅读 &amp; 聊这条 <ArrowRight className="h-3 w-3" />
        </Link>
        {state !== undefined && <ItemActions itemId={itemId} state={state} />}
      </div>
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
  );
}

export function NewsCardSkeleton({
  variant = "wired",
}: {
  variant?: "wired" | "compact";
}) {
  if (variant === "compact") {
    return (
      <div className="overflow-hidden rounded-lg bg-white shadow-hairline">
        <div className="aspect-[16/9] animate-pulse bg-claude-surface-card" />
        <div className="p-6">
          <div className="h-3 w-1/3 animate-pulse rounded bg-claude-surface-card" />
          <div className="mt-4 h-5 w-full animate-pulse rounded bg-claude-surface-card" />
          <div className="mt-2 h-5 w-3/4 animate-pulse rounded bg-claude-surface-card" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-hairline md:flex-row">
      <div className="aspect-[16/9] w-full animate-pulse bg-claude-surface-card md:aspect-[4/3] md:w-[40%]" />
      <div className="flex-1 p-7">
        <div className="h-3 w-1/3 animate-pulse rounded bg-claude-surface-card" />
        <div className="mt-4 h-6 w-full animate-pulse rounded bg-claude-surface-card" />
        <div className="mt-2 h-6 w-2/3 animate-pulse rounded bg-claude-surface-card" />
        <div className="mt-4 h-3 w-5/6 animate-pulse rounded bg-claude-surface-card" />
      </div>
    </div>
  );
}
