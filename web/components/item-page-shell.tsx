"use client";

import { useState } from "react";
import { BookOpen, MessageSquare } from "lucide-react";
import { ItemChatPanel } from "./item-chat-panel";
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
  children: React.ReactNode; // the article content
}

/**
 * Detail-page shell with a sticky top toggle that flips between
 * "阅读" (read) and "聊这条" (chat) modes — they're mutually exclusive
 * and full-width, no side-by-side layout.
 *
 * Anonymous users only get the read view (chat requires auth/memory).
 */
export function ItemPageShell({
  item,
  isAuthenticated,
  children,
}: ItemPageShellProps) {
  const [mode, setMode] = useState<"read" | "chat">("read");

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Sticky tab bar — sits below the global nav (top-16). Persists on
          scroll so the user can flip modes without scrolling back up. */}
      <div className="sticky top-16 z-30 border-b border-claude-hairline bg-claude-canvas/95 backdrop-blur dark:border-white/10 dark:bg-claude-dark/95">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-1 px-5 py-2 sm:px-8 lg:px-12">
          <ModeButton
            active={mode === "read"}
            onClick={() => setMode("read")}
            icon={<BookOpen className="h-3.5 w-3.5" />}
            label="阅读"
          />
          <ModeButton
            active={mode === "chat"}
            onClick={() => setMode("chat")}
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            label="聊这条"
          />
          <p className="ml-auto hidden text-[11px] text-claude-muted sm:block">
            {mode === "read"
              ? "切换到聊天，让 Agent 帮你拆解这条新闻"
              : "切换回阅读模式查看完整新闻稿"}
          </p>
        </div>
      </div>

      {/* Mutually exclusive panes. Both are mounted but visibility-toggled
          so React keeps chat's local state (messages, input) when the user
          flips back to read mode and back. */}
      <div className={mode === "read" ? "block" : "hidden"}>{children}</div>
      <div
        className={cn(
          "min-h-[calc(100vh-8rem)]",
          mode === "chat" ? "block" : "hidden"
        )}
      >
        <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-7xl flex-col px-0 sm:px-4 lg:px-8">
          <ItemChatPanel item={item} visible />
        </div>
      </div>
    </>
  );
}

function ModeButton({
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
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-claude-coral text-white shadow-sm"
          : "text-claude-muted hover:bg-claude-surface-soft hover:text-claude-body dark:hover:bg-white/[0.05]"
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}
