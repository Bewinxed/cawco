-- CawCo has no workflows: their tables, the Effect engine's storage and the
-- session columns that named a run and its step all go. Children before the
-- tables they name, so no drop's implicit delete leaves a row naming one gone.
DROP TABLE `workflow_attempts`;--> statement-breakpoint
DROP TABLE `workflow_held_stops`;--> statement-breakpoint
DROP TABLE `workflow_run_pending_ends`;--> statement-breakpoint
DROP TABLE `workflow_run_slots`;--> statement-breakpoint
DROP TABLE `workflow_run_notes`;--> statement-breakpoint
DROP TABLE `workflow_run_log`;--> statement-breakpoint
DROP TABLE `workflow_notices`;--> statement-breakpoint
DROP TABLE `workflow_steps`;--> statement-breakpoint
DROP TABLE `workflow_runs`;--> statement-breakpoint
DROP TABLE `workflows`;--> statement-breakpoint
DROP TABLE IF EXISTS `cluster_replies`;--> statement-breakpoint
DROP TABLE IF EXISTS `cluster_messages`;--> statement-breakpoint
DROP TABLE IF EXISTS `cluster_migrations`;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `workflow_run_id`;--> statement-breakpoint
ALTER TABLE `instances` DROP COLUMN `workflow_step_id`;
