ALTER TABLE `project_tasks` ADD `fields` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE `project_tasks` SET `hash` = '';
