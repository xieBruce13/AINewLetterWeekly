"use client";

import { useChat } from "ai/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Bot, Loader2, User2, Wrench } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface PinnedItem {
  id: number;
  name: string;
  company: string;
  slug: string;
}

export interface AgentChatPanelProps {
  /** Item IDs to surface to the system prompt this turn (max 4 are used). */
  referencedItemIds?: number[];
  /** Optional pinned-item header — shows above messages when set. */
  pinnedItem?: PinnedItem | null;
  /** Static node above the message list — e.g. WeekHighlightsCard intro. */
  intro?: ReactNode;
  /** Quick-prompt suggestions for the empty state. */
  suggestions?: string[];
  /** Auto-prefill on first mount. */
  initialPrompt?: string;
  /** Sizing density. */
  density?: "comfortable" | "compact";
  /** Override the "Agent remembers across sessions" footer. */
  inputFooter?: ReactNode;
  /** Override the small uppercase eyebrow in the header. */
  headerEyebrow?: string;
  /** Override the input placeholder. */
  inputPlaceholder?: string;
  className?: string;
}

const DEFAULT_FOOTER = (
  <>
    Agent 会跨 session 记住你说过的话。{" "}
    <Link href="/profile" className="text-claude-coral underline">
      查看记忆
    </Link>
  </>
);

/**
 * Unified Agent chat panel — embedded everywhere the user can talk to the
 * weekly Agent (home split view, item detail split view, full-page /chat
 * with a pinned item).
 *
 * `useChat` keeps its own message/input state, so callers should mount this
 * component once and toggle visibility (display:none) rather than unmounting
 * when the user flips reading-mode tabs — otherwise the conversation gets
 * lost on every flip.
 */
