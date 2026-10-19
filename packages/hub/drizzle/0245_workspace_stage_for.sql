-- A place's stage clone (agent stage-clone.ts) is a workspace of the stage
-- kind: the place whose sheets' stage runs in it. It settles like any
-- workspace once that stage sleeps (work-items.ts `settle`).
ALTER TABLE `workspaces` ADD `stage_for` text;