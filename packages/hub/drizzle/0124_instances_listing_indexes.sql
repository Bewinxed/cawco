-- The hub's narrow reads on its hot paths, by an index rather than a scan of
-- every row: an instances row carries its JSON columns, so a scan reads the
-- whole table, and twenty sessions moving at once made each scan twenty.
-- Running Claude sessions on every board and usage publish, a session's
-- delegates on every turn's end, the keep-alive schedule on every wake.
-- `instances_parent` carries `id` too, so the board's walk of every
-- session's parent reads the index alone.
CREATE INDEX instances_status_harness ON instances(status, harness);--> statement-breakpoint
CREATE INDEX instances_parent ON instances(parent_instance_id, id);--> statement-breakpoint
CREATE INDEX instances_keep_alive ON instances(keep_alive);--> statement-breakpoint
-- A delegate's reports, read on every turn's end (db `claimCompletedTurn`).
CREATE INDEX delegate_events_instance_kind ON delegate_events(instance_id, kind);--> statement-breakpoint
-- A harness's spend on every usage publish (db `usageSpend`), from the index alone.
CREATE INDEX usage_buckets_harness_start_cost ON usage_buckets(harness, start, cost_usd);
