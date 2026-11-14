// Each of these starts something as the module is imported.
import { on } from "svelte/events";

let tick = $state(0);

setInterval(() => {
  tick += 1;
}, 15_000);

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => undefined);
}

$effect.root(() => {
  $effect(() => undefined);
});

const socket = new WebSocket("/ws");

const offResize = on(window, "resize", () => undefined);

class Home {
  constructor() {
    $effect.root(() => undefined);
  }
}

export const home = new Home();

export { offResize, socket, tick };
