/**
 * A design preview's build (design-explore skill): one page,
 * `preview/<name>/index.html`, built to `preview/<name>/out/` as a static
 * folder `artifact_create({ kind: "preview", dir })` serves. Relative
 * addresses, so the folder works wherever it is served from. The
 * dashboard's own plugins, `#lib` and global CSS (src/app.css, which holds
 * tokens.css) make the components exactly the app's. `PREVIEW` names the
 * page (preview/build.ts sets it).
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
  proseNotByClass,
  streamdownOverlayOwn,
} from "../vite.config.ts";

const dashboard = join(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.env.PREVIEW;
if (!name) {
  throw new Error(
    "PREVIEW names the page to build: bun preview/build.ts <name>."
  );
}

export default defineConfig({
  root: join(dashboard, "preview", name),
  base: "./",
  define: { __CAWCO_COMMIT__: JSON.stringify("preview") },
  plugins: [
    calendarThemeOff(),
    streamdownOverlayOwn(),
    tailwindcss(),
    proseNotByClass(),
    svelte({
      configFile: false,
      preprocess: vitePreprocess(),
      compilerOptions: { experimental: { async: true } },
    }),
    Icons({ compiler: "svelte" }),
  ],
  resolve: {
    alias: [
      { find: /^#lib$/, replacement: join(dashboard, "src/lib/index.js") },
      { find: /^#lib\/(.*)$/, replacement: join(dashboard, "src/lib/$1") },
      { find: /^\$lib\/(.*)$/, replacement: join(dashboard, "src/lib/$1") },
      // SvelteKit's modules, which only its plugin provides: the one page a
      // preview is (preview/app/).
      {
        find: /^\$app\/env$/,
        replacement: join(dashboard, "preview/app/env.ts"),
      },
      {
        find: /^\$app\/navigation$/,
        replacement: join(dashboard, "preview/app/navigation.ts"),
      },
      {
        find: /^\$app\/state$/,
        replacement: join(dashboard, "preview/app/state.svelte.ts"),
      },
    ],
  },
  build: {
    outDir: join(dashboard, "preview", name, "out"),
    emptyOutDir: true,
    cssTarget: CSS_TARGET,
    assetsInlineLimit: (file) => INLINE_FACES.test(file) || undefined,
    modulePreload: { polyfill: false },
  },
});
