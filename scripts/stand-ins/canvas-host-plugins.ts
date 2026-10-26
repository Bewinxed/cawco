/**
 * packages/core/src/canvas-host-plugins.ts as a scratch fleet's hub has it
 * (preload.ts puts it in that module's place): the canvas page's bundle has
 * canvas-bound.ts in place of the page's `bindingMade`, so the page shows the
 * probe its binding.
 */
import { join } from "node:path";

const BOUND = /packages\/agent\/src\/canvas-host\/bound\.ts$/u;

export const HOST_PLUGINS: Bun.BunPlugin[] = [
  {
    name: "scratch-fleet-canvas-bound",
    setup(build) {
      build.onLoad({ filter: BOUND }, () => ({
        contents: `export * from ${JSON.stringify(join(import.meta.dir, "canvas-bound.ts"))};`,
        loader: "ts",
      }));
    },
  },
];
