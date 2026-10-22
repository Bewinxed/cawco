-- The stream relay takes TURN's own ports, 3478 and 5349 (agent relay.ts),
-- and its certificate comes only by DNS at Cloudflare. No runtime is let
-- bind a low port any more, so the journey keeps whether the runtime carries
-- the relay as it is (`runtime_holds`, a VM's forwarder carrying UDP and
-- TCP), read again from false. A certificate issued over HTTP with no token
-- is forgotten, so the certificate step asks for the token and issues it by
-- DNS. Proofs and health named the old ports: both are taken again.
ALTER TABLE `stream_relay_journey` RENAME COLUMN `low_ports` TO `runtime_holds`;
--> statement-breakpoint
UPDATE `stream_relay_journey` SET `runtime_holds` = false;
--> statement-breakpoint
UPDATE `stream_relay_journey` SET `certificate_name` = NULL, `certificate_ends_at` = NULL WHERE `cloudflare_token` IS NULL;
--> statement-breakpoint
DELETE FROM `stream_relay_proofs`;
--> statement-breakpoint
UPDATE `stream_relay` SET `health` = '[]', `ports` = NULL;
