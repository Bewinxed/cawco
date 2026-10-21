/**
 * The five phase names under Connect a machine's rail on the desk
 * (Component Story Format 3, live components): shown in meta, the current
 * one in strong ink, or the rail alone as on the phone. The add is 42s
 * into its service step, on the desk's 512px tray.
 */
import JoinTrayFrame from "./preview/JoinTrayFrame.svelte";
import { runningAt } from "./preview/join-fixtures";

export default {
  title: "Connect a machine/The phase names",
  component: JoinTrayFrame,
  args: { layout: "desk", way: "ssh", stepElapsed: 42_000 },
};

/** Named: Sign in, Fetch, Install, Join, Service under the five segments. */
export const Named = {
  args: { job: runningAt(10), taste: { names: true } },
  parameters: { viewport: 640 },
};
/** Named, earlier: the download, Fetch the current phase. */
export const NamedFetching = {
  args: { job: runningAt(6), taste: { names: true }, stepElapsed: 2000 },
  parameters: { viewport: 640 },
};
/** The rail alone, as on the phone. */
export const RailAlone = {
  args: { job: runningAt(10), taste: { names: false } },
  parameters: { viewport: 640 },
};
/** The rail alone, earlier: the download. */
export const RailAloneFetching = {
  args: { job: runningAt(6), taste: { names: false }, stepElapsed: 2000 },
  parameters: { viewport: 640 },
};
