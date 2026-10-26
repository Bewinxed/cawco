-- Task links are one blocking edge (tasks.ts, task-waits.ts): `after`
-- becomes `waits_on`, `parent` becomes `part_of`, and `related` goes (each
-- task's related ones become a "See also" comment in its file, which the hub
-- writes as it starts: tasks.ts `migrateLinks`). The index follows its files,
-- and every row is read again from them once they are rewritten.
ALTER TABLE `project_tasks` RENAME COLUMN "parent" TO "part_of";--> statement-breakpoint
UPDATE `project_task_edges` SET `kind` = 'waits_on' WHERE `kind` = 'after';--> statement-breakpoint
DELETE FROM `project_task_edges` WHERE `kind` = 'related';--> statement-breakpoint
UPDATE `project_tasks` SET `hash` = '';--> statement-breakpoint
ALTER TABLE `work_items` ADD `waited_on` text;
