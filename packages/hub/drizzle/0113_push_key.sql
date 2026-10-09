DROP TABLE `push_devices`;--> statement-breakpoint
CREATE TABLE `push_devices` (
	`pairing_id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`quiet` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_sent_at` integer,
	`last_error` text
);
