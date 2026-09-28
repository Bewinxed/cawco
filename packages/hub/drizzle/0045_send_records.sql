ALTER TABLE `sent_messages` ADD `body` text;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `mode` text DEFAULT 'turn' NOT NULL;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `state` text DEFAULT 'read' NOT NULL;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `anchor` text;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `replaces` text;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `replaced_by` text;--> statement-breakpoint
CREATE INDEX `sent_messages_state` ON `sent_messages` (`instance_id`,`state`);