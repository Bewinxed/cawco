-- Git LFS offered for the files over 50 MiB a place's first commit left out
-- (hub lfs-offers.ts), one row per offer; the LFS endpoints a repository's
-- .lfsconfig named that a project's thread was told git-lfs refused, once
-- per project and endpoint; and a project's Large files setting: the LFS
-- endpoint every git-lfs run on a machine for it is held to, and the fleet
-- connection that signs in there (agent host-lfs.ts). Before it, a
-- repository's committed .lfsconfig could send a host push's large files to
-- another repository with the owner's credential.
CREATE TABLE `lfs_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`root` text NOT NULL,
	`thread_id` text NOT NULL,
	`rows` text NOT NULL,
	`offered_at` integer NOT NULL,
	`answer` text,
	`answered_at` integer,
	`commit` text
);
--> statement-breakpoint
CREATE TABLE `lfs_refusals` (
	`project_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`noted_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `endpoint`)
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `lfs_url` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `lfs_connection` text;