-- What a connector poll's last call saw is rows (audit R12), one per item,
-- not a JSON map. `seen_at` says a call has looked, which a non-null map
-- said; a poll that looked keeps its last poll's time as that moment.
CREATE TABLE `connector_poll_items` (
	`poll_id` text NOT NULL,
	`item_id` text NOT NULL,
	`version` text NOT NULL,
	PRIMARY KEY(`poll_id`, `item_id`),
	FOREIGN KEY (`poll_id`) REFERENCES `connector_polls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `connector_polls` ADD `seen_at` integer;--> statement-breakpoint
UPDATE `connector_polls` SET `seen_at` = coalesce(`polled_at`, `created_at`) WHERE `seen` IS NOT NULL;--> statement-breakpoint
INSERT INTO `connector_poll_items` (`poll_id`, `item_id`, `version`)
SELECT p.`id`, s.key, s.value FROM `connector_polls` p, json_each(p.`seen`) s;
--> statement-breakpoint
ALTER TABLE `connector_polls` DROP COLUMN `seen`;
