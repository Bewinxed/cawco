/** The arrows' steps through a row of choices: either axis means the next one. */
const ARROWS: Record<string, 1 | -1 | undefined> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * Where an arrow key moves a roving focus from choice `at` of `count`,
 * wrapping at either end, its default taken; null for any other key.
 */
export function arrowStep(
  event: KeyboardEvent,
  at: number,
  count: number
): number | null {
  const step = ARROWS[event.key];
  if (!step) {
    return null;
  }
  event.preventDefault();
  return (at + step + count) % count;
}
