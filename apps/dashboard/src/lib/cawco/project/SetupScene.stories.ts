/**
 * A project's board before it is set up, with no setup under way
 * (Component Story Format 3, live components), through the board's empty
 * states fixture (EmptyOnAxis), which mounts the real SetupScene as the
 * page does: Caw's seat over the block where he can start, the folder glyph
 * where he can't. Once Caw sets it up, his draft takes the board's place
 * (SetupDraft).
 */
import EmptyOnAxis from "#lib/components/ui/empty/EmptyOnAxis.svelte";
import { inProjectPane } from "./pane-frame";

export default {
  title: "Onboarding/Board before setup",
  component: EmptyOnAxis,
  args: { look: "setup" },
  decorators: [inProjectPane],
  // The board at a desk's width; the canvas's widths draw it on a phone and at 2529.
  parameters: { viewport: 1440 },
};

/** Nobody is setting the project up yet, so Caw offers to start. */
export const NothingUnderWay = {};

/** No machine is online, so the board has nothing to offer. */
export const NoMachine = { args: { look: "none" } };
