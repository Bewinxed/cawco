/**
 * A thread with a project's Caw, outside its project page, is a session like
 * any other: one row under its
 * project in the rail, the sessions its turns started nested under it, and
 * a tab in a group, drawn by ThreadPane. This is the one place that says how
 * a thread reads as a session row.
 *
 * A thread is addressed as `thread:<thread id>`, wherever a session is
 * addressed by its id: its page, its stream, a send to it. A thread not
 * started yet has its id already, minted as a send's is
 * ({@link newThreadTab}): its first send carries its project, and the hub
 * makes the thread under that id.
 */
import {
  type InstanceRow,
  type ThreadSummary,
  threadTarget,
  threadTargetOf,
} from "@cawco/core";
import type { ProjectRow } from "./client.svelte";
import { newId } from "./id";
import type { BoardRow } from "./links";
import { checkoutOf } from "./projects";
import { readJson, writeJson } from "./storage";

/** The session-shaped id a thread is listed, opened and linked by. */
export const threadTabId = (threadId: string): string =>
  threadTargetOf(threadId);

/** The thread an id names, or `null` for anything else. */
export const threadIdOf = (id: string): string | null =>
  threadTarget(id) ?? null;

/** A thread's tab: the ids ThreadPane draws. */
export const isThreadTab = (id: string): boolean =>
  threadTarget(id) !== undefined;

/** Where this browser keeps the project of each thread it minted and has not seen made yet. */
const MINTED_KEY = "cawco.threads.minted";

/** The threads this browser minted, by view id: their project, until the hub has made them. */
const minted = (): Record<string, string> =>
  readJson<Record<string, string>>(MINTED_KEY, {}, "session");

/**
 * A new thread of `projectId`'s: its id minted here, as a send's is, so
 * its tab is addressed by it from the first frame and its first send makes
 * it under that id (that send carries the project, {@link mintedProjectOf}).
 * Kept for a reload of its tab before anything was sent.
 */
export function newThreadTab(projectId: string): string {
  const id = threadTabId(newId());
  writeJson(MINTED_KEY, { ...minted(), [id]: projectId }, "session");
  return id;
}

/** The project of a thread this browser minted and the hub has not made yet, or `null`. */
export const mintedProjectOf = (id: string): string | null =>
  minted()[id] ?? null;

/** Where a thread opens: its tab, the way `/session/<id>` opens a session's. */
export const threadHref = (threadId: string): string =>
  `/session/${threadTabId(threadId)}`;

/**
 * Where a routine opens: open in its project's Routines tab
 * (ViewRoutines reads `routine`); null for a fleet routine, which has no
 * project page.
 */
export const routineHref = (routine: {
  id: string;
  projectId: string | null;
}): string | null =>
  routine.projectId
    ? `/project/${encodeURIComponent(routine.projectId)}?${new URLSearchParams({ view: "routines", routine: routine.id })}`
    : null;

/**
 * A thread as a session row, under its project: running while Caw works on
 * it or waits on you in it, at rest otherwise. It sits at the project's
 * primary checkout, else its folder on the hub; its age is its newest
 * message's.
 */
export function threadRowOf(
  thread: ThreadSummary,
  project: ProjectRow
): BoardRow {
  const place = checkoutOf(project) ?? project.places[0];
  return {
    id: threadTabId(thread.id),
    machineId: place?.machineId ?? "hub",
    cwd: place?.path ?? `projects/${project.id}`,
    harness: null,
    launchDir: "known",
    kind: "mainline",
    projectId: thread.projectId,
    sessionId: null,
    status: thread.status === "ready" ? "sleeping" : "running",
    title: thread.title,
    updatedAt: thread.lastAt,
  };
}

/** Each hub row as it hangs under its thread, while the row stands (rows are replaced whole). */
const underThreads = new WeakMap<InstanceRow, InstanceRow>();

/**
 * A session Caw's work started, under the thread it works for (the hub's
 * `threadId`) rather than under his lead session: the thread is where that
 * work was asked for.
 */
const underThread = (row: InstanceRow): InstanceRow => {
  if (!row.threadId) {
    return row;
  }
  // The same row each time: a list that keeps its array while its rows
  // are the same ones (board.svelte.ts `unlessSame`) would see a copy made anew
  // as a row that moved.
  let moved = underThreads.get(row);
  if (!moved) {
    moved = { ...row, parentInstanceId: threadTabId(row.threadId) };
    underThreads.set(row, moved);
  }
  return moved;
};

/**
 * Sessions as every list of them shows them — the rail, Home's tabs and
 * Recent, the jump palette, a machine's count: a project's Caw is its
 * threads, so his lead session is never a row of its own, and a session his
 * work started hangs under the thread it works for. The client's
 * `runningRows` and `listedRows` add the threads themselves; a list that
 * filters sessions first passes what it kept through here.
 */
export const inLists = (rows: InstanceRow[]): InstanceRow[] =>
  rows.filter((row) => row.role !== "lead").map(underThread);
