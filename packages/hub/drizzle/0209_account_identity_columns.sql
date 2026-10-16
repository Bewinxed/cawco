-- An account's identity is columns (audit S3), not a JSON bag: finding the
-- account a sign-in is (core `sameIdentity`: the email in any case, the same
-- organization) is one lookup on accounts_identity instead of a scan of
-- every account. A login move's identity is its two columns too.
-- login_moves is rebuilt by hand: drizzle-kit 0.31.11 added its NOT NULL
-- columns with no default, which a table with rows refuses.
ALTER TABLE `accounts` ADD `email` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `organization` text;--> statement-breakpoint
UPDATE `accounts` SET
  `email` = json_extract(`identity`, '$.email'),
  `organization` = json_extract(`identity`, '$.organization');--> statement-breakpoint
ALTER TABLE `accounts` DROP COLUMN `identity`;--> statement-breakpoint
CREATE INDEX `accounts_identity` ON `accounts` (`provider`,lower("email"),`organization`);--> statement-breakpoint
CREATE TABLE `__new_login_moves` (
	`machine_id` text NOT NULL,
	`store` text NOT NULL,
	`store_provider` text NOT NULL,
	`account_id` text NOT NULL,
	`email` text NOT NULL,
	`organization` text NOT NULL,
	`provider` text NOT NULL,
	`since` integer NOT NULL,
	PRIMARY KEY(`machine_id`, `store`, `store_provider`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_login_moves` (`machine_id`, `store`, `store_provider`, `account_id`, `email`, `organization`, `provider`, `since`)
SELECT `machine_id`, `store`, `store_provider`, `account_id`,
  coalesce(json_extract(`identity`, '$.email'), ''), coalesce(json_extract(`identity`, '$.organization'), ''),
  `provider`, `since`
FROM `login_moves`;
--> statement-breakpoint
DROP TABLE `login_moves`;--> statement-breakpoint
ALTER TABLE `__new_login_moves` RENAME TO `login_moves`;
