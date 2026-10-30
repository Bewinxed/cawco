/**
 * What a project's page says around its board: the head's actions and its
 * ⋯ menu, the stages, a task card's state. The dashboard renders them from
 * here, and the probe kit finds them by these same words
 * (scripts/probe-words-check.ts refuses a copy).
 */
export const projectWords = {
  /** The head's New session from the project's checkout. */
  spinOff: "Spin off",
  /** The head's Ask Caw: his panel on a new conversation. */
  askCaw: "Ask Caw",
  /** The head's place: its name, which opens the project's details. */
  details: "Project details",
  /** The head's place's tooltip while the project's one place is its folder on the hub. */
  hubFolder: "Its folder on the hub",
  /** The head's ⋯. */
  pickStages: "Pick stages…",
  projectDetails: "Project details…",
  cawSettings: "Caw settings…",
  forgetProject: "Forget project…",
  /** The stages control on a project that keeps none of its own. */
  noStages: "This project has no stages of its own yet",
  /** A task card whose attempt the hub couldn't start. */
  cantStart: "Can't start",
  /** Project details' row of the checks the hub runs before it merges work (gate.md). */
  mergeChecks: "Merge checks",
  /** That row for a project whose gate.md names no check. */
  noMergeChecks:
    "The hub merges work with no checks: this project declares none.",
  /** That row under the problems of a gate.md the hub cannot read. */
  mergeChecksUnread:
    "Until gate.md is fixed, the hub merges no work in this project.",
};
