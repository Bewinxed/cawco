/**
 * The Files panel's design preview: one static folder (`dist/`) the hub
 * serves with `artifact_create({ kind: "preview", dir })`. Relative
 * addresses so it works wherever it is served from; Svelte's dev output so
 * every element carries its source file and line for pins. The dashboard's
 * own plugins, `#lib` and app.css make the mounted components the app's.
 * Restored from the harness a16e93238 removed, cut to this one entry.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig, type Plugin } from "vite";
import {
  CSS_TARGET,
  calendarThemeOff,
  INLINE_FACES,
  streamdownOverlayOwn,
} from "../vite.config.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dashboard = join(here, "..");

/** The bar's own items, which read the fleet from the hub's client. */
const READERS = ["MachinesButton.svelte", "NeedsCaw.svelte"].map((file) =>
  join(dashboard, "src/lib/cawco", file)
);
const FLEET = new Set([
  "./client.svelte",
  "./home/home-state.svelte",
  "./home/caw-notices.svelte",
]);

/**
 * The page's fleet for the bar's own items (stand-ins/fleet.ts): what
 * MachinesButton and NeedsCaw import of the fleet resolves there, and
 * nothing else does, so both components mount untouched with no hub.
 */
function standIns(): Plugin {
  return {
    name: "files-preview-stand-ins",
    enforce: "pre",
    resolveId(source, importer) {
      const from = importer?.split("?")[0];
      return from && READERS.includes(from) && FLEET.has(source)
        ? join(here, "stand-ins/fleet.ts")
        : null;
    },
  };
}

export default defineConfig({
  root: here,
  base: "./",
  mode: "development",
  plugins: [
    standIns(),
    calendarThemeOff(),
    streamdownOverlayOwn(),
    tailwindcss(),
    svelte({
      configFile: false,
      preprocess: vitePreprocess(),
      compilerOptions: { dev: true, experimental: { async: true } },
    }),
    Icons({ compiler: "svelte" }),
  ],
  resolve: {
    alias: [
      { find: /^#lib$/, replacement: join(dashboard, "src/lib/index.js") },
      { find: /^#lib\/(.*)$/, replacement: join(dashboard, "src/lib/$1") },
      { find: /^\$app\/env$/, replacement: join(here, "app/env.ts") },
      {
        find: /^\$app\/navigation$/,
        replacement: join(here, "app/navigation.ts"),
      },
      {
        find: /^\$app\/state$/,
        replacement: join(here, "app/state.svelte.ts"),
      },
    ],
  },
  build: {
    outDir: join(here, "dist"),
    emptyOutDir: true,
    cssTarget: CSS_TARGET,
    assetsInlineLimit: (file) => INLINE_FACES.test(file) || undefined,
    modulePreload: { polyfill: false },
  },
});
