/**
 * What the person reads of a notice: a message CawCo put into a session's
 * conversation for its agent (a leak, a carry-on, a wake, a restart), drawn
 * in the person's transcript as one quiet CawCo row and never as the
 * person's own message (core transcript-rules.ts `sendRow`,
 * {@link import("../harness").CAWCO_NOTICE}). The agent reads the notice's
 * own text, unchanged; the row says in one line what happened, and opens to
 * that text.
 *
 * A notice's line is written where the notice is made, on its origin
 * (`origin.line`): the hub's leak and container words name what and whose.
 * One made with no line of its own is said by its kind, its origin's name,
 * here ({@link noticeLine}).
 */

import type { AskOutcome } from "../asks";

/** Each notice kind's line, by its `system` origin's name, for one made with no line of its own. */
const BY_KIND: Readonly<Record<string, string>> = {
  ask: "Told your answer on its ask",
  browser: "Told about the browser",
  caw: "Woke Caw",
  compaction: "Asked to file its open items and compact",
  containers: "Told about its containers",
  continuation: "Opened on the summary of its last conversation",
  keepalive: "Keep-alive ping",
  leak: "Told about processes it started",
  limit: "Told to carry on after the limit",
  "machine-pause": "Told the machine pause is over",
  plan: "Told your plan changes",
  restore: "Told about a restart",
  upstream: "Told your answer on its held post",
  "work-item": "Told about its work item",
};

/** The `system` origin name a routine's run goes under, `routine:<id>` (hub memory.ts `ROUTINE_ORIGIN`). */
const ROUTINE = "routine:";

export const noticeWords = {
  /** A notice whose kind has no line here. */
  fallback: "Note from CawCo",
  /** A routine's run, woken by its schedule or event. */
  routine: "Woke for a routine",
  /** What a notice of something that runs on says after its line while it does ({@link noticeLine}). */
  running: "· still running",
  /** And once it has ended. */
  ended: "· ended",
  /** What the agent was sent, as the row opens to it. */
  sent: "Sent to the agent",
  /** A run of notices with no turn between them: the newest one's line, and how many more the row holds. */
  more: (count: number) => `${count} more`,
  /** Processes a session started left running after what started them ended; `by` names the delegate whose they are. */
  leftRunning: (count: number, by: string | null) =>
    `${count === 1 ? "1 process" : `${count} processes`} left running${by ? ` by ${by}` : ""}`,
  /** A process a session started climbing in memory, past its machine's threshold. */
  leaking: (command: string, resident: string, by: string | null) =>
    `${command} is leaking memory (${resident})${by ? ` in ${by}` : ""}`,
  /** The containers a session's work started were stopped as it ended; `by` names the delegate. */
  containersStopped: (by: string | null) =>
    `Containers stopped as ${by ?? "this session"} ended`,
  /** A session at its account's limit, or stopped by a failed sign-in, told to go on once that is over. */
  carryOn: {
    limit: "Told to carry on: the usage limit no longer applies",
    signin: "Told to carry on: the sign-in is fixed",
  },
  /** A move to another account ended the background work its old process ran. */
  movedEnded: (tasks: number) =>
    tasks === 0
      ? "Told the account move ended its scheduled wake-ups"
      : `Told the account move ended ${tasks === 1 ? "1 background task" : `${tasks} background tasks`}`,
  /** A session reaches a container runtime with no door of CawCo's. */
  containersUntracked: "Containers it starts won't stop with it",
  /** Your answer to one of its asks (core asks.ts), by how it went. */
  askAnswered: {
    ran: "Told you approved it; it ran",
    failed: "Told you approved it; it failed",
    declined: "Told you declined it",
    cut: "Told you approved it; the hub restarted before it finished",
    answered: "Told you their answer",
    dismissed: "Told you they dismissed it",
  } satisfies Record<AskOutcome, string>,
};

/** What a notice is about, without its live state: the line written where it was made, else its kind's. */
const lineOf = (origin: { line?: string; name?: string }): string => {
  if (origin.line) {
    return origin.line;
  }
  const name = origin.name ?? "";
  if (name.startsWith(ROUTINE)) {
    return noticeWords.routine;
  }
  return BY_KIND[name] ?? noticeWords.fallback;
};

/**
 * The line a notice's row says: what it is about, and, for something that
 * runs on (a leak's processes), whether it still does: "1 process left
 * running · still running", then "· ended" once the hub has heard so.
 */
export const noticeLine = (origin: {
  line?: string;
  live?: "running" | "ended";
  name?: string;
}): string => {
  const line = lineOf(origin);
  if (!origin.live) {
    return line;
  }
  return `${line} ${origin.live === "ended" ? noticeWords.ended : noticeWords.running}`;
};
