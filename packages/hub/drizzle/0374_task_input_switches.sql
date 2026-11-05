-- Two switches on a project, each one behaviour of the person's writing on
-- its tasks, both on as the hub updates: whether its conversation reads what
-- they write on a task (task-input.ts), and whether their comment reaches the
-- task's attempt (jev-tasks.ts), which it always did before.
ALTER TABLE `projects` ADD `hears_tasks` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `attempts_hear_comments` integer DEFAULT true NOT NULL;
