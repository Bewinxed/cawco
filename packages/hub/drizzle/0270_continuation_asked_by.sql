-- Who asked for each continuation (server.ts `startContinuation`): a
-- person's own Continue starts a separate session; a session's
-- continue_session or a task's comment is folded into one session with its
-- source. A job from before was a person's, as the dashboard's Continue was.
ALTER TABLE `continuations` ADD `asked_by` text DEFAULT '{"kind":"person"}' NOT NULL;
