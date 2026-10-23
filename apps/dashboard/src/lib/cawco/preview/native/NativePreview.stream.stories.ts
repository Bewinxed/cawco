/** biome-ignore-all lint/style/useFilenamingConvention: the decision names one states file per option, NativePreview.<option>.stories.ts. */
/**
 * Option 1, stream + element map (Component Story Format 3, live
 * components): the running app streamed into the preview panel's well,
 * letterboxed, with the app's accessibility tree over it as boxes that
 * draw under the pointer and on a pick; the band names the device, that it
 * is live and the machine it runs on; the picked node stands in the
 * inspector. The app's pixels are a stand-in drawn from the dashboard's own
 * Project page parts.
 */
import { paneFrame } from "./frame";
import NativePane from "./NativePane.svelte";

export default {
  title: "Native preview/1 Stream + element map",
  component: NativePane,
  args: { kind: "stream" },
  decorators: [paneFrame],
};

/** Desk: the live app beside the inspector, the Needs you label picked with pin 1. */
export const Desk = { parameters: { viewport: 720 } };

/** Phone: the app whole above its caption; the picked node in a sheet docked under it, its pin first and its rows scrolling under a fade. */
export const Phone = { parameters: { viewport: 390 } };

/** Desk: the pointer over one card: its box drawn, its class named once in the tooltip's chip, nearer that card than any other box and clear of every word. */
export const Hover = {
  args: { hover: "Pair the phone by QR" },
  parameters: { viewport: 720 },
};

/** Desk: the pointer over the top row's More button: no room above it inside the screen, so its class is named beside it, nearer it than any other box. */
export const HoverTop = {
  args: { hover: "More" },
  parameters: { viewport: 720 },
};
