CREATE TABLE `limit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`at` integer NOT NULL,
	`move` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `limit_events_instance_idx` ON `limit_events` (`instance_id`);--> statement-breakpoint
CREATE TABLE `limit_holds` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`until` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `limit_summaries` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`resets_at` text NOT NULL,
	`percent` integer NOT NULL,
	`summary` text,
	`prepared_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `instances` ADD `forked_from` text;