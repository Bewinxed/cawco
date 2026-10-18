CREATE TABLE `tracker_bindings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`connection` text NOT NULL,
	`target` text NOT NULL,
	`target_name` text NOT NULL,
	`target_url` text NOT NULL,
	`bound_at` integer NOT NULL,
	`cursor` text NOT NULL,
	`state` text NOT NULL,
	`reason` text,
	`polled_at` integer,
	`resume_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tracker_comments` (
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`remote_id` text NOT NULL,
	`origin` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `remote_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tracker_comments_task` ON `tracker_comments` (`project_id`,`task_id`);--> statement-breakpoint
CREATE TABLE `tracker_links` (
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`provider` text NOT NULL,
	`issue_key` text NOT NULL,
	`ref` text NOT NULL,
	`url` text NOT NULL,
	`synced` text NOT NULL,
	`remote_updated_at` integer NOT NULL,
	`problem` text,
	`synced_at` integer,
	`linked_at` integer NOT NULL,
	`unvouched` text,
	PRIMARY KEY(`project_id`, `task_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracker_links_issue` ON `tracker_links` (`project_id`,`provider`,`issue_key`);