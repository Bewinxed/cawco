-- A session its account's removal (or sign-out on its machine) left on no
-- account, stopped until a launch of it is placed on one (server.ts
-- `strandedStall`).
CREATE TABLE `stranded_sessions` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`account_name` text NOT NULL,
	`why` text NOT NULL,
	`since` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
