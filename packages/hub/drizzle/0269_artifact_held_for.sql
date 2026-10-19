-- A maker's change to an artifact standing in its parent's panel, held as
-- the artifact's next version until the parent's artifact_show merges it in
-- (artifacts service.ts `holdNext`). A held row shares its artifact's name,
-- so the name stays unique among the rows no list skips. Written by hand in
-- drizzle-kit 0.31.11's form (its generate no longer loads the schema in a
-- workspace).
ALTER TABLE `artifacts` ADD `held_for` text REFERENCES artifacts(id) ON UPDATE no action ON DELETE cascade;--> statement-breakpoint
DROP INDEX `artifacts_instance_name`;--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_instance_name` ON `artifacts` (`instance_id`,`kind`,`name`) WHERE "artifacts"."held_for" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_held_for` ON `artifacts` (`held_for`);
