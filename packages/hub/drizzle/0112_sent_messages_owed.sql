-- A send the hub accepted and its machine has not been handed yet: the
-- envelope to hand it once its hold ends.
ALTER TABLE `sent_messages` ADD `owed` text;