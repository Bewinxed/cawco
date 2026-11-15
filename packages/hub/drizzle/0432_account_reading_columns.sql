-- What an account's last report said of its extra usage
-- (`account_readings.overage`, JSON) is `overage_in_use`,
-- `overage_status`, `overage_disabled_reason` and `overage_resets_at`, and
-- its window set (`account_readings.window_kinds`, a JSON list of window
-- keys) is `account_window_set` rows with `window_set_named` (db/accounts.ts).
--
-- Extra usage never said stays null, as it read. A set never named is
-- `window_set_named` 0 with no rows; an empty set named is 1 with no rows,
-- so the two stay apart as null and `[]` were. A value that reads whole
-- (core `AccountOverage`; a list of text) is placed as it is, a key named
-- twice once.
--
-- A value that is there and does not read whole is kept as stored in
-- `overage_unread` or `window_set_unread`, nothing of it placed. Extra
-- usage that does not read is none, so it never reads as on (core
-- `extraUsageOn`); a window set that does not read is never named, so no
-- window counts as known by it (core usage/windows.ts `freshWindows`).
-- The account's next report that says either writes it and clears what
-- was kept. Today's reader threw on both. The step before this migration
-- (db/migrate.ts `account-readings-unread`) logs each by its row and why.
--
-- Every JSON function sits inside a CASE that proved its column JSON:
-- SQLite may run either side of an AND first.
CREATE TABLE `account_window_set` (
	`account_id` text NOT NULL,
	`window_key` text NOT NULL,
	PRIMARY KEY(`account_id`, `window_key`),
	FOREIGN KEY (`account_id`) REFERENCES `account_readings`(`account_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `account_readings` ADD `overage_in_use` integer;--> statement-breakpoint
ALTER TABLE `account_readings` ADD `overage_status` text;--> statement-breakpoint
ALTER TABLE `account_readings` ADD `overage_disabled_reason` text;--> statement-breakpoint
ALTER TABLE `account_readings` ADD `overage_resets_at` text;--> statement-breakpoint
ALTER TABLE `account_readings` ADD `overage_unread` text;--> statement-breakpoint
ALTER TABLE `account_readings` ADD `window_set_named` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `account_readings` ADD `window_set_unread` text;--> statement-breakpoint
UPDATE `account_readings` SET `overage_unread` = CASE WHEN `overage` IS NULL THEN NULL WHEN CASE WHEN json_valid(overage) THEN coalesce((json_type(overage, '$') IN ('object') AND (json_type(overage, '$.disabledReason') IN ('text', 'null')) AND (json_type(overage, '$.inUse') IN ('true', 'false')) AND (json_type(overage, '$.resetsAt') IN ('text', 'null')) AND (json_type(overage, '$.status') IN ('text', 'null'))), 0) ELSE 0 END THEN NULL ELSE CAST(`overage` AS TEXT) END, `window_set_unread` = CASE WHEN `window_kinds` IS NULL THEN NULL WHEN CASE WHEN json_valid(window_kinds) THEN coalesce((json_type(window_kinds, '$') IN ('array') AND CASE WHEN json_type(window_kinds, '$') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(window_kinds, '$') e0 WHERE NOT coalesce((json_type(window_kinds, e0.fullkey) IN ('text')), 0)) ELSE 0 END), 0) ELSE 0 END THEN NULL ELSE CAST(`window_kinds` AS TEXT) END;--> statement-breakpoint
UPDATE `account_readings` SET `overage_in_use` = CASE WHEN json_valid(overage) THEN CASE WHEN overage_unread IS NULL THEN json_type(overage, '$.inUse') = 'true' END END, `overage_status` = CASE WHEN json_valid(overage) THEN CASE WHEN overage_unread IS NULL THEN json_extract(overage, '$.status') END END, `overage_disabled_reason` = CASE WHEN json_valid(overage) THEN CASE WHEN overage_unread IS NULL THEN json_extract(overage, '$.disabledReason') END END, `overage_resets_at` = CASE WHEN json_valid(overage) THEN CASE WHEN overage_unread IS NULL THEN json_extract(overage, '$.resetsAt') END END, `window_set_named` = CASE WHEN `window_kinds` IS NOT NULL AND `window_set_unread` IS NULL THEN 1 ELSE 0 END;--> statement-breakpoint
INSERT OR IGNORE INTO `account_window_set` (`account_id`, `window_key`) SELECT r.`account_id`, j.`value` FROM `account_readings` r, json_each(CASE WHEN json_valid(r.`window_kinds`) THEN CASE WHEN r.`window_set_named` THEN r.`window_kinds` ELSE '[]' END ELSE '[]' END) j;--> statement-breakpoint
ALTER TABLE `account_readings` DROP COLUMN `overage`;--> statement-breakpoint
ALTER TABLE `account_readings` DROP COLUMN `window_kinds`;