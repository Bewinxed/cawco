CREATE TABLE `project_thread_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`instance_id` text,
	`delivery` text,
	`delivery_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `project_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_thread_messages_thread` ON `project_thread_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_threads_project` ON `project_threads` (`project_id`);--> statement-breakpoint
ALTER TABLE `instances` ADD `role` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `caw` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `caw_harness` text DEFAULT 'claude' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `caw_model` text;