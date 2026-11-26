/**
 * Needs you's rows as the hub assembles them (hub needs-rows.ts): one row
 * per piece of stopped work, newest first. A task waiting on the person
 * (in a stage of kind `you`, or its routine failed) and every open
 * question about it are one row; the questions of a session about no task
 * are one row for that session. A question is about a task when it names
 * one (`ask`'s `task`) or its session is an attempt at it; an artifact is
 * about the task its holder works on. The dashboard draws the rows in this
 * order, each item read from what it already holds (the parked asks, the
 * artifact lane), and `GET /api/needs-rows` answers them.
 */

/** The task a row stands for. */
export interface NeedsRowTask {
  id: string;
  projectId: string;
  /** Its stage, as the board names it. */
  stage: string;
  title: string;
  /** Why it waits on the person by itself: in review, or its routine failed; null while it waits only through its questions. */
  waits: "review" | "failed" | null;
}

/** One row of Needs you. */
export interface NeedsRow {
  /** Its artifacts waiting on the person, by id, newest first. */
  artifacts: string[];
  /** Its parked asks, by request id, newest first. */
  asks: string[];
  /** When its newest item was raised, ms epoch: the rows' order, newest first. */
  at: number;
  /** The session whose questions it holds, when it stands for no task. */
  instanceId: string | null;
  key: string;
  /** When its work began waiting on the person, ms epoch: its oldest item's raise. */
  since: number;
  task: NeedsRowTask | null;
}

/** `GET /api/needs-rows`. */
export interface NeedsRowsRead {
  /** A sentence for each project whose tasks could not be read. */
  missing: string[];
  rows: NeedsRow[];
}
