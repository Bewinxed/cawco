-- `launch_dir_read` becomes a three-state `launch_dir`: `known`, `unread` (still
-- to be read from its machine at its next register), or `unknown` (its machine
-- had no record of its conversation, so `cwd` may be a folder its CLI wandered
-- into: the row is named by its title and every spawn of it is refused).
-- 0106 filed such rows as read with their drifted `cwd`, indistinguishable now
-- from rows whose first cwd was read, so every row 0106 asked about is asked
-- again at its machine's next register (a known one re-files the same cwd).
-- A row spawned since 0106 (its journal `when`, 1791494160634) never had a
-- drifted `cwd` and stays `known`.
ALTER TABLE `instances` ADD `launch_dir` text DEFAULT 'known' NOT NULL;--> statement-breakpoint
UPDATE `instances` SET `launch_dir` = 'unread'
WHERE `session_id` IS NOT NULL
	AND `work_item_id` IS NULL
	AND `scratch_worktree` IS NULL
	AND (`launch_dir_read` = false OR `created_at` < 1791494160634);--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `launch_dir_read`;
