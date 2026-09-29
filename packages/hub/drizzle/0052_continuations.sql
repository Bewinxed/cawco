CREATE TABLE `continuations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_instance_id` text NOT NULL,
	`request` text NOT NULL,
	`prepared` text NOT NULL,
	`summariser_instance_id` text,
	`target_instance_id` text NOT NULL,
	`opening_uuid` text NOT NULL,
	`summary` text,
	`stage` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
