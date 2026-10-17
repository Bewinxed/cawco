/**
 * The design harness's build: one entry, `harness/<name>/index.html`, built
 * to `dist-harness/<name>/` as a static folder `artifact_create({ kind:
 * "preview", dir })` serves. Relative addresses, so the folder works
 * wherever it is served from; Svelte's dev build, so every element carries
 * its source file and line for the person's pins. The dashboard's own
 * plugins, `#lib` and global CSS (src/app.css, which holds tokens.css) make
 * the components exactly the app's. `HARNESS` names the entry
 * (harness/build.ts sets it).
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

const dashboard = join(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.env.HARNESS;
if (!name) {
  throw new Error("HARNESS names the entry to build: bun harness/build.ts <name>.");
}

export default defineConfig({
  root: join(dashboard, "harness", name),
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
      {
        find: /^\$app\/env$/,
        replacement: join(dashboard, "harness/app/env.ts"),
      },
      {
        find: /^\$app\/navigation$/,
        replacement: join(dashboard, "harness/app/navigation.ts"),
      },
      {
        find: /^\$app\/state$/,
        replacement: join(dashboard, "harness/app/state.svelte.ts"),
      },
    ],
  },
  build: {
    outDir: join(dashboard, "dist-harness", name),
    emptyOutDir: true,
    cssTarget: CSS_TARGET,
    assetsInlineLimit: (file) => INLINE_FACES.test(file) || undefined,
    modulePreload: { polyfill: false },
  },
});
