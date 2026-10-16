-- A task index row's lists are rows (audit R2): its edges (`after`,
-- `related`), labels and scalar fields, each keyed by its task's own index
-- key (project_id, path) and cascading from it, indexed for "who waits for
-- X", "tasks labelled X" and "tasks whose field K is V". Copied in each
-- list's order (rowid); a list naming a value twice keeps it once.
CREATE TABLE `project_task_edges` (
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`kind` text NOT NULL,
	`other_id` text NOT NULL,
	PRIMARY KEY(`project_id`, `path`, `kind`, `other_id`),
	FOREIGN KEY (`project_id`,`path`) REFERENCES `project_tasks`(`project_id`,`path`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_task_fields` (
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`project_id`, `path`, `key`),
	FOREIGN KEY (`project_id`,`path`) REFERENCES `project_tasks`(`project_id`,`path`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_task_labels` (
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`project_id`, `path`, `label`),
	FOREIGN KEY (`project_id`,`path`) REFERENCES `project_tasks`(`project_id`,`path`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `project_task_edges` (`project_id`, `path`, `kind`, `other_id`)
SELECT t.`project_id`, t.`path`, 'after', e.value FROM `project_tasks` t, json_each(t.`after`) e
GROUP BY t.`project_id`, t.`path`, e.value
ORDER BY t.`project_id`, t.`path`, min(e.key);
--> statement-breakpoint
INSERT INTO `project_task_edges` (`project_id`, `path`, `kind`, `other_id`)
SELECT t.`project_id`, t.`path`, 'related', e.value FROM `project_tasks` t, json_each(t.`related`) e
GROUP BY t.`project_id`, t.`path`, e.value
ORDER BY t.`project_id`, t.`path`, min(e.key);
--> statement-breakpoint
INSERT INTO `project_task_labels` (`project_id`, `path`, `label`)
SELECT t.`project_id`, t.`path`, l.value FROM `project_tasks` t, json_each(t.`labels`) l
GROUP BY t.`project_id`, t.`path`, l.value
ORDER BY t.`project_id`, t.`path`, min(l.key);
--> statement-breakpoint
INSERT INTO `project_task_fields` (`project_id`, `path`, `key`, `value`)
SELECT t.`project_id`, t.`path`, f.key, f.value FROM `project_tasks` t, json_each(t.`fields`) f;
--> statement-breakpoint
CREATE INDEX `project_task_edges_other` ON `project_task_edges` (`project_id`,`kind`,`other_id`);--> statement-breakpoint
CREATE INDEX `project_task_fields_value` ON `project_task_fields` (`project_id`,`key`,`value`);--> statement-breakpoint
CREATE INDEX `project_task_labels_label` ON `project_task_labels` (`project_id`,`label`);--> statement-breakpoint
ALTER TABLE `project_tasks` DROP COLUMN `after`;--> statement-breakpoint
ALTER TABLE `project_tasks` DROP COLUMN `related`;--> statement-breakpoint
ALTER TABLE `project_tasks` DROP COLUMN `labels`;--> statement-breakpoint
ALTER TABLE `project_tasks` DROP COLUMN `fields`;
