/**
 * HOW LONG THIS MACHINE WAS AWAKE, AND HOW LONG IT SLEPT. A process does not
 * run while its machine sleeps (or while it is otherwise held: SIGSTOP, a VM
 * paused), and the wall clock goes on: a beat timed every second lands late by
 * the whole sleep. That lateness is the one rule a sleep is read by here, the
 * one agent hub-away.ts's `throughHubAway` already gives a held wait back by,
 * and it holds on every platform whatever its monotonic clock does in sleep
 * (macOS's stops, Linux's CLOCK_BOOTTIME does not), since it reads only the
 * wall clock between two runs of this process.
 *
 * Users: an update's trial (cli binary-apply.ts `TrialWatch`), whose deadline
 * and confirming hold count awake time only. On 2026-11-07 the owner's Mac
 * idle-slept seconds into five trials in a row; each deadline passed asleep,
 * the first probe after the wake found no network, and each build was rolled
 * back on the hub's silence while it had registered healthy.
 */

/** How late a beat must land to be read as a sleep: past any pause a busy process makes, well under the shortest sleep that matters. */
const SLEEP_LATE_MS = 5000;

/** How often the beat is timed. */
const BEAT_MS = 1000;

export class AwakeTime {
  readonly #now: () => number;
  #last: number;
  #sleptMs = 0;
  #timer: ReturnType<typeof setInterval> | undefined;

  /** `now`: the wall clock, a spec's own in place of `Date.now`. */
  constructor(now: () => number = Date.now) {
    this.#now = now;
    this.#last = now();
  }

  /** Times the beat every {@link BEAT_MS} until {@link stop}; never keeps the process up by itself. */
  start(): this {
    this.#timer ??= setInterval(() => this.look(), BEAT_MS);
    this.#timer.unref();
    return this;
  }

  stop(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  /**
   * Reads a sleep since the last look into {@link sleptMs}, once: what the
   * wall clock moved past a beat, when that is {@link SLEEP_LATE_MS} or more;
   * its length, or 0. Called by the beat, and by a reader that must know
   * before it acts on an answer that came in just after a wake; a reader
   * keeps its own mark of `sleptMs`, since the beat may read it first.
   */
  look(): number {
    const now = this.#now();
    const late = now - this.#last - BEAT_MS;
    this.#last = now;
    if (late < SLEEP_LATE_MS) {
      return 0;
    }
    this.#sleptMs += late;
    return late;
  }

  /** All the sleep read since this clock was made. */
  get sleptMs(): number {
    return this.#sleptMs;
  }

  /** The wall clock with every sleep read so far taken out: a length between two of these is awake time. */
  awakeNow(): number {
    return this.#now() - this.#sleptMs;
  }

  /** The wall clock this reads. */
  now(): number {
    return this.#now();
  }
}
