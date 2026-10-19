DROP INDEX `accounts_identity`;--> statement-breakpoint
ALTER TABLE `accounts` ADD `org_id` text;--> statement-breakpoint
CREATE INDEX `accounts_identity` ON `accounts` (`provider`,lower("email"),`org_id`);--> statement-breakpoint
ALTER TABLE `login_moves` ADD `org_id` text;--> statement-breakpoint
-- Every provider but Claude (`anthropic`) names its organization by an id already (a key's
-- fingerprint, a GitHub host, a ChatGPT account id): that is its org id. A
-- Claude account's id is read from its own login (hub accounts.ts
-- `withOrgIdFrom`); its name is never taken for one.
UPDATE `accounts` SET `org_id` = `organization` WHERE `provider` <> 'anthropic' AND `organization` IS NOT NULL;--> statement-breakpoint
UPDATE `login_moves` SET `org_id` = `organization` WHERE `provider` <> 'anthropic';
