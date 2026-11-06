import { glassHold } from "./bar-glass.svelte";

/**
 * The glass a card hangs from (BarMenu, BarPopover), and whether the card
 * stands drawn out of it (`joined`, the HangCard's): while it does, the glass
 * draws its join.
 */
export function hungFromGlass() {
  const glass = glassHold();
  const card = $state({ joined: false });
  $effect(() => {
    if (!card.joined) {
      return;
    }
    glass.hung(true);
    return () => glass.hung(false);
  });
  return { glass, card };
}
