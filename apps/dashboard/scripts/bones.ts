/**
 * Captures the kit's skeletons (SkeletonOf) at build time: starts this
 * dashboard's `vite dev` on a free port, runs boneyard's CLI
 * (`boneyard-js build`, https://boneyard.vercel.app/cli) on /dev/bones,
 * where every SkeletonOf draws its fixture, and stops the server. boneyard
 * opens the page in Playwright's headless Chromium at each breakpoint of
 * boneyard.config.json and writes each skeleton's bones and the registry
 * SkeletonOf imports to src/lib/components/ui/skeleton/bones/, which are
 * committed. A skeleton whose fixture drew the same markup as last time is
 * kept as it was; `--force` captures every one again.
 *
 *   bun run bones            (from apps/dashboard)
 *   bun run bones --force
 *
 * Playwright's Chromium is installed once with `bunx playwright install
 * chromium`.
 */

import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const cli = fileURLToPath(
  new URL("bin/cli.js", import.meta.resolve("boneyard-js/package.json"))
);

const server = await createServer({
  configFile: `${root}vite.config.ts`,
  root,
  logLevel: "warn",
  server: { port: 0, strictPort: false, host: "127.0.0.1" },
});
await server.listen();
const origin = server.resolvedUrls?.local[0];
if (!origin) {
  await server.close();
  throw new Error("vite dev started but named no local address");
}

try {
  const capture = Bun.spawn(
    [
      process.execPath,
      cli,
      "build",
      new URL("dev/bones", origin).href,
      ...process.argv.slice(2),
    ],
    { cwd: root, env: process.env, stdio: ["inherit", "inherit", "inherit"] }
  );
  const code = await capture.exited;
  if (code !== 0) {
    throw new Error(`boneyard-js build ended with ${code}`);
  }
} finally {
  await server.close();
}
