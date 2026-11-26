-- An Antigravity account's sign-in method and the Google Cloud place it
-- names (core `Account.agy`); null for every other provider.
ALTER TABLE `accounts` ADD `agy_method` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `agy_gcp_project` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `agy_gcp_location` text;
