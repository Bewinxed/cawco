/**
 * `bun run harness <name>`: builds harness/<name>/ to dist-harness/<name>/
 * (harness/vite.config.ts) and checks it with the design-explore skill's
 * check (scripts/check.mjs): every entry at desktop and phone size, no
 * request off the folder, nothing over the stage. The folder is then what
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
  console.error("usage: bun run harness <name>  (a folder under harness/)");
  process.exit(2);
}
if (!existsSync(join(dashboard, "harness", name, "index.html"))) {
  console.error(`harness/${name}/index.html does not exist.`);
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

process.env.HARNESS = name;
// A development build: vite-plugin-svelte keeps Svelte's `dev` output, the
// pins' file:line, only where NODE_ENV is not production.
process.env.NODE_ENV = "development";
await build({
  configFile: join(dashboard, "harness", "vite.config.ts"),
  logLevel: "warn",
});
const out = join(dashboard, "dist-harness", name);
console.log(`built ${out}`);

const check = spawnSync(
  "node",
  [
    join(
      dashboard,
      "../../packages/hub/skills/design-explore/scripts/check.mjs"
    ),
    out,
  ],
  { cwd: dashboard, stdio: "inherit" }
);
process.exit(check.status ?? 1);
