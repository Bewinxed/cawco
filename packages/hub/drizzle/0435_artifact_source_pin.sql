-- The pin a machine-served artifact is served to the person from
-- (`artifacts.source_pin`, core `PreviewSource.pin`): the copy its machine
-- cut as its author handed the version up. Every sheet, workspace preview
-- and folder preview made before it is named by its own id, whose copy its
-- machine cuts from its source at the first request that meets none.
ALTER TABLE `artifacts` ADD `source_pin` text;--> statement-breakpoint
UPDATE `artifacts` SET `source_pin` = `id` WHERE `source_stage_dir` IS NOT NULL OR `source_serve_command` IS NOT NULL OR `source_dir` IS NOT NULL;
