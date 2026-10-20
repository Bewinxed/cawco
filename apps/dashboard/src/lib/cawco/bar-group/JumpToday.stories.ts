/**
 * Jump's search glyph as it is today: 16px (`--icon-md`), smaller than the
 * group's other three symbols.
 */
import BarGroup from "./BarGroup.svelte";

export default {
  title: "Jump's glyph/Smaller, as today",
  component: BarGroup,
  args: { form: "desk", jump: 16 },
  parameters: { viewport: 360 },
};

/** Desk: the lens a step smaller than the symbols beside it. */
export const Desk = {};
