/**
 * Whether the hover panel a part is drawn in is still coming in (HoverPanel
 * `entered`): what settles in it then is part of its one entrance, so a
 * part's own swap (a skeleton handing its place to the rows it stood for)
 * lands at once instead of starting a second motion a frame behind it.
 * Outside a hover panel nothing is coming in.
 */
import { getContext, setContext } from "svelte";

const KEY = Symbol("hover-entrance");

/** HoverPanel: says, for what it holds, whether it is coming in now. */
export function provideEntrance(comingIn: () => boolean): void {
  setContext(KEY, comingIn);
}

/** Whether the hover panel this part stands in is coming in now; false outside one. */
export function entrance(): () => boolean {
  return getContext<(() => boolean) | undefined>(KEY) ?? (() => false);
}
