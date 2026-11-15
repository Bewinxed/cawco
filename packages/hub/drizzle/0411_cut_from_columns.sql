-- Where a workspace was cut from (`workspaces.cut_from`: the workspace a
-- `delegate` call's `from` cut it from, the commit its clone took, and
-- whether its landing landed that commit's work, landing-run.ts
-- `vouchLanded`) is columns: `cut_from_workspace` (indexed: a source finds
-- its takers by it), `cut_from_commit` and `cut_from_landed`, null together
-- for a workspace cut from its repository, with `cut_from_unread`.
--
-- A source that reads whole (an object with `workspace` and `commit` text
-- and `landed` true or false; a key nothing read is ignored, as the reader
-- ignored it) is placed field by field. None (SQL null) was never set: cut
-- from its repository, all three null.
--
-- A source that is there and does not read whole (not JSON, JSON null, not
-- an object, or a field missing or not its type) is kept as stored in
-- `cut_from_unread`, and nothing of it is placed: no source finds the
-- workspace among its takers, so none counts its commit as landed by it,
-- and the source stays held with that work as its own until its parent
-- decides; the workspace's own landing vouches for no source. Today's
-- reader threw on such a value. The step before this migration
-- (db/migrate.ts `cut-from-unread`) logs each.
--
-- Every JSON function here sits inside a CASE that proved `cut_from` JSON
-- and an object: SQLite may run either side of an AND first.
ALTER TABLE `workspaces` ADD `cut_from_workspace` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `cut_from_commit` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `cut_from_landed` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `cut_from_unread` text;--> statement-breakpoint
CREATE INDEX `workspaces_cut_from` ON `workspaces` (`cut_from_workspace`);--> statement-breakpoint
UPDATE `workspaces` SET `cut_from_workspace` = CASE WHEN CASE WHEN json_valid(cut_from) THEN CASE WHEN json_type(cut_from) = 'object' THEN coalesce(json_type(cut_from, '$.workspace') = 'text' AND json_type(cut_from, '$.commit') = 'text' AND json_type(cut_from, '$.landed') IN ('true', 'false'), 0) ELSE 0 END ELSE 0 END THEN json_extract(cut_from, '$.workspace') END, `cut_from_commit` = CASE WHEN CASE WHEN json_valid(cut_from) THEN CASE WHEN json_type(cut_from) = 'object' THEN coalesce(json_type(cut_from, '$.workspace') = 'text' AND json_type(cut_from, '$.commit') = 'text' AND json_type(cut_from, '$.landed') IN ('true', 'false'), 0) ELSE 0 END ELSE 0 END THEN json_extract(cut_from, '$.commit') END, `cut_from_landed` = CASE WHEN CASE WHEN json_valid(cut_from) THEN CASE WHEN json_type(cut_from) = 'object' THEN coalesce(json_type(cut_from, '$.workspace') = 'text' AND json_type(cut_from, '$.commit') = 'text' AND json_type(cut_from, '$.landed') IN ('true', 'false'), 0) ELSE 0 END ELSE 0 END THEN json_type(cut_from, '$.landed') = 'true' END, `cut_from_unread` = CASE WHEN `cut_from` IS NULL THEN NULL WHEN CASE WHEN json_valid(cut_from) THEN CASE WHEN json_type(cut_from) = 'object' THEN coalesce(json_type(cut_from, '$.workspace') = 'text' AND json_type(cut_from, '$.commit') = 'text' AND json_type(cut_from, '$.landed') IN ('true', 'false'), 0) ELSE 0 END ELSE 0 END THEN NULL ELSE CAST(`cut_from` AS TEXT) END;--> statement-breakpoint
ALTER TABLE `workspaces` DROP COLUMN `cut_from`;