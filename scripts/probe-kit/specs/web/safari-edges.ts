/**
 * The screen's edges (cawco/ScreenEdges), read from WebKit at an iPhone's
 * size (390×844, touch, 3x): the fixed strips Safari extends behind its
 * status bar and toolbar are the colour of what stands on each edge, in
 * light and dark, on the home, on a session, with the phone's sidebar sheet
 * open, with a bottom sheet open, and across the sidebar's own theme
 * switch. Each state is read once:
 *
 *  - `.edge-top` and `.edge-bottom`: fixed, pressing nothing, at least 12px
 *    tall, opaque;
 *  - what WebKit's edge sampler finds at the middle of each edge (the first
 *    fixed box up from the element hit, pointer-events ignored) is that
 *    strip, in the composited colour of the surface under it: the dimmed
 *    bar with a bottom sheet open, the bar itself on the home;
 *  - each strip's colour is the colour the page paints where the strip
 *    stands (the stack of backgrounds under it, composited as drawn);
 *  - html's background is the composited top colour, body's the bottom;
 *  - `theme-color` is the composited top colour;
 *  - no box around either strip has a transform;
 *  - the theme switch moves all of them (the colours before and after it
 *    differ);
 *  - with the sidebar sheet open the strips are not drawn (the sheet and
 *    the scrim beside it are two colours on one edge), and the document
 *    and theme-color are the sheet's surface;
 *  - a bottom sheet's close gives the home its edges back.
 *
 * Colours are compared as painted: each is filled into a 1×1 sRGB canvas
 * and read back, and two agree within one step a channel.
 *
 * WebKit headless has no safe areas, so env() is 0 here and the strips are
 * their 12px; what Safari itself draws behind its controls is the iPhone's
 * or the Simulator's to show.
 */
import type { Page } from "playwright-core";
import { MACHINE } from "../../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../../kit";

type Rgba = [number, number, number, number];

interface Edges {
  bodyBg: Rgba;
  bottom: Rgba;
  bottomUnder: Rgba;
  htmlBg: Rgba;
  meta: Rgba | null;
  metaRaw: string | null;
  /** What WebKit's edge sampler finds at each edge's middle, and its colour. */
  safari: {
    bottom: { colour: Rgba; who: string };
    top: { colour: Rgba; who: string };
  };
  strips: {
    name: string;
    height: number;
    opacity: number;
    pointerEvents: string;
    position: string;
  }[];
  top: Rgba;
  topUnder: Rgba;
  transformed: string[];
  under: { bottom: string[]; top: string[] };
}

