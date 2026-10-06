CREATE TABLE `queued_work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_instance_id` text NOT NULL,
	`request` text NOT NULL,
	`title` text NOT NULL,
	`queued_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `budget` text;--> statement-breakpoint
ALTER TABLE `queued_task_starts` ADD `why` text DEFAULT 'cap' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `group_name` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `group_reported_at` integer;--> statement-breakpoint
ALTER TABLE `work_items` ADD `digest` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `owns` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `budget` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `turns` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `spend_base_usd` real DEFAULT 0 NOT NULL;