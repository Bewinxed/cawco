ALTER TABLE `sent_messages` ADD `harness_id` text;--> statement-breakpoint
CREATE INDEX `sent_messages_harness_id` ON `sent_messages` (`harness_id`);