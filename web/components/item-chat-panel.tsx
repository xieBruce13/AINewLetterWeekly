"use client";

import { useChat } from "ai/react";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Loader2, User2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

interface PinnedItem {
  id: number;
  name: string;
  company: string;
  slug: string;
}

interface ItemChatPanelProps {
  item: PinnedItem;
  /** Whether the panel should render. Parent controls visibility via the
   *  detail-page top toggle. Defaults to true. */
  visible?: boolean;
}

const ITEM_SUGGESTIONS = (name: string, company: string) => [
  `${company} 的这个更新对我有什么实际影响？`,
  `${name} 和同类方案相比怎么样？`,
  `基于这条新闻，我接下来应该做什么？`,
  `帮我用 3 条 bullet 总结 ${name} 最重要的变化。`,
];

export function ItemChatPanel({ item, visible = true }: ItemChatPanelProps) {
  const referencedItemIds = [item.id];
  const initialPrompt = `结合我的角色和当前在做的项目，告诉我从 ${item.name}（${item.company}）这条新闻里我应该带走什么。`;

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
    if (!seeded) {
      setInput(initialPrompt);
      setSeeded(true);
    }
  }, [seeded, setInput, initialPrompt]);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col bg-claude-canvas dark:bg-claude-dark",
        !visible && "hidden"
      )}
    >
      {/* Panel header */}
      <div className="flex shrink-0 items-center justify-between border-b border-claude-hairline bg-claude-surface-soft px-5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-uc text-claude-coral">
            AI 周报 Agent
          </p>
          <p className="truncate text-[13px] font-medium text-claude-ink dark:text-white">
            {item.company} — {item.name}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div className="space-y-4 px-4 py-5">
          {messages.length === 0 && (
            <PanelEmptyState
              item={item}
              onPick={(s) => setInput(s)}
            />
          )}
          {messages.map((m) => (
            <PanelBubble key={m.id} message={m} />
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

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-claude-hairline bg-claude-canvas/95 px-3 py-3 backdrop-blur dark:border-white/10 dark:bg-claude-dark/95"
      >
        <div className="flex items-end gap-2 rounded-lg bg-white p-2 shadow-hairline focus-within:shadow-focus dark:bg-white/[0.04]">
          <textarea
            value={input}
            onChange={handleInputChange}
            placeholder={`关于 ${item.name} 你想问什么…`}
            className="min-h-[36px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-[14px] text-claude-ink outline-none dark:text-white"
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
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-claude-coral text-white hover:bg-claude-coral-active disabled:bg-claude-coral-disabled disabled:text-claude-muted press"
            aria-label="发送"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-claude-muted">
          Agent 会跨 session 记住你说的事。{" "}
          <Link href="/profile" className="text-claude-coral underline">
            查看记忆
          </Link>
        </p>
      </form>
    </div>
  );
}

function PanelEmptyState({
  item,
  onPick,
}: {
  item: PinnedItem;
  onPick: (s: string) => void;
}) {
  const suggestions = ITEM_SUGGESTIONS(item.name, item.company);
  return (
    <div className="space-y-3 pt-2">
      <p className="text-[13px] text-claude-muted">快速提问：</p>
      <div className="grid grid-cols-1 gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-lg bg-white px-3 py-2.5 text-left text-[13px] text-claude-body shadow-hairline transition-colors hover:bg-claude-surface-soft hover:text-claude-ink dark:bg-white/[0.04] dark:text-white/85 press"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function PanelBubble({ message }: { message: any }) {
  const isUser = message.role === "user";
  const text = typeof message.content === "string" ? message.content : "";
  const toolInvocations = (message.toolInvocations ?? []) as Array<any>;

  return (
    <div className={cn("flex gap-2", isUser && "justify-end")}>
      {!isUser && (
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-claude-coral text-white">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}
      <div className={cn("max-w-[88%] space-y-1.5", isUser ? "order-first" : "")}>
        <div
          className={cn(
            "rounded-lg px-3 py-2.5 text-[13px] leading-[1.6]",
            isUser
              ? "bg-claude-coral text-white"
              : "bg-white text-claude-body shadow-hairline dark:bg-white/[0.04] dark:text-white/90"
          )}
        >
          <PanelToolSummary invocations={toolInvocations} />
          {text && (
            isUser ? (
              <p className="whitespace-pre-wrap">{text}</p>
            ) : (
              <div className="prose prose-xs max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-1.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-strong:text-claude-ink dark:prose-strong:text-white prose-code:rounded prose-code:bg-claude-surface-soft prose-code:px-1 prose-code:text-[11px] dark:prose-code:bg-white/10">
                <ReactMarkdown>{text}</ReactMarkdown>
              </div>
            )
          )}
        </div>
      </div>
      {isUser && (
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-claude-ink text-white">
          <User2 className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  search_news: "搜索新闻库",
  get_item: "加载详情",
  save_item: "已收藏",
  dismiss_item: "已隐藏",
  remember: "记下了",
};

function PanelToolSummary({ invocations }: { invocations: any[] }) {
  const [open, setOpen] = useState(false);
  if (invocations.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const t of invocations) {
    counts[t.toolName ?? "tool"] = (counts[t.toolName ?? "tool"] ?? 0) + 1;
  }
  const summary = Object.entries(counts)
    .map(([name, n]) => `${TOOL_LABELS[name] ?? name}${n > 1 ? ` ×${n}` : ""}`)
    .join(" · ");

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-pill bg-claude-surface-soft px-2 py-0.5 text-[10px] text-claude-muted hover:text-claude-body dark:bg-white/10"
      >
        <Wrench className="h-2.5 w-2.5" />
        <span>{summary}</span>
        <span className="opacity-50">{open ? "▲" : "▼"}</span>
      </button>
    </div>
  );
}
