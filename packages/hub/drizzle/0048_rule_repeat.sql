ALTER TABLE `rules` RENAME COLUMN "require_ack" TO "repeat";--> statement-breakpoint
ALTER TABLE `rule_state` DROP COLUMN `ack_note`;