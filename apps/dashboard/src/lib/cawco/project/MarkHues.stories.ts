/**
 * mark-1 moved off the coral (Component Story Format 3, live): Cawco-Dev's
 * tile and the three of its running sessions whose folders land on hue 1,
 * beside the coral Start, by day and by night side by side (MarkHues), one
 * story per proposed hue. The darker red's night is today's mark-1, which
 * the proposal leaves as it is.
 */
import MarkHues from "./preview/MarkHues.svelte";

export default {
  title: "Project page/mark-1",
  component: MarkHues,
  args: { width: 720 },
  parameters: { viewport: 720 },
};

/** Teal, hue 160. */
export const Teal = {
  args: { day: "oklch(51% 0.11 160)", night: "oklch(70% 0.11 160)" },
};

/** Crimson, hue 12. */
export const Crimson = {
  args: { day: "oklch(51% 0.168 12)", night: "oklch(70% 0.17 12)" },
};

/** A darker red: Flexoki red-700 by day. */
export const DarkRed = {
  args: { day: "oklch(44.7% 0.145 27.8)", night: "oklch(70% 0.17 27.9)" },
};
