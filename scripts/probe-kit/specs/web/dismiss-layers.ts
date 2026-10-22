/**
 * Every popover and menu on the main surfaces lets go: a press outside it,
 * or Escape, dismisses it, and nothing else on the page stops taking
 * presses while it is open. The owner, on the usage popover: "clicking
 * outside the usage doesn't dismiss it, disables interaction with all
 * elements until its closed". The one exception is a true modal, which says
 * so with a scrim: a press on the scrim dismisses it.
 *
 * Each state the surfaces catalogue opens a popover or menu in
 * (surfaces/catalogue.ts, its own act), on the hub tape (hub-tape.ts) with
 * the built dashboard, in Chromium and WebKit, at desk 1440 (a mouse) and
 * phone 390 (a finger):
 *  1. a control outside it, one that stands clear of the layer and took a
 *     hit at rest (a rail row first), is what `document.elementFromPoint`
 *     finds at its middle while the layer is open, not a blocking layer;
 *     with a scrim, the scrim is;
 *  2. a real press there (a click, or a tap on the phone) closes the layer
 *     and the control takes the press (its click arrives);
 *  3. opened again, Escape closes it and the focus is back on its trigger.
 *
 *   bun scripts/probe-kit/run.ts web dismiss-layers [--states=usage-popover/open,…] [--engines=chromium,webkit] [--views=desk,phone]
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one state at a time on its page, as a person takes them
import type { Page } from "playwright-core";
import { player, readTape } from "../../hub-tape";
import { type Engine, type Kit, open, type Spec, type View } from "../../kit";
import { LAYER, type State, SURFACES } from "../../surfaces/catalogue";
import type { Scene } from "../../surfaces/scene";
import { Servers, TAPE } from "../../surfaces/walk";

/** The states that open a popover or menu, `<surface>/<state>`. */
const STATES = [
  "usage-popover/open",
  "home/machines",
  "rail/sort",
  "rail/row-menu",
  "session/attach-menu",
  "session/tab-menu",
  "project/more-menu",
  "board/filter",
  "board/drop",
  "board/label",
  "board/stages",
  "jump/open",
  "caw-panel/open",
  "workflows/new",
  "artifact/menu",
  "files/float-menu",
  "strip-new/popover",
] as const;

/**
 * A state the catalogue opens, then a step more: what stands open over the
 * layer when the owner pressed outside it (his capture: the usage popover
 * with its head's tooltip, "Until no account can start a session", open).
 */
interface After {
  after: (page: Page, view: View) => Promise<void>;
  key: string;
  of: (typeof STATES)[number];
}
const AFTER: After[] = [
  {
    key: "usage-popover/open+tip",
    of: "usage-popover/open",
    after: async (page, view) => {
      const kpi = page.locator("[data-stop-kpi]").filter({ visible: true });
      if (view === "desk") {
        await kpi.hover();
      } else {
        await kpi.tap();
      }
      await page
        .locator("[data-slot=tooltip-content]")
        .filter({ visible: true })
        .first()
        .waitFor({ timeout: 5000 });
    },
  },
];

/**
 * What a person does before a state's act, where the act leaves it out: the
 * tab menu's act sends Shift+F10 to the tab without focusing it, where a
 * keyboard reaches the tab first, so its Escape had no tab to go back to;
 * Jump's act on a desk is ⌘K from nothing focused, where a keyboard stands
 * on a control (Jump's own button), so its Escape gave the focus back to
 * the body that had it.
 */
const BEFORE: Partial<Record<string, (page: Page) => Promise<void>>> = {
  "session/tab-menu": (page) =>
    page.evaluate(() =>
      document.querySelector<HTMLElement>("[data-chosen] [role='tab']")?.focus()
    ),
  "jump/open": (page) =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          'button[aria-label="Jump to session"]'
        ),
      ]
        .find((el) => el.getBoundingClientRect().width > 0)
        ?.focus()
    ),
};

const listArg = (name: string): string[] | null =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
    .split(",") ?? null;

const ENGINES = (listArg("engines") ?? ["chromium", "webkit"]) as Engine[];
const VIEWS = (listArg("views") ?? ["desk", "phone"]) as View[];
const CHOSEN = listArg("states") ?? [...STATES, ...AFTER.map((one) => one.key)];

