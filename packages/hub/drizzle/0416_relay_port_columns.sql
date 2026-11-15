-- Which of the stream relay's URLs answered on a device
-- (`stream_relay_proofs.ports`, a JSON list of chips) is `proved_udp`,
-- `proved_tcp` and `proved_tls`, and what the relay's machine has bound
-- (`stream_relay.ports`, JSON) is `port_udp`, `port_tcp` and `port_tls`:
-- whether a device proved the relay (relay-journey.ts) is read off the
-- columns.
--
-- A proof's chips were NOT NULL, `[]` by default: a list that reads whole
-- (each entry one of the chips its writers make, core `portNameOf`) is
-- placed as it is, an empty one proving no port, as it did. The relay's
-- ports never said (null) stay null together; ports that read whole (core
-- `RelayPorts`) are placed as they are. Nothing is recomputed.
--
-- A proof's chips that are there and do not read whole (not JSON, not a
-- list, or an entry that is no chip) prove no port: every column false,
-- kept as stored in `ports_unread`, and the proof is not read as one
-- (relay-journey.ts), so the device proves the relay again. The relay's
-- ports that do not read whole are kept in `ports_unread`, none placed,
-- until its machine's next frame says them: the TLS listener is not asked
-- meanwhile. Today's reader threw on either. The step before this
-- migration (db/migrate.ts `relay-ports-unread`) logs each by its row and
-- why.
--
-- Every JSON function sits inside a CASE that proved `ports` JSON: SQLite
-- may run either side of an AND first.
ALTER TABLE `stream_relay` ADD `port_udp` integer;--> statement-breakpoint
ALTER TABLE `stream_relay` ADD `port_tcp` integer;--> statement-breakpoint
ALTER TABLE `stream_relay` ADD `port_tls` integer;--> statement-breakpoint
ALTER TABLE `stream_relay` ADD `ports_unread` text;--> statement-breakpoint
UPDATE `stream_relay` SET `ports_unread` = CASE WHEN `ports` IS NULL THEN NULL WHEN CASE WHEN json_valid(ports) THEN coalesce((json_type(ports, '$') IN ('object') AND (json_type(ports, '$.tcp') IN ('true', 'false')) AND (json_type(ports, '$.tls') IN ('true', 'false')) AND (json_type(ports, '$.udp') IN ('true', 'false'))), 0) ELSE 0 END THEN NULL ELSE CAST(`ports` AS TEXT) END;--> statement-breakpoint
UPDATE `stream_relay` SET `port_udp` = CASE WHEN json_valid(ports) THEN CASE WHEN ports_unread IS NULL THEN json_type(ports, '$.udp') = 'true' END END, `port_tcp` = CASE WHEN json_valid(ports) THEN CASE WHEN ports_unread IS NULL THEN json_type(ports, '$.tcp') = 'true' END END, `port_tls` = CASE WHEN json_valid(ports) THEN CASE WHEN ports_unread IS NULL THEN json_type(ports, '$.tls') = 'true' END END;--> statement-breakpoint
ALTER TABLE `stream_relay` DROP COLUMN `ports`;--> statement-breakpoint
ALTER TABLE `stream_relay_proofs` ADD `proved_udp` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `stream_relay_proofs` ADD `proved_tcp` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `stream_relay_proofs` ADD `proved_tls` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `stream_relay_proofs` ADD `ports_unread` text;--> statement-breakpoint
UPDATE `stream_relay_proofs` SET `ports_unread` = CASE WHEN CASE WHEN json_valid(ports) THEN coalesce((json_type(ports, '$') IN ('array') AND CASE WHEN json_type(ports, '$') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(ports, '$') e0 WHERE NOT coalesce((json_type(ports, e0.fullkey) IN ('text') AND (json_type(ports, e0.fullkey) = 'text' AND json_extract(ports, e0.fullkey) IN ('udp 3478', 'tcp 3478', 'tls 5349'))), 0)) ELSE 0 END), 0) ELSE 0 END THEN NULL ELSE CAST(`ports` AS TEXT) END;--> statement-breakpoint
UPDATE `stream_relay_proofs` SET `proved_udp` = coalesce(CASE WHEN json_valid(ports) THEN CASE WHEN ports_unread IS NULL THEN EXISTS (SELECT 1 FROM json_each(ports) e WHERE e.value = 'udp 3478') END END, 0), `proved_tcp` = coalesce(CASE WHEN json_valid(ports) THEN CASE WHEN ports_unread IS NULL THEN EXISTS (SELECT 1 FROM json_each(ports) e WHERE e.value = 'tcp 3478') END END, 0), `proved_tls` = coalesce(CASE WHEN json_valid(ports) THEN CASE WHEN ports_unread IS NULL THEN EXISTS (SELECT 1 FROM json_each(ports) e WHERE e.value = 'tls 5349') END END, 0);--> statement-breakpoint
ALTER TABLE `stream_relay_proofs` DROP COLUMN `ports`;