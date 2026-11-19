/**
 * How a folder track draws a switch's come-forward (TabsList), while the
 * owner judges cheaper ways to draw it against today's (the tab-switch
 * design graph, PaneTabs*.stories.ts). Given by whatever mounts the strip
 * (`provideForwardStyle`, read once as the track mounts); without one,
 * today's.
 *
 * - `every`: today's. Each frame of the come-forward hands every tab its
 *   pose and each tab whose pose moved writes its outline again: on a jump
 *   past several tabs every tab between the two flips its stack, its two
 *   sides sweeping.
 * - `near`: only the tab chosen, the tab it leaves and the tab beside each
 *   move; the tabs between re-rank at half way, where the stack flips, in
 *   one frame.
 * - `stepped`: today's motion, each side's reach and step in drawn on
 *   whole pixels: a fold sweeping a flare's width (8px) is drawn at most
 *   once per pixel it moves, and a tab is handed its pose only when that
 *   moves it.
 * - `still`: no sweep. The tabs re-rank at half way while the sheets
 *   cross-fade: what a switch costs with no outline drawn anew.
 */
import { getContext, setContext } from "svelte";

export type ForwardStyle = "every" | "near" | "stepped" | "still";

const FORWARD_STYLE = Symbol("fluid-tabs-forward-style");

export function provideForwardStyle(style: ForwardStyle): void {
  setContext(FORWARD_STYLE, style);
}

export function forwardStyle(): ForwardStyle {
  return getContext<ForwardStyle | undefined>(FORWARD_STYLE) ?? "every";
}
