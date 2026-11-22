-- A port preview is served from the one server its workspace or place runs,
-- live, its author's edits reaching the open page through the dev server's
-- own reload (hub served.ts `servedOf`): no port preview names a pin any
-- more. The pins they were served from go as each machine registers and on
-- each workspace sweep, since the hub no longer names them (agent stage.ts
-- `keepPins`). Folder previews keep theirs.
UPDATE `artifacts` SET `source_pin` = NULL WHERE `source_port` IS NOT NULL;
