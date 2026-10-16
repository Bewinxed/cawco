-- A session's prior conversations are rows (audit R4), oldest first by
-- `ord`, not a JSON list appended, popped and concatenated: each names its
-- account and the limit line after it by foreign key, so removing an
-- account leaves no id behind. An id naming no account or line is copied as
-- none. A conversation with no harness or end time (none on the live hub)
-- reads as Claude's, ended at the session's last update.
CREATE TABLE `instance_conversations` (
	`instance_id` text NOT NULL,
	`ord` integer NOT NULL,
	`session_id` text NOT NULL,
	`harness` text NOT NULL,
	`model` text,
	`account_id` text,
	`ended_at` integer NOT NULL,
	`next_event_id` text,
	PRIMARY KEY(`instance_id`, `ord`),
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`next_event_id`) REFERENCES `limit_events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `instance_conversations` (`instance_id`, `ord`, `session_id`, `harness`, `model`, `account_id`, `ended_at`, `next_event_id`)
SELECT i.`id`, c.key, json_extract(c.value, '$.sessionId'),
  coalesce(json_extract(c.value, '$.harness'), 'claude'), json_extract(c.value, '$.model'),
  CASE WHEN json_extract(c.value, '$.accountId') IN (SELECT `id` FROM `accounts`) THEN json_extract(c.value, '$.accountId') END,
  coalesce(json_extract(c.value, '$.endedAt'), i.`updated_at`),
  CASE WHEN json_extract(c.value, '$.next') IN (SELECT `id` FROM `limit_events`) THEN json_extract(c.value, '$.next') END
FROM `instances` i, json_each(i.`conversations`) c;
--> statement-breakpoint
CREATE UNIQUE INDEX `instance_conversations_next` ON `instance_conversations` (`next_event_id`);--> statement-breakpoint
CREATE INDEX `instance_conversations_session` ON `instance_conversations` (`session_id`);--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `conversations`;
