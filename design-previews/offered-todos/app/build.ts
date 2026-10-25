/**
 * Builds the offered to-dos preview into its folder as a static page:
 *
 *   bun design-previews/offered-todos/app/build.ts
 *
 * The page (app/index.html, main.js, Preview.svelte) is the dashboard's own
 * components live: the branch's TodoList and TaskCard, and Today's two
 * TodoLists (app/today/, copied from git), on the dashboard's own
 * stylesheet. Vite and its plugins are the dashboard's, resolved from
 * apps/dashboard; the house faces are written first, as the dashboard's
 * build writes them. Today's copies name the dashboard's modules by its
 * `#lib` and `@cawco/` imports, resolved here as the dashboard's package
 * resolves them, and SvelteKit's `$app/env`, `$app/navigation` and
 * `$app/state` are app-env.js, app-navigation.js and app-state.js (the
 * page is no SvelteKit app). It writes `index.html` and
 * `assets/` beside `app/`, so the folder is served as it is
 * (`python3 -m http.server -d design-previews/offered-todos`). Generated;
 * not edited by hand.
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
    // Caw's Rive art and runtime, which the card's fleet store reaches
    // (home/Caw.svelte) and this page never draws or fetches: left out of
    // the folder (about 10MB), each named by an empty address.
    {
      name: "no-caw-art",
      enforce: "pre" as const,
      load: (id: string) =>
        /\.(riv|wasm)\?url$/.test(id) ? 'export default "";' : null,
    },
    // The workspace's packages, named from Today's copies, as the dashboard resolves them.
    {
      name: "cawco-from-dashboard",
      resolveId: (id: string) =>
        id.startsWith("@cawco/") ? Bun.resolveSync(id, DASHBOARD) : null,
    },
  ],
  resolve: {
    dedupe: ["bits-ui", "svelte"],
    alias: [
      { find: /^#lib\//, replacement: `${join(DASHBOARD, "src/lib")}/` },
      { find: /^#lib$/, replacement: join(DASHBOARD, "src/lib/index.js") },
      // SvelteKit's modules, which the card's fleet store reaches for.
      {
        find: /^\$app\/(env|navigation|state)$/,
        replacement: `${HERE}/app-$1.js`,
      },
    ],
  },
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
console.log(`built the offered to-dos preview into ${OUT}`);
