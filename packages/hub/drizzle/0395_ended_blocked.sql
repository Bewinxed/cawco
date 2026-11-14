ALTER TABLE `work_items` ADD `ended_blocked` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `work_items` SET `ended_blocked` = true WHERE substr(`error`, 1, 9) = 'Blocked: ';
