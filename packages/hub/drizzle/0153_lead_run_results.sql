ALTER TABLE `routine_runs` ADD `lead_instance_id` text;
--> statement-breakpoint
-- A lead run now ends silent, delivered or failed by Caw's routine_result;
-- the runs that only said they reached Caw read silent, saying why.
UPDATE `routine_runs`
SET `outcome` = 'silent', `reason` = 'Asked Caw before runs reported results'
WHERE `outcome` = 'sent';
