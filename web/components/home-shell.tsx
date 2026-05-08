"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Columns, MessageSquare } from "lucide-react";
import { NewsCard } from "@/components/news-card";
import { AgentChatPanel } from "@/components/agent-chat-panel";
import {
  WeekHighlightsCard,
  type BulletThumb,
  type WeekSummaryBullet,
} from "@/components/week-highlights-card";
import {
  MODULE_BLURB,
  MODULE_LABEL_ZH,
  MODULES,
  isModule,
  type Module,
} from "@/lib/modules";
import { cn, formatIssueDate } from "@/lib/utils";

/**
 * Card-shaped item the shell needs. Mirrors the (loose) shape `NewsCard`
 * already accepts — server-side `app/page.tsx` packs personalized items
 * into this format before passing them in.
 */
export interface ShellItem {
  id: number;
  slug: string;
  module: string;
  name: string;
  company: string;
  headline: string;
  tags: string[];
  itemTier?: string;
  item_tier?: string;
  publishedAt?: Date | string | null;
  published_at?: Date | string | null;
  issueDate?: string;
  issue_date?: string;
  primaryImage?: string | null;
  primary_image?: string | null;
  imageUrls?: string[] | null;
  image_urls?: string[] | null;
  record?: Record<string, unknown> | null;
  personalizedBlurb: string;
  personalizedReason: string;
  state?: { saved: boolean; dismissed: boolean; reaction: string | null };
}

export interface HomeShellProps {
  issueDate: string;
  profileSnippet?: string;
  focusModule: Module | null;
  weekSummary: { theme: string; bullets: WeekSummaryBullet[] } | null;
  /** Plain-object map (slug → thumb) — Maps don't cross client boundary. */
  weekSummaryThumbs?: Record<string, BulletThumb>;
  /** Reader's focus topics — used to tag bullets with "为你而推" pills. */
  focusTopics?: string[];
  /** Reader role label for the small "为 [role] 筛选" badge. */
  forRole?: string;
  /** The personalized news cards displayed on the left. */
  feed: ShellItem[];
}

type ViewMode = "split" | "read" | "chat";

