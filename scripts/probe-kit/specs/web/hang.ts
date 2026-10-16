/**
 * Every card that hangs from its anchor (HangCard, DESIGN.md "A card that
 * hangs from its anchor"), on the benches (no hub): Caw's panel, the
 * machines popover and the Jump palette from the top bar's glass
 * (/motion/echo), Caw's panel on the staged feed (/motion/caw-notices), the
 * session card and a tab's options menu from their tab
 * (/motion/folder-proof). On the desk and the phone, light and dark.
 *
 * Each card that slides, caught on the clock (anim.ts) as it opens and as
 * it closes:
 *  - only `translate` runs on the card and its floating wrapper (engine);
 *  - read at 0, 25, 50, 75 and 100%: the card's translate moves one way to
 *    rest, and the cut it comes down from behind (the wrapper's box and
 *    clip-path) never moves (motion by seek);
 *  - it is gone once closed.
 * Each card at rest:
 *  - its top on its anchor's drawn foot, within 1px; inside the viewport
 *    (geometry);
 *  - where it meets its anchor (ink): no seam across the neck, no break down
 *    a flush side's edge, and its top edge never a double line;
 *  - its rest against the owner's approved baseline (diff).
 * On the desk, the glass's behaviour: ⌘K stands Jump open at once and Esc
 * takes it away at once, a press brings it down and it slides back up
 * whatever closes it; ⌘K focuses its field and it hangs; typing reaches it;
 * Esc, its glass again, or a press outside closes it; one glass card at a
 * time, focus following; Esc gives the focus back to what had it before the
 * first card opened.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each card and step is read in order, case by case.
import type { Page } from "playwright-core";
import { Clock } from "../../anim";
import { diff } from "../../diff";
import { r2 } from "../../geom";
import { capture, dx, dy, px, type Rgb } from "../../ink";
import { jointGeometry, jointInk, jointTurns } from "../../joint";
import {
  frames,
  type Kit,
  open,
  type Spec,
  settle,
  THEMES,
  type View,
} from "../../kit";

const VIEWS_READ: View[] = ["desk", "phone"];
const OPEN_PCTS = [0, 25, 50, 75, 100];
const CLOSE_PCTS = [0, 50, 100];
const ROOM = 48;
const GLASS = "[data-bar-group]";
/** A bench that leaves the shell's bar whole and draws no hub banner. */
const GLASS_ROUTE = "/motion/echo";
const TABS_ROUTE = "/motion/folder-proof?at=1&work=working";

interface Card {
  anchor: string;
  card: string;
  close: (page: Page) => Promise<void>;
  /** The anchor's drawn foot, when it is not the anchor's own bottom. */
  foot?: string;
  name: string;
  open: (page: Page) => Promise<unknown>;
  /** What stands the opener in reach (the phone's sidebar), run before the clock is held. */
  prepare?: (page: Page) => Promise<void>;
  route: string;
  /** It opens with no slide to catch (the staged panel): its rest alone is read. */
  still?: boolean;
  /** It hangs from a folder tab as one silhouette with it (motion/hang-shape): read as that shape. */
  tab?: boolean;
}

const esc = (page: Page) => page.keyboard.press("Escape");

