/**
 * The room an account has for a pick, read from one reading of its windows
 * (the hub's `usage` frame, stores/usage.svelte.ts, or a read the pick
 * asked for now, limit-checks.svelte.ts): what is left in the window that
 * runs out first, or, past the end of one, until when it is at its limit.
 * For a model, the windows that bind every model and those scoped to its
 * family or model group (core `scopeBears`, as the hub's `fullWindow` reads them). What a
 * picker row says of it is room.ts's.
 */
import { scopeBears } from "@cawco/core/accounts";
import type { ClaudeLimits } from "@cawco/core/usage/types";

/** An account's room for a pick: what is left, or the limit it is at. */
export type Room =
  | { kind: "left"; percent: number }
  | { kind: "limit"; until: number; readAt: number; stale: boolean };

/** The part of a reading a room is read from: its windows, and when and whether they are current. */
export type RoomReading = Pick<ClaudeLimits, "fetchedAt" | "stale" | "windows">;

/** `reading`'s room for `model` (null: for the account itself) at `now`; null with no windows read. */
export function roomOf(
  reading: RoomReading | undefined,
  model: string | null,
  now: number
): Room | null {
  if (!reading || reading.windows.length === 0) {
    return null;
  }
  const binding = reading.windows.filter((window) =>
    scopeBears(window.scopeLabel, model)
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