/** A scrim: a modal layer's overlay, which says the page under it is out of reach. */
const SCRIM =
  "[data-vaul-overlay][data-state=open], [data-slot$=overlay][data-state=open], [data-dialog-overlay][data-state=open]";
/** Outside controls, rail rows first, as the owner pressed one. */
const OUTSIDE = [
  "aside[data-slot=rail] a[href^='/session/']",
  "aside[data-slot=rail] a[href]",
  "aside a[href]",
  "a[href]",
  "button:not([disabled])",
];
/** How long a close is given to say closed (`data-state`), and a click to arrive. */
const CLOSE_MS = 1500;

interface Picked {
  /** What it is, for the line: its tag and accessible words. */
  name: string;
  x: number;
  y: number;
}

/**
 * Marks every control that took a hit at its middle at rest
 * (`data-probe-outside`), so the open state's pick is one a person could
 * press before the layer opened.
 */
function markHittable(args: { layer: string; selectors: string[] }): number {
  for (const old of document.querySelectorAll(
    "[data-probe-outside], [data-probe-rest], [data-probe-layer], [data-probe-picked], [data-probe-hit], [data-probe-trigger]"
  )) {
    for (const name of [
      "data-probe-outside",
      "data-probe-rest",
      "data-probe-layer",
      "data-probe-picked",
      "data-probe-hit",
      "data-probe-trigger",
    ]) {
      old.removeAttribute(name);
    }
  }
  // What stands open at rest (a disclosure's content) is not the state's layer.
  for (const el of document.querySelectorAll(args.layer)) {
    el.setAttribute("data-probe-rest", "");
  }
  const { selectors } = args;
  let n = 0;
  selectors.forEach((selector, rank) => {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.hasAttribute("data-probe-outside")) {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) {
        continue;
      }
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
        continue;
      }
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit))) {
        el.setAttribute("data-probe-outside", String(rank));
        n += 1;
      }
    }
  });
  return n;
}

/**
 * The layer the state is about (`data-probe-layer`: the open layer holding
 * what its ready assertion shows, never a sheet the act opened on the way
 * to it), and of the controls marked at rest the best one standing clear of
 * every layer the act opened, a rail row first. Its click is listened for
 * (`window.probeTook`), and kept from navigating, so the page stays put.
 */
function pickOutside(args: { layer: string; scrim: string; shows: string }): {
  layers: number;
  picked: Picked | null;
  scrim: boolean;
} {
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const layers = [...document.querySelectorAll(args.layer)].filter(
    (el) => shown(el) && !el.hasAttribute("data-probe-rest")
  );
  const shows = [...document.querySelectorAll(args.shows)].find(shown);
  const subject =
    layers
      .filter((el) => shows && (el === shows || el.contains(shows)))
      // The innermost: a menu in a sheet, not the sheet.
      .find(
        (el, _, all) => !all.some((one) => one !== el && el.contains(one))
      ) ?? shows;
  subject?.setAttribute("data-probe-layer", "");
  const boxes = layers.map((el) => {
    const wrapper = el.parentElement?.hasAttribute(
      "data-bits-floating-content-wrapper"
    )
      ? el.parentElement
      : el;
    return (wrapper ?? el).getBoundingClientRect();
  });
  const scrim = [...document.querySelectorAll(args.scrim)].some(shown);
  const clear = (x: number, y: number) =>
    boxes.every(
      (b) =>
        x < b.left - 8 || x > b.right + 8 || y < b.top - 8 || y > b.bottom + 8
    );
  const candidates = [
    ...document.querySelectorAll<HTMLElement>("[data-probe-outside]"),
  ]
    .filter(
      (el) =>
        !(
          layers.some((layer) => layer.contains(el)) ||
          el.getAttribute("aria-expanded") === "true" ||
          el.closest("[data-state=open][aria-haspopup], [aria-expanded=true]")
        )
    )
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        el,
        rank: Number(el.getAttribute("data-probe-outside")),
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
      };
    })
    // In view as the layer stands (opening it can scroll the list it came
    // from), and clear of every layer the act opened.
    .filter(
      (c) =>
        c.x > 0 &&
        c.y > 0 &&
        c.x < innerWidth &&
        c.y < innerHeight &&
        clear(c.x, c.y)
    )
    .sort((a, b) => a.rank - b.rank);
  const [best] = candidates;
  window.probeTook = false;
  if (!best) {
    return { layers: layers.length, picked: null, scrim };
  }
  best.el.setAttribute("data-probe-picked", "");
  // What of the press reaches the document as it bubbles (where bits-ui's
  // dismissal listens): said beside a layer that stayed open.
  window.probeSeen = [];
  for (const type of ["pointerdown", "click"]) {
    document.addEventListener(
      type,
      (event) => {
        window.probeSeen?.push(
          `${type}${event instanceof PointerEvent ? `:${event.pointerType}` : ""}`
        );
      },
      { once: true }
    );
  }
  const words = (
    best.el.getAttribute("aria-label") ??
    best.el.textContent ??
    ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return {
    layers: layers.length,
    picked: {
      name: `${best.el.localName} "${words}"`,
      x: best.x,
      y: best.y,
    },
    scrim,
  };
}

