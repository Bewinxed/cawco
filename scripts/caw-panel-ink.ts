/**
 * What Caw's panel looks like to the eye, read from its pixels and its
 * computed styles: probe-caw-notices's pixel checks.
 *
 *  - `trailing`: every row's last control (a wait, or Peek after it in the
 *    wide layout, Approve, Clear all, each
 *    ✕, the update footer's last button, each sign-in link, the fold
 *    toggle), with its box's right edge and the x of its rightmost painted
 *    pixel in a capture of the page, so the panel's one trailing edge is
 *    read by ink, not by element boxes; `inkSpread` is how far apart they
 *    land;
 *  - `peers`: Deny's and Approve's computed fills, beside the fail and done
 *    pairs' fills as the tokens compute them;
 *  - `contrast`: every run of words in the panel, its type role and its
 *    contrast against the surface it is painted on (with every ancestor's
 *    opacity), so each meta line is held to 4.5:1, and the strongest
 *    contrast its pixels reach in the capture (`seen`);
 *  - `marks`: the ask's project and machine marks, as rendered;
 *  - `moved`: the moved logins' heading and entry type, and the gaps from
 *    the explainer to the first entry and between entries;
 *  - `columns`: the update's title, its notes' bullets and `Configure update
 *    behaviour` by their leftmost painted pixel;
 *  - `dot`: the ask's needs-you dot, drawn whole (its ink reaching its box's
 *    top and trailing side where it stands out of its tile).
 *
 * The page is captured once and its pixels decoded once, in the page; every
 * reading of them is plain arithmetic here.
 */
import type { Page } from "playwright-core";

type Rgb = [number, number, number];

/** A box in CSS px. */
interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** The capture's pixels, RGBA, in device pixels. */
interface Raster {
  data: Uint8Array;
  dpr: number;
  height: number;
  width: number;
}

/** What the panel's frame is: its scale, its list, its surface. */
interface Frame {
  dpr: number;
  /** The list's box: what the panel scrolls, its rows inside it. */
  list: Box;
  /** The panel's own surface. */
  surface: Rgb;
}

/** A run of words, its role and its ink's own contrast on what is under it. */
interface Words {
  box: Box;
  font: string;
  ratio: number;
  role: string;
  text: string;
}

/** The helpers the page's readings share (`install`). */
interface Helpers {
  box: (e: Element) => Box;
  /** Shown, and drawn clear of the list's edge fades and the held footer's. */
  inView: (e: Element) => boolean;
  label: (e: Element) => string;
  rgba: (css: string) => [number, number, number, number];
  /** Every element under `selector` that is drawn. */
  shown: (selector: string) => Element[];
  type: (e: Element) => string;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Defines the helpers on the page, for the readings after it. */
const install = (page: Page) =>
  page.evaluate(() => {
    const pop = document.querySelector(".caw-pop") as HTMLElement;
    const list = pop.querySelector(".list") as HTMLElement;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D;
    const drawn = (e: Element) =>
      e.getBoundingClientRect().height > 0 &&
      !e.closest("[inert]") &&
      getComputedStyle(e).visibility !== "hidden";
    const fade =
      Number.parseFloat(
        getComputedStyle(list).getPropertyValue("--fade-len")
      ) || 40;
    const helpers: Helpers = {
      box: (e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      },
      inView: (e) => {
        const r = e.getBoundingClientRect();
        const view = list.getBoundingClientRect();
        const stuck = pop.querySelector(".actions[data-stuck]");
        const more = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
        const top = view.top + (list.scrollTop > 0 ? fade : 0);
        let bottom = view.bottom - (more && !stuck ? fade : 0);
        if (stuck && !stuck.contains(e)) {
          bottom = stuck.getBoundingClientRect().top - fade;
        }
        return drawn(e) && r.top >= top && r.bottom <= bottom;
      },
      label: (e) =>
        (e.getAttribute("aria-label") ?? e.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40),
      rgba: (css) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return a ? [r ?? 0, g ?? 0, b ?? 0, a / 255] : [0, 0, 0, 0];
      },
      shown: (selector) => [...pop.querySelectorAll(selector)].filter(drawn),
      type: (e) => {
        const s = getComputedStyle(e);
        return `${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.color}`;
      },
    };
    (globalThis as unknown as { cawInk: Helpers }).cawInk = helpers;
  });

const readFrame = (page: Page): Promise<Frame> =>
  page.evaluate(() => {
    const h = (globalThis as unknown as { cawInk: Helpers }).cawInk;
    const pop = document.querySelector(".caw-pop") as HTMLElement;
    const [r, g, b] = h.rgba(getComputedStyle(pop).backgroundColor);
    return {
      dpr: devicePixelRatio,
      list: h.box(pop.querySelector(".list") as Element),
      surface: [r, g, b],
    };
  });

