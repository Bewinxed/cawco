/**
 * Jump's search glyph, the recommended answer: 20px, the size of the
 * group's other three symbols, drawn in their cut (IconSearch).
 */
import BarGroup from "./BarGroup.svelte";

export default {
  title: "Jump's glyph/The group's size",
  component: BarGroup,
  args: { form: "desk", jump: 20 },
  parameters: { viewport: 260 },
};

/** Desk: the search glyph as large as the folder, the server and Caw. */
export const Desk = {};
