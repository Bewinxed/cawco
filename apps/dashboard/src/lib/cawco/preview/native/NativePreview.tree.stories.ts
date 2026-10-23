/** biome-ignore-all lint/style/useFilenamingConvention: the decision names one states file per option, NativePreview.<option>.stories.ts. */
/**
 * Option 2, view-tree drawing over a still (Component Story Format 3, live
 * components): the component canvas in the preview panel, one still per
 * state (default, pressed, dark, iPad wide) with the app's view tree drawn
 * over each as boxes, invisible until hovered or picked; Wire in the head
 * draws every box with the stills dimmed; an edge labelled "tap" runs from
 * Default to Pressed. The stills' pixels are stand-ins drawn from the
 * dashboard's own Project page parts.
 */
import { grownFrame } from "./frame";
import NativeCanvas from "./NativeCanvas.svelte";

export default {
  title: "Native preview/2 View tree over stills",
  component: NativeCanvas,
  decorators: [grownFrame],
};

/** Desk: the four stills in the panel's canvas, Default picked with pin 1. */
export const Desk = { parameters: { viewport: 720 } };

/** Phone: the stills stacked, the tap running down from Default to Pressed. */
export const Phone = { parameters: { viewport: 390 } };
