/**
 * What a task's links say, wherever an agent or the board reads them (hub
 * presenters/tasks.ts, tasks.ts; the dashboard's task pane): its waits, what
 * it unblocks, when it is ready, a cycle refused, and a decision it was
 * built on that moved since.
 */
export const taskLinkWords = {
  /** A duplicates check that left open tasks out: only the nearest were compared. */
  notCompared: (count: number): string =>
    `${count} open ${count === 1 ? "task was" : "tasks were"} not compared: only the nearest by title words were.`,
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
  /**
   * A card or pin a done task waits on that its attempt's record of what it
   * was started on does not name, that record not reading (hub tasks.ts
   * `builtOnOf`, migration 0427): it may have been decided differently since.
   */
  maybeDecidedDifferently: "maybe decided differently",
  /** A pull request waited on, closed without merging: its wait's flag. */
  closedUnmerged: "closed unmerged",
  /** An Actions run waited on, red: its wait's flag. */
  runFailed: "failed",
  /** A date waited on (core wait-targets.ts `time`), its instant in UTC: the day and the hour, `2026-12-01`, `06:00`; midnight kept, so no viewer reads a whole day. */
  dateLabel: (day: string, time: string): string => `${day} ${time} UTC`,
  /** A date waited on that has not come yet. */
  dateNotYet: "not yet",
  /** A date waited on that has passed: its wait is settled. */
  datePassed: "passed",
  /** Why a project cannot wait on a pull request or run. */
  noGitHub:
    "the project has no GitHub connection to read it. Connect GitHub for the project first.",
  /** A live attempt's word that a card it started on moved: reopened. */
  wasReopened: "was reopened",
  /** A live attempt's word that a card it started on moved: answered differently. */
  wasAnsweredDifferently: "was answered differently",
  /**
   * A live attempt's word for a card or pin its task waits on that its
   * record of what it was started on does not name, that record not
   * reading (hub tasks.ts `tellMoved`, migration 0427).
   */
  mayHaveMoved:
    "may have been answered differently since this work started: the record of what it was started on does not read.",
  /** The comment a task's related links became when links were cut over. */
  seeAlso: "See also:",
} as const;
