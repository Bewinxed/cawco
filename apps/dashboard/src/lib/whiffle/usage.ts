/**
 * Usage & cost helpers for the /usage page and the pill (USAGE-SPEC.md §7).
 * The summary/blocks JSON shapes come from the hub (`/api/usage/*`); they are
 * declared here because the hub's `DbShape` types are not on the browser barrel.
 */
import type { ClaudeLimits, UsageBlock } from "@whiffle/core";

export interface UsageSummaryRow {
  cacheCreation: number;
  cacheRead: number;
  costUsd: number;
  input: number;
  key: string | number;
  messages: number;
  output: number;
  reasoning: number;
}

export interface UsageSummaryTotals {
  cacheCreation: number;
  cacheRead: number;
  costUsd: number;
  input: number;
  messages: number;
  output: number;
  reasoning: number;
}

export interface UsageSummary {
  missingPricing: string[];
  rows: UsageSummaryRow[];
  totals: UsageSummaryTotals;
}

export interface UsageLimitsResponse {
  machines: { machineId: string; hostname: string; limits: ClaudeLimits }[];
}

export interface UsageBlocksResponse {
  blocks: UsageBlock[];
}

/** Real or notional dollars — two decimals, never more. */
export const usd = (n: number): string => `$${n.toFixed(2)}`;

/** 13.1M, 581M, 1.5k — the token counts the spec quotes read this way. */
export const compactNumber = (n: number): string => {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1)}M`;
  }
  if (n >= 1000) {
    const v = n / 1000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1)}k`;
  }
  return String(n);
};

export const totalTokensOf = (r: {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  reasoning: number;
}): number => r.input + r.output + r.cacheCreation + r.cacheRead + r.reasoning;

/** The three limit bands UsageMeter colours by. */
export type Band = "calm" | "warn" | "critical";

export const band = (pct: number): Band => {
  if (pct >= 90) {
    return "critical";
  }
  return pct >= 70 ? "warn" : "calm";
};

/** A countdown to a reset — "2d 4h", "2h 14m", "14m", "resetting now". */
export const resetsIn = (resetsAt: string | null, now: number): string => {
  if (!resetsAt) {
    return "";
  }
  const diff = new Date(resetsAt).getTime() - now;
  if (diff <= 0) {
    return "resetting now";
  }
  const totalMin = Math.floor(diff / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  // A weekly window is days away; "resets in 52h 10m" makes the reader divide.
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rest = h % 24;
    return rest > 0 ? `resets in ${d}d ${rest}h` : `resets in ${d}d`;
  }
  if (h > 0) {
    return `resets in ${h}h ${m}m`;
  }
  if (m > 0) {
    return `resets in ${m}m`;
  }
  return "resets in <1m";
};
