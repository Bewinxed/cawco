/**
 * `bun scripts/probe-kit/run.ts journeys [name…] [--engine …] [--size …]`:
 * each journey here (`j<n>-<name>.ts`), or those named, through the kit
 * (suite.ts). Prints one line per leg and `ALL PASS` or `N FAILED`; its
 * answer is the process's exit code.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { sweepDeadFleets } from "../../scratch-fleet";
import { Run } from "../kit";
import { type Journey, journeySpec, parse } from "./suite";

const JOURNEY_FILE = /^j(\d+)-.+\.ts$/;

/** A journey file's number: j2 runs before j10. */
const numberOf = (name: string) => Number(JOURNEY_FILE.exec(`${name}.ts`)?.[1]);

export async function runJourneys(rest: string[]): Promise<number> {
  const { names, narrow } = parse(rest);
  const written = readdirSync(import.meta.dir)
    .filter((file) => JOURNEY_FILE.test(file))
    .map((file) => file.slice(0, -3))
    .sort((a, b) => numberOf(a) - numberOf(b));
  const unknown = names.filter((one) => !written.includes(one));
  if (unknown.length > 0) {
    console.error(
      `no such journey: ${unknown.join(", ")} (have ${written.join(", ")})`
    );
    return 2;
  }
  const chosen = names.length > 0 ? names : written;
  const started = performance.now();
  const swept = await sweepDeadFleets();
  if (swept.length > 0) {
    console.log(
      `… removed ${swept.length} folder(s) of scratch fleets that died: ${swept.join(", ")}`
    );
  }
  const run = new Run();
  try {
    for (const name of chosen) {
      // biome-ignore lint/performance/noAwaitInLoops: one journey at a time, each with the machine to itself
      const journey = (await import(join(import.meta.dir, `${name}.ts`)))
        .default as Journey;
      console.log(`… ${journey.name}: ${journey.flow}`);
      await run.spec(journeySpec(journey, narrow), null);
    }
  } finally {
    await run.close();
  }
  const minutes = ((performance.now() - started) / 60_000).toFixed(1);
  if (run.failed.length > 0) {
    console.log(`FAILED LEGS:\n${run.failed.join("\n")}`);
  }
  console.log(
    run.failures === 0
      ? `ALL PASS (${chosen.length} journeys, ${minutes} min)`
      : `${run.failures} FAILED (${chosen.length} journeys, ${minutes} min)`
  );
  return run.failures === 0 ? 0 : 1;
}