declare global {
  interface Window {
    /** What of the press on the picked control bubbled to the document. */
    probeSeen?: string[];
    /** Whether the click arrived at the page's control found at the point. */
    probeTook?: boolean;
  }
}

/**
 * What `document.elementFromPoint` finds at the pick: a control of the page
 * (`onPage`: a link, button or field outside every layer the act opened and
 * every scrim; the rail may have moved another row under the point, which
 * is as good a press), or what stands over it: a layer, a scrim, or nothing
 * where the body takes no pointer. The control found is marked
 * (`data-probe-hit`) and its click listened for (`window.probeTook`), kept
 * from navigating as SvelteKit keeps a link's, so the page stays put.
 */
function hitAt(args: { layer: string; scrim: string; x: number; y: number }): {
  hit: string;
  onPage: boolean;
  onScrim: boolean;
} {
  const hit = document.elementFromPoint(args.x, args.y);
  const picked = document.querySelector("[data-probe-picked]");
  const control = hit?.closest(
    "a[href], button, input, textarea, select, [role=button], [role=tab], [role=link]"
  );
  // Inside a layer the act opened (one open at rest, a disclosure's content,
  // is the page's), or a scrim.
  let inLayer = Boolean(control?.closest(args.scrim));
  for (let at = control ?? null; at && !inLayer; at = at.parentElement) {
    inLayer =
      at.hasAttribute("data-probe-layer") ||
      (at.matches(args.layer) && !at.hasAttribute("data-probe-rest"));
  }
  const onPage = Boolean(control && !inLayer);
  window.probeTook = false;
  if (control && onPage) {
    control.setAttribute("data-probe-hit", "");
    control.addEventListener(
      "click",
      (event) => {
        window.probeTook = true;
        event.preventDefault();
      },
      { capture: true, once: true }
    );
  }
  const name = (el: Element) =>
    `${el.localName}${el.getAttribute("data-slot") ? `[data-slot=${el.getAttribute("data-slot")}]` : ""}${el.id ? `#${el.id}` : ""}`;
  // Where the pick takes no press, the nearest of it and its ancestors that
  // says `pointer-events: none`, and whether inline: what blocks it.
  let blocked = "";
  for (let at: Element | null = picked; at; at = at.parentElement) {
    if (getComputedStyle(at).pointerEvents === "none") {
      blocked = ` (pointer-events none on ${name(at)}${(at as HTMLElement).style.pointerEvents ? ", inline" : ""})`;
      break;
    }
  }
  const said = `${hit ? name(hit) : "nothing"}${control && control !== hit ? ` in ${name(control)}` : ""}${blocked}`;
  return {
    hit: said,
    onPage,
    onScrim: Boolean(hit?.closest(args.scrim)),
  };
}

/** Whether every layer this state opened has closed (gone, or `data-state` not open). */
const allClosed = () =>
  [...document.querySelectorAll("[data-probe-layer]")].every(
    (el) => !el.isConnected || el.getAttribute("data-state") !== "open"
  );

/**
 * The trigger of the layer, outside it: the control naming it or what it
 * holds (`aria-controls`), else the one standing expanded, else the context
 * menu's trigger standing open. "none" where it was opened from another
 * layer's item (a menu's), whose trigger is that menu's.
 */
