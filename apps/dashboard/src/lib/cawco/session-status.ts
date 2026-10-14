/**
 * A session's status in the fleet's terms: the one a session's mark draws
 * (SessionMark) and the word its row is named by. Apart from the mark, which
 * reads no fleet: a page without the fleet store (an artifact's own tab,
 * whose pin card asks in place) draws marks too.
 */
import type { ThreadStatus } from "@cawco/core";
import { STOPPED_LABEL, STOPPING_LABEL } from "./activity";
import { cawco, type InstanceRow, isFailed, isStale } from "./client.svelte";
import type { MarkStatus } from "./TreeMark.svelte";
import { isThreadTab } from "./thread-tabs";

const STATUS_WORD: Record<MarkStatus, string> = {
  live: "Working",
  attn: "Needs you",
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
  instance: InstanceRow | null | undefined,
  status: MarkStatus
): string {
  if (instance?.status === "stopping") {
    return STOPPING_LABEL;
  }
  return instance?.status === "stopped" ? STOPPED_LABEL : STATUS_WORD[status];
}

/**
 * A session's status, one rule for every row that draws its mark. `done`:
 * the row is listed as finished, so a session at rest there is done rather
 * than idle.
 */
export function sessionStatus(
  instance: InstanceRow | null | undefined,
  done = false
): MarkStatus {
  if (!instance) {
    return "idle";
  }
  if (isFailed(instance)) {
    return "fail";
  }
  if (isStale(instance)) {
    return "idle";
  }
  // At rest with no process: a session put to sleep, or a workflow run
  // that ended and stopped (or is stopping: ended, its word says the
  // rest). Listed as finished, it is done.
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

/** A thread's mark is Caw at what the thread is doing (thread-tabs.ts); null for any other session. */
export const cawOf = (id: string): ThreadStatus | null =>
  isThreadTab(id) ? (cawco.threadOf(id)?.status ?? "ready") : null;
