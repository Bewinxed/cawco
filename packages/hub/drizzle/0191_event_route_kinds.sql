-- The kinds an event route takes are rows (audit R11), not a JSON list:
-- routing reads a project's routes for one kind with an indexed query. A
-- route with no rows takes any kind, as `[]` did. A kind listed twice is
-- kept once.
CREATE TABLE `event_route_kinds` (
	`route_id` text NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`route_id`, `kind`),
	FOREIGN KEY (`route_id`) REFERENCES `event_routes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `event_route_kinds` (`route_id`, `kind`)
SELECT r.`id`, k.value FROM `event_routes` r, json_each(r.`kinds`) k
GROUP BY r.`id`, k.value
ORDER BY r.`id`, min(k.key);
--> statement-breakpoint
ALTER TABLE `event_routes` DROP COLUMN `kinds`;
