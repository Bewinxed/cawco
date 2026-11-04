-- How far the refusal that signed an account out reaches (core
-- `RefusalReach`): `account` comes back on every machine once the hub's check
-- of it is answered; `machine` on a sign-in. And when that check last ran, so
-- a hub restart keeps its hourly clock.
ALTER TABLE `account_signins` ADD `refusal_reach` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `refusal_checked_at` integer;--> statement-breakpoint
-- The sign-outs the hub made before the reach was kept, from the words
-- Claude Code gives `oauth_org_not_allowed` (2.1.308 and 2.1.311), are
-- account-wide; every other reason is a machine's credential.
UPDATE `account_signins` SET `refusal_reach` = CASE
  WHEN `reason` LIKE 'Your organization has disabled Claude subscription access for Claude Code%'
    OR `reason` LIKE 'Claude Code can''t use your Claude subscription%'
  THEN 'account' ELSE 'machine' END
WHERE `reason` IS NOT NULL;
