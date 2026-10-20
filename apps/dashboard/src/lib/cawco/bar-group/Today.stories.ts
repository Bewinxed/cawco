/**
 * The bar's group as it ships today, the before: the number of files
 * beside Files and of machines beside the machines symbol, that symbol
 * tinted while the Mac is down, and Solar's lens at 16px.
 */
import BarGroup from "./BarGroup.svelte";
import { ONE_DOWN } from "./fixtures";

export default {
  title: "Top bar/Today",
  component: BarGroup,
  args: { form: "desk", today: true, machines: ONE_DOWN },
  parameters: { viewport: 260 },
};

/** Desk: 77 files, 2 machines, the Mac down. */
export const Desk = {};
