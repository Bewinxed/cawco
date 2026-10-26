/**
 * The merge check on the bundles Bun builds at runtime for a
 * browser: the canvas host, the decision host (whose dashboard components'
 * styles Lightning CSS compiles, core page-css.ts), the preview overlay and
 * the stage host. Each is built as the hub builds it, and each builder
 * refuses a `light-dark()` Bun lowered to switch variables nothing sets
 * (core bundle-css-guard.ts): a stylesheet that reached Bun's CSS bundler
 * again stops here instead of drawing transparent on the canvas.
 *
 *   bun scripts/runtime-bundles-check.ts
 */
import { buildStageHost } from "../packages/agent/src/stage-host/build";
import { buildCanvasHost } from "../packages/core/src/canvas-host";
import { buildDecisionHost } from "../packages/core/src/decision-host";
import { loadOverlay } from "../packages/core/src/preview-proxy";

const started = performance.now();
const bundles = {
  "canvas host": buildCanvasHost,
  "decision host": buildDecisionHost,
  "preview overlay": loadOverlay,
  "stage host": buildStageHost,
} as const;
const failed: string[] = [];
for (const [name, build] of Object.entries(bundles)) {
  try {
    await build();
  } catch (error) {
    failed.push(
      `${name}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
const seconds = ((performance.now() - started) / 1000).toFixed(1);
if (failed.length > 0) {
  console.error(
    `runtime-bundles:check: ${failed.length} of ${Object.keys(bundles).length} bundle(s) failed (${seconds}s)\n${failed.join("\n\n")}`
  );
  process.exit(1);
}
console.log(
  `runtime-bundles:check: ${Object.keys(bundles).length} bundles built, no lowered light-dark() (${seconds}s)`
);
