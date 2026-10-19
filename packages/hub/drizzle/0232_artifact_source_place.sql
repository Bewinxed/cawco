-- A sheet made by a session with no workspace runs on a place's stage (hub
-- caw.ts `stagePlaceRef`), whose id no workspaces row holds: kept in its own
-- column, no key, so source_workspace stays a key to workspaces. Before it,
-- that insert failed "FOREIGN KEY constraint failed" (2026-10-17).
ALTER TABLE `artifacts` ADD `source_place` text;
