/**
 * mark-1 moved to Darker red (Component Story Format 3, live): Cawco-Dev's tile and
 * the three of its running sessions whose folders land on hue 1, beside the
 * coral Start, by day and by night side by side (MarkHues).
 */
import MarkHues from "./preview/MarkHues.svelte";

export default {
  title: "Project page/mark-1 · Darker red",
  component: MarkHues,
  args: {
    width: 720,
    day: "oklch(44.7% 0.145 27.8)",
    night: "oklch(70% 0.17 27.9)",
  },
};

/** By day, then by night. */
export const Tiles = { parameters: { viewport: 720 } };
