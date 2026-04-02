import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
}

export interface StalenessThresholds {
  fresh: number;
  aging: number;
  stale: number;
}

const DEFAULT_THRESHOLDS: StalenessThresholds = { fresh: 7, aging: 30, stale: 90 };

export function stalenessInfo(
  staleDays: number,
  thresholds: StalenessThresholds = DEFAULT_THRESHOLDS,
): { color: string; label: string; level: "fresh" | "recent" | "aging" | "stale" } {
  if (staleDays <= thresholds.fresh) return { color: "#1db954", label: "Fresh", level: "fresh" };
  if (staleDays <= thresholds.aging) return { color: "#b3b300", label: "Recent", level: "recent" };
  if (staleDays <= thresholds.stale) return { color: "#e68a00", label: "Aging", level: "aging" };
  return { color: "#e74c3c", label: "Stale", level: "stale" };
}
