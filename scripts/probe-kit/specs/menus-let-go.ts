/**
 * Every menu, popover and sheet a person opens from the main screens lets
 * go on the first press outside it, and leaves nothing behind. The owner,
 * on the usage popover: "clicking outside the usage doesn't dismiss it,
 * disables interaction with all elements until its closed".
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model, one session that has run a turn, so the usage strip has its
 * readings) and the built dashboard, at desk 1440 (a mouse) and phone 390 (a
 * finger), in Chromium and WebKit: the home, the session's page, and on the
 * phone the rail's sheet (the burger's). Each control there that opens a
 * layer (`aria-haspopup`, a kit popover, menu, select or drawer trigger, the
 * burger) is pressed, and the layer it opened is held to:
 *
 *  1. open, the point on a control of the page outside it (one that took
 *     the hit at rest: a rail row first, then any link, then a button that
 *     opens nothing) is that control, and <html> and <body> take presses;
 *     a true modal says so instead with its scrim, which takes the point;
 *  2. one press there closes it, and the control takes the press (its click
 *     arrives there, kept from going further, so the page stays put);
 *  3. once its exit has settled (every finite run in `getAnimations()`
 *     finished), <html> and <body> compute the `pointer-events` they did at
 *     rest (never none on a page with nothing open), their `style`
 *     attributes as at rest, no control of the page newly under an `inert`,
 *     and the focus is on the control the press put it on, or back on the
 *     control that opened the layer: never left on the body.
 *
 *   bun scripts/probe-kit/run.ts menus-let-go [--engines=chromium,webkit] [--views=desk,phone]
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one layer at a time on its page, as a person opens them
import type { Page } from "playwright-core";
import { ACCOUNT, type Reply, until } from "../../scratch-fleet";
import {
  type Engine,
  frames,
  type Kit,
  open,
  type Spec,
  settle,
  type View,
} from "../kit";

const HOUR_MS = 3_600_000;
const STARTED = Date.now();
/** Every answer carries the account's usage, so the strip has its readings. */
const respond = (): Reply => ({
  everyMs: 5,
  words: ["ok"],
  limits: {
    fiveHour: { utilization: 0.25, resetsAt: STARTED + HOUR_MS },
    sevenDay: { utilization: 0.5, resetsAt: STARTED + 24 * HOUR_MS },
  },
});

const listArg = (name: string): string[] | null =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
    .split(",") ?? null;

const ENGINES = (listArg("engines") ?? ["chromium", "webkit"]) as Engine[];
const VIEWS = (listArg("views") ?? ["desk", "phone"]) as View[];
const VIEW_PX: Partial<Record<View, string>> = {
  desk: "desk 1440",
  phone: "phone 390",
};

/** A control that opens a layer: said so to assistive tech, a kit trigger, or the burger. */
const OPENER =
  "[aria-haspopup]:not([aria-haspopup=false]), [data-slot=popover-trigger], [data-slot=dropdown-menu-trigger], [data-slot=select-trigger], [data-slot=drawer-trigger], [data-slot=burger]";
/** A layer standing open: a dialog, a sheet, a drawer, a menu, a popover, a select's list. */
const LAYER =
  "[role=dialog][data-state=open], [role=menu][data-state=open], [role=listbox][data-state=open], [data-slot$='-content'][data-state=open]";
/** A true modal's scrim, standing open. */
const SCRIM =
  "[data-vaul-overlay][data-state=open], [data-slot$=overlay][data-state=open]";
/**
 * The page's controls a press outside may land on, rail rows first, then
 * any link, then a button that opens nothing on its pointerdown (a phone's
 * home holds no link). Its click reaches it and goes no further: it is kept
 * from navigating and from the page's handlers, so the page stays put.
 */
