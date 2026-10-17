/**
 * Fleet watch (Projects spec §5.3, D5): the hub reads every session's stream
 * for a loop or a stall with code alone, and only a yes from Jev, or a second
 * signal, starts one triage run that decides once. Its word goes to the
 * session's lead; a session is never told about itself. The hub's side is
 * packages/hub `fleet-watch.ts`; these are the words and shapes every screen
 * shares.
 */

/**
 * What fleet watch notices, by kind. Three read the session's transcript as
 * it streams; `stall` reads its process and turn state instead (the second
 * source): a turn running with nothing streamed while its process lives.
 */
export const FLEET_WATCH_SIGNALS = [
  "error",
  "repeat",
  "quiet",
  "stall",
] as const;
export type FleetWatchSignal = (typeof FLEET_WATCH_SIGNALS)[number];

/**
 * When each signal opens. Fixed in code, shown as facts in Settings.
 * `quietTurns` is our call (no source sets it): six finished turns of a
 * session that changed no file is long past a turn of reading or planning.
 */
export const FLEET_WATCH_LIMITS = {
  /** The same tool error, normalised, this many times in the session's recent turns. */
  sameError: 3,
  /** The turns `sameError` counts over. */
  errorTurns: 10,
  /** The same tool call (name and normalised input) this many times in a row. */
  sameCall: 3,
  /** Finished turns in a row that changed no file. */
  quietTurns: 6,
  /** Minutes a running turn streams nothing while its process lives. */
  stallMinutes: 10,
} as const;

/** What one triage decides, exactly one of these. */
export const TRIAGE_DECISIONS = [
  "nudge",
  "interrupt",
  "stop",
  "tell",
  "leave",
] as const;
export type TriageDecision = (typeof TRIAGE_DECISIONS)[number];

/** One open signal, as the hub words it: the line a transcript and a notice read. */
export interface FleetWatchSignalOpen {
  kind: FleetWatchSignal;
  /** Sentence case, no full stop: "Same Bash call 3 times in a row". */
  line: string;
}

/** The words for an open signal; `detail` is the tool's name (repeat) or the error's first words (error). */
export const signalLine = (kind: FleetWatchSignal, detail?: string): string => {
  switch (kind) {
    case "error":
      return detail
        ? `Same error ${FLEET_WATCH_LIMITS.sameError} times: “${detail}”`
        : `Same error ${FLEET_WATCH_LIMITS.sameError} times`;
    case "repeat":
      return `Same ${detail ?? "tool"} call ${FLEET_WATCH_LIMITS.sameCall} times in a row`;
    case "quiet":
      return `No file changed in ${FLEET_WATCH_LIMITS.quietTurns} turns`;
    case "stall":
      break;
  }
  return `No output for ${FLEET_WATCH_LIMITS.stallMinutes} min in a running turn`;
};

/** What a decision did, as the tail of a fleet-watch line: "nudged Caw", "told you". */
export const decisionWords = (
  decision: TriageDecision,
  lead?: string
): string => {
  switch (decision) {
    case "nudge":
      return lead === undefined || lead === "you"
        ? "told you"
        : `nudged ${lead}`;
    case "interrupt":
      return "interrupted it";
    case "stop":
      return "stopped it";
    case "tell":
      return "told you";
    case "leave":
      break;
  }
  return "left it";
};

/**
 * A needs-you notice from fleet watch: a triage told you, or a session in a
 * project whose Caw is off showed two signals (no model is woken there).
 * Kept by the hub until you act on the session or it moves on.
 */
export interface FleetWatchNotice {
  /** ms epoch the hub raised it. */
  at: number;
  /** Why, in a sentence or two: the triage's words, or the signals. */
  body: string;
  id: string;
  instanceId: string;
  machineId: string;
  projectId: string | null;
  /** The line: its signals, joined with " · ". */
  title: string;
}

/** Hub-originated: every open fleet-watch notice, whole, on each change. */
export interface FleetWatchNoticesFrame {
  instanceId?: undefined;
  kind: "fleet_watch.notices";
  notices: FleetWatchNotice[];
}

/** Fleet watch's settings and facts, as Settings reads them. */
export interface FleetWatchSettings {
  /** Jev answers fleet watch's question: it has a route (a TypeSafe key, or OpenRouter). */
  jev: boolean;
  limits: typeof FLEET_WATCH_LIMITS;
  on: boolean;
}
