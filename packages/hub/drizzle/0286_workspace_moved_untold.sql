-- A workspace's untold recut becomes its untold checkout move (core injected.ts `CheckoutMove`): a recut, or the landing rebase that moved its checkout. The next message to its session opens with the hub's line naming the move and the install to run.
ALTER TABLE `workspaces` RENAME COLUMN `recut_untold` TO `moved_untold`;--> statement-breakpoint
UPDATE `workspaces` SET `moved_untold` = json_object('kind', 'recut', 'branch', json_extract(`moved_untold`, '$.branch'), 'commit', json_extract(`moved_untold`, '$.commit')) WHERE `moved_untold` IS NOT NULL;
