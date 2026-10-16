-- A lead turn's threads are rows (audit R14), each a foreign key to its
-- thread, not a JSON list and map of ids: the threads its turn under way
-- read, and its unread wakes by send uuid with the thread each woke (null
-- for none, which `""` said). A thread id naming no thread is not copied as
-- one: a read one is dropped, a wake keeps its place with no thread.
CREATE TABLE `lead_turn_reading` (
	`instance_id` text NOT NULL,
	`thread_id` text NOT NULL,
	PRIMARY KEY(`instance_id`, `thread_id`),
	FOREIGN KEY (`instance_id`) REFERENCES `lead_turns`(`instance_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `project_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lead_turn_waiting` (
	`instance_id` text NOT NULL,
	`send_uuid` text NOT NULL,
	`thread_id` text,
	PRIMARY KEY(`instance_id`, `send_uuid`),
	FOREIGN KEY (`instance_id`) REFERENCES `lead_turns`(`instance_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `project_threads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `lead_turn_reading` (`instance_id`, `thread_id`)
SELECT l.`instance_id`, r.value FROM `lead_turns` l, json_each(l.`reading`) r
WHERE r.value IN (SELECT `id` FROM `project_threads`)
GROUP BY l.`instance_id`, r.value
ORDER BY l.`instance_id`, min(r.key);
--> statement-breakpoint
INSERT INTO `lead_turn_waiting` (`instance_id`, `send_uuid`, `thread_id`)
SELECT l.`instance_id`, w.key,
  CASE WHEN w.value IN (SELECT `id` FROM `project_threads`) THEN w.value END
FROM `lead_turns` l, json_each(l.`waiting`) w;
--> statement-breakpoint
ALTER TABLE `lead_turns` DROP COLUMN `reading`;--> statement-breakpoint
ALTER TABLE `lead_turns` DROP COLUMN `waiting`;
