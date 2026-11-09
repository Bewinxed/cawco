/**
 * What a session needs from you right now (core activity.ts), read and
 * worded. Kept out of the runes module so it stays a plain rule anything can
 * call, including a script driving the hub.
 */
import type { Activity } from "@cawco/core/activity";
import { commonWords } from "@cawco/core/words/common";

/**
 * Blocked wins over working: a session with a permission parked for the
 * person is not making progress, whatever its turn state says. One routed
 * to its parent (`routedTo: "parent"`) waits on that agent, not on the
 * person: the session is at work until its parent answers (core
 * `waitingOnYou`).
 */
export function activityOf(session: {
  pending: readonly { routedTo?: string }[];
  busy: boolean;
  subagents?: Record<string, { status: string }>;
}): Activity {
  if (session.pending.some((request) => request.routedTo !== "parent")) {
    return "blocked";
  }
  if (session.pending.length > 0) {
    return "working";
  }
  // A background subagent outlives the turn that spawned it: the main loop goes
  // quiet and `busy` drops, while the work the session was asked for carries on
  // somewhere else. Reporting that as idle is how a rail full of running agents
  // reads as a rail with nothing happening.
  return session.busy || runningSubagents(session.subagents) > 0
    ? "working"
    : "idle";
}

/**
 * What a session's row, tab and seat say it is doing (stores/asks.svelte.ts
 * `activityNow`), from what this page holds of it. Needs you is core
 * `waitingOnYou`'s alone (`waiting`): nothing else here raises it. The
 * daemon's pulse says `blocked` for every ask its harness parked, one
 * routed to the session's parent too, so its `blocked` is read as a turn
 * waiting on an answer; whether that answer is the person's, the asks the
 * hub broadcasts say, through `waiting`.
 */
export function sessionActivity(sources: {
  /** Core `waitingOnYou` holds it: an ask parked for the person, or a card of it in Needs you. */
  waiting: boolean;
  /** Its project is moving for it. */
  moving: boolean;
  runningDelegates: number;
  /** Its frame-fed state, where this page holds one. */
  session?: Parameters<typeof activityOf>[0];
  /** Its frames stream to this page: an open tab, the peek. */
  subscribed: boolean;
  /** The daemon's pulse, the word on a session this page does not follow. */
  pulse?: Activity;
}): Activity {
  if (sources.waiting) {
    return "blocked";
  }
  if (sources.moving || sources.runningDelegates > 0) {
    return "working";
  }
  const { session, subscribed } = sources;
  // An open session's frames are live and authoritative; anything else falls
  // back to the daemon's pulse — the only word on a session this browser has
  // not subscribed to, whose frame-fed state is frozen at the tab that closed.
  const said =
    session && subscribed
      ? activityOf(session)
      : (sources.pulse ?? (session ? activityOf(session) : "idle"));
  return said === "blocked" ? "working" : said;
}

/** How many of a session's subagents are still going — 0 for a session with none. */
function runningSubagents(
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
