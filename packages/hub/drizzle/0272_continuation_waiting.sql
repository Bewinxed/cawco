-- What a continuation waits for while its source's process holds work in
-- flight that ending it would lose (server.ts `waitStep`): the work, since
-- when it has run, and since when the job has waited, kept across restarts.
ALTER TABLE `continuations` ADD `waiting` text;
