/**
 * A thread with a project's Caw, outside its project page, is a session like
 * any other, as a workflow run is (workflow-runs.ts): one row under its
 * project in the rail, the sessions its turns started nested under it, and
 * a tab in a group, drawn by ThreadPane. This is the one place that says how
 * a thread reads as a session row.
 *
 * A thread is addressed as `thread:<thread id>`; a thread not started yet,
 * whose first message will make it, as `thread:new:<project id>`.
 */
import type { InstanceRow, ThreadSummary } from "@cawco/core";

const PREFIX = "thread:";
const NEW = "thread:new:";

/** The session-shaped id a thread is listed, opened and linked by. */
export const threadTabId = (threadId: string): string => `${PREFIX}${threadId}`;

/** The tab for a new thread in `projectId`, before its first message. */
export const newThreadTabId = (projectId: string): string =>
  `${NEW}${projectId}`;

/** The thread an id names, or `null` for anything else (a new thread's tab included). */
export const threadIdOf = (id: string): string | null =>
  id.startsWith(PREFIX) && !id.startsWith(NEW) ? id.slice(PREFIX.length) : null;

/** The project a new thread's tab is for, or `null`. */
export const newThreadProjectOf = (id: string): string | null =>
  id.startsWith(NEW) ? id.slice(NEW.length) : null;

/** A thread's tab or a new thread's: the ids ThreadPane draws. */
export const isThreadTab = (id: string): boolean => id.startsWith(PREFIX);

/** Where a thread opens: its tab, the way `/session/<id>` opens a session's. */
export const threadHref = (threadId: string): string =>
  `/session/${threadTabId(threadId)}`;

/**
 * A thread as a session row, under its project: running while Caw works on
 * it or waits on you in it, at rest otherwise. It is its project's (the
 * project's machine and folder); its age is its newest message's.
 */
export function threadRowOf(
  thread: ThreadSummary,
  place: { cwd: string; machineId: string }
): InstanceRow {
  return {
    id: threadTabId(thread.id),
    machineId: place.machineId,
    cwd: place.cwd,
    projectId: thread.projectId,
    sessionId: null,
    status: thread.status === "ready" ? "sleeping" : "running",
    title: thread.title,
    updatedAt: thread.lastAt,
  };
}

/**
 * A session Caw's work started, under the thread it works for (the hub's
 * `threadId`) rather than under his lead session: the thread is where that
 * work was asked for.
 */
export const underThread = (row: InstanceRow): InstanceRow =>
  row.threadId ? { ...row, parentInstanceId: threadTabId(row.threadId) } : row;
