/**
 * The surface ladder's level (theme.css `surface`). Every surface stands one
 * level above the surface it opens in: a menu in a popover in a dialog each
 * climb a step, with nothing passed between them. Svelte context follows the
 * component tree, so a surface portalled to the body still reads the level of
 * the surface that opened it.
 */
import { getContext, hasContext, setContext } from "svelte";

const LEVEL = Symbol("surface-level");

/** The level of the surface this component stands in; the page is 0. */
export function surfaceLevel(): number {
  return hasContext(LEVEL) ? getContext<number>(LEVEL) : 0;
}

/** How far a surface rises: a panel in the page's flow, or one floating over it. */
const RISE = { panel: 1, float: 2 } as const;

/**
 * Rises above the surface it opens in (a panel one level, a popover, menu or
 * dialog two), and makes that level the one every surface opened inside it
 * rises from. Call it in a component's setup; set its answer as
 * `--surface-level` beside the `surface` utility.
 */
export function rise(by: keyof typeof RISE = "float"): number {
  const level = surfaceLevel() + RISE[by];
  setContext(LEVEL, level);
  return level;
}
