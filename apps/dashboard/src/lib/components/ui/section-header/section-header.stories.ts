/**
 * The kit's SectionHeader (Component Story Format 3, live components),
 * mounted as itself: a form section's head with its hued glyph. The meta's
 * args are every story's; a story's own args are what it changes.
 */
import { IconChat, IconCpu, IconFolder } from "#lib/icons.js";
import SectionHeader from "./section-header.svelte";

export default {
  title: "Kit/Section header",
  component: SectionHeader,
  args: {
    icon: IconChat,
    hue: "var(--color-label-cyan)",
    label: "First prompt",
  },
};

/** The new session form's prompt section. */
export const Prompt = {};

/** The machine section. */
export const Machine = {
  args: {
    icon: IconCpu,
    hue: "var(--color-label-orange)",
    label: "Where it runs",
  },
};

/** A long section name that wraps. */
export const LongName = {
  args: {
    icon: IconFolder,
    hue: "var(--color-label-yellow)",
    label:
      "The folder and branch this session starts from, on obelisk-of-light",
    wrap: true,
  },
};
