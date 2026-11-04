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
  parameters: { viewport: 1440 },
};

/** No setup under way (left unsent, or Caw off): the action asks him for one. */
export const NothingUnderWay = {};

/** No machine online: no action the board can carry. */
export const NoMachine = { args: { act: { kind: "none" } } };

/** On a phone. */
export const Phone = { parameters: { viewport: 390 } };

/** At 2529: the scene stays on its axis. */
export const Wide = { parameters: { viewport: 2529 } };
