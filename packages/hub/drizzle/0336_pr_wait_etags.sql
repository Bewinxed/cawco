-- Pull request waits, the second pass (tsk-128 slice 3).
-- `etag`: a pull request's ETag from its last read. Every open pull request
-- a task or plan step links is read again each poll, asked with it, so a
-- draft marked ready shows within a poll, and an unchanged one is GitHub's
-- 304, which "does not count against your primary rate limit"
-- (docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).
ALTER TABLE `task_links` ADD `etag` text;--> statement-breakpoint
-- A plan step's wait on a pull request is a row of its session's plan,
-- `plan:<session id>`, kept with the steps whenever they are written (db
-- `putSessionSteps`). Steps written before this get theirs here, as that
-- write would make them: from the URL alone, `related`, read from GitHub on
-- the project's next poll.
INSERT OR IGNORE INTO `task_links` (`project_id`, `task_id`, `url`, `source`, `kind`, `number`, `ref`, `mode`)
SELECT w.`project_id`, 'plan:' || w.`instance_id`, w.`url`, 'github', 'pr', w.`number`, '#' || w.`number`, 'related'
FROM (
	SELECT i.`project_id`, p.`instance_id`, json_extract(s.value, '$.waitsOn') AS `url`,
		CAST(substr(json_extract(s.value, '$.waitsOn'), instr(json_extract(s.value, '$.waitsOn'), '/pull/') + 6) AS INTEGER) AS `number`
	FROM `session_plans` AS p
	JOIN `instances` AS i ON i.`id` = p.`instance_id`
	JOIN json_each(p.`steps`) AS s
	WHERE i.`project_id` IS NOT NULL
		AND json_type(s.value, '$.waitsOn') = 'text'
		AND json_extract(s.value, '$.waitsOn') LIKE 'https://github.com/%/pull/%'
) AS w
WHERE w.`number` > 0;
