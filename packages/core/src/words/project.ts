/**
 * What a project's page says around its board: the head's actions and its
 * ⋯ menu, the stages, a task card's state. The dashboard renders them from
 * here.
 */
export const projectWords = {
  /** A project's details changed, refused by the hub: what came of it, said after the hub's sentence (`hubRefusal`). */
  notChangedThen: "so it was not changed.",
  /** A place added to a project, refused by the hub (`hubRefusal`). */
  placeNotAddedThen: "so it was not added.",
  /** A place removed from a project, refused by the hub (`hubRefusal`). */
  placeNotRemovedThen: "so it was not removed.",
  /** A new project, refused by the hub (`hubRefusal`). */
  notMadeThen: "so the project was not made. Try again.",
  /** A project saved, refused by the hub (`hubRefusal`). */
  notSavedThen: "so the project was not saved. Try again.",
  /** A project forgotten, refused by the hub (`hubRefusal`). */
  notForgottenThen: "so the project was not forgotten. Try again.",
  /** A project's running sessions listed, refused by the hub (`hubRefusal`). */
  sessionsNotListedThen: "so its sessions were not listed. Try again.",
  /** A project's running sessions stopped, refused by the hub (`hubRefusal`). */
  sessionsNotStoppedThen: "so its sessions were not stopped. Try again.",
  /** The name a project made from New project's words holds until Caw names it (hub caw.ts `project_name`). */
  placeholderName: "New project",
  /** The head's New session from the project's checkout. */
  spinOff: "Spin off",
  /** The head's Ask Caw: his panel on a new conversation. */
  askCaw: "Ask Caw",
  /** The head's Full size: the project's tab fills the window, the rail and the tabs put away. */
  fullSize: "Full size",
  /** The head's way back from Full size: the rail and the tabs return. */
  exitFullSize: "Exit full size",
  /** The head's place: its name, which opens the project's details. */
  details: "Project details",
  /** The head's place's tooltip while the project's one place is its folder on the hub. */
  hubFolder: "Its folder on the hub",
  projectDetails: "Project details…",
  cawSettings: "Caw settings…",
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
