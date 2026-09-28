import { execFileSync } from "node:child_process";
import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: ".build-next" }),
    alias: {
      $lib: "./src/lib",
      "$lib/*": "./src/lib/*",
      "@/*": "./src/lib/*",
    },
    experimental: {
      remoteFunctions: true,
    },
    /* The commit this build was made from. The build serves it as
       `_app/version.json` and bakes it into the page, and `updated.check()`
       compares the two: that is how a tab learns it is older than the
       dashboard now serving it (deploy-toast.ts). It must be deterministic,
       or two builds of one commit would each tell open tabs to reload. */
    version: {
      name: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        encoding: "utf8",
      }).trim(),
    },
  },
  compilerOptions: {
    experimental: {
      async: true,
    },
  },
};

export default config;
