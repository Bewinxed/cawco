/**
 * The words option 3 shows that are no record's own: state words, acts and
 * the few sentences the view says itself. Written by Fable (claude-fable-5-2)
 * on 2026-11-22 for this prototype; on build they move to
 * `packages/core/src/words/`.
 */
import type { LineState, OutcomeState } from "./outcomes";

const FULL_STOP = /\.$/u;

export const words = {
  view: "Outcomes",
  add: "Add an outcome with Caw",
  needsYou: "Needs you",
  open: (sentence: string) => `Open “${sentence.replace(FULL_STOP, "")}”`,
  back: "Back to outcomes",
  reword: "Change this outcome with Caw",
  asked: (who: string, when: string) => `${who} asked ${when}`,
  sending: "Sending…",
  refused:
    "Your answer was not taken: Nightly staging check changed while you were reading. Nothing was restarted. Choose again. (409)",
  offline: (at: string) =>
    `The hub is unreachable. Everything here is as of ${at}.`,
  offlineAct: "You can answer once the hub is reachable.",
  suggests: "Caw suggests",
  take: "Add this outcome",
  dismiss: "Drop this suggestion",
  lineShow: (sentence: string) => `Show what checks “${sentence}”`,
  otherWork: "Other work on this outcome",
  start: "Start a run now",
  running: "A run is already going.",
  addRoutine: "Add this routine",
  openRoutine: (name: string) => `Open routine ${name}`,
  openTask: (ref: string, title: string) => `Open task ${ref}, ${title}`,
} as const;

export const outcomeStateWord = (state: OutcomeState): string => {
  switch (state) {
    case "done":
      return "Reached";
    case "notYet":
      return "Not yet";
    case "unknown":
      return "Not known";
    default:
      return state satisfies never;
  }
};

export const lineStateWord = (state: LineState): string => {
  switch (state.kind) {
    case "done":
      return "Reached";
    case "notYet":
      return "Not yet";
    case "unknown":
      return "Not known";
    case "was":
      return "No longer checked";
    default:
      return state satisfies never;
  }
};
