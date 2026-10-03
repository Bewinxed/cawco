CREATE TABLE `session_identities` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`credential_hash` text,
	`pending_hash` text,
	`installed_at` integer,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_identities_credential_hash_unique` ON `session_identities` (`credential_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_identities_pending_hash_unique` ON `session_identities` (`pending_hash`);
