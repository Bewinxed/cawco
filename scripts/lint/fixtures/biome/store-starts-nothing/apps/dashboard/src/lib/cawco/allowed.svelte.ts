// A store module that starts nothing on import: each start is exported, and
// returns its stop.
import { on } from "svelte/events";

let tick = $state(0);

const held = $state({ list: [] as string[] });

export const clock = {
  get now(): number {
    return tick;
  },
  later(): void {
    setTimeout(() => undefined, 10);
  },
};

class Home {
  ready = $state(false);

  start(): () => void {
    return $effect.root(() => {
      $effect(() => undefined);
    });
  }
}

export const home = new Home();

export function startClock(): () => void {
  const ticker = setInterval(() => {
    tick += 1;
  }, 15_000);
  const off = on(window, "resize", () => undefined);
  return () => {
    clearInterval(ticker);
    off();
  };
}

export const startHeld = (): (() => void) =>
  $effect.root(() => {
    $effect(() => {
      held.list.length;
    });
  });

if (import.meta.hot) {
  import.meta.hot.dispose(() => undefined);
}