function markTrigger(): string {
  const layer = document.querySelector("[data-probe-layer]");
  const outside = (el: Element | null) =>
    el && !layer?.contains(el) ? el : null;
  const ids = layer
    ? [layer, ...layer.querySelectorAll("[id]")].map((one) => one.id)
    : [];
  const byId = ids
    .filter(Boolean)
    .flatMap((id) => [
      ...document.querySelectorAll(`[aria-controls="${CSS.escape(id)}"]`),
    ])
    .find((el) => outside(el));
  const expanded = [
    ...document.querySelectorAll(
      "[aria-haspopup][aria-expanded=true], [data-context-menu-trigger][data-state=open]"
    ),
  ].find((el) => outside(el));
  const trigger = byId ?? expanded ?? null;
  trigger?.setAttribute("data-probe-trigger", "");
  return trigger
    ? `${trigger.localName} "${(trigger.getAttribute("aria-label") ?? trigger.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}"`
    : "none";
}

/**
 * Where the focus is: on the marked trigger (or inside it); on the picked
 * control; on the page's body; or inside the layer. With no trigger marked,
 * `on` says the focus went back to a control outside the layer.
 */
function focusOnTrigger(): {
  at: string;
  on: boolean;
  onPicked: boolean;
  /** On the trigger itself, standing on the page. */
  onTrigger: boolean;
} {
  const trigger = document.querySelector("[data-probe-trigger]");
  const picked =
    document.querySelector("[data-probe-hit]") ??
    document.querySelector("[data-probe-picked]");
  const layer = document.querySelector("[data-probe-layer]");
  const at = document.activeElement;
  const control =
    at !== null &&
    at !== document.body &&
    !(layer?.isConnected && layer.contains(at));
  // A trigger in a sheet that closed as the layer opened (the phone's rail
  // sheet, which hands its own opener on: Shell `fromSheet`) is gone: the
  // focus goes back to a control still on the page.
  const box = trigger?.getBoundingClientRect();
  const gone = !(trigger?.isConnected && box && box.width > 0);
  const onTrigger = Boolean(
    trigger && !gone && at && (at === trigger || trigger.contains(at))
  );
  return {
    on: trigger && !gone ? onTrigger : control,
    onTrigger,
    onPicked: Boolean(picked && at && (at === picked || picked.contains(at))),
    at: at
      ? `${at.localName}${at.getAttribute("aria-label") ? ` "${at.getAttribute("aria-label")?.slice(0, 40)}"` : ""}`
      : "none",
  };
}

const waitTrue = async (
  page: Page,
  fn: () => boolean,
  ms = CLOSE_MS
): Promise<boolean> =>
  page
    .waitForFunction(fn, null, { timeout: ms, polling: 50 })
    .then(() => true)
    .catch(() => false);

/** One state on one page: where it opens, its act, and what comes before and after it. */
interface Leg {
  after?: After["after"];
  base: string;
  before?: (page: Page) => Promise<void>;
  label: string;
  page: Page;
  route: string;
  scene: Scene;
  state: State;
  view: View;
}

/** What only the state's layer shows (its ready assertion's `shows`). */
const showsOf = ({ state, scene }: Leg): string =>
  (typeof state.ready === "function" ? state.ready(scene) : state.ready).shows;

/** `state`'s route opened fresh, its act done and the step after it, the layer standing open. */
async function openState(on: Leg): Promise<void> {
  const { page, base, route, state, scene, view } = on;
  await open(page, `${base}${route}`, "body");
  await page.evaluate(markHittable, { layer: LAYER, selectors: OUTSIDE });
  await on.before?.(page);
  await state.act?.(page, scene);
  await page
    .locator(showsOf(on))
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 10_000 });
  // The opening's motion lands before anything is pressed.
  await page.waitForTimeout(400);
  await on.after?.(page, view);
}

