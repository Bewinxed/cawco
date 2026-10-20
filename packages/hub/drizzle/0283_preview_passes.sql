CREATE TABLE `preview_passes` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`device_id` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `owner_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preview_passes_token_hash_unique` ON `preview_passes` (`token_hash`);--> statement-breakpoint
CREATE INDEX `preview_passes_device_id_idx` ON `preview_passes` (`device_id`);