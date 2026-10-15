-- The Apple build gate (work-items.ts `appleGate`), off for every project
-- unless it is turned on. CawCo's own repository ships the iOS app, whose
-- compile no Linux check sees, so its project starts with the gate on.
ALTER TABLE `projects` ADD `apple_gate` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `projects` SET `apple_gate` = 1 WHERE lower(`remote`) = 'github.com/bewinxed/cawco';
