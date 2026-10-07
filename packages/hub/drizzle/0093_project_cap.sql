CREATE TABLE `spend_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`on_cap` text DEFAULT 'both' NOT NULL
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `cap_usd` real;--> statement-breakpoint
ALTER TABLE `projects` ADD `cap_period` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `on_cap` text;