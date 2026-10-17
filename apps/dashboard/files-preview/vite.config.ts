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
import { defineConfig } from "vite";
import {
  CSS_TARGET,
  calendarThemeOff,
  INLINE_FACES,
  streamdownOverlayOwn,
} from "../vite.config.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dashboard = join(here, "..");

export default defineConfig({
  root: here,
  base: "./",
  mode: "development",
  plugins: [
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
      { find: /^\$app\/state$/, replacement: join(here, "app/state.svelte.ts") },
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
