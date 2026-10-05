/**
 * Recent and older: the one rule for how many rows a parent lists under it,
 * whatever the parent is (a project and its sessions, a session and its
 * delegates, a delegate and its own). It lists what is recent — running or
 * waiting on the reader, any row with one such under it, and what moved
 * within the parent's `window` — topped up from the newest of the rest until
 * it lists OLDER_ROWS rows, and folds what remains under one "N older" row
 * (OlderRows), unless only one remains: a fold that would hide one row lists
 * it instead, at the same height.
 *
 * The window is the parent's: a project lists every session of the last day
 * (PROJECT_WINDOW), a handful at most. A session's delegates have none
 * (DELEGATE_WINDOW): one session starts a hundred in a day, and a day's
 * worth listed whole is the four thousand pixels of rail the fold is for.
 */
import { cawco, type InstanceRow } from "./client.svelte";
import { sessionStatus } from "./SessionMark.svelte";

/** A project lists every session that moved in the last day. */
export const PROJECT_WINDOW = 24 * 60 * 60 * 1000;
/** A session lists its newest delegates, however lately the rest moved. */
export const DELEGATE_WINDOW = 0;
/** Rows a parent lists unfolded, and its older box shows before it scrolls. */
export const OLDER_ROWS = 6;

/** What the rule reads of the fleet, read once by the list that asks. */
export interface Reading {
  /** When a row last moved. */
  lastAt: (row: InstanceRow) => number;
  now: number;
  /** The rows running now ({@link runningIds}). */
  running: ReadonlySet<string>;
}

/** Every row running now: sessions, and workflow runs still going. */
export const runningIds = (): Set<string> =>
  new Set([
    ...cawco.runningInstances.map((row) => row.id),
    ...cawco.runRows
      .filter((row) => row.status === "running")
      .map((row) => row.id),
  ]);

/**
 * Which of a parent's rows it lists, by id; the rest fold under its "N
 * older" row. `rows` are the rows directly under it, each the top of a tree
 * of its own; `under` names every row in a row's tree, so a tree stays whole
 * on the side its top row is on and nothing running is ever folded away.
 */
export function listedOf(
  rows: InstanceRow[],
  under: (row: InstanceRow) => readonly InstanceRow[],
  { lastAt, now, running }: Reading,
  window: number
): Set<string> {
  const pressing = (row: InstanceRow): boolean =>
    running.has(row.id) || cawco.activityOf(row.id) === "blocked";
  const listed = new Set<string>();
  const rest: InstanceRow[] = [];
  for (const row of rows) {
    if (
      pressing(row) ||
      now - lastAt(row) < window ||
      under(row).some(pressing)
    ) {
      listed.add(row.id);
    } else {
      rest.push(row);
    }
  }
  const room = Math.max(0, OLDER_ROWS - listed.size);
  rest.sort((a, b) => lastAt(b) - lastAt(a));
  for (const row of rest.length - room > 1 ? rest.slice(0, room) : rest) {
    listed.add(row.id);
  }
  return listed;
}

/**
 * How many of these rows failed: the status SessionMark draws the red dot
 * for, so the count and the dot are one rule.
 */
export const failedIn = (rows: Iterable<InstanceRow>): number => {
  let failed = 0;
  for (const row of rows) {
    if (sessionStatus(row) === "fail") {
      failed += 1;
    }
  }
  return failed;
};

/** The failures a folded line keeps out of sight, as its words say them. */
export const failedWords = (failed: number): string => `· ${failed} failed`;
