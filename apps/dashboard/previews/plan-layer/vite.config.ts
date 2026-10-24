/**
 * The plan layer preview's build: a static folder (`page/`) drawn from the
 * dashboard's real components and its real stylesheet (app.css, Tailwind
 * over the dashboard's sources and these), opened as a folder preview. Like
 * `smoke/`, it is a page of the dashboard's package, so every import
 * resolves as it does in the app (`#lib` through the package's `imports`).
 *
 *   cd apps/dashboard && bunx vite build -c previews/plan-layer/vite.config.ts
 */
import { join } from "node:path";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig, type Plugin } from "vite";
import { writeHouseFaces } from "../../scripts/house-faces.ts";

const HERE = import.meta.dirname;

/** The house faces app.css imports, cut as the dashboard's build cuts them. */
const houseFaces = (): Plugin => ({
  name: "cawco:preview-house-faces",
  async config() {
    await writeHouseFaces();
  },
});

export default defineConfig({
  root: join(HERE, "src"),
  base: "./",
  publicDir: false,
  plugins: [
    houseFaces(),
    tailwindcss(),
    svelte({
      preprocess: vitePreprocess(),
      compilerOptions: { experimental: { async: true } },
    }),
    Icons({ compiler: "svelte" }),
  ],
  resolve: {
    alias: [
      // The kit's components ask SvelteKit whether they run in a browser;
      // the client's own module reads Kit's page payload, which a page
      // outside Kit has none of, so this page answers for itself.
      { find: /^\$app\/env$/, replacement: join(HERE, "src/app-env.ts") },
    ],
    dedupe: ["svelte", "bits-ui"],
  },
  build: {
    outDir: join(HERE, "page"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: join(HERE, "src/index.html"),
        stage: join(HERE, "src/stage.html"),
      },
    },
  },
});
