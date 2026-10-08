CREATE TABLE `account_bench` (
	`account_id` text NOT NULL,
	`scope` text NOT NULL,
	`until` integer NOT NULL,
	PRIMARY KEY(`account_id`, `scope`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `account_catalogs` (
	`account_id` text PRIMARY KEY NOT NULL,
	`models` text NOT NULL,
	`default_efforts` text DEFAULT '{}' NOT NULL,
	`read_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `account_readings` (
	`account_id` text PRIMARY KEY NOT NULL,
	`windows` text DEFAULT '[]' NOT NULL,
	`subscription` text,
	`overage` text,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `account_routing` (
	`provider` text PRIMARY KEY NOT NULL,
	`yours` text NOT NULL,
	`delegates` text NOT NULL,
	`at_limit` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `account_signins` (
	`account_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`state` text NOT NULL,
	`home` integer DEFAULT false NOT NULL,
	`checked_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `machine_id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`hue` text NOT NULL,
	`order` integer NOT NULL,
	`never_backup` integer DEFAULT false NOT NULL,
	`reserve_pct` integer,
	`identity` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
DROP TABLE `usage_limit_history`;--> statement-breakpoint
CREATE TABLE `usage_limit_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`scope_label` text,
	`percent` integer NOT NULL,
	`severity` text NOT NULL,
	`resets_at` text,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `usage_limit_history_series_idx` ON `usage_limit_history` (`account_id`,`kind`,`fetched_at`);--> statement-breakpoint
CREATE INDEX `usage_limit_history_fetched_idx` ON `usage_limit_history` (`fetched_at`);--> statement-breakpoint
ALTER TABLE `instances` ADD `account_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `accounts` text;--> statement-breakpoint
ALTER TABLE `usage_limits` DROP COLUMN `payload`;