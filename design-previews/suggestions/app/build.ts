/**
 * Builds the suggestions preview into its folder as a static page:
 *
 *   bun design-previews/suggestions/app/build.ts
 *
 * The page (app/index.html, main.js, Preview.svelte) is the dashboard's own
 * components live: Suggestions, StarterCards, the kit's fluid tabs and its
 * segmented toggle group, on the dashboard's own stylesheet (app.css, with
 * the two rewrites the dashboard's build makes of it). Vite and its plugins
 * are the dashboard's, resolved from apps/dashboard; the house faces are
 * written first, as the dashboard's build writes them. It writes
 * `index.html` and `assets/` beside `caw/`, so the folder is served as it is
 * (`python3 -m http.server -d design-previews/suggestions`). Generated; not
 * edited by hand.
 */
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const HERE = import.meta.dir;
const OUT = resolve(HERE, "..");
const DASHBOARD = resolve(HERE, "../../../apps/dashboard");

/** A package as the dashboard resolves it. */
const fromDashboard = (pkg: string) => import(Bun.resolveSync(pkg, DASHBOARD));

const { build } = await fromDashboard("vite");
const { svelte, vitePreprocess } = await fromDashboard(
  "@sveltejs/vite-plugin-svelte"
);
const tailwindcss = (await fromDashboard("@tailwindcss/vite")).default;
const Icons = (await fromDashboard("unplugin-icons/vite")).default;
const { writeHouseFaces } = await import(
  join(DASHBOARD, "scripts/house-faces.ts")
);
const { groupsByCombinator, proseNotByClass } = await import(
  join(DASHBOARD, "vite.config.ts")
);
const { CSS_TARGET } = await import(
  join(DASHBOARD, "../../packages/core/src/css-target.ts")
);

// Every package the build reads resolves as the dashboard's own build reads it.
process.chdir(DASHBOARD);
await writeHouseFaces();
await rm(join(OUT, "assets"), { recursive: true, force: true });
await rm(join(OUT, "index.html"), { force: true });

const config = {
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
    // The icon sets as the dashboard installs them.
    Icons({ compiler: "svelte", collectionsNodeResolvePath: DASHBOARD }),
  ],
  resolve: { dedupe: ["bits-ui", "svelte"] },
  build: {
    outDir: OUT,
    emptyOutDir: false,
    assetsDir: "assets",
    cssTarget: CSS_TARGET,
    // The faces stand as files beside the sheet, never inlined.
    assetsInlineLimit: 0,
  },
};
await build(config);
console.log(`built the suggestions preview into ${OUT}`);
