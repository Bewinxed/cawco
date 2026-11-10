/**
 * `next`, or `was` when it holds the same values in the same order: a
 * derived that returns the very array it returned before wakes nothing
 * downstream ("If the new value of a derived is referentially identical to
 * its previous value, downstream updates will be skipped",
 * svelte.dev/docs/svelte/$derived).
 */
export function unlessSame<T>(was: T[] | undefined, next: T[]): T[] {
  if (
    was !== undefined &&
    was.length === next.length &&
    was.every((value, i) => value === next[i])
  ) {
    return was;
  }
  return next;
}
