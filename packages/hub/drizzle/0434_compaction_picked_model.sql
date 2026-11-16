-- A model a person picked to go with a move whose compaction runs first
-- (`limit_compactions.move_picked_model`): the row takes it only as the move
-- lands. Null for every plan before it, and for a filing's.
ALTER TABLE `limit_compactions` ADD `move_picked_model` text;