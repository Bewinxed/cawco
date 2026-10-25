/**
 * Caw's rig preview, built into one static page at design-previews/caw-rig/
 * (the repository's root): the rig's own component (CawRig.svelte) in the
 * dashboard's own stylesheet, with no SvelteKit around it.
 *
 *   bun apps/dashboard/scripts/house-faces.ts
 *   cd apps/dashboard && bunx vite build --config scripts/caw-rig-preview.vite.ts
 *
 * It stands with the dashboard's other build scripts rather than in the
 * rig's folder: under src/ its Node and Vite types would join the Svelte
 * project's. `$app/env` is the one Kit module the page reaches (the theme
 * reads `browser`); a page with no server is always in the browser.
 */
import { fileURLToPath } from "node:url";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";

const here = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("../src/lib/cawco/caw-rig/preview"),
  base: "./",
  // The README and the still he is cut from ride into the built folder beside the page.
  publicDir: here("../src/lib/cawco/caw-rig/preview/public"),
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
        replacement: here("../src/lib/cawco/caw-rig/preview/kit-env.ts"),
      },
    ],
    dedupe: ["bits-ui"],
  },
  build: {
    outDir: here("../../../design-previews/caw-rig"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
