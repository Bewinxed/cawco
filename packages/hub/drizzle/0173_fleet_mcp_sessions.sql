CREATE TABLE `fleet_mcp_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`server` text NOT NULL,
	`init` text NOT NULL,
	`used_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fleet_mcp_sessions_used` ON `fleet_mcp_sessions` (`used_at`);