export function AgentChatPanel({
  referencedItemIds,
  pinnedItem,
  intro,
  suggestions,
  initialPrompt,
  density = "comfortable",
  inputFooter,
  headerEyebrow = "Zeno Agent",
  inputPlaceholder,
  className,
}: AgentChatPanelProps) {
  const referenced =
    referencedItemIds ?? (pinnedItem ? [pinnedItem.id] : []);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    setInput,
    isLoading,
    error,
  } = useChat({
    api: "/api/chat",
    body: { referencedItemIds: referenced },
    onError: (e) => console.error(e),
  });

  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages]);

  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (initialPrompt && !seeded) {
      setInput(initialPrompt);
      setSeeded(true);
    }
  }, [initialPrompt, seeded, setInput]);

  const compact = density === "compact";
  const placeholder =
    inputPlaceholder ??
    (pinnedItem
      ? `关于 ${pinnedItem.name} 你想问什么…`
      : "聊一条新闻、对比几家厂商、或者描述你正在搭的 workflow…");

  return (
    <div
      className={cn(
        // Slightly deeper than the page canvas so the chat rail visually
        // separates from the reading column without needing a heavy
        // border. Dark mode keeps the existing flat surface.
        "flex h-full min-h-0 flex-1 flex-col bg-claude-surface-soft dark:bg-claude-dark",
        className
      )}
    >
      {/* Header — eyebrow + (optional) pinned item summary */}
      <div className="flex shrink-0 items-center gap-3 border-b border-claude-hairline bg-claude-surface-card px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.04] sm:px-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-uc text-claude-coral">
            {headerEyebrow}
          </p>
          {pinnedItem ? (
            <p className="truncate text-[13px] font-medium text-claude-ink dark:text-white">
              <Link
                href={`/items/${pinnedItem.slug}`}
                className="hover:text-claude-coral hover:underline"
              >
                {pinnedItem.company} — {pinnedItem.name}
              </Link>
            </p>
          ) : (
            <p className="truncate text-[13px] text-claude-muted">
              问任何一条新闻 · 对比 · 或聊你正在做的事
            </p>
          )}
        </div>
      </div>

      {/* Scrollable region: optional intro + messages */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div
          className={cn(
            "mx-auto w-full max-w-3xl space-y-4",
            compact ? "px-4 py-4" : "px-5 py-6 sm:px-6"
          )}
        >
          {intro && <div className="pb-2">{intro}</div>}

          {messages.length === 0 && (
            <ChatEmptyState
              suggestions={suggestions}
              compact={compact}
              onPick={(s) => setInput(s)}
            />
          )}

          {messages.map((m) => (
            <Bubble key={m.id} message={m} compact={compact} />
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-[13px] text-claude-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              思考中…
            </div>
          )}
          {error && (
            <div className="rounded-md bg-claude-coral/10 p-3 text-[13px] text-claude-coral">
              出错了：{error.message}
            </div>
          )}
        </div>
      </div>

      {/* Input dock */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-claude-hairline bg-claude-surface-soft/95 px-3 py-3 backdrop-blur dark:border-white/10 dark:bg-claude-dark/95 sm:px-4"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col">
          <div className="flex items-end gap-2 rounded-lg bg-white p-2 shadow-hairline focus-within:shadow-focus dark:bg-white/[0.04]">
            <textarea
              value={input}
              onChange={handleInputChange}
              placeholder={placeholder}
              className={cn(
                "flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-claude-ink outline-none dark:text-white",
                compact ? "min-h-[36px] text-[14px]" : "min-h-[40px] text-[15px]"
              )}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(
                    e as unknown as React.FormEvent<HTMLFormElement>
                  );
                }
              }}
            />
            <button
              type="submit"
              disabled={isLoading || input.trim().length === 0}
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-md bg-claude-coral text-white transition-colors hover:bg-claude-coral-active disabled:bg-claude-coral-disabled disabled:text-claude-muted press",
                compact ? "h-8 w-8" : "h-9 w-9"
              )}
              aria-label="发送"
            >
              <ArrowUp className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-claude-muted">
            {inputFooter ?? DEFAULT_FOOTER}
          </p>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ChatEmptyState({
  suggestions,
  compact,
  onPick,
}: {
  suggestions?: string[];
  compact: boolean;
  onPick: (s: string) => void;
}) {
  const list = suggestions ?? [];
  return (
    <div className="space-y-3">
      {!compact && (
        <div className="pb-1">
          <p className="text-[13px] text-claude-body dark:text-white/75">
            可以问一条具体的新闻、做横向对比，或直接告诉我你在乎的事 ——
            我会记下来。
          </p>
        </div>
      )}
      {list.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className={cn(
                "rounded-lg bg-white text-left text-claude-body shadow-hairline transition-colors hover:bg-claude-surface-soft hover:text-claude-ink dark:bg-white/[0.04] dark:text-white/85 press",
                compact ? "px-3 py-2 text-[13px]" : "px-3.5 py-2.5 text-[14px]"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function Bubble({ message, compact }: { message: any; compact: boolean }) {
  const isUser = message.role === "user";
  const text = typeof message.content === "string" ? message.content : "";
  const toolInvocations = (message.toolInvocations ?? []) as Array<any>;

  // Article cards extracted from search_news / get_item tool results so the
  // assistant's references render as tappable links rather than raw text.
  const articleCards: Array<{
    id: number;
    slug: string;
    name: string;
    company: string;
    headline: string;
    module: string;
  }> = [];
  const seen = new Set<number>();
  for (const t of toolInvocations) {
    if (t.state !== "result") continue;
    if (t.toolName === "search_news" && Array.isArray(t.result?.results)) {
      for (const r of t.result.results) {
        if (r.id && !seen.has(r.id)) {
          seen.add(r.id);
          articleCards.push(r);
        }
      }
    }
    if (t.toolName === "get_item" && t.result?.id && !seen.has(t.result.id)) {
      seen.add(t.result.id);
      articleCards.push(t.result);
    }
  }

  return (
    <div className={cn("flex gap-2", isUser && "justify-end")}>
      {!isUser && (
        <div
          className={cn(
            "mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-claude-coral text-white",
            compact ? "h-6 w-6" : "h-7 w-7"
          )}
        >
          <Bot className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </div>
      )}
      <div
        className={cn(
          "max-w-[88%] space-y-1.5",
          isUser ? "order-first" : ""
        )}
      >
        <div
          className={cn(
            "rounded-lg leading-[1.6]",
            compact ? "px-3 py-2.5 text-[13.5px]" : "px-4 py-3 text-[15px]",
            isUser
              ? "bg-claude-coral text-white"
              : "bg-white text-claude-body shadow-hairline dark:bg-white/[0.04] dark:text-white/90"
          )}
        >
          <ToolSummary invocations={toolInvocations} />
          {text &&
            (isUser ? (
              <p className="whitespace-pre-wrap">{text}</p>
            ) : (
              <div
                className={cn(
                  "prose max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:text-claude-ink dark:prose-strong:text-white prose-code:rounded prose-code:bg-claude-surface-soft prose-code:px-1 prose-code:text-[12px] dark:prose-code:bg-white/10 prose-table:text-[13px]",
                  compact ? "prose-xs" : "prose-sm"
                )}
              >
                <ReactMarkdown>{text}</ReactMarkdown>
              </div>
            ))}
        </div>

        {!isUser && articleCards.length > 0 && (
          <div className="space-y-1.5 pt-0.5">
            {articleCards.map((a) => (
              <ArticleCard key={a.id} item={a} />
            ))}
          </div>
        )}
      </div>
      {isUser && (
        <div
          className={cn(
            "mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-claude-ink text-white",
            compact ? "h-6 w-6" : "h-7 w-7"
          )}
        >
          <User2 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </div>
      )}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function ArticleCard({
  item,
}: {
  item: {
    id: number;
    slug: string;
    name: string;
    company: string;
    headline: string;
    module: string;
  };
}) {
  return (
    <Link
      href={`/items/${item.slug}`}
      className="group flex items-start gap-3 rounded-lg border border-claude-hairline bg-white px-3 py-2.5 shadow-hairline transition-colors hover:border-claude-coral/40 hover:bg-claude-surface-soft dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-claude-coral/30"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-uc text-claude-coral">
            {item.module === "model"
              ? "模型"
              : item.module === "operation"
                ? "运营"
                : "产品"}
          </span>
          <span className="text-[11px] text-claude-muted">{item.company}</span>
        </div>
        <p className="line-clamp-2 text-[13px] font-medium leading-[1.45] text-claude-ink transition-colors group-hover:text-claude-coral dark:text-white">
          {item.headline || item.name}
        </p>
      </div>
      <ArrowUp className="mt-0.5 h-3.5 w-3.5 shrink-0 rotate-45 text-claude-muted-soft transition-colors group-hover:text-claude-coral" />
    </Link>
  );
}

const TOOL_LABELS: Record<string, string> = {
  search_news: "搜索新闻库",
  get_item: "加载详情",
  save_item: "已收藏",
  dismiss_item: "已隐藏",
  remember: "记下了",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function ToolSummary({ invocations }: { invocations: any[] }) {
  const [open, setOpen] = useState(false);
  if (invocations.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const t of invocations) {
    const name = t.toolName ?? "tool";
    counts[name] = (counts[name] ?? 0) + 1;
  }
  const summary = Object.entries(counts)
    .map(([name, n]) => `${TOOL_LABELS[name] ?? name}${n > 1 ? ` ×${n}` : ""}`)
    .join(" · ");

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-pill bg-claude-surface-soft px-2 py-0.5 text-[10.5px] text-claude-muted hover:text-claude-body dark:bg-white/10"
      >
        <Wrench className="h-2.5 w-2.5" />
        <span>{summary}</span>
        <span className="opacity-50">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 rounded-md bg-claude-surface-soft p-2 text-[10.5px] text-claude-muted dark:bg-white/5">
          {invocations.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="font-medium">
                {TOOL_LABELS[t.toolName] ?? t.toolName}
              </span>
              {t.args && (
                <span className="truncate opacity-60">
                  {JSON.stringify(t.args).slice(0, 80)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
