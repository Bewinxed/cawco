/**
 * Pure display helpers for Option 1 (Governed canvas): relative ages,
 * hub clock timestamps, home-shortened paths, slash-wrapped path segments,
 * landing trigger labels, repository links and pending/refusal lookups.
 */
import type { BuiltInKind } from "@cawco/core/decides";
import type { LandsMode } from "@cawco/core/injected";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { ChangeId, Changes, GovernedRecord } from "./records";
import { words } from "./words";

/** The six built-in Who decides kinds, in display order. */
export const BUILT_IN_KIND_ORDER: readonly BuiltInKind[] = [
  "look",
  "behaviour",
  "scope",
  "approach",
  "rules",
  "tools",
];

/** Relative age against `nowMs`: `"just now"`, `"4m"`, `"3h"`, `"2d"`. */
export function formatAge(timestampMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - timestampMs);
  if (diff < MINUTE_MS) {
    return "just now";
  }
  if (diff < HOUR_MS) {
    return `${Math.floor(diff / MINUTE_MS)}m`;
  }
  if (diff < DAY_MS) {
    return `${Math.floor(diff / HOUR_MS)}h`;
  }
  return `${Math.floor(diff / DAY_MS)}d`;
}

/** Deterministic 24-hour clock time (`"15:34"`) for stale `As of <time>` readings. */
function formatClock(timestampMs: number): string {
  const date = new Date(timestampMs);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Shortens a path under `home` to `~/…`; leaves any other path whole. */
export function formatHomePath(path: string, home?: string): string {
  if (!home) {
    return path;
  }
  const cleanHome = home.endsWith("/") ? home.slice(0, -1) : home;
  if (!cleanHome) {
    return path;
  }
  if (path === cleanHome) {
    return "~";
  }
  if (path.startsWith(`${cleanHome}/`)) {
    return `~${path.slice(cleanHome.length)}`;
  }
  return path;
}

/**
 * Splits a path keeping each `/` attached to the preceding segment so a caller
 * can emit `<wbr />` after each separator and let long paths wrap cleanly at `/`.
 */
export function pathSegments(path: string): string[] {
  const parts = path.split("/");
  return parts.map((part, index) =>
    index < parts.length - 1 ? `${part}/` : part
  );
}

/** Short trigger label for a `LandsMode`. */
export function landingLabel(lands: LandsMode): string {
  switch (lands) {
    case "main":
      return "Default branch";
    case "branch":
      return "Branch";
    case "pr":
      return "Branch + PR";
    case "none":
      return "Outputs only";
  }
}

/** Normalizes a project repository link (`host/owner/repo`) into an HTTPS URL. */
export function repoHref(link: string): string {
  if (link.startsWith("https://") || link.startsWith("http://")) {
    return link;
  }
  return `https://${link}`;
}

const SCHEME = /^https?:\/\//u;
const GIT_SUFFIX = /\.git$/u;

/** Extracts `owner/repo` from `host/owner/repo` (or returns the trimmed link). */
export function repoShortTarget(link: string): string {
  const stripped = link.replace(SCHEME, "").replace(GIT_SUFFIX, "");
  const parts = stripped.split("/").filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[1]}/${parts[2]}`;
  }
  return stripped;
}

/** Whether `id` is waiting on the hub. */
export const isPending = (changes: Changes, id: ChangeId): boolean =>
  changes.pending.includes(id);

/** The hub's refusal words for `id`, when refused. */
export const refusalFor = (
  changes: Changes,
  id: ChangeId
): string | undefined => changes.refused[id];

/** The `ChangeId` for a Who decides kind row. */
export const decidesChangeId = (kind: BuiltInKind): ChangeId =>
  `decides.${kind}`;

/** What a part reads of the hub: whether it answers, and when what shows was read while it does not. */
export function hubReading(record: GovernedRecord): {
  asOfTime: string | null;
  reachable: boolean;
  staleMeta: string | undefined;
} {
  const asOfTime = record.hub.reachable ? null : formatClock(record.hub.asOf);
  return {
    asOfTime,
    reachable: record.hub.reachable,
    staleMeta: asOfTime ? words.hub.asOf(asOfTime) : undefined,
  };
}
