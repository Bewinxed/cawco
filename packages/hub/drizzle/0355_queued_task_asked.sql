-- A `delegate` that names its task starts an attempt at it (dispatch.ts):
-- when it waits for owned files, its queued start keeps what the call asked
-- over the task file (its brief, its name and how it runs), so it starts as
-- asked. Null on every row a task_start, a hook or the dispatcher queued.
ALTER TABLE `queued_task_starts` ADD `asked` text;
