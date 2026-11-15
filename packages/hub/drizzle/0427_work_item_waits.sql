-- What an attempt at a task was dispatched on (`work_items.waited_on`,
-- JSON: each card or pin its task waited on, with the value it settled
-- with) is rows of `work_item_waits`, with `work_items.waits_unread`
-- beside them: whether a done task was built on a card that moved since,
-- and which live attempt hears of it (tasks.ts `builtOnOf`, `tellMoved`),
-- is read off the rows.
--
-- Null is "it waited on none", the value its one writer means by it
-- (work-items.ts `placing`: `waitedOn: request.waitedOn?.length ?
-- request.waitedOn : null`), and nothing is placed; so is `[]`. A list
-- reads as that writer built it (dispatch.ts `witnessesOf`): a list of
-- objects whose `target` and `value` are text, each target once. Each
-- witness is placed in the order kept; one kept twice with one value is
-- placed once. A key of an entry that is neither is ignored, as the hub's
-- reader ignored it.
--
-- A list that is there and does not read whole (not JSON, JSON `null`, not
-- a list, an entry that is not a target and a value of text, a target kept
-- with two values) is kept as stored in `waits_unread`, and its entries
-- that read and that no other entry contradicts are placed beside it. Each
-- card or pin its task waits on that no placed row names counts as possibly
-- decided differently since: a done task shows it was built on it, and a
-- live attempt hears it once, so no attempt is held to rest on a value the
-- hub cannot read. Today's reader threw on it. The step before this
-- migration (db/migrate.ts `waits-unread`) logs each by its item and why.
--
-- Every JSON function sits inside a CASE that proved its argument JSON:
-- SQLite may run either side of an AND first.
CREATE TABLE `work_item_waits` (
	`item_id` text NOT NULL,
	`target` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`item_id`, `target`),
	FOREIGN KEY (`item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `work_items` ADD `waits_unread` text;--> statement-breakpoint
UPDATE `work_items` SET `waits_unread` = CASE WHEN CASE WHEN CASE WHEN json_valid(waited_on) THEN coalesce((json_type(waited_on, '$') IN ('array') AND CASE WHEN json_type(waited_on, '$') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(waited_on, '$') e0 WHERE NOT coalesce((json_type(waited_on, e0.fullkey) IN ('object') AND (json_type(waited_on, e0.fullkey || '.target') IN ('text')) AND (json_type(waited_on, e0.fullkey || '.value') IN ('text'))), 0)) ELSE 0 END), 0) ELSE 0 END THEN NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(waited_on) THEN CASE WHEN json_type(waited_on) = 'array' THEN waited_on ELSE '[]' END ELSE '[]' END) e WHERE NOT (CASE WHEN CASE WHEN e.type = 'object' THEN coalesce(json_type(e.value, '$.target') = 'text' AND json_type(e.value, '$.value') = 'text', 0) ELSE 0 END THEN NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(waited_on) THEN CASE WHEN json_type(waited_on) = 'array' THEN waited_on ELSE '[]' END ELSE '[]' END) d WHERE d.id <> e.id AND CASE WHEN d.type = 'object' THEN coalesce(json_type(d.value, '$.target') = 'text' AND json_extract(d.value, '$.target') = json_extract(e.value, '$.target') AND NOT coalesce(json_type(d.value, '$.value') = 'text' AND json_extract(d.value, '$.value') = json_extract(e.value, '$.value'), 0), 0) ELSE 0 END) ELSE 0 END)) ELSE 0 END THEN NULL ELSE CAST(`waited_on` AS TEXT) END WHERE `waited_on` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `work_item_waits` (`item_id`, `target`, `value`) SELECT `work_items`.`id`, CASE WHEN e.type = 'object' THEN json_extract(e.value, '$.target') END, CASE WHEN e.type = 'object' THEN json_extract(e.value, '$.value') END FROM `work_items`, json_each(CASE WHEN json_valid(waited_on) THEN CASE WHEN json_type(waited_on) = 'array' THEN waited_on ELSE '[]' END ELSE '[]' END) e WHERE `waited_on` IS NOT NULL AND CASE WHEN CASE WHEN e.type = 'object' THEN coalesce(json_type(e.value, '$.target') = 'text' AND json_type(e.value, '$.value') = 'text', 0) ELSE 0 END THEN NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(waited_on) THEN CASE WHEN json_type(waited_on) = 'array' THEN waited_on ELSE '[]' END ELSE '[]' END) d WHERE d.id <> e.id AND CASE WHEN d.type = 'object' THEN coalesce(json_type(d.value, '$.target') = 'text' AND json_extract(d.value, '$.target') = json_extract(e.value, '$.target') AND NOT coalesce(json_type(d.value, '$.value') = 'text' AND json_extract(d.value, '$.value') = json_extract(e.value, '$.value'), 0), 0) ELSE 0 END) ELSE 0 END ORDER BY `work_items`.`rowid`, e.id;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `waited_on`;
