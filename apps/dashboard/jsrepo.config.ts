import { defineConfig } from "jsrepo";

export default defineConfig({
  // configure where stuff comes from here
  registries: ["@ieedan/shadcn-svelte-extras"],
  // configure were stuff goes here
  paths: {
    ui: "src/lib/components/ui",
    block: "src/lib/components",
    hook: "src/lib/hooks",
    action: "src/lib/actions",
    util: "src/lib/utils",
    lib: "src/lib",
  },
});
