-- A rule's scope is columns (audit S9), not a JSON bag: its project is a
-- foreign key, so a project merge re-points it (db `foldProject`) and a
-- deleted project takes it along rather than widening it to every project.
-- drizzle-kit 0.31.11 wrote the key without its ON DELETE.
ALTER TABLE `rules` ADD `scope_machine_id` text;--> statement-breakpoint
ALTER TABLE `rules` ADD `scope_project_id` text REFERENCES projects(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `rules` ADD `scope_harness` text;--> statement-breakpoint
ALTER TABLE `rules` ADD `scope_model` text;--> statement-breakpoint
UPDATE `rules` SET
  `scope_machine_id` = nullif(json_extract(`scope`, '$.machineId'), ''),
  `scope_project_id` = nullif(json_extract(`scope`, '$.projectId'), ''),
  `scope_harness` = nullif(json_extract(`scope`, '$.harness'), ''),
  `scope_model` = nullif(json_extract(`scope`, '$.model'), '');--> statement-breakpoint
-- A rule scoped to a project that is gone matched no session; it goes as
-- the key would have taken it, with where it stood with each session.
DELETE FROM `rule_state` WHERE `rule_id` IN (
  SELECT `id` FROM `rules`
  WHERE `scope_project_id` IS NOT NULL AND `scope_project_id` NOT IN (SELECT `id` FROM `projects`)
);--> statement-breakpoint
DELETE FROM `rules`
WHERE `scope_project_id` IS NOT NULL AND `scope_project_id` NOT IN (SELECT `id` FROM `projects`);--> statement-breakpoint
ALTER TABLE `rules` DROP COLUMN `scope`;
