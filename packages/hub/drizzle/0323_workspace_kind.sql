-- A workspace is made of any folder (agent layer.ts): a repository's root,
-- which lands by git, or any other folder, which lands by its change set.
-- Every workspace made before was a repository's.
ALTER TABLE `workspaces` ADD `kind` text DEFAULT 'repo' NOT NULL;