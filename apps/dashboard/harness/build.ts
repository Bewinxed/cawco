/**
 * `bun harness/build.ts <name>`: builds harness/<name>/ to
 * dist-harness/<name>/ (harness/vite.config.ts), the folder
 * `artifact_create({ kind: "preview", name, dir })` shows.
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
    "usage: bun harness/build.ts <name>  (a folder under harness/)"
  );
  process.exit(2);
}
if (!existsSync(join(dashboard, "harness", name, "index.html"))) {
  console.error(`harness/${name}/index.html does not exist.`);
  process.exit(2);
}

const sync = spawnSync("bunx", ["svelte-kit", "sync"], {
  cwd: dashboard,
  stdio: "inherit",
});
if (sync.status !== 0) {
  process.exit(sync.status ?? 1);
}

process.env.HARNESS = name;
process.env.NODE_ENV = "development";
await build({
  configFile: join(dashboard, "harness", "vite.config.ts"),
  logLevel: "warn",
});
console.log(`built ${join(dashboard, "dist-harness", name)}`);
