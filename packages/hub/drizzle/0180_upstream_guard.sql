-- The upstream guard (core upstream-guard.ts): the fleet's answer, asked once
-- in onboarding (no row: never answered, sessions may post upstream), and each
-- project's own, null inheriting the fleet's.
CREATE TABLE `upstream_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`posts` integer,
	`answered_at` integer
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `upstream_posts` integer;