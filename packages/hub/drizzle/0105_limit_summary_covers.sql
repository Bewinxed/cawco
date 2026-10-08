-- A kept summary names the account that wrote it and the last transcript entry
-- it covers, and may be written at a move (percent null). A summary kept
-- before this names no coverage, so nothing can say it still answers for its
-- session's conversation: the table is made again empty, and the next
-- continuation writes a fresh one. Foreign keys are off while migrations run
-- (db/index.ts), so no PRAGMA here.
DROP TABLE `limit_summaries`;--> statement-breakpoint
CREATE TABLE `limit_summaries` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`written_on` text NOT NULL,
	`resets_at` text NOT NULL,
	`percent` integer,
	`covers` text,
	`summary` text,
	`prepared_at` integer NOT NULL
);
