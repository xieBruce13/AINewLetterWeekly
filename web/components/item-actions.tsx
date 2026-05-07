"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface State {
  saved: boolean;
  dismissed: boolean;
  reaction: string | null;
}

/**
 * Minimal icon row at the bottom of every news card.
 *
 * Three actions only — 收藏 / 赞 / 不太相关. The previous "隐藏" (hide)
 * action was removed: in user testing the eye-slash icon was unintuitive,
 * the action overlapped semantically with 不太相关, and "permanently hide"
 * was rarely the right behaviour for a once-a-week feed. The dismiss
 * field is kept in the DB (and the API still accepts the action so older
 * clients don't 404) but no UI surfaces it.
 */
export function ItemActions({
  itemId,
  state,
}: {
  itemId: number;
  state?: State;
}) {
  const [local, setLocal] = useState<State>(
    state ?? { saved: false, dismissed: false, reaction: null }
  );
  const [isPending, startTransition] = useTransition();

  function send(action: "save" | "like" | "dislike") {
    startTransition(async () => {
      const res = await fetch(`/api/items/${itemId}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const { state: next } = await res.json();
        setLocal(next);
      }
    });
  }

  return (
    <div className="flex items-center gap-0.5">
      <IconBtn
        label={local.saved ? "取消收藏" : "收藏"}
        onClick={() => send("save")}
        disabled={isPending}
        active={local.saved}
      >
        {local.saved ? (
          <BookmarkCheck className="h-3.5 w-3.5" />
        ) : (
          <Bookmark className="h-3.5 w-3.5" />
        )}
      </IconBtn>
      <IconBtn
        label="赞"
        onClick={() => send("like")}
        disabled={isPending}
        active={local.reaction === "like"}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </IconBtn>
      <IconBtn
        label="不太相关"
        onClick={() => send("dislike")}
        disabled={isPending}
        active={local.reaction === "dislike"}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </IconBtn>
    </div>
  );
}

/**
 * Icon button with a no-JS, instant CSS tooltip rendered above the icon.
 * Native `title` attributes on Windows take ~1.5s to surface — a hover
 * popover is much more discoverable, especially for the eye / hide icon
 * which users have repeatedly mistaken.
 */
function IconBtn({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md text-claude-muted transition-colors",
          "hover:bg-claude-surface-card hover:text-claude-ink dark:hover:bg-white/10 dark:hover:text-white",
          active && "bg-claude-coral/10 text-claude-coral",
          disabled && "opacity-50"
        )}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-claude-dark px-2 py-1 text-[11px] font-medium text-claude-on-dark opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100",
          "dark:bg-white dark:text-claude-ink"
        )}
      >
        {label}
      </span>
    </span>
  );
}
