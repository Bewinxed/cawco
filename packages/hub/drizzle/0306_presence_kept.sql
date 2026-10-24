CREATE TABLE `presence_clients` (
	`client_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`session_id` text,
	`active` integer NOT NULL,
	`alerts` integer NOT NULL,
	`handheld` integer NOT NULL,
	`machine_id` text,
	`input_at` integer,
	`machine` text,
	`locked_at` integer,
	`source` text,
	`said_at` integer NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `presence_settings` ADD `away_since` integer;--> statement-breakpoint
ALTER TABLE `presence_settings` ADD `back_at` integer;--> statement-breakpoint
ALTER TABLE `presence_settings` ADD `away_after_ms` integer;--> statement-breakpoint
ALTER TABLE `presence_settings` ADD `recapped` text DEFAULT '[]' NOT NULL;