-- A plan step's wait is the step's alone (plans.ts `write`): a steps rewrite
-- names every wait, and a page wait or comment stays only with the step of
-- the same id and words. Before, a rewrite carried each wait to whatever new
-- step took the old one's id, and an id the session gives no step is its
-- place: session 12583348's plan, rewritten through the day, had three steps
-- waiting on pages and cards no write of them named. Its one wait it did
-- name, the card `linksdesign` on its last step naming it, stays; every
-- other wait of that plan goes.
UPDATE `session_plans` SET `steps` = (
	SELECT json_group_array(json(CASE
		WHEN e.`key` = (
			SELECT max(k.`key`) FROM json_each(`session_plans`.`steps`) AS k
			WHERE json_extract(k.`value`, '$.waitsOn') LIKE '%#linksdesign'
		) THEN json_remove(e.`value`, '$.waitsOnPage')
		ELSE json_remove(e.`value`, '$.waitsOn', '$.waitsOnPage')
	END) ORDER BY e.`key`)
	FROM json_each(`session_plans`.`steps`) AS e
)
WHERE `instance_id` LIKE '12583348%';
--> statement-breakpoint
-- A plan's pull request rows are the waits its steps name now: one no step
-- names any more goes.
DELETE FROM `task_links`
WHERE `task_id` LIKE 'plan:%' AND NOT EXISTS (
	SELECT 1 FROM `session_plans` AS p, json_each(p.`steps`) AS s
	WHERE 'plan:' || p.`instance_id` = `task_links`.`task_id`
		AND json_extract(s.`value`, '$.waitsOn') = `task_links`.`url`
);
