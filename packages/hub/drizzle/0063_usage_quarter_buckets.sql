-- Usage buckets run a quarter hour from here on. The rows already stored are
-- hour buckets and stay so: `span_ms` defaults to an hour, which is what each
-- of them is, and a quarter later reported for the same session, model and
-- hour replaces its hour's row (putUsageBuckets).
ALTER TABLE `usage_buckets` RENAME COLUMN `hour_start` TO `start`;--> statement-breakpoint
ALTER TABLE `usage_buckets` ADD `span_ms` integer DEFAULT 3600000 NOT NULL;--> statement-breakpoint
DROP INDEX `usage_buckets_hour_start_idx`;--> statement-breakpoint
DROP INDEX `usage_buckets_machine_harness_hour_idx`;--> statement-breakpoint
CREATE INDEX `usage_buckets_start_idx` ON `usage_buckets` (`start`);--> statement-breakpoint
CREATE INDEX `usage_buckets_machine_harness_start_idx` ON `usage_buckets` (`machine_id`,`harness`,`start`);
