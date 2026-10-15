-- Every session another session started names its starter in
-- `parent_instance_id`, and every rail nests it there. `start_session` did not
-- record it until now, so the sessions it started stood at the top level as
-- if a person had started them. The hub's record of who started each one is
-- its first send: `start_session` opens a session with a peer turn from its
-- starter (`origin.fromSession`) under the hand-off marker. The marker's
-- other senders are a work item's brief (its row names a work item, and has
-- its parent already) and `handoff` (a note, never a turn). A continuation's
-- or a summariser's opening from the hub carries no marker, and a workflow's
-- supervisor's first send names itself. A starter known by a former id is
-- recorded as the session it is now (`instance_aliases`).
WITH `first_send` AS (
	SELECT
		`instance_id`,
		`body`,
		`mode`,
		ROW_NUMBER() OVER (
			PARTITION BY `instance_id`
			ORDER BY `accepted_at`, `rowid`
		) AS `n`
	FROM `sent_messages`
),
`started` AS (
	SELECT
		`first_send`.`instance_id` AS `id`,
		COALESCE(
			`instance_aliases`.`instance_id`,
			json_extract(`first_send`.`body`, '$.origin.fromSession')
		) AS `starter`
	FROM `first_send`
	LEFT JOIN `instance_aliases`
		ON `instance_aliases`.`id` = json_extract(`first_send`.`body`, '$.origin.fromSession')
	WHERE `first_send`.`n` = 1
		AND `first_send`.`mode` = 'turn'
		AND json_extract(`first_send`.`body`, '$.origin.kind') = 'peer'
		AND json_extract(`first_send`.`body`, '$.message.content') LIKE '[Hand-off from the %'
)
UPDATE `instances`
SET `parent_instance_id` = (
	SELECT `started`.`starter` FROM `started` WHERE `started`.`id` = `instances`.`id`
)
WHERE `parent_instance_id` IS NULL
	AND `work_item_id` IS NULL
	AND `workflow_step_id` IS NULL
	AND `id` IN (
		SELECT `started`.`id` FROM `started`
		WHERE `started`.`starter` IS NOT NULL AND `started`.`starter` <> `started`.`id`
	);--> statement-breakpoint
-- A session with a parent and no work item is one another session started,
-- not a delegate from before work items: the hub no longer refuses a send
-- for that (`predates-items` is gone). A send it refused keeps its failure
-- and its reason; the refusal kind no reader knows any more goes.
UPDATE `sent_messages`
SET `refusal` = NULL
WHERE json_extract(`refusal`, '$.kind') = 'predates-items';
