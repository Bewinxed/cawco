/**
 * A session's status in the fleet's terms: the one a session's mark draws
 * (SessionMark) and the word its row is named by. Apart from the mark, which
 * reads no fleet: a page without the fleet store (an artifact's own tab,
 * whose pin card asks in place) draws marks too.
 */

import type { CawStatus } from "@cawco/core/project-conversation";
import { commonWords } from "@cawco/core/words/common";
import { STOPPED_LABEL, STOPPING_LABEL } from "./activity";
import { type BoardRow, cawco, isFailed, isStale } from "./client.svelte";
import type { MarkStatus } from "./TreeMark.svelte";

const STATUS_WORD: Record<MarkStatus, string> = {
  live: "Working",
  attn: commonWords.needsYou,
  done: "Finished",
  fail: "Failed",
  idle: "Idle",
};

/**
 * A session's status word, for its row's accessible name: colour is never
 * the only signal. A session the operator stopped says so, and says
 * "Stopping…" until its machine confirms the process gone; its mark is an
 * ended session's (no dot, no echo), so the word is where it differs.
 */
export function statusWord(
  instance: BoardRow | null | undefined,
  status: MarkStatus
): string {
  if (instance?.status === "stopping") {
    return STOPPING_LABEL;
  }
  if (instance?.stalled) {
    return STALLED_LABEL;
  }
  return instance?.status === "stopped" ? STOPPED_LABEL : STATUS_WORD[status];
}

/** A session stopped at its account's limit, in one status word. */
export const STALLED_LABEL = "Stopped at its limit";

/**
 * A session's status, one rule for every row that draws its mark. `done`:
 * the row is listed as finished, so a session at rest there is done rather
 * than idle.
 */
export function sessionStatus(
  instance: BoardRow | null | undefined,
  done = false
): MarkStatus {
  if (!instance) {
    return "idle";
  }
  // Stopped at its account's limit: an error until it moves or its account
  // resets, whatever its process is doing.
  if (isFailed(instance) || instance.stalled) {
    return "fail";
  }
  if (isStale(instance)) {
    return "idle";
  }
  // At rest with no process: a session put to sleep, or one that stopped
  // (or is stopping: ended, its word says the rest). Listed as finished, it
  // is done.
  if (
    instance.status === "sleeping" ||
    instance.status === "stopping" ||
    instance.status === "stopped"
  ) {
    return done ? "done" : "idle";
  }
  const activity = cawco.activityOf(instance.id);
  if (activity === "blocked") {
    return "attn";
  }
  if (activity === "working") {
    return "live";
  }
  return done ? "done" : "idle";
}

/**
 * A project's conversation's mark is Caw at what it is doing: the session
 * its project's row names (`conversationInstanceId`), which the project's
 * events reach. Null for any other session, which is never named Caw.
 */
export const cawOf = (id: string): CawStatus | null => {
  const projectId = cawco.rowOf(id)?.projectId;
  if (!projectId || cawco.project(projectId)?.conversationInstanceId !== id) {
    return null;
  }
  const activity = cawco.activityOf(id);
  if (activity === "blocked") {
    return "needs-you";
  }
  return activity === "working" ? "working" : "ready";
};
