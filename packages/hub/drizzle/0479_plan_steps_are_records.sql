-- A plan's steps are the tasks and to-dos a session works on (the owner,
-- 2026-11-23, cockpit#8eabb628): a step names a task (`tsk-12`) or a to-do
-- of one (`tsk-12:td-3`), its words and state read from that record, and
-- the spec, the away notes and free-text steps go.
--
-- A step an attempt wrote under one of its task's to-dos' ids (`td-3`)
-- names that to-do from here on, the person's comments on it with it.
-- Every other step held words of its own and goes; the person's comments
-- on one are kept as orphaned comments under its words.
UPDATE `session_plan_step_comments` SET `step_id` = (
	SELECT `work_items`.`task_id` FROM `instances`
	JOIN `work_items` ON `work_items`.`id` = `instances`.`work_item_id`
	WHERE `instances`.`id` = `session_plan_step_comments`.`instance_id`
) || ':' || `step_id`
WHERE `step_id` GLOB 'td-[0-9]*' AND EXISTS (
	SELECT 1 FROM `instances`
	JOIN `work_items` ON `work_items`.`id` = `instances`.`work_item_id`
	WHERE `instances`.`id` = `session_plan_step_comments`.`instance_id`
		AND `work_items`.`task_id` IS NOT NULL
);
--> statement-breakpoint
UPDATE `session_plan_steps` SET `id` = (
	SELECT `work_items`.`task_id` FROM `instances`
	JOIN `work_items` ON `work_items`.`id` = `instances`.`work_item_id`
	WHERE `instances`.`id` = `session_plan_steps`.`instance_id`
) || ':' || `id`
WHERE `id` GLOB 'td-[0-9]*' AND EXISTS (
	SELECT 1 FROM `instances`
	JOIN `work_items` ON `work_items`.`id` = `instances`.`work_item_id`
	WHERE `instances`.`id` = `session_plan_steps`.`instance_id`
		AND `work_items`.`task_id` IS NOT NULL
);
--> statement-breakpoint
UPDATE `session_plan_step_comments` SET `orphan_step` = (
	SELECT `content` FROM `session_plan_steps`
	WHERE `session_plan_steps`.`instance_id` = `session_plan_step_comments`.`instance_id`
		AND `session_plan_steps`.`id` = `session_plan_step_comments`.`step_id`
), `step_id` = NULL
WHERE `step_id` IS NOT NULL AND `step_id` NOT GLOB 'tsk-[0-9]*';
--> statement-breakpoint
DELETE FROM `session_plan_steps` WHERE `id` NOT GLOB 'tsk-[0-9]*';
--> statement-breakpoint
CREATE TABLE `task_moves` (
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`from` text NOT NULL,
	`to` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `task_id`, `at`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_moves_at` ON `task_moves` (`at`);--> statement-breakpoint
ALTER TABLE `presence_settings` DROP COLUMN `recapped`;--> statement-breakpoint
ALTER TABLE `session_plan_steps` DROP COLUMN `content`;--> statement-breakpoint
ALTER TABLE `session_plans` DROP COLUMN `steps_unread`;--> statement-breakpoint
ALTER TABLE `session_plans` DROP COLUMN `orphaned_comments_unread`;--> statement-breakpoint
ALTER TABLE `session_plans` DROP COLUMN `spec`;--> statement-breakpoint
ALTER TABLE `session_plans` DROP COLUMN `spec_at`;--> statement-breakpoint
ALTER TABLE `session_plans` DROP COLUMN `away_seen`;