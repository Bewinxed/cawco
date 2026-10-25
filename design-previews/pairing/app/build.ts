/**
 * Builds the pairing preview into its folder as a static page:
 *
 *   bun design-previews/pairing/app/build.ts
 *
 * The page (app/index.html, main.js, preview.js) mounts Caw through the
 * dashboard's own component (Caw.svelte, drawn by Rive from
 * assets/mascot/caw/<status>.riv as the dashboard copies them), on the
 * dashboard's own stylesheet (app.css: its tokens, the house faces). Vite
 * and its plugins are the dashboard's, resolved from apps/dashboard, as the
 * suggestions preview builds. It writes `index.html` and `assets/` beside
 * `app/`, so the folder is served as it is
 * (`python3 -m http.server -d design-previews/pairing`). Generated; not
 * edited by hand.
 *
 * Caw.svelte names every status file the dashboard ships; the page shows
 * six of them, so the others are taken out of the built folder (the page
 * never fetches them).
 */
import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const HERE = import.meta.dir;
const OUT = resolve(HERE, "..");
const DASHBOARD = resolve(HERE, "../../../apps/dashboard");
/** The status files the page shows (preview.js `CAW`). */
const SHOWN = ["loading", "ready", "needs-you", "done", "sleeping", "reconnecting"];

/** A package as the dashboard resolves it. */
const fromDashboard = (pkg: string) => import(Bun.resolveSync(pkg, DASHBOARD));

const { build } = await fromDashboard("vite");
const { svelte, vitePreprocess } = await fromDashboard("@sveltejs/vite-plugin-svelte");
const tailwindcss = (await fromDashboard("@tailwindcss/vite")).default;
const Icons = (await fromDashboard("unplugin-icons/vite")).default;
const { writeHouseFaces } = await import(join(DASHBOARD, "scripts/house-faces.ts"));
const { groupsByCombinator, proseNotByClass } = await import(join(DASHBOARD, "vite.config.ts"));
const { CSS_TARGET } = await import(join(DASHBOARD, "../../packages/core/src/css-target.ts"));

// Every package the build reads resolves as the dashboard's own build reads it.
process.chdir(DASHBOARD);
// The dashboard's tsconfig extends the one `svelte-kit sync` writes; a fresh
// checkout has none, and the TypeScript transform refuses without it.
const sync = Bun.spawnSync([join(DASHBOARD, "node_modules/.bin/svelte-kit"), "sync"], {
  cwd: DASHBOARD,
  stdout: "inherit",
  stderr: "inherit",
});
if (sync.exitCode !== 0) {
  throw new Error(`svelte-kit sync exited ${sync.exitCode}`);
}
await writeHouseFaces();
await rm(join(OUT, "assets"), { recursive: true, force: true });
await rm(join(OUT, "index.html"), { force: true });

await build({
  configFile: false,
  root: HERE,
  base: "./",
  logLevel: "warn",
  plugins: [
    tailwindcss(),
    proseNotByClass(),
    groupsByCombinator(),
    svelte({
      preprocess: vitePreprocess(),
      compilerOptions: { experimental: { async: true } },
    }),
    Icons({ compiler: "svelte", collectionsNodeResolvePath: DASHBOARD }),
  ],
  resolve: {
    // `$app/env` is the one Kit module Caw reaches (the theme and the device ratio read `browser`).
    alias: [{ find: /^\$app\/env$/, replacement: join(HERE, "kit-env.js") }],
    dedupe: ["svelte"],
  },
  build: {
    outDir: OUT,
    emptyOutDir: false,
    assetsDir: "assets",
    cssTarget: CSS_TARGET,
    // Caw's files, the head's two faces and the house faces stand as files, never inlined.
    assetsInlineLimit: 0,
  },
});

const assets = join(OUT, "assets");
let dropped = 0;
for (const file of await readdir(assets)) {
  const status = /^(.+)-[\w-]{8}\.riv$/.exec(file)?.[1];
  if (status && !SHOWN.includes(status)) {
    await rm(join(assets, file));
    dropped += 1;
  }
}
console.log(`built the pairing preview into ${OUT} (${dropped} status files it never shows left out)`);
