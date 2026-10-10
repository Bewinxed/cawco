CREATE TABLE `instance_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`folded` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE `instances` ADD `conversations` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
-- A session continued at its account's limit goes on as itself from here, in
-- a fresh conversation. A hub before started a second session for each such
-- continuation, and those chains are folded into one session now, under the
-- id of the one at the end of the chain: the one that runs. Every session in
-- a chain but that one is recorded here as a former id of it; the hub folds
-- each former row into it at its next start (db `foldFormerSessions`).
--
-- A chain's links: each source's first successor (`continued_into`, 0122 and
-- the hub since), and every other session whose opening came from a source
-- within a moment of its "Continued on" line, when the source says it was
-- continued (0122's rule, every successor rather than the first): a source
-- continued twice had two.
WITH RECURSIVE
	`succession` (`source`, `target`) AS (
		SELECT `id`, `continued_into` FROM `instances` WHERE `continued_into` IS NOT NULL
		UNION
		SELECT `t`.`source`, `t`.`target` FROM (
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
		WHERE `t`.`target` <> `t`.`source`
			AND (`src`.`end_reason` LIKE 'continued on %' OR EXISTS (
				SELECT 1 FROM `limit_events` `e` WHERE `e`.`instance_id` = `t`.`source`
					AND json_extract(`e`.`move`, '$.kind') = 'continued' AND abs(`e`.`at` - `t`.`at`) <= 5000))
	),
	-- Each session of a chain, with the session the chain started from.
	`member` (`node`, `root`) AS (
		SELECT `source`, `source` FROM `succession`
		WHERE `source` NOT IN (SELECT `target` FROM `succession`)
		UNION
		SELECT `s`.`target`, `m`.`root` FROM `succession` `s` JOIN `member` `m` ON `s`.`source` = `m`.`node`
	),
	-- From the start, first successor after first successor: its last is the one that runs.
	`line` (`root`, `node`, `depth`) AS (
		SELECT DISTINCT `root`, `root`, 0 FROM `member`
		UNION ALL
		SELECT `l`.`root`, `i`.`continued_into`, `l`.`depth` + 1 FROM `line` `l`
		JOIN `instances` `i` ON `i`.`id` = `l`.`node`
		WHERE `i`.`continued_into` IS NOT NULL AND `l`.`depth` < 64
	),
	`survivor` (`root`, `id`) AS (
		SELECT `l`.`root`, `l`.`node` FROM `line` `l`
		WHERE `l`.`depth` = (SELECT max(`depth`) FROM `line` WHERE `root` = `l`.`root`)
	)
INSERT OR IGNORE INTO `instance_aliases` (`id`, `instance_id`)
SELECT DISTINCT `m`.`node`, `v`.`id` FROM `member` `m`
JOIN `survivor` `v` ON `v`.`root` = `m`.`root`
WHERE `m`.`node` <> `v`.`id` AND `v`.`id` IN (SELECT `id` FROM `instances`);
--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `continued_into`;
