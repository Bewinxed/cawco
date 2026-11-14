-- What a session or a delegate type may start, and what it loads at start,
-- are real columns and rows now, not JSON (core `MayStart`, `StartingSet`):
-- `may_start_any` with the `*_may_start` rows, `starts_with_all` with the
-- `*_starting_set` rows, and a type's skills, denied tools and connections
-- as rows of their own. `delegate_types` and `delegate_types_meta` join the
-- schema: db/delegate-types.ts made and grew them by hand, and the step
-- before this migration (db/migrate.ts `may-start-tables`) brings
-- them to that code's last shape, so here they are renamed out of the way,
-- copied, and dropped. A type in the trash is kept in the trash's new shape
-- (its row, then its lists), read by the same rule as a live one.
--
-- Nothing unplaced reads as "anything". A value that is not the JSON its
-- column held (not JSON, not a list of names, not `{skills, servers}`)
-- takes the narrow value: may start none, starts with CawCo's own alone. A
-- delegate type with any such list takes the narrow value for all five.
-- Null keeps the meaning its writer gave it, stored now:
-- - `instances.may_start` null was written for a start that named no list,
--   read as "a session nobody delegated, which may start any" (core
--   `sessionMayStart`). A row with no work item is that: it may start any.
--   A work item's session with none was continued from one that had a list
--   (a continuation on another harness carried none): it takes the list of
--   the session it went on from; where no link to one was recorded, the
--   list of its work item's first session that has one; and none only when
--   no session of its work item has one. A continuation's summariser never
--   chose any, and starts none.
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
-- A work item's session with no list goes on with the list of the session it
-- continued: back through `continued_into`, and a continuation job's source,
-- to the oldest one whose list reads, which is what its work item was
-- delegated (the counting script names each chain whose lists differ).
CREATE TABLE `__may_start_back` AS WITH RECURSIVE `back`(`session`, `at`, `depth`) AS (SELECT `id`, `id`, 0 FROM `instances` WHERE (`may_start` IS NULL OR CASE WHEN json_valid(`may_start`) THEN json_type(`may_start`) = 'null' ELSE 0 END) AND `work_item_id` IS NOT NULL AND `kind` <> 'summariser' UNION SELECT b.`session`, p.`id`, b.`depth` + 1 FROM `back` b JOIN `instances` p ON p.`continued_into` = b.`at` OR p.`id` IN (SELECT `source_instance_id` FROM `continuations` WHERE `target_instance_id` = b.`at`) WHERE b.`depth` < 100) SELECT b.`session`, b.`depth`, p.`may_start` FROM `back` b JOIN `instances` p ON p.`id` = b.`at` WHERE b.`depth` > 0 AND (CASE WHEN json_valid(p.`may_start`) THEN json_type(p.`may_start`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(p.`may_start`) WHERE `type` <> 'text') ELSE 0 END);--> statement-breakpoint
UPDATE `instances` SET `may_start` = (SELECT c.`may_start` FROM `__may_start_back` c WHERE c.`session` = `instances`.`id` ORDER BY c.`depth` DESC LIMIT 1) WHERE `id` IN (SELECT `session` FROM `__may_start_back`);--> statement-breakpoint
DROP TABLE `__may_start_back`;--> statement-breakpoint
-- One its chain gives none (a continuation that recorded no link) takes the
-- list of its work item's first session that has one, oldest by `created_at`.
UPDATE `instances` SET `may_start` = (SELECT p.`may_start` FROM `instances` p WHERE p.`work_item_id` = `instances`.`work_item_id` AND p.`id` <> `instances`.`id` AND (CASE WHEN json_valid(p.`may_start`) THEN json_type(p.`may_start`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(p.`may_start`) WHERE `type` <> 'text') ELSE 0 END) ORDER BY p.`created_at`, p.rowid LIMIT 1) WHERE (`may_start` IS NULL OR CASE WHEN json_valid(`may_start`) THEN json_type(`may_start`) = 'null' ELSE 0 END) AND `work_item_id` IS NOT NULL AND `kind` <> 'summariser' AND EXISTS (SELECT p.`may_start` FROM `instances` p WHERE p.`work_item_id` = `instances`.`work_item_id` AND p.`id` <> `instances`.`id` AND (CASE WHEN json_valid(p.`may_start`) THEN json_type(p.`may_start`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(p.`may_start`) WHERE `type` <> 'text') ELSE 0 END) ORDER BY p.`created_at`, p.rowid LIMIT 1);--> statement-breakpoint
-- A session's list: null placed by its work item and kind; a readable list by whether it names `any`; anything else none.
UPDATE `instances` SET `may_start_any` = CASE WHEN (`may_start` IS NULL OR CASE WHEN json_valid(`may_start`) THEN json_type(`may_start`) = 'null' ELSE 0 END) THEN `work_item_id` IS NULL AND `kind` <> 'summariser' WHEN CASE WHEN json_valid(`may_start`) THEN json_type(`may_start`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`may_start`) WHERE `type` <> 'text') ELSE 0 END THEN EXISTS (SELECT 1 FROM json_each(`may_start`) WHERE `value` = 'any') ELSE 0 END;--> statement-breakpoint
INSERT OR IGNORE INTO `instance_may_start` (`instance_id`, `delegate_type`) SELECT i.`id`, j.`value` FROM `instances` i, json_each(CASE WHEN i.`may_start_any` = 0 AND (CASE WHEN json_valid(i.`may_start`) THEN json_type(i.`may_start`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(i.`may_start`) WHERE `type` <> 'text') ELSE 0 END) THEN i.`may_start` ELSE '[]' END) j;--> statement-breakpoint
-- A session's set: null is everything; a readable set its rows; anything else CawCo's own alone.
UPDATE `instances` SET `starts_with_all` = (`starting_set` IS NULL OR CASE WHEN json_valid(`starting_set`) THEN json_type(`starting_set`) = 'null' ELSE 0 END);--> statement-breakpoint
INSERT OR IGNORE INTO `instance_starting_set` (`instance_id`, `kind`, `name`) SELECT i.`id`, 'skill', j.`value` FROM `instances` i, json_each(CASE WHEN CASE WHEN json_valid(i.`starting_set`) THEN json_type(i.`starting_set`) = 'object' AND json_type(i.`starting_set`, '$.skills') = 'array' AND json_type(i.`starting_set`, '$.servers') = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(i.`starting_set`, '$.skills') WHERE `type` <> 'text') AND NOT EXISTS (SELECT 1 FROM json_each(i.`starting_set`, '$.servers') WHERE `type` <> 'text') ELSE 0 END THEN i.`starting_set` ELSE '{}' END, '$.skills') j;--> statement-breakpoint
INSERT OR IGNORE INTO `instance_starting_set` (`instance_id`, `kind`, `name`) SELECT i.`id`, 'server', j.`value` FROM `instances` i, json_each(CASE WHEN CASE WHEN json_valid(i.`starting_set`) THEN json_type(i.`starting_set`) = 'object' AND json_type(i.`starting_set`, '$.skills') = 'array' AND json_type(i.`starting_set`, '$.servers') = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(i.`starting_set`, '$.skills') WHERE `type` <> 'text') AND NOT EXISTS (SELECT 1 FROM json_each(i.`starting_set`, '$.servers') WHERE `type` <> 'text') ELSE 0 END THEN i.`starting_set` ELSE '{}' END, '$.servers') j;--> statement-breakpoint
-- Every delegate type, the live ones and each one in the trash, read by one
-- rule: `trash_id` null for a live type, its trash entry's id otherwise. A
-- trash entry that is not one old `delegate_types` row stays as it is.
CREATE TABLE `__types` (`trash_id` integer, `name` text NOT NULL, `description` text, `harness` text, `model` text, `effort` text, `account` text, `created_at` integer, `may_start` text, `skills` text, `deny_tools` text, `connections` text, `starting_set` text, `reads` integer DEFAULT 0 NOT NULL, `may_start_any` integer DEFAULT 0 NOT NULL, `starts_with_all` integer DEFAULT 0 NOT NULL);--> statement-breakpoint
INSERT INTO `__types` (`trash_id`, `name`, `description`, `harness`, `model`, `effort`, `account`, `created_at`, `may_start`, `skills`, `deny_tools`, `connections`, `starting_set`) SELECT NULL, `name`, `description`, `harness`, `model`, `effort`, `account`, `created_at`, `may_start`, `skills`, `deny_tools`, `connections`, `starting_set` FROM `__hand_delegate_types`;--> statement-breakpoint
INSERT INTO `__types` (`trash_id`, `name`, `description`, `harness`, `model`, `effort`, `account`, `created_at`, `may_start`, `skills`, `deny_tools`, `connections`, `starting_set`) SELECT t.`id`, json_extract(t.`rows`, '$[0].rows[0].name'), json_extract(t.`rows`, '$[0].rows[0].description'), json_extract(t.`rows`, '$[0].rows[0].harness'), json_extract(t.`rows`, '$[0].rows[0].model'), json_extract(t.`rows`, '$[0].rows[0].effort'), json_extract(t.`rows`, '$[0].rows[0].account'), COALESCE(json_extract(t.`rows`, '$[0].rows[0].created_at'), t.`deleted_at`), COALESCE(json_extract(t.`rows`, '$[0].rows[0].may_start'), CASE json_extract(t.`rows`, '$[0].rows[0].can_delegate') WHEN 1 THEN '["any"]' END), json_extract(t.`rows`, '$[0].rows[0].skills'), json_extract(t.`rows`, '$[0].rows[0].deny_tools'), json_extract(t.`rows`, '$[0].rows[0].connections'), json_extract(t.`rows`, '$[0].rows[0].starting_set') FROM `config_trash` t WHERE t.`kind` = 'delegateType' AND (CASE WHEN json_valid(t.`rows`) THEN json_type(t.`rows`) = 'array' AND json_array_length(t.`rows`) = 1 AND json_extract(t.`rows`, '$[0].table') = 'delegate_types' AND json_array_length(t.`rows`, '$[0].rows') = 1 AND json_type(t.`rows`, '$[0].rows[0].name') = 'text' AND json_type(t.`rows`, '$[0].rows[0].description') = 'text' AND json_type(t.`rows`, '$[0].rows[0].harness') = 'text' AND json_type(t.`rows`, '$[0].rows[0].model') = 'text' ELSE 0 END);--> statement-breakpoint
-- A type reads when each of its five lists is null or the JSON it held.
UPDATE `__types` SET `reads` = ((`may_start` IS NULL OR CASE WHEN json_valid(`may_start`) THEN json_type(`may_start`) = 'null' ELSE 0 END) OR (CASE WHEN json_valid(`may_start`) THEN json_type(`may_start`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`may_start`) WHERE `type` <> 'text') ELSE 0 END)) AND ((`skills` IS NULL OR CASE WHEN json_valid(`skills`) THEN json_type(`skills`) = 'null' ELSE 0 END) OR (CASE WHEN json_valid(`skills`) THEN json_type(`skills`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`skills`) WHERE `type` <> 'text') ELSE 0 END)) AND ((`deny_tools` IS NULL OR CASE WHEN json_valid(`deny_tools`) THEN json_type(`deny_tools`) = 'null' ELSE 0 END) OR (CASE WHEN json_valid(`deny_tools`) THEN json_type(`deny_tools`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`deny_tools`) WHERE `type` <> 'text') ELSE 0 END)) AND ((`connections` IS NULL OR CASE WHEN json_valid(`connections`) THEN json_type(`connections`) = 'null' ELSE 0 END) OR (CASE WHEN json_valid(`connections`) THEN json_type(`connections`) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`connections`) WHERE `type` <> 'text') ELSE 0 END)) AND ((`starting_set` IS NULL OR CASE WHEN json_valid(`starting_set`) THEN json_type(`starting_set`) = 'null' ELSE 0 END) OR (CASE WHEN json_valid(`starting_set`) THEN json_type(`starting_set`) = 'object' AND json_type(`starting_set`, '$.skills') = 'array' AND json_type(`starting_set`, '$.servers') = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(`starting_set`, '$.skills') WHERE `type` <> 'text') AND NOT EXISTS (SELECT 1 FROM json_each(`starting_set`, '$.servers') WHERE `type` <> 'text') ELSE 0 END));--> statement-breakpoint
UPDATE `__types` SET `may_start_any` = `reads` AND NOT (`may_start` IS NULL OR CASE WHEN json_valid(`may_start`) THEN json_type(`may_start`) = 'null' ELSE 0 END) AND EXISTS (SELECT 1 FROM json_each(`may_start`) WHERE `value` = 'any'), `starts_with_all` = `reads` AND (`starting_set` IS NULL OR CASE WHEN json_valid(`starting_set`) THEN json_type(`starting_set`) = 'null' ELSE 0 END);--> statement-breakpoint
CREATE TABLE `__type_lists` (`trash_id` integer, `name` text NOT NULL, `list` text NOT NULL, `value` text NOT NULL);--> statement-breakpoint
INSERT INTO `__type_lists` SELECT s.`trash_id`, s.`name`, 'may_start', j.`value` FROM `__types` s, json_each(CASE WHEN s.`may_start_any` = 0 AND s.`reads` AND NOT (s.`may_start` IS NULL OR CASE WHEN json_valid(s.`may_start`) THEN json_type(s.`may_start`) = 'null' ELSE 0 END) THEN s.`may_start` ELSE '[]' END) j;--> statement-breakpoint
INSERT INTO `__type_lists` SELECT s.`trash_id`, s.`name`, 'skills', j.`value` FROM `__types` s, json_each(CASE WHEN s.`reads` AND NOT (s.`skills` IS NULL OR CASE WHEN json_valid(s.`skills`) THEN json_type(s.`skills`) = 'null' ELSE 0 END) THEN s.`skills` ELSE '[]' END) j;--> statement-breakpoint
INSERT INTO `__type_lists` SELECT s.`trash_id`, s.`name`, 'deny_tools', j.`value` FROM `__types` s, json_each(CASE WHEN s.`reads` AND NOT (s.`deny_tools` IS NULL OR CASE WHEN json_valid(s.`deny_tools`) THEN json_type(s.`deny_tools`) = 'null' ELSE 0 END) THEN s.`deny_tools` ELSE '[]' END) j;--> statement-breakpoint
INSERT INTO `__type_lists` SELECT s.`trash_id`, s.`name`, 'connections', j.`value` FROM `__types` s, json_each(CASE WHEN s.`reads` AND NOT (s.`connections` IS NULL OR CASE WHEN json_valid(s.`connections`) THEN json_type(s.`connections`) = 'null' ELSE 0 END) THEN s.`connections` ELSE '[]' END) j;--> statement-breakpoint
INSERT INTO `__type_lists` SELECT s.`trash_id`, s.`name`, 'set_skill', j.`value` FROM `__types` s, json_each(CASE WHEN s.`reads` AND NOT (s.`starting_set` IS NULL OR CASE WHEN json_valid(s.`starting_set`) THEN json_type(s.`starting_set`) = 'null' ELSE 0 END) THEN s.`starting_set` ELSE '{}' END, '$.skills') j;--> statement-breakpoint
INSERT INTO `__type_lists` SELECT s.`trash_id`, s.`name`, 'set_server', j.`value` FROM `__types` s, json_each(CASE WHEN s.`reads` AND NOT (s.`starting_set` IS NULL OR CASE WHEN json_valid(s.`starting_set`) THEN json_type(s.`starting_set`) = 'null' ELSE 0 END) THEN s.`starting_set` ELSE '{}' END, '$.servers') j;--> statement-breakpoint
INSERT INTO `delegate_types` (`name`, `description`, `harness`, `model`, `effort`, `account`, `may_start_any`, `starts_with_all`, `created_at`) SELECT `name`, `description`, `harness`, `model`, `effort`, `account`, `may_start_any`, `starts_with_all`, `created_at` FROM `__types` WHERE `trash_id` IS NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `delegate_type_may_start` (`type_name`, `delegate_type`) SELECT `name`, `value` FROM `__type_lists` WHERE `trash_id` IS NULL AND `list` = 'may_start' ORDER BY rowid;--> statement-breakpoint
INSERT OR IGNORE INTO `delegate_type_skills` (`type_name`, `skill`) SELECT `name`, `value` FROM `__type_lists` WHERE `trash_id` IS NULL AND `list` = 'skills' ORDER BY rowid;--> statement-breakpoint
INSERT OR IGNORE INTO `delegate_type_deny_tools` (`type_name`, `tool`) SELECT `name`, `value` FROM `__type_lists` WHERE `trash_id` IS NULL AND `list` = 'deny_tools' ORDER BY rowid;--> statement-breakpoint
INSERT OR IGNORE INTO `delegate_type_connections` (`type_name`, `connection`) SELECT `name`, `value` FROM `__type_lists` WHERE `trash_id` IS NULL AND `list` = 'connections' ORDER BY rowid;--> statement-breakpoint
INSERT OR IGNORE INTO `delegate_type_starting_set` (`type_name`, `kind`, `name`) SELECT `name`, 'skill', `value` FROM `__type_lists` WHERE `trash_id` IS NULL AND `list` = 'set_skill' ORDER BY rowid;--> statement-breakpoint
INSERT OR IGNORE INTO `delegate_type_starting_set` (`type_name`, `kind`, `name`) SELECT `name`, 'server', `value` FROM `__type_lists` WHERE `trash_id` IS NULL AND `list` = 'set_server' ORDER BY rowid;--> statement-breakpoint
-- Each trashed type as the trash now keeps one (db/trash.ts `PARTS`): its row, then its lists.
UPDATE `config_trash` SET `rows` = (SELECT json_array(json_object('table', 'delegate_types', 'rows', json_array(json_object('name', s.`name`, 'description', s.`description`, 'harness', s.`harness`, 'model', s.`model`, 'effort', s.`effort`, 'account', s.`account`, 'may_start_any', s.`may_start_any`, 'starts_with_all', s.`starts_with_all`, 'created_at', s.`created_at`))), json_object('table', 'delegate_type_may_start', 'rows', json((SELECT json_group_array(json_object('type_name', l.`name`, 'delegate_type', l.`value`)) FROM `__type_lists` l WHERE l.`trash_id` = s.`trash_id` AND l.`list` = 'may_start'))), json_object('table', 'delegate_type_skills', 'rows', json((SELECT json_group_array(json_object('type_name', l.`name`, 'skill', l.`value`)) FROM `__type_lists` l WHERE l.`trash_id` = s.`trash_id` AND l.`list` = 'skills'))), json_object('table', 'delegate_type_deny_tools', 'rows', json((SELECT json_group_array(json_object('type_name', l.`name`, 'tool', l.`value`)) FROM `__type_lists` l WHERE l.`trash_id` = s.`trash_id` AND l.`list` = 'deny_tools'))), json_object('table', 'delegate_type_connections', 'rows', json((SELECT json_group_array(json_object('type_name', l.`name`, 'connection', l.`value`)) FROM `__type_lists` l WHERE l.`trash_id` = s.`trash_id` AND l.`list` = 'connections'))), json_object('table', 'delegate_type_starting_set', 'rows', json((SELECT json_group_array(json_object('type_name', l.`name`, 'kind', substr(l.`list`, 5), 'name', l.`value`)) FROM `__type_lists` l WHERE l.`trash_id` = s.`trash_id` AND l.`list` IN ('set_skill', 'set_server'))))) FROM `__types` s WHERE s.`trash_id` = `config_trash`.`id`) WHERE `id` IN (SELECT `trash_id` FROM `__types` WHERE `trash_id` IS NOT NULL);--> statement-breakpoint
INSERT INTO `delegate_types_meta` (`key`, `value`) SELECT `key`, `value` FROM `__hand_delegate_types_meta`;--> statement-breakpoint
DROP TABLE `__type_lists`;--> statement-breakpoint
DROP TABLE `__types`;--> statement-breakpoint
DROP TABLE `__hand_delegate_types`;--> statement-breakpoint
DROP TABLE `__hand_delegate_types_meta`;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `may_start`;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `starting_set`;