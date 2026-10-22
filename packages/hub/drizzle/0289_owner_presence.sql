CREATE TABLE `presence_devices` (
	`machine_id` text PRIMARY KEY NOT NULL,
	`counts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `presence_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`appear_away` integer NOT NULL,
	`appear_away_at` integer
);