const OUTSIDE = [
  "aside a[href^='/session/'], [data-rail-sheet] a[href^='/session/']",
  "aside a[href], [data-rail-sheet] a[href]",
  "nav a[href]",
  "a[href]",
  "button:not([aria-haspopup], [data-slot$='-trigger'], [data-slot=burger], [type=submit], [disabled])",
  // A popover as wide as the phone leaves the top bar alone.
  "[data-slot=burger]",
];
/** Under a true modal's scrim any control is a point to press: the scrim takes it. */
const UNDER_SCRIM = "a[href], button";
/** A declaration on <body> that locks the page: what a modal's lock writes. */
const LOCK_STYLE = /pointer-events|overflow/;
/** How long a press is given to close the layer (its `data-state`). */
const CLOSE_MS = 1500;
/** How long a press on an opener is given to open its layer. */
const OPEN_MS = 2500;
/** How long a page drawn afresh is given to draw an opener again (the composer's come after its reads land). */
const REDRAW_MS = 15_000;

declare global {
  interface Window {
    /** Whether the click arrived at the control the press was aimed at. */
    probeTook?: boolean;
  }
}

/**
 * Every opener a person can press now, by a key that finds it again: on
 * the page with nothing open, or inside `within` (an open sheet) alone.
 */
function openersOf(args: {
  opener: string;
  layer: string;
  within: string | null;
}): string[] {
  const keys: string[] = [];
  const seen = new Map<string, number>();
  for (const el of document.querySelectorAll<HTMLElement>(args.opener)) {
    el.removeAttribute("data-probe-opener");
    // Where the walk looks (inside `within`, or anywhere), in no other open
    // layer and nothing inert, in view, and what the point at its middle finds.
    const host = args.within ? el.closest(args.within) : el;
    const inLayer = el.closest(args.layer);
    const free =
      host !== null &&
      (inLayer === null || inLayer === host) &&
      el.closest("[inert]") === null;
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const inView =
      r.width >= 4 &&
      r.height >= 4 &&
      x >= 0 &&
      y >= 0 &&
      x <= innerWidth &&
      y <= innerHeight;
    const hit = free && inView ? document.elementFromPoint(x, y) : null;
    if (!(hit && (hit === el || el.contains(hit)))) {
      continue;
    }
    const words = (el.getAttribute("aria-label") ?? el.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48);
    const base = `${el.localName}${el.dataset.slot ? `[${el.dataset.slot}]` : ""} "${words}"`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const key = n === 0 ? base : `${base} #${n + 1}`;
    el.setAttribute("data-probe-opener", key);
    keys.push(key);
  }
  return keys;
}

/**
 * The page at rest, before the layer opens: what stands open already
 * (`data-probe-rest`), the controls that take a hit at their middle
 * (`data-probe-outside`, by rank; `data-probe-any`, every one), and what
 * <html> and <body> say.
 */
function atRest(args: {
  layer: string;
  scrim: string;
  outside: string[];
  any: string;
}) {
  for (const name of [
    "data-probe-outside",
    "data-probe-any",
    "data-probe-rest",
    "data-probe-layer",
    "data-probe-picked",
  ]) {
    for (const old of document.querySelectorAll(`[${name}]`)) {
      old.removeAttribute(name);
    }
  }
  for (const el of document.querySelectorAll(`${args.layer}, ${args.scrim}`)) {
    el.setAttribute("data-probe-rest", "");
  }
  const hittable = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) {
      return false;
    }
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
      return false;
    }
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && (hit === el || el.contains(hit)));
  };
  args.outside.forEach((selector, rank) => {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (!el.hasAttribute("data-probe-outside") && hittable(el)) {
        el.setAttribute("data-probe-outside", String(rank));
      }
    }
  });
  for (const el of document.querySelectorAll<HTMLElement>(args.any)) {
    if (hittable(el)) {
      el.setAttribute("data-probe-any", "");
    }
  }
  return {
    htmlPointer: getComputedStyle(document.documentElement).pointerEvents,
    bodyPointer: getComputedStyle(document.body).pointerEvents,
    // No declaration: no attribute, or an empty one.
    html: document.documentElement.getAttribute("style") || null,
    body: document.body.getAttribute("style") || null,
    // The page's controls an inert ancestor takes out of reach.
    inert: document.querySelectorAll("[inert] [data-probe-any]").length,
    layers: document.querySelectorAll("[data-probe-rest]").length,
  };
}

