/**
 * The commenting pick page's drawings: one Svelte app that mounts the
 * dashboard's real kit (Button, the fluid-tabs segmented control, Popover,
 * Input, Textarea, the chip recipe, the transcript's Turn, Who and Well) on
 * the house design layer, one scene per `?scene=` (src/scenes.ts). Built with
 * the dashboard's own toolchain: `node_modules` here is a link to the
 * dashboard's, made by scripts/build.sh for the build and removed after.
 */
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";

const here = import.meta.dirname;

export default defineConfig({
  root: here,
  base: "./",
  plugins: [
    tailwindcss(),
    svelte({
      preprocess: vitePreprocess(),
      compilerOptions: { experimental: { async: true } },
    }),
    Icons({ compiler: "svelte" }),
  ],
  resolve: {
    dedupe: ["bits-ui", "svelte"],
    // The kit's Popover reads SvelteKit's `browser`; this app is only ever a browser page.
    alias: [
      { find: "$app/env", replacement: `${here}/src/stub/env.ts` },
      // The chat composer reaches the app's client, which reads where the page is and can navigate.
      { find: "$app/state", replacement: `${here}/src/stub/state.ts` },
      { find: "$app/navigation", replacement: `${here}/src/stub/navigation.ts` },
      // The dashboard's lib, by the name the drawings import it under.
      {
        find: /^\$kit\//,
        replacement: `${here}/../../../apps/dashboard/src/lib/`,
      },
      // The dashboard's own import map (its package.json `imports`), which its parts import each other by.
      {
        find: /^#lib\//,
        replacement: `${here}/../../../apps/dashboard/src/lib/`,
      },
      {
        find: /^#lib$/,
        replacement: `${here}/../../../apps/dashboard/src/lib/index.js`,
      },
    ],
  },
  build: { outDir: "dist", emptyOutDir: true, target: "esnext" },
});
