/**
 * The design harness's build (design-explore skill): one entry,
 * `harness/<name>/index.html`, built to `dist-harness/<name>/` as a static
 * folder `artifact_create({ kind: "preview", dir })` serves. Relative
 * addresses, so the folder works wherever it is served from; Svelte's dev
 * build, so every element carries its source file and line for the
 * person's pins. The dashboard's own plugins, `#lib` and global CSS
 * (src/app.css, which holds tokens.css) make the components exactly the
 * app's. `HARNESS` names the entry (harness/build.ts sets it).
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

const dashboard = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * DialKit's Svelte root injects its sheet from a string
 * (dialkit/dist/svelte/theme-css.js, 2.0.2) that opens with an import of
 * Geist Mono from Google Fonts: a request off the preview's folder, which
 * the check fails. It is taken out where the module enters the build; the
 * dials' numbers fall back to the system monospace. A release that moves
 * the line fails the build here.
 */
const DIALKIT_SHEET = /[\\/]dialkit[\\/]dist[\\/]svelte[\\/]theme-css\.js$/;
const GOOGLE_FONT =
  /@import url\('https:\/\/fonts\.googleapis\.com\/[^']*'\);\n?/g;
const dialkitFontsOff = (): Plugin => ({
  name: "cawco-dialkit-fonts-off",
  enforce: "pre",
  transform(code, id) {
    if (!DIALKIT_SHEET.test(id)) {
      return null;
    }
    const found = code.match(GOOGLE_FONT)?.length ?? 0;
    if (found !== 1) {
      throw new Error(
        `DialKit's Google Fonts import was found ${found} times in ${id}, expected once: update dialkitFontsOff`
      );
    }
    return code.replace(GOOGLE_FONT, "");
  },
});
const name = process.env.HARNESS;
if (!name) {
  throw new Error("HARNESS names the entry to build: bun run harness <name>.");
}

export default defineConfig({
  root: join(dashboard, "harness", name),
  base: "./",
  // Development: vite-plugin-svelte keeps `dev` (the pins' file:line) only
  // outside production.
  mode: "development",
  plugins: [
    calendarThemeOff(),
    streamdownOverlayOwn(),
    dialkitFontsOff(),
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
    ],
  },
  build: {
    outDir: join(dashboard, "dist-harness", name),
    emptyOutDir: true,
    cssTarget: CSS_TARGET,
    assetsInlineLimit: (file) => INLINE_FACES.test(file) || undefined,
    // The preload polyfill fetches; the guard (guard.ts) refuses every fetch.
    modulePreload: { polyfill: false },
  },
});
