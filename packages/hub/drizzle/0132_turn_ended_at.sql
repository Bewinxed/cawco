ALTER TABLE `instances` ADD `turn_ended_at` integer;--> statement-breakpoint
UPDATE `instances` SET `turn_ended_at` = `updated_at` WHERE `turn_open_at` IS NULL;