-- A hold whose move to another account waits for work in flight its
-- process holds for later (at-limit.ts `unmoved`): where it goes, what it
-- waits for and since when, so its stalled words say what the hub's line
-- says and its wait's bound outlives a hub restart.
ALTER TABLE `limit_holds` ADD `carry` text;
