-- A machine's own Antigravity sign-in is gone (tsk-340): Antigravity signs in
-- per account, in the account's agy home, so no tool on a machine has a
-- sign-in of its own to keep.
ALTER TABLE `agent_tools` DROP COLUMN `signin_state`;--> statement-breakpoint
ALTER TABLE `agent_tools` DROP COLUMN `signin_at`;--> statement-breakpoint
ALTER TABLE `agent_tools` DROP COLUMN `signin_detail`;--> statement-breakpoint
ALTER TABLE `agent_tools` DROP COLUMN `signin_unread`;
