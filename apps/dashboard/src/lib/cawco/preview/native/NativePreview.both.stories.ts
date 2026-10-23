/** biome-ignore-all lint/style/useFilenamingConvention: the decision names one states file per option, NativePreview.<option>.stories.ts. */
/**
 * Option 4, recommended, both 1 and 2 (Component Story Format 3, live
 * components): one node tree in two places, over the live stream in the
 * preview panel and over each still on the canvas. Wire in the panel's band
 * draws every box in both.
 */
import NativeBoth from "./NativeBoth.svelte";

export default {
  title: "Native preview/4 Both: stream and stills",
  component: NativeBoth,
};

/** Desk: the preview panel's live app beside the canvas's section of stills. */
export const Desk = { parameters: { viewport: 1440 } };

/** Phone: the panel's live app over the canvas's stills, stacked. */
export const Phone = { parameters: { viewport: 390 } };
