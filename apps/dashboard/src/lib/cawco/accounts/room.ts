/**
 * What a picker row says of an account's room (room-of.ts): what is left,
 * or the limit it is at and, while the reading is old, its age; and what a
 * check of it found. A stored limit only warns: a pick on it asks again
 * (limit-checks.svelte.ts).
 */
import { limitPickWords as words } from "@cawco/core/words/limit-picks";
import { fillState, type MeterState } from "../usage";
import { fmt } from "../usage/rings";
import { limitChecks } from "./limit-checks.svelte";
import type { Room } from "./room-of";

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

/**
 * What a picker row draws of its limit: its second line, whether it is at
 * its limit, being checked, or holding its pick, and, when the check could
 * read nothing, why (its tooltip's last line).
 */
export interface LimitRow {
  checking: boolean;
  detail: string;
  held: boolean;
  limited: boolean;
  why: string | null;
}

/** The row `key`'s limit as it stands: its room, and what a check of it found (limit-checks.svelte.ts). */
export function limitRowOf(
  key: string,
  room: Room | null,
  now: number
): LimitRow {
  const answer = limitChecks.held(key);
  const unread = answer?.kind === "unread" ? answer.why : null;
  return {
    checking: limitChecks.checking(key),
    detail:
      room?.kind === "limit" && unread !== null
        ? words.unchecked(words.resets(room.until, now))
        : roomWords(room, now),
    held: answer !== undefined,
    limited: room?.kind === "limit",
    why: unread,
  };
}

/** An account's room as the house ring draws it (UsageRing): the share left, in the state of what is used; at its limit, the ring reached (stale while its reading is old). */
export function meterOf(
  room: Room | null
): { share: number; state: MeterState } | null {
  if (room === null) {
    return null;
  }
  if (room.kind === "limit") {
    return { share: 0, state: room.stale ? "stale" : "reached" };
  }
  return { share: room.percent, state: fillState(100 - room.percent) };
}
