CREATE TABLE `project_offers` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`line` text NOT NULL,
	`offered_at` integer NOT NULL,
	`answer` text,
	`answered_at` integer,
	`project_id` text
);
