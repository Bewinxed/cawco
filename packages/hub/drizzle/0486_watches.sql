-- Watches (provider spec §2.4, §4): one row per container a project follows
-- through one connection, its streams' cursors in `watch_cursors`. They
-- replace `github_pollers` with `github_poll_cursors`, `tracker_bindings`
-- and `connector_polls`; `connector_poll_items` stays, keyed by the poll's
-- watch, which keeps the poll's id.
--
-- A watch made here is named by what it watches, `<project>:<provider>:
-- <container>`, and dated by when its repository was linked (the poller's
-- last poll for one only its cursors name) or its binding bound, so the
-- same rows make the same watches. JSON keys are written in the order the
-- hub writes them (db/stored-shapes.ts), so a value reads back the same.
--
-- Watches from pollers: each GitHub poller makes a watch of each github.com
-- repository among its project's links, and of each repository its cursors
-- name (a repository no longer linked kept its cursors until its poller
-- went), with the poller's connection, reason, resume_at and polled_at;
-- `enabled`, since the poller reads it. Each cursor becomes the stream of
-- its resource, `{ etag, since }`, its counts carried. A poller whose
-- project links no github.com repository makes no watch: the step before
-- this migration (db/migrate.ts `watches-from-pollers`) logs each with its
-- connection, and which connection the project now follows by.
--
-- Watches from bindings: a binding sets `sync` = its direction, `sync_since`
-- = `bound_at`, `sync_direction_at` = `direction_at`, `state` = its state,
-- and its GitHub Project columns and its own poll's reason, polled_at and
-- resume_at into `settings`, on the poller's watch of that repository;
-- where the poller and the binding name different connections for it, the
-- binding's wins (the step before logs each such project). A binding with
-- no such watch (every Linear binding) makes its own, not `enabled`: the
-- GitHub poller did not read it. Its issues' and comments' marks become the
-- streams `sync:issues` and `sync:comments`, apart from the poller's, so
-- each poll reads its own as before. A cursor 0431 kept as not read
-- (`cursor_unread`) placed `bound_at` as the mark of each list that did not
-- read; it is carried with the raw cursor kept beside it as `unread`, until
-- the next poll that goes through writes the cursor.
--
-- Connector polls: each becomes a watch of provider `connection` with the
-- same id (its container), its tool, arguments, paths and interval in
-- `settings`. A poll that has looked (`seen_at` set) gets its one stream,
-- `items`, dated then; one with `seen_at` null gets none, so its next call
-- only looks.
CREATE TABLE `watch_cursors` (
	`watch_id` text NOT NULL,
	`stream` text NOT NULL,
	`cursor` text NOT NULL,
	`polls` integer DEFAULT 0 NOT NULL,
	`not_modified` integer DEFAULT 0 NOT NULL,
	`updated_at` integer,
	PRIMARY KEY(`watch_id`, `stream`),
	FOREIGN KEY (`watch_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `watches` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`host` text NOT NULL,
	`container` text NOT NULL,
	`container_name` text NOT NULL,
	`container_url` text NOT NULL,
	`connection` text NOT NULL,
	`sync` text DEFAULT 'off' NOT NULL,
	`sync_since` integer,
	`sync_direction_at` integer,
	`settings` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`state` text,
	`reason` text,
	`resume_at` integer,
	`polled_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watches_container` ON `watches` (`project_id`,`provider`,`host`,`container`);--> statement-breakpoint
CREATE UNIQUE INDEX `watches_sync` ON `watches` (`project_id`) WHERE "watches"."sync" != 'off';--> statement-breakpoint
CREATE TABLE `__poller_repos` (
	`project_id` text NOT NULL,
	`repo` text NOT NULL,
	`made` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__poller_repos` (`project_id`, `repo`, `made`)
SELECT `project_id`, min(`repo`), min(`made`) FROM (
	SELECT l.`project_id`, substr(l.`remote`, 12) AS `repo`, l.`created_at` AS `made`
	FROM `project_links` l JOIN `github_pollers` p ON p.`project_id` = l.`project_id`
	WHERE l.`remote` GLOB 'github.com/?*/?*' AND l.`remote` NOT GLOB 'github.com/*/*/*'
	UNION
	SELECT c.`project_id`, c.`repo`, coalesce(p.`polled_at`, 0) AS `made`
	FROM `github_poll_cursors` c JOIN `github_pollers` p ON p.`project_id` = c.`project_id`
)
GROUP BY `project_id`, lower(`repo`);
--> statement-breakpoint
INSERT INTO `watches` (`id`, `project_id`, `provider`, `host`, `container`, `container_name`, `container_url`, `connection`, `sync`, `sync_since`, `sync_direction_at`, `settings`, `enabled`, `state`, `reason`, `resume_at`, `polled_at`, `created_by`, `created_at`)
SELECT
	r.`project_id` || ':github:' || lower(r.`repo`),
	r.`project_id`,
	'github',
	'github.com',
	coalesce(b.`target`, r.`repo`),
	coalesce(b.`target_name`, r.`repo`),
	coalesce(b.`target_url`, 'https://github.com/' || r.`repo`),
	coalesce(b.`connection`, p.`connection`),
	coalesce(b.`direction`, 'off'),
	b.`bound_at`,
	b.`direction_at`,
	CASE WHEN b.`project_id` IS NULL THEN '{}' ELSE json_object(
		'githubProject', CASE WHEN json_valid(b.`github_project`) THEN json(b.`github_project`) END,
		'githubProjectReason', b.`github_project_reason`,
		'githubStatusesAdded', CASE WHEN json_valid(b.`github_statuses_added`) THEN json(b.`github_statuses_added`) END,
		'githubStatusesRefused', b.`github_statuses_refused`,
		'githubStatusStages', CASE WHEN json_valid(b.`github_status_stages`) THEN json(b.`github_status_stages`) END,
		'syncPolledAt', b.`polled_at`,
		'syncReason', b.`reason`,
		'syncResumeAt', b.`resume_at`
	) END,
	1,
	b.`state`,
	p.`reason`,
	p.`resume_at`,
	p.`polled_at`,
	'owner',
	r.`made`
FROM `__poller_repos` r
JOIN `github_pollers` p ON p.`project_id` = r.`project_id`
LEFT JOIN `tracker_bindings` b ON b.`project_id` = r.`project_id` AND b.`provider` = 'github' AND lower(b.`target`) = lower(r.`repo`);
--> statement-breakpoint
INSERT INTO `watches` (`id`, `project_id`, `provider`, `host`, `container`, `container_name`, `container_url`, `connection`, `sync`, `sync_since`, `sync_direction_at`, `settings`, `enabled`, `state`, `reason`, `resume_at`, `polled_at`, `created_by`, `created_at`)
SELECT
	b.`project_id` || ':' || b.`provider` || ':' || lower(b.`target`),
	b.`project_id`,
	b.`provider`,
	CASE b.`provider` WHEN 'github' THEN 'github.com' ELSE 'linear.app' END,
	b.`target`,
	b.`target_name`,
	b.`target_url`,
	b.`connection`,
	b.`direction`,
	b.`bound_at`,
	b.`direction_at`,
	json_object(
		'githubProject', CASE WHEN json_valid(b.`github_project`) THEN json(b.`github_project`) END,
		'githubProjectReason', b.`github_project_reason`,
		'githubStatusesAdded', CASE WHEN json_valid(b.`github_statuses_added`) THEN json(b.`github_statuses_added`) END,
		'githubStatusesRefused', b.`github_statuses_refused`,
		'githubStatusStages', CASE WHEN json_valid(b.`github_status_stages`) THEN json(b.`github_status_stages`) END,
		'syncPolledAt', b.`polled_at`,
		'syncReason', b.`reason`,
		'syncResumeAt', b.`resume_at`
	),
	0,
	b.`state`,
	NULL,
	NULL,
	NULL,
	'owner',
	b.`bound_at`
FROM `tracker_bindings` b
WHERE NOT EXISTS (
	SELECT 1 FROM `watches` w
	WHERE w.`project_id` = b.`project_id` AND w.`provider` = b.`provider` AND lower(w.`container`) = lower(b.`target`)
);
--> statement-breakpoint
INSERT INTO `watch_cursors` (`watch_id`, `stream`, `cursor`, `polls`, `not_modified`, `updated_at`)
SELECT w.`id`, c.`resource`, json_object('etag', c.`etag`, 'since', c.`since`), c.`polls`, c.`not_modified`, p.`polled_at`
FROM `github_poll_cursors` c
JOIN `github_pollers` p ON p.`project_id` = c.`project_id`
JOIN `watches` w ON w.`project_id` = c.`project_id` AND w.`provider` = 'github' AND lower(w.`container`) = lower(c.`repo`);
--> statement-breakpoint
INSERT INTO `watch_cursors` (`watch_id`, `stream`, `cursor`, `polls`, `not_modified`, `updated_at`)
SELECT w.`id`, 'sync:issues',
	CASE WHEN b.`cursor_unread` IS NULL
		THEN json_object('etag', b.`issues_etag`, 'since', b.`issues_since`)
		ELSE json_object('etag', b.`issues_etag`, 'since', b.`issues_since`, 'unread', b.`cursor_unread`)
	END,
	0, 0, b.`polled_at`
FROM `tracker_bindings` b
JOIN `watches` w ON w.`project_id` = b.`project_id` AND w.`sync` != 'off';
--> statement-breakpoint
INSERT INTO `watch_cursors` (`watch_id`, `stream`, `cursor`, `polls`, `not_modified`, `updated_at`)
SELECT w.`id`, 'sync:comments',
	CASE WHEN b.`cursor_unread` IS NULL
		THEN json_object('etag', b.`comments_etag`, 'since', b.`comments_since`)
		ELSE json_object('etag', b.`comments_etag`, 'since', b.`comments_since`, 'unread', b.`cursor_unread`)
	END,
	0, 0, b.`polled_at`
FROM `tracker_bindings` b
JOIN `watches` w ON w.`project_id` = b.`project_id` AND w.`sync` != 'off';
--> statement-breakpoint
INSERT INTO `watches` (`id`, `project_id`, `provider`, `host`, `container`, `container_name`, `container_url`, `connection`, `sync`, `sync_since`, `sync_direction_at`, `settings`, `enabled`, `state`, `reason`, `resume_at`, `polled_at`, `created_by`, `created_at`)
SELECT
	c.`id`,
	c.`project_id`,
	'connection',
	'',
	c.`id`,
	c.`connection` || '/' || c.`tool`,
	'',
	c.`connection`,
	'off',
	NULL,
	NULL,
	json_object(
		'args', CASE WHEN json_valid(c.`args`) THEN json(c.`args`) ELSE json('{}') END,
		'idPath', c.`id_path`,
		'intervalS', c.`interval_s`,
		'itemsPath', c.`items_path`,
		'tool', c.`tool`,
		'versionPath', c.`version_path`
	),
	c.`enabled`,
	NULL,
	c.`reason`,
	NULL,
	c.`polled_at`,
	c.`created_by`,
	c.`created_at`
FROM `connector_polls` c;
--> statement-breakpoint
INSERT INTO `watch_cursors` (`watch_id`, `stream`, `cursor`, `polls`, `not_modified`, `updated_at`)
SELECT `id`, 'items', '{}', 0, 0, `seen_at` FROM `connector_polls` WHERE `seen_at` IS NOT NULL;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_connector_poll_items` (
	`poll_id` text NOT NULL,
	`item_id` text NOT NULL,
	`version` text NOT NULL,
	PRIMARY KEY(`poll_id`, `item_id`),
	FOREIGN KEY (`poll_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_connector_poll_items`("poll_id", "item_id", "version") SELECT "poll_id", "item_id", "version" FROM `connector_poll_items`;--> statement-breakpoint
DROP TABLE `connector_poll_items`;--> statement-breakpoint
ALTER TABLE `__new_connector_poll_items` RENAME TO `connector_poll_items`;--> statement-breakpoint
DROP TABLE `__poller_repos`;--> statement-breakpoint
DROP TABLE `connector_polls`;--> statement-breakpoint
DROP TABLE `github_poll_cursors`;--> statement-breakpoint
DROP TABLE `github_pollers`;--> statement-breakpoint
DROP TABLE `tracker_bindings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
