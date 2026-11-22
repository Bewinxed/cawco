-- A design graph is served from its workspace's own stage, live with Vite's
-- HMR (hub served.ts `pinTarget`): no sheet names a pin any more. The pins
-- sheets were served from go as each machine registers, since the hub no
-- longer names them (agent stage.ts `keepPins`). Served previews and folder
-- previews keep theirs.
UPDATE `artifacts` SET `source_pin` = NULL WHERE `source_stage_dir` IS NOT NULL;
