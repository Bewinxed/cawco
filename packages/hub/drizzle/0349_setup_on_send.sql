-- A new project keeps the template tapped on New project as what was tapped
-- (`tapped`); nothing of it is written until its setup page is sent. The
-- fleet's delegates are a fixed policy, not a stored choice: when it was
-- last set (`choices_set_at`) goes.
ALTER TABLE `projects` ADD `tapped` text;--> statement-breakpoint
ALTER TABLE `supervisor_config` DROP COLUMN `choices_set_at`;
