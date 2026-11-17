-- No machine links a fleet marketplace any more (wire epoch 9, core
-- runtime.ts `protocolRange`), so no report names a plugin failed as
-- `hub-only` or `marketplace-unlinked`, and core fleet.ts `FAULT_CAUSES`
-- has neither. A machine's last report that names either is cleared: the
-- report is the machine's own account, sent again at its next sync, and
-- nothing else of the machine's row changes.
--
-- json_tree runs only inside a CASE that proved `fleet` JSON: SQLite may
-- run either side of an AND first.
UPDATE `agents` SET `fleet` = NULL WHERE CASE WHEN json_valid(`fleet`) THEN EXISTS (SELECT 1 FROM json_tree(`agents`.`fleet`) WHERE `key` = 'cause' AND `value` IN ('hub-only', 'marketplace-unlinked')) ELSE 0 END;
