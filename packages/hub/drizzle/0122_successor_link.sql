ALTER TABLE `instances` ADD `continued_into` text;--> statement-breakpoint
-- Each session already continued at its account's limit names the session that
-- took its place: one with a "Continued on" line whose first message (its
-- opening) came from it within a moment of that line, when it says it was
-- continued (its own line then, or its end reason). One continued more than once,
-- woken again after the first, names the first: that one took its work item.
UPDATE `instances` SET `continued_into` = (
	SELECT `t`.`target` FROM (
		SELECT `l`.`instance_id` AS `target`, `l`.`at` AS `at`,
			json_extract(`s`.`body`, '$.origin.fromSession') AS `source`
		FROM (
			SELECT `instance_id`, min(`at`) AS `at` FROM `limit_events`
			WHERE json_extract(`move`, '$.kind') = 'continued' GROUP BY `instance_id`
		) `l`
		JOIN `sent_messages` `s` ON `s`.`instance_id` = `l`.`instance_id`
			AND `s`.`accepted_at` = (SELECT min(`accepted_at`) FROM `sent_messages` WHERE `instance_id` = `l`.`instance_id`)
		WHERE json_extract(`s`.`body`, '$.origin.kind') = 'peer'
			AND abs(`s`.`accepted_at` - `l`.`at`) <= 5000
	) `t`
	JOIN `instances` `src` ON `src`.`id` = `t`.`source`
	WHERE `t`.`source` = `instances`.`id` AND `t`.`target` <> `instances`.`id`
		AND (`src`.`end_reason` LIKE 'continued on %' OR EXISTS (
			SELECT 1 FROM `limit_events` `e` WHERE `e`.`instance_id` = `t`.`source`
				AND json_extract(`e`.`move`, '$.kind') = 'continued' AND abs(`e`.`at` - `t`.`at`) <= 5000))
	ORDER BY `t`.`at` LIMIT 1
);
