ALTER TABLE instances ADD COLUMN end_intent text;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN end_confirmed_at integer;
--> statement-breakpoint
UPDATE instances SET end_intent = CASE status WHEN 'stopped' THEN 'stop' WHEN 'discarded' THEN 'discard' END WHERE status IN ('stopped', 'discarded');
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN address_protocol integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE instances ADD COLUMN end_reason text;
