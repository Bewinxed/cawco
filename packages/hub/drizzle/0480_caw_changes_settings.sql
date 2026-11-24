-- Caw's settings panel's one switch, Allow Caw to change these settings,
-- replaces the switch that let a project's sessions propose a Who decides
-- change (the owner's pick, 2026-11-23: the switch covers that panel only).
-- On, its sessions may change what Caw's chat and each kind of trigger run
-- as (project-settings.ts `set_caw`, `set_trigger`, `set_account`); off,
-- they read them only, and Who decides is read only to them either way. A
-- yes to proposing who decides is no yes to changing these, so every
-- project starts with the new switch off.
ALTER TABLE `projects` DROP COLUMN `caw_proposes_decides`;--> statement-breakpoint
ALTER TABLE `projects` ADD `caw_changes_settings` integer DEFAULT false NOT NULL;
