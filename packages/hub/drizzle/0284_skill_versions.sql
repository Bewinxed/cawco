-- A skill's and a plugin's declared version, what its source held when last read (latest_*, checked_at, check_error), and what its last fetch came to (last_refresh): nullable columns, nothing backfilled; the next fetch or update check fills them.
ALTER TABLE `plugins` ADD `version` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `last_refresh` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `latest_hash` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `latest_version` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `checked_at` integer;--> statement-breakpoint
ALTER TABLE `plugins` ADD `check_error` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `version` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `last_refresh` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `latest_hash` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `latest_version` text;--> statement-breakpoint
ALTER TABLE `skills` ADD `checked_at` integer;--> statement-breakpoint
ALTER TABLE `skills` ADD `check_error` text;