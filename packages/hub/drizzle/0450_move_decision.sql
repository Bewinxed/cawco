PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`hue` text NOT NULL,
	`order` integer NOT NULL,
	`never_backup` integer DEFAULT false NOT NULL,
	`reserve_pct` integer,
	`session_reserve_pct` integer,
	`at_plan_limit` text DEFAULT 'price' NOT NULL,
	`email` text,
	`organization` text,
	`org_id` text,
	`setup_step` text,
	`refusal_checked_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "provider", "kind", "label", "hue", "order", "never_backup", "reserve_pct", "session_reserve_pct", "at_plan_limit", "email", "organization", "org_id", "setup_step", "refusal_checked_at", "created_at") SELECT "id", "provider", "kind", "label", "hue", "order", "never_backup", coalesce("reserve_pct", 90), 80, CASE "at_plan_limit" WHEN 'move' THEN 'price' ELSE "at_plan_limit" END, "email", "organization", "org_id", "setup_step", "refusal_checked_at", "created_at" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `accounts_identity` ON `accounts` (`provider`,lower("email"),`org_id`);--> statement-breakpoint
ALTER TABLE `account_routing` ADD `compaction_cold_move` text DEFAULT 'whole' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_routing` DROP COLUMN `compaction_before_move`;--> statement-breakpoint
ALTER TABLE `owed_moves` ADD `leave` text;--> statement-breakpoint
ALTER TABLE `turn_usage` ADD `origin` text;--> statement-breakpoint
DELETE FROM `owed_moves` WHERE `by_hand` = 0 AND `to_account_id` IS NOT NULL AND `carry_on` IS NULL AND json_extract(`move`, '$.because.kind') IN ('forecast', 'cold');