/** Every row's last control, in plain view, and whether its fill is its ink. */
const readTrailing = (page: Page) =>
  page.evaluate(() => {
    const h = (globalThis as unknown as { cawInk: Helpers }).cawInk;
    const pick = (selector: string, what: (e: Element) => string) =>
      h
        .shown(selector)
        .filter(h.inView)
        .map((e) => ({
          what: what(e),
          box: h.box(e),
          filled: h.rgba(getComputedStyle(e).backgroundColor)[3] > 0,
        }));
    return [
      ...pick(".row:not([data-peek]) .wait", (e) => `time ${h.label(e)}`),
      ...pick(".row .end .peek", (e) => `peek ${h.label(e)}`),
      ...pick(".peers .approve", () => "Approve"),
      ...pick(".head .clear", () => "Clear all"),
      ...pick(".notice > .end .x", (e) => `✕ ${h.label(e)}`),
      ...pick(".actions > :last-child", (e) => `footer ${h.label(e)}`),
      ...pick(".todo", (e) => `link ${h.label(e)}`),
      ...pick(".done", (e) => `done ${h.label(e)}`),
      ...pick(".more button", () => "fold toggle"),
    ];
  });

/** Deny's and Approve's fills, and the fail and done pairs' as the tokens compute them. */
const readPeers = (page: Page) =>
  page.evaluate(() => {
    const pop = document.querySelector(".caw-pop") as HTMLElement;
    const deny = pop.querySelector(".peers .deny");
    const approve = pop.querySelector(".peers .approve");
    if (!(deny && approve)) {
      return null;
    }
    const fillOf = (token: string) => {
      const swatch = document.createElement("span");
      swatch.style.background = `var(${token})`;
      pop.append(swatch);
      const fill = getComputedStyle(swatch).backgroundColor;
      swatch.remove();
      return fill;
    };
    return {
      deny: getComputedStyle(deny).backgroundColor,
      approve: getComputedStyle(approve).backgroundColor,
      fail: fillOf("--status-fail-bg"),
      done: fillOf("--status-done-bg"),
    };
  });

