/**
 * adapter-node writes into `.build-next` (vite.config.ts `BUILD_OUT`), because it empties
 * its output directory first and the running server serves `build/`. Once the
 * build is complete it is swapped in with two renames on the same filesystem,
 * so `build/` is always a whole build: the old one or the new one.
 *
 * The build it replaces stays as `.build-old` until the next publish: a tab
 * still holding the old pages asks for the old hashed assets, and serve.js
 * answers them from there instead of with a 404 (a stylesheet that 404s
 * leaves the page unstyled).
 *
 * The precompressed siblings are written inside the build, where adapter-node
 * records them (precompress-adapter.ts), never here.
 */
import { rename, rm, stat } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const build = new URL("build", root);
const next = new URL(".build-next", root);
const old = new URL(".build-old", root);

if (!(await stat(next).catch(() => undefined))?.isDirectory()) {
  console.error(
    `No build to publish: ${next.pathname} does not exist. Run \`vite build\` first; build/ is untouched.`
  );
  process.exit(1);
}
await rm(old, { recursive: true, force: true });
await rename(build, old).catch((error) => {
  if (error.code !== "ENOENT") {
    throw error;
  }
});
await rename(next, build);
