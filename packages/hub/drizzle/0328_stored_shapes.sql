-- Every stored JSON row reads as its column's schema (core stored-json.ts);
-- the stored-shape check over the owner's hub found three older shapes.
--
-- A skill's or plugin's file before files kept their execute bit has no
-- `executable`: every reader takes it as false (agent tree-swap.ts writes
-- 0755 only when it is true; core file-hash.ts hashes `-`), so false it is.
UPDATE `skills` SET `files` = (
	SELECT json_group_array(json(`file`)) FROM (
		SELECT CASE
			WHEN json_type(f.value, '$.executable') IS NULL
				THEN json_set(f.value, '$.executable', json('false'))
			ELSE f.value
		END AS `file`
		FROM json_each(`skills`.`files`) AS f
		ORDER BY f.key
	)
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`skills`.`files`) AS f
	WHERE json_type(f.value, '$.executable') IS NULL
);--> statement-breakpoint
UPDATE `fleet_skill_history` SET `files` = (
	SELECT json_group_array(json(`file`)) FROM (
		SELECT CASE
			WHEN json_type(f.value, '$.executable') IS NULL
				THEN json_set(f.value, '$.executable', json('false'))
			ELSE f.value
		END AS `file`
		FROM json_each(`fleet_skill_history`.`files`) AS f
		ORDER BY f.key
	)
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`fleet_skill_history`.`files`) AS f
	WHERE json_type(f.value, '$.executable') IS NULL
);--> statement-breakpoint
UPDATE `plugins` SET `files` = (
	SELECT json_group_array(json(`file`)) FROM (
		SELECT CASE
			WHEN json_type(f.value, '$.executable') IS NULL
				THEN json_set(f.value, '$.executable', json('false'))
			ELSE f.value
		END AS `file`
		FROM json_each(`plugins`.`files`) AS f
		ORDER BY f.key
	)
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`plugins`.`files`) AS f
	WHERE json_type(f.value, '$.executable') IS NULL
);--> statement-breakpoint
-- A send kept before its body carried its kind: a user message, all a send is.
UPDATE `sent_messages` SET `body` = json_set(`body`, '$.type', 'user')
WHERE json_type(`body`, '$.type') IS NULL;--> statement-breakpoint
-- A `not-woken` thread note (deleted with Caw's threads becoming sends,
-- 10b106808): the person's words that did not wake Caw. A wake that does not
-- go out now fails the send itself with the hub's sentence, so a send Caw
-- has not answered since the note fails with the note's words; one he
-- answered after was read. The note goes either way. (A hub whose thread
-- words are not sends yet takes them at its next start, read, as
-- `migrateThreadWordsOnce` moves every word.)
UPDATE `sent_messages` SET
	`state` = 'failed',
	`reason` = (
		SELECT json_extract(n.`event`, '$.notWoken.words') FROM `thread_messages` AS n
		WHERE json_extract(n.`event`, '$.what') = 'not-woken'
			AND json_extract(n.`event`, '$.notWoken.message') = `sent_messages`.`uuid`
		ORDER BY n.`created_at` DESC LIMIT 1
	),
	`read_at` = NULL
WHERE `uuid` IN (
	SELECT json_extract(n.`event`, '$.notWoken.message') FROM `thread_messages` AS n
	WHERE json_extract(n.`event`, '$.what') = 'not-woken'
		AND NOT EXISTS (
			SELECT 1 FROM `thread_messages` AS r
			WHERE r.`thread_id` = n.`thread_id`
				AND r.`author` = 'caw'
				AND r.`created_at` > n.`created_at`
		)
);--> statement-breakpoint
DELETE FROM `thread_messages` WHERE json_extract(`event`, '$.what') = 'not-woken';--> statement-breakpoint
-- An account's at-limit rules from before a hold went stale on its own
-- (903dc22e9) have no `staleAfterHours`: the default, a day, as a new
-- provider's rules start with (core `DEFAULT_AT_LIMIT`).
UPDATE `account_routing` SET `at_limit` = json_set(`at_limit`, '$.staleAfterHours', 24)
WHERE json_type(`at_limit`, '$.staleAfterHours') IS NULL;
