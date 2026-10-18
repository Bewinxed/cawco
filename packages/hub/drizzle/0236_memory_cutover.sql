-- The memory cutover's own records (hub session-prose.ts, memory.ts): each
-- project session whose stored transcript was cut into session_prose after
-- the fact, with how many messages it gave, so a backfill resumes where it
-- was; and each knowledge file's prose the person declined to have
-- rewritten as fact lines, by the hash of the words declined.
CREATE TABLE `declined_rewrites` (
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`words` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `path`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prose_backfills` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`messages` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
