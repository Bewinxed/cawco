/**
 * The live Routines page (ViewRoutines) with Caw's suggestion of the unused
 * skills and servers routine, in the states the person meets it (Component
 * Story Format 3, live components), through its seam (ViewRoutinesFrame),
 * each story's stand-in hub answering the page's reads (routines-fixture).
 */
import { routinesWords } from "@cawco/core/words/routines";
import { hubAs } from "../hub-stand-in";
import { STARTERS, STATES } from "./routines-fixture";
import ViewRoutinesFrame from "./ViewRoutinesFrame.svelte";

export default {
  title: "Routines/Routines page",
  component: ViewRoutinesFrame,
  decorators: [hubAs("connected", STATES.offered)],
  parameters: { viewport: 1440 },
};

/** Caw suggests a routine under my routines. */
export const Suggested = {};

/** I have no routines yet, and Caw suggests one. */
export const NoRoutinesYet = {
  args: { starters: STARTERS, canTalk: true },
  decorators: [hubAs("connected", STATES.empty)],
};

/** I pressed Caw's chip. Its ask is in the composer, unsent. */
export const ChipPressed = {
  args: { starters: STARTERS, canTalk: true, pressed: true },
  decorators: [hubAs("connected", STATES.empty)],
  from: "NoRoutinesYet",
  play: async ({
    canvas,
    userEvent,
  }: {
    canvas: { getByRole: (role: string, options: { name: string }) => Element };
    userEvent: { click: (el: Element) => Promise<void> };
  }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: routinesWords.trimAsk })
    );
  },
};

/** I turned it on. It sits with my other routines. */
export const TurnedOn = { decorators: [hubAs("connected", STATES.on)] };

/** It ran on Monday and delivered. */
export const Ran = { decorators: [hubAs("connected", STATES.ran)] };
