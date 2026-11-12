/**
 * What a wide screen puts in front when nothing is: the one rule, read by
 * the page (home-state `landing`, SessionSurface) and by the server's first
 * paint of `/session` ((app)/+layout.server.ts), so the server draws the
 * conversation the page would land on and the page keeps it. Pure: no
 * store, nothing of the browser.
 */
import { epochOf } from "./board.svelte";
import type { BoardRow } from "./links";
import { standsAlone } from "./tree";

/**
 * Only a session the hub can still reach is live; the rest is history. A
 * session its project is moving for (`moving`) is live work the hub carries.
 */
export const isLive = (row: Pick<BoardRow, "status">): boolean =>
  row.status === "running" ||
  row.status === "starting" ||
  row.status === "moving";

/**
 * Work another session started: a delegate, Caw's work or an agent's
 * check, which only ever nests under the session that started it
 * (`standsAlone`), or any session under a parent the fleet lists
 * (`listed`).
 */
export const isDelegateOf = (
  row: BoardRow,
  listed: (id: string) => boolean
): boolean =>
  !standsAlone(row) || (!!row.parentInstanceId && listed(row.parentInstanceId));

/** When a session last moved: its pulse, else the hub's own update time. */
export const movedAt = (row: BoardRow, pulseAt: number | undefined): number =>
  pulseAt ?? epochOf(row, "updatedAt");

/** Something waiting on the reader that opens in a session: an ask, or an artifact. */
export interface Wait {
  /** The session it opens in. */
  opens: string;
  /** When the hub first held it; one it has not stamped waits last. */
  raisedAt?: number;
}

/** The ask's session: the one whose pane draws it, else the one that asked. */
export const askOpens = (request: {
  instanceId: string;
  originInstanceId?: string | null;
}): string => request.originInstanceId ?? request.instanceId;

/**
 * The longest wait's session, else the latest work: the live session that
 * moved last, of two that moved together the first listed, never a delegate
 * and never one whose move was just cancelled (its tab closed for the
 * fleet page, move design §2c).
 */
export function landingOf(read: {
  waits: readonly Wait[];
  rows: readonly BoardRow[];
  pulseAt: (id: string) => number | undefined;
  listed: (id: string) => boolean;
  cancelled: ReadonlySet<string>;
}): string | null {
  const [longest] = [...read.waits].sort(
    (a, b) =>
      (a.raisedAt ?? Number.POSITIVE_INFINITY) -
      (b.raisedAt ?? Number.POSITIVE_INFINITY)
  );
  if (longest) {
    return longest.opens;
  }
  let latest: { at: number; id: string } | null = null;
  for (const row of read.rows) {
    if (
      !isLive(row) ||
      isDelegateOf(row, read.listed) ||
      read.cancelled.has(row.id)
    ) {
      continue;
    }
    const at = movedAt(row, read.pulseAt(row.id));
    if (latest === null || at > latest.at) {
      latest = { at, id: row.id };
    }
  }
  return latest?.id ?? null;
}
