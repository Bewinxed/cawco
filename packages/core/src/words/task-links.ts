/**
 * What a task's links say, wherever an agent or the board reads them (hub
 * presenters/tasks.ts, tasks.ts; the dashboard's task pane): its waits, what
 * it unblocks, when it is ready, a cycle refused, and a decision it was
 * built on that moved since.
 */
export const taskLinkWords = {
  /** The head of a task's waits: every one, unsettled first. */
  waitsOn: "Waits on:",
  /** The head of the tasks that wait on it. */
  unblocks: "Unblocks:",
  /** When a to-do task is ready, by how many of its waits are open. */
  ready: (open: number): string => {
    if (open === 0) {
      return "Ready now.";
    }
    if (open === 1) {
      return "Ready when it settles.";
    }
    return open === 2
      ? "Ready when both settle."
      : `Ready when all ${open} settle.`;
  },
  /** How a refused cycle ends, after its path. */
  cycleEnd: "would be a cycle. Nothing changed.",
  /** A write refused for closing a cycle, its path by each task's link. */
  cycle: (path: string): string => `Refused: ${path} ${taskLinkWords.cycleEnd}`,
  /** A card a done task was built on, answered differently since. */
  decidedDifferently: "decided differently",
  /** A card or pin a done task was built on, reopened since. */
  reopened: "reopened",
  /** A pull request waited on, closed without merging: its wait's flag. */
  closedUnmerged: "closed unmerged",
  /** An Actions run waited on, red: its wait's flag. */
  runFailed: "failed",
  /** Why a project cannot wait on a pull request or run. */
  noGitHub:
    "the project has no GitHub connection to read it. Connect GitHub for the project first.",
  /** A plan step's wait on a pull request no task of the project links: a step holds no link of its own. */
  prUnlinked: (url: string): string =>
    `“${url}” is a pull request no task of this project links or waits on, so the hub keeps no state of it: link it on the task it belongs to (task_update links), then wait on it.`,
  /** A live attempt's word that a card it started on moved: reopened. */
  wasReopened: "was reopened",
  /** A live attempt's word that a card it started on moved: answered differently. */
  wasAnsweredDifferently: "was answered differently",
  /** The comment a task's related links became when links were cut over. */
  seeAlso: "See also:",
} as const;
