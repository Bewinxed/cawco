-- A removed account's store a machine keeps while a process there still runs
-- in it, signed out once none does (server.ts `leaveAccounts`).
CREATE TABLE `account_leaves` (
	`account_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`provider` text NOT NULL,
	`since` integer NOT NULL,
	PRIMARY KEY(`account_id`, `machine_id`)
);
