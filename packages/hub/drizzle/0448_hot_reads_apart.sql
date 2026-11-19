-- A read of a row's small columns costs only those columns. Each long value
-- moves out of the row that hot reads walk, into a table of its own keyed by
-- that row, read by key (the live hub, 2026-11-19):
--   instances.tooling, .commands   15.5 KB and 4.5 KB a session on average,
--                                  columns 36 and 56 of 68: `kind`,
--                                  `status`, `updated_at`, `seen_at` and
--                                  `work_item_id` lie past them, so every
--                                  read of those walked their overflow pages
--                                  (157 MB a scan of 7,759 rows);
--   sent_messages.body             3.4 KB a send, 1 MB at most, column 6 of
--                                  20, before `state`, `hold`, `owed_held`;
--   work_items.brief, .result,     3 to 7 KB an item each, up to 439 KB,
--     .summary, .digest            mid-row.
-- sent_messages' origin columns were generated from `body`, which a
-- generated column cannot read from another table: they become columns of
-- their own, written from the body wherever it is written (db/sends.ts
-- `bodyColumns`), filled here by the same expressions they were generated
-- by. Nothing is deleted: every value is copied before its column goes.
-- `ALTER TABLE ... DROP COLUMN` rewrites each row without the column
-- (sqlite.org/lang_altertable.html); the largest go first, so each later
-- rewrite reads less.
CREATE TABLE `instance_tooling` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`tooling` text,
	`commands` text,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sent_message_bodies` (
	`uuid` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`uuid`) REFERENCES `sent_messages`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `work_item_texts` (
	`work_item_id` text PRIMARY KEY NOT NULL,
	`brief` text NOT NULL,
	`result` text,
	`summary` text,
	`digest` text,
	FOREIGN KEY (`work_item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `instance_tooling` (`instance_id`, `tooling`, `commands`)
SELECT `id`, `tooling`, `commands` FROM `instances`
WHERE `tooling` IS NOT NULL OR `commands` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `tooling`;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `commands`;--> statement-breakpoint
INSERT INTO `sent_message_bodies` (`uuid`, `body`)
SELECT `uuid`, `body` FROM `sent_messages`;--> statement-breakpoint
DROP INDEX `sent_messages_origin`;--> statement-breakpoint
ALTER TABLE `sent_messages` DROP COLUMN `origin_kind`;--> statement-breakpoint
ALTER TABLE `sent_messages` DROP COLUMN `origin_name`;--> statement-breakpoint
ALTER TABLE `sent_messages` DROP COLUMN `origin_from`;--> statement-breakpoint
ALTER TABLE `sent_messages` DROP COLUMN `body`;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `origin_kind` text;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `origin_name` text;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `origin_from` text;--> statement-breakpoint
UPDATE `sent_messages` SET
	`origin_kind` = `origins`.`kind`,
	`origin_name` = `origins`.`name`,
	`origin_from` = `origins`.`from`
FROM (
	SELECT `uuid`,
		CASE WHEN json_valid(`body`) THEN CASE WHEN json_type(`body`, '$.origin.kind') = 'text' THEN json_extract(`body`, '$.origin.kind') END END AS `kind`,
		CASE WHEN json_valid(`body`) THEN CASE WHEN json_type(`body`, '$.origin.name') = 'text' THEN json_extract(`body`, '$.origin.name') END END AS `name`,
		CASE WHEN json_valid(`body`) THEN CASE WHEN json_type(`body`, '$.origin.from') = 'text' THEN json_extract(`body`, '$.origin.from') END END AS `from`
	FROM `sent_message_bodies`
) AS `origins`
WHERE `origins`.`uuid` = `sent_messages`.`uuid`;--> statement-breakpoint
CREATE INDEX `sent_messages_origin` ON `sent_messages` (`instance_id`,`origin_kind`,`accepted_at`);--> statement-breakpoint
CREATE INDEX `sent_messages_pending` ON `sent_messages` (`accepted_at`) WHERE "sent_messages"."state" = 'pending';--> statement-breakpoint
INSERT INTO `work_item_texts` (`work_item_id`, `brief`, `result`, `summary`, `digest`)
SELECT `id`, `brief`, `result`, `summary`, `digest` FROM `work_items`;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `result`;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `digest`;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `summary`;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `brief`;--> statement-breakpoint
CREATE INDEX `work_items_state` ON `work_items` (`state`,`parent_instance_id`);--> statement-breakpoint
-- What runs per heartbeat, publish, find or request, found by index
-- (EXPLAIN QUERY PLAN read SCAN instances for each before):
-- a machine's sessions by status (db/instances.ts `ownedToReconcile`,
-- `liveInstancesOn`, `dateStoredSessions`, `listInstancesOn`);
CREATE INDEX `instances_machine_status` ON `instances` (`machine_id`,`status`);--> statement-breakpoint
-- the session that runs a work item;
CREATE INDEX `instances_work_item` ON `instances` (`work_item_id`);--> statement-breakpoint
-- the continuations' summarisers, read off the index (db/find.ts `hubMade`);
CREATE INDEX `instances_summariser` ON `instances` (`id`,`machine_id`,`session_id`) WHERE `kind` = 'summariser';--> statement-breakpoint
-- when the person last looked at each session, read off the index
-- (db/find.ts `lookedAt`);
CREATE INDEX `instances_seen` ON `instances` (`id`,`seen_at`) WHERE `seen_at` IS NOT NULL;--> statement-breakpoint
-- a machine's sessions with an end still owed, and its removed ones
-- (db/instances.ts `ownedToReconcile`, `removedOn`).
CREATE INDEX `instances_ends_owed` ON `instances` (`machine_id`) WHERE `end_intent` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `instances_removed` ON `instances` (`machine_id`) WHERE `machine_removed` = 1;
--> statement-breakpoint
-- the sessions that moved since a time, beside those listed by status
-- (db/instances.ts `listedInstances`: the board's rows);
CREATE INDEX `instances_updated` ON `instances` (`updated_at`);--> statement-breakpoint
-- the items ended since a time (db/find.ts `results`).
CREATE INDEX `work_items_ended` ON `work_items` (`ended_at`);
