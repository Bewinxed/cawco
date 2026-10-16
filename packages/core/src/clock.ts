/**
 * THE ONE CLOCK THE TIMED STEPS OF AN UPDATE READ THEIR LENGTHS FROM: the
 * trial window a build has to answer in, the hold that confirms it, a failed
 * attempt's retry delay, and how long a retiring keeper (or a keeper job no
 * keeper runs from) must sit empty before it goes. Each is written beside its
 * timer and passed through {@link timerMs}.
 *
 * In this build every length is the one written. The stage 2 container proof's
 * builds (scripts/build-binary.ts, `stubHarness`) are compiled with
 * scripts/binary/proof-clock.ts in this module's place, which runs them at the
 * pace its machines set; no published binary carries that.
 */

/** How many times faster than written the timers run. */
export const TIME_SCALE = 1;

/** A timer's length in milliseconds. */
export const timerMs = (ms: number): number => ms;

/**
 * How late a retiring keeper (one the machine's `keeper` link no longer
 * names, still holding what it started before a handover) answers a `list`:
 * at once in this build. The stage 2 proof's builds answer it as late as
 * their machines set, as a keeper on a loaded machine does.
 */
export const RETIRING_LIST_MS = 0;
