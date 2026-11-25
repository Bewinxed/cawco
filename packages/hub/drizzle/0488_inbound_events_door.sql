-- The door (provider spec §2.5, §4 "Events"): every inbound event is
-- stored once per project, through the watch it came by, naming the mirror
-- row of its item, who caused it, the task it is about, and when its
-- subscribers ran.
--
-- - `watch_id` of a stored event is its project's watch of its source: the
--   GitHub watch of `github:<owner>/<repo>`, the connector poll's watch of
--   `conn:<connection>:<tool>` (the oldest, when two poll one tool); none
--   for a relay's generic delivery (`hook:<id>`). `item_id`, `origin` and
--   `task_id` stay null: nothing stored said them.
-- - `processed_at` of a stored event is its `received_at`, so nothing
--   stored runs again.
-- - The delivery index becomes (project, source, key): a second project
--   that watches the same repository stores its own events.
-- - A close keeps its time: `issue:<n>:closed` and `pr:<n>:closed` become
--   `…:closed@<ms>`, the `at` of the event's payload (GitHub's
--   `closed_at`), as the poll and a webhook key a close from now on, so a
--   second close after a reopen lands as its own.
-- - The `github-event` trigger kind is folded into `inbound-event`: a
--   trigger held on its project under the old kind is held under the new.
DROP INDEX `inbound_events_delivery`;--> statement-breakpoint
ALTER TABLE `inbound_events` ADD `watch_id` text REFERENCES watches(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `inbound_events` ADD `item_id` text REFERENCES external_items(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `inbound_events` ADD `origin` text;--> statement-breakpoint
ALTER TABLE `inbound_events` ADD `task_id` text;--> statement-breakpoint
ALTER TABLE `inbound_events` ADD `processed_at` integer;--> statement-breakpoint
CREATE INDEX `inbound_events_unprocessed` ON `inbound_events` (`received_at`) WHERE "inbound_events"."processed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_events_delivery` ON `inbound_events` (`project_id`,`source`,`delivery_key`);--> statement-breakpoint
UPDATE `inbound_events` SET `processed_at` = `received_at`;--> statement-breakpoint
UPDATE `inbound_events` SET `watch_id` = (
	SELECT `w`.`id` FROM `watches` `w`
	WHERE `w`.`project_id` = `inbound_events`.`project_id`
		AND `w`.`provider` = 'github'
		AND 'github:' || lower(`w`.`container`) = `inbound_events`.`source`
	ORDER BY `w`.`created_at`, `w`.`id` LIMIT 1
) WHERE `source` LIKE 'github:%';--> statement-breakpoint
UPDATE `inbound_events` SET `watch_id` = (
	SELECT `w`.`id` FROM `watches` `w`
	WHERE `w`.`project_id` = `inbound_events`.`project_id`
		AND `w`.`provider` = 'connection'
		AND 'conn:' || `w`.`connection` || ':' || coalesce(json_extract(`w`.`settings`, '$.tool'), '') = `inbound_events`.`source`
	ORDER BY `w`.`created_at`, `w`.`id` LIMIT 1
) WHERE `source` LIKE 'conn:%';--> statement-breakpoint
UPDATE `inbound_events`
	SET `delivery_key` = `delivery_key` || '@' || CAST(json_extract(`payload`, '$.at') AS INTEGER)
	WHERE `source` LIKE 'github:%'
		AND (`delivery_key` GLOB 'issue:[0-9]*:closed' OR `delivery_key` GLOB 'pr:[0-9]*:closed')
		AND `delivery_key` NOT GLOB '*:labeled:*'
		AND json_valid(`payload`)
		AND typeof(json_extract(`payload`, '$.at')) IN ('integer', 'real');--> statement-breakpoint
UPDATE `held_triggers` SET `kind` = 'inbound-event' WHERE `kind` = 'github-event';