/** Everything the page says about its two edges, colours as painted. */
function readEdges(page: Page): Promise<Edges> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("no 2d canvas");
    }
    /** Layers bottom first, each with its own opacity, as painted. */
    const paint = (layers: { colour: string; alpha: number }[]): Rgba => {
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, 1, 1);
      for (const layer of layers) {
        ctx.fillStyle = "#010203";
        ctx.fillStyle = layer.colour;
        if (ctx.fillStyle === "#010203" && layer.colour !== "#010203") {
          throw new Error(`the canvas cannot read ${layer.colour}`);
        }
        ctx.globalAlpha = layer.alpha;
        ctx.fillRect(0, 0, 1, 1);
      }
      return [...ctx.getImageData(0, 0, 1, 1).data] as Rgba;
    };
    const solid = (colour: string) => paint([{ colour, alpha: 1 }]);
    const alphaOf = (colour: string) => paint([{ colour, alpha: 1 }])[3];
    /**
     * A positioned pseudo-element's surface, when it covers the point: a
     * sheet draws its surface on ::before (ui/drawer/drawer-content).
     */
    const pseudoAt = (el: Element, which: string, px: number, py: number) => {
      const style = getComputedStyle(el, which);
      if (
        style.content === "none" ||
        !["absolute", "fixed"].includes(style.position)
      ) {
        return null;
      }
      const box =
        style.position === "fixed"
          ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
          : el.getBoundingClientRect();
      const len = (v: string) => Number.parseFloat(v) || 0;
      const inside =
        px >= box.left + len(style.left) &&
        px <= box.right - len(style.right) &&
        py >= box.top + len(style.top) &&
        py <= box.bottom - len(style.bottom);
      return inside ? style.backgroundColor : null;
    };
    /**
     * The backgrounds stacked at a point down to the first opaque one, each
     * element's pseudo-element surfaces over its own. Every element takes
     * the hit test for the read: an open dialog holds the page under it at
     * `pointer-events: none`, which `elementsFromPoint` would pass over.
     */
    interface Layer {
      alpha: number;
      colour: string;
      who: string;
    }
    /** An element's painted layers at a point, topmost first: ::after, ::before, itself. */
    const layersOf = (el: Element, px: number, py: number): Layer[] => {
      const style = getComputedStyle(el);
      const alpha = Number(style.opacity);
      const slot = el.getAttribute("data-slot");
      const name = `${el.tagName.toLowerCase()}${slot ? `[${slot}]` : ""}.${String(el.className).split(" ")[0]}`;
      const own: [string | null, string][] = [
        [pseudoAt(el, "::after", px, py), "::after"],
        [pseudoAt(el, "::before", px, py), "::before"],
        [style.backgroundColor, ""],
      ];
      const layers: Layer[] = [];
      for (const [colour, part] of own) {
        if (colour !== null && alpha > 0 && alphaOf(colour) > 0) {
          layers.push({
            colour,
            alpha,
            who: `${name}${part}=${colour}${alpha < 1 ? `@${alpha}` : ""}`,
          });
        }
      }
      return layers;
    };
    const under = (px: number, py: number) => {
      const hit = document.createElement("style");
      hit.textContent = "* { pointer-events: auto !important; }";
      document.head.append(hit);
      const stack = document
        .elementsFromPoint(px, py)
        .filter((el) => !el.matches(".edge-top, .edge-bottom"));
      hit.remove();
      const layers = stack.flatMap((el) => layersOf(el, px, py));
      const floor = layers.findIndex(
        (layer) => layer.alpha === 1 && alphaOf(layer.colour) === 255
      );
      const seen = floor === -1 ? layers : layers.slice(0, floor + 1);
      seen.reverse();
      return { painted: paint(seen), who: seen.map((l) => l.who) };
    };
    const strips = [".edge-top", ".edge-bottom"].map((selector) => {
      const el = document.querySelector(selector);
      if (!el) {
        throw new Error(`no ${selector}`);
      }
      const style = getComputedStyle(el);
      return {
        el,
        name: selector,
        colour: style.backgroundColor,
        height: Number.parseFloat(style.height),
        opacity: Number(style.opacity),
        pointerEvents: style.pointerEvents,
        position: style.position,
      };
    });
    /**
     * The colour Safari extends past an edge, found as WebKit finds it
     * (LocalFrameView.cpp, fixedContainerEdges): hit-test the middle of the
     * viewport's edge ignoring pointer-events, walk up from the element hit
     * to the first visible fixed or sticky box, and take its background; with
     * none, the page's background (the body's, as the iPhone Simulator showed
     * on nightly 3353).
     */
    const safariPick = (px: number, py: number) => {
      const hit = document.createElement("style");
      hit.textContent = "* { pointer-events: auto !important; }";
      document.head.append(hit);
      const target = document.elementFromPoint(px, py);
      hit.remove();
      for (let at = target; at; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (
          ["fixed", "sticky"].includes(style.position) &&
          Number(style.opacity) > 0 &&
          style.visibility !== "hidden"
        ) {
          return {
            colour: solid(style.backgroundColor),
            who: `${at.tagName.toLowerCase()}.${String(at.className).split(" ")[0]}`,
          };
        }
      }
      return {
        colour: solid(getComputedStyle(document.body).backgroundColor),
        who: "the page's background (body)",
      };
    };
    const pickTop = safariPick(innerWidth / 2, 0);
    const pickBottom = safariPick(innerWidth / 2, innerHeight - 1);
    const transformed: string[] = [];
    for (const strip of strips) {
      for (let at = strip.el.parentElement; at; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (
          style.transform !== "none" ||
          style.translate !== "none" ||
          style.scale !== "none" ||
          style.rotate !== "none"
        ) {
          transformed.push(`${strip.name} in ${at.tagName.toLowerCase()}`);
        }
      }
    }
    const [top, bottom] = strips as [
      (typeof strips)[number],
      (typeof strips)[number],
    ];
    const mid = innerWidth / 2;
    const topUnder = under(mid, 3);
    const bottomUnder = under(mid, innerHeight - 3);
    const metaRaw =
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute("content") ?? null;
    return {
      top: solid(top.colour),
      bottom: solid(bottom.colour),
      topUnder: topUnder.painted,
      bottomUnder: bottomUnder.painted,
      under: { top: topUnder.who, bottom: bottomUnder.who },
      safari: { top: pickTop, bottom: pickBottom },
      htmlBg: solid(getComputedStyle(document.documentElement).backgroundColor),
      bodyBg: solid(getComputedStyle(document.body).backgroundColor),
      metaRaw,
      meta: metaRaw ? solid(metaRaw) : null,
      strips: strips.map(
        ({ name, height, opacity, pointerEvents, position }) => ({
          name,
          height,
          opacity,
          pointerEvents,
          position,
        })
      ),
      transformed,
    };
  });
}

