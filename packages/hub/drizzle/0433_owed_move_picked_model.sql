-- A model a person picked while a session waited to move to another account
-- (`owed_moves.picked_model`): the launch that lands there runs it. Null for
-- every move owed before it, which carried none.
ALTER TABLE `owed_moves` ADD `picked_model` text;