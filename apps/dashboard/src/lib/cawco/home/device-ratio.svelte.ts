/**
 * The window's device pixel ratio, followed, for Caw: his files take one
 * device pixel as their `pixel` (assets/mascot/README.md, Contract), so his
 * dark rim is one whole device pixel wide at whatever size he is drawn. A
 * zoom changes the ratio with the viewport's size; a move to another display
 * changes it alone, and the resolution query that matched the old ratio says
 * so once.
 */
import { browser } from "$app/env";

let ratio = $state(1);
function follow(): void {
  ratio = devicePixelRatio;
  matchMedia(`(resolution: ${ratio}dppx)`).addEventListener("change", follow, {
    once: true,
  });
}
if (browser) {
  follow();
  addEventListener("resize", () => {
    ratio = devicePixelRatio;
  });
}

export const deviceRatio = {
  /** Read inside an effect, it is read again when the ratio changes. */
  get current(): number {
    return ratio;
  },
};