const same = (a: Rgba | null, b: Rgba | null) =>
  a !== null &&
  b !== null &&
  a.every((v, i) => Math.abs(v - (b[i] as number)) <= 1);
const show = (c: Rgba | null) => (c ? `rgba(${c.join(",")})` : "none");

/**
 * One state's edges. `drawn` is whether the strips stand on the edges: a
 * side sheet holds part of each edge and the scrim the rest, so the strips
 * step aside and the page's own layers are the edge (ScreenEdges); then the
 * document and theme-color are the sheet's surface, the colour at the
 * edge's middle.
 */
function checkEdges(kit: Kit, label: string, e: Edges, drawn: boolean) {
  for (const strip of e.strips) {
    kit.check(
      `${label}: ${strip.name} is fixed, presses nothing, ≥12px`,
      strip.position === "fixed" &&
        strip.pointerEvents === "none" &&
        strip.height >= 12,
      `${strip.position}, ${strip.pointerEvents}, ${strip.height}px`
    );
    kit.check(
      `${label}: ${strip.name} is ${drawn ? "drawn" : "not drawn"}`,
      strip.opacity === (drawn ? 1 : 0),
      `opacity ${strip.opacity}`
    );
  }
  // The colours the page paints at each edge, composited as drawn: what the
  // document, theme-color and Safari's pick must all be.
  const top = e.topUnder;
  const bottom = e.bottomUnder;
  if (drawn) {
    kit.check(
      `${label}: Safari's sampler picks the top strip, the composited top surface`,
      e.safari.top.who.startsWith("div.edge-top") &&
        same(e.safari.top.colour, top),
      `${e.safari.top.who} ${show(e.safari.top.colour)} vs ${show(top)}`
    );
    kit.check(
      `${label}: Safari's sampler picks the bottom strip, the composited bottom surface`,
      e.safari.bottom.who.startsWith("div.edge-bottom") &&
        same(e.safari.bottom.colour, bottom),
      `${e.safari.bottom.who} ${show(e.safari.bottom.colour)} vs ${show(bottom)}`
    );
    kit.check(
      `${label}: both strips are opaque`,
      e.top[3] === 255 && e.bottom[3] === 255,
      `${show(e.top)} / ${show(e.bottom)}`
    );
    kit.check(
      `${label}: the top strip is the colour under it`,
      same(e.top, e.topUnder),
      `${show(e.top)} vs ${show(e.topUnder)} from ${e.under.top.join(" < ")}`
    );
    kit.check(
      `${label}: the bottom strip is the colour under it`,
      same(e.bottom, e.bottomUnder),
      `${show(e.bottom)} vs ${show(e.bottomUnder)} from ${e.under.bottom.join(" < ")}`
    );
  }
  kit.check(
    `${label}: html is the top colour, body the bottom`,
    same(e.htmlBg, top) && same(e.bodyBg, bottom),
    `html ${show(e.htmlBg)}, body ${show(e.bodyBg)}; top ${show(top)} from ${e.under.top.join(" < ")}`
  );
  kit.check(
    `${label}: theme-color is the top colour`,
    same(e.meta, top),
    `${e.metaRaw} = ${show(e.meta)}`
  );
  kit.check(
    `${label}: no box around a strip has a transform`,
    e.transformed.length === 0,
    e.transformed.join(", ") || "none"
  );
}

