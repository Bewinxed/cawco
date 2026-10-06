CREATE TABLE `apns_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`key_id` text NOT NULL,
	`private_key` text NOT NULL,
	`bundle_id` text NOT NULL,
	`environment` text NOT NULL,
	`saved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_devices` (
	`token` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`quiet` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_sent_at` integer,
	`last_error` text
);
