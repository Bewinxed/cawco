-- A credential moving out of a machine's own store into a CawCo account, and
-- the sessions still running from one that has moved, kept so a hub restart
-- carries both on.
CREATE TABLE `login_moves` (
	`machine_id` text NOT NULL,
	`store` text NOT NULL,
	`store_provider` text NOT NULL,
	`account_id` text NOT NULL,
	`identity` text NOT NULL,
	`provider` text NOT NULL,
	`since` integer NOT NULL,
	PRIMARY KEY(`machine_id`, `store`, `store_provider`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `moved_from_sessions` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
