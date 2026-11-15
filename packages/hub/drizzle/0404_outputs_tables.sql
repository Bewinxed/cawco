-- The outputs a work item and a task declare are rows of
-- `work_item_outputs` and `project_task_outputs`, not JSON in
-- `work_items.outputs` and `project_tasks.outputs`, with
-- `work_items.outputs_unread` and `project_tasks.lists_unread` beside them.
--
-- `work_items.outputs` is the record. Null is "no outputs", the value its one
-- writer means by it (work-items.ts `placing`: `outputs:
-- request.outputs?.length ? request.outputs : null`), and nothing is placed;
-- so is `[]`. A list reads as that writer built it (`outputsOf`: a list of
-- paths as text, each once): each path is placed in the order kept, one kept
-- twice placed once. A list that is there and does not read whole (not JSON,
-- JSON `null`, not a list, an entry that is not text) is kept as it was
-- stored in `outputs_unread`, and its entries that are text are placed
-- beside it: no declared path is lost. While it is set the item's landing
-- pushes nothing (landing-run.ts `outputsUnreadRefused`): the hub cannot
-- tell which of its files were declared, and an output its landing does not
-- pass over is committed with the rest.
--
-- `project_tasks` is an index of the task files, read from them. A list of
-- text is placed in the order kept, one kept twice placed once. A list that
-- does not read whole is placed for what is text and has its hash cleared,
-- so the next listing reads its file again, which holds the truth, and
-- replaces it. A file's `outputs:`, `owns:`, `checks:`, `accounts:` or
-- `waits_on:` line that does not read whole as its list (task-file.ts
-- `GOVERNING_LISTS`) fills `lists_unread` as it is read, and no attempt at
-- the task starts while that is set (dispatch.ts `startable`): an entry
-- such a line leaves out widens what the attempt does. A row whose
-- `problem` names such a line left open (the reader's words before this,
-- `<field>: is not a list`) has its hash cleared too, so it is read again
-- and fills `lists_unread`. A block list with a line that is not a
-- `- item` left no problem behind it, so its row cannot be told here: it
-- fills when its file next changes, and dispatch reads the file itself at
-- each start, so its attempt is refused before then. The step before this
-- migration (db/migrate.ts `outputs-unread`) logs each such row of either
-- table by its key and reason.
--
-- Every JSON function here sits inside a CASE that proved its argument JSON
-- of the right type: SQLite may run either side of an AND first.
CREATE TABLE `project_task_outputs` (
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`output` text NOT NULL,
	PRIMARY KEY(`project_id`, `path`, `output`),
	FOREIGN KEY (`project_id`,`path`) REFERENCES `project_tasks`(`project_id`,`path`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `work_item_outputs` (
	`item_id` text NOT NULL,
	`path` text NOT NULL,
	PRIMARY KEY(`item_id`, `path`),
	FOREIGN KEY (`item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `project_tasks` ADD `lists_unread` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `outputs_unread` text;--> statement-breakpoint
UPDATE `work_items` SET `outputs_unread` = CASE WHEN CASE WHEN CASE WHEN json_valid(`outputs`) THEN json_type(`outputs`) = 'array' ELSE 0 END THEN NOT EXISTS (SELECT 1 FROM json_each(`outputs`) e WHERE e.`type` <> 'text') ELSE 0 END THEN NULL ELSE CAST(`outputs` AS TEXT) END WHERE `outputs` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `work_item_outputs` (`item_id`, `path`) SELECT w.`id`, e.`value` FROM `work_items` w, json_each(CASE WHEN CASE WHEN json_valid(w.`outputs`) THEN json_type(w.`outputs`) = 'array' ELSE 0 END THEN w.`outputs` ELSE '[]' END) e WHERE w.`outputs` IS NOT NULL AND e.`type` = 'text' ORDER BY w.`rowid`, e.`id`;--> statement-breakpoint
INSERT OR IGNORE INTO `project_task_outputs` (`project_id`, `path`, `output`) SELECT t.`project_id`, t.`path`, e.`value` FROM `project_tasks` t, json_each(CASE WHEN CASE WHEN json_valid(t.`outputs`) THEN json_type(t.`outputs`) = 'array' ELSE 0 END THEN t.`outputs` ELSE '[]' END) e WHERE e.`type` = 'text' ORDER BY t.`rowid`, e.`id`;--> statement-breakpoint
UPDATE `project_tasks` SET `hash` = '' WHERE NOT (CASE WHEN CASE WHEN json_valid(`outputs`) THEN json_type(`outputs`) = 'array' ELSE 0 END THEN NOT EXISTS (SELECT 1 FROM json_each(`outputs`) e WHERE e.`type` <> 'text') ELSE 0 END) OR `problem` LIKE '%outputs: is not a list%' OR `problem` LIKE '%owns: is not a list%' OR `problem` LIKE '%checks: is not a list%' OR `problem` LIKE '%accounts: is not a list%' OR `problem` LIKE '%waits_on: is not a list%';--> statement-breakpoint
ALTER TABLE `project_tasks` DROP COLUMN `outputs`;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `outputs`;