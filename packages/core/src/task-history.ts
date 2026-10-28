/** Every {@link TaskHistoryKind}. */
export const TASK_HISTORY_KINDS = [
  "created",
  "moved",
  "changed",
  "commented",
  "comment_edited",
  "edited",
  "archived",
  "unarchived",
  "renamed",
  "deleted",
] as const;
/**
 * `created`: its file added. `moved`: a stage move. `changed`: fields,
 * to-dos or edges, through the hub. `commented`: a comment added through the
 * hub. `comment_edited`: a comment carried from an outside source, its words
 * changed there and rewritten in place by the hub (tasks.ts `editComment`).
 * `edited`: its file changed by a commit the hub's task code did not
 * make (a hand edit, folder_write); the hub putting back what one wrote
 * around it is `changed`, in words that say so. `archived`: its file moved
 * into tasks/archive/, or added there (a merged project's archived task);
 * `unarchived`: back out of it. `renamed`, `deleted`:
 * its file.
 */
export type TaskHistoryKind = (typeof TASK_HISTORY_KINDS)[number];

/** Where a task's file is: `live` on the board, `archived` in tasks/archive/, `deleted` gone with its history kept. */
export const TASK_FILE_STATES = ["live", "archived", "deleted"] as const;
export type TaskFileState = (typeof TASK_FILE_STATES)[number];
