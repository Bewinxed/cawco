/**
 * The window's device pixel ratio, followed, for Caw: his files take one
 * device pixel as their `pixel` (assets/mascot/README.md, Contract), so his
 * dark rim is one whole device pixel wide at whatever size he is drawn. A
 * zoom changes the ratio with the viewport's size; a move to another display
 * changes it alone, and the resolution query that matched the old ratio says
 * so once.
 *
 * Followed only while an effect reads it (svelte/reactivity
 * `createSubscriber`, as `MediaQuery` is): importing this module starts no
 * listener, and the last reader gone removes them. Every page that draws
 * Caw (the app, a decision page's host, a canvas frame) reads its own ratio
 * with no start of its own.
 */
import { on } from "svelte/events";
import { createSubscriber } from "svelte/reactivity";

/** Listens while read in an effect: a resize, and the resolution query that matched the ratio no longer matching. */
const subscribe = createSubscriber((update) => {
  let offQuery = (): void => undefined;
  const follow = (): void => {
    offQuery = on(
      matchMedia(`(resolution: ${devicePixelRatio}dppx)`),
      "change",
      () => {
        offQuery();
        follow();
        update();
      }
    );
  };
  follow();
  const offResize = on(window, "resize", update);
  return () => {
    offQuery();
    offResize();
  };
});

export const deviceRatio = {
  /** Read inside an effect, it is read again when the ratio changes. 1 on the server. */
  get current(): number {
    if (typeof window === "undefined") {
      return 1;
    }
    subscribe();
    return devicePixelRatio;
  },
};
