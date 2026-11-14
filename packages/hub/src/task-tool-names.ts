/**
 * The task tools' names: task-tools.ts serves them (its `TaskTool` is one of
 * them), and roles.ts lists which roles may call each.
 */

/** Every task tool, by name. */
export const TASK_TOOL_NAMES = [
  "task_create",
  "task_read",
  "task_update",
  "task_link",
  "task_start",
  "task_retry",
  "todo_write",
  "task_comment",
  "task_archive",
  "task_result",
] as const;
