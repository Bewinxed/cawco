-- Events are sends (one-session build, slice 2): each event the project's
-- conversation hears is one send to its session, so no turn of its is
-- tracked apart from the session's own, and what it costs is the session's
-- usage, as every session's is.
DROP TABLE `lead_turn_reading`;--> statement-breakpoint
DROP TABLE `lead_turn_waiting`;--> statement-breakpoint
DROP TABLE `lead_turns`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `lead_cost_seen`;--> statement-breakpoint
-- A routine's run is its session's (`lead_instance_id`); its slot is noted
-- in no thread.
ALTER TABLE `routine_runs` DROP COLUMN `thread_id`;--> statement-breakpoint
-- The permission mode the hub starts the project's conversation in, most
-- specific first: an event route's, its routine's, the project's, the
-- fleet's. Null at every level: the mode the person last chose for the
-- harness on that machine.
ALTER TABLE `event_routes` ADD `mode` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `mode` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `caw_mode` text;--> statement-breakpoint
ALTER TABLE `supervisor_config` ADD `caw_mode` text;