export function HomeShell({
  issueDate,
  profileSnippet,
  focusModule,
  weekSummary,
  weekSummaryThumbs,
  focusTopics,
  forRole,
  feed,
}: HomeShellProps) {
  const [mode, setMode] = useState<ViewMode>("split");

  const display = focusModule
    ? feed.filter((r) => isModule(r.module) && r.module === focusModule)
    : feed;

  const referencedIds = feed.slice(0, 4).map((i) => i.id);
  const suggestions = useMemo(
    () => buildHomeSuggestions(weekSummary?.bullets),
    [weekSummary]
  );

  const feedHints = useMemo(
    () =>
      feed.map((i) => ({
        slug: i.slug,
        tags: i.tags,
      })),
    [feed]
  );

  return (
    <>
      {/* Sticky toolbar — sits below the global nav. Title block on the
          left, view-mode toggle on the right. */}
      <div className="sticky top-16 z-20 border-b border-claude-hairline bg-claude-canvas/95 backdrop-blur dark:border-white/10 dark:bg-claude-dark/95">
        <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-uc text-claude-coral">
              AI 周报 · {formatIssueDate(issueDate)}
            </p>
            <h1 className="mt-0.5 truncate font-display text-[20px] tracking-display text-claude-ink dark:text-white sm:text-[22px]">
              {focusModule ? (
                <>
                  本周{MODULE_LABEL_ZH[focusModule]}层
                  <span className="text-claude-coral">的关键变化</span>
                </>
              ) : (
                <>
                  这一周的 AI，
                  <span className="text-claude-coral">为你而写</span>
                </>
              )}
            </h1>
            {profileSnippet && !focusModule && (
              <p className="mt-0.5 truncate text-[12px] text-claude-muted">
                以「{profileSnippet}」的视角重排和改写
              </p>
            )}
          </div>

          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>

      {/* Body — split or single-column depending on mode. Both panes are
          always mounted (CSS hide via `hidden`) so chat state survives
          mode flips. */}
      <div
        className={cn(
          "mx-auto w-full max-w-[1800px] px-0 sm:px-2 lg:px-3",
          // Reading : chat = 11 : 9 (~55 / 45). Earlier 3:1 felt too
          // narrow for the conversation; user feedback (May 2026) put
          // the divider near mid-page.
          mode === "split" && "lg:grid lg:grid-cols-[11fr_9fr] lg:gap-4"
        )}
      >
        {/* Reading column */}
        <div className={cn(mode === "chat" ? "hidden" : "block")}>
          <div className={cn("px-5 py-6 sm:px-6", mode === "split" && "lg:px-3")}>
            {weekSummary && !focusModule && (
              <WeekHighlightsCard
                theme={weekSummary.theme}
                bullets={weekSummary.bullets}
                thumbs={weekSummaryThumbs}
                forRole={forRole}
                feed={feedHints}
                focusTopics={focusTopics}
                variant="full"
              />
            )}
            {display.length === 0 ? (
              <p className="rounded-lg bg-white p-12 text-center text-claude-muted shadow-hairline">
                本周没有匹配你偏好的内容。可以去
                <Link
                  href="/onboarding"
                  className="ml-1 text-claude-coral underline"
                >
                  扩大关注话题
                </Link>
                。
              </p>
            ) : focusModule ? (
              <SingleModuleView module={focusModule} items={display} mode={mode} />
            ) : (
              <ModuleSections items={display} mode={mode} />
            )}
          </div>
        </div>

        {/* Chat column */}
        <aside
          className={cn(
            mode === "read" ? "hidden" : "block",
            // Sticky below the global nav (h-16 = 64px) AND the toolbar
            // (with the AI 周报 eyebrow + headline + role subtitle the
            // toolbar stacks ~95px tall, so the chat panel needs ≥160px
            // of top offset to keep its first row visible). Using 11rem
            // (176px) as a comfortable buffer.
            mode === "split" && "lg:sticky lg:top-44 lg:self-start"
          )}
        >
          <div
            className={cn(
              mode === "split"
                ? "h-[calc(100vh-11.5rem)] border-l border-claude-hairline dark:border-white/10"
                : "h-[calc(100vh-11.5rem)]"
            )}
          >
            <AgentChatPanel
              referencedItemIds={referencedIds}
              suggestions={suggestions}
              density="compact"
              headerEyebrow="AI 周报 Agent · 本周对话"
            />
          </div>
        </aside>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function ModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="视图模式"
      className="inline-flex h-8 items-center rounded-md border border-claude-hairline bg-white p-0.5 shadow-hairline dark:border-white/15 dark:bg-white/[0.04]"
    >
      <ModeBtn
        active={mode === "read"}
        onClick={() => onChange("read")}
        icon={<BookOpen className="h-3.5 w-3.5" />}
        label="阅读"
      />
      <ModeBtn
        active={mode === "split"}
        onClick={() => onChange("split")}
        icon={<Columns className="h-3.5 w-3.5" />}
        label="双栏"
      />
      <ModeBtn
        active={mode === "chat"}
        onClick={() => onChange("chat")}
        icon={<MessageSquare className="h-3.5 w-3.5" />}
        label="对话"
      />
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded px-2.5 text-[12.5px] font-medium transition-colors",
        active
          ? "bg-claude-coral text-white"
          : "text-claude-muted hover:bg-claude-surface-soft hover:text-claude-body dark:hover:bg-white/[0.06]"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
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

function ModuleSections({
  items,
  mode,
}: {
  items: ShellItem[];
  mode: ViewMode;
}) {
  const grouped: Record<Module, ShellItem[]> = {
    model: [],
    product: [],
    operation: [],
  };
  for (const it of items) if (isModule(it.module)) grouped[it.module].push(it);

  // Wired horizontal cards work fine at 75 %-of-1400 (~1050 px). Keep them
  // for both split and read modes; collapse to compact only when the chat
  // takes the whole viewport (we never get there in the reading column).
  const variant = "wired";

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
            <div
              className={cn(
                "flex flex-col gap-5",
                mode === "read" && "gap-6"
              )}
            >
              {list.map((item, i) => (
                <NewsCard
                  key={item.id}
                  rank={i}
                  item={item}
                  personalizedBlurb={item.personalizedBlurb}
                  personalizedReason={item.personalizedReason}
                  state={item.state}
                  variant={variant}
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
  mode: _mode,
}: {
  module: Module;
  items: ShellItem[];
  mode: ViewMode;
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

/**
 * Build empty-state suggestions that pull from the week's actual bullets so
 * the user can immediately ask the agent to expand on each highlight.
 */
function buildHomeSuggestions(bullets?: WeekSummaryBullet[]): string[] {
  const out: string[] = [];
  (bullets ?? []).slice(0, 2).forEach((b, i) => {
    const m = b.text.match(/^\*\*([^*]+)\*\*[：:]/);
    const lead = m?.[1]?.trim() ?? `第 ${i + 1} 条要点`;
    out.push(`详细讲讲「${lead}」对我的工作意味着什么`);
  });
  out.push("基于这周的内容，我接下来该深入了解什么？");
  out.push("用 3 条 bullet 总结本周最重要的事");
  return out.slice(0, 4);
}
