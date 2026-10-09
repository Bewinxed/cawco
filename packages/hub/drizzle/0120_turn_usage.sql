CREATE TABLE `turn_usage` (
	`instance_id` text NOT NULL,
	`result_id` text NOT NULL,
	`account_id` text,
	`model` text,
	`input_tokens` integer NOT NULL,
	`cache_read_tokens` integer NOT NULL,
	`cache_write_5m_tokens` integer NOT NULL,
	`cache_write_1h_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_usd` real,
	`keep_alive` integer NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`instance_id`, `result_id`)
);
--> statement-breakpoint
CREATE INDEX `turn_usage_account_at_idx` ON `turn_usage` (`account_id`,`at`);--> statement-breakpoint
CREATE INDEX `turn_usage_at_idx` ON `turn_usage` (`at`);