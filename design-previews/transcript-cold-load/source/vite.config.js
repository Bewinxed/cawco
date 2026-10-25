import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Built into the folder above (design-previews/transcript-cold-load), which
// any static server serves as it is: `index.html` and `assets/`.
export default defineConfig({
  base: "./",
  plugins: [svelte()],
  build: { outDir: "..", emptyOutDir: false, assetsDir: "assets" },
});
