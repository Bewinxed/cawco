-- A session the person purges (its transcript deleted from the dashboard) is
-- recorded by its machine and harness session id: an agent's `find` (hub
-- find-tool.ts) leaves it out, though the machine's transcript index keeps the
-- words it read.
CREATE TABLE `purged_sessions` (
	`machine_id` text NOT NULL,
	`session_id` text NOT NULL,
	`purged_at` integer NOT NULL,
	PRIMARY KEY(`machine_id`, `session_id`)
);
