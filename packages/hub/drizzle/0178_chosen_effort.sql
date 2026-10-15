ALTER TABLE `instances` ADD `chosen_effort` text;--> statement-breakpoint
UPDATE `instances` SET `chosen_effort` = `effort` WHERE `effort` IN ('low', 'medium', 'high', 'xhigh', 'max');