function cardsAt(touch: boolean): Card[] {
  const glass = (name: string, card: string, opener: Card["open"]): Card => ({
    name,
    route: GLASS_ROUTE,
    card,
    anchor: GLASS,
    foot: `${GLASS} .join`,
    open: opener,
    close: esc,
  });
  return [
    glass("caw", ".kit-pop.caw-pop", (page) => page.click("[data-needs-caw]")),
    {
      ...glass(
        "caw-staged",
        ".kit-pop.caw-pop[data-state='open']",
        async () => undefined
      ),
      route: touch
        ? "/motion/caw-notices?frame&fixture=full&width=phone"
        : "/motion/caw-notices?fixture=full&width=desk",
      still: true,
    },
    {
      name: "session-card",
      route: TABS_ROUTE,
      card: ".kit-pop.session-details-popover",
      anchor: ".session-tabs .tab[data-chosen]",
      open: async (page) => {
        await page.focus(".session-tabs .tab[data-chosen] [data-session-tab]");
        await page.keyboard.press("ArrowDown");
      },
      close: esc,
      tab: true,
    },
    {
      name: "tab-menu",
      route: TABS_ROUTE,
      card: "[data-slot='context-menu-content'][data-state='open']",
      anchor: ".session-tabs .tab[data-chosen]",
      // Shift+F10 on the chosen tab, as a keyboard and a screen reader
      // open its menu (WAI-ARIA APG, Tabs).
      open: (page) =>
        page.evaluate(() =>
          document
            .querySelector<HTMLElement>(
              ".session-tabs .tab[data-chosen] [role='tab']"
            )
            ?.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "F10",
                shiftKey: true,
                bubbles: true,
              })
            )
        ),
      close: esc,
      tab: true,
    },
    ...(touch
      ? [
          // A phone keeps Jump in its sidebar; it hangs from the bar's glass.
          {
            ...glass("jump", ".kit-pop.jump-pop", (page) =>
              page.click(".rail-sheet button.search")
            ),
            prepare: async (page: Page) => {
              await page.click(".burger");
              await settle(page, 300);
            },
          },
        ]
      : [
          glass("machines", ".kit-pop.machines-pop", (page) =>
            page.click(".bar-item.machines")
          ),
          glass("jump", ".kit-pop.jump-pop", (page) =>
            page.click("[data-share='jump']")
          ),
        ]),
  ];
}

/** The card against its anchor: boxes, the foot, its flush side and its neck. */
const measure = (page: Page, card: Card) =>
  page.evaluate(
    ({ c, a, f }) => {
      const cardEl = document.querySelector<HTMLElement>(c);
      const anchorEl = document.querySelector<HTMLElement>(a);
      if (!(cardEl && anchorEl)) {
        return null;
      }
      const cb = cardEl.getBoundingClientRect();
      const ab = anchorEl.getBoundingClientRect();
      const footEl = f ? document.querySelector<HTMLElement>(f) : null;
      // The join reaches 1px under the foot, into the card's top edge.
      const foot = footEl
        ? footEl.getBoundingClientRect().bottom - 1
        : ab.bottom;
      const s = getComputedStyle(cardEl);
      return {
        card: {
          left: cb.left,
          top: cb.top,
          right: cb.right,
          bottom: cb.bottom,
        },
        anchor: {
          left: ab.left,
          top: ab.top,
          right: ab.right,
          bottom: ab.bottom,
        },
        foot,
        flush: cardEl.dataset.flush ?? null,
        neck: [
          "--neck-start",
          "--neck-end",
          "--neck-flare-start",
          "--neck-flare-end",
        ].map((n) => Number.parseFloat(s.getPropertyValue(n)) || 0),
        viewport: innerWidth,
      };
    },
    { c: card.card, a: card.anchor, f: card.foot }
  );
type Measured = NonNullable<Awaited<ReturnType<typeof measure>>>;

/** What every animation on the card and its floating wrapper runs, by property. */
const props = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const card = document.querySelector(s);
    const out = new Set<string>();
    for (const el of [card, card?.parentElement]) {
      for (const run of el?.getAnimations() ?? []) {
        for (const frame of (
          run.effect as KeyframeEffect | null
        )?.getKeyframes() ?? []) {
          for (const k of Object.keys(frame)) {
            if (
              !["offset", "easing", "composite", "computedOffset"].includes(k)
            ) {
              out.add(k);
            }
          }
        }
        if (run instanceof CSSTransition) {
          out.add(run.transitionProperty);
        }
      }
    }
    return [...out];
  }, sel);

/**
 * How far the card is drawn from where it rests, along y (its top against
 * the cut: the translate as laid out, whatever units it is written in, a
 * shut card's `calc(-100% - reach)` too), and the cut's place (its
 * wrapper's box top and clip-path).
 */
const slide = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const card = document.querySelector<HTMLElement>(s);
    const wrapper = card?.parentElement;
    const y =
      card && wrapper
        ? card.getBoundingClientRect().top - wrapper.getBoundingClientRect().top
        : 0;
    return {
      y,
      cut: wrapper
        ? `${Math.round(wrapper.getBoundingClientRect().top * 100) / 100} ${getComputedStyle(wrapper).clipPath}`
        : "none",
    };
  }, sel);

