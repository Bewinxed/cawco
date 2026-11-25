-- A relay belongs to a watch (provider spec §2.4, §4 "Relays"): a webhook
-- is a faster way into a watch, never a second source. Ids, secrets, hook
-- ids and public URLs are untouched, so no webhook registered on GitHub
-- changes.
--
-- - A GitHub relay gets its project's watch of its repository (`repo`,
--   compared as GitHub does, without case). Where the project has none (it
--   follows GitHub through no connection), one is made with the relay's
--   connection, named `<project>:github:<repo>` and dated as the relay,
--   not `enabled`: nothing polled that repository for the project, and the
--   relay's deliveries go on landing in it as before.
-- - A Stripe or generic relay gets a new watch of provider `connection`
--   with the relay's own id (its container too), so what it delivers stays
--   source `hook:<relay id>`, and its events stored so far name it. Its
--   settings hold how the sender signs: `stripe`, or `hmac-header` with the
--   relay's signature and timestamp headers; and its id path. JSON keys are
--   in the order the hub writes them (db/stored-shapes.ts). Nothing polls
--   it: a watch whose settings name a scheme is no connector poll.
-- - Then `relays` takes `watch_id` and loses `provider`, `connection`,
--   `repo`, `signature_header`, `timestamp_header` and `id_path`, rebuilt
--   since SQLite adds no NOT NULL column without a default.
INSERT INTO `watches` (`id`, `project_id`, `provider`, `host`, `container`, `container_name`, `container_url`, `connection`, `sync`, `sync_since`, `sync_direction_at`, `settings`, `enabled`, `state`, `reason`, `resume_at`, `polled_at`, `created_by`, `created_at`)
SELECT `r`.`project_id` || ':github:' || coalesce(`r`.`repo`, `r`.`id`),
	`r`.`project_id`, 'github', 'github.com', coalesce(`r`.`repo`, `r`.`id`), coalesce(`r`.`repo`, `r`.`id`),
	'https://github.com/' || coalesce(`r`.`repo`, `r`.`id`),
	coalesce(`r`.`connection`, ''), 'off', NULL, NULL, '{}', 0, NULL, NULL, NULL, NULL,
	`r`.`created_by`, `r`.`created_at`
FROM `relays` `r`
WHERE `r`.`provider` = 'github'
	AND `r`.`rowid` = (
		SELECT min(`o`.`rowid`) FROM `relays` `o`
		WHERE `o`.`provider` = 'github' AND `o`.`project_id` = `r`.`project_id`
			AND lower(coalesce(`o`.`repo`, `o`.`id`)) = lower(coalesce(`r`.`repo`, `r`.`id`))
	)
	AND NOT EXISTS (
		SELECT 1 FROM `watches` `w`
		WHERE `w`.`project_id` = `r`.`project_id` AND `w`.`provider` = 'github'
			AND `w`.`host` = 'github.com'
			AND lower(`w`.`container`) = lower(coalesce(`r`.`repo`, `r`.`id`))
	);--> statement-breakpoint
INSERT INTO `watches` (`id`, `project_id`, `provider`, `host`, `container`, `container_name`, `container_url`, `connection`, `sync`, `sync_since`, `sync_direction_at`, `settings`, `enabled`, `state`, `reason`, `resume_at`, `polled_at`, `created_by`, `created_at`)
SELECT `r`.`id`, `r`.`project_id`, 'connection', '', `r`.`id`, 'hook:' || `r`.`id`, '', '', 'off', NULL, NULL,
	json_object(
		'idPath', CASE WHEN `r`.`provider` = 'stripe' THEN NULL ELSE `r`.`id_path` END,
		'scheme', CASE WHEN `r`.`provider` = 'stripe' THEN 'stripe' ELSE 'hmac-header' END,
		'signatureHeader', CASE WHEN `r`.`provider` = 'stripe' THEN NULL ELSE `r`.`signature_header` END,
		'timestampHeader', CASE WHEN `r`.`provider` = 'stripe' THEN NULL ELSE `r`.`timestamp_header` END
	),
	1, NULL, NULL, NULL, NULL, `r`.`created_by`, `r`.`created_at`
FROM `relays` `r`
WHERE `r`.`provider` != 'github';--> statement-breakpoint
CREATE TABLE `__new_relays` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`watch_id` text NOT NULL,
	`secret` text,
	`secret_from` text,
	`hook_id` text,
	`host` text NOT NULL,
	`public_url` text,
	`state` text NOT NULL,
	`reason` text,
	`tested_at` integer,
	`last_delivery_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`watch_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_relays` (`id`, `project_id`, `watch_id`, `secret`, `secret_from`, `hook_id`, `host`, `public_url`, `state`, `reason`, `tested_at`, `last_delivery_at`, `created_by`, `created_at`)
SELECT `r`.`id`, `r`.`project_id`,
	CASE WHEN `r`.`provider` = 'github' THEN (
		SELECT `w`.`id` FROM `watches` `w`
		WHERE `w`.`project_id` = `r`.`project_id` AND `w`.`provider` = 'github'
			AND `w`.`host` = 'github.com'
			AND lower(`w`.`container`) = lower(coalesce(`r`.`repo`, `r`.`id`))
		ORDER BY `w`.`enabled` DESC, `w`.`created_at`, `w`.`id` LIMIT 1
	) ELSE `r`.`id` END,
	`r`.`secret`, `r`.`secret_from`, `r`.`hook_id`, `r`.`host`, `r`.`public_url`, `r`.`state`, `r`.`reason`,
	`r`.`tested_at`, `r`.`last_delivery_at`, `r`.`created_by`, `r`.`created_at`
FROM `relays` `r`;--> statement-breakpoint
DROP TABLE `relays`;--> statement-breakpoint
ALTER TABLE `__new_relays` RENAME TO `relays`;--> statement-breakpoint
CREATE INDEX `relays_project` ON `relays` (`project_id`);--> statement-breakpoint
CREATE INDEX `relays_watch` ON `relays` (`watch_id`);--> statement-breakpoint
UPDATE `inbound_events` SET `watch_id` = substr(`source`, 6)
WHERE `source` LIKE 'hook:%' AND `watch_id` IS NULL
	AND EXISTS (SELECT 1 FROM `watches` `w` WHERE `w`.`id` = substr(`inbound_events`.`source`, 6));
