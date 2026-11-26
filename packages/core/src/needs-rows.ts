/**
 * The tasks waiting on the person by themselves, as Needs you lists them
 * (hub needs-rows.ts): each task in a stage of kind `you` (its review) or
 * whose routine failed, newest first, `GET /api/needs-rows`. Every other
 * thing that waits on him (a session's question, an artifact's pick) is
 * gathered by the dashboard under the conversation that holds it.
 */

/** The task a row stands for. */
export interface NeedsRowTask {
  id: string;
  projectId: string;
  /** Its stage, as the board names it. */
  stage: string;
  title: string;
  /** Why it waits on the person: in review, or its routine failed. */
  waits: "review" | "failed";
}

/** One task of Needs you. */
export interface NeedsRow {
  /** When the task last changed, ms epoch: the rows' order, newest first. */
  at: number;
  key: string;
  task: NeedsRowTask;
}

/** `GET /api/needs-rows`. */
export interface NeedsRowsRead {
  /** A sentence for each project whose tasks could not be read. */
  missing: string[];
  rows: NeedsRow[];
}
