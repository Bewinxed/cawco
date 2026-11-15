-- What the hub decides on about a connection and a fleet MCP server's
-- sign-in under way gets plain columns, and each secret a sealed column of
-- its own; the values that held them, each one sealed bag of plain facts and
-- secrets (`connections.sealed`, `fleet_mcp_oauth.pending`), are moved into
-- them in code and dropped by 0420.
--
-- A connection: which machine's gh (`gh_machine_id`, `gh_host`, `gh_login`,
-- null together), a GitHub App's organization (`org`), an app's
-- registration (`app_service`, `app_id`, `app_slug`, `app_client_id`,
-- `app_installation_id`) and a code sign-in under way (`device_user_code`,
-- `device_verification_uri`, `device_expires_at`, `device_interval`, null
-- together); its secrets in `connection_secrets`, one row or none, each
-- column sealed alone (its key, its OAuth tokens and client kept whole as
-- the provider and the SDK made them, a sign-in's verifier, an app's
-- private key, client and webhook secrets, a code sign-in's device code).
-- `sealed_unread` keeps a value that did not read.
--
-- A fleet MCP server's sign-in under way: `pending_state` (unique: a
-- redirect is matched by it), `pending_redirect_uri`, `pending_expires_at`,
-- `pending_access` and its verifier sealed alone in `pending_verifier`;
-- `pending_unread` keeps a value that did not read. Its client was a copy
-- of `client`, written by the same statement, and is not kept twice.
--
-- Every column is null here: a sealed value opens only with the hub's key,
-- which SQL does not hold. The step before 0420 (db/migrate.ts
-- `sealed-facts`) fills them.
CREATE TABLE `connection_secrets` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`key` text,
	`tokens` text,
	`client` text,
	`verifier` text,
	`app_private_key` text,
	`app_client_secret` text,
	`app_webhook_secret` text,
	`device_code` text,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `connections` ADD `gh_machine_id` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `gh_host` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `gh_login` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `org` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `app_service` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `app_id` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `app_slug` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `app_client_id` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `app_installation_id` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `device_user_code` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `device_verification_uri` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `device_expires_at` integer;--> statement-breakpoint
ALTER TABLE `connections` ADD `device_interval` integer;--> statement-breakpoint
ALTER TABLE `connections` ADD `sealed_unread` text;--> statement-breakpoint
ALTER TABLE `fleet_mcp_oauth` ADD `pending_state` text;--> statement-breakpoint
ALTER TABLE `fleet_mcp_oauth` ADD `pending_redirect_uri` text;--> statement-breakpoint
ALTER TABLE `fleet_mcp_oauth` ADD `pending_expires_at` integer;--> statement-breakpoint
ALTER TABLE `fleet_mcp_oauth` ADD `pending_access` text;--> statement-breakpoint
ALTER TABLE `fleet_mcp_oauth` ADD `pending_verifier` text;--> statement-breakpoint
ALTER TABLE `fleet_mcp_oauth` ADD `pending_unread` text;--> statement-breakpoint
CREATE UNIQUE INDEX `fleet_mcp_oauth_pending_state_unique` ON `fleet_mcp_oauth` (`pending_state`);