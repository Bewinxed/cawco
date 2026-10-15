import { defineConfig } from "drizzle-kit";
import { getTableName } from "drizzle-orm";
import { hubDbPath } from "../core/src/paths";
// biome-ignore lint/performance/noNamespaceImport: Drizzle must enumerate every declared table to protect separately managed tables in the same database.
import * as schema from "./src/db/schema";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  // Delegate presets own separate tables on the same connection; schema push must not delete them.
  tablesFilter: Object.values(schema).map((table) => getTableName(table)),
  dbCredentials: {
    // Core's one rule for where the hub's database is. Imported by a
    // relative path: drizzle-kit transpiles sources outside node_modules
    // only, so the `@cawco/core` package name does not load here.
    url: hubDbPath(),
  },
});
