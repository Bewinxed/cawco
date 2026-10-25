import { getContext, setContext } from "svelte";

/** The kit Root's open state, as its Content reads it (`collapsible-content`). */
const ROOT_OPEN = Symbol("collapsible-root-open");

/** The kit Root hands its Content whether it is open now. */
export function provideRootOpen(open: () => boolean): void {
  setContext(ROOT_OPEN, open);
}

/** Whether the kit Root around this Content is open now; null under any other Root (bits-ui's own). */
export function rootOpen(): (() => boolean) | null {
  return getContext<(() => boolean) | undefined>(ROOT_OPEN) ?? null;
}
