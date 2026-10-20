/**
 * Jump's search glyph at 16px, the size today (`--icon-md`, Solar's
 * `magnifer-bold-duotone`), smaller than the group's other three symbols.
 */
import BarGroup from "./BarGroup.svelte";

export default {
  title: "Jump's glyph/16px, the size today",
  component: BarGroup,
  args: { form: "desk", jump: 16 },
  parameters: { viewport: 260 },
};

/** Desk: the lens a step smaller than the symbols beside it. */
export const Desk = {};
