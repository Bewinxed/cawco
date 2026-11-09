import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/fts5.ts", "src/worker.ts"],
  dts: true,
  format: "esm",
  platform: "neutral",
  external: ["bun:sqlite", "node:fs", "node:fs/promises", "node:path"],
});
