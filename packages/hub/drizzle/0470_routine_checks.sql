CREATE TABLE `task_trigger_checks` (
	`trigger_id` text NOT NULL,
	`machine` text NOT NULL,
	`checked_at` integer NOT NULL,
	`outcome` text NOT NULL,
	`said` text,
	`woke_at` integer,
	`failing` integer DEFAULT 0 NOT NULL,
	`failed_slot` text,
	PRIMARY KEY(`trigger_id`, `machine`),
	FOREIGN KEY (`trigger_id`) REFERENCES `task_triggers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `task_runs` ADD `check_input` text;--> statement-breakpoint
ALTER TABLE `task_triggers` ADD `check_on` text;--> statement-breakpoint
ALTER TABLE `task_triggers` ADD `quiet_at` integer;--> statement-breakpoint
ALTER TABLE `workspaces` DROP COLUMN `routine_run`;--> statement-breakpoint
UPDATE `task_triggers` SET `target` = NULL, `problem` = 'target: command is gone: a routine''s check (check: and check_on:) gates its runs now, and its target is delegate, orchestrator or conversation.' WHERE `target` = 'command';
