/** What the fleet watch says of a stalled session and what it did. */

import {
  FLEET_WATCH_LIMITS,
  type FleetWatchSignal,
  type TriageDecision,
} from "../fleet-watch";

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
