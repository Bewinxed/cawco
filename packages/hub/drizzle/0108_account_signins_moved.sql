-- CawCo's Claude accounts are only the ones added in Configure → Accounts,
-- each signed in in its own dir on each machine. A sign-in that was a
-- machine's own `~/.claude` login (home) is not one: it goes, so each such
-- account shows as needing a sign-in on that machine. The accounts, their
-- readings and their history stay. Limit history read from a `~/.claude`
-- before accounts waited for adoption onto the account that login was; there
-- is no adoption any more, so it goes too. A sign-in now says when it was a
-- machine's own login moved into the account's dir (moved_at).
-- (0107's snapshot predates 0107's own `launch_dir` change, which 0107's SQL
-- already applies; this migration's snapshot records the schema as it is.)
DELETE FROM `account_signins` WHERE `home` = 1;--> statement-breakpoint
DROP TABLE `machine_limit_history`;--> statement-breakpoint
ALTER TABLE `account_signins` ADD `moved_at` integer;--> statement-breakpoint
ALTER TABLE `account_signins` DROP COLUMN `home`;
