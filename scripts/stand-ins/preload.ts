/**
 * Preloaded by every service a scratch fleet starts (scratch-fleet.ts
 * `serviceSpawn`), beside the leash: each product module named here is
 * loaded as this folder's stand-in for it, which reads the fleet's
 * stand-ins (index.ts). A module of the product's own that only states a
 * value is the one way a probe reaches in; no environment variable or route
 * of the product does.
 */
import { join } from "node:path";
import { plugin } from "bun";

/** Each product module's path, and the stand-in loaded in its place. */
const IN_PLACE: [RegExp, string][] = [
  [/packages\/hub\/src\/upstreams\.ts$/u, "hub-upstreams.ts"],
  [/packages\/core\/src\/canvas-host-plugins\.ts$/u, "canvas-host-plugins.ts"],
];

plugin({
  name: "scratch-fleet-stand-ins",
  setup(build) {
    for (const [filter, file] of IN_PLACE) {
      build.onLoad({ filter }, () => ({
        contents: `export * from ${JSON.stringify(join(import.meta.dir, file))};`,
        loader: "ts",
      }));
    }
  },
});
