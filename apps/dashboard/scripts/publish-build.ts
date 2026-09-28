/**
 * adapter-node writes into `.build-next` (svelte.config.js), because it empties
 * its output directory first and the running server serves `build/`. Once the
 * build is complete it is swapped in with two renames on the same filesystem,
 * so `build/` is always a whole build: the old one or the new one.
 */
import { rename, rm } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const build = new URL("build", root);
const next = new URL(".build-next", root);
const old = new URL(".build-old", root);

await rm(old, { recursive: true, force: true });
await rename(build, old).catch((error) => {
  if (error.code !== "ENOENT") {
    throw error;
  }
});
await rename(next, build);
await rm(old, { recursive: true, force: true });
