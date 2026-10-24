/**
 * The word-address flow's design preview, built into one static page at
 * design-previews/address/ (the repository's root): the flow drawn from the
 * dashboard's own components, in the dashboard's own stylesheet (app.css,
 * its tokens and the house faces), with no SvelteKit around it.
 *
 *   bun apps/dashboard/scripts/house-faces.ts
 *   cd apps/dashboard && bunx vite build --config scripts/address-preview.vite.ts
 *
 * It stands here, with the dashboard's other build scripts, rather than in
 * the flow's folder: under src/ its Node and Vite types would join the
 * Svelte project's and change what `fetch` and `Event` are there.
 *
 * `$app/env` is the one Kit module the components it mounts reach (the
 * theme reads `browser`); a page with no server is always in the browser.
 */
import { fileURLToPath } from "node:url";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";

const here = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("../src/lib/cawco/address/flow"),
  base: "./",
  // The README rides into the built folder beside the page.
  publicDir: here("../src/lib/cawco/address/flow/public"),
  plugins: [
    tailwindcss(),
    svelte({
      preprocess: vitePreprocess(),
      compilerOptions: { experimental: { async: true } },
    }),
    Icons({ compiler: "svelte" }),
  ],
  resolve: {
    alias: [
      {
        find: /^\$app\/env$/,
        replacement: here("../src/lib/cawco/address/flow/kit-env.ts"),
      },
    ],
    dedupe: ["bits-ui"],
  },
  build: {
    outDir: here("../../../design-previews/address"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
