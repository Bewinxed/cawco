-- Command checks: a `command` routine's run cuts a workspace for its one
-- command, marked with the run's id, which takes no work item and is let go
-- of unread as the run ends. Null on every row already kept: none of them
-- ran a command check.
ALTER TABLE `workspaces` ADD `routine_run` text;
