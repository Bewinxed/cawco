-- A GitHub poller's cursors are rows (audit R13), one per resource, not a
-- JSON map: a poll writes each cursor it moved over its own row.
CREATE TABLE `github_poll_cursors` (
	`project_id` text NOT NULL,
	`resource` text NOT NULL,
	`etag` text,
	`since` integer NOT NULL,
	`polls` integer NOT NULL,
	`not_modified` integer NOT NULL,
	PRIMARY KEY(`project_id`, `resource`),
	FOREIGN KEY (`project_id`) REFERENCES `github_pollers`(`project_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `github_poll_cursors` (`project_id`, `resource`, `etag`, `since`, `polls`, `not_modified`)
SELECT g.`project_id`, c.key, json_extract(c.value, '$.etag'), json_extract(c.value, '$.since'),
  coalesce(json_extract(c.value, '$.polls'), 0), coalesce(json_extract(c.value, '$.notModified'), 0)
FROM `github_pollers` g, json_each(g.`cursors`) c;
--> statement-breakpoint
ALTER TABLE `github_pollers` DROP COLUMN `cursors`;
