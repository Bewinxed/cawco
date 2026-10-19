/**
 * `bun preview/build.ts <name>` (from apps/dashboard): builds
 * preview/<name>/ to preview/<name>/out/ (preview/vite.config.ts), the
 * static folder `artifact_create({ kind: "preview", name, dir })` shows.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const dashboard = join(dirname(fileURLToPath(import.meta.url)), "..");
const [, , name] = process.argv;
if (!(name && /^[a-z0-9][a-z0-9-]*$/.test(name))) {
  console.error(
    "usage: bun preview/build.ts <name>  (a folder under preview/)"
  );
  process.exit(2);
}
if (!existsSync(join(dashboard, "preview", name, "index.html"))) {
  console.error(`preview/${name}/index.html does not exist.`);
  process.exit(2);
}

// The dashboard's tsconfig extends `$app/tsconfig`, which SvelteKit writes.
const sync = spawnSync("bunx", ["svelte-kit", "sync"], {
  cwd: dashboard,
  stdio: "inherit",
});
if (sync.status !== 0) {
  process.exit(sync.status ?? 1);
}

process.env.PREVIEW = name;
await build({
  configFile: join(dashboard, "preview", "vite.config.ts"),
  logLevel: "warn",
});
console.log(`built ${join(dashboard, "preview", name, "out")}`);
