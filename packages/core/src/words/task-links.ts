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
} as const;
