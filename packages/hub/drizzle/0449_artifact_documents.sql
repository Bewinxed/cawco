CREATE TABLE `artifact_documents` (
	`artifact_id` text PRIMARY KEY NOT NULL,
	`etag` text NOT NULL,
	`seed_state` text NOT NULL,
	`seed_maps` text NOT NULL,
	`program_hash` text,
	`media` text,
	`pictures` text,
	`shows` text DEFAULT '[]' NOT NULL,
	`folder_key` text,
	`built_at` integer NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