/**
 * Where the card meets its anchor, at rest (device px):
 *  - seam: across the neck inside its flares, the pixels within 2px of the
 *    foot unlike both the anchor 4px above and the card 4px below by more
 *    than 3 levels (a line drawn between them);
 *  - breaks: down a flush side drawn (not the screen's edge), from 8px above
 *    the foot to 12px under it, the rows with no ink in its outer 4 columns;
 *  - lines: 30px in from the side away from the neck, the runs of rows by the
 *    card's top unlike both the page above and the card below, split where
 *    their ink turns: the lines its top edge reads as.
 */
async function meeting(page: Page, at: Measured) {
  const a = at.anchor;
  const c = at.card;
  const x = Math.max(0, Math.min(a.left, c.left) - ROOM);
  const y = Math.max(0, Math.min(a.top, c.top) - ROOM);
  const vp = page.viewportSize() ?? { width: 0, height: 0 };
  const clip = {
    x,
    y,
    width: Math.min(vp.width, Math.max(a.right, c.right) + ROOM) - x,
    height: Math.min(vp.height, Math.max(a.bottom, c.bottom) + ROOM) - y,
  };
  const r = await capture(page, clip);
  const step = (p: Rgb, q: Rgb) =>
    Math.max(...p.map((v, k) => Math.abs(v - (q[k] ?? 0))));
  const [start, end, flareStart, flareEnd] = at.neck as [
    number,
    number,
    number,
    number,
  ];
  let seam = 0;
  const fy = Math.round(dy(r, at.foot));
  for (
    let X = Math.round(dx(r, c.left + start + flareStart + 3));
    X <= dx(r, c.left + end - flareEnd - 3);
    X += 1
  ) {
    const above = px(r, X, fy - 8);
    const below = px(r, X, fy + 8);
    for (let Y = fy - 4; Y < fy + 4; Y += 1) {
      const p = px(r, X, Y);
      seam += Math.min(step(p, above), step(p, below)) > 3 ? 1 : 0;
    }
  }
  let breaks: number | null = null;
  if (at.flush === "end" ? c.right < at.viewport : at.flush === "start") {
    const side =
      at.flush === "end"
        ? Math.round(dx(r, c.right)) - 1
        : Math.round(dx(r, c.left));
    const inward = at.flush === "end" ? -1 : 1;
    breaks = 0;
    for (let Y = fy - 16; Y < fy + 24; Y += 1) {
      const fill = px(r, side + inward * 6, Y);
      let hit = false;
      for (let k = 0; k <= 3 && !hit; k += 1) {
        hit = step(px(r, side + inward * k, Y), fill) > 16;
      }
      breaks += hit ? 0 : 1;
    }
  }
  const lx = Math.round(dx(r, start > 40 ? c.left + 30 : c.right - 30));
  const ty = Math.round(dy(r, c.top));
  const pageInk = px(r, lx, ty - 20);
  const inside = px(r, lx, ty + 20);
  let lines = 0;
  let last: { y: number; ink: Rgb } | null = null;
  for (let Y = ty - 12; Y < ty + 12; Y += 1) {
    const p = px(r, lx, Y);
    if (step(p, pageInk) > 16 && step(p, inside) > 16) {
      if (!last || Y !== last.y + 1 || step(p, last.ink) > 24) {
        lines += 1;
      }
      last = { y: Y, ink: p };
    }
  }
  return { seam, breaks, lines, clip };
}

