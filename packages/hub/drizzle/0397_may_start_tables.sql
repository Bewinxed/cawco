-- What a session or a delegate type may start, and what it loads at start,
-- are real columns and rows now, not JSON (core `MayStart`, `StartingSet`):
-- `may_start_any` with the `*_may_start` rows, `starts_with_all` with the
-- `*_starting_set` rows, and a type's skills, denied tools and connections
-- as rows of their own. `delegate_types` and `delegate_types_meta` join the
-- schema: db/delegate-types.ts made and grew them by hand, and the step
-- before this migration (db/migrate.ts `delegate-types-hand-shape`) brings
-- them to that code's last shape, so here they are renamed out of the way,
-- copied, and dropped.
--
-- Nothing unplaced reads as "anything". A value that is not the JSON its
-- column held (not JSON, not a list of names, not `{skills, servers}`)
-- takes the narrow value: may start none, starts with CawCo's own alone. A
-- delegate type with any such list takes the narrow value for all five.
-- Null keeps the meaning its writer gave it, stored now:
-- - `instances.may_start` null was written for a start that named no list,
--   read as "a session nobody delegated, which may start any" (core
--   `sessionMayStart`). A row with no work item is that: it may start any.
--   A work item's session or a continuation's summariser never chose any,
--   and starts none.
-- - `starting_set` null (a session's or a type's): no set, everything
--   installed, which only a start or a type with no set wrote. Stored as
--   `starts_with_all`.
-- - A type's `may_start`, `skills`, `deny_tools`, `connections` null: none.
ALTER TABLE `delegate_types` RENAME TO `__hand_delegate_types`;--> statement-breakpoint
ALTER TABLE `delegate_types_meta` RENAME TO `__hand_delegate_types_meta`;--> statement-breakpoint
CREATE TABLE `delegate_type_connections` (
	`type_name` text NOT NULL,
	`connection` text NOT NULL,
	PRIMARY KEY(`type_name`, `connection`),
	FOREIGN KEY (`type_name`) REFERENCES `delegate_types`(`name`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `delegate_type_deny_tools` (
	`type_name` text NOT NULL,
	`tool` text NOT NULL,
	PRIMARY KEY(`type_name`, `tool`),
	FOREIGN KEY (`type_name`) REFERENCES `delegate_types`(`name`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `delegate_type_may_start` (
	`type_name` text NOT NULL,
	`delegate_type` text NOT NULL,
	PRIMARY KEY(`type_name`, `delegate_type`),
	FOREIGN KEY (`type_name`) REFERENCES `delegate_types`(`name`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `delegate_type_skills` (
	`type_name` text NOT NULL,
	`skill` text NOT NULL,
	PRIMARY KEY(`type_name`, `skill`),
	FOREIGN KEY (`type_name`) REFERENCES `delegate_types`(`name`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `delegate_type_starting_set` (
	`type_name` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`type_name`, `kind`, `name`),
	FOREIGN KEY (`type_name`) REFERENCES `delegate_types`(`name`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "delegate_type_starting_set_kind" CHECK("kind" in ('skill', 'server'))
);
--> statement-breakpoint
CREATE TABLE `delegate_types` (
	`name` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`harness` text NOT NULL,
	`model` text NOT NULL,
	`effort` text,
	`account` text,
	`may_start_any` integer DEFAULT false NOT NULL,
	`starts_with_all` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `delegate_types_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `instance_may_start` (
	`instance_id` text NOT NULL,
	`delegate_type` text NOT NULL,
	PRIMARY KEY(`instance_id`, `delegate_type`),
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `instance_starting_set` (
	`instance_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`instance_id`, `kind`, `name`),
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "instance_starting_set_kind" CHECK("kind" in ('skill', 'server'))
);
--> statement-breakpoint
ALTER TABLE `instances` ADD `may_start_any` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `instances` ADD `starts_with_all` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- A session's list: null placed by its work item and kind; a readable list by whether it names `any`; anything else none.
UPDATE `instances` SET `may_start_any` = CASE WHEN (`may_start` IS NULL OR CASE WHEN json_valid(`may_start`) THEN json_type(`may_start`) = 'null' ELSE 0 END) THEN `work_item_id` IS NULL AND `kind` <> 'summariser' WHEN CASE WHEN json_valid(`may_start`) THEN json_type(`may_start`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`may_start`) WHERE `type` <> 'text') ELSE 0 END THEN EXISTS (SELECT 1 FROM json_each(`may_start`) WHERE `value` = 'any') ELSE 0 END;--> statement-breakpoint
INSERT OR IGNORE INTO `instance_may_start` (`instance_id`, `delegate_type`) SELECT i.`id`, j.`value` FROM `instances` i, json_each(CASE WHEN i.`may_start_any` = 0 AND (CASE WHEN json_valid(i.`may_start`) THEN json_type(i.`may_start`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(i.`may_start`) WHERE `type` <> 'text') ELSE 0 END) THEN i.`may_start` ELSE '[]' END) j;--> statement-breakpoint
-- A session's set: null is everything; a readable set its rows; anything else CawCo's own alone.
UPDATE `instances` SET `starts_with_all` = (`starting_set` IS NULL OR CASE WHEN json_valid(`starting_set`) THEN json_type(`starting_set`) = 'null' ELSE 0 END);--> statement-breakpoint
INSERT OR IGNORE INTO `instance_starting_set` (`instance_id`, `kind`, `name`) SELECT i.`id`, 'skill', j.`value` FROM `instances` i, json_each(CASE WHEN CASE WHEN json_valid(i.`starting_set`) THEN json_type(i.`starting_set`) = 'object' AND json_type(i.`starting_set`, '$.skills') = 'array' AND json_type(i.`starting_set`, '$.servers') = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(i.`starting_set`, '$.skills') WHERE `type` <> 'text') AND NOT EXISTS (SELECT 1 FROM json_each(i.`starting_set`, '$.servers') WHERE `type` <> 'text') ELSE 0 END THEN i.`starting_set` ELSE '{}' END, '$.skills') j;--> statement-breakpoint
INSERT OR IGNORE INTO `instance_starting_set` (`instance_id`, `kind`, `name`) SELECT i.`id`, 'server', j.`value` FROM `instances` i, json_each(CASE WHEN CASE WHEN json_valid(i.`starting_set`) THEN json_type(i.`starting_set`) = 'object' AND json_type(i.`starting_set`, '$.skills') = 'array' AND json_type(i.`starting_set`, '$.servers') = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(i.`starting_set`, '$.skills') WHERE `type` <> 'text') AND NOT EXISTS (SELECT 1 FROM json_each(i.`starting_set`, '$.servers') WHERE `type` <> 'text') ELSE 0 END THEN i.`starting_set` ELSE '{}' END, '$.servers') j;--> statement-breakpoint
-- A type reads when each of its five lists is null or the JSON it held.
ALTER TABLE `__hand_delegate_types` ADD `reads` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `__hand_delegate_types` SET `reads` = ((`may_start` IS NULL OR CASE WHEN json_valid(`may_start`) THEN json_type(`may_start`) = 'null' ELSE 0 END) OR (CASE WHEN json_valid(`may_start`) THEN json_type(`may_start`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`may_start`) WHERE `type` <> 'text') ELSE 0 END)) AND ((`skills` IS NULL OR CASE WHEN json_valid(`skills`) THEN json_type(`skills`) = 'null' ELSE 0 END) OR (CASE WHEN json_valid(`skills`) THEN json_type(`skills`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`skills`) WHERE `type` <> 'text') ELSE 0 END)) AND ((`deny_tools` IS NULL OR CASE WHEN json_valid(`deny_tools`) THEN json_type(`deny_tools`) = 'null' ELSE 0 END) OR (CASE WHEN json_valid(`deny_tools`) THEN json_type(`deny_tools`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`deny_tools`) WHERE `type` <> 'text') ELSE 0 END)) AND ((`connections` IS NULL OR CASE WHEN json_valid(`connections`) THEN json_type(`connections`) = 'null' ELSE 0 END) OR (CASE WHEN json_valid(`connections`) THEN json_type(`connections`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`connections`) WHERE `type` <> 'text') ELSE 0 END)) AND ((`starting_set` IS NULL OR CASE WHEN json_valid(`starting_set`) THEN json_type(`starting_set`) = 'null' ELSE 0 END) OR (CASE WHEN json_valid(`starting_set`) THEN json_type(`starting_set`) = 'object' AND json_type(`starting_set`, '$.skills') = 'array' AND json_type(`starting_set`, '$.servers') = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`starting_set`, '$.skills') WHERE `type` <> 'text') AND NOT EXISTS (SELECT 1 FROM json_each(`starting_set`, '$.servers') WHERE `type` <> 'text') ELSE 0 END));--> statement-breakpoint
INSERT INTO `delegate_types` (`name`, `description`, `harness`, `model`, `effort`, `account`, `may_start_any`, `starts_with_all`, `created_at`) SELECT h.`name`, h.`description`, h.`harness`, h.`model`, h.`effort`, h.`account`, CASE WHEN h.`reads` AND NOT (h.`may_start` IS NULL OR CASE WHEN json_valid(h.`may_start`) THEN json_type(h.`may_start`) = 'null' ELSE 0 END) THEN EXISTS (SELECT 1 FROM json_each(h.`may_start`) WHERE `value` = 'any') ELSE 0 END, h.`reads` AND (h.`starting_set` IS NULL OR CASE WHEN json_valid(h.`starting_set`) THEN json_type(h.`starting_set`) = 'null' ELSE 0 END), h.`created_at` FROM `__hand_delegate_types` h;--> statement-breakpoint
INSERT OR IGNORE INTO `delegate_type_may_start` (`type_name`, `delegate_type`) SELECT h.`name`, j.`value` FROM `__hand_delegate_types` h JOIN `delegate_types` t ON t.`name` = h.`name`, json_each(CASE WHEN t.`may_start_any` = 0 AND h.`reads` AND NOT (h.`may_start` IS NULL OR CASE WHEN json_valid(h.`may_start`) THEN json_type(h.`may_start`) = 'null' ELSE 0 END) THEN h.`may_start` ELSE '[]' END) j;--> statement-breakpoint
INSERT OR IGNORE INTO `delegate_type_skills` (`type_name`, `skill`) SELECT h.`name`, j.`value` FROM `__hand_delegate_types` h, json_each(CASE WHEN h.`reads` AND NOT (h.`skills` IS NULL OR CASE WHEN json_valid(h.`skills`) THEN json_type(h.`skills`) = 'null' ELSE 0 END) THEN h.`skills` ELSE '[]' END) j;--> statement-breakpoint
INSERT OR IGNORE INTO `delegate_type_deny_tools` (`type_name`, `tool`) SELECT h.`name`, j.`value` FROM `__hand_delegate_types` h, json_each(CASE WHEN h.`reads` AND NOT (h.`deny_tools` IS NULL OR CASE WHEN json_valid(h.`deny_tools`) THEN json_type(h.`deny_tools`) = 'null' ELSE 0 END) THEN h.`deny_tools` ELSE '[]' END) j;--> statement-breakpoint
INSERT OR IGNORE INTO `delegate_type_connections` (`type_name`, `connection`) SELECT h.`name`, j.`value` FROM `__hand_delegate_types` h, json_each(CASE WHEN h.`reads` AND NOT (h.`connections` IS NULL OR CASE WHEN json_valid(h.`connections`) THEN json_type(h.`connections`) = 'null' ELSE 0 END) THEN h.`connections` ELSE '[]' END) j;--> statement-breakpoint
INSERT OR IGNORE INTO `delegate_type_starting_set` (`type_name`, `kind`, `name`) SELECT h.`name`, 'skill', j.`value` FROM `__hand_delegate_types` h, json_each(CASE WHEN h.`reads` AND NOT (h.`starting_set` IS NULL OR CASE WHEN json_valid(h.`starting_set`) THEN json_type(h.`starting_set`) = 'null' ELSE 0 END) THEN h.`starting_set` ELSE '{}' END, '$.skills') j;--> statement-breakpoint
INSERT OR IGNORE INTO `delegate_type_starting_set` (`type_name`, `kind`, `name`) SELECT h.`name`, 'server', j.`value` FROM `__hand_delegate_types` h, json_each(CASE WHEN h.`reads` AND NOT (h.`starting_set` IS NULL OR CASE WHEN json_valid(h.`starting_set`) THEN json_type(h.`starting_set`) = 'null' ELSE 0 END) THEN h.`starting_set` ELSE '{}' END, '$.servers') j;--> statement-breakpoint
INSERT INTO `delegate_types_meta` (`key`, `value`) SELECT `key`, `value` FROM `__hand_delegate_types_meta`;--> statement-breakpoint
DROP TABLE `__hand_delegate_types`;--> statement-breakpoint
DROP TABLE `__hand_delegate_types_meta`;--> statement-breakpoint
-- A trashed delegate type keeps its row as the old table had it, which cannot go back.
DELETE FROM `config_trash` WHERE `kind` = 'delegateType';--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `may_start`;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `starting_set`;