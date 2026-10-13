CREATE TABLE `lead_turns` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`origin` text NOT NULL,
	`thread_id` text,
	`what` text,
	`started` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `project_threads`(`id`) ON UPDATE no action ON DELETE set null
);
