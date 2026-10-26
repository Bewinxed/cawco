/**
 * What a session needs from you right now (core activity.ts), read and
 * worded. Kept out of the runes module so it stays a plain rule anything can
 * call, including a script driving the hub.
 */
import type { Activity } from "@cawco/core/activity";
import { commonWords } from "@cawco/core/words/common";

/**
 * Blocked wins over working: a session with a parked permission is not making
 * progress, whatever its turn state says.
 */
export function activityOf(session: {
  pending: readonly unknown[];
  busy: boolean;
  subagents?: Record<string, { status: string }>;
}): Activity {
  if (session.pending.length > 0) {
    return "blocked";
  }
  // A background subagent outlives the turn that spawned it: the main loop goes
  // quiet and `busy` drops, while the work the session was asked for carries on
  // somewhere else. Reporting that as idle is how a rail full of running agents
  // reads as a rail with nothing happening.
  return session.busy || runningSubagents(session.subagents) > 0
    ? "working"
    : "idle";
}

/** How many of a session's subagents are still going — 0 for a session with none. */
export function runningSubagents(
  subagents: Record<string, { status: string }> | undefined
): number {
  if (!subagents) {
    return 0;
  }
  let running = 0;
  for (const branch of Object.values(subagents)) {
    if (branch.status === "running" || branch.status === "starting") {
      running += 1;
    }
  }
  return running;
}

/** The word each state is shown as — the enum is wire vocabulary, not copy. */
export const ACTIVITY_LABEL: Record<Activity, string> = {
  working: "Working",
  blocked: commonWords.needsYou,
  idle: "Idle",
};

/**
 * The fourth word the rails use, and deliberately not an {@link Activity}: a
 * session that has lost its process reports no activity at all, so a resumable
 * row (`isResumable`) means this instead of claiming to be idle. A row says it
 * in its tooltip and dims its mark; the word is never a pill.
 */
export const SLEEPING_LABEL = "Sleeping";

/**
 * A session the operator (or a policy) ended on purpose (`stopped`): not a
 * failure, and not asleep. A row says it where it says its status word.
 */
export const STOPPED_LABEL = "Stopped";

/**
 * A session whose end is asked and not yet confirmed by its machine
 * (`stopping`): its process may still run. Said in flight, as StopTray says
 * a row it is stopping, until the hub files it stopped.
 */
export const STOPPING_LABEL = "Stopping…";

/**
 * The sixth word, for a session whose process exited badly (`isFailed`). A row
 * carries it as its mark's dot (SessionMark), the word as its accessible name
 * and tooltip.
 */
export const FAILED_LABEL = "Failed";

/**
 * The fifth word, for the status the old system could not admit at all: a row
 * whose owning machine the hub cannot currently reach (`isStale`). It is not
 * idle — nothing said the session stopped working — and not asleep — nothing
 * said the process is gone. Rendering it as either would be exactly the stale
 * confidence ARCHITECTURE.md's derived-liveness law exists to rule out. Same
 * as {@link SLEEPING_LABEL}: a row says it in its tooltip and dims its mark.
 */
export const UNKNOWN_LABEL = "Unknown";

/** Why an unknown row is not the same as idle or asleep, for its tooltip. */
export const UNKNOWN_HINT =
  "Unknown — the hub can't currently reach this session's machine.";
