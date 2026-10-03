ALTER TABLE `mcp_servers` ADD `auth_mode` text DEFAULT 'direct' NOT NULL;
--> statement-breakpoint
ALTER TABLE `mcp_servers` ADD `auth_error` text;
--> statement-breakpoint
CREATE TABLE `fleet_mcp_oauth` (
  `name` text PRIMARY KEY NOT NULL,
  `generation` text NOT NULL,
  `upstream` text NOT NULL,
  `resource` text NOT NULL,
  `issuer` text NOT NULL,
  `metadata` text NOT NULL,
  `client` text,
  `tokens` text,
  `expires_at` integer,
  `pending` text,
  `last_machine_id` text,
  `last_opened_at` integer
);
--> statement-breakpoint
ALTER TABLE `agents` ADD `browser_available` integer DEFAULT false NOT NULL;
