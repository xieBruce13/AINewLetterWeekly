"use client";

import { useChat } from "ai/react";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Loader2, User2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

interface PinnedItem {
  id: number;
  name: string;
  company: string;
  slug: string;
}

interface ChatInterfaceProps {
  pinned?: PinnedItem | null;
  initialPrompt?: string;
}

const SUGGESTIONS = [
  "本周对我工作影响最大的模型发布是哪条？",
  "把目前主流的 coding agent 方案给我对比一下。",
  "用 3 条 bullet 总结这条新闻，再告诉我我接下来该怎么做。",
  "把这条收藏，并记住我特别关注 agent 基础设施。",
];

export function ChatInterface({ pinned, initialPrompt }: ChatInterfaceProps) {
  const referencedItemIds = pinned ? [pinned.id] : [];
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
    body: { referencedItemIds },
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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {pinned && (
        <div className="border-b border-claude-hairline bg-claude-surface-soft px-4 py-2.5 text-[13px] dark:border-white/10 dark:bg-white/[0.04]">
          <span className="text-claude-muted">本次对话已固定：</span>{" "}
          <Link
            href={`/items/${pinned.slug}`}
            className="font-medium text-claude-coral hover:underline"
          >
            {pinned.company} — {pinned.name}
          </Link>
        </div>
      )}

      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div className="container-reading space-y-6 py-8">
          {messages.length === 0 && (
            <EmptyState onPick={(s) => setInput(s)} />
          )}
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-[13px] text-claude-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              思考中…
            </div>
          )}
          {error && (
            <div className="rounded-md bg-claude-coral/10 p-3 text-[14px] text-claude-coral">
              出错了：{error.message}
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-claude-hairline bg-claude-canvas/95 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-claude-dark/95"
      >
        <div className="container-reading">
          <div className="flex items-end gap-2 rounded-lg bg-white p-2 shadow-hairline focus-within:shadow-focus dark:bg-white/[0.04]">
            <textarea
              value={input}
              onChange={handleInputChange}
              placeholder={
                pinned
                  ? `关于 ${pinned.name} 你想问什么…`
                  : "聊一条新闻、对比几家厂商、或者描述你正在搭的 workflow…"
              }
              className="min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[15px] text-claude-ink outline-none dark:text-white"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
                }
              }}
            />
            <button
              type="submit"
              disabled={isLoading || input.trim().length === 0}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-claude-coral text-white transition-colors hover:bg-claude-coral-active disabled:bg-claude-coral-disabled disabled:text-claude-muted press"
              aria-label="发送"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[12px] text-claude-muted">
            Agent 会跨 session 记住你告诉它的事。{" "}
            <Link href="/profile" className="text-claude-coral underline">
              查看它都记得什么
            </Link>
            。
          </p>
        </div>
      </form>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="space-y-6 py-12">
      <div className="text-center">
        <span className="text-[12px] font-semibold uppercase tracking-uc text-claude-coral">
          AI 周报 Agent
        </span>
        <h2 className="mt-3 font-display text-display-md tracking-display text-claude-ink dark:text-white">
          想聊点什么？
        </h2>
        <p className="mt-2 text-[15px] text-claude-body dark:text-white/70">
          可以问任何一条新闻、做横向对比、或者直接告诉它你在乎的事 ——
          Agent 会记下来。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-lg bg-white p-3 text-left text-[14px] text-claude-body shadow-hairline transition-colors hover:bg-claude-surface-soft hover:text-claude-ink dark:bg-white/[0.04] dark:text-white/85 press"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ message }: { message: any }) {
  const isUser = message.role === "user";
  const text = typeof message.content === "string" ? message.content : "";
  const toolInvocations = (message.toolInvocations ?? []) as Array<any>;

  // Collect unique article results from search_news / get_item tool calls.
  const articleCards: Array<{ id: number; slug: string; name: string; company: string; headline: string; module: string }> = [];
  const seen = new Set<number>();
  for (const t of toolInvocations) {
    if (t.state !== "result") continue;
    if (t.toolName === "search_news" && Array.isArray(t.result?.results)) {
      for (const r of t.result.results) {
        if (r.id && !seen.has(r.id)) { seen.add(r.id); articleCards.push(r); }
      }
    }
    if (t.toolName === "get_item" && t.result?.id && !seen.has(t.result.id)) {
      seen.add(t.result.id);
      articleCards.push(t.result);
    }
  }

  return (
    <div className={cn("flex gap-3", isUser && "justify-end")}>
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-claude-coral text-white">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div className={cn("max-w-[85%] space-y-2", isUser ? "order-first" : "")}>
        <div
          className={cn(
            "space-y-2 rounded-lg px-4 py-3 text-[15px] leading-[1.6]",
            isUser
              ? "bg-claude-coral text-white"
              : "bg-white text-claude-body shadow-hairline dark:bg-white/[0.04] dark:text-white/90"
          )}
        >
          <ToolSummary invocations={toolInvocations} />
          {text && (
            isUser ? (
              <p className="whitespace-pre-wrap">{text}</p>
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:text-claude-ink dark:prose-strong:text-white prose-code:rounded prose-code:bg-claude-surface-soft prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] dark:prose-code:bg-white/10 prose-table:text-[13px] prose-th:py-1.5 prose-td:py-1.5">
                <ReactMarkdown>{text}</ReactMarkdown>
              </div>
            )
          )}
        </div>

        {/* Article cards — shown below the assistant bubble for each result */}
        {!isUser && articleCards.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {articleCards.map((a) => (
              <ArticleCard key={a.id} item={a} />
            ))}
          </div>
        )}
      </div>
      {isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-claude-ink text-white">
          <User2 className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

function ArticleCard({ item }: { item: { id: number; slug: string; name: string; company: string; headline: string; module: string } }) {
  return (
    <Link
      href={`/items/${item.slug}`}
      className="group flex items-start gap-3 rounded-lg border border-claude-hairline bg-white px-3.5 py-3 shadow-hairline transition-colors hover:border-claude-coral/40 hover:bg-claude-surface-soft dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-claude-coral/30"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-uc text-claude-coral">
            {item.module === "model" ? "模型" : "产品"}
          </span>
          <span className="text-[11px] text-claude-muted">{item.company}</span>
        </div>
        <p className="text-[13px] font-medium leading-[1.45] text-claude-ink dark:text-white line-clamp-2 group-hover:text-claude-coral transition-colors">
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

function ToolSummary({ invocations }: { invocations: any[] }) {
  const [open, setOpen] = useState(false);
  if (invocations.length === 0) return null;

  // Deduplicate by toolName and count.
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
        className="inline-flex items-center gap-1.5 rounded-pill bg-claude-surface-soft px-2.5 py-0.5 text-[11px] text-claude-muted transition-colors hover:text-claude-body dark:bg-white/10"
      >
        <Wrench className="h-3 w-3" />
        <span>{summary}</span>
        <span className="opacity-50">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 rounded-md bg-claude-surface-soft p-2 text-[11px] text-claude-muted dark:bg-white/5">
          {invocations.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="font-medium">{TOOL_LABELS[t.toolName] ?? t.toolName}</span>
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
