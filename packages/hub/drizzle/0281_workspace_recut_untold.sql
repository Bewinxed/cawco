-- Where a retired workspace was cut again while no message has been handed to a session of it since (hub work-items.ts `recut`): the next one opens with the hub's line that the folder is a new clone. On the row, so a hub restart in between still says it.
ALTER TABLE `workspaces` ADD `recut_untold` text;
