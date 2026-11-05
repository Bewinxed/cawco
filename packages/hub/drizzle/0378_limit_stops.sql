-- Sessions whose latest turn a usage limit ended (schema `limitStops`).
-- From now on the hub writes each at the turn's result. Before this, it
-- kept only what the at-limit controller did with such a turn: a hold, or
-- its line in the transcript (waiting, stopped, a move at the limit). Each
-- session's stop is taken from those where nothing ended a turn of it since;
-- a stop the controller left alone (a turn its own word started) kept
-- nothing, and is not here.
CREATE TABLE `limit_stops` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`at` integer NOT NULL
);--> statement-breakpoint
INSERT OR IGNORE INTO `limit_stops` (`instance_id`, `account_id`, `at`)
SELECT `h`.`instance_id`, `h`.`account_id`, `h`.`created_at`
FROM `limit_holds` `h`
JOIN `instances` `i` ON `i`.`id` = `h`.`instance_id`
WHERE `i`.`turn_ended_at` IS NULL OR `i`.`turn_ended_at` < `h`.`created_at`;--> statement-breakpoint
INSERT OR IGNORE INTO `limit_stops` (`instance_id`, `account_id`, `at`)
SELECT `e`.`instance_id`,
	CASE json_extract(`e`.`move`, '$.kind')
		WHEN 'moved' THEN json_extract(`e`.`move`, '$.from.id')
		ELSE json_extract(`e`.`move`, '$.account.id')
	END,
	`e`.`at`
FROM `limit_events` `e`
JOIN `instances` `i` ON `i`.`id` = `e`.`instance_id`
WHERE `e`.`at` = (SELECT max(`l`.`at`) FROM `limit_events` `l` WHERE `l`.`instance_id` = `e`.`instance_id`)
	AND (`i`.`turn_ended_at` IS NULL OR `i`.`turn_ended_at` < `e`.`at`)
	AND (
		json_extract(`e`.`move`, '$.kind') IN ('waiting', 'stopped')
		OR (
			json_extract(`e`.`move`, '$.kind') = 'moved'
			AND json_type(`e`.`move`, '$.asked') IS NULL
			AND json_type(`e`.`move`, '$.removed') IS NULL
			AND json_type(`e`.`move`, '$.signedOut') IS NULL
			AND json_type(`e`.`move`, '$.because') IS NULL
		)
	);
