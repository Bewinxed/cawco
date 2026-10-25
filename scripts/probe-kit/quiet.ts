/**
 * A timing leg counts only while the MACHINE is quiet: the whole machine's
 * CPU and memory contention (core machine-room.ts `machineGauge`: on Linux
 * PSI `/proc/pressure/cpu` and `/proc/pressure/memory`, "some" avg10, the
 * share of the last 10 s in which some task anywhere waited; on macOS the
 * 5 s run queue beyond the CPUs and the kernel's memory pressure level)
 * under the gauge's limits at the leg's start, middle and end.
 *
 * Before 2026-10-19 a leg read its own cgroup's `cpu.pressure`, which counts
 * only its own tasks' waits: tab-return's wait read "PSI some avg10 0.14 /
 * 0.08 / 0.04" while the machine's load was 25 to 30, and its pointer
 * budgets then missed at load 24 to 43, the same 555 elements taking 24 ms of
 * style against 10 to 14 on a quiet machine.
 *
 * A leg read over the limit is void and measured again (`LEG_TRIES`); each
 * leg's line names the files it read, each value at start, middle and end,
 * the try kept, its wait, and the load average beside them for reference.
 * A reading that cannot be taken stops the spec: there is no other gate.
 */
import { loadavg } from "node:os";
import {
  type MachinePressure,
  machineGauge,
  machinePressure,
} from "../../packages/core/src/machine-room";

/** How often the pressure is read while waiting for it to fall. */
const POLL_MS = 5000;
/** The longest a leg waits for the machine to fall quiet before it is measured as it stands. */
const WAIT_MS = 20 * 60_000;
/** How often the pressure is read while a leg runs (its middle is the middle reading). */
const LEG_SAMPLE_MS = 1000;
/** How many times a leg read over the limit is measured again. */
const LEG_TRIES = 3;

/** The machine's pressure now; throws, naming what it reads, when it cannot be read. */
export const machineQuiet = (): MachinePressure => {
  let gauge: ReturnType<typeof machineGauge> | undefined;
  try {
    gauge = machineGauge();
    return machinePressure();
  } catch (error) {
    throw new Error(
      `the machine's pressure (${gauge ? `${gauge.cpu}; ${gauge.memory}` : process.platform}) cannot be read (${error instanceof Error ? error.message : String(error)}); a timing leg measures nothing without it`,
      { cause: error }
    );
  }
};

const isQuiet = (reading: MachinePressure): boolean => {
  const { limit } = machineGauge();
  return reading.cpu < limit.cpu && reading.memory < limit.memory;
};

/** The reading in words: what each value reads, and each value. */
export const quietWords = (reading: MachinePressure): string => {
  const gauge = machineGauge();
  return `cpu ${reading.cpu} by ${gauge.cpu}, memory ${reading.memory} by ${gauge.memory}`;
};

/** The box's 1-minute load average, said beside the pressure for reference only. */
const oneMinuteLoad = (): string => (loadavg()[0] ?? 0).toFixed(2);

/** Waits for the machine to fall quiet, at most `waitMs`; how long it waited, from what. */
async function untilQuiet(waitMs: number): Promise<string> {
  const began = Date.now();
  const first = machineQuiet();
  let reading = first;
  while (!isQuiet(reading) && Date.now() - began < waitMs) {
    // biome-ignore lint/performance/noAwaitInLoops: one reading per poll until the machine is quiet
    await Bun.sleep(POLL_MS);
    reading = machineQuiet();
  }
  return `waited ${((Date.now() - began) / 1000).toFixed(0)}s from ${quietWords(first)}`;
}

/**
 * Runs a leg once the machine is quiet, reading its pressure each second
 * while it runs, and again (up to `tries`) when its start, middle or end
 * reading was at the gauge's limit or more on either: a contended leg is void.
 * Answers the kept try's line, as it also prints it.
 */
export async function quietLeg(
  name: string,
  run: () => Promise<void>,
  options: { tries?: number; waitMs?: number } = {}
): Promise<string> {
  const tries = options.tries ?? LEG_TRIES;
  let said = "";
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a leg's tries run one after another
    const waited = await untilQuiet(options.waitMs ?? WAIT_MS);
    const readings: MachinePressure[] = [machineQuiet()];
    const loadAt = oneMinuteLoad();
    const sampler = setInterval(
      () => readings.push(machineQuiet()),
      LEG_SAMPLE_MS
    );
    try {
      await run();
    } finally {
      clearInterval(sampler);
    }
    readings.push(machineQuiet());
    const marks = [
      readings[0],
      readings[Math.floor(readings.length / 2)],
      readings.at(-1),
    ].filter((one): one is MachinePressure => one !== undefined);
    const quiet = marks.every(isQuiet);
    const gauge = machineGauge();
    said = `machine pressure, cpu ${marks.map((one) => one.cpu).join(" / ")}, memory ${marks.map((one) => one.memory).join(" / ")} (${gauge.cpu}; ${gauge.memory}; start / middle / end), try ${attempt} (${waited}), load ${loadAt}–${oneMinuteLoad()} for reference${quiet ? "" : `, CONTENDED (cpu ${gauge.limit.cpu} or more, or memory ${gauge.limit.memory} or more)`}`;
    console.log(`  ${name}: ${said}`);
    if (quiet) {
      break;
    }
  }
  return said;
}
