-- A workflow run's state is columns and rows (audit R1), not one JSON bag
-- every writer spread and rewrote whole:
--   __ending {status, failure, result} -> ending_status, ending_failure,
--     ending_result; its pending sessions -> workflow_run_pending_ends (its
--     children are the run's live children, read when wanted);
--   __rerun {runId, before} -> rerun_from_run_id, rerun_before;
--   __notes -> workflow_run_notes;
--   __heldStops {stepId: …} -> workflow_held_stops;
--   schemas and slots -> workflow_run_slots, one row per declared name.
-- A program's values (a slot's value, its schema, an ending's result) stay
-- JSON, opaque; `->` copies each as JSON text. An id naming no instance or
-- step is not copied as one; a re-run naming no run keeps none.
-- drizzle-kit 0.31.11 wrote rerun_from_run_id's key without its ON DELETE.
CREATE TABLE `workflow_held_stops` (
	`step_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`deadline` integer NOT NULL,
	`failure` text NOT NULL,
	`action` text,
	`error` text,
	FOREIGN KEY (`step_id`) REFERENCES `workflow_steps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workflow_run_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`text` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflow_run_notes_run` ON `workflow_run_notes` (`run_id`,`id`);--> statement-breakpoint
CREATE TABLE `workflow_run_pending_ends` (
	`run_id` text NOT NULL,
	`instance_id` text NOT NULL,
	PRIMARY KEY(`run_id`, `instance_id`),
	FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workflow_run_slots` (
	`run_id` text NOT NULL,
	`name` text NOT NULL,
	`schema` text,
	`value` text,
	PRIMARY KEY(`run_id`, `name`),
	FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD `ending_status` text;--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD `ending_failure` text;--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD `ending_result` text;--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD `rerun_from_run_id` text REFERENCES workflow_runs(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD `rerun_before` integer;--> statement-breakpoint
UPDATE `workflow_runs` SET
  `ending_status` = json_extract(`state`, '$.__ending.status'),
  `ending_failure` = json_extract(`state`, '$.__ending.failure'),
  `ending_result` = `state` -> '$.__ending.result',
  `rerun_from_run_id` = CASE WHEN json_extract(`state`, '$.__rerun.runId') IN (SELECT `id` FROM `workflow_runs`)
    THEN json_extract(`state`, '$.__rerun.runId') END,
  `rerun_before` = json_extract(`state`, '$.__rerun.before');--> statement-breakpoint
INSERT INTO `workflow_run_pending_ends` (`run_id`, `instance_id`)
SELECT r.`id`, p.value FROM `workflow_runs` r, json_each(r.`state`, '$.__ending.pending') p
WHERE p.value IN (SELECT `id` FROM `instances`)
GROUP BY r.`id`, p.value
ORDER BY r.`id`, min(p.key);
--> statement-breakpoint
INSERT INTO `workflow_run_notes` (`run_id`, `text`, `at`)
SELECT r.`id`, n.value, r.`started_at` FROM `workflow_runs` r, json_each(r.`state`, '$.__notes') n
ORDER BY r.`id`, n.key;
--> statement-breakpoint
INSERT INTO `workflow_held_stops` (`step_id`, `run_id`, `deadline`, `failure`, `action`, `error`)
SELECT h.key, r.`id`, json_extract(h.value, '$.deadline'), json_extract(h.value, '$.failure'),
  json_extract(h.value, '$.action'), json_extract(h.value, '$.error')
FROM `workflow_runs` r, json_each(r.`state`, '$.__heldStops') h
WHERE h.key IN (SELECT `id` FROM `workflow_steps`);
--> statement-breakpoint
INSERT INTO `workflow_run_slots` (`run_id`, `name`, `schema`, `value`)
SELECT k.`run_id`, k.`name`,
  r.`state` -> ('$.schemas.' || json_quote(k.`name`)),
  r.`state` -> ('$.slots.' || json_quote(k.`name`))
FROM (
  SELECT r1.`id` AS `run_id`, s.key AS `name` FROM `workflow_runs` r1, json_each(r1.`state`, '$.schemas') s
  UNION
  SELECT r2.`id`, v.key FROM `workflow_runs` r2, json_each(r2.`state`, '$.slots') v
) k JOIN `workflow_runs` r ON r.`id` = k.`run_id`;
--> statement-breakpoint
ALTER TABLE `workflow_runs` DROP COLUMN `state`;
