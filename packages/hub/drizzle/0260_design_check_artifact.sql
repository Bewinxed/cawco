-- A design check asked of an artifact in a chat (component canvas E1): the
-- artifact it judges and the session that asked, which hears the verdict.
-- A task's round leaves both null.
ALTER TABLE `design_checks` ADD `artifact_id` text;--> statement-breakpoint
ALTER TABLE `design_checks` ADD `requester_id` text;