async function readCard(kit: Kit, page: Page, card: Card, where: string) {
  const name = `${card.name} ${where}`;
  const sep = card.route.includes("?") ? "&" : "?";
  const [, theme] = where.split(" ");
  await open(
    page,
    `${await kit.bench()}${card.route}${sep}theme=${theme}`,
    card.route === TABS_ROUTE
      ? ".session-tabs .tab[data-chosen]"
      : "[data-needs-caw]",
    120_000
  );
  await settle(page, 400);
  await card.prepare?.(page);
  if (card.tab) {
    await readTabHang(kit, page, card, name);
    return;
  }
  if (!card.still) {
    const clock = await Clock.on(page);
    for (const [phase, act, pcts] of [
      ["open", () => card.open(page), OPEN_PCTS],
      ["close", () => card.close(page), CLOSE_PCTS],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: the open, then the close
      await clock.catchRuns(act, ".kit-hang");
      const runs = await props(
        page,
        card.card.replace("[data-state='open']", "")
      );
      kit.check(
        `${name}: only translate runs as it ${phase}s`,
        runs.length > 0 && runs.every((p) => p === "translate"),
        runs.join(", ") || "nothing runs"
      );
      const read: { y: number; cut: string }[] = [];
      for (const pct of pcts) {
        // biome-ignore lint/performance/noAwaitInLoops: one frame at a time
        await clock.seek(pct / 100);
        read.push(
          await slide(page, card.card.replace("[data-state='open']", ""))
        );
      }
      const ys = read.map((one) => one.y);
      const way = phase === "open" ? 1 : -1;
      const oneWay = ys.every(
        (v, k) => k === 0 || (v - (ys[k - 1] as number)) * way >= -0.5
      );
      const rest = phase === "open" ? Math.abs(ys.at(-1) ?? 1) < 0.5 : true;
      kit.check(
        `${name}: as it ${phase}s it slides one way${phase === "open" ? " to rest" : ""}, under a cut that never moves`,
        oneWay && rest && new Set(read.map((one) => one.cut)).size === 1,
        `translate y ${ys.map(r2).join(" → ")}; cut ${[...new Set(read.map((one) => one.cut))].join(" | ")}`
      );
      await clock.release();
      await settle(page, 200);
      if (phase === "open") {
        await atRest(kit, page, card, name);
      }
    }
    const gone = await page.evaluate(
      (s) => document.querySelector(`${s}[data-state='open']`) === null,
      card.card.replace("[data-state='open']", "")
    );
    kit.check(`${name}: gone once closed`, gone);
    return;
  }
  await card.open(page);
  await page.waitForSelector(card.card, { timeout: 10_000 });
  await settle(page, 400);
  await atRest(kit, page, card, name);
}

async function atRest(kit: Kit, page: Page, card: Card, name: string) {
  const at = await measure(page, card);
  if (!at) {
    kit.check(
      `${name}: stands open`,
      false,
      `${card.card} or ${card.anchor} not found`
    );
    return;
  }
  const gap = at.card.top - at.foot;
  kit.check(
    `${name}: its top on its anchor's foot, inside the viewport`,
    Math.abs(gap) <= 1 &&
      at.card.left >= -0.5 &&
      at.card.right <= at.viewport + 0.5,
    `gap ${r2(gap)}px, card ${r2(at.card.left)}–${r2(at.card.right)} of ${at.viewport}`
  );
  // The cut across the neck (app.css `.kit-hang::before`) runs from the
  // anchor's start less its flare to its end plus its flare, inside the
  // card; a side where the anchor's edge meets the card's (within a pixel,
  // HangCard `neckAt`) has no flare. Measured from a width the card no
  // longer had, a flush side read as not and its cut ran the 12px flare
  // past the card's side (HangCard's `sized` draws it again).
  const [nStart, nEnd, fStart, fEnd] = at.neck as [
    number,
    number,
    number,
    number,
  ];
  const cardW = at.card.right - at.card.left;
  const meetsStart = Math.abs(at.card.left - at.anchor.left) <= 1;
  const meetsEnd = Math.abs(at.card.right - at.anchor.right) <= 1;
  kit.check(
    `${name}: its cut stands within it, with no flare on a side its anchor's edge meets`,
    nStart - fStart >= -0.5 &&
      nEnd + fEnd <= cardW + 0.5 &&
      (!meetsStart || fStart === 0) &&
      (!meetsEnd || fEnd === 0),
    `cut ${r2(nStart - fStart)}–${r2(nEnd + fEnd)} of ${r2(cardW)}, flares ${fStart}/${fEnd}, flush ${at.flush ?? "none"}`
  );
  const m = await meeting(page, at);
  kit.check(
    `${name}: no seam across the neck, no break down a flush side, its top never a double line`,
    m.seam === 0 && (m.breaks ?? 0) === 0 && m.lines <= 1,
    `seam ${m.seam}px, breaks ${m.breaks ?? "no flush side drawn"}, lines ${m.lines}`
  );
  await diff(kit, page, name.replaceAll(" ", "-"), { clip: m.clip });
}

/**
 * Jump frame by frame for 30 frames after `act`: from its first frame drawn
 * out of the glass (or gone), its translate, and what runs on the card, its
 * wrapper and the glass's join.
 */
async function sample(page: Page, act: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: unknown[]; __done: boolean };
    w.__frames = [];
    w.__done = false;
    let n = 0;
    const step = () => {
      const el = document.querySelector<HTMLElement>(".kit-pop.jump-pop");
      const foot = document.querySelector("[data-bar-group] .join");
      const runs = el
        ? [...el.getAnimations(), ...(el.parentElement?.getAnimations() ?? [])]
        : [];
      w.__frames.push({
        open: el?.dataset.state === "open",
        shown: el?.hasAttribute("data-shown") ?? false,
        translate: el ? getComputedStyle(el).translate : null,
        runs: runs.length,
        joinRuns: foot?.getAnimations().length ?? 0,
      });
      n += 1;
      if (n < 30) {
        requestAnimationFrame(step);
      } else {
        w.__done = true;
      }
    };
    requestAnimationFrame(step);
  });
  await act();
  await page.waitForFunction(
    () => (window as unknown as { __done: boolean }).__done
  );
  const list = (await page.evaluate(
    () => (window as unknown as { __frames: unknown[] }).__frames
  )) as {
    open: boolean;
    shown: boolean;
    translate: string | null;
    runs: number;
    joinRuns: number;
  }[];
  const shown = list.findIndex((f) => f.open && f.shown);
  return {
    shown,
    gone: list.findIndex((f) => !f.open),
    translateThen: shown >= 0 ? list[shown]?.translate : null,
    cardFrames: list.filter((f) => f.runs > 0).length,
    joinFrames: list.filter((f) => f.joinRuns > 0).length,
  };
}

