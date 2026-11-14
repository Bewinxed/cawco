-- A work item's landing gate passes (hub stored-types.ts `GatePass`, by
-- what each passed on: gate.ts `passKey`) are rows of
-- `work_item_gate_passes`, not JSON in `work_items.gate_passes`, with
-- `gate_passes_unread` beside them.
--
-- `gate_passes` null is "no passes", the value its writers mean by it
-- (work-items.ts `finish` writes null as an item ends; a live item that
-- has passed nothing has none), and nothing is placed. An empty object, or
-- a key whose list `dropPasses` emptied, is no passes too.
--
-- A record reads as its writers built it (gate.ts `keepPass`, `dropPasses`):
-- an object whose every key is what its passes passed on (a tree, or
-- `inputs <path>=<tree> ...`) and holds a list of passes, each an object
-- whose `command` and `stage` are text. A key of a pass that is neither is
-- ignored, as the hub's reader ignored it. Each pass is placed under its
-- key, in the order kept; one kept twice is placed once.
--
-- A record that is there and does not read whole (not JSON, JSON `null`,
-- not an object, a key that holds no list, a pass that is not a command
-- and a stage) is kept as it was stored in `gate_passes_unread`, and none
-- of its passes is placed, those that read included: each pass vouches for
-- a tree, and a record the hub cannot read vouches for none, so the item's
-- gate runs every step again. The step before this migration (db/migrate.ts
-- `gate-passes-unread`) logs each such row by its id and reason.
CREATE TABLE `work_item_gate_passes` (
	`item_id` text NOT NULL,
	`pass_key` text NOT NULL,
	`command` text NOT NULL,
	`stage` text NOT NULL,
	PRIMARY KEY(`item_id`, `pass_key`, `command`, `stage`),
	FOREIGN KEY (`item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `work_items` ADD `gate_passes_unread` text;--> statement-breakpoint
UPDATE `work_items` SET `gate_passes_unread` = CASE WHEN CASE WHEN CASE WHEN json_valid(`gate_passes`) THEN json_type(`gate_passes`) = 'object' ELSE 0 END THEN NOT EXISTS (SELECT 1 FROM json_each(`gate_passes`) k WHERE NOT (CASE WHEN k.`type` = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(k.`value`) p WHERE NOT (CASE WHEN p.`type` = 'object' THEN coalesce(json_type(p.`value`, '$.command') = 'text' AND json_type(p.`value`, '$.stage') = 'text', 0) ELSE 0 END)) ELSE 0 END)) ELSE 0 END THEN NULL ELSE CAST(`gate_passes` AS TEXT) END WHERE `gate_passes` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `work_item_gate_passes` (`item_id`, `pass_key`, `command`, `stage`) SELECT w.`id`, k.`key`, CASE WHEN p.`type` = 'object' THEN json_extract(p.`value`, '$.command') END, CASE WHEN p.`type` = 'object' THEN json_extract(p.`value`, '$.stage') END FROM `work_items` w, json_each(CASE WHEN w.`gate_passes` IS NOT NULL AND w.`gate_passes_unread` IS NULL THEN w.`gate_passes` ELSE '{}' END) k, json_each(CASE WHEN k.`type` = 'array' THEN k.`value` ELSE '[]' END) p WHERE w.`gate_passes` IS NOT NULL AND w.`gate_passes_unread` IS NULL AND p.`type` = 'object' ORDER BY w.`rowid`, k.`id`, p.`id`;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `gate_passes`;