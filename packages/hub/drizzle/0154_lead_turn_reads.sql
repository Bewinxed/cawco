ALTER TABLE `lead_turns` ADD `reading` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `lead_turns` ADD `waiting` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- A turn stored before its wakes were kept by send: its thread reads working
-- as the turn under way's, which the next idle ends.
UPDATE `lead_turns`
SET `reading` = CASE WHEN `thread_id` IS NULL THEN '[]' ELSE json_array(`thread_id`) END,
    `started` = 1;
