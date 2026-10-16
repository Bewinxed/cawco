-- The lines the hub writes into a session's transcript are rows (audit
-- R4b), one table for the three kinds it kept as JSON on the session's
-- row: its limit lines and fleet-watch lines (appended and capped by
-- read-modify-write) and its one move line. Copied in each list's order
-- (rowid); a line kept twice under one id is kept once.
CREATE TABLE `session_lines` (
	`instance_id` text NOT NULL,
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`at` integer NOT NULL,
	`content` text NOT NULL,
	`stayed` text,
	PRIMARY KEY(`instance_id`, `kind`, `id`),
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `session_lines` (`instance_id`, `kind`, `id`, `at`, `content`)
SELECT i.`id`, 'limit', json_extract(n.value, '$.id'), json_extract(n.value, '$.at'), json_extract(n.value, '$.content')
FROM `instances` i, json_each(i.`limit_notes`) n
GROUP BY i.`id`, json_extract(n.value, '$.id')
ORDER BY i.`id`, min(n.key);
--> statement-breakpoint
INSERT INTO `session_lines` (`instance_id`, `kind`, `id`, `at`, `content`)
SELECT i.`id`, 'watch', json_extract(w.value, '$.id'), json_extract(w.value, '$.at'), json_extract(w.value, '$.content')
FROM `instances` i, json_each(i.`watch_lines`) w
GROUP BY i.`id`, json_extract(w.value, '$.id')
ORDER BY i.`id`, min(w.key);
--> statement-breakpoint
INSERT INTO `session_lines` (`instance_id`, `kind`, `id`, `at`, `content`, `stayed`)
SELECT `id`, 'moved', 'moved', json_extract(`moved_here`, '$.at'), json_extract(`moved_here`, '$.moved'), json_extract(`moved_here`, '$.stayed')
FROM `instances` WHERE `moved_here` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `moved_here`;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `limit_notes`;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `watch_lines`;
