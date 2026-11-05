/**
 * The dials of an HTML decision page (the kit's `{{DIALS}}`, hub
 * decision-page.ts): `cawcoDials(name, config)` draws a panel on the design
 * graph's own dial controls (Dials.svelte, as a program's Dials piece is
 * drawn) and hands back its controller, as DialKit's `createDialKit` did:
 * `values`, `subscribe(listener, immediate = true)` and `destroy()`. A panel
 * stands in the page's `[data-cawco-dials]` element when it has one, else
 * in a column of panels at the page's bottom-right. Its values are kept
 * under the one `dials` key, each panel's by name and path, and stand again
 * on a reload or a revision.
 *
 * The page's own script calls `cawcoDials` before this module has loaded
 * (it is a module, deferred): `{{DIALS}}` sets a stand-in first that holds
 * each call's controller and its listeners (`window.cawcoDialsHeld`), and
 * this module draws each of them, then takes `cawcoDials`'s place.
 */
import { mount, unmount } from "svelte";
import type { DialValues } from "../../graph/dials";
import Dials from "./Dials.svelte";
import { bridge, picks } from "./page.svelte.js";

type Listener = (values: DialValues) => void;

/** A panel's controller, as the page's script holds it. */
interface Controller {
  destroy: () => void;
  subscribe: (listener: Listener, immediate?: boolean) => () => void;
  values: DialValues;
}

/** A call the stand-in held: its panel, and the controller it handed the page. */
interface Held {
  config: Record<string, unknown>;
  controller: Controller & { listeners?: Listener[] };
  name: string;
}

declare global {
  interface Window {
    cawcoDials?: (name: string, config: Record<string, unknown>) => Controller;
    cawcoDialsHeld?: Held[];
  }
}

bridge()?.on("picks", (next) => {
  picks.now = next;
});

/** Where a panel stands: the page's own dock, else a column at the page's bottom-right. */
function dockOf(): HTMLElement {
  const own = document.querySelector<HTMLElement>("[data-cawco-dials]");
  if (own) {
    return own;
  }
  let column = document.querySelector<HTMLElement>("[data-cawco-dials-column]");
  if (!column) {
    column = document.createElement("div");
    column.dataset.cawcoDialsColumn = "";
    // Over the page, on its tokens: the room's width at most, scrolling inside it past the window's height.
    column.style.cssText =
      "position: fixed; inset-inline-end: var(--space-4); inset-block-end: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); inline-size: min(var(--c-graph-room-w), calc(100vw - 2 * var(--space-4))); max-block-size: calc(100dvh - 2 * var(--space-4)); overflow-y: auto;";
    document.body.append(column);
  }
  return column;
}

/** A panel drawn for `held`: its values handed to its listeners at each turn. */
function draw(held: Held): void {
  const { controller } = held;
  const listeners = new Set<Listener>(controller.listeners ?? []);
  const target = document.createElement("div");
  dockOf().append(target);
  const drawn = mount(Dials, {
    target,
    props: {
      props: { name: held.name, config: held.config },
      onvalues: (values: DialValues) => {
        controller.values = values;
        for (const listener of listeners) {
          listener(values);
        }
      },
    },
  });
  controller.subscribe = (listener, immediate = true) => {
    listeners.add(listener);
    if (immediate) {
      listener(controller.values);
    }
    return () => listeners.delete(listener);
  };
  controller.destroy = () => {
    listeners.clear();
    unmount(drawn);
    target.remove();
  };
}

for (const held of window.cawcoDialsHeld ?? []) {
  draw(held);
}
window.cawcoDialsHeld = [];
window.cawcoDials = (name, config) => {
  const held: Held = {
    name,
    config,
    controller: {
      values: {},
      subscribe: () => () => false,
      destroy: () => undefined,
    },
  };
  draw(held);
  return held.controller;
};
