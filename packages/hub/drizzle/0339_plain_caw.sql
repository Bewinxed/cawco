-- A project's Caw is a plain spawn (one-session design §6, slice 3): no gate
-- decides his shell and edit calls, so nothing keeps them. His mode and his
-- turn's provenance decide each, as every session's (core turn-provenance.ts).
DROP TABLE `lead_calls`;--> statement-breakpoint
-- Every Caw session started under the gate ends: it runs with the gate's ask
-- rules and its place's boundary, which no launch gives any more. Its end is
-- the stored decision the machine carries out as it connects (hub
-- session-lifecycle.ts), as a harness move ends him; the next word to the
-- project starts him again as a plain session.
UPDATE `instances` SET `end_intent` = 'stop' WHERE `role` = 'lead' AND `end_intent` IS NULL;--> statement-breakpoint
UPDATE `projects` SET `lead_instance_id` = NULL WHERE `lead_instance_id` IS NOT NULL;
