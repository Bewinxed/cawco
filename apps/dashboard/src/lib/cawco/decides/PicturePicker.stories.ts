/**
 * A member's picture, picked under its settings' head, hung from the card that opened them, on his real fleet: the five
 * built-ins, Design reviewer (an agent he added, holding Look and words in
 * Cawco-Dev) and Release checker, the harnesses on his machines with their
 * models, and the fleet's skills. Every write stays on the page.
 */

import { added } from "./preview/records";
import SetupFixture from "./preview/SetupFixture.svelte";

export default {
  title: "Who decides/Pictures",
  component: SetupFixture,
};

/** Caw's pose picker: his fourteen poses, seven across. */
export const CawPicker = {
  args: { open: "caw", picking: true },
  parameters: { viewport: 1440 },
};

/** Caw's pose picker on a phone: four across. */
export const CawPickerPhone = {
  args: { open: "caw", picking: true },
  parameters: { viewport: 390 },
};

/** Design reviewer's picker: the eight identity hues. */
export const AgentPicker = {
  args: { open: "design-reviewer", picking: true },
  parameters: { viewport: 680 },
};

/** A long name and job wrap in the head and the card. */
export const LongName = {
  args: {
    members: [
      ...added.slice(0, 5),
      {
        ...added[5],
        name: "Accessibility and internationalisation reviewer for the iOS app",
        job: "Reads every screen at 200% zoom, in Arabic and German, with VoiceOver on, then picks the option that holds.",
      },
    ],
    open: "design-reviewer",
  },
  parameters: { viewport: 390 },
};
