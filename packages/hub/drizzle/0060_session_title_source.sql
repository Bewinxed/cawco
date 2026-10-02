ALTER TABLE `instances` ADD `title_source` text;--> statement-breakpoint
UPDATE `instances` SET `title_source` = 'agent' WHERE `title` IS NOT NULL;
