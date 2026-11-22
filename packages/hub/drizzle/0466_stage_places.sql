-- The folder each place a port preview is staged from stands for (hub
-- schema.ts `stagePlaces`): a place's id is a hash of its machine and
-- folder, and a preview's place may be a folder no session works in.
CREATE TABLE `stage_places` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`path` text NOT NULL,
	`named_by` text NOT NULL,
	`created_at` integer NOT NULL
);
