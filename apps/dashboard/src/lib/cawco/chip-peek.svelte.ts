/**
 * Resting a mouse on a reference chip peeks what it names under it (a pin's
 * thread, a thing's card), after `--duration-peek`. Never under a finger, where
 * a press opens it; the chip's own name carries its state for a screen
 * reader. `place` answers where the peek stands from the chip's box; `can`
 * whether there is anything to peek yet. Set up with the chip.
 */
import { MediaQuery } from "svelte/reactivity";
import { dur } from "#lib/platform/motion/curves.svelte.js";

const fine = new MediaQuery("(hover: hover) and (pointer: fine)");

export function chipPeek<T>(
  chip: () => HTMLElement | undefined,
  can: () => boolean,
  place: (box: DOMRect) => T
): { readonly at: T | null; leave: () => void; rest: () => void } {
  let at = $state<T | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));
  return {
    get at() {
      return at;
    },
    rest() {
      clearTimeout(timer);
      const el = chip();
      if (!(fine.current && can() && el)) {
        return;
      }
      timer = setTimeout(() => {
        at = place(el.getBoundingClientRect());
      }, dur("--duration-peek"));
    },
    leave() {
      clearTimeout(timer);
      at = null;
    },
  };
}
