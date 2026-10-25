-- A work item names the decision pages it builds from: while one waits on
-- the person's picks, its landing on main is held (work-items.ts).
ALTER TABLE `work_items` ADD `builds_from` text;
