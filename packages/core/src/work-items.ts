/**
 * A work item's life: starting, running, then how it ended. Only `starting`
 * and `running` take messages. The hub keeps it on every work item (its db
 * schema.ts `WorkItemState`), and a task's attempt is a work item.
 */
export const WORK_ITEM_STATES = [
  "starting",
  "running",
  "done",
  "failed",
  "cancelled",
] as const;
export type WorkItemState = (typeof WORK_ITEM_STATES)[number];

/** How an attempt or a delegate's work item ended. */
export type ItemEnd = Extract<WorkItemState, "done" | "failed" | "cancelled">;
