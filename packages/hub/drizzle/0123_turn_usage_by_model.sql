PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_turn_usage` (
	`instance_id` text NOT NULL,
	`result_id` text NOT NULL,
	`model` text NOT NULL,
	`account_id` text,
	`input_tokens` integer NOT NULL,
	`cache_read_tokens` integer NOT NULL,
	`cache_write_tokens` integer NOT NULL,
	`cache_write_1h_tokens` integer,
	`output_tokens` integer NOT NULL,
	`cost_usd` real,
	`keep_alive` integer NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`instance_id`, `result_id`, `model`)
);
--> statement-breakpoint
DROP TABLE `turn_usage`;--> statement-breakpoint
ALTER TABLE `__new_turn_usage` RENAME TO `turn_usage`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `turn_usage_account_at_idx` ON `turn_usage` (`account_id`,`at`);--> statement-breakpoint
CREATE INDEX `turn_usage_at_idx` ON `turn_usage` (`at`);--> statement-breakpoint
ALTER TABLE `instances` ADD `model_usage_seen` text;