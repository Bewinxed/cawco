-- The usage summary: one row per window period of an account (its first and
-- latest reading and the turns between) and one mark per reading that moved
-- it, kept as readings and turns arrive, so the hub's account decisions read a
-- handful of rows in place of days of usage_limit_history and turn_usage.
-- Filled from those once at the hub's start (db usage-periods.ts fill). A hold
-- keeps the move it waits to make once its session's work in flight ends
-- (later_to, later_why), so a hub restart keeps it.
CREATE TABLE `usage_period_marks` (
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`scope_label` text NOT NULL,
	`reset_minute` integer NOT NULL,
	`at` integer NOT NULL,
	`percent` integer NOT NULL,
	`tokens` real NOT NULL,
	`usd` real NOT NULL,
	PRIMARY KEY(`account_id`, `kind`, `scope_label`, `reset_minute`, `at`)
);
--> statement-breakpoint
CREATE INDEX `usage_period_marks_at_idx` ON `usage_period_marks` (`at`);--> statement-breakpoint
CREATE TABLE `usage_periods` (
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`scope_label` text NOT NULL,
	`reset_minute` integer NOT NULL,
	`first_at` integer NOT NULL,
	`first_percent` integer NOT NULL,
	`last_at` integer NOT NULL,
	`last_percent` integer NOT NULL,
	`tokens` real NOT NULL,
	`usd` real NOT NULL,
	`pending_tokens` real NOT NULL,
	`pending_usd` real NOT NULL,
	PRIMARY KEY(`account_id`, `kind`, `scope_label`, `reset_minute`)
);
--> statement-breakpoint
CREATE INDEX `usage_periods_account_last_idx` ON `usage_periods` (`account_id`,`last_at`);--> statement-breakpoint
ALTER TABLE `limit_holds` ADD `later_to` text;--> statement-breakpoint
ALTER TABLE `limit_holds` ADD `later_why` text;