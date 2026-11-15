-- The files a skill, a plugin and a kept skill version held as JSON
-- (`files`) are rows of 0422's tables now, placed by the step before this
-- migration (db/migrate.ts `fleet-files`, db/fleet-files-unread.ts), with
-- the trash's skills and plugins; a list that did not read is kept as
-- stored in `files_unread`. What the last fetch came to (`last_refresh`) is
-- 0422's `refresh_*` columns. Both go.
ALTER TABLE `fleet_skill_history` DROP COLUMN `files`;--> statement-breakpoint
ALTER TABLE `plugins` DROP COLUMN `files`;--> statement-breakpoint
ALTER TABLE `plugins` DROP COLUMN `last_refresh`;--> statement-breakpoint
ALTER TABLE `skills` DROP COLUMN `files`;--> statement-breakpoint
ALTER TABLE `skills` DROP COLUMN `last_refresh`;