const spec: Spec = {
  name: "safari-edges",
  run: async (kit) => {
    const fleet = await kit.fleet(() => ({ everyMs: 20, words: ["Ready."] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const id = await fleet.spawn("claude", "Edges");
    const base = await fleet.dashboard();

    for (const theme of ["light", "dark"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one theme's page at a time
      const page = await kit.page("phone", {
        engine: "webkit",
        scale: 3,
        theme,
      });
      page.setDefaultTimeout(60_000);
      const read = async (label: string, drawn = true) => {
        await settle(page, 300);
        const edges = await readEdges(page);
        checkEdges(kit, `${theme} ${label}`, edges, drawn);
        return edges;
      };

      await open(page, `${base}/session/${id}`, "textarea", 90_000);
      await read("session");

      await open(page, `${base}/`, "button.burger", 90_000);
      const home = await read("home");

      await page.tap("button.burger");
      await page.waitForSelector(
        '[data-slot="sheet-content"][data-state="open"]'
      );
      const sheet = await read("sidebar sheet", false);

      // The sidebar's own switch, under the open sheet.
      await page.tap(
        '[data-slot="sheet-content"] button[aria-label$="mode"], [data-slot="sheet-content"] button[aria-label="System"]'
      );
      const sheetSwitched = await read("sidebar sheet, theme switched", false);
      kit.check(
        `${theme}: the switch moves the sheet's edges`,
        !(
          same(sheet.htmlBg, sheetSwitched.htmlBg) ||
          same(sheet.bodyBg, sheetSwitched.bodyBg) ||
          same(sheet.meta, sheetSwitched.meta)
        ),
        `${show(sheet.htmlBg)} → ${show(sheetSwitched.htmlBg)}`
      );
      await page
        .locator('[data-slot="sheet-content"]')
        .getByRole("button", { name: "Close", exact: true })
        .tap();
      await page.waitForSelector(
        '[data-slot="sheet-content"][data-state="open"]',
        { state: "detached" }
      );
      const homeSwitched = await read("home, theme switched");
      kit.check(
        `${theme}: the switch moves the home's edges`,
        !(
          same(home.top, homeSwitched.top) ||
          same(home.bottom, homeSwitched.bottom) ||
          same(home.meta, homeSwitched.meta) ||
          same(home.htmlBg, homeSwitched.htmlBg) ||
          same(home.bodyBg, homeSwitched.bodyBg)
        ),
        `top ${show(home.top)} → ${show(homeSwitched.top)}, bottom ${show(home.bottom)} → ${show(homeSwitched.bottom)}`
      );

      // A bottom sheet on the screen's foot: New session, from a link.
      await open(
        page,
        `${base}/?spawn=${MACHINE}`,
        '[data-slot="drawer-content"][data-state="open"]',
        90_000
      );
      await read("bottom sheet");
      // Gone, the edges are the home's again.
      // Escape steps back through the form before it closes the sheet
      // (NewSessionDialog `escapeStep`): pressed until it closes.
      const openDrawer = page.locator(
        '[data-slot="drawer-content"][data-state="open"]'
      );
      for (const _press of [1, 2, 3, 4]) {
        // biome-ignore lint/performance/noAwaitInLoops: one step back at a time
        if ((await openDrawer.count()) === 0) {
          break;
        }
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }
      await page.waitForSelector('[data-slot="drawer-content"]', {
        state: "detached",
      });
      await read("bottom sheet closed");
      await page.close();
    }
  },
};
export default spec;
