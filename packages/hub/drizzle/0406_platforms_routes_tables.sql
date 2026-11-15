-- Two of the fleet's Stop settings are real columns and rows now, not
-- JSON: where an MCP server runs (`mcp_servers.platforms`, core
-- `FleetMcpServer.platforms`) is `every_platform` with the
-- `mcp_server_platforms` rows, and the fleet's Who decides routes
-- (`decides_settings.routes`, core `FleetDecides.routes`) are
-- `decides_routes` rows; `platforms_unread` and `routes_unread` beside them.
--
-- Platforms. The one writer (db/mcp-servers.ts `putMcpServer`) stores null
-- for "every machine", an asked empty list included (`platforms?.length ?
-- platforms : null`), and a list of darwin, linux and win32 otherwise.
-- Null is placed as `every_platform`. A list reads as that writer built it:
-- each platform placed in the order kept, one kept twice placed once; a
-- list with no entry (no writer stored one) is placed as it read, on no
-- machine (core `mcpRunsOn`). A value that is there and does not read
-- whole (not JSON, JSON `null`, not a list, an entry that is not one of
-- the three) is never read as "every machine": it is kept as stored in
-- `platforms_unread`, its entries that are platforms placed beside it, and
-- while it is set the server is sent to no machine; a save that names its
-- platforms clears it. A server in the trash is kept in the trash's new
-- shape (its row with the two new columns, then its platforms' rows), read
-- by the same rule.
--
-- Routes. No row, or `{}` (a row the built-in members' writer made), sets
-- no kind: each kind reads as core's seed (`DEFAULT_ROUTES`), as before.
-- Each kind → member the writers stored (db/decides.ts `setRoutes`,
-- `removeMember`, `removeKind`, every one checked against the kinds and
-- members) is placed as it is, a member gone since included: the reader
-- still sends its kind to `you`. A key naming no kind was never read and
-- is not placed; a key kept twice reads as its last, as `JSON.parse` read
-- it. Routes that are there and do not read whole (not JSON, not an
-- object, a member that is not text) are never read as core's seed, which
-- hands approach and rules to the Advisor and tools to Common practice:
-- they are kept as stored in `routes_unread`, the members that read placed
-- beside them, and while it is set every kind goes to `you`; a save of the
-- routes clears it.
--
-- The step before this migration (db/migrate.ts `platforms-routes-unread`)
-- logs each such value by its server, trash entry or row, and reason.
-- Every JSON function here sits inside a CASE that proved its argument JSON
-- of the right type: SQLite may run either side of an AND first.
CREATE TABLE `decides_routes` (
	`kind_id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	FOREIGN KEY (`kind_id`) REFERENCES `decides_kinds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mcp_server_platforms` (
	`server_name` text NOT NULL,
	`platform` text NOT NULL,
	PRIMARY KEY(`server_name`, `platform`),
	FOREIGN KEY (`server_name`) REFERENCES `mcp_servers`(`name`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mcp_server_platforms_platform" CHECK("platform" in ('darwin', 'linux', 'win32'))
);
--> statement-breakpoint
ALTER TABLE `decides_settings` ADD `routes_unread` text;--> statement-breakpoint
ALTER TABLE `mcp_servers` ADD `every_platform` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `mcp_servers` ADD `platforms_unread` text;--> statement-breakpoint
UPDATE `mcp_servers` SET `every_platform` = 1 WHERE `platforms` IS NULL;--> statement-breakpoint
UPDATE `mcp_servers` SET `platforms_unread` = CAST(`platforms` AS TEXT) WHERE `platforms` IS NOT NULL AND NOT (CASE WHEN json_valid(`platforms`) THEN CASE WHEN json_type(`platforms`) = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(`platforms`) e WHERE e.type <> 'text' OR e.value NOT IN ('darwin', 'linux', 'win32')) ELSE 0 END ELSE 0 END);--> statement-breakpoint
INSERT OR IGNORE INTO `mcp_server_platforms` (`server_name`, `platform`) SELECT s.`name`, e.`value` FROM `mcp_servers` s, json_each(CASE WHEN CASE WHEN json_valid(s.`platforms`) THEN json_type(s.`platforms`) = 'array' ELSE 0 END THEN s.`platforms` ELSE '[]' END) e WHERE s.`platforms` IS NOT NULL AND e.type = 'text' AND e.value IN ('darwin', 'linux', 'win32') ORDER BY s.`rowid`, e.`id`;--> statement-breakpoint
UPDATE `config_trash` SET `rows` = CASE WHEN CASE WHEN json_valid(rows) THEN CASE WHEN json_type(rows) = 'array' THEN coalesce(json_extract(rows, '$[0].table') = 'mcp_servers' AND json_type(rows, '$[0].rows[0]') = 'object' AND json_type(rows, '$[0].rows[0].name') = 'text', 0) ELSE 0 END ELSE 0 END THEN json_insert(json_set(json_remove(`rows`, '$[0].rows[0].platforms'), '$[0].rows[0].every_platform', CASE WHEN json_extract(rows, '$[0].rows[0].platforms') IS NULL THEN 1 ELSE 0 END, '$[0].rows[0].platforms_unread', CASE WHEN json_extract(rows, '$[0].rows[0].platforms') IS NULL OR CASE WHEN json_valid(json_extract(rows, '$[0].rows[0].platforms')) THEN CASE WHEN json_type(json_extract(rows, '$[0].rows[0].platforms')) = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(json_extract(rows, '$[0].rows[0].platforms')) e WHERE e.type <> 'text' OR e.value NOT IN ('darwin', 'linux', 'win32')) ELSE 0 END ELSE 0 END THEN NULL ELSE CAST(json_extract(rows, '$[0].rows[0].platforms') AS TEXT) END), '$[#]', json_object('table', 'mcp_server_platforms', 'rows', json((SELECT json_group_array(json_object('server_name', json_extract(rows, '$[0].rows[0].name'), 'platform', d.`platform`)) FROM (SELECT DISTINCT e.`value` AS `platform` FROM json_each(CASE WHEN CASE WHEN json_valid(json_extract(rows, '$[0].rows[0].platforms')) THEN json_type(json_extract(rows, '$[0].rows[0].platforms')) = 'array' ELSE 0 END THEN json_extract(rows, '$[0].rows[0].platforms') ELSE '[]' END) e WHERE e.type = 'text' AND e.value IN ('darwin', 'linux', 'win32')) d)))) ELSE `rows` END WHERE `kind` = 'mcp' AND CASE WHEN json_valid(rows) THEN CASE WHEN json_type(rows) = 'array' THEN coalesce(json_extract(rows, '$[0].table') = 'mcp_servers' AND json_type(rows, '$[0].rows[0]') = 'object' AND json_type(rows, '$[0].rows[0].name') = 'text', 0) ELSE 0 END ELSE 0 END;--> statement-breakpoint
UPDATE `decides_settings` SET `routes_unread` = CAST(`routes` AS TEXT) WHERE NOT (CASE WHEN json_valid(`routes`) THEN CASE WHEN json_type(`routes`) = 'object' THEN NOT EXISTS (SELECT 1 FROM json_each(`routes`) e WHERE e.type <> 'text') ELSE 0 END ELSE 0 END);--> statement-breakpoint
INSERT OR REPLACE INTO `decides_routes` (`kind_id`, `member_id`) SELECT e.`key`, e.`value` FROM `decides_settings` s, json_each(CASE WHEN CASE WHEN json_valid(s.`routes`) THEN json_type(s.`routes`) = 'object' ELSE 0 END THEN s.`routes` ELSE '{}' END) e WHERE s.`id` = 'decides' AND e.`type` = 'text' AND e.`key` IN (SELECT `id` FROM `decides_kinds`) ORDER BY e.`id`;--> statement-breakpoint
ALTER TABLE `decides_settings` DROP COLUMN `routes`;--> statement-breakpoint
ALTER TABLE `mcp_servers` DROP COLUMN `platforms`;