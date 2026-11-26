/**
 * `bun run db:generate --name <name>` in packages/hub writes the next
 * migration from src/db/schema.ts. A rebase that conflicts in drizzle/meta:
 * take main's snapshot and journal, remove the branch's .sql, generate
 * again for a fresh number, copy the branch's SQL into it, and rebase onto
 * origin/main again right before finishing.
 */
import { hubDbPath } from "@cawco/core/paths/hub";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    // Core's one rule for where the hub's database is. Imported by a
    // relative path: drizzle-kit transpiles sources outside node_modules
    // only, so the `@cawco/core` package name does not load here.
    url: hubDbPath(),
  },
});
