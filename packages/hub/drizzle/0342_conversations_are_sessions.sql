-- Conversations are sessions: a project's conversation is the session
-- projects.conversation_instance_id names, and Caw's threads are dropped
-- whole (the owner's pick, 2026-10-30: "just drop"). A send to a thread
-- that no session took has no session to belong to, so it goes first.
DELETE FROM `sent_messages` WHERE `instance_id` IS NULL;--> statement-breakpoint
DROP TABLE `caw_turns`;--> statement-breakpoint
DROP TABLE `project_threads`;--> statement-breakpoint
DROP TABLE `thread_message_tasks`;--> statement-breakpoint
DROP TABLE `thread_messages`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sent_messages` (
	`uuid` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`read_at` integer,
	`harness_id` text,
	`body` text NOT NULL,
	`mode` text DEFAULT 'turn' NOT NULL,
	`state` text DEFAULT 'read' NOT NULL,
	`reason` text,
	`refusal` text,
	`anchor` text,
	`replaces` text,
	`replaced_by` text,
	`held` integer DEFAULT false NOT NULL,
	`owed` text,
	`hold` text,
	`envelope` text,
	`delivery` text
);
--> statement-breakpoint
INSERT INTO `__new_sent_messages`("uuid", "instance_id", "accepted_at", "read_at", "harness_id", "body", "mode", "state", "reason", "refusal", "anchor", "replaces", "replaced_by", "held", "owed", "hold", "envelope", "delivery") SELECT "uuid", "instance_id", "accepted_at", "read_at", "harness_id", "body", "mode", "state", "reason", "refusal", "anchor", "replaces", "replaced_by", "held", "owed", "hold", "envelope", "delivery" FROM `sent_messages`;--> statement-breakpoint
DROP TABLE `sent_messages`;--> statement-breakpoint
ALTER TABLE `__new_sent_messages` RENAME TO `sent_messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `sent_messages_harness_id` ON `sent_messages` (`harness_id`);--> statement-breakpoint
CREATE INDEX `sent_messages_state` ON `sent_messages` (`instance_id`,`state`);--> statement-breakpoint
DROP INDEX `instances_thread`;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `thread_id`;--> statement-breakpoint
ALTER TABLE `design_offers` DROP COLUMN `thread_id`;--> statement-breakpoint
ALTER TABLE `lfs_offers` DROP COLUMN `thread_id`;--> statement-breakpoint
ALTER TABLE `routines` DROP COLUMN `made_in_thread`;--> statement-breakpoint
ALTER TABLE `routines` DROP COLUMN `thread_id`;--> statement-breakpoint
CREATE TABLE `project_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`instance_id` text,
	`at` integer NOT NULL,
	`note` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_notes_project` ON `project_notes` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_notes_instance` ON `project_notes` (`instance_id`);--> statement-breakpoint
ALTER TABLE `projects` RENAME COLUMN `lead_instance_id` TO `conversation_instance_id`;--> statement-breakpoint
ALTER TABLE `projects` RENAME COLUMN `caw` TO `events_on`;--> statement-breakpoint
ALTER TABLE `routine_runs` RENAME COLUMN `lead_instance_id` TO `instance_id`;