async function behaviour(kit: Kit, page: Page, theme: string) {
  const where = `glass desk ${theme}`;
  await open(
    page,
    `${await kit.bench()}${GLASS_ROUTE}?theme=${theme}`,
    "[data-needs-caw]",
    120_000
  );
  await settle(page, 400);
  const openOf = () =>
    page.evaluate(() =>
      [".caw-pop", ".machines-pop", ".jump-pop"].filter((s) =>
        document.querySelector(`${s}[data-state='open']`)
      )
    );
  const still = (t: string | null | undefined) =>
    t === "none" || t === "0px" || t === "0px 0px";
  const keyOpen = await sample(page, () => page.keyboard.press("Control+k"));
  kit.check(
    `${where}: ⌘K stands Jump open at once`,
    keyOpen.shown >= 0 &&
      still(keyOpen.translateThen) &&
      keyOpen.cardFrames === 0 &&
      keyOpen.joinFrames === 0,
    JSON.stringify(keyOpen)
  );
  const keyClose = await sample(page, () => esc(page));
  kit.check(
    `${where}: Esc takes it away at once`,
    keyClose.gone >= 0 &&
      keyClose.gone <= 2 &&
      keyClose.cardFrames === 0 &&
      keyClose.joinFrames === 0,
    JSON.stringify(keyClose)
  );
  const pressOpen = await sample(page, () => page.click("[data-share='jump']"));
  kit.check(
    `${where}: a press brings it down`,
    pressOpen.cardFrames > 0,
    JSON.stringify(pressOpen)
  );
  const byGlass = await sample(page, () => page.click("[data-share='jump']"));
  kit.check(
    `${where}: it slides back up when its glass closes it`,
    byGlass.cardFrames > 0,
    JSON.stringify(byGlass)
  );
  await page.click("[data-share='jump']");
  await settle(page);
  const byEsc = await sample(page, () => esc(page));
  kit.check(
    `${where}: it slides back up when Esc closes a pressed open`,
    byEsc.cardFrames > 0,
    JSON.stringify(byEsc)
  );
  await settle(page);
  await page.keyboard.press("Control+k");
  await settle(page);
  const focus = await page.evaluate(
    () =>
      document.activeElement?.closest(".jump-pop") !== null &&
      document.activeElement?.tagName
  );
  const hangs = await measure(page, {
    name: "jump",
    route: GLASS_ROUTE,
    card: ".kit-pop.jump-pop",
    anchor: GLASS,
    foot: `${GLASS} .join`,
    open: async () => undefined,
    close: async () => undefined,
  });
  kit.check(
    `${where}: ⌘K opens Jump alone, its field focused, hanging on the glass's foot`,
    JSON.stringify(await openOf()) === '[".jump-pop"]' &&
      focus === "INPUT" &&
      !!hangs &&
      Math.abs(hangs.card.top - hangs.foot) <= 1,
    `focus ${focus}, gap ${hangs ? r2(hangs.card.top - hangs.foot) : "-"}`
  );
  await page.keyboard.type("zz");
  await page.keyboard.press("ArrowDown");
  const typed = await page.evaluate(
    () =>
      (document.querySelector(".jump-pop input") as HTMLInputElement | null)
        ?.value
  );
  kit.check(
    `${where}: typing reaches Jump's field`,
    typed === "zz",
    `"${typed}"`
  );
  const closes: [string, () => Promise<unknown>][] = [
    ["Esc", () => esc(page)],
    ["its glass again", () => page.click("[data-share='jump']")],
    ["a press outside", () => page.mouse.click(700, 600)],
  ];
  for (const [how, act] of closes) {
    if (how !== "Esc") {
      // biome-ignore lint/performance/noAwaitInLoops: each close from Jump standing open
      await page.click("[data-share='jump']");
      await settle(page);
      kit.check(
        `${where}: a press on the glass opens Jump`,
        JSON.stringify(await openOf()) === '[".jump-pop"]'
      );
    }
    await act();
    await settle(page);
    const left = await openOf();
    kit.check(
      `${where}: ${how} closes Jump`,
      left.length === 0,
      left.join(", ")
    );
  }
  await page.click("[data-share='jump']");
  await settle(page);
  await page.click(".bar-item.machines");
  await settle(page);
  const machines = await openOf();
  await page.keyboard.press("Control+k");
  await settle(page);
  const swapped = await openOf();
  const focusAfter = await page.evaluate(
    () => document.activeElement?.closest(".jump-pop") !== null
  );
  await page.click("[data-needs-caw]");
  await settle(page);
  const caw = await openOf();
  kit.check(
    `${where}: one glass card at a time, the focus following`,
    JSON.stringify(machines) === '[".machines-pop"]' &&
      JSON.stringify(swapped) === '[".jump-pop"]' &&
      focusAfter &&
      JSON.stringify(caw) === '[".caw-pop"]',
    `machines over Jump: ${machines}; ⌘K over machines: ${swapped} (focus in Jump ${focusAfter}); Caw over Jump: ${caw}`
  );
  await esc(page);
  await settle(page);
  // What had it before the first of them opened: the search glass, whose
  // press opened Jump (DESIGN.md, "The glass's cards").
  const back = await page.evaluate(
    () => document.activeElement?.matches("[data-share='jump']") ?? false
  );
  kit.check(
    `${where}: Esc gives the focus back to what had it before the first card opened`,
    back
  );
}

