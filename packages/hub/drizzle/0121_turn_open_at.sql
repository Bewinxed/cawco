ALTER TABLE `instances` ADD `turn_open_at` integer;
--> statement-breakpoint
-- Every session from before the hub kept its open turn: unrecorded (-1,
-- db/index.ts TURN_UNRECORDED), so a null always means its turn ended. What
-- it had open is read from its harness's own transcript; its next turn records.
UPDATE `instances` SET `turn_open_at` = -1;
