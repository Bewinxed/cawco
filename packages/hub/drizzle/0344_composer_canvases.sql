-- The person's own composer canvas is marked (`composer`), and an agent's
-- create never finds it by name: its name stands beside the agent's canvas
-- of the same name. Since 0267 every create but the composer's names an
-- ask, so a canvas the person draws on with no ask is a composer canvas.
DROP INDEX `artifacts_instance_name`;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `composer` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `artifacts` SET `composer` = 1 WHERE `kind` = 'canvas' AND `does` = 'draw' AND `ask` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_instance_name` ON `artifacts` (`instance_id`,`kind`,`name`,`composer`) WHERE "artifacts"."held_for" is null and ("artifacts"."project_id" is null or "artifacts"."kind" <> 'page');
