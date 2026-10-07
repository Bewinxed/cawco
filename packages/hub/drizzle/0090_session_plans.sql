CREATE TABLE `session_plans` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`steps` text NOT NULL,
	`spec` text,
	`spec_at` integer,
	`updated_at` integer NOT NULL
);
