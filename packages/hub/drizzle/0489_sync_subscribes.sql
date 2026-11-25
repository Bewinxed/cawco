-- The tracker sync subscribes to the door (provider spec §2.5 step 2, §4):
-- one poll reads a syncing watch, and the sync takes what it hands the door.
--
-- Marks: each syncing watch's own `sync:issues` and `sync:comments` marks
-- merge into its `issues` and `comments` streams. On GitHub a stream keeps
-- the older `since` of the two and no ETag, so the gap between them is read
-- again: a revision the mirror holds and an event whose key is stored store
-- nothing, and an issue a task links files no task. A binding whose cursor
-- never read had `bound_at` placed as its mark (0486), which the older of
-- the two keeps. A Linear team's marks become its two streams' as they are,
-- `{ since }`. Then the `sync:` streams go.
--
-- The sync's poll fields leave `settings` for the watch's columns:
-- `syncReason` the row's `reason` where the poll kept none, `syncPolledAt`
-- and `syncResumeAt` the later of each pair. Every syncing watch is read by
-- the poll now: `enabled`.
--
-- The sync's own problem with a task (a refused update, a refused comment)
-- leaves the issue's mirror row for its `tracker_links` row, so a related
-- link of another task no longer shows it. A record a syncing project
-- holds was read by its sync alone (the link reads passed it over), so its
-- row's problem is the sync's.
--
-- `synced_version`: the version the sync last took in. Every row is taken
-- in as it stands, except each issue of a syncing watch's container: those
-- stay behind, so the hub's first start runs the sync on each, reading it
-- now, and files or reconciles what the old sync's poll had not reached.
--
-- `projects.outsiders` (above): every project holds an outsider's event, as
-- the sync held their issue before.
ALTER TABLE `projects` ADD `outsiders` text DEFAULT 'hold' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracker_links` ADD `problem` text;--> statement-breakpoint
INSERT INTO `watch_cursors` (`watch_id`, `stream`, `cursor`, `polls`, `not_modified`, `updated_at`)
SELECT s.`watch_id`, substr(s.`stream`, 6),
	CASE WHEN w.`provider` = 'linear'
		THEN json_object('since', json_extract(s.`cursor`, '$.since'))
		ELSE json_object('etag', NULL, 'since', min(
			coalesce(json_extract(s.`cursor`, '$.since'), json_extract(p.`cursor`, '$.since')),
			coalesce(json_extract(p.`cursor`, '$.since'), json_extract(s.`cursor`, '$.since'))
		))
	END,
	coalesce(p.`polls`, s.`polls`), coalesce(p.`not_modified`, 0), coalesce(p.`updated_at`, s.`updated_at`)
FROM `watch_cursors` s
JOIN `watches` w ON w.`id` = s.`watch_id`
LEFT JOIN `watch_cursors` p ON p.`watch_id` = s.`watch_id` AND p.`stream` = substr(s.`stream`, 6)
WHERE s.`stream` IN ('sync:issues', 'sync:comments') AND json_extract(s.`cursor`, '$.since') IS NOT NULL
ON CONFLICT (`watch_id`, `stream`) DO UPDATE SET `cursor` = excluded.`cursor`, `not_modified` = excluded.`not_modified`;
--> statement-breakpoint
DELETE FROM `watch_cursors` WHERE `stream` IN ('sync:issues', 'sync:comments');--> statement-breakpoint
UPDATE `watches` SET
	`reason` = coalesce(`reason`, json_extract(`settings`, '$.syncReason')),
	`polled_at` = CASE
		WHEN json_extract(`settings`, '$.syncPolledAt') IS NULL THEN `polled_at`
		ELSE max(coalesce(`polled_at`, 0), json_extract(`settings`, '$.syncPolledAt'))
	END,
	`resume_at` = CASE
		WHEN json_extract(`settings`, '$.syncResumeAt') IS NULL THEN `resume_at`
		ELSE max(coalesce(`resume_at`, 0), json_extract(`settings`, '$.syncResumeAt'))
	END,
	`settings` = json_remove(`settings`, '$.syncReason', '$.syncPolledAt', '$.syncResumeAt'),
	`enabled` = CASE WHEN `sync` != 'off' THEN 1 ELSE `enabled` END
WHERE `settings` LIKE '%"sync%' OR `sync` != 'off';
--> statement-breakpoint
UPDATE `tracker_links` SET `problem` = (
	SELECT i.`problem` FROM `task_links` l JOIN `external_items` i ON i.`id` = l.`item_id`
	WHERE l.`project_id` = `tracker_links`.`project_id` AND l.`task_id` = `tracker_links`.`task_id` AND l.`mode` = 'record'
);
--> statement-breakpoint
UPDATE `external_items` SET `problem` = NULL WHERE `id` IN (
	SELECT l.`item_id` FROM `task_links` l
	JOIN `tracker_links` t ON t.`project_id` = l.`project_id` AND t.`task_id` = l.`task_id`
	WHERE l.`mode` = 'record'
);
--> statement-breakpoint
UPDATE `external_items` SET `synced_version` = `version`
WHERE `version` IS NOT NULL AND NOT (
	`kind` = 'issue' AND EXISTS (
		SELECT 1 FROM `watches` w
		WHERE w.`project_id` = `external_items`.`project_id` AND w.`sync` != 'off' AND w.`provider` = `external_items`.`provider`
			AND (w.`provider` = 'linear' OR lower(w.`container`) = `external_items`.`container`)
	)
);
