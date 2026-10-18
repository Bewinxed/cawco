-- Three workarounds whose rows nothing needs:
--
-- Every send keeps its body. The records from before the hub kept bodies
-- (88 on the live hub, all `read` turns) go: their words stay in their
-- sessions' transcripts, which show them as plain entries with no send chip.
-- They were carried out first, on the hub's host, to
-- ~/.cawco/carries/0236_sent_messages_without_body.json (`sqlite3 -json`,
-- named for this migration's number before it was rebased onto 0234), so
-- this can be undone by hand. What pointed at them goes with them: a lead's
-- waiting wake, and the replace links of their neighbours.
--
-- Every agent speaks the session address contract (a daemon on another
-- protocol is held at register and offered this build), so whether a machine
-- or a row's birth spoke it is no longer kept: an end of an OpenCode row with
-- no session id is never-started on every row, old or new.
-- `address_protocol` was written and never read.
--
-- 0032 writes the `supervisor` row with its four denials on every hub, and
-- 0190 set `denied_seeded` from them, so it was true everywhere: the fleet's
-- denials are the rows of `fleet_denied_tools`, sent to every machine.
DELETE FROM `lead_turn_waiting` WHERE `send_uuid` IN (SELECT `uuid` FROM `sent_messages` WHERE `body` IS NULL);--> statement-breakpoint
UPDATE `sent_messages` SET `replaces` = NULL WHERE `replaces` IN (SELECT `uuid` FROM `sent_messages` WHERE `body` IS NULL);--> statement-breakpoint
UPDATE `sent_messages` SET `replaced_by` = NULL WHERE `replaced_by` IN (SELECT `uuid` FROM `sent_messages` WHERE `body` IS NULL);--> statement-breakpoint
DELETE FROM `sent_messages` WHERE `body` IS NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sent_messages` (
	`uuid` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`harness_id` text,
	`body` text NOT NULL,
	`mode` text DEFAULT 'turn' NOT NULL,
	`state` text DEFAULT 'read' NOT NULL,
	`reason` text,
	`refusal` text,
	`anchor` text,
	`replaces` text,
	`replaced_by` text,
	`held` integer DEFAULT false NOT NULL,
	`owed` text,
	`envelope` text,
	`delivery` text
);
--> statement-breakpoint
INSERT INTO `__new_sent_messages`("uuid", "instance_id", "accepted_at", "harness_id", "body", "mode", "state", "reason", "refusal", "anchor", "replaces", "replaced_by", "held", "owed", "envelope", "delivery") SELECT "uuid", "instance_id", "accepted_at", "harness_id", "body", "mode", "state", "reason", "refusal", "anchor", "replaces", "replaced_by", "held", "owed", "envelope", "delivery" FROM `sent_messages`;--> statement-breakpoint
DROP TABLE `sent_messages`;--> statement-breakpoint
ALTER TABLE `__new_sent_messages` RENAME TO `sent_messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `sent_messages_harness_id` ON `sent_messages` (`harness_id`);--> statement-breakpoint
CREATE INDEX `sent_messages_state` ON `sent_messages` (`instance_id`,`state`);--> statement-breakpoint
ALTER TABLE `agents` DROP COLUMN `address_contract`;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `address_required`;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `address_protocol`;--> statement-breakpoint
ALTER TABLE `supervisor_config` DROP COLUMN `denied_seeded`;