/** Every element holding words of its own: its role, its ink and what is under it. */
const readWords = (page: Page): Promise<Words[]> =>
  page.evaluate(() => {
    const h = (globalThis as unknown as { cawInk: Helpers }).cawInk;
    const pop = document.querySelector(".caw-pop") as HTMLElement;
    const surface = h.rgba(getComputedStyle(pop).backgroundColor);
    const mix = (top: number[], under: number[]) =>
      [0, 1, 2].map(
        (c) =>
          (top[c] ?? 0) * (top[3] ?? 1) + (under[c] ?? 0) * (1 - (top[3] ?? 1))
      );
    /** The fills under `el`, outermost first, over the panel's surface. */
    const ground = (el: Element) => {
      const fills: number[][] = [];
      for (
        let at: Element | null = el;
        at && at !== pop;
        at = at.parentElement
      ) {
        const fill = h.rgba(getComputedStyle(at).backgroundColor);
        if (fill[3] > 0) {
          fills.unshift(fill);
        }
      }
      return fills.reduce((under, top) => mix(top, under), surface.slice(0, 3));
    };
    const opacity = (el: Element) => {
      let o = 1;
      for (let at: Element | null = el; at; at = at.parentElement) {
        o *= Number(getComputedStyle(at).opacity);
      }
      return o;
    };
    const lum = (rgb: number[]) =>
      rgb
        .map((v) => {
          const s = v / 255;
          return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, c, i) => sum + c * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
    const roles: Record<string, string> = {
      "400 12px": "meta",
      "500 13px": "label",
      "400 14px": "body",
    };
    const owners = new Set<Element>();
    const walker = document.createTreeWalker(pop, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (el && node.textContent?.trim() && !el.closest(".sr-only")) {
        owners.add(el);
      }
    }
    const drawn = new Set(h.shown("*"));
    return [...owners]
      .filter((el) => drawn.has(el))
      .map((el) => {
        const style = getComputedStyle(el);
        const ink = h.rgba(style.color);
        const under = ground(el);
        const painted = mix(
          [ink[0], ink[1], ink[2], ink[3] * opacity(el)],
          under
        );
        const [hi, lo] = [lum(painted), lum(under)].sort((a, b) => b - a);
        const font = `${style.fontWeight} ${style.fontSize}`;
        // A meta run at label weight is still meta: the size names the role.
        const size = Number.parseFloat(style.fontSize);
        return {
          text: h.label(el),
          role: roles[font] ?? (size === 12 ? "meta" : font),
          font,
          ratio:
            Math.round((((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)) * 100) / 100,
          box: h.box(el),
        };
      });
  });

/** The ask's project and machine marks, as rendered. */
const readMarks = (page: Page) =>
  page.evaluate(() => {
    const h = (globalThis as unknown as { cawInk: Helpers }).cawInk;
    return [
      ...h.shown(".where .project .mark").map((e) => ({ what: "project", e })),
      ...h.shown(".where .machine .mark").map((e) => ({ what: "machine", e })),
    ].map(({ what, e }) => {
      const r = e.getBoundingClientRect();
      return { what, width: r.width, height: r.height };
    });
  });

/** The moved logins' heading and entry type, and their gaps. */
const readMoved = (page: Page) =>
  page.evaluate(() => {
    const h = (globalThis as unknown as { cawInk: Helpers }).cawInk;
    const [group] = h.shown(".group:has(.explainer)");
    const head = group?.querySelector(".head");
    const explainer = group?.querySelector(".explainer");
    if (!(group && head && explainer)) {
      return null;
    }
    const names = h.shown(".group:has(.explainer) .entries .name");
    /** Each shown entry's words, top to bottom. */
    const bodies = h
      .shown(".group:has(.explainer) .entries .notice > .body")
      .map((body) => body.getBoundingClientRect());
    const [first] = bodies;
    const gap = (a: number, b: number) => Math.round((b - a) * 100) / 100;
    return {
      head: h.type(head),
      entries: [...new Set(names.map(h.type))],
      explainerToFirst: first
        ? gap(explainer.getBoundingClientRect().bottom, first.top)
        : null,
      betweenEntries: bodies
        .slice(1)
        .map((body, i) => gap(bodies[i]?.bottom ?? body.top, body.top)),
    };
  });

/** The update's title, its notes' lines and the way to the settings. */
const readColumns = (page: Page) =>
  page.evaluate(() => {
    const h = (globalThis as unknown as { cawInk: Helpers }).cawInk;
    const pick = (selector: string, what: (e: Element) => string) =>
      h
        .shown(selector)
        .filter(h.inView)
        .map((e) => ({ what: what(e), box: h.box(e) }));
    return [
      ...pick(".notice .card > .title", () => "update title"),
      ...pick(".notes li", () => "notes bullet"),
      ...pick(".actions > .settings", () => "Configure update behaviour"),
    ];
  });

const readDotBox = (page: Page) =>
  page.evaluate(() => {
    const h = (globalThis as unknown as { cawInk: Helpers }).cawInk;
    const [dot] = h.shown(".row .lead .dot:not(.ping)");
    return dot ? h.box(dot) : null;
  });

/** Captures the page and decodes its pixels, in the page, once. */
async function capture(page: Page, dpr: number): Promise<Raster> {
  const png = await page.screenshot({ animations: "disabled" });
  const decoded = await page.evaluate(async (data) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(bitmap, 0, 0);
    const bytes = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 0x80_00) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x80_00)));
    }
    return {
      data: btoa(chunks.join("")),
      width: bitmap.width,
      height: bitmap.height,
    };
  }, png.toString("base64"));
  return {
    data: Buffer.from(decoded.data, "base64"),
    width: decoded.width,
    height: decoded.height,
    dpr,
  };
}

/** The colour at a device pixel. */
const pixel = (raster: Raster, x: number, y: number): Rgb => {
  const i = (y * raster.width + x) * 4;
  return [
    raster.data[i] ?? 0,
    raster.data[i + 1] ?? 0,
    raster.data[i + 2] ?? 0,
  ];
};

/** How far two colours stand apart, channel by channel. */
const off = (a: Rgb, b: Rgb) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

const luminance = (rgb: Rgb) =>
  rgb
    .map((v) => {
      const s = v / 255;
      return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, c, i) => sum + c * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);

/** A box's device pixels, clipped to the capture. */
const span = (raster: Raster, box: Box) => ({
  x0: Math.max(0, Math.floor(box.left * raster.dpr)),
  x1: Math.min(raster.width, Math.floor(box.right * raster.dpr)),
  y0: Math.max(0, Math.floor(box.top * raster.dpr)),
  y1: Math.min(raster.height, Math.ceil(box.bottom * raster.dpr)),
});

/** Every device pixel of a box, row by row. */
function* pixels(raster: Raster, box: Box) {
  const { x0, x1, y0, y1 } = span(raster, box);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      yield { x, y, rgb: pixel(raster, x, y) };
    }
  }
}

/**
 * Where a control's ink stands, in CSS px: past its rightmost painted
 * column, and at its leftmost. Read in its box's middle half (where its
 * words and glyph stand, clear of what is drawn beside its corners: the
 * glass's flare at the list's top corner, which Clear all's box reaches
 * under), `pad` past its sides but inside the list, so the panel's own edge
 * is never read as ink. A pixel is painted where it stands off the panel's
 * surface by a third of the strongest difference in the box, so an
 * antialiased fringe counts the same on every control; a filled control's
 * fill is its ink, so any pixel clearly off the surface counts.
 */
