CREATE TABLE `held_picks` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`model` text,
	`effort` text,
	`permission_mode` text,
	`runs_mode` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
