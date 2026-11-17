-- A session's own words and records now go with its row (owned-rows.ts
-- `drop: "delete"`, db/core.ts `dropInstances`): the hub's notes that are
-- lines of its transcript, what it asked, its parked asks, its plan (its
-- steps and comments by their key), its design proposals, its project
-- offer and the turns it claimed. Before, a deleted session left them
-- standing under an id no row holds, read by nothing. Those already left
-- are deleted here. Both fixtures hold none.
--
-- Migrations run with foreign keys off (migrate.ts `migrateTo`), so no
-- cascade fires here: a plan's comments and steps, the only rows that name
-- any of these tables by a key, go first, by the same orphan condition read
-- through their plan.
DELETE FROM `project_notes` WHERE `instance_id` IS NOT NULL AND `instance_id` NOT IN (SELECT `id` FROM `instances`);--> statement-breakpoint
DELETE FROM `design_proposals` WHERE `instance_id` IS NOT NULL AND `instance_id` NOT IN (SELECT `id` FROM `instances`);--> statement-breakpoint
DELETE FROM `asks` WHERE `instance_id` IS NOT NULL AND `instance_id` NOT IN (SELECT `id` FROM `instances`);--> statement-breakpoint
DELETE FROM `completed_turns` WHERE `instance_id` IS NOT NULL AND `instance_id` NOT IN (SELECT `id` FROM `instances`);--> statement-breakpoint
DELETE FROM `session_plan_step_comments` WHERE `instance_id` IN (SELECT `instance_id` FROM `session_plans` WHERE `instance_id` IS NOT NULL AND `instance_id` NOT IN (SELECT `id` FROM `instances`));--> statement-breakpoint
DELETE FROM `session_plan_steps` WHERE `instance_id` IN (SELECT `instance_id` FROM `session_plans` WHERE `instance_id` IS NOT NULL AND `instance_id` NOT IN (SELECT `id` FROM `instances`));--> statement-breakpoint
DELETE FROM `session_plans` WHERE `instance_id` IS NOT NULL AND `instance_id` NOT IN (SELECT `id` FROM `instances`);--> statement-breakpoint
DELETE FROM `project_offers` WHERE `instance_id` IS NOT NULL AND `instance_id` NOT IN (SELECT `id` FROM `instances`);--> statement-breakpoint
DELETE FROM `parked_asks` WHERE `instance_id` IS NOT NULL AND `instance_id` NOT IN (SELECT `id` FROM `instances`);
