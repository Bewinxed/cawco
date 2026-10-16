CREATE TABLE `machine_keys` (
	`machine_id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`admitted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `owner_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`last_address` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owner_devices_token_hash_unique` ON `owner_devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `pairing_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`changed_at` integer NOT NULL
);