/** Whether a layer the press opened stands open: one not open at rest. */
const anyOpened = () =>
  [
    ...document.querySelectorAll(
      "[role=dialog][data-state=open], [role=menu][data-state=open], [role=listbox][data-state=open], [data-slot$='-content'][data-state=open]"
    ),
  ].some((el) => !el.hasAttribute("data-probe-rest"));

/** The layer the press opened: the innermost new one standing open; every new one marked `data-probe-layer`. */
function openedLayer(layer: string): string | null {
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const fresh = [...document.querySelectorAll(layer)].filter(
    (el) => shown(el) && !el.hasAttribute("data-probe-rest")
  );
  const subject = fresh.find(
    (el, _, all) => !all.some((one) => one !== el && el.contains(one))
  );
  if (!subject) {
    return null;
  }
  for (const el of fresh) {
    el.setAttribute("data-probe-layer", "");
  }
  const slot = subject.getAttribute("data-slot");
  const role = subject.getAttribute("role");
  return `${subject.localName}${slot ? `[data-slot=${slot}]` : ""}${role ? `[role=${role}]` : ""}`;
}

/**
 * The control to press outside the layer: the best one marked at rest with
 * a point inside it clear of every open layer by 8px (under a true modal's
 * scrim, any control), its click listened for and kept from going further.
 * And what the engine says at that point now: the element found there,
 * <html>'s and <body>'s `pointer-events`, and where the focus is.
 */
