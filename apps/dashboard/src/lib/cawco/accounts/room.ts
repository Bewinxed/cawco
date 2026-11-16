/**
 * The room an account has for a pick, as a picker row says it: what is
 * left in the window that runs out first, or, past the end of one, until
 * when it is at its limit. Read from the account's last reading (the hub's
 * `usage` frame, stores/usage.svelte.ts): its windows that bind every
 * model, and for a model also the windows scoped to its family (core
 * `modelScope`, as the hub's `fullWindow` reads them). A stored limit only
 * warns: a pick on it asks again (limit-checks.svelte.ts).
 */
import { modelScope } from "@cawco/core/accounts";
import type { ClaudeLimits } from "@cawco/core/usage/types";
import { limitPickWords as words } from "@cawco/core/words/limit-picks";
import { fmt } from "../usage/rings";
import { limitChecks } from "./limit-checks.svelte";

/** An account's room for a pick: what is left, or the limit it is at. */
export type Room =
  | { kind: "left"; percent: number }
  | { kind: "limit"; until: number; readAt: number; stale: boolean };

/** `reading`'s room for `model` (null: for the account itself) at `now`; null with no windows read. */
export function roomOf(
  reading: ClaudeLimits | undefined,
  model: string | null,
  now: number
): Room | null {
  if (!reading || reading.windows.length === 0) {
    return null;
  }
  const scope = model === null ? null : modelScope(model);
  const binding = reading.windows.filter(
    (window) =>
      window.scopeLabel === null ||
      (scope !== null && window.scopeLabel === scope)
  );
  const resets = binding.flatMap((window) => {
    const at = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;
    return window.percent >= 100 && at > now ? [at] : [];
  });
  if (resets.length > 0) {
    return {
      kind: "limit",
      until: Math.max(...resets),
      readAt: reading.fetchedAt,
      stale: reading.stale,
    };
  }
  const used = Math.max(
    0,
    ...binding
      .filter((window) => window.percent < 100)
      .map((window) => window.percent)
  );
  return { kind: "left", percent: Math.round(100 - used) };
}

/** A picker row's second line for `room`: the room left, or the limit and, while the reading is old, its age. */
function roomWords(room: Room | null, now: number): string {
  if (room === null) {
    return words.unread;
  }
  if (room.kind === "left") {
    return words.left(room.percent);
  }
  return words.atLimit(
    words.resets(room.until, now),
    room.stale ? fmt(now - room.readAt) : undefined
  );
}

/** What a picker row draws of its limit: its second line, and whether it is at its limit, being checked, or holding its pick. */
export interface LimitRow {
  checking: boolean;
  detail: string;
  held: boolean;
  limited: boolean;
}

/** The row `key`'s limit as it stands: its room, and what a check of it found (limit-checks.svelte.ts). */
export function limitRowOf(
  key: string,
  room: Room | null,
  now: number
): LimitRow {
  const answer = limitChecks.held(key);
  const away =
    room?.kind === "limit" && answer?.kind === "unasked" && answer.host
      ? words.machineAway(words.resets(room.until, now), answer.host)
      : null;
  return {
    checking: limitChecks.checking(key),
    detail: away ?? roomWords(room, now),
    held: answer !== undefined,
    limited: room?.kind === "limit",
  };
}
