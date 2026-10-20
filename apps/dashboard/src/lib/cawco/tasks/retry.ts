/**
 * Whether a task's live attempt is a retry: pure, and apart from
 * project-tasks.ts (the hub's wrappers and their imports) so a task's
 * views can ask it without loading them.
 */
import type { TaskSummary } from "../project-tasks";

/** An attempt runs at a task whose attempt before it failed or was stopped. */
export const isRetry = (task: TaskSummary): boolean => {
  const [newest, before] = task.attempts;
  return (
    task.liveAttempt &&
    (newest?.state === "starting" || newest?.state === "running") &&
    (before?.state === "failed" || before?.state === "cancelled")
  );
};