function pickOutside(args: { scrim: string; outside: string[] }) {
  const name = (el: Element | null): string => {
    if (!el) {
      return "nothing";
    }
    const slot = el.getAttribute("data-slot");
    const words = (el.getAttribute("aria-label") ?? "").slice(0, 40);
    return `${el.localName}${slot ? `[data-slot=${slot}]` : ""}${words ? ` "${words}"` : ""}`;
  };
  const boxes = [...document.querySelectorAll("[data-probe-layer]")].map((el) =>
    (
      el.closest("[data-bits-floating-content-wrapper]") ?? el
    ).getBoundingClientRect()
  );
  // A scrim the layer brought: one standing at rest is the sheet's it opened in.
  const scrim = [...document.querySelectorAll(args.scrim)].some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.hasAttribute("data-probe-rest");
  });
  const clear = (x: number, y: number) =>
    x > 0 &&
    y > 0 &&
    x < innerWidth &&
    y < innerHeight &&
    boxes.every(
      (b) =>
        x < b.left - 8 || x > b.right + 8 || y < b.top - 8 || y > b.bottom + 8
    );
  /** A point inside `el`'s box clear of every layer: its middle, else the first of a 5×5 grid in it. */
  const pointIn = (el: Element) => {
    const r = el.getBoundingClientRect();
    const middle = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    if (clear(middle.x, middle.y)) {
      return middle;
    }
    for (let i = 1; i <= 5; i += 1) {
      for (let j = 1; j <= 5; j += 1) {
        const at = { x: r.x + (r.width * i) / 6, y: r.y + (r.height * j) / 6 };
        if (clear(at.x, at.y)) {
          return at;
        }
      }
    }
    return null;
  };
  const choose = (marked: HTMLElement[]) =>
    marked
      .filter(
        (el) =>
          !(
            el.closest("[data-probe-layer]") ||
            el.hasAttribute("data-probe-opener-pressed") ||
            el.getAttribute("aria-expanded") === "true"
          )
      )
      .map((el) => ({
        el,
        rank: Number(el.getAttribute("data-probe-outside") ?? 0),
        at: pointIn(el),
      }))
      .filter((c) => c.at !== null)
      .sort((a, b) => a.rank - b.rank)[0];
  /**
   * A layer that took the place of the one its opener stood in (the rail's
   * sheet gives way to Jump's popover) leaves the page it uncovered: its
   * controls by the same ranks, as the point finds them now.
   */
  const uncovered = () =>
    args.outside.flatMap((selector, rank) =>
      [...document.querySelectorAll<HTMLElement>(selector)].filter((el) => {
        const at = pointIn(el);
        const hit = at && document.elementFromPoint(at.x, at.y);
        if (hit && (hit === el || el.contains(hit))) {
          el.setAttribute("data-probe-outside", String(rank));
          return true;
        }
        return false;
      })
    );
  const best = scrim
    ? choose([...document.querySelectorAll<HTMLElement>("[data-probe-any]")])
    : (choose([
        ...document.querySelectorAll<HTMLElement>("[data-probe-outside]"),
      ]) ?? choose(uncovered()));
  window.probeTook = false;
  if (!best?.at) {
    return null;
  }
  best.el.setAttribute("data-probe-picked", "");
  // Heard on the control itself, where the click is aimed: it goes no
  // further up (the page's delegated handlers, SvelteKit's links) and does
  // nothing by default. A dismissal that listens on the document's capture
  // phase has heard it already.
  best.el.addEventListener(
    "click",
    (event) => {
      window.probeTook = true;
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true, once: true }
  );
  const hit = document.elementFromPoint(best.at.x, best.at.y);
  return {
    ...best.at,
    control: `${best.el.localName} "${(best.el.getAttribute("aria-label") ?? best.el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 32)}"`,
    hit: name(hit),
    onControl: Boolean(hit && (hit === best.el || best.el.contains(hit))),
    onScrim: Boolean(hit?.closest(args.scrim)),
    scrim,
    html: getComputedStyle(document.documentElement).pointerEvents,
    body: getComputedStyle(document.body).pointerEvents,
    focus: name(document.activeElement),
    restOpen: Array.from(document.querySelectorAll("[data-probe-rest]")).filter(
      (el) => el.isConnected && el.getAttribute("data-state") === "open"
    ).length,
  };
}

/** Whether every layer the press opened has closed: gone, or no longer `data-state=open`. */
const allClosed = () =>
  [...document.querySelectorAll("[data-probe-layer]")].every(
    (el) => !el.isConnected || el.getAttribute("data-state") !== "open"
  );

/**
 * What the engine says while the exit plays, two frames after the close
 * (bits-ui lets its body lock go a task after a close): every running run
 * with an end is held where it is, the reads taken, and let go again.
 * `held` is how many were held and how far the furthest had gone; at the
 * opener's middle (it stood there before the layer opened), what
 * `elementFromPoint` finds, and whether it is the opener. An opener that
 * went with the layer it stood in (the rail's sheet, giving way to Jump)
 * leaves the control the press went to, read the same way.
 */
async function duringExit() {
  await new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(done))
  );
  const runs = document
    .getAnimations()
    .filter(
      (run) =>
        run.playState === "running" &&
        Number.isFinite(Number(run.effect?.getComputedTiming().endTime))
    );
  for (const run of runs) {
    run.pause();
  }
  const standing = (el: Element | null) => {
    const r = el?.isConnected ? el.getBoundingClientRect() : null;
    return r && r.width > 0 && r.height > 0 ? el : null;
  };
  const opener = standing(
    document.querySelector("[data-probe-opener-pressed]")
  );
  const target =
    opener ?? standing(document.querySelector("[data-probe-picked]"));
  const r = target?.getBoundingClientRect();
  const hit = r
    ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    : null;
  const slot = hit?.closest("[data-slot]")?.getAttribute("data-slot");
  const read = {
    held: runs.length,
    progress: Math.max(
      0,
      ...runs.map((run) =>
        Math.round(Number(run.effect?.getComputedTiming().progress ?? 0) * 100)
      )
    ),
    html: getComputedStyle(document.documentElement).pointerEvents,
    body: getComputedStyle(document.body).pointerEvents,
    restOpen: Array.from(document.querySelectorAll("[data-probe-rest]")).filter(
      (el) => el.isConnected && el.getAttribute("data-state") === "open"
    ).length,
    on: opener ? "its opener" : "the control pressed",
    hit: hit
      ? `${hit.localName}${slot ? ` in [data-slot=${slot}]` : ""}`
      : "nothing",
    onTarget: Boolean(
      target && hit && (hit === target || target.contains(hit))
    ),
  };
  for (const run of runs) {
    run.play();
  }
  return read;
}

