-- instances.cwd is the directory a session was launched in, never where its CLI
-- later wandered. Before this, every `init` frame overwrote it with the CLI's
-- current directory, and every resume spawned there. Existing rows get their
-- launch directory back from the best record of where each started:
--   * a delegate with a work item: its workspace's root, where every work item
--     of the workspace is spawned (work-items.ts `spawnOf`);
--   * a scratch session: the worktree its machine made for it, which is where
--     its process was launched;
--   * any other row that named a conversation: its harness's first recorded
--     cwd for that conversation (Claude's session info keeps the first one),
--     read from its machine at its next register (`launch_dir_read` false);
--   * a row that never named a conversation never had an `init` overwrite it,
--     so its cwd is still its spawn's.
ALTER TABLE `instances` ADD `launch_dir_read` integer DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `instances` SET `cwd` = (
	SELECT `workspaces`.`path` FROM `work_items`
	JOIN `workspaces` ON `workspaces`.`id` = `work_items`.`workspace_id`
	WHERE `work_items`.`id` = `instances`.`work_item_id`
) WHERE EXISTS (
	SELECT 1 FROM `work_items`
	JOIN `workspaces` ON `workspaces`.`id` = `work_items`.`workspace_id`
	WHERE `work_items`.`id` = `instances`.`work_item_id`
);--> statement-breakpoint
UPDATE `instances` SET `cwd` = json_extract(`scratch_worktree`, '$.dir')
WHERE `work_item_id` IS NULL AND json_extract(`scratch_worktree`, '$.dir') IS NOT NULL;--> statement-breakpoint
UPDATE `instances` SET `launch_dir_read` = false
WHERE `session_id` IS NOT NULL
	AND `work_item_id` IS NULL
	AND `scratch_worktree` IS NULL;
