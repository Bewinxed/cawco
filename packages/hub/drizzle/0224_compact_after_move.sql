CREATE TABLE `limit_compactions` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`line_id` text NOT NULL,
	`move` text NOT NULL,
	`filing_uuid` text NOT NULL,
	`compact_uuid` text NOT NULL,
	`compacted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
DROP TABLE `limit_summaries`;--> statement-breakpoint
ALTER TABLE `continuations` ADD `open_items` text;--> statement-breakpoint
ALTER TABLE `limit_holds` ADD `nudge` text;--> statement-breakpoint
DELETE FROM `continuations` WHERE json_extract(`request`, '$.target.inPlace') IS NOT NULL;--> statement-breakpoint
DELETE FROM `limit_events` WHERE json_extract(`move`, '$.kind') = 'continuing';--> statement-breakpoint
UPDATE `account_routing` SET `at_limit` = json_set(`at_limit`, '$.delegateWork', 'resume') WHERE json_extract(`at_limit`, '$.delegateWork') IS NULL;