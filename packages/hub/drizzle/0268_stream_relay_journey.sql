-- The stream relay's guided journey (relay-journey.ts): one row, what the
-- person and the machine settled on each step (the machine, the name, the
-- sealed Cloudflare token, the router's answer, the low ports, the
-- certificate), and each device's last proof of the relay. The certificate's
-- end moves from the relay's row to the journey's, which issues it now. Two
-- new tables and a dropped column a relay from before reads again on its
-- next renewal: nothing else is rebuilt.
CREATE TABLE `stream_relay_journey` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text,
	`address` text,
	`lan` text,
	`domain` text,
	`name` text,
	`name_state` text DEFAULT 'open' NOT NULL,
	`cloudflare_token` text,
	`router` text,
	`router_how` text,
	`low_ports` integer DEFAULT false NOT NULL,
	`certificate_name` text,
	`certificate_ends_at` integer,
	`certificate_why` text,
	`closed` text,
	`live_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `agents`(`machine_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `stream_relay_proofs` (
	`device_id` text PRIMARY KEY NOT NULL,
	`device` text NOT NULL,
	`address` text,
	`outside` integer NOT NULL,
	`ports` text DEFAULT '[]' NOT NULL,
	`refused` integer DEFAULT false NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `stream_relay` DROP COLUMN `certificate_ends_at`;