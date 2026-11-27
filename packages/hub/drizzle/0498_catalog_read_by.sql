-- The agent build that read each account's catalog (hub accounts.ts
-- `readByOlder`): a machine on a newer build reads it again at once. Null for
-- every catalog read before, so each is read again on its machine's next read.
ALTER TABLE `account_catalogs` ADD `read_by_version` text;--> statement-breakpoint
ALTER TABLE `account_catalogs` ADD `read_by_commit` text;
