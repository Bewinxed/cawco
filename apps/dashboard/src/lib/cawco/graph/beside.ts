/**
 * The width a surface needs for the design graph's room to stand beside its
 * stage: the stage at its least (`c-graph-stage-min`), the room at its least
 * (`c-graph-room-w`), each pane's inset beside the split's divider, the
 * divider and the page's gutters. Under it the room is the drawer. Read by
 * the graph for its own layout and by the artifact panel, which puts the
 * inspector in the room where the room stands beside (PreviewPane).
 */
import { numberOf } from "#lib/platform/motion/curves.svelte.js";

/** The divider's width (the kit handle's `w-px`): paneforge shares what is left of the group beside it between the panes (as side/Split.svelte reads it). */
export const DIVIDER = 1;
/** The px the two least shares, each rounded up to a hundredth, may add between them on the widest surface: under one. */
const ROUNDING = 1;

/** The beside line, px (1058 today); 0 before the page has its tokens. */
export const besideLine = (): number =>
  typeof document === "undefined"
    ? 0
    : numberOf("--c-graph-stage-min") +
      numberOf("--c-graph-room-w") +
      2 * numberOf("--space-2") +
      2 * numberOf("--space-6") +
      DIVIDER +
      ROUNDING;

/**
 * The width a well needs for the inspector to stand beside the graph as a
 * panel: the stage at its least, its page's gutters, and the inspector's
 * own width. Under it the inspector is a sheet over the well's foot: beside
 * the graph in a 523px pane it left the stage 165px, and the component,
 * reflowed into a layout the graph made, was what the person judged.
 */
export const inspectorBesideLine = (): number =>
  typeof document === "undefined"
    ? 0
    : numberOf("--c-graph-stage-min") +
      2 * numberOf("--space-6") +
      numberOf("--c-sheet-inspector-w");
