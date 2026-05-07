"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteMemoryFact } from "@/app/profile/actions";
import { cn } from "@/lib/utils";

interface MemoryFactItemProps {
  id: number;
  fact: string;
  source: string;
  sourceLabel: string;
  confidence: number;
  createdAt: Date;
}

export function MemoryFactItem({
  id,
  fact,
  source,
  sourceLabel,
  confidence,
  createdAt,
}: MemoryFactItemProps) {
  const [deleted, setDeleted] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (deleted) return null;

  const handleDelete = () => {
    startTransition(async () => {
      await deleteMemoryFact(id);
      setDeleted(true);
    });
  };

  const confidenceColor =
    confidence >= 80
      ? "bg-emerald-500"
      : confidence >= 50
      ? "bg-amber-400"
      : "bg-claude-muted-soft";

  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-lg bg-white p-3.5 shadow-hairline transition-opacity dark:bg-white/[0.04]",
        isPending && "opacity-40"
      )}
    >
      {/* Source chip */}
      <span className="mt-0.5 shrink-0 rounded-pill bg-claude-surface-soft px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-uc text-claude-muted dark:bg-white/10">
        {sourceLabel}
      </span>

      {/* Fact text */}
      <span className="flex-1 text-[14px] leading-[1.55] text-claude-body dark:text-white/85">
        {fact}
      </span>

      {/* Right side: confidence dot + delete */}
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="opacity-0 transition-opacity group-hover:opacity-100 rounded p-0.5 text-claude-muted hover:text-claude-coral disabled:pointer-events-none"
          title="删除这条记忆"
          aria-label="删除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <div
          className="flex items-center gap-1"
          title={`置信度 ${confidence}%`}
        >
          <span
            className={cn("h-1.5 w-1.5 rounded-full", confidenceColor)}
          />
          <span className="text-[10px] text-claude-muted-soft">
            {confidence}%
          </span>
        </div>
      </div>
    </li>
  );
}
