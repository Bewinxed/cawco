-- A plan step's wait is the step's alone (plans.ts `write`): a steps rewrite
-- names every `waitsOn`, and nothing is kept by a step's id, which is only
-- its place when the session gives none. A page the session asked the
-- person on is the plan's wait, not a step's (`page_waits`, plans.ts
-- `waitOn`): it stands until the page is answered or deleted, whatever the
-- steps become. The person's comments on a step whose words a write left out
-- are the plan's (`orphaned_comments`).
ALTER TABLE `session_plans` ADD `page_waits` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `session_plans` ADD `orphaned_comments` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- Each open step's page wait becomes its plan's; no step keeps one.
UPDATE `session_plans` SET
	`page_waits` = (
		SELECT json_group_array(DISTINCT json_extract(e.`value`, '$.waitsOnPage'))
		FROM json_each(`session_plans`.`steps`) AS e
		WHERE json_extract(e.`value`, '$.waitsOnPage') IS NOT NULL
			AND json_extract(e.`value`, '$.status') <> 'completed'
	),
	`steps` = (
		SELECT json_group_array(json(json_remove(e.`value`, '$.waitsOnPage')) ORDER BY e.`key`)
		FROM json_each(`session_plans`.`steps`) AS e
	)
WHERE EXISTS (
	SELECT 1 FROM json_each(`session_plans`.`steps`) AS e
	WHERE json_extract(e.`value`, '$.waitsOnPage') IS NOT NULL
);--> statement-breakpoint
-- A plan's pull request rows are the waits its steps name now: one no step
-- names any more goes.
DELETE FROM `task_links`
WHERE `task_id` LIKE 'plan:%' AND NOT EXISTS (
	SELECT 1 FROM `session_plans` AS p, json_each(p.`steps`) AS s
	WHERE 'plan:' || p.`instance_id` = `task_links`.`task_id`
		AND json_extract(s.`value`, '$.waitsOn') = `task_links`.`url`
);
