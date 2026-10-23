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

/** Phone: the head keeps Send and folds the rest into More; the app whole above its caption; the picked node in a sheet docked under it. */
export const Phone = { parameters: { viewport: 390 } };
