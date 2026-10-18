-- The workspace a `from` cut took its commits from, and the commit it took
-- (hub work-items.ts `cutFrom`). Once this workspace lands that commit's work
-- on the base branch, the source holds none of it as its own, and its
-- archive is told so (core WorkspaceArchive.landed). Before it, the source
-- of every `from` cut stayed held with commits main already had, rebased
-- (2026-10-18: three such workspaces among 38 retired by hand).
ALTER TABLE `workspaces` ADD `cut_from` text;
