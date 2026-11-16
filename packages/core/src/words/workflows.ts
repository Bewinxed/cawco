/**
 * What a transcript draws of the sends CawCo's workflow engine stored before
 * it went (71a7fe2155, 2026-10-23): a run's notices to its supervising
 * session and its steps' briefs, each a note of the hub's (core injected.ts
 * `parseWorkflowNotice`, `parseWorkflowStep`), never the person's words.
 */
export const workflowWords = {
  /** The note's kind. */
  noteKind: "Workflow",
  /** A run's notice, titled by its workflow and what happened. */
  noticeTitle: (workflow: string, event: string) => `${workflow}: ${event}`,
  /** A step's brief, titled by its workflow and the step. */
  stepTitle: (workflow: string, step: string) => `${workflow}: step ${step}`,
};
