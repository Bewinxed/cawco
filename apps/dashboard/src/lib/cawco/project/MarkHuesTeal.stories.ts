/**
 * mark-1 moved to Teal (Component Story Format 3, live): Cawco-Dev's tile and
 * the three of its running sessions whose folders land on hue 1, beside the
 * coral Start, by day and by night side by side (MarkHues).
 */
import MarkHues from "./preview/MarkHues.svelte";

export default {
  title: "Project page/mark-1 · Teal",
  component: MarkHues,
  args: {
    width: 720,
    day: "oklch(51% 0.11 160)",
    night: "oklch(70% 0.11 160)",
  },
};

/** By day, then by night. */
export const Tiles = { parameters: { viewport: 720 } };
