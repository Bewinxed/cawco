-- Who decides' members and kinds (core decides.ts): the members the person
-- adds and every kind are rows; the fleet's routes name a member by its id.
-- The asker's old route word, `agent`, is `asker` now; `advisor` and
-- `practice` already are the built-in members' ids. card_settlings becomes
-- the ledger of every card's member, a card that came to the person
-- included (it started no run, so its session and item may be null).
UPDATE `decides_settings` SET `routes` = replace(`routes`, '"agent"', '"asker"');--> statement-breakpoint
CREATE TABLE `decides_kinds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`example` text NOT NULL,
	`built_in` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decides_members` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`job` text NOT NULL,
	`subject` text NOT NULL,
	`hue` integer NOT NULL,
	`hear` text NOT NULL,
	`delegate_type` text,
	`reach` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_card_settlings` (
	`artifact_id` text NOT NULL,
	`card` text NOT NULL,
	`route` text NOT NULL,
	`instance_id` text,
	`work_item_id` text,
	`asked_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`signed` text,
	`settled_at` integer,
	`taken_back_at` integer,
	`kind` text,
	PRIMARY KEY(`artifact_id`, `card`)
);
--> statement-breakpoint
INSERT INTO `__new_card_settlings`("artifact_id", "card", "route", "instance_id", "work_item_id", "asked_by", "created_at") SELECT "artifact_id", "card", "route", "instance_id", "work_item_id", "asked_by", "created_at" FROM `card_settlings`;--> statement-breakpoint
DROP TABLE `card_settlings`;--> statement-breakpoint
ALTER TABLE `__new_card_settlings` RENAME TO `card_settlings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `decides_settings` ADD `practice` text;--> statement-breakpoint
ALTER TABLE `decides_settings` ADD `hear` text;--> statement-breakpoint
ALTER TABLE `decides_settings` ADD `pictures` text;--> statement-breakpoint
ALTER TABLE `decides_settings` ADD `caught_up_at` integer;