-- The upstream choice's third answer (core upstream-guard.ts `UpstreamPosts`):
-- each answer is `off`, `ask` or `on` instead of a boolean. What was given is
-- kept: false was `off`, true was `on`; null stays unanswered (the fleet's) or
-- inheriting (a project's). In place, so no table is rebuilt.
ALTER TABLE `projects` ADD `upstream_answer` text;--> statement-breakpoint
UPDATE `projects` SET `upstream_answer` = CASE `upstream_posts` WHEN 1 THEN 'on' WHEN 0 THEN 'off' END;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `upstream_posts`;--> statement-breakpoint
ALTER TABLE `projects` RENAME COLUMN `upstream_answer` TO `upstream_posts`;--> statement-breakpoint
ALTER TABLE `upstream_settings` ADD `answer` text;--> statement-breakpoint
UPDATE `upstream_settings` SET `answer` = CASE `posts` WHEN 1 THEN 'on' WHEN 0 THEN 'off' END;--> statement-breakpoint
ALTER TABLE `upstream_settings` DROP COLUMN `posts`;--> statement-breakpoint
ALTER TABLE `upstream_settings` RENAME COLUMN `answer` TO `posts`;