async function leg(kit: Kit, on: Leg): Promise<void> {
  const { page, view, label } = on;
  // 1 and 2: an outside control takes the hit and the press, and the layer closes.
  try {
    await openState(on);
  } catch (error) {
    kit.check(`${label}: opens`, false, String(error).split("\n")[0]);
    return;
  }
  const pick = await page.evaluate(pickOutside, {
    layer: LAYER,
    scrim: SCRIM,
    shows: showsOf(on),
  });
  if (pick.picked) {
    const { x, y } = pick.picked;
    const hit = await page.evaluate(hitAt, {
      layer: LAYER,
      scrim: SCRIM,
      x,
      y,
    });
    kit.check(
      pick.scrim
        ? `${label}: a modal says so with its scrim, which takes the hit at ${pick.picked.name}`
        : `${label}: elementFromPoint at ${pick.picked.name} outside it is a control of the page, no blocking layer`,
      pick.scrim ? hit.onScrim : hit.onPage,
      JSON.stringify({ hit: hit.hit, scrim: pick.scrim })
    );
    await page.evaluate(markTrigger);
    if (view === "desk") {
      await page.mouse.click(x, y);
    } else {
      await page.touchscreen.tap(x, y);
    }
    const closed = await waitTrue(page, allClosed);
    const took = pick.scrim
      ? true
      : await waitTrue(page, () => window.probeTook === true, 500);
    const seen = await page.evaluate(() => window.probeSeen ?? []);
    kit.check(
      pick.scrim
        ? `${label}: a press on its scrim closes it`
        : `${label}: a press at ${pick.picked.name} closes it and the control there takes the press`,
      closed && took,
      JSON.stringify({ closed, took, atDocument: seen })
    );
    if (!pick.scrim) {
      // The press put the focus where it landed (the control, or the body
      // where a click focuses no link): the close hands it to no trigger.
      await page.waitForTimeout(100);
      const focus = await page.evaluate(focusOnTrigger);
      kit.check(
        `${label}: after that press the focus stays where the press put it, not on its trigger`,
        focus.onPicked || !focus.onTrigger,
        JSON.stringify({ focus: focus.at })
      );
    }
  } else {
    kit.note(
      `${label}: it leaves no control outside it clear to press (${pick.layers} layer(s) open)`
    );
  }

  // 3: opened again, Escape closes it and the focus is back on its trigger.
  try {
    await openState(on);
  } catch (error) {
    kit.check(`${label}: opens again`, false, String(error).split("\n")[0]);
    return;
  }
  await page.evaluate(pickOutside, {
    layer: LAYER,
    scrim: SCRIM,
    shows: showsOf(on),
  });
  const trigger = await page.evaluate(markTrigger);
  await page.keyboard.press("Escape");
  const closed = await waitTrue(page, allClosed);
  const focus = await page.evaluate(focusOnTrigger);
  kit.check(
    trigger === "none"
      ? `${label}: Escape closes it and the focus is back on a control outside it (it opened from another layer's item)`
      : `${label}: Escape closes it and the focus is back on its trigger (${trigger})`,
    closed && focus.on,
    JSON.stringify({ closed, focus: focus.at })
  );
}

const spec: Spec = {
  name: "dismiss-layers",
  async run(kit) {
    const tape = await readTape(TAPE);
    const scene = tape.scene as Scene;
    const played = player(tape);
    const servers = new Servers(kit, played, tape.held);
    try {
      const base = await servers.base("built");
      const states = CHOSEN.map((key) => {
        const extra = AFTER.find((one) => one.key === key);
        const [surfaceName, stateName] = (extra?.of ?? key).split("/");
        const surface = SURFACES.find((s) => s.name === surfaceName);
        const state = surface?.states.find((s) => s.name === stateName);
        if (!(surface && state)) {
          throw new Error(`no such state in the catalogue: ${key}`);
        }
        return {
          key,
          surface,
          state,
          after: extra?.after,
          before: BEFORE[extra?.of ?? key],
        };
      });
      for (const engine of ENGINES) {
        for (const view of VIEWS) {
          const width = view === "phone" ? "phone" : "desk";
          const page = await kit.page(view, { engine, theme: "light" });
          await servers.attach(page.context());
          await page.clock.install({ time: tape.at });
          page.setDefaultTimeout(10_000);
          for (const { key, surface, state, after, before } of states) {
            if (state.widths && !state.widths.includes(width)) {
              continue;
            }
            await leg(kit, {
              base,
              before,
              label: `${key} · ${engine} ${VIEWS_PX[view] ?? view}`,
              page,
              route: (state.route ?? surface.route)(scene),
              scene,
              state,
              after,
              view,
            });
          }
          await page.context().close();
        }
      }
    } finally {
      await servers.close();
      played.stop();
    }
  },
};

const VIEWS_PX: Partial<Record<View, string>> = {
  desk: "desk 1440",
  phone: "phone 390",
};

export default spec;
