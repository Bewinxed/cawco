-- A session's plan (`session_plans.steps`, its steps as JSON, and
-- `session_plans.orphaned_comments`, the person's comments on words no step
-- has any more) is rows: `session_plan_steps`, one per step at its place,
-- and `session_plan_step_comments`, one per comment, on a step (`step_id`)
-- or orphaned (`orphan_step`, the words it was written on), ordered across
-- the plan by `ord`: each step's in its order, then the orphaned ones in
-- theirs. Each session's step in progress (db/find.ts `planSteps`) and each
-- step's wait (db/session-plans.ts `planWaits`) are found by the rows.
--
-- A plan that reads whole (its steps a list of core `PlanStep`, no two with
-- one id, its orphaned comments a list of core `OrphanedComments`, each as
-- the hub read it; a key nothing read is ignored, as it was) is placed as
-- it is: each step's id, place, words, depth, status, priority and wait,
-- each comment's time and words, in their order. Nothing is recomputed. A
-- plan whose steps were never written (a spec alone) held `[]`: no rows,
-- the empty list it read as. An orphaned group with no comments carries
-- nothing and makes no row.
--
-- A plan that is there and does not read whole (its steps or its orphaned
-- comments not JSON, not a list, or an entry not its shape, or two steps
-- with one id) places nothing, neither half: both values are kept as stored
-- in `steps_unread` and `orphaned_comments_unread`, and the plan says it
-- holds steps that do not read (core `SessionPlan.unread`): none of them is
-- listed, holds an ask, waits, or shows as in progress, and what the
-- session writes after is its own rows beside them, so they are never
-- written over. Today's reader threw on such a plan. The step before this
-- migration (db/migrate.ts `session-plans-unread`) logs each by its session
-- and why.
--
-- Every JSON function sits inside a CASE that proved its column JSON:
-- SQLite may run either side of an AND first.
CREATE TABLE `session_plan_step_comments` (
	`instance_id` text NOT NULL,
	`step_id` text,
	`orphan_step` text,
	`ord` integer NOT NULL,
	`at` text NOT NULL,
	`text` text NOT NULL,
	PRIMARY KEY(`instance_id`, `ord`),
	FOREIGN KEY (`instance_id`) REFERENCES `session_plans`(`instance_id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`instance_id`,`step_id`) REFERENCES `session_plan_steps`(`instance_id`,`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "session_plan_step_comments_one_place" CHECK(("step_id" is null) <> ("orphan_step" is null))
);
--> statement-breakpoint
CREATE TABLE `session_plan_steps` (
	`instance_id` text NOT NULL,
	`position` integer NOT NULL,
	`id` text NOT NULL,
	`content` text NOT NULL,
	`depth` integer NOT NULL,
	`status` text NOT NULL,
	`priority` text,
	`waits_on` text,
	PRIMARY KEY(`instance_id`, `position`),
	FOREIGN KEY (`instance_id`) REFERENCES `session_plans`(`instance_id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "session_plan_steps_status" CHECK("status" in ('pending', 'in_progress', 'completed')),
	CONSTRAINT "session_plan_steps_priority" CHECK("priority" is null or "priority" in ('high', 'medium', 'low'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_plan_steps_id` ON `session_plan_steps` (`instance_id`,`id`);--> statement-breakpoint
CREATE INDEX `session_plan_steps_in_progress` ON `session_plan_steps` (`instance_id`,`position`) WHERE "session_plan_steps"."status" = 'in_progress';--> statement-breakpoint
ALTER TABLE `session_plans` ADD `steps_unread` text;--> statement-breakpoint
ALTER TABLE `session_plans` ADD `orphaned_comments_unread` text;--> statement-breakpoint
UPDATE `session_plans` SET `steps_unread` = CASE WHEN `steps` IS NULL THEN NULL WHEN CASE WHEN CASE WHEN CASE WHEN json_valid(steps) THEN coalesce((json_type(steps, '$') IN ('array') AND CASE WHEN json_type(steps, '$') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(steps, '$') e0 WHERE NOT coalesce((json_type(steps, e0.fullkey) IN ('object') AND (json_type(steps, e0.fullkey || '.content') IN ('text')) AND (json_type(steps, e0.fullkey || '.depth') IN ('integer', 'real')) AND (json_type(steps, e0.fullkey || '.id') IN ('text')) AND (json_type(steps, e0.fullkey || '.status') IN ('text') AND (json_type(steps, e0.fullkey || '.status') = 'text' AND json_extract(steps, e0.fullkey || '.status') IN ('pending', 'in_progress', 'completed'))) AND (json_type(steps, e0.fullkey || '.comments') IS NULL OR (json_type(steps, e0.fullkey || '.comments') IN ('array') AND CASE WHEN json_type(steps, e0.fullkey || '.comments') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(steps, e0.fullkey || '.comments') e1 WHERE NOT coalesce((json_type(steps, e1.fullkey) IN ('object') AND (json_type(steps, e1.fullkey || '.at') IN ('text')) AND (json_type(steps, e1.fullkey || '.text') IN ('text'))), 0)) ELSE 0 END)) AND (json_type(steps, e0.fullkey || '.priority') IS NULL OR (json_type(steps, e0.fullkey || '.priority') IN ('text') AND (json_type(steps, e0.fullkey || '.priority') = 'text' AND json_extract(steps, e0.fullkey || '.priority') IN ('high', 'medium', 'low')))) AND (json_type(steps, e0.fullkey || '.waitsOn') IS NULL OR (json_type(steps, e0.fullkey || '.waitsOn') IN ('text')))), 0)) ELSE 0 END), 0) ELSE 0 END THEN NOT EXISTS (SELECT 1 FROM json_each(steps) a, json_each(steps) b WHERE a.key < b.key AND json_extract(steps, a.fullkey || '.id') = json_extract(steps, b.fullkey || '.id')) ELSE 0 END THEN CASE WHEN json_valid(orphaned_comments) THEN coalesce((json_type(orphaned_comments, '$') IN ('array') AND CASE WHEN json_type(orphaned_comments, '$') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(orphaned_comments, '$') e0 WHERE NOT coalesce((json_type(orphaned_comments, e0.fullkey) IN ('object') AND (json_type(orphaned_comments, e0.fullkey || '.comments') IN ('array') AND CASE WHEN json_type(orphaned_comments, e0.fullkey || '.comments') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(orphaned_comments, e0.fullkey || '.comments') e1 WHERE NOT coalesce((json_type(orphaned_comments, e1.fullkey) IN ('object') AND (json_type(orphaned_comments, e1.fullkey || '.at') IN ('text')) AND (json_type(orphaned_comments, e1.fullkey || '.text') IN ('text'))), 0)) ELSE 0 END) AND (json_type(orphaned_comments, e0.fullkey || '.step') IN ('text'))), 0)) ELSE 0 END), 0) ELSE 0 END ELSE 0 END THEN NULL ELSE CAST(`steps` AS TEXT) END, `orphaned_comments_unread` = CASE WHEN `orphaned_comments` IS NULL THEN NULL WHEN CASE WHEN CASE WHEN CASE WHEN json_valid(steps) THEN coalesce((json_type(steps, '$') IN ('array') AND CASE WHEN json_type(steps, '$') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(steps, '$') e0 WHERE NOT coalesce((json_type(steps, e0.fullkey) IN ('object') AND (json_type(steps, e0.fullkey || '.content') IN ('text')) AND (json_type(steps, e0.fullkey || '.depth') IN ('integer', 'real')) AND (json_type(steps, e0.fullkey || '.id') IN ('text')) AND (json_type(steps, e0.fullkey || '.status') IN ('text') AND (json_type(steps, e0.fullkey || '.status') = 'text' AND json_extract(steps, e0.fullkey || '.status') IN ('pending', 'in_progress', 'completed'))) AND (json_type(steps, e0.fullkey || '.comments') IS NULL OR (json_type(steps, e0.fullkey || '.comments') IN ('array') AND CASE WHEN json_type(steps, e0.fullkey || '.comments') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(steps, e0.fullkey || '.comments') e1 WHERE NOT coalesce((json_type(steps, e1.fullkey) IN ('object') AND (json_type(steps, e1.fullkey || '.at') IN ('text')) AND (json_type(steps, e1.fullkey || '.text') IN ('text'))), 0)) ELSE 0 END)) AND (json_type(steps, e0.fullkey || '.priority') IS NULL OR (json_type(steps, e0.fullkey || '.priority') IN ('text') AND (json_type(steps, e0.fullkey || '.priority') = 'text' AND json_extract(steps, e0.fullkey || '.priority') IN ('high', 'medium', 'low')))) AND (json_type(steps, e0.fullkey || '.waitsOn') IS NULL OR (json_type(steps, e0.fullkey || '.waitsOn') IN ('text')))), 0)) ELSE 0 END), 0) ELSE 0 END THEN NOT EXISTS (SELECT 1 FROM json_each(steps) a, json_each(steps) b WHERE a.key < b.key AND json_extract(steps, a.fullkey || '.id') = json_extract(steps, b.fullkey || '.id')) ELSE 0 END THEN CASE WHEN json_valid(orphaned_comments) THEN coalesce((json_type(orphaned_comments, '$') IN ('array') AND CASE WHEN json_type(orphaned_comments, '$') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(orphaned_comments, '$') e0 WHERE NOT coalesce((json_type(orphaned_comments, e0.fullkey) IN ('object') AND (json_type(orphaned_comments, e0.fullkey || '.comments') IN ('array') AND CASE WHEN json_type(orphaned_comments, e0.fullkey || '.comments') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(orphaned_comments, e0.fullkey || '.comments') e1 WHERE NOT coalesce((json_type(orphaned_comments, e1.fullkey) IN ('object') AND (json_type(orphaned_comments, e1.fullkey || '.at') IN ('text')) AND (json_type(orphaned_comments, e1.fullkey || '.text') IN ('text'))), 0)) ELSE 0 END) AND (json_type(orphaned_comments, e0.fullkey || '.step') IN ('text'))), 0)) ELSE 0 END), 0) ELSE 0 END ELSE 0 END THEN NULL ELSE CAST(`orphaned_comments` AS TEXT) END;--> statement-breakpoint
INSERT INTO `session_plan_steps` (`instance_id`, `position`, `id`, `content`, `depth`, `status`, `priority`, `waits_on`) SELECT p.`instance_id`, e.`key`, CASE WHEN json_valid(p.steps) THEN json_extract(p.steps, e.fullkey || '.id') END, CASE WHEN json_valid(p.steps) THEN json_extract(p.steps, e.fullkey || '.content') END, CASE WHEN json_valid(p.steps) THEN json_extract(p.steps, e.fullkey || '.depth') END, CASE WHEN json_valid(p.steps) THEN json_extract(p.steps, e.fullkey || '.status') END, CASE WHEN json_valid(p.steps) THEN json_extract(p.steps, e.fullkey || '.priority') END, CASE WHEN json_valid(p.steps) THEN json_extract(p.steps, e.fullkey || '.waitsOn') END FROM `session_plans` p, json_each(CASE WHEN p.steps_unread IS NULL THEN CASE WHEN json_valid(p.steps) THEN p.steps END END) e ORDER BY p.`instance_id`, e.`key`;--> statement-breakpoint
INSERT INTO `session_plan_step_comments` (`instance_id`, `step_id`, `orphan_step`, `ord`, `at`, `text`) SELECT `instance_id`, `step_id`, `orphan_step`, row_number() OVER (PARTITION BY `instance_id` ORDER BY `part`, `outer_key`, `inner_key`) - 1, `at`, `text` FROM (SELECT p.`instance_id` AS `instance_id`, CASE WHEN json_valid(p.steps) THEN json_extract(p.steps, e.fullkey || '.id') END AS `step_id`, NULL AS `orphan_step`, 0 AS `part`, e.`key` AS `outer_key`, c.`key` AS `inner_key`, CASE WHEN json_valid(p.steps) THEN json_extract(p.steps, c.fullkey || '.at') END AS `at`, CASE WHEN json_valid(p.steps) THEN json_extract(p.steps, c.fullkey || '.text') END AS `text` FROM `session_plans` p, json_each(CASE WHEN p.steps_unread IS NULL THEN CASE WHEN json_valid(p.steps) THEN p.steps END END) e, json_each(CASE WHEN p.steps_unread IS NULL THEN CASE WHEN json_valid(p.steps) THEN p.steps END END, e.fullkey || '.comments') c UNION ALL SELECT p.`instance_id`, NULL, CASE WHEN json_valid(p.orphaned_comments) THEN json_extract(p.orphaned_comments, o.fullkey || '.step') END, 1, o.`key`, c.`key`, CASE WHEN json_valid(p.orphaned_comments) THEN json_extract(p.orphaned_comments, c.fullkey || '.at') END, CASE WHEN json_valid(p.orphaned_comments) THEN json_extract(p.orphaned_comments, c.fullkey || '.text') END FROM `session_plans` p, json_each(CASE WHEN p.orphaned_comments_unread IS NULL THEN CASE WHEN json_valid(p.orphaned_comments) THEN p.orphaned_comments END END) o, json_each(CASE WHEN p.orphaned_comments_unread IS NULL THEN CASE WHEN json_valid(p.orphaned_comments) THEN p.orphaned_comments END END, o.fullkey || '.comments') c) ORDER BY `instance_id`, `part`, `outer_key`, `inner_key`;--> statement-breakpoint
ALTER TABLE `session_plans` DROP COLUMN `steps`;--> statement-breakpoint
ALTER TABLE `session_plans` DROP COLUMN `orphaned_comments`;