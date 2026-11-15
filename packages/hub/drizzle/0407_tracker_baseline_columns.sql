-- What a task and its issue last agreed on (`tracker_links.synced`, the
-- baseline of the tracker sync's three-way merge, tracker.ts) is columns on
-- `tracker_links`, not JSON: `synced_title`, `synced_description`,
-- `synced_stage`, `synced_state`, `synced_status`, with `synced_unread`; and
-- its labels, a set, are rows of `tracker_link_synced_labels`.
--
-- `synced` was NOT NULL from its first migration (0252): no link stored
-- "no baseline". A task with no baseline yet is one with no row here (its
-- issue named, the hub keeping no link for it), which the next sync links
-- again from the task as it stands (tracker.ts `relink`): this migration
-- does not touch it.
--
-- A baseline reads as its writers built it: an object with `title`,
-- `description`, `stage` and `state` text, `labels` a list of text, and
-- `status` text, or null or missing (GitHub's Status option; missing until
-- the binding had a Project, and removed by `forgetStatus`: the reader read
-- both as null). Writers: db/trackers.ts `putLink` (tracker.ts `putLink`:
-- `synced: { ...agreed, stage: task.stage }`), `updateLink` (tracker.ts
-- `reconcile`: `synced: round.next`) and `forgetStatus`. A key nothing
-- read is ignored, as the reader ignored it. Each field is placed in its
-- column, `status` null when null or missing, and each label once.
--
-- A baseline that is there and does not read whole (not JSON, not an
-- object, a text field missing or not text, labels not a list or with an
-- entry that is not text, status neither text nor null) is never read as
-- no baseline: it is kept as stored in `synced_unread`, and the fields of
-- it that read are placed beside it (each text field that is text, each
-- label that is text, status when text). While `synced_unread` is set the
-- link's merge is held: nothing is pulled into its task or pushed from it,
-- until a sync finds the task and its issue agreeing on every field the
-- merge compares and writes a fresh baseline (tracker.ts `reconcile`).
-- Today's reader threw on such a value and stopped its project's whole
-- sync. The step before this migration (db/migrate.ts
-- `tracker-baselines-unread`) logs each such link by its project and task,
-- and reason.
--
-- Every JSON function here sits inside a CASE that proved `synced` JSON and
-- an object: SQLite may run either side of an AND first.
CREATE TABLE `tracker_link_synced_labels` (
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`project_id`, `task_id`, `label`),
	FOREIGN KEY (`project_id`,`task_id`) REFERENCES `tracker_links`(`project_id`,`task_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `tracker_links` ADD `synced_title` text;--> statement-breakpoint
ALTER TABLE `tracker_links` ADD `synced_description` text;--> statement-breakpoint
ALTER TABLE `tracker_links` ADD `synced_stage` text;--> statement-breakpoint
ALTER TABLE `tracker_links` ADD `synced_state` text;--> statement-breakpoint
ALTER TABLE `tracker_links` ADD `synced_status` text;--> statement-breakpoint
ALTER TABLE `tracker_links` ADD `synced_unread` text;--> statement-breakpoint
UPDATE `tracker_links` SET `synced_title` = CASE WHEN CASE WHEN json_valid(synced) THEN json_type(synced) = 'object' ELSE 0 END THEN CASE WHEN json_type(synced, '$.title') = 'text' THEN json_extract(synced, '$.title') END END, `synced_description` = CASE WHEN CASE WHEN json_valid(synced) THEN json_type(synced) = 'object' ELSE 0 END THEN CASE WHEN json_type(synced, '$.description') = 'text' THEN json_extract(synced, '$.description') END END, `synced_stage` = CASE WHEN CASE WHEN json_valid(synced) THEN json_type(synced) = 'object' ELSE 0 END THEN CASE WHEN json_type(synced, '$.stage') = 'text' THEN json_extract(synced, '$.stage') END END, `synced_state` = CASE WHEN CASE WHEN json_valid(synced) THEN json_type(synced) = 'object' ELSE 0 END THEN CASE WHEN json_type(synced, '$.state') = 'text' THEN json_extract(synced, '$.state') END END, `synced_status` = CASE WHEN CASE WHEN json_valid(synced) THEN json_type(synced) = 'object' ELSE 0 END THEN CASE WHEN json_type(synced, '$.status') = 'text' THEN json_extract(synced, '$.status') END END, `synced_unread` = CASE WHEN CASE WHEN json_valid(synced) THEN CASE WHEN json_type(synced) = 'object' THEN coalesce(json_type(synced, '$.title') = 'text' AND json_type(synced, '$.description') = 'text' AND json_type(synced, '$.stage') = 'text' AND json_type(synced, '$.state') = 'text' AND CASE WHEN json_type(synced, '$.labels') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(synced, '$.labels') e WHERE e.type <> 'text') ELSE 0 END AND (json_type(synced, '$.status') IS NULL OR json_type(synced, '$.status') IN ('null', 'text')), 0) ELSE 0 END ELSE 0 END THEN NULL ELSE CAST(`synced` AS TEXT) END;--> statement-breakpoint
INSERT OR IGNORE INTO `tracker_link_synced_labels` (`project_id`, `task_id`, `label`) SELECT `project_id`, `task_id`, e.`value` FROM `tracker_links`, json_each(CASE WHEN CASE WHEN CASE WHEN json_valid(synced) THEN json_type(synced) = 'object' ELSE 0 END THEN json_type(synced, '$.labels') = 'array' END THEN json_extract(synced, '$.labels') ELSE '[]' END) e WHERE e.`type` = 'text' ORDER BY `tracker_links`.`rowid`, e.`id`;--> statement-breakpoint
ALTER TABLE `tracker_links` DROP COLUMN `synced`;