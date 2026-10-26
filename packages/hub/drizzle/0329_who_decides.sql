-- Who decides (core decides.ts): the fleet's table, one row keyed 'decides'
-- (decides-file.ts), and the cards the hub handed a delegate to settle
-- (settling.ts), one row per card.
CREATE TABLE `card_settlings` (
	`artifact_id` text NOT NULL,
	`card` text NOT NULL,
	`route` text NOT NULL,
	`instance_id` text NOT NULL,
	`work_item_id` text NOT NULL,
	`asked_by` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`artifact_id`, `card`)
);
--> statement-breakpoint
CREATE TABLE `decides_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`routes` text DEFAULT '{}' NOT NULL,
	`advisor` text
);