/**
 * What the engine says once the exit has settled. The opener is known by
 * its key's words (`openerKey`, as {@link openersOf} names it): a trigger
 * its site draws again is still the control that opened the layer.
 */
function afterExit(openerKey: string) {
  const keyOf = (el: Element): string => {
    const words = (el.getAttribute("aria-label") ?? el.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48);
    const slot = el.getAttribute("data-slot");
    return `${el.localName}${slot ? `[${slot}]` : ""} "${words}"`;
  };
  const at = document.activeElement;
  const picked = document.querySelector("[data-probe-picked]");
  return {
    htmlPointer: getComputedStyle(document.documentElement).pointerEvents,
    bodyPointer: getComputedStyle(document.body).pointerEvents,
    html: document.documentElement.getAttribute("style") || null,
    body: document.body.getAttribute("style") || null,
    inert: document.querySelectorAll("[inert] [data-probe-any]").length,
    focus: at ? keyOf(at) : "nothing",
    onOpener: Boolean(
      at && at !== document.body && openerKey.startsWith(keyOf(at))
    ),
    onPicked: Boolean(picked && at && (at === picked || picked.contains(at))),
    restOpen: Array.from(document.querySelectorAll("[data-probe-rest]")).filter(
      (el) => el.isConnected && el.getAttribute("data-state") === "open"
    ).length,
  };
}

const waitTrue = (page: Page, fn: () => boolean, ms: number) =>
  page
    .waitForFunction(fn, null, { timeout: ms, polling: "raf" })
    .then(() => true)
    .catch(() => false);

/** Presses the point as the view's hand does: a mouse's click, a finger's tap. */
const press = (page: Page, view: View, x: number, y: number) =>
  view === "phone" ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);

interface Screen {
  name: string;
  /** What a person does on the page first: open the layer the openers lie in. */
  pre?: (page: Page, view: View) => Promise<void>;
  ready: string;
  route: string;
  /** The views it stands in. */
  views?: View[];
  /** Its openers lie inside this open layer alone (the rail's sheet). */
  within?: string;
}

/** What the page said at rest, before the layer opened (`atRest`). */
type Rest = ReturnType<typeof atRest>;

/**
 * <html> and <body> take presses as they did at rest; where every layer
 * open at rest has gone meanwhile (the rail's sheet gives way to Jump's
 * popover), as a page with nothing open does: never none.
 */
const asAtRest = (rest: Rest, restOpen: number, html: string, body: string) =>
  restOpen < rest.layers || rest.layers === 0
    ? html !== "none" && body !== "none"
    : html === rest.htmlPointer && body === rest.bodyPointer;

/**
 * The layer closed: what the page says while its exit plays, and once it
 * has settled (`duringExit`, `afterExit`), each held to the page at rest.
 */
