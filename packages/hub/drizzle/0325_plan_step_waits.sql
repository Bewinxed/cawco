-- A plan step's wait is one string, `waitsOn`, as a task's `waits_on` keeps
-- it (core wait-targets.ts), beside the hub's whole-page `waitsOnPage`. Two
-- older shapes are still stored in `session_plans.steps`, and 0324 left them:
--   * `waitsOn` as an object, `{artifactId, card?}`, from before task links:
--     a card becomes `<artifact id>#<card>`, a page whole `waitsOnPage`;
--   * `wait` as a string, from the first cut of task links: it is `waitsOn`.
-- Read as `waitsOn`, the object reached `waitTarget`'s `.trim()` and threw on
-- every read of what waits on the person, every artifact create and every
-- send to a session with such a step.
UPDATE `session_plans` SET `steps` = (
	SELECT json_group_array(json(`step`)) FROM (
		SELECT CASE
			WHEN json_type(s.value, '$.wait') = 'text'
				THEN json_remove(json_set(s.value, '$.waitsOn', json_extract(s.value, '$.wait')), '$.wait')
			WHEN json_type(s.value, '$.waitsOn') = 'object' AND json_type(s.value, '$.waitsOn.card') = 'text'
				THEN json_set(s.value, '$.waitsOn', json_extract(s.value, '$.waitsOn.artifactId') || '#' || json_extract(s.value, '$.waitsOn.card'))
			WHEN json_type(s.value, '$.waitsOn') = 'object' AND json_type(s.value, '$.waitsOn.artifactId') = 'text'
				THEN json_set(json_remove(s.value, '$.waitsOn'), '$.waitsOnPage', coalesce(json_extract(s.value, '$.waitsOnPage'), json_extract(s.value, '$.waitsOn.artifactId')))
			WHEN json_type(s.value, '$.waitsOn') <> 'text'
				THEN json_remove(s.value, '$.waitsOn', '$.wait')
			ELSE json_remove(s.value, '$.wait')
		END AS `step`
		FROM json_each(`session_plans`.`steps`) AS s
		ORDER BY s.key
	)
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`session_plans`.`steps`) AS s
	WHERE json_type(s.value, '$.wait') IS NOT NULL OR json_type(s.value, '$.waitsOn') <> 'text'
);
