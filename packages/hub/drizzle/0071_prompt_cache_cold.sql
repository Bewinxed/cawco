ALTER TABLE instances ADD COLUMN cache_cold text;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN last_ping_usage text;
--> statement-breakpoint
UPDATE instances SET cache_cold = json_object('reason', 'ping cache miss', 'at', updated_at), keep_alive_stopped = NULL WHERE keep_alive_stopped = 'stopped-miss';
--> statement-breakpoint
ALTER TABLE instances DROP COLUMN keep_alive_misses;