async function exitChecks(
  kit: Kit,
  page: Page,
  what: string,
  key: string,
  rest: Rest
): Promise<void> {
  const leaving = await page.evaluate(duringExit);
  if (leaving.held > 0) {
    kit.check(
      `${what}: while its exit plays (held at ${leaving.progress}%), <html> and <body> take presses as at rest and the point on ${leaving.on} is that control`,
      leaving.onTarget &&
        asAtRest(rest, leaving.restOpen, leaving.html, leaving.body),
      `elementFromPoint ${leaving.hit}; html ${leaving.html}; body ${leaving.body}; ${leaving.held} run(s) held`
    );
  }
  // The exit plays out: every finite run on the page finished.
  await settle(page, 0);
  await frames(page);
  const after = await page.evaluate(afterExit, key);
  const pointers = asAtRest(
    rest,
    after.restOpen,
    after.htmlPointer,
    after.bodyPointer
  );
  // Where the layer it opened in has gone too, that layer's lock went with it.
  const styles =
    after.restOpen < rest.layers
      ? after.html === rest.html && !LOCK_STYLE.test(after.body ?? "")
      : after.html === rest.html && after.body === rest.body;
  kit.check(
    `${what}: once its exit settles, <html> and <body> take presses as at rest, their style and the page's inert are as at rest, and the focus is on the pressed control or its opener`,
    pointers &&
      styles &&
      after.inert === rest.inert &&
      (after.onPicked || after.onOpener),
    JSON.stringify({
      pointerEvents: {
        html: [rest.htmlPointer, after.htmlPointer],
        body: [rest.bodyPointer, after.bodyPointer],
      },
      style: { html: [rest.html, after.html], body: [rest.body, after.body] },
      inert: [rest.inert, after.inert],
      focus: after.focus,
      onOpener: after.onOpener,
      onPicked: after.onPicked,
    })
  );
}

