/**
 * A process with the hub's loop watch on (hub hub-loop.ts `watchHubLoop`),
 * for specs/hub-loop-ends.ts:
 *
 *   bun scripts/probe-kit/hub-loop-child.ts <record> <end ms> microtasks|sync
 *       names its work, then holds its loop for good: in a loop of
 *       microtasks that never yields (the hub's of 2026-11-04), or in a
 *       synchronous loop;
 *   bun scripts/probe-kit/hub-loop-child.ts <record> <end ms> after
 *       starts the watch as the next hub does, says what the record kept,
 *       and exits 0.
 */
import { doing } from "../../packages/core/src/loop-watch";
import { watchHubLoop } from "../../packages/hub/src/hub-loop";

const [record, endArg, mode] = process.argv.slice(2);
if (!(record && endArg && mode)) {
  throw new Error(
    "usage: hub-loop-child.ts <record> <end ms> microtasks|sync|after"
  );
}

/** The work this process names before it holds its loop. */
const CHILD_DOING = `probe hold: ${mode}`;

const stop = watchHubLoop(record, Number(endArg));
if (mode === "after") {
  stop();
  process.exit(0);
}
// A beat or two first, so the watch has the loop's own beat to age.
await Bun.sleep(1000);
doing(CHILD_DOING);
console.error(`child ${process.pid}: holding its loop (${mode})`);
if (mode === "sync") {
  const sums = [0];
  for (;;) {
    sums[0] = (sums[0] ?? 0) + Number(JSON.parse('{"a":1}').a);
  }
}
const step = async (): Promise<number> => await Promise.resolve(1);
for (;;) {
  await step();
}
