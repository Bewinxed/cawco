-- The Apple build gate is a step a project declares in its gate.md (hub
-- gate-file.ts: `needs: apple`, `on:` the paths the Swift build reads), not a
-- setting: the landing gate runs exactly what the project declares.
ALTER TABLE `projects` DROP COLUMN `apple_gate`;
