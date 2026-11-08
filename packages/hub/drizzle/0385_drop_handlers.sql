DROP INDEX `work_items_handled_by`;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `handles_kind`;--> statement-breakpoint
ALTER TABLE `work_items` DROP COLUMN `handles_id`;