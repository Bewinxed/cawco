-- What an artifact shows is columns (S10), not a JSON tagged union a
-- query filtered with json_extract (artifacts `previewing`): exactly one
-- of source_page, source_dir or source_port, with the path, a sheet's stage
-- and a port's workspace beside it, the workspace a foreign key that sets
-- null. A workspace naming none the hub keeps is copied as none.
-- drizzle-kit 0.31.11 wrote the key without its ON DELETE.
ALTER TABLE `artifacts` ADD `source_page` text;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `source_dir` text;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `source_port` integer;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `source_path` text;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `source_workspace` text REFERENCES workspaces(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `source_stage_dir` text;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `source_stage_file` text;--> statement-breakpoint
UPDATE `artifacts` SET
  `source_page` = json_extract(`source`, '$.page'),
  `source_dir` = json_extract(`source`, '$.dir'),
  `source_port` = json_extract(`source`, '$.port'),
  `source_path` = json_extract(`source`, '$.path'),
  `source_workspace` = CASE WHEN json_extract(`source`, '$.workspace') IN (SELECT `id` FROM `workspaces`)
    THEN json_extract(`source`, '$.workspace') END,
  `source_stage_dir` = json_extract(`source`, '$.stage.dir'),
  `source_stage_file` = json_extract(`source`, '$.stage.file');--> statement-breakpoint
ALTER TABLE `artifacts` DROP COLUMN `source`;
