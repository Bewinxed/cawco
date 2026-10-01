/**
 * What a session needs from you right now — the fleet view's whole vocabulary
 * (NEW.md §8 Phase 3). Kept out of the runes module so it stays a plain rule
 * anything can call, including a script driving the hub.
 */
export type Activity = "working" | "blocked" | "idle";

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
  blocked: "Needs you",
  idle: "Idle",
};

/**
 * The fourth word the rails use, and deliberately not an {@link Activity}: a
 * session that has lost its process reports no activity at all, so a resumable
 * row (`isResumable`) means this instead of claiming to be idle. `ActivityDot`
 * renders it as its own glyph now (leaf Y1) rather than this word in a pill —
 * the word survives only as that glyph's accessible name and tooltip.
 */
export const SLEEPING_LABEL = "Sleeping";

/**
 * The sixth word, for a session whose process exited badly (`isFailed`). Like
 * sleeping and unknown it is carried by `ActivityDot`'s own rendering rather
 * than a word in a pill — the word survives as the dot's accessible name and
 * tooltip only.
 */
export const FAILED_LABEL = "Failed";

/** Why a failed row is not idle, for its tooltip. */
export const FAILED_HINT =
  "Failed — the session's process exited badly. Open it to see why.";

/** Why that is not a failure, wherever a sleeping row can carry a tooltip. */
export const SLEEPING_HINT =
  "Sleeping — it resumes when you open or message it.";

/**
 * The fifth word, for the status the old system could not admit at all: a row
 * whose owning machine the hub cannot currently reach (`isStale`). It is not
 * idle — nothing said the session stopped working — and not asleep — nothing
 * said the process is gone. Rendering it as either would be exactly the stale
 * confidence ARCHITECTURE.md's derived-liveness law exists to rule out. Same
 * fate as {@link SLEEPING_LABEL}: `ActivityDot`'s hollow glyph carries this
 * now, and the word survives as its accessible name and tooltip only.
 */
export const UNKNOWN_LABEL = "Unknown";

/** Why an unknown row is not the same as idle or asleep, for its tooltip. */
export const UNKNOWN_HINT =
  "Unknown — the hub can't currently reach this session's machine.";

/**
 * The same fact as {@link UNKNOWN_HINT}, said once at the level it is actually
 * true — a machine, not each of its sessions (leaf Y1). Before this, every
 * session on an unreachable box repeated `UNKNOWN_HINT` on its own row; the
 * measured count on one board was 176 identical copies of one fact.
 */
export const MACHINE_UNREACHABLE_HINT =
  "The hub can't currently reach this machine.";
