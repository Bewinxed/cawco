/**
 * The kit's CawLoopSwitcher (Component Story Format 3, live components),
 * mounted as itself: Caw moving while a project works, and held still. Each
 * story sets the reader's choice through the feel store's own writer before
 * it mounts.
 */
import CawLoopSwitcher from "./CawLoopSwitcher.svelte";

export default {
  title: "Kit/Caw loop switcher",
  component: CawLoopSwitcher,
  args: {},
};

/** Caw moves while the project works. */
export const Moving = {
  async beforeEach() {
    const { setCawLoop } = await import("#lib/platform/feel.svelte.js");
    setCawLoop(true);
  },
};

/** Caw holds still while the project works. */
export const Still = {
  async beforeEach() {
    const { setCawLoop } = await import("#lib/platform/feel.svelte.js");
    setCawLoop(false);
  },
};
