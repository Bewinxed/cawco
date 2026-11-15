-- How many merge checks and commands a machine's pause stopped as it began
-- (`agents.pause_stopped`, JSON) is `pause_stopped_merge_checks` and
-- `pause_stopped_commands`, 0 when it stopped none of a kind; whether a
-- tool is signed in on a machine (`agent_tools.signin`, JSON) is
-- `signin_state` (the machine's own word), `signin_at` and `signin_detail`.
-- A value never set (null) places nothing, as before; one that reads whole
-- (core `StoppedCommands`, `NamedToolSignin`) is placed as it is.
--
-- One that is there and does not read whole is kept as stored in
-- `pause_stopped_unread` or `signin_unread`, none of it placed. The pause
-- itself is `paused_until`, untouched: the machine stays paused until
-- then, and its row says it stopped work it no longer counts until the
-- pause ends. A sign-in kept so reads as signed out until the machine says
-- it again. The step before this migration (db/migrate.ts
-- `machine-columns-unread`) logs each by its row and why.
--
-- A machine's capabilities (`agents.machine_capabilities`) no longer hold
-- `platform`: it is the first part of `agents.os` (core `machinePlatform`),
-- and the step logs each machine whose capabilities named another.
--
-- Every JSON function sits inside a CASE that proved its column JSON:
-- SQLite may run either side of an AND first.
ALTER TABLE `agent_tools` ADD `signin_state` text;--> statement-breakpoint
ALTER TABLE `agent_tools` ADD `signin_at` integer;--> statement-breakpoint
ALTER TABLE `agent_tools` ADD `signin_detail` text;--> statement-breakpoint
ALTER TABLE `agent_tools` ADD `signin_unread` text;--> statement-breakpoint
UPDATE `agent_tools` SET `signin_unread` = CASE WHEN `signin` IS NULL THEN NULL WHEN CASE WHEN json_valid(signin) THEN coalesce((json_type(signin, '$') IN ('object') AND (json_type(signin, '$.at') IN ('integer', 'real')) AND (json_type(signin, '$.state') IN ('text')) AND (json_type(signin, '$.detail') IS NULL OR (json_type(signin, '$.detail') IN ('text')))), 0) ELSE 0 END THEN NULL ELSE CAST(`signin` AS TEXT) END;--> statement-breakpoint
UPDATE `agent_tools` SET `signin_state` = CASE WHEN json_valid(signin) THEN CASE WHEN signin_unread IS NULL THEN json_extract(signin, '$.state') END END, `signin_at` = CASE WHEN json_valid(signin) THEN CASE WHEN signin_unread IS NULL THEN json_extract(signin, '$.at') END END, `signin_detail` = CASE WHEN json_valid(signin) THEN CASE WHEN signin_unread IS NULL THEN json_extract(signin, '$.detail') END END;--> statement-breakpoint
ALTER TABLE `agent_tools` DROP COLUMN `signin`;--> statement-breakpoint
ALTER TABLE `agents` ADD `pause_stopped_merge_checks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `pause_stopped_commands` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `pause_stopped_unread` text;--> statement-breakpoint
UPDATE `agents` SET `pause_stopped_unread` = CASE WHEN `pause_stopped` IS NULL THEN NULL WHEN CASE WHEN CASE WHEN json_valid(pause_stopped) THEN coalesce((json_type(pause_stopped, '$') IN ('object') AND CASE WHEN json_type(pause_stopped, '$') = 'object' THEN NOT EXISTS (SELECT 1 FROM json_each(pause_stopped, '$') e0 WHERE NOT coalesce((json_type(pause_stopped, e0.fullkey) IN ('integer', 'real')), 0)) ELSE 0 END), 0) ELSE 0 END THEN coalesce(CASE WHEN json_valid(pause_stopped) THEN NOT EXISTS (SELECT 1 FROM json_each(pause_stopped) k WHERE k.key NOT IN ('merge check', 'command')) END, 0) ELSE 0 END THEN NULL ELSE CAST(`pause_stopped` AS TEXT) END;--> statement-breakpoint
UPDATE `agents` SET `pause_stopped_merge_checks` = coalesce(CASE WHEN json_valid(pause_stopped) THEN CASE WHEN pause_stopped_unread IS NULL THEN json_extract(pause_stopped, '$."merge check"') END END, 0), `pause_stopped_commands` = coalesce(CASE WHEN json_valid(pause_stopped) THEN CASE WHEN pause_stopped_unread IS NULL THEN json_extract(pause_stopped, '$."command"') END END, 0);--> statement-breakpoint
UPDATE `agents` SET `machine_capabilities` = CASE WHEN json_valid(machine_capabilities) THEN CASE WHEN json_type(machine_capabilities) = 'object' THEN json_remove(machine_capabilities, '$.platform') ELSE `machine_capabilities` END ELSE `machine_capabilities` END WHERE `machine_capabilities` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` DROP COLUMN `pause_stopped`;