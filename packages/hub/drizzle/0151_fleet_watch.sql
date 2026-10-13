CREATE TABLE `fleet_watch_notices` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`machine_id` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fleet_watch_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`on` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE `instances` ADD `watch_lines` text;