ALTER TABLE `instances` ADD `wakes_itself` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `instances` ADD `wrote_at` integer;--> statement-breakpoint
ALTER TABLE `instances` ADD `done_at` integer;--> statement-breakpoint
UPDATE `instances` SET `wrote_at` = (SELECT max(`accepted_at`) FROM `sent_messages` WHERE `sent_messages`.`instance_id` = `instances`.`id` AND `sent_messages`.`state` <> 'failed' AND json_extract(`sent_messages`.`body`, '$.origin.kind') = 'human');