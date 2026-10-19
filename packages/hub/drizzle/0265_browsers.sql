-- The fleet's browsers (browsers.ts, Projects spec §5.11): one row per key
-- per machine, as its machine's last frame said, and who holds it privately.
-- A new table: nothing is rebuilt. Written by hand in drizzle-kit 0.31.11's
-- form (its generate no longer loads the schema in a workspace: core
-- process-identity.ts needs bun:ffi).
CREATE TABLE `browsers` (
	`key` text NOT NULL,
	`machine_id` text NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`state` text NOT NULL,
	`takeover_by` text,
	`takeover_request_id` text,
	`takeover_since` integer,
	`last_used_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`machine_id`, `key`),
	FOREIGN KEY (`machine_id`) REFERENCES `agents`(`machine_id`) ON UPDATE no action ON DELETE cascade
);
