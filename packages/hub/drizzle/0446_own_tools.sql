-- The fleet's two switches (core own-tools.ts): whether sessions use CawCo's
-- delegates or their agent's own subagents, and CawCo's plan list or their
-- agent's own to-do list and plan mode. Null until a person chooses, so the
-- first run asks; a session then starts on CawCo's way, as every one did.
ALTER TABLE `supervisor_config` ADD `helpers` text;--> statement-breakpoint
ALTER TABLE `supervisor_config` ADD `step_lists` text;