/**
 * CawCo's design system board (Component Story Format 3, live components):
 * every kit component the shipped dashboard draws, each in the states its
 * own states file holds, in the light scheme and the dark side by side.
 */
import DesignBoard from "./DesignBoard.svelte";

export default {
  title: "Design system/Board",
  component: DesignBoard,
};

/** Every live kit component in its states, light beside dark, in the pair its switcher names. */
export const Board = {
  args: { pair: "Figtree + JetBrains Mono (today)" },
};
