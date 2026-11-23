-- A project's switch letting its sessions propose a Who decides change for
-- the person to approve (project-settings.ts `set_decides`), off until they
-- turn it on; and on a GitHub binding, the stages the hub has made sure of a
-- Status option for (tracker.ts), null on every binding until its next sync
-- adds the options it lacks, and GitHub's words when it refused adding them.
ALTER TABLE `projects` ADD `caw_proposes_decides` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tracker_bindings` ADD `github_status_stages` text;--> statement-breakpoint
ALTER TABLE `tracker_bindings` ADD `github_statuses_refused` text;