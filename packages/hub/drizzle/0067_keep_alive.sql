ALTER TABLE instances ADD COLUMN keep_alive integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN keep_alive_sent integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN keep_alive_stopped text;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN cache_ttl text;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN last_request_at integer;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN keep_alive_misses integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN keep_alive_turn text;
--> statement-breakpoint
CREATE TRIGGER instances_keep_alive_terminal AFTER UPDATE OF status ON instances
WHEN NEW.status IN ('stopped', 'discarded', 'error')
BEGIN
  UPDATE instances SET keep_alive = 0, keep_alive_stopped = NULL WHERE id = NEW.id;
END;
