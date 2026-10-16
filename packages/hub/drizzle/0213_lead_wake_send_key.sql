-- A lead's unread wake names its send by a foreign key that cascades: a
-- send that goes (its session dropped) is never read, and its wake goes with
-- it. Rebuilt by hand; the hub turns foreign keys off around migrations
-- (db/index.ts), so drizzle-kit's PRAGMA lines, no-ops inside the migrator's
-- transaction, are left out. A wake naming no send is not copied.
CREATE TABLE `__new_lead_turn_waiting` (
	`instance_id` text NOT NULL,
	`send_uuid` text NOT NULL,
	`thread_id` text,
	PRIMARY KEY(`instance_id`, `send_uuid`),
	FOREIGN KEY (`instance_id`) REFERENCES `lead_turns`(`instance_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`send_uuid`) REFERENCES `sent_messages`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `project_threads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_lead_turn_waiting` (`instance_id`, `send_uuid`, `thread_id`)
SELECT `instance_id`, `send_uuid`, `thread_id` FROM `lead_turn_waiting`
WHERE `send_uuid` IN (SELECT `uuid` FROM `sent_messages`);
--> statement-breakpoint
DROP TABLE `lead_turn_waiting`;--> statement-breakpoint
ALTER TABLE `__new_lead_turn_waiting` RENAME TO `lead_turn_waiting`;
