/** biome-ignore-all lint/style/useFilenamingConvention: the decision names one states file per option, NativePreview.<option>.stories.ts. */
/**
 * Option 3, agent-written HTML mirror (Component Story Format 3, live
 * components): HTML components on the house tokens, written by the agent to
 * look like the native screen and framed as any page is; the band and the
 * inspector say quietly that it is written, not read from the app.
 */
import { paneFrame } from "./frame";
import NativePane from "./NativePane.svelte";

export default {
  title: "Native preview/3 Agent-written HTML mirror",
  component: NativePane,
  args: { kind: "mirror" },
  decorators: [paneFrame],
};

/** Desk: the mirror, marked Agent-written, beside the inspector; its Needs you element picked with pin 1. */
export const Desk = { parameters: { viewport: 720 } };

/** Phone: the band says Agent-written; the mirror whole above its caption; the picked element in a sheet docked under it, its written-not-read line and pin first. */
export const Phone = { parameters: { viewport: 390 } };
