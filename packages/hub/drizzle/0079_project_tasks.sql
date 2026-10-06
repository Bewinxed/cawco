CREATE TABLE `project_tasks` (
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`stage` text NOT NULL,
	`type` text,
	`after` text DEFAULT '[]' NOT NULL,
	`parent` text,
	`rank` text,
	`labels` text DEFAULT '[]' NOT NULL,
	`todos_done` integer DEFAULT 0 NOT NULL,
	`todos_total` integer DEFAULT 0 NOT NULL,
	`problem` text,
	`hash` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `path`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_tasks_id` ON `project_tasks` (`project_id`,`id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `tracker` text DEFAULT 'cawco' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `task_id` text;