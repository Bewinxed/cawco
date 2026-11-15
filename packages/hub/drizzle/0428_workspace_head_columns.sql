-- Where a retired workspace's clone was as it went (`workspaces.head`,
-- JSON, core `WorkspaceCut`: the commit its HEAD was on, the `origin`
-- branch that held it, and the carry its commits went to) is `head_branch`,
-- `head_commit` and `head_carry`: whether it is cut again, and where
-- (workspaces.ts `recuttable`, `recut`), is read off the columns.
--
-- Null is "no head": a workspace that has not retired, or whose machine
-- said none; all three stay null. A head that reads whole (a branch and a
-- commit of text, a carry of text or none) is placed as it is, a head with
-- no carry leaving `head_carry` null. Nothing is recomputed.
--
-- A head that is there and does not read whole (not JSON, JSON `null`, not
-- an object, a branch or commit that is missing or no text, a carry that is
-- no text) is kept as stored in `head_unread`, none of it placed: it is no
-- known head, so the workspace is not cut again (a cut anywhere else could
-- leave its commits behind), and why says so (core work.ts `headUnread`).
-- Today's reader threw on it. The step before this migration
-- (db/migrate.ts `workspace-heads-unread`) logs each by its workspace and
-- why.
--
-- Every JSON function sits inside a CASE that proved `head` JSON: SQLite
-- may run either side of an AND first.
ALTER TABLE `workspaces` ADD `head_branch` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `head_commit` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `head_carry` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `head_unread` text;--> statement-breakpoint
UPDATE `workspaces` SET `head_unread` = CASE WHEN CASE WHEN json_valid(head) THEN coalesce((json_type(head, '$') IN ('object') AND (json_type(head, '$.branch') IN ('text')) AND (json_type(head, '$.commit') IN ('text')) AND (json_type(head, '$.carry') IS NULL OR (json_type(head, '$.carry') IN ('text')))), 0) ELSE 0 END THEN NULL ELSE CAST(`head` AS TEXT) END WHERE `head` IS NOT NULL;--> statement-breakpoint
UPDATE `workspaces` SET `head_branch` = CASE WHEN json_valid(head) THEN CASE WHEN head_unread IS NULL THEN json_extract(head, '$.branch') END END, `head_commit` = CASE WHEN json_valid(head) THEN CASE WHEN head_unread IS NULL THEN json_extract(head, '$.commit') END END, `head_carry` = CASE WHEN json_valid(head) THEN CASE WHEN head_unread IS NULL THEN json_extract(head, '$.carry') END END WHERE `head` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` DROP COLUMN `head`;
