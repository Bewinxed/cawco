-- The fleet's skill and plugin listings read off an index of their own
-- columns, never past a row's `files` (megabytes): 10 and 12.6 ms a
-- listing on the live database, asked once per row of a pass (db/schema.ts).
CREATE INDEX `plugins_listing` ON `plugins` (`id`,`enabled`,`hash`,`bytes`,`error`,`version`,`last_refresh`,`latest_hash`,`latest_version`,`checked_at`,`check_error`);--> statement-breakpoint
CREATE INDEX `skills_listing` ON `skills` (`name`,`source`,`enabled`,`hash`,`bytes`,`error`,`scope`,`project_id`,`version`,`last_refresh`,`latest_hash`,`latest_version`,`checked_at`,`check_error`);