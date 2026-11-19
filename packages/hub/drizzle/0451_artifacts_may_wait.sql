ALTER TABLE `artifacts` ADD `may_wait` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `artifacts_may_wait` ON `artifacts` (`created_at`) WHERE "artifacts"."may_wait" = 1 and "artifacts"."held_for" is null;--> statement-breakpoint
-- Needs you's read reads the artifacts that may wait on the person, off
-- `artifacts_may_wait`, where it read every artifact (96 ms a read on
-- obelisk's hub, about 1,000 artifacts, 2026-11-19). Whether one may wait
-- is read from its row and its doc (artifacts/needs.ts `mayWait`); the
-- read sets `may_wait` to 0 on each it finds may not, and any write of the
-- row sets it to 1 again, whoever writes it: the hub's own writes, a fold's,
-- a foreign key's SET NULL, and every update its doc takes (db/artifacts.ts
-- `append` moves the row's `seq`). The read's own write (1 to 0) and this
-- trigger's (0 to 1) do not fire it.
CREATE TRIGGER artifacts_may_wait_moved AFTER UPDATE ON artifacts
WHEN OLD.may_wait = 0 AND NEW.may_wait = 0
BEGIN
  UPDATE artifacts SET may_wait = 1 WHERE id = NEW.id;
END;
