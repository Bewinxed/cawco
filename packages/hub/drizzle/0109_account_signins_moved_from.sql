-- A sign-in moved in from one of the machine's own stores says which:
-- `~/.claude` (claude), pi's own auth.json (pi), OpenCode's own (opencode).
-- Every move before this was a machine's `~/.claude` login.
ALTER TABLE `account_signins` ADD `moved_from` text;--> statement-breakpoint
UPDATE `account_signins` SET `moved_from` = 'claude' WHERE `moved_at` IS NOT NULL;
