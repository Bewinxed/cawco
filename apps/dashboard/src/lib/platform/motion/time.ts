/**
 * A CSS time as computed style gives it back, in ms. Read in the unit it is
 * written in: the built stylesheet's minifier rewrites `400ms` as `.4s`, so
 * the number alone is not milliseconds. Every time the dashboard reads off
 * computed style (a `--dur-*` token through `dur()`, a transition's
 * duration) comes through here.
 */
export const msOf = (time: string): number => {
  const value = time.trim();
  return Number.parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
};
