import { glassHold } from "./bar-glass.svelte";

/**
 * The glass a card hangs from (BarMenu), and whether the card
 * stands drawn out of it (`joined`, the HangCard's): while it does, the glass
 * draws its join, upside down for a card that rises out of its top
 * (`rises`).
 */
export function hungFromGlass(rises: () => boolean) {
  const glass = glassHold();
  const card = $state({ joined: false });
  $effect(() => {
    if (!card.joined) {
      return;
    }
    const up = rises();
    glass.hung(true, up);
    return () => glass.hung(false, up);
  });
  return { glass, card };
}
