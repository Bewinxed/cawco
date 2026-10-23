/**
 * The release as a graph of steps (release.ts): each step starts the moment
 * every step it comes after has ended, so everything that can run beside
 * something else does. `--dry-run` prints the same graph without running it
 * ({@link describeSteps}): what runs beside what, and the time each step is
 * expected to take, which gives the run's expected length (its critical path).
 */

export interface Step {
  /** The steps it starts after, by name. */
  after: string[];
  /** Seconds it is expected to take: from the nightly 4977 log and the measurements in its comment. */
  expect: number;
  name: string;
  run: () => Promise<void>;
}

/**
 * `steps` in an order that puts every step after those it comes after; an
 * unknown name or a cycle is a mistake in the graph, thrown.
 */
export const orderSteps = (steps: Step[]): Step[] => {
  const byName = new Map(steps.map((step) => [step.name, step]));
  if (byName.size !== steps.length) {
    throw new Error("Two release steps share a name");
  }
  const ordered: Step[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (step: Step, path: string[]): void => {
    const seen = state.get(step.name);
    if (seen === "done") {
      return;
    }
    if (seen === "visiting") {
      throw new Error(
        `The release steps loop: ${[...path, step.name].join(" → ")}`
      );
    }
    state.set(step.name, "visiting");
    for (const name of step.after) {
      const before = byName.get(name);
      if (!before) {
        throw new Error(
          `Release step ${step.name} comes after ${name}, which is no step`
        );
      }
      visit(before, [...path, step.name]);
    }
    state.set(step.name, "done");
    ordered.push(step);
  };
  for (const step of steps) {
    visit(step, []);
  }
  return ordered;
};

/** When each step is expected to start and end, in seconds from the run's start. */
const schedule = (
  ordered: Step[]
): Map<string, { end: number; start: number }> => {
  const times = new Map<string, { end: number; start: number }>();
  for (const step of ordered) {
    const start = Math.max(
      0,
      ...step.after.map((name) => times.get(name)?.end ?? 0)
    );
    times.set(step.name, { start, end: start + step.expect });
  }
  return times;
};

/**
 * The graph in words: each step with what it waits for and its expected
 * window; then the steps by wave (a wave's steps run at once, each starting
 * as soon as its own inputs are in); then the expected length and the path
 * that sets it.
 */
export const describeSteps = (steps: Step[]): string => {
  const ordered = orderSteps(steps);
  const times = schedule(ordered);
  const wave = new Map<string, number>();
  for (const step of ordered) {
    wave.set(
      step.name,
      1 + Math.max(0, ...step.after.map((name) => wave.get(name) ?? 0))
    );
  }
  const width = Math.max(...ordered.map((step) => step.name.length));
  const lines = ordered.map((step) => {
    const at = times.get(step.name);
    const window = at
      ? `${at.start.toFixed(0).padStart(4)}s → ${at.end.toFixed(0).padStart(4)}s`
      : "";
    return `  ${step.name.padEnd(width)}  ${window}  ${step.after.length > 0 ? `after ${step.after.join(", ")}` : "first"}`;
  });
  const waves = [...new Set(wave.values())].sort((a, b) => a - b);
  const waveLines = waves.map(
    (n) =>
      `  ${String(n).padStart(2)}: ${ordered
        .filter((step) => wave.get(step.name) === n)
        .map((step) => step.name)
        .join(" ‖ ")}`
  );
  const last = ordered.reduce((latest, step) =>
    (times.get(step.name)?.end ?? 0) > (times.get(latest.name)?.end ?? 0)
      ? step
      : latest
  );
  const critical: string[] = [];
  for (
    let step: Step | undefined = last;
    step;
    step = ordered.find(
      (before) =>
        step?.after.includes(before.name) &&
        times.get(before.name)?.end === times.get(step.name)?.start
    )
  ) {
    critical.unshift(step.name);
  }
  return [
    `${ordered.length} steps, each with its expected window (seconds from the start) and what it waits for:`,
    ...lines,
    "",
    "Waves (‖: at once; each step starts as soon as the steps it waits for end):",
    ...waveLines,
    "",
    `Expected: ${(times.get(last.name)?.end ?? 0).toFixed(0)} s, set by ${critical.join(" → ")}`,
  ].join("\n");
};

/**
 * Runs `steps`, each as soon as the steps it comes after have ended. The
 * first to fail calls `failed` once (which stops what is running) and no
 * step starts after it; that first error is thrown once every started step
 * has settled. `say` hears each step's start and end.
 */
export const runSteps = async (
  steps: Step[],
  hooks: {
    failed: (error: unknown) => Promise<void>;
    say: (line: string) => void;
  }
): Promise<void> => {
  const ordered = orderSteps(steps);
  const began = performance.now();
  const at = () => ((performance.now() - began) / 1000).toFixed(1);
  const running = new Map<string, Promise<void>>();
  let first: { error: unknown } | undefined;
  for (const step of ordered) {
    const run = (async () => {
      await Promise.all(step.after.map((name) => running.get(name)));
      if (first) {
        throw new Error("Not started: another release step failed");
      }
      hooks.say(`[release] +${at()}s start ${step.name}`);
      const started = performance.now();
      await step.run();
      hooks.say(
        `[release] +${at()}s done ${step.name} (${((performance.now() - started) / 1000).toFixed(1)}s)`
      );
    })();
    running.set(
      step.name,
      run.catch(async (error: unknown) => {
        if (!first) {
          first = { error };
          hooks.say(
            `[release] +${at()}s FAILED ${step.name}: ${error instanceof Error ? error.message : String(error)}`
          );
          await hooks.failed(error);
        }
        throw error;
      })
    );
  }
  await Promise.allSettled(running.values());
  if (first) {
    throw first.error;
  }
};
