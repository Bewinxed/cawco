-- The two sealed bags 0419 split go, once the step before this migration
-- (db/migrate.ts `sealed-facts`, db/sealed-facts-unread.ts) has moved each
-- in code, holding the hub's key, in this same transaction: every value
-- opened, its plain facts placed in 0419's columns and each secret sealed
-- alone, the trash's connections and MCP servers moved alike. Nothing is
-- recomputed: a fact is placed as it was kept, a never-set value stays null.
--
-- A value that is there and does not read (it does not open with the hub's
-- key, or opens to something that is not what it held) places nothing. It
-- is kept sealed as it was in `sealed_unread` or `pending_unread`, and the
-- step logs its row's id and why. A connection kept so is not signed in,
-- its reason saying why, until it is signed in again; a sign-in under way
-- kept so matches no redirect. A sign-in under way that reads keeps working
-- across the update: it is matched by `pending_state` from then on.
ALTER TABLE `connections` DROP COLUMN `sealed`;--> statement-breakpoint
ALTER TABLE `fleet_mcp_oauth` DROP COLUMN `pending`;