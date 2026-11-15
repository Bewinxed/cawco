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
