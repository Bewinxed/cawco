/**
 * A process's wall clock moved on, for a spec that needs a day to pass:
 * preloaded into a scratch service (`BUN_OPTIONS=--preload <this file>`),
 * `Date.now()` and every `new Date()` with no argument read
 * `CAWCO_PROBE_CLOCK_AHEAD_MS` later than the machine's clock. Times the
 * process was handed (a stored row's, a frame's) stay as they were, so
 * what was written before it started reads that much older to it, as it
 * would to the same process a day on. `performance.now()` is untouched:
 * durations are durations.
 */
const ahead = Number(process.env.CAWCO_PROBE_CLOCK_AHEAD_MS ?? 0);

if (Number.isFinite(ahead) && ahead !== 0) {
  const Wall = Date;
  const wallNow = Wall.now.bind(Wall);
  class Ahead extends Wall {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(wallNow() + ahead);
      } else {
        super(...(args as [string | number | Date]));
      }
    }

    static override now(): number {
      return wallNow() + ahead;
    }
  }
  globalThis.Date = Ahead as DateConstructor;
  console.log(`[probe-kit] this process's clock reads ${ahead} ms ahead`);
}
