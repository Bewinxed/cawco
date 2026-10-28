-- A Caw thread is a target of the session send pipeline: the person's words
-- in a thread are sends, kept here as every send is, under `thread_id`, with
-- `instance_id` the lead session that took one (none until then, or when
-- none could) and `read_at` when he read it, where the thread's page places
-- it. One of the two targets is always named. The thread's old `you` rows
-- move here once, at boot (db `migrateThreadWordsOnce`).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sent_messages` (
	`uuid` text PRIMARY KEY NOT NULL,
	`instance_id` text,
	`thread_id` text,
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
	`delivery` text,
	FOREIGN KEY (`thread_id`) REFERENCES `project_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sent_messages_target" CHECK("instance_id" IS NOT NULL OR "thread_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_sent_messages`("uuid", "instance_id", "thread_id", "accepted_at", "read_at", "harness_id", "body", "mode", "state", "reason", "refusal", "anchor", "replaces", "replaced_by", "held", "owed", "hold", "envelope", "delivery") SELECT "uuid", "instance_id", NULL, "accepted_at", NULL, "harness_id", "body", "mode", "state", "reason", "refusal", "anchor", "replaces", "replaced_by", "held", "owed", "hold", "envelope", "delivery" FROM `sent_messages`;--> statement-breakpoint
DROP TABLE `sent_messages`;--> statement-breakpoint
ALTER TABLE `__new_sent_messages` RENAME TO `sent_messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `sent_messages_harness_id` ON `sent_messages` (`harness_id`);--> statement-breakpoint
CREATE INDEX `sent_messages_state` ON `sent_messages` (`instance_id`,`state`);--> statement-breakpoint
CREATE INDEX `sent_messages_thread` ON `sent_messages` (`thread_id`,`state`);