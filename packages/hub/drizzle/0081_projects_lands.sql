CREATE TABLE `queued_task_starts` (
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`stage` text NOT NULL,
	`parent_instance_id` text,
	`queued_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `task_id`)
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `lands` text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `lands` text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `outputs` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `pr_url` text;