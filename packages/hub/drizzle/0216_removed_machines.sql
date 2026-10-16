CREATE TABLE `removed_machines` (
	`machine_id` text PRIMARY KEY NOT NULL,
	`hostname` text NOT NULL,
	`removed_at` integer NOT NULL
);
