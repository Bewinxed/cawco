-- A pull request a task waits on is one of its links (tsk-128 slice 3): a
-- wait on it reads the PR's `task_links` row (external-items.ts `prWait`),
-- the one state the hub keeps of a pull request, where the GitHub poll kept
-- its own before. The index makes the row from the file's `waits_on:`
-- (tasks.ts `fileLinksOf`) when a task file is next read; a file unchanged
-- since is not read again, so each pull request an indexed task waits on gets
-- its row here, as the index would make it: from the URL alone, `related`,
-- read from GitHub on the project's next poll.
INSERT OR IGNORE INTO `task_links` (`project_id`, `task_id`, `url`, `source`, `kind`, `number`, `ref`, `mode`)
SELECT e.`project_id`, t.`id`, e.`other_id`, 'github', 'pr', e.`number`, '#' || e.`number`, 'related'
FROM (
	SELECT `project_id`, `path`, `other_id`,
		CAST(substr(`other_id`, instr(`other_id`, '/pull/') + 6) AS INTEGER) AS `number`
	FROM `project_task_edges`
	WHERE `kind` = 'waits_on' AND `other_id` LIKE 'https://github.com/%/pull/%'
) AS e
JOIN `project_tasks` AS t ON t.`project_id` = e.`project_id` AND t.`path` = e.`path`
WHERE e.`number` > 0 AND NOT EXISTS (
	SELECT 1 FROM `task_links` AS l
	WHERE l.`project_id` = e.`project_id` AND l.`task_id` = t.`id` AND lower(l.`url`) = lower(e.`other_id`)
);
