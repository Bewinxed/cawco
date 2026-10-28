-- Each machine's fleet deltas go under a generation the hub keeps (hub
-- fleet-sync.ts): raised only when what the machine is to hold changes, so
-- a delta sent again goes under the same one. The last outcome kept named a
-- rev, a send counter no delta carries any more: it is let go, and the
-- next delta says its own.
ALTER TABLE `agents` ADD `fleet_generation` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `fleet_fingerprint` text;--> statement-breakpoint
UPDATE `agents` SET `fleet_sync` = NULL;