/** One opener on one screen: open it, press outside it, read what it left. Whether the page stands as it did. */
async function leg(
  kit: Kit,
  page: Page,
  view: View,
  key: string,
  label: string
): Promise<boolean> {
  const rest = await page.evaluate(atRest, {
    layer: LAYER,
    scrim: SCRIM,
    outside: OUTSIDE,
    any: UNDER_SCRIM,
  });
  const box = await page.evaluate((k) => {
    const el = document.querySelector(
      `[data-probe-opener=${JSON.stringify(k)}]`
    );
    if (!el) {
      return null;
    }
    el.setAttribute("data-probe-opener-pressed", "");
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, key);
  if (!box) {
    kit.note(`${label}: not on the page`);
    return false;
  }
  const url = page.url();
  await press(page, view, box.x + box.width / 2, box.y + box.height / 2);
  const opened = await waitTrue(page, anyOpened, OPEN_MS);
  if (page.url() !== url) {
    kit.note(`${label}: it goes to ${page.url()}, no layer`);
    return false;
  }
  if (!opened) {
    kit.note(`${label}: it opens no layer`);
    return true;
  }
  await settle(page, 0);
  const layer = await page.evaluate(openedLayer, LAYER);
  const pick = await page.evaluate(pickOutside, {
    scrim: SCRIM,
    outside: OUTSIDE,
  });
  if (!pick) {
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll("[data-probe-layer], [data-probe-rest]")]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${el.getAttribute("data-slot")} ${[r.left, r.top, r.right, r.bottom].map(Math.round).join(",")}`;
        })
        .join("; ")
    );
    kit.check(
      `${label}: ${layer} leaves a control of the page outside it to press`,
      false,
      `none clear of it; layers ${boxes}`
    );
    return false;
  }
  const what = `${label}: ${layer}`;
  kit.check(
    pick.scrim
      ? `${what} open, a true modal: its scrim takes the point on ${pick.control}`
      : `${what} open: the point on ${pick.control} outside it is that control, and <html> and <body> take presses as at rest`,
    pick.scrim
      ? pick.onScrim
      : pick.onControl && asAtRest(rest, pick.restOpen, pick.html, pick.body),
    `elementFromPoint ${pick.hit}; html ${pick.html}; body ${pick.body}; focus ${pick.focus}`
  );
  await press(page, view, pick.x, pick.y);
  const closed = await waitTrue(page, allClosed, CLOSE_MS);
  const took = pick.scrim
    ? true
    : await waitTrue(page, () => window.probeTook === true, 500);
  kit.check(
    pick.scrim
      ? `${what}: one press on its scrim closes it`
      : `${what}: one press on ${pick.control} closes it, and the control takes the press`,
    closed && took,
    JSON.stringify({ closed, took })
  );
  if (closed) {
    await exitChecks(kit, page, what, key, rest);
  }
  await page.evaluate(() =>
    document
      .querySelector("[data-probe-opener-pressed]")
      ?.removeAttribute("data-probe-opener-pressed")
  );
  return closed && page.url() === url;
}

/** Every opener on `screen`, each from the page at rest; a page a leg left changed is opened afresh. */
async function walk(
  kit: Kit,
  page: Page,
  view: View,
  engine: Engine,
  base: string,
  screen: Screen
): Promise<void> {
  const on = `${screen.name} · ${engine} ${VIEW_PX[view] ?? view}`;
  const find = () =>
    page.evaluate(openersOf, {
      opener: OPENER,
      layer: LAYER,
      within: screen.within ?? null,
    });
  const fresh = async () => {
    await open(page, `${base}${screen.route}`, screen.ready, 120_000);
    await settle(page, 0);
    await screen.pre?.(page, view);
  };
  await fresh();
  const keys = await find();
  kit.note(`${on}: ${keys.length} openers: ${keys.join(" | ")}`);
  for (const key of keys) {
    const label = `${on} · ${key}`;
    if (!(await find()).includes(key)) {
      await fresh();
      await until(
        "the opener on the page again",
        find,
        (now) => now.includes(key),
        REDRAW_MS
      ).catch(() => undefined);
    }
    const clean = await leg(kit, page, view, key, label).catch(
      (error: unknown) => {
        kit.check(`${label}: runs`, false, String(error).split("\n")[0]);
        return false;
      }
    );
    if (!clean) {
      await fresh();
    }
  }
}

/** The rail's sheet on a phone, opened by the burger and settled. */
const RAIL_SHEET = "[data-rail-sheet]";
async function openRail(page: Page, view: View): Promise<void> {
  const burger = await page.locator("[data-slot=burger]").boundingBox();
  if (!burger) {
    throw new Error("no burger on the page");
  }
  await press(
    page,
    view,
    burger.x + burger.width / 2,
    burger.y + burger.height / 2
  );
  await page.waitForSelector(`${RAIL_SHEET}[data-state=open]`);
  await settle(page, 0);
}

const spec: Spec = {
  name: "menus-let-go",
  async run(kit: Kit) {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const id = await fleet.spawn("claude", "Menus let go", fleet.repo, {
      account: ACCOUNT,
    });
    await fleet.send(id, "say ok");
    await until(
      "the session's turn done",
      () => fleet.instance(id),
      (row) => row?.status === "running" && row.turn_open_at === null,
      120_000
    );
    const base = await fleet.dashboard();
    const screens: Screen[] = [
      { name: "home", route: "/", ready: "[data-strip-hit]" },
      {
        name: "session",
        route: `/session/${id}`,
        ready: `[data-session-tab="${id}"]`,
      },
      {
        name: "rail sheet",
        route: `/session/${id}`,
        ready: `[data-session-tab="${id}"]`,
        pre: openRail,
        within: RAIL_SHEET,
        views: ["phone"],
      },
    ];
    for (const engine of ENGINES) {
      for (const view of VIEWS) {
        const page = await kit.page(view, { engine, theme: "light" });
        page.setDefaultTimeout(10_000);
        for (const screen of screens) {
          if (!screen.views || screen.views.includes(view)) {
            await walk(kit, page, view, engine, base, screen);
          }
        }
        await page.context().close();
      }
    }
  },
};

export default spec;
