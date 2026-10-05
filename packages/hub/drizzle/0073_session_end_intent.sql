ALTER TABLE instances ADD COLUMN end_intent text;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN end_confirmed_at integer;
--> statement-breakpoint
UPDATE instances SET end_intent = CASE status WHEN 'stopped' THEN 'stop' WHEN 'discarded' THEN 'discard' END, end_confirmed_at = CASE WHEN harness = 'opencode' AND session_id IS NULL THEN NULL ELSE updated_at END WHERE status IN ('stopped', 'discarded');
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN address_protocol integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN end_reason text;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN address_required integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN machine_removed integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN scratch_worktree text;
--> statement-breakpoint
CREATE INDEX instances_session_id ON instances(session_id);
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN end_retry_at integer;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN end_attempts integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE agents ADD COLUMN address_contract integer NOT NULL DEFAULT 0;
