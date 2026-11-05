-- A fleet skill, MCP server, hook or harness config row may be bound to
-- every project in an area (core FleetPlacement.areaId) instead of one
-- project; the row goes with its area. A hook's history keeps the binding
-- as it was, unchecked.
ALTER TABLE `fleet_harness_config` ADD `area_id` text REFERENCES areas(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `fleet_hook_history` ADD `area_id` text;--> statement-breakpoint
ALTER TABLE `fleet_hooks` ADD `area_id` text REFERENCES areas(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `mcp_servers` ADD `area_id` text REFERENCES areas(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `skills` ADD `area_id` text REFERENCES areas(id) ON DELETE cascade;
