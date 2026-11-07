/**
 * A project's board before it is set up, with no setup under way
 * (Component Story Format 3, live components). Once Caw sets it up, his
 * draft takes the board's place (SetupDraft). His seat is the page's
 * (CawSeat); here the scene stands with its folder glyph.
 */
import SetupScene from "./SetupScene.svelte";

export default {
  title: "Onboarding/Board before setup",
  component: SetupScene,
  args: { act: { kind: "ask", ask: () => undefined } },
  // The board at a desk's width; the canvas's widths draw it on a phone and at 2529.
  parameters: { viewport: 1440 },
};

/** Nobody is setting the project up yet, so the board offers to start. */
export const NothingUnderWay = {};

/** No machine is online, so the board has nothing to offer. */
export const NoMachine = { args: { act: { kind: "none" } } };
