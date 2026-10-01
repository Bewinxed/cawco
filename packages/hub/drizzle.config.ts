import { defineConfig } from "drizzle-kit";
import { getTableName } from "drizzle-orm";
// biome-ignore lint/performance/noNamespaceImport: Drizzle must enumerate every declared table to protect separately managed tables in the same database.
import * as schema from "./src/db/schema";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  // Delegate presets own separate tables on the same connection; schema push must not delete them.
  tablesFilter: Object.values(schema).map((table) => getTableName(table)),
  dbCredentials: {
    // A plain read rather than core's `readEnv`: drizzle-kit bundles this
    // config on its own and never sees the workspace's TypeScript sources.
    url: process.env.CAWCO_DB_PATH ?? "./cawco.db",
  },
});
