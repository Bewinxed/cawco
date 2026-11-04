ALTER TABLE `presence_clients` ADD `showing` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `sent_messages` ADD `answered_at` integer;
--> statement-breakpoint
-- Each send from before a reply was kept has had its turn: none reads as
-- owed, or every session would be told to answer an old message on its next wake.
UPDATE `sent_messages` SET `answered_at` = `accepted_at`;
