CREATE TABLE `session_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_percent` integer,
	`cpu_percent` integer
);
--> statement-breakpoint
ALTER TABLE `instances` ADD `limit_notes` text;