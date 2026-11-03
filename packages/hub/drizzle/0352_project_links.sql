-- A project links one remote per repository (`project_links`), in place of
-- the one `projects.remote` its main repository had: a second repository's
-- checkouts, GitHub events and pull requests reach the project by its own
-- link. Each project's remote becomes its first link, a GitHub one taken as
-- its main repository's published copy, as the one link a publish refused
-- to make a second of. A GitHub relay names
-- the repository its webhook is on (`relays.repo`), and the GitHub poller
-- keeps cursors per repository (`github_poll_cursors.repo`), both the
-- project's GitHub repository until now; a poller's cursors for no
-- repository are dropped, as a new repository's start afresh.
CREATE TABLE `project_links` (
	`project_id` text NOT NULL,
	`remote` text NOT NULL,
	`published_from` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `remote`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_links_remote` ON `project_links` (`remote`);--> statement-breakpoint
INSERT INTO `project_links`("project_id", "remote", "published_from", "created_at") SELECT "id", "remote", CASE WHEN "remote" LIKE 'github.com/%' THEN "id" || '.git' END, "created_at" FROM `projects` WHERE "remote" IS NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_github_poll_cursors` (
	`project_id` text NOT NULL,
	`repo` text NOT NULL,
	`resource` text NOT NULL,
	`etag` text,
	`since` integer NOT NULL,
	`polls` integer NOT NULL,
	`not_modified` integer NOT NULL,
	PRIMARY KEY(`project_id`, `repo`, `resource`),
	FOREIGN KEY (`project_id`) REFERENCES `github_pollers`(`project_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_github_poll_cursors`("project_id", "repo", "resource", "etag", "since", "polls", "not_modified") SELECT c."project_id", p."repo", c."resource", c."etag", c."since", c."polls", c."not_modified" FROM `github_poll_cursors` c JOIN `github_pollers` p ON p."project_id" = c."project_id" WHERE p."repo" IS NOT NULL;--> statement-breakpoint
DROP TABLE `github_poll_cursors`;--> statement-breakpoint
ALTER TABLE `__new_github_poll_cursors` RENAME TO `github_poll_cursors`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `relays` ADD `repo` text;--> statement-breakpoint
UPDATE `relays` SET "repo" = (SELECT substr(p."remote", 12) FROM `projects` p WHERE p."id" = `relays`."project_id" AND p."remote" LIKE 'github.com/%') WHERE "provider" = 'github';--> statement-breakpoint
ALTER TABLE `github_pollers` DROP COLUMN `repo`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `remote`;
