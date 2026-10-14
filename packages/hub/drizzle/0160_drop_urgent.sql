-- A send no longer cuts into a running turn: every send is read at the
-- session's next step, a command it is running moved to the background. An
-- urgent send is an ordinary one now, and a rule's `interrupt` has nothing
-- left to choose.
UPDATE `sent_messages` SET `mode` = 'turn' WHERE `mode` = 'urgent';--> statement-breakpoint
ALTER TABLE `rules` DROP COLUMN `interrupt`;
