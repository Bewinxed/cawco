CREATE TABLE `sent_messages` (
	`uuid` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`accepted_at` integer NOT NULL
);