/** The outline layer's path and the hang's surface as drawn now: the one shape. */
const drawnShape = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const card = document.querySelector<HTMLElement>(s);
    const line = document.querySelector<SVGPathElement>(
      ".hang-outline path.line"
    );
    const d = line?.getAttribute("d") ?? "";
    const box = line?.getBBox();
    return {
      d,
      subpaths: (d.match(/M/g) ?? []).length,
      closed: d.trim().endsWith("Z"),
      bottom: box ? box.y + box.height : 0,
      top: card?.getBoundingClientRect().top ?? 0,
      clip: card?.style.clipPath ?? "",
      shown:
        (line?.closest("svg") as SVGElement | null)?.style.display !== "none",
    };
  }, sel);

/**
 * A hang from a folder tab (owner: "why aren't these the blended/merged menu
 * that morphs out of the tab?"): it grows out of the tab's foot and folds
 * back on one clock (`hang-grow`), nothing else running on it; read at every
 * fraction, the outline is one closed path round tab and hang, its foot
 * moving one way, the surface cut to it. At rest: the joint (`atJoint`) and
 * its look against the owner's approved one.
 */
async function readTabHang(kit: Kit, page: Page, card: Card, name: string) {
  const sel = card.card.replace("[data-state='open']", "");
  const clock = await Clock.on(page);
  for (const [phase, act, pcts] of [
    ["open", () => card.open(page), OPEN_PCTS],
    ["close", () => card.close(page), CLOSE_PCTS],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: the open, then the close
    await clock.catchRuns(act, ".kit-hang");
    const runs = await props(page, sel);
    kit.check(
      `${name}: only its grow clock runs as it ${phase}s (--hang-grow)`,
      runs.length > 0 && runs.every((p) => p === "--hang-grow"),
      runs.join(", ") || "nothing runs"
    );
    const read: Awaited<ReturnType<typeof drawnShape>>[] = [];
    for (const pct of pcts) {
      // biome-ignore lint/performance/noAwaitInLoops: one frame at a time
      await clock.seek(pct / 100);
      await frames(page);
      read.push(await drawnShape(page, sel));
    }
    const way = phase === "open" ? 1 : -1;
    const feet = read.map((one) => one.bottom);
    const oneWay = feet.every(
      (v, k) => k === 0 || (v - (feet[k - 1] as number)) * way >= -0.5
    );
    const whole = read.every(
      (one) =>
        one.shown &&
        one.subpaths === 1 &&
        (one.closed || one.bottom - one.top < 1) &&
        one.clip.startsWith("path(")
    );
    kit.check(
      `${name}: as it ${phase}s it is one shape at every frame, one closed path round tab and hang, its foot moving one way, its surface cut to it`,
      whole && oneWay,
      `foot ${feet.map(r2).join(" → ")}; ${read.map((one) => `${one.subpaths} path${one.closed ? " closed" : " open"}`).join(", ")}`
    );
    await clock.release();
    await settle(page, 250);
    if (phase === "open") {
      await atJoint(kit, page, sel, name);
      const at = await measure(page, card);
      if (at) {
        const m = await meeting(page, at);
        await diff(kit, page, name.replaceAll(" ", "-"), { clip: m.clip });
      }
    }
  }
  const gone = await page.evaluate(
    (s) => document.querySelector(`${s}[data-state='open']`) === null,
    sel
  );
  kit.check(`${name}: gone once closed`, gone);
}

/**
 * The joint at rest (owner: "the curve of the foot doesn't match the curve
 * of the tab, and it needs to be wider to fit and connect well"; "the rim
 * doesn't smoothly connect"): the hang reaches past each foot's tip or
 * stands flush with the flank; the foot's curve runs into its edge on one
 * tangent (within 2°); and across the outline, all along the joint, one
 * stroke as full, as thin and as sharp as on the hang's straight side, with
 * no second edge within 3px.
 */
async function atJoint(kit: Kit, page: Page, sel: string, name: string) {
  const g = await jointGeometry(page, sel);
  if (!g) {
    kit.check(`${name}: hangs from its tab`, false, "no hung tab or outline");
    return;
  }
  const footStart = g.tab.left - g.flare;
  const footEnd = g.tab.right + g.flare;
  const wide =
    (g.flush.start
      ? Math.abs(g.card.left - g.tab.left) <= 1
      : g.card.left <= footStart + 0.01) &&
    (g.flush.end
      ? Math.abs(g.card.right - g.tab.right) <= 1
      : g.card.right >= footEnd - 0.01);
  const turns = jointTurns(g);
  kit.check(
    `${name}: it reaches past each foot (or stands flush with the flank), the foot running into its edge on one tangent`,
    wide && turns.every((t) => t <= 2),
    `hang ${r2(g.card.left)}–${r2(g.card.right)}, feet ${r2(footStart)}–${r2(footEnd)}, flush ${g.flush.start ? "start " : ""}${g.flush.end ? "end" : ""}; turns ${turns.map((t) => `${r2(t)}°`).join(", ") || "none (flush)"}`
  );
  const ink = await jointInk(page, g);
  const ref = ink.reference;
  for (const { side, reads } of ink.sides) {
    const bad = reads.flatMap(({ at, read }) => {
      const out: string[] = [];
      if (read.core < 0.85) {
        out.push(`${at} core ${r2(read.core)}`);
      }
      if (!(Math.abs(read.inner - ref.inner) <= 0.35)) {
        out.push(`${at} inner ${r2(read.inner)} (side ${r2(ref.inner)})`);
      }
      if (!(read.fall <= ref.fall + 1)) {
        out.push(
          `${at} fall ${r2(read.fall)} (side ${r2(ref.fall)}; ink in from the edge every 0.25px ${read.profile.join(" ")}, the side ${ref.profile.join(" ")})`
        );
      }
      if (read.second > 0.12) {
        out.push(`${at} second ${r2(read.second)}`);
      }
      return out;
    });
    const edgeLevels = reads
      .filter(({ at }) => at.startsWith("edge"))
      .map(({ read }) => read.level);
    // A failing side: what paints inside its foot, and its crop, for reading.
    let painting = "";
    if (bad.length > 0) {
      const tip = side === "start" ? footStart : footEnd;
      const way = side === "start" ? 1 : -1;
      const x = tip + way * g.flare * 0.4;
      const y = g.tab.bottom - 1;
      // biome-ignore lint/performance/noAwaitInLoops: a failing side's read, once
      painting = await page.evaluate(
        ([atX, atY]) =>
          [...document.querySelectorAll<HTMLElement>("body *")]
            .filter((el) => {
              const b = el.getBoundingClientRect();
              const s = getComputedStyle(el);
              return (
                b.left <= atX &&
                b.right >= atX &&
                b.top <= atY &&
                b.bottom >= atY &&
                s.visibility !== "hidden" &&
                (s.backgroundColor !== "rgba(0, 0, 0, 0)" ||
                  s.boxShadow !== "none" ||
                  s.filter !== "none" ||
                  s.outlineStyle !== "none")
              );
            })
            .map(
              (el) =>
                `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join(".")} bg ${getComputedStyle(el).backgroundColor} shadow ${getComputedStyle(el).boxShadow.slice(0, 40)} filter ${getComputedStyle(el).filter.slice(0, 30)} outline ${getComputedStyle(el).outlineStyle}`
            )
            .join(" | "),
        [x, y] as const
      );
      await page.screenshot({
        path: `${process.env.TMPDIR}/joint-${name.replaceAll(" ", "-")}-${side}.png`,
        clip: { x: tip - 16, y: g.tab.bottom - 16, width: 32, height: 24 },
      });
    }
    kit.check(
      `${name}: the ${side} joint is one stroke, as full, thin and sharp as the hang's straight side, no second edge within 3px (side: core ${r2(ref.core)}, inner ${r2(ref.inner)}px, fall ${r2(ref.fall)} device px; joint worst: core ${r2(Math.min(...reads.map(({ read }) => read.core)))}, inner ${r2(Math.max(...reads.map(({ read }) => Math.abs(read.inner - ref.inner))))}px off, fall ${r2(Math.max(...reads.map(({ read }) => read.fall)))}, second ${r2(Math.max(...reads.map(({ read }) => read.second)))}; its level edge ${Math.max(...edgeLevels)} of 255 off the stroke's ink)`,
      bad.length === 0 && edgeLevels.every((v) => v <= 1),
      bad.length > 0
        ? `${bad.slice(0, 6).join("; ")}; under it, the tab's sheet ${g.tabSheet}; painting inside its foot: ${painting}`
        : undefined
    );
  }
}

const spec: Spec = {
  name: "hang",
  run: async (kit) => {
    for (const view of VIEWS_READ) {
      for (const theme of THEMES) {
        const where = `${view} ${theme}`;
        // biome-ignore lint/performance/noAwaitInLoops: one width and theme at a time
        const page = await kit.page(view, { theme });
        for (const card of cardsAt(view === "phone")) {
          try {
            // biome-ignore lint/performance/noAwaitInLoops: one card at a time on the page
            await readCard(kit, page, card, where);
          } catch (error) {
            kit.check(
              `${card.name} ${where}: reads to its end`,
              false,
              String(error).split("\n")[0]
            );
          }
        }
        if (view === "desk") {
          await behaviour(kit, page, theme);
        }
        await frames(page);
        await page.close();
        // The tab's hangs' joints at 2x and 3x too (1x above).
        for (const scale of [2, 3]) {
          // biome-ignore lint/performance/noAwaitInLoops: one scale at a time
          const scaled = await kit.page(view, { theme, scale });
          for (const card of cardsAt(view === "phone").filter((c) => c.tab)) {
            const name = `${card.name} ${where} ${scale}x`;
            try {
              // biome-ignore lint/performance/noAwaitInLoops: one card at a time
              await open(
                scaled,
                `${await kit.bench()}${card.route}&theme=${theme}`,
                ".session-tabs .tab[data-chosen]",
                120_000
              );
              await settle(scaled, 400);
              await card.open(scaled);
              await scaled.waitForSelector(card.card, { timeout: 10_000 });
              await settle(scaled, 600);
              await atJoint(
                kit,
                scaled,
                card.card.replace("[data-state='open']", ""),
                name
              );
              await card.close(scaled);
              await settle(scaled, 400);
            } catch (error) {
              kit.check(
                `${name}: reads to its end`,
                false,
                String(error).split("\n")[0]
              );
            }
          }
          await scaled.close();
        }
      }
    }
  },
};
export default spec;
