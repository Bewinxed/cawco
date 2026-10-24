import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  // A linked workspace package forced into the pre-bundle, as the dashboard forces @cawco/icons: the stage serves it as source all the same.
  optimizeDeps: { include: ["@probe/marks"] },
});
