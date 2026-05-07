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
 * Desktop:  two-column layout — article content (left) + sticky chat panel (right).
 * Mobile:   single column with a tab bar that toggles between "阅读" and "聊天".
 */
export function ItemPageShell({
  item,
  isAuthenticated,
  children,
}: ItemPageShellProps) {
  const [mobileTab, setMobileTab] = useState<"read" | "chat">("read");

  if (!isAuthenticated) {
    // Unauthenticated: just show the article — no chat
    return <>{children}</>;
  }

  return (
    <>
      {/* ── Mobile tab bar (hidden on lg+) ──────────────────────────── */}
      <div className="sticky top-16 z-30 flex border-b border-claude-hairline bg-claude-canvas dark:border-white/10 dark:bg-claude-dark lg:hidden">
        <button
          onClick={() => setMobileTab("read")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium transition-colors",
            mobileTab === "read"
              ? "border-b-2 border-claude-coral text-claude-coral"
              : "text-claude-muted hover:text-claude-body"
          )}
        >
          <BookOpen className="h-3.5 w-3.5" />
          阅读
        </button>
        <button
          onClick={() => setMobileTab("chat")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium transition-colors",
            mobileTab === "chat"
              ? "border-b-2 border-claude-coral text-claude-coral"
              : "text-claude-muted hover:text-claude-body"
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          聊这条
        </button>
      </div>

      {/* ── Layout ──────────────────────────────────────────────────── */}
      <div className="lg:flex lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
        {/* Article column */}
        <div
          className={cn(
            "lg:flex-1 lg:overflow-y-auto",
            // On mobile, hide when in chat tab
            mobileTab === "chat" ? "hidden lg:block" : "block"
          )}
        >
          {children}
        </div>

        {/* Chat column */}
        <div
          className={cn(
            "lg:w-[400px] lg:shrink-0 lg:border-l lg:border-claude-hairline dark:lg:border-white/10",
            // On mobile, only show when chat tab active
            mobileTab === "read" ? "hidden lg:flex lg:flex-col" : "flex flex-col"
          )}
        >
          <ItemChatPanel
            item={item}
            visible={true}
            onClose={() => setMobileTab("read")}
          />
        </div>
      </div>
    </>
  );
}
