-- The hub enforces foreign keys from here on (db/index.ts turns them on after
-- migrating; migrations run with them off, as a table rebuild needs).
-- instances.machine_id loses its key: a removed machine's sessions stay under
-- its id (machine_removed) and come back if it rejoins. instances.project_id's
-- key sets null when its project goes, as deleting a project always did by hand.
-- The rebuild drops the session-id index and the keep-alive trigger (0067,
-- 0073), so both are made again at the end.
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
	`workflow_run_id` text,
	`workflow_step_id` text,
	`thread_id` text,
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`project_id` text,
	`session_id` text,
	`harness` text,
	`account_id` text,
	`forked_from` text,
	`parent_instance_id` text,
	`parent_tool_use_id` text,
	`cwd` text NOT NULL,
	`title` text,
	`title_source` text,
	`tooling` text,
	`derived_title` text,
	`seen_at` integer,
	`kind` text DEFAULT 'mainline' NOT NULL,
	`permission_mode` text,
	`model` text,
	`effort` text,
	`can_delegate` integer,
	`role` text,
	`delegate_type` text,
	`delegate_type_project` text,
	`status` text DEFAULT 'starting' NOT NULL,
	`last_error` text,
	`autopilot` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`spawned_at` integer,
	`work_item_id` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_instances`("address_required", "machine_removed", "scratch_worktree", "address_protocol", "end_reason", "end_retry_at", "end_attempts", "end_intent", "end_confirmed_at", "owed_spawn", "owed_at", "keep_alive", "keep_alive_sent", "keep_alive_stopped", "cache_ttl", "last_request_at", "context_tokens", "context_read_at", "cache_cold", "last_ping_usage", "keep_alive_turn", "workflow_run_id", "workflow_step_id", "thread_id", "id", "machine_id", "project_id", "session_id", "harness", "account_id", "forked_from", "parent_instance_id", "parent_tool_use_id", "cwd", "title", "title_source", "tooling", "derived_title", "seen_at", "kind", "permission_mode", "model", "effort", "can_delegate", "role", "delegate_type", "delegate_type_project", "status", "last_error", "autopilot", "created_at", "updated_at", "spawned_at", "work_item_id") SELECT "address_required", "machine_removed", "scratch_worktree", "address_protocol", "end_reason", "end_retry_at", "end_attempts", "end_intent", "end_confirmed_at", "owed_spawn", "owed_at", "keep_alive", "keep_alive_sent", "keep_alive_stopped", "cache_ttl", "last_request_at", "context_tokens", "context_read_at", "cache_cold", "last_ping_usage", "keep_alive_turn", "workflow_run_id", "workflow_step_id", "thread_id", "id", "machine_id", "project_id", "session_id", "harness", "account_id", "forked_from", "parent_instance_id", "parent_tool_use_id", "cwd", "title", "title_source", "tooling", "derived_title", "seen_at", "kind", "permission_mode", "model", "effort", "can_delegate", "role", "delegate_type", "delegate_type_project", "status", "last_error", "autopilot", "created_at", "updated_at", "spawned_at", "work_item_id" FROM `instances`;--> statement-breakpoint
DROP TABLE `instances`;--> statement-breakpoint
ALTER TABLE `__new_instances` RENAME TO `instances`;--> statement-breakpoint
CREATE INDEX instances_session_id ON instances(session_id);--> statement-breakpoint
CREATE TRIGGER instances_keep_alive_terminal AFTER UPDATE OF status ON instances
WHEN NEW.status IN ('stopped', 'discarded', 'error')
BEGIN
  UPDATE instances SET keep_alive = 0, keep_alive_stopped = NULL WHERE id = NEW.id;
END;