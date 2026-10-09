ALTER TABLE `sent_messages` ADD `envelope` text;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `delivery` text;--> statement-breakpoint
-- A send still owed keeps its whole envelope there already: it is the send's
-- envelope too. One already handed to a machine is kept whole from its record
-- at the hub's next start (server.ts keepPendingWhole), which reads images
-- back from the media store.
UPDATE `sent_messages` SET `envelope` = `owed` WHERE `owed` IS NOT NULL AND `state` = 'pending';
