"use client";

import { useState } from "react";
import { BookOpen, Columns, MessageSquare } from "lucide-react";
import { AgentChatPanel } from "./agent-chat-panel";
import { cn } from "@/lib/utils";

interface PinnedItem {
  id: number;
  name: string;
  company: string;
  slug: string;
}

interface ItemPageShellProps {
  item: PinnedItem;
  isAuthenticated: boolean;
  /** Long-form article body — the right column shows the Agent. */
  children: React.ReactNode;
}

type ViewMode = "split" | "read" | "chat";

/**
 * Detail-page shell. Defaults to a side-by-side reading + Agent layout —
 * reading on the left at the larger 75 % share (long-form needs measure),
 * chat as a 25 % side rail on the right. The toggle bar at top can collapse
 * to either pure reading or pure chat.
 *
 * Anonymous users only get the read view (chat requires auth/memory).
 *
 * Both columns are mounted in split/single modes — visibility is toggled
 * via CSS so the chat keeps its conversation state when the reader flips
 * between modes.
 */
export function ItemPageShell({
  item,
  isAuthenticated,
  children,
}: ItemPageShellProps) {
  const [mode, setMode] = useState<ViewMode>("split");

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  const initialPrompt = `结合我的角色和当前在做的项目，告诉我从 ${item.name}（${item.company}）这条新闻里我应该带走什么。`;
  const suggestions = [
    `${item.company} 的这个更新对我有什么实际影响？`,
    `${item.name} 和同类方案相比怎么样？`,
    `基于这条新闻，我接下来应该做什么？`,
    `帮我用 3 条 bullet 总结 ${item.name} 最重要的变化。`,
  ];

  return (
    <>
      {/* Sticky toggle bar — sits below the global nav. */}
      <div className="sticky top-16 z-20 border-b border-claude-hairline bg-claude-canvas/95 backdrop-blur dark:border-white/10 dark:bg-claude-dark/95">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-3 px-5 py-2.5 sm:px-8">
          <ModeToggle mode={mode} onChange={setMode} />
          <p className="ml-auto hidden text-[11px] text-claude-muted sm:block">
            {mode === "read"
              ? "切换到双栏或对话，让 Agent 帮你拆解这条新闻"
              : mode === "chat"
                ? "切换回阅读模式查看完整新闻稿"
                : "左侧阅读 · 右侧 Agent 对话 — 双栏阅读"}
          </p>
        </div>
      </div>

      {/* Body */}
      <div
        className={cn(
          "mx-auto w-full max-w-[1400px]",
          // Reading-dominant on item page: ratio reading : chat = 3 : 1.
          // Long-form CJK needs measure; chat is a sidekick rail here.
          mode === "split" && "lg:grid lg:grid-cols-[3fr_1fr] lg:gap-0"
        )}
      >
        {/* Left: long-form article */}
        <div className={cn(mode === "chat" ? "hidden" : "block")}>
          {children}
        </div>

        {/* Right: Agent chat */}
        <aside
          className={cn(
            mode === "read" ? "hidden" : "block",
            mode === "split" &&
              "lg:sticky lg:top-[7rem] lg:self-start lg:border-l lg:border-claude-hairline dark:lg:border-white/10"
          )}
        >
          <div
            className={cn(
              mode === "chat"
                ? "h-[calc(100vh-8rem)]"
                : "h-[calc(100vh-7.5rem)]"
            )}
          >
            <AgentChatPanel
              pinnedItem={item}
              initialPrompt={initialPrompt}
              suggestions={suggestions}
              density="compact"
              headerEyebrow="AI 周报 Agent · 聊这条"
            />
          </div>
        </aside>
      </div>
    </>
  );
}

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
