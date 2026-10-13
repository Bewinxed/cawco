-- Fleet watch replaces the LLM supervisor, its per-session autopilot and its
-- intervention log (Projects spec §5.3, P5). A rule only the supervisor acted
-- on (`action` 'llm', or an `every-turn` trigger, which only 'llm' allowed)
-- has nothing left to fire it, so it goes with its per-session state; every
-- `reply` rule, phrase, regex and meaning alike, stays as it is.
DELETE FROM `rule_state` WHERE `rule_id` IN (SELECT `id` FROM `rules` WHERE `action` = 'llm' OR `trigger` = 'every-turn');--> statement-breakpoint
DELETE FROM `rules` WHERE `action` = 'llm' OR `trigger` = 'every-turn';--> statement-breakpoint
DROP TABLE `supervisor_events`;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `autopilot`;--> statement-breakpoint
ALTER TABLE `rules` DROP COLUMN `trigger`;--> statement-breakpoint
ALTER TABLE `rules` DROP COLUMN `action`;--> statement-breakpoint
ALTER TABLE `rules` DROP COLUMN `prompt`;--> statement-breakpoint
ALTER TABLE `supervisor_config` DROP COLUMN `enabled`;--> statement-breakpoint
ALTER TABLE `supervisor_config` DROP COLUMN `base_url`;--> statement-breakpoint
ALTER TABLE `supervisor_config` DROP COLUMN `model`;--> statement-breakpoint
ALTER TABLE `supervisor_config` DROP COLUMN `api_key`;
