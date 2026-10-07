ALTER TABLE `caw_turns` ADD `harness` text;--> statement-breakpoint
UPDATE `caw_turns` SET `harness` = (SELECT `caw_harness` FROM `projects` WHERE `projects`.`id` = `caw_turns`.`project_id`) WHERE `harness` IS NULL;
