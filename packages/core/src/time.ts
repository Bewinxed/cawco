/**
 * The time units, in milliseconds: the one place they are written. Every
 * other file imports them from here (@cawco/core/time).
 */

const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/**
 * `ms` as the seconds a person reads in a line ("within 1.5 s", "within
 * 20 s"): to a tenth under ten seconds, whole from ten. A deadline said
 * through `Math.round(ms / 1000)` told a 1,500 ms wait as "2 s".
 */
export const secondsOf = (ms: number): number =>
  ms < 10 * SECOND_MS
    ? Math.round(ms / (SECOND_MS / 10)) / 10
    : Math.round(ms / SECOND_MS);
