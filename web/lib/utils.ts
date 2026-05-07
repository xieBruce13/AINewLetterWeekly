import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatIssueDate(date: string): string {
  // YYYY-MM-DD → "Apr 19, 2026"
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a per-item story date in Chinese, rendered in UTC.
 *
 * Story dates only carry day-level precision (the pipeline records the day
 * the news happened, not a precise instant), so we deliberately format in
 * UTC to avoid a timezone slide (e.g. `2026-04-26 00:00 UTC` rendering as
 * `2026-04-25` in US-East).
 */
export function storyDate(
  publishedAt: Date | string | null | undefined,
  issueDate?: string
): string {
  const src =
    publishedAt ?? (issueDate ? new Date(`${issueDate}T12:00:00Z`) : null);
  if (!src) return "";
  const d = typeof src === "string" ? new Date(src) : src;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function moduleEmoji(module: string): string {
  if (module === "model") return "Model";
  if (module === "product") return "Product";
  return module;
}

export function chipClassFor(tier: string): string {
  if (tier === "main")
    return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100";
  if (tier === "brief")
    return "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200";
  return "bg-slate-100 text-slate-600";
}
