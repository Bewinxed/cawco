ALTER TABLE `projects` ADD `lead_instance_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `dispatch` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `max_attempts` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `review_limit` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `project_id` text;--> statement-breakpoint
CREATE INDEX `work_items_task` ON `work_items` (`project_id`,`task_id`);