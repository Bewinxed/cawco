import type { Attachment } from "svelte/attachments";
import { CURVE, dur } from "../motion/curves.svelte";

/**
 * A part of the join that comes in on its own beat (Caw, the two ways on):
 * it fades in over --dur-fade on ease-out, `delay` ms after it mounts, on
 * the Web Animations API, so it stands on the same clock as the rest of the
 * join and holds its first frame through the delay. Nothing at 0: a card
 * drawn joined from the start just stands. Opacity only, so it runs with
 * less motion too (The Reduced Motion Rule).
 */
export const arriveAt =
  (delay: number): Attachment<HTMLElement> =>
  (node) => {
    if (delay <= 0) {
      return;
    }
    const run = node.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: dur("--dur-fade"),
      delay,
      easing: CURVE.out,
      fill: "backwards",
    });
    return () => run.cancel();
  };
