/**
 * The comment-sizing preview's live card, built into one module at
 * design-previews/comment-sizing/live-card/ (the repository's root):
 * LiveCard, the dashboard's own PinFloat (its HangCard, its PinFoot), and the
 * dashboard's own stylesheet (app.css, its tokens and the house faces),
 * with no SvelteKit around it, so option A of the preview plays the
 * product's card and can never drift from it.
 *
 *   cd apps/dashboard && bunx vite build --config scripts/comment-card.vite.ts
 *
 * It stands here, with the address preview's config, rather than in the
 * preview's folder: the dashboard's own Vite and plugins build it.
 *
 * `$app/env` is the one Kit module the card's components reach (the
 * popover reads `browser`); a page with no server is always in the browser.
 */
import { fileURLToPath } from "node:url";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";

const here = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));
const live = (path: string): string =>
  here(`../../../design-previews/comment-sizing/live/${path}`);

export default defineConfig({
  root: live(""),
  base: "./",
  publicDir: false,
  plugins: [
    tailwindcss(),
    svelte({
      preprocess: vitePreprocess(),
      compilerOptions: { experimental: { async: true } },
    }),
    Icons({ compiler: "svelte" }),
  ],
  resolve: {
    alias: [{ find: /^\$app\/env$/, replacement: live("kit-env.js") }],
    dedupe: ["bits-ui", "svelte"],
  },
  build: {
    outDir: here("../../../design-previews/comment-sizing/live-card"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    minify: true,
    lib: {
      entry: live("entry.svelte.js"),
      formats: ["es"],
      fileName: () => "card.js",
      cssFileName: "card",
    },
  },
});
