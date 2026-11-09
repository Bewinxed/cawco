import { dur } from "./motion/curves.svelte";

/**
 * Whether a wait has lasted past its grace (`--dur-wait-grace`, DESIGN.md
 * The Real Wait Rule): `current` turns true once `waiting()` has held for
 * the grace, and false again as soon as it stops. Made where an effect can
 * stand (a component's script, or a store a component makes).
 */
export class GraceWhile {
  current = $state(false);

  constructor(waiting: () => boolean) {
    $effect(() => {
      if (!waiting()) {
        this.current = false;
        return;
      }
      const grace = setTimeout(() => {
        this.current = true;
      }, dur("--dur-wait-grace"));
      return () => clearTimeout(grace);
    });
  }
}

export const graceWhile = (waiting: () => boolean): GraceWhile =>
  new GraceWhile(waiting);
