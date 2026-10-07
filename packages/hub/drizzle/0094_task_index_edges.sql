ALTER TABLE `project_tasks` ADD `related` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_tasks` ADD `found_in` text;--> statement-breakpoint
UPDATE `project_tasks` SET `hash` = '';
