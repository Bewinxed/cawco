/**
 * The dials of an HTML decision page (the kit's `{{DIALS}}`, hub
 * decision-page.ts): `cawcoDials(name, config)` draws a panel on the design
 * graph's own dial controls (Dials.svelte, as a program's Dials piece is
 * drawn) and hands back its controller, as the panel library it replaced did:
 * `values`, `subscribe(listener, immediate = true)` and `destroy()`. A panel
 * stands in the page's `[data-cawco-dials]` element when it has one, else
 * in a column of panels at the page's bottom-right. Its values are kept
 * under the one `dials` key, each panel's by name and path, and stand again
 * on a reload or a revision.
 *
 * The panels draw in a shadow root of their own, as the preview overlay
 * does in every page (preview overlay/page.ts): its host takes none
 * of the page's styles (`all: initial`), the house's sheet stands inside it
 * alone (`dials.css`, hub page-css.ts `shadowSheet`), and the page's own
 * elements take none of it, so a page draws the same with `{{DIALS}}` and
 * without. Nor do the dials take the page's root: their rem is the
 * browser's font size (core dials-root.ts `DIALS_REM`), and script reads
 * the house's tokens off their own root (motion curves `tokensOn`).
 *
 * The page's own script calls `cawcoDials` before this module has loaded
 * (it is a module, deferred): `{{DIALS}}` sets a stand-in first that holds
 * each call's controller and its listeners (`window.cawcoDialsHeld`), and
 * this module draws each of them, then takes `cawcoDials`'s place.
 *
 * A control the panel doesn't draw (a `{ type: "spring" }`, a list) is
 * told to the preview overlay as a page fault (core page-faults.ts), which
 * reaches the agent's `artifact_read`: the page's config is its own
 * script's, which the hub can't read from the page as a program's.
 */
import { DIALS_REM, DIALS_ROOT } from "@cawco/core/dials-root";
import { PAGE_FAULT_EVENT, type PageFault } from "@cawco/core/page-faults";
import { mount } from "svelte";
import { type DialValues, dialsOfConfig } from "../../graph/dials";
import { tokensOn } from "../../motion/curves.svelte";
import { watchEdgeFades } from "../../motion/fade-runs.svelte";
import DialsRoot, { type Panel, shown } from "./DialsRoot.svelte";
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

/** The host's dials sheet, beside this module. */
const SHEET = new URL("dials.css", import.meta.url).href;

/**
 * The dials' shadow root, made on the page's first panel: in the page's own
 * dock, else fixed over the page out of its flow (a page laid out as a grid
 * gives it no track); drawn once its sheet has loaded, so no panel shows
 * unstyled.
 */
async function makeRoot(): Promise<void> {
  const dock = document.querySelector<HTMLElement>("[data-cawco-dials]");
  const host = document.createElement("cawco-dials");
  host.style.cssText = `all: initial; ${dock ? "display: block" : "position: fixed"};`;
  const shadow = host.attachShadow({ mode: "open" });
  const sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = SHEET;
  const target = document.createElement("div");
  shadow.append(sheet, target);
  (dock ?? document.body).append(host);
  // A rem in the dials is the browser's own font size, the host's under `all: initial`, never the page's root's.
  host.style.setProperty(DIALS_REM, getComputedStyle(host).fontSize);
  await new Promise<void>((done) => {
    sheet.addEventListener("load", () => done(), { once: true });
    sheet.addEventListener("error", () => done(), { once: true });
  });
  mount(DialsRoot, { target, props: { docked: dock !== null } });
  // The house's tokens stand on the dials' own root: script reads its motion and its spaces there.
  const root = shadow.querySelector(`[${DIALS_ROOT}]`);
  if (root) {
    tokensOn(root);
  }
  // Each edge fade stands only on a scroller that runs past its box.
  watchEdgeFades(shadow);
}

/** Whether the root is made, or being made: once a page. */
let rooted = false;

/** A panel drawn for `held`: its values handed to its listeners at each turn, each control it doesn't draw told as a fault. */
function draw(held: Held): void {
  for (const unread of dialsOfConfig(held.config).unread) {
    dispatchEvent(
      new CustomEvent<PageFault>(PAGE_FAULT_EVENT, {
        detail: {
          kind: "dial",
          panel: held.name,
          path: unread.path,
          control: unread.kind,
        },
      })
    );
  }
  const { controller } = held;
  const listeners = new Set<Listener>(controller.listeners ?? []);
  const panel: Panel = {
    name: held.name,
    config: held.config,
    onvalues: (values) => {
      controller.values = values;
      for (const listener of listeners) {
        listener(values);
      }
    },
  };
  controller.subscribe = (listener, immediate = true) => {
    listeners.add(listener);
    if (immediate) {
      listener(controller.values);
    }
    return () => listeners.delete(listener);
  };
  controller.destroy = () => {
    listeners.clear();
    shown.list = shown.list.filter((one) => one !== panel);
  };
  shown.list = [...shown.list, panel];
  if (!rooted) {
    rooted = true;
    makeRoot().catch((error: unknown) => console.error("[dials]", error));
  }
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
