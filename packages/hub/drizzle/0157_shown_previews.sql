CREATE TABLE `shown_previews` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
