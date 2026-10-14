CREATE TABLE `lead_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`instance_id` text NOT NULL,
	`thread_id` text,
	`request_id` text NOT NULL,
	`tool_use_id` text,
	`tool` text NOT NULL,
	`command` text NOT NULL,
	`files` text NOT NULL,
	`writes` integer NOT NULL,
	`outcome` text NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`why` text,
	`exit` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lead_calls_project_at` ON `lead_calls` (`project_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `lead_calls_request` ON `lead_calls` (`request_id`);