-- A project's memory (hub memory.ts, session-prose.ts): when a brief last carried
-- each fact line, by its file and the hash of its words; the prose cut of the
-- project's sessions, the person's words and the agent's own text, for
-- memory_recall; each project session whose stored transcript was cut into
-- session_prose after the fact, with how many messages it gave, so a backfill
-- resumes where it was; and each knowledge file's prose the person declined to
-- have rewritten as fact lines, by the hash of the words declined. All kept on
-- the hub, never in the project's folder.
CREATE TABLE `declined_rewrites` (
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`words` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `path`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fact_uses` (
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`key` text NOT NULL,
	`used_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `path`, `key`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prose_backfills` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`messages` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_prose` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`instance_id` text NOT NULL,
	`at` integer NOT NULL,
	`who` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_prose_project_at` ON `session_prose` (`project_id`,`at`);