function inkOf(
  raster: Raster,
  frame: Frame,
  box: Box,
  pad: number,
  fill: boolean
): { left: number; right: number } | null {
  const quarter = (box.bottom - box.top) / 4;
  const region = {
    left: Math.max(frame.list.left, box.left - pad),
    right: Math.min(frame.list.right, box.right + pad),
    top: box.top + quarter,
    bottom: box.bottom - quarter,
  };
  const all = [...pixels(raster, region)].map((one) => ({
    x: one.x,
    d: off(one.rgb, frame.surface),
  }));
  const strongest = Math.max(0, ...all.map((one) => one.d));
  const cut = fill ? 12 : Math.max(24, strongest / 3);
  const painted = all.filter((one) => one.d >= cut).map((one) => one.x);
  if (painted.length === 0) {
    return null;
  }
  return {
    left: round(Math.min(...painted) / raster.dpr),
    right: round((Math.max(...painted) + 1) / raster.dpr),
  };
}

/**
 * The needs-you dot, read where it stands out of its tile: its top half,
 * above the tile's top edge (it is centred on the tile's corner). Drawn
 * whole, its ink reaches its box's top and its trailing side; a clip leaves
 * a band (the "dash") whose top stands lower.
 */
function dotOf(raster: Raster, frame: Frame, box: Box) {
  const region = {
    left: box.left,
    right: box.right + 1,
    top: box.top - 1,
    bottom: box.top + (box.bottom - box.top) / 2,
  };
  const painted = [...pixels(raster, region)].filter(
    (one) => off(one.rgb, frame.surface) >= 24
  );
  if (painted.length === 0) {
    return { box, ink: null, whole: false };
  }
  const top = Math.min(...painted.map((one) => one.y)) / raster.dpr;
  const right = (Math.max(...painted.map((one) => one.x)) + 1) / raster.dpr;
  return {
    box: { top: round(box.top), right: round(box.right) },
    ink: { top: round(top), right: round(right) },
    whole: top <= box.top + 1 && right >= box.right - 1,
  };
}

/**
 * A run of words as painted: the strongest contrast any of its pixels
 * reaches against the box's ground (its commonest colour). For thin 12px
 * strokes that is what the eye gets, at or under the ink's own ratio.
 */
function peakOf(raster: Raster, box: Box): number {
  const counts = new Map<string, { lum: number; n: number }>();
  for (const { rgb } of pixels(raster, box)) {
    const key = rgb.join(",");
    const known = counts.get(key);
    if (known) {
      known.n += 1;
    } else {
      counts.set(key, { lum: luminance(rgb), n: 1 });
    }
  }
  const colours = [...counts.values()];
  if (colours.length === 0) {
    return 1;
  }
  const ground = colours.reduce((a, b) => (b.n > a.n ? b : a)).lum;
  const ratios = colours.map(({ lum }) =>
    lum > ground
      ? (lum + 0.05) / (ground + 0.05)
      : (ground + 0.05) / (lum + 0.05)
  );
  return round(Math.max(...ratios));
}

/** The panel, read by eye: see the file's head. */
export async function panelReport(page: Page) {
  await install(page);
  const frame = await readFrame(page);
  const [trailingBoxes, peers, words, marks, moved, columnBoxes, dotBox] =
    await Promise.all([
      readTrailing(page),
      readPeers(page),
      readWords(page),
      readMarks(page),
      readMoved(page),
      readColumns(page),
      readDotBox(page),
    ]);
  const raster = await capture(page, frame.dpr);
  const trailing = trailingBoxes.map(({ what, box, filled }) => ({
    what,
    box: round(box.right),
    ink: inkOf(raster, frame, box, 8, filled)?.right ?? null,
  }));
  const inks = trailing
    .map((one) => one.ink)
    .filter((x): x is number => x !== null);
  const inList = (box: Box) =>
    box.top >= frame.list.top && box.bottom <= frame.list.bottom;
  return {
    trailing,
    inkSpread: inks.length ? round(Math.max(...inks) - Math.min(...inks)) : 0,
    peers,
    contrast: words.map(({ box, ...one }) => ({
      ...one,
      /** As painted; none for words scrolled out of the list's view. */
      seen: inList(box) ? peakOf(raster, box) : null,
    })),
    marks,
    moved,
    columns: columnBoxes.map(({ what, box }) => ({
      what,
      box: round(box.left),
      ink: inkOf(raster, frame, box, 4, false)?.left ?? null,
    })),
    dot: dotBox ? dotOf(raster, frame, dotBox) : null,
  };
}
