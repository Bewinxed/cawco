/**
 * What the live card's states files share: the stores the card reads,
 * taken so each frame's stand-in writes its own (each story's
 * `beforeEach`), and a layout story's args (card-layout.ts): four folders
 * and GitHub Issues connected, on a 1024×768 laptop's screen.
 */
import type { CardLayout } from "./card-layout";

export async function liveStores(): Promise<void> {
  await Promise.all([
    import("../../stores/board.svelte"),
    import("../../stores/accounts.svelte"),
    import("../../stores/projects.svelte"),
    import("../../stores/moves.svelte"),
  ]);
}

export const layoutArgs = (layout: CardLayout) => ({
  situation: "four-folders",
  answer: "yes",
  open: true,
  again: 0,
  layout,
  laptop: true,
});
