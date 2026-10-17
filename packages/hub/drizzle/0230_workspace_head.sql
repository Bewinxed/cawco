-- A retired workspace is cut again where its clone's HEAD was when its
-- machine deleted it (work-items.ts `recut`, agent workspace.ts
-- `headOnOrigin`), not at the commit its last landing recorded: a landing
-- stopped while queued recorded none, and the cut went to main's tip without
-- the clone's own commit (2026-10-17). A workspace that retired before this
-- keeps its landed commit as its head only when its latest item is done,
-- whose landing wrote it; any other has no head and is not cut again.
-- Written by hand from two prompt-free drizzle-kit passes (a drop, then an
-- add), whose snapshot this migration's is.
ALTER TABLE `workspaces` ADD `head` text;--> statement-breakpoint
UPDATE `workspaces` SET `head` = `landed` WHERE `state` = 'archived' AND `landed` IS NOT NULL AND (SELECT `state` FROM `work_items` WHERE `work_items`.`workspace_id` = `workspaces`.`id` ORDER BY `work_items`.`created_at` DESC LIMIT 1) = 'done';--> statement-breakpoint
ALTER TABLE `workspaces` DROP COLUMN `landed`;
