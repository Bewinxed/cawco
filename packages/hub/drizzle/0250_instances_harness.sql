-- Every session row carries its harness: `instances.harness` is NOT NULL.
-- A row from before every write named one takes the harness its own record
-- shows, and nothing is set from dates or read as Claude:
--   1. the harness its machine's usage reports filed its conversation under
--      (usage_buckets, keyed machine + harness + session);
--   2. its conversation's id, which each harness mints in its own shape:
--      OpenCode `ses_…`, Claude Code a UUIDv4, pi a UUIDv7;
--   3. its model, as Claude Code names one (`claude-…`; OpenCode and pi name
--      `provider/model`).
-- A row none of that settles and that never began a conversation (no
-- session id) has nothing to resume: it is dropped, with what belongs to it
-- (db/index.ts `dropInstances`, and the foreign keys' cascades, which do not
-- fire while migrations run with foreign keys off). A row with a
-- conversation that none of it settles fails the rebuild below: it is
-- reported, not guessed.
-- drizzle-kit 0.31 wrote the rebuild with `PRAGMA foreign_keys` toggles,
-- which a migration's transaction ignores, and without the indexes and the
-- trigger the table had (0067, 0073 and later): both are written here.
UPDATE `instances` SET `harness` = (
	SELECT MIN(`usage_buckets`.`harness`) FROM `usage_buckets`
	WHERE `usage_buckets`.`machine_id` = `instances`.`machine_id`
		AND `usage_buckets`.`session_id` = `instances`.`session_id`
)
WHERE `harness` IS NULL AND `session_id` IS NOT NULL AND (
	SELECT COUNT(DISTINCT `usage_buckets`.`harness`) FROM `usage_buckets`
	WHERE `usage_buckets`.`machine_id` = `instances`.`machine_id`
		AND `usage_buckets`.`session_id` = `instances`.`session_id`
) = 1;--> statement-breakpoint
UPDATE `instances` SET `harness` = 'opencode'
WHERE `harness` IS NULL AND `session_id` GLOB 'ses_*';--> statement-breakpoint
UPDATE `instances` SET `harness` = 'claude'
WHERE `harness` IS NULL AND `session_id` GLOB '????????-????-4???-????-????????????';--> statement-breakpoint
UPDATE `instances` SET `harness` = 'pi'
WHERE `harness` IS NULL AND `session_id` GLOB '????????-????-7???-????-????????????';--> statement-breakpoint
UPDATE `instances` SET `harness` = 'claude'
WHERE `harness` IS NULL AND `model` GLOB 'claude-*' AND `model` NOT GLOB '*/*';--> statement-breakpoint
DELETE FROM `delegate_events` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL)
	OR `parent_instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `rule_state` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `sent_messages` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `limit_holds` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `limit_compactions` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `limit_events` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `fleet_watch_notices` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `moved_from_sessions` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `artifacts` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
UPDATE `artifacts` SET `made_by` = NULL WHERE `made_by` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `session_taints` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `shown_previews` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `preview_ports` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `instance_conversations` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `session_lines` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `workflow_run_pending_ends` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `memory_briefings` WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
UPDATE `workflow_steps` SET `instance_id` = NULL WHERE `instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
UPDATE `workflow_runs` SET `supervisor_instance_id` = NULL WHERE `supervisor_instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
UPDATE `instances` SET `parent_instance_id` = NULL WHERE `parent_instance_id` IN (SELECT `id` FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL);--> statement-breakpoint
DELETE FROM `instances` WHERE `harness` IS NULL AND `session_id` IS NULL;--> statement-breakpoint
CREATE TABLE `__new_instances` (
	`address_required` integer DEFAULT false NOT NULL,
	`machine_removed` integer DEFAULT false NOT NULL,
	`scratch_worktree` text,
	`address_protocol` integer DEFAULT false NOT NULL,
	`end_reason` text,
	`end_retry_at` integer,
	`end_attempts` integer DEFAULT 0 NOT NULL,
	`end_intent` text,
	`end_confirmed_at` integer,
	`owed_spawn` text,
	`owed_at` integer,
	`fresh_start_at` integer,
	`turn_open_at` integer,
	`keep_alive` integer DEFAULT false NOT NULL,
	`keep_alive_sent` integer DEFAULT 0 NOT NULL,
	`keep_alive_stopped` text,
	`cache_ttl` text,
	`last_request_at` integer,
	`context_tokens` integer,
	`context_read_at` integer,
	`cache_cold` text,
	`last_ping_usage` text,
	`keep_alive_turn` text,
	`model_usage_seen` text,
	`workflow_run_id` text,
	`workflow_step_id` text,
	`thread_id` text,
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`project_id` text,
	`session_id` text,
	`harness` text NOT NULL,
	`account_id` text,
	`forked_from` text,
	`parent_instance_id` text,
	`parent_tool_use_id` text,
	`cwd` text NOT NULL,
	`launch_dir` text DEFAULT 'known' NOT NULL,
	`title` text,
	`title_source` text,
	`tooling` text,
	`derived_title` text,
	`seen_at` integer,
	`turn_ended_at` integer,
	`kind` text DEFAULT 'mainline' NOT NULL,
	`permission_mode` text,
	`model` text,
	`effort` text,
	`chosen_effort` text,
	`can_delegate` integer,
	`role` text,
	`delegate_type` text,
	`delegate_type_project` text,
	`status` text DEFAULT 'starting' NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`spawned_at` integer,
	`work_item_id` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_instances`("address_required", "machine_removed", "scratch_worktree", "address_protocol", "end_reason", "end_retry_at", "end_attempts", "end_intent", "end_confirmed_at", "owed_spawn", "owed_at", "fresh_start_at", "turn_open_at", "keep_alive", "keep_alive_sent", "keep_alive_stopped", "cache_ttl", "last_request_at", "context_tokens", "context_read_at", "cache_cold", "last_ping_usage", "keep_alive_turn", "model_usage_seen", "workflow_run_id", "workflow_step_id", "thread_id", "id", "machine_id", "project_id", "session_id", "harness", "account_id", "forked_from", "parent_instance_id", "parent_tool_use_id", "cwd", "launch_dir", "title", "title_source", "tooling", "derived_title", "seen_at", "turn_ended_at", "kind", "permission_mode", "model", "effort", "chosen_effort", "can_delegate", "role", "delegate_type", "delegate_type_project", "status", "last_error", "created_at", "updated_at", "spawned_at", "work_item_id") SELECT "address_required", "machine_removed", "scratch_worktree", "address_protocol", "end_reason", "end_retry_at", "end_attempts", "end_intent", "end_confirmed_at", "owed_spawn", "owed_at", "fresh_start_at", "turn_open_at", "keep_alive", "keep_alive_sent", "keep_alive_stopped", "cache_ttl", "last_request_at", "context_tokens", "context_read_at", "cache_cold", "last_ping_usage", "keep_alive_turn", "model_usage_seen", "workflow_run_id", "workflow_step_id", "thread_id", "id", "machine_id", "project_id", "session_id", "harness", "account_id", "forked_from", "parent_instance_id", "parent_tool_use_id", "cwd", "launch_dir", "title", "title_source", "tooling", "derived_title", "seen_at", "turn_ended_at", "kind", "permission_mode", "model", "effort", "chosen_effort", "can_delegate", "role", "delegate_type", "delegate_type_project", "status", "last_error", "created_at", "updated_at", "spawned_at", "work_item_id" FROM `instances`;--> statement-breakpoint
DROP TABLE `instances`;--> statement-breakpoint
ALTER TABLE `__new_instances` RENAME TO `instances`;--> statement-breakpoint
CREATE INDEX instances_session_id ON instances(session_id);--> statement-breakpoint
CREATE INDEX instances_status_harness ON instances(status, harness);--> statement-breakpoint
CREATE INDEX instances_parent ON instances(parent_instance_id, id);--> statement-breakpoint
CREATE INDEX instances_keep_alive ON instances(keep_alive);--> statement-breakpoint
CREATE TRIGGER instances_keep_alive_terminal AFTER UPDATE OF status ON instances
WHEN NEW.status IN ('stopped', 'discarded', 'error')
BEGIN
  UPDATE instances SET keep_alive = 0, keep_alive_stopped = NULL WHERE id = NEW.id;
END;
