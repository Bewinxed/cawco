CREATE TABLE `capability_calls` (
	`instance_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`day` text NOT NULL,
	`count` integer NOT NULL,
	`last_at` integer NOT NULL,
	PRIMARY KEY(`instance_id`, `kind`, `name`, `day`)
);
--> statement-breakpoint
CREATE INDEX `capability_calls_day` ON `capability_calls` (`day`);--> statement-breakpoint
DROP TABLE `capability_usage_daily`;