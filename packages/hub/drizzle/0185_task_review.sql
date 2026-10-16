ALTER TABLE `project_tasks` ADD `outputs` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `task_result` text;--> statement-breakpoint
-- Every task file is read again on the next scan, so the outputs it already
-- names reach the index.
UPDATE `project_tasks` SET `hash` = '';
