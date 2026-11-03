/**
 * A project's setup page (Component Story Format 3, live components): the
 * PR team's program drawn by the decision host's own components.
 */
import SetupPagePreview from "./SetupPagePreview.svelte";

export default {
  title: "Onboarding/Setup page",
  component: SetupPagePreview,
  parameters: { viewport: 1280 },
};

/** The draft as Caw writes it. */
export const Draft = {};

/** On a phone. */
export const Phone = { parameters: { viewport: 390 } };
