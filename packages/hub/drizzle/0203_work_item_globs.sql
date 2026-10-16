-- The globs a work item owns are rows (audit R7), not a JSON list every
-- start read for every live item: the hub's file lock is one join of the
-- live items on their globs. A queued delegate's request keeps its globs as
-- rows too, cascading with its queue row, and its `owns` leaves the JSON.
-- Copied in each list's order (rowid); a glob listed twice is kept once.
CREATE TABLE `queued_work_item_globs` (
	`queued_id` text NOT NULL,
	`glob` text NOT NULL,
	PRIMARY KEY(`queued_id`, `glob`),
	FOREIGN KEY (`queued_id`) REFERENCES `queued_work_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `work_item_globs` (
	`item_id` text NOT NULL,
	`glob` text NOT NULL,
	PRIMARY KEY(`item_id`, `glob`),
	FOREIGN KEY (`item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `work_item_globs` (`item_id`, `glob`)
SELECT w.`id`, g.value FROM `work_items` w, json_each(w.`owns`) g
GROUP BY w.`id`, g.value
ORDER BY w.`id`, min(g.key);
--> statement-breakpoint
INSERT INTO `queued_work_item_globs` (`queued_id`, `glob`)
SELECT q.`id`, g.value FROM `queued_work_items` q, json_each(q.`request`, '$.owns') g
GROUP BY q.`id`, g.value
ORDER BY q.`id`, min(g.key);
--> statement-breakpoint
UPDATE `queued_work_items` SET `request` = json_remove(`request`, '$.owns');--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `owns`;
