CREATE TABLE `routine_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`slot` text NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`state` text NOT NULL,
	`work_item_id` text,
	`outcome` text,
	`output` text,
	`reason` text,
	`usd` real,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_runs_slot` ON `routine_runs` (`routine_id`,`slot`,`attempt`);--> statement-breakpoint
CREATE INDEX `routine_runs_item` ON `routine_runs` (`work_item_id`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`cron` text NOT NULL,
	`time_zone` text NOT NULL,
	`target` text NOT NULL,
	`prompt` text NOT NULL,
	`delegate_type` text,
	`lands` text DEFAULT 'none' NOT NULL,
	`budget` text,
	`daily_cap_usd` real,
	`enabled` integer DEFAULT true NOT NULL,
	`disabled_reason` text,
	`created_by` text NOT NULL,
	`keep` integer DEFAULT false NOT NULL,
	`expires_at` integer,
	`last_slot` integer,
	`next_slot` integer NOT NULL,
	`thread_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routines_project` ON `routines` (`project_id`);--> statement-breakpoint
ALTER TABLE `work_items` ADD `summary` text;