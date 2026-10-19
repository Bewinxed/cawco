-- The fleet's stream relay (stream-relay.ts): one row, the machine that runs
-- coturn, the address and DNS name it is reached by, the shared secret
-- (sealed by secret-box.ts on write), and what its machine and the hub's
-- health check last said. No row is no relay. `relay_asked_at` is when a new
-- project's setup page last had the relay card answered, so it is offered
-- once. A new table and a new nullable column: nothing is rebuilt.
CREATE TABLE `stream_relay` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`address` text NOT NULL,
	`hostname` text,
	`external_ip` text,
	`secret` text NOT NULL,
	`wanted` integer DEFAULT true NOT NULL,
	`state` text DEFAULT 'starting' NOT NULL,
	`ports` text,
	`why` text,
	`health` text DEFAULT '[]' NOT NULL,
	`checked_at` integer,
	`certificate_ends_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `agents`(`machine_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `supervisor_config` ADD `relay_asked_at` integer;