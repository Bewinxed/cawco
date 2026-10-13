CREATE TABLE `session_taints` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`web` integer DEFAULT false NOT NULL,
	`from_routine` text,
	`delivered` integer DEFAULT false NOT NULL,
	`routine` text,
	`subagents` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
