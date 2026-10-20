-- The stream relay runs relay to relay inside its one coturn (agent relay.ts):
-- coturn maps its public address onto its own media address itself, so the
-- relay's row keeps no `external_ip`. It keeps instead what its machine's
-- last live frame said of its own LAN and tailnet addresses (`reach`), which
-- every browser's credential carries (agent relay-urls.ts). The router no
-- longer forwards the relay range, so a journey that opened 443 and not the
-- range (`partial`) has its ports open.
ALTER TABLE `stream_relay` DROP COLUMN `external_ip`;
--> statement-breakpoint
ALTER TABLE `stream_relay` ADD `reach` text;
--> statement-breakpoint
UPDATE `stream_relay_journey` SET `router` = 'mapped' WHERE `router` = 'partial';
