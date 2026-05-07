"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact inline disclosure for the personalized "Why this for you" rationale.
 *
 * Collapsed: a small text link "为何推荐 ▾" — no chip, no background, no
 * fighting with the action row. When expanded the rationale appears in a
 * subtle cream callout below, pushing the rest of the card down.
 */
export function WhyShown({ reason }: { reason: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[12px] text-claude-muted hover:text-claude-coral"
      >
        <Sparkles className="h-3 w-3" />
        为何推荐
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <p className="mt-2 rounded-md bg-claude-surface-soft px-3 py-2 text-[13px] leading-[1.5] text-claude-body dark:bg-white/[0.04] dark:text-white/80">
          {reason}
        </p>
      )}
    </div>
  );
}
