ALTER TABLE `project_tasks` ADD `duplicate_of` text;--> statement-breakpoint
UPDATE `project_tasks` SET `hash` = '';
