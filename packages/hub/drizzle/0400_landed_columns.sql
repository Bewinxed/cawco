-- What a work item landed (hub stored-types.ts `WorkLanding`) is columns on
-- `work_items`, not JSON: `landed_sha`, `landed_onto`, `landed_at`,
-- `landed_gate_tree`, with `landed_unread`; and each command its landing
-- gate passed on that tree is a row of `work_item_landed_checks`.
--
-- `landed` null is "nothing of it landed", the one value the writer meant
-- by it (landing-run.ts `landedFields` writes `landed` only when a landing
-- pushed something), and every column stays null.
--
-- A landing reads as its one writer built it (landing-run.ts `landOnBase`
-- and `landOnBranch`): `sha` a commit's name; `onto` the base commit it was
-- rebased onto, or null for a push to a branch of its own; `at` epoch ms,
-- set on a branch push since 2026-10-19; `gate` the tree that landed and
-- the commands that passed on it, set since 2026-10-23. A key no field
-- reads is ignored, as the hub's reader ignored it. Each field that reads
-- is placed in its column, and a gate's commands in their order.
--
-- A landing that is there and does not read whole (not JSON, JSON `null`,
-- not an object, `sha` missing or not a commit's name, `onto` missing or
-- not a commit's name or null, `at` not a whole number of ms, a `gate` that
-- is not a tree and a list of commands) is never read as "nothing landed":
-- it is kept as it was stored in `landed_unread`, and the item's work is
-- landed, so a follow-up that ends without landing leaves it done and it is
-- never landed again. Its `sha`, `onto` and `at` that read are placed
-- beside it; its gate, read or not, vouches for no tree (a release runs its
-- checks again), and it is no branch push's lease nor its task's own
-- design landing. The step before this migration (db/migrate.ts
-- `landed-unread`) logs each such row by its id and reason.
CREATE TABLE `work_item_landed_checks` (
	`item_id` text NOT NULL,
	`command` text NOT NULL,
	PRIMARY KEY(`item_id`, `command`),
	FOREIGN KEY (`item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `work_items` ADD `landed_sha` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `landed_onto` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `landed_at` integer;--> statement-breakpoint
ALTER TABLE `work_items` ADD `landed_gate_tree` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `landed_unread` text;--> statement-breakpoint
CREATE INDEX `work_items_landed_gate_tree` ON `work_items` (`landed_gate_tree`);--> statement-breakpoint
UPDATE `work_items` SET `landed_sha` = CASE WHEN NOT (CASE WHEN json_valid(`landed`) THEN json_type(`landed`) = 'object' ELSE 0 END) THEN NULL WHEN json_type(`landed`, '$.sha') = 'text' AND length(json_extract(`landed`, '$.sha')) > 0 THEN json_extract(`landed`, '$.sha') END, `landed_onto` = CASE WHEN NOT (CASE WHEN json_valid(`landed`) THEN json_type(`landed`) = 'object' ELSE 0 END) THEN NULL WHEN json_type(`landed`, '$.onto') = 'text' AND length(json_extract(`landed`, '$.onto')) > 0 THEN json_extract(`landed`, '$.onto') END, `landed_at` = CASE WHEN NOT (CASE WHEN json_valid(`landed`) THEN json_type(`landed`) = 'object' ELSE 0 END) THEN NULL WHEN json_type(`landed`, '$.at') = 'integer' AND json_extract(`landed`, '$.at') >= 0 THEN json_extract(`landed`, '$.at') END, `landed_gate_tree` = CASE WHEN CASE WHEN CASE WHEN json_valid(`landed`) THEN json_type(`landed`) = 'object' ELSE 0 END THEN coalesce((json_type(`landed`, '$.sha') = 'text' AND length(json_extract(`landed`, '$.sha')) > 0) AND (json_type(`landed`, '$.onto') = 'null' OR (json_type(`landed`, '$.onto') = 'text' AND length(json_extract(`landed`, '$.onto')) > 0)) AND (json_type(`landed`, '$.at') IS NULL OR (json_type(`landed`, '$.at') = 'integer' AND json_extract(`landed`, '$.at') >= 0)) AND (json_type(`landed`, '$.gate') IS NULL OR (json_type(`landed`, '$.gate') = 'object' AND json_type(`landed`, '$.gate.tree') = 'text' AND length(json_extract(`landed`, '$.gate.tree')) > 0 AND json_type(`landed`, '$.gate.passed') = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`landed`, '$.gate.passed') WHERE `type` <> 'text'))), 0) ELSE 0 END THEN json_extract(`landed`, '$.gate.tree') END, `landed_unread` = CASE WHEN CASE WHEN CASE WHEN json_valid(`landed`) THEN json_type(`landed`) = 'object' ELSE 0 END THEN coalesce((json_type(`landed`, '$.sha') = 'text' AND length(json_extract(`landed`, '$.sha')) > 0) AND (json_type(`landed`, '$.onto') = 'null' OR (json_type(`landed`, '$.onto') = 'text' AND length(json_extract(`landed`, '$.onto')) > 0)) AND (json_type(`landed`, '$.at') IS NULL OR (json_type(`landed`, '$.at') = 'integer' AND json_extract(`landed`, '$.at') >= 0)) AND (json_type(`landed`, '$.gate') IS NULL OR (json_type(`landed`, '$.gate') = 'object' AND json_type(`landed`, '$.gate.tree') = 'text' AND length(json_extract(`landed`, '$.gate.tree')) > 0 AND json_type(`landed`, '$.gate.passed') = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`landed`, '$.gate.passed') WHERE `type` <> 'text'))), 0) ELSE 0 END THEN NULL ELSE CAST(`landed` AS TEXT) END WHERE `landed` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `work_item_landed_checks` (`item_id`, `command`) SELECT `work_items`.`id`, `passed`.`value` FROM `work_items`, json_each(CASE WHEN `work_items`.`landed_gate_tree` IS NOT NULL THEN `work_items`.`landed` ELSE '{}' END, '$.gate.passed') AS `passed` WHERE `work_items`.`landed_gate_tree` IS NOT NULL ORDER BY `work_items`.`rowid`, `passed`.`id`;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `landed`;