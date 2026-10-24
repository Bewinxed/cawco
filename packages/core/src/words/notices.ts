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

/** Each notice kind's line, by its `system` origin's name, for one made with no line of its own. */
const BY_KIND: Readonly<Record<string, string>> = {
  admin: "Told how an admin change went",
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
};

/** The line a notice's row says: the one written where it was made, else its kind's. */
export const noticeLine = (origin: {
  line?: string;
  name?: string;
}): string => {
  if (origin.line) {
    return origin.line;
  }
  const name = origin.name ?? "";
  if (name.startsWith(ROUTINE)) {
    return noticeWords.routine;
  }
  return BY_KIND[name] ?? noticeWords.fallback;
};
