import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CardImage } from "./card-image";

export interface WeekSummaryBullet {
  text: string;
  slugs?: string[];
}

export interface BulletThumb {
  primaryImage: string | null;
  company: string;
  name: string;
}

export interface WeekHighlightsCardProps {
  theme: string;
  bullets: WeekSummaryBullet[];
  /** Map (serialized as plain object) from slug → thumbnail metadata. */
  thumbs?: Record<string, BulletThumb>;
  /** Show the "为 [role] 筛选" pill in the header. */
  forRole?: string;
  /** Items the user has on screen — used to compute relevance pills. */
  feed?: Array<{ slug: string; tags: string[] }>;
  /** Reader profile hints — focus topics power the relevance pill. */
  focusTopics?: string[];
  /**
   * Visual density. `chat` is the compact variant rendered inside the
   * Agent chat panel; `full` is the original page-width card.
   */
  variant?: "chat" | "full";
}

/**
 * "本周要点" card. The previous home page rendered this once at full page
 * width; we now also render a compact variant inside the Agent chat panel
 * (per editorial direction — the highlights belong with the conversation
 * about them).
 */
export function WeekHighlightsCard({
  theme,
  bullets,
  thumbs,
  forRole,
  feed,
  focusTopics,
  variant = "chat",
}: WeekHighlightsCardProps) {
  if (bullets.length === 0) return null;

  const isChat = variant === "chat";

  return (
    <section
      aria-label="本周要点"
      className={
        isChat
          ? "rounded-lg border border-claude-hairline bg-white p-4 dark:border-white/10 dark:bg-white/[0.04] sm:p-5"
          : "mb-14 rounded-xl border border-claude-hairline bg-white p-7 dark:border-white/10 dark:bg-white/[0.03] sm:p-9"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={
            isChat
              ? "text-[10.5px] font-semibold uppercase tracking-uc text-claude-coral"
              : "text-[12px] font-semibold uppercase tracking-uc text-claude-coral"
          }
        >
          本周要点 · {bullets.length} 条最重要的事
        </p>
        {forRole && (
          <span
            className={
              isChat
                ? "shrink-0 rounded-full bg-claude-coral/10 px-2 py-0.5 text-[10px] font-medium text-claude-coral"
                : "shrink-0 rounded-full bg-claude-coral/10 px-2.5 py-0.5 text-[11px] font-medium text-claude-coral"
            }
          >
            为 {forRole} 筛选
          </span>
        )}
      </div>
      <p
        className={
          isChat
            ? "prose-cjk mt-2 font-display text-[16px] leading-[1.4] tracking-display text-claude-ink dark:text-white sm:text-[17px]"
            : "prose-cjk mt-3 font-display text-[22px] leading-[1.35] tracking-display text-claude-ink dark:text-white sm:text-[26px]"
        }
      >
        {theme}
      </p>
      <ul className={isChat ? "mt-4 space-y-1.5" : "mt-7 space-y-3"}>
        {bullets.map((b, i) => {
          const primary = (b.slugs ?? [])[0];
          const thumb = primary ? thumbs?.[primary] : undefined;
          const relevance = pickRelevance(b.slugs ?? [], feed, focusTopics);
          return (
            <SummaryBullet
              key={i}
              index={i}
              bullet={b}
              relevance={relevance}
              thumb={thumb}
              compact={isChat}
            />
          );
        })}
      </ul>
    </section>
  );
}

function pickRelevance(
  bulletSlugs: string[],
  feed?: Array<{ slug: string; tags: string[] }>,
  focusTopics?: string[]
): string | null {
  if (!feed || !focusTopics || focusTopics.length === 0) return null;
  const matched = feed.filter((f) => bulletSlugs.includes(f.slug));
  if (matched.length === 0) return null;
  const allTags = new Set(matched.flatMap((f) => f.tags));
  const focusHits = focusTopics.filter((t) => allTags.has(t));
  if (focusHits.length === 0) return null;
  return `与你关注的 ${focusHits.slice(0, 2).join("、")} 直接相关`;
}

function SummaryBullet({
  index,
  bullet,
  relevance,
  thumb,
  compact,
}: {
  index: number;
  bullet: WeekSummaryBullet;
  relevance: string | null;
  thumb?: BulletThumb;
  compact: boolean;
}) {
  const slugs = bullet.slugs ?? [];
  const primary = slugs[0];
  const m = bullet.text.match(/^\*\*([^*]+)\*\*[：:]?\s*(.*)$/s);
  const lead = m?.[1] ?? null;
  const body = m?.[2] ?? bullet.text;

  const headline = (
    <p
      className={
        compact
          ? "prose-cjk text-[13.5px] leading-[1.55] text-claude-body dark:text-white/85"
          : "prose-cjk text-[15.5px] leading-[1.6] text-claude-body dark:text-white/85"
      }
    >
      {lead && (
        <span className="font-semibold text-claude-ink group-hover:text-claude-coral dark:text-white">
          {lead}：
        </span>
      )}
      {body}
      {primary && (
        <ArrowRight className="ml-1 inline h-3 w-3 align-text-bottom text-claude-muted-soft transition-colors group-hover:text-claude-coral" />
      )}
    </p>
  );

  return (
    <li
      className={
        compact
          ? "-mx-1.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-claude-surface-soft dark:hover:bg-white/[0.04]"
          : "-mx-2 rounded-lg px-2 py-3 transition-colors hover:bg-claude-surface-soft dark:hover:bg-white/[0.04]"
      }
    >
      <div className={compact ? "flex items-start gap-2.5" : "flex items-start gap-4"}>
        <span
          className={
            compact
              ? "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-claude-coral/10 text-[11px] font-semibold text-claude-coral"
              : "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-claude-coral/10 text-[12px] font-semibold text-claude-coral"
          }
        >
          {index + 1}
        </span>
        {thumb && (
          <BulletThumbView
            slug={primary}
            company={thumb.company}
            name={thumb.name}
            image={thumb.primaryImage}
            compact={compact}
          />
        )}
        <div className="min-w-0 flex-1">
          {relevance && (
            <span className="mb-1 inline-block rounded-full bg-claude-coral/10 px-2 py-0.5 text-[10px] font-semibold text-claude-coral">
              {relevance}
            </span>
          )}
          {primary ? (
            <Link
              href={`/items/${primary}`}
              className="group block rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-coral/30"
            >
              {headline}
            </Link>
          ) : (
            headline
          )}
        </div>
      </div>
    </li>
  );
}

function BulletThumbView({
  slug,
  company,
  name,
  image,
  compact,
}: {
  slug?: string;
  company: string;
  name: string;
  image: string | null;
  compact: boolean;
}) {
  const dimensions = compact
    ? "h-12 w-16 sm:h-12 sm:w-16"
    : "h-16 w-24";
  const sizes = compact ? "64px" : "96px";
  const thumb = (
    <div
      className={`relative hidden ${dimensions} shrink-0 overflow-hidden rounded-md bg-claude-surface-card shadow-hairline sm:block`}
    >
      <CardImage
        image={image}
        company={company}
        name={name}
        slug={slug ?? ""}
        aspect="fill"
        sizes={sizes}
      />
    </div>
  );
  if (!slug) return thumb;
  return (
    <Link
      href={`/items/${slug}`}
      aria-label={`${company} ${name}`}
      className="hidden shrink-0 sm:block"
    >
      {thumb}
    </Link>
  );
}
