/**
 * The top edge's strip (ScreenEdges `.edge-top`) stays the box Safari's tint
 * sampler takes, and paints only above the safe area: at a desk, nothing on
 * screen, so the bar's glass group draws its own top edge, ring and rail.
 *
 *   bun scripts/probe-kit/run.ts edge-top
 *
 * On a scratch fleet with two sessions in one pane (the desk's bar hosting
 * the tabs on their shelf, the phone's bar floating over its tab row), at
 * 1440 and 390, light and dark, it reads the strip from the engine: its
 * border box at least 90% of the viewport's width and over 10px tall
 * (WebKit's horizontal candidate and its direct colour read,
 * exsesx.dev/blog/en/safari-26-invisible-tint-sampler), its computed colour
 * opaque and the same with the mask taken off, and nothing that WebKit's
 * sampler rejects (opacity, visibility, display; github.com/facebook/astryx
 * pull 5342). At 1440, 1x, the top rows under the glass group and the rail's
 * edge are read with the mask off (main's strip) and on: the strip's colour
 * before, the page's own after, and the screen's top rows the same as with
 * no strip at all.
 *
 * Then a third session parks a Bash ask, so Caw's rim draws an arc, and at
 * 1440 and 390, light and dark, the glass group is read from the engine
 * (111bec1fb): the rim's radius from its first arc's path (`A r r`) and the
 * phone outline's half height from the first point of its first arc (18
 * less its y), each one hairline of glass inside the glass's own; the
 * machines' computed `padding-inline`; Jump's glyph's computed size and ink
 * against `--ink-muted`; and the ink gaps from boxes: Jump's glyph to the
 * machines' symbol (each the union of its shapes' geometry boxes, grown by
 * half a stroke where stroked), and the machines' number to Caw's face (the
 * number's advance box narrowed to its ink by the canvas's measure of the
 * digits, centred in the tabular advance; Caw's face the leftmost column of
 * his still's canvas with any alpha, in css px).
 */
import type { Page } from "playwright-core";
import type { Reply, Seen } from "../../scratch-fleet";
import { at, capture, colours, off, type Raster, type Rgb } from "../ink";
import { asking, sessionAsking } from "../journeys/asks";
import {
  type Kit,
  open,
  type Spec,
  settle,
  THEMES,
  type Theme,
  type View,
} from "../kit";

const STRIP = '[data-slot="edge-top"]';
/** Caw's head side, px, as NeedsCaw.svelte `head` draws it: 24 on a phone, 20 in the wide bar's group. */
const HEAD: Record<Extract<View, "desk" | "phone">, number> = {
  desk: 20,
  phone: 24,
};
/** The rail's trailing edge at the desk: its hairline's column. */
const RAIL_X = 229;
const ROWS = [3, 4];
/** The top rows read at the desk, css px at 1x. */
const CLIP = { x: 0, y: 0, width: 1440, height: 16 };

const respond = (request: Seen): Reply =>
  asking(request, (seen) =>
    seen.tools
      ? { everyMs: 5, words: ["Done."] }
      : { everyMs: 1, words: ["Edge top"] }
  );

/** The rim's box (NeedsCaw `RING_BOX`), its centre the outline's. */
const RING_MID = 18;
/** The glass group as 111bec1fb draws it. */
const GLASS = {
  rim: 15,
  stand: 13,
  pad: ["4px", "5.66667px"],
  jump: "16px",
} as const;

const ARC_RADIUS = /A ([\d.]+) /u;
const FIRST_Y = /^M [\d.]+ ([\d.]+)/u;
const TOOLS = '[data-slot="tools"]';
const MACHINES = `${TOOLS} [data-machines]`;
const JUMP_SVG = `${TOOLS} button[data-share="jump"] > svg`;

/** An svg's ink across, viewport px: its shapes' geometry boxes, grown by half a stroke where stroked; null when not drawn. */
const svgInk = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const svg = document.querySelector(sel);
    if (!svg || svg.getClientRects().length === 0) {
      return null;
    }
    const SHAPES = "path, circle, rect, ellipse, line, polyline, polygon";
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    for (const shape of svg.querySelectorAll<SVGGraphicsElement>(SHAPES)) {
      const style = getComputedStyle(shape);
      const box = shape.getBoundingClientRect();
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        (box.width === 0 && box.height === 0)
      ) {
        continue;
      }
      const scale = shape.getScreenCTM()?.a ?? 1;
      const half =
        style.stroke === "none"
          ? 0
          : (Number.parseFloat(style.strokeWidth) * scale) / 2;
      left = Math.min(left, box.left - half);
      right = Math.max(right, box.right + half);
    }
    return Number.isFinite(left) ? { left, right } : null;
  }, selector);

/** The machines' number's ink across: its advance box narrowed by the canvas's measure of the digits, centred in the tabular advance; null when not drawn. */
const numberInk = (page: Page) =>
  page.evaluate((sel) => {
    const num = document.querySelector(`${sel} [data-slot="num"]`);
    const text = num?.textContent ?? "";
    const ctx = document.createElement("canvas").getContext("2d");
    if (!(num && text && ctx) || num.getClientRects().length === 0) {
      return null;
    }
    const range = document.createRange();
    range.selectNodeContents(num);
    const box = range.getBoundingClientRect();
    const style = getComputedStyle(num);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const m = ctx.measureText(text);
    const start = box.left + (box.width - m.width) / 2;
    return {
      left: start - m.actualBoundingBoxLeft,
      right: start + m.actualBoundingBoxRight,
    };
  }, MACHINES);

/** Caw's face's leftmost inked column, viewport px: his still's canvas read back. */
const faceInk = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      "[data-needs-caw] [data-caw-face] canvas"
    );
    const ctx = canvas?.getContext("2d");
    if (!(canvas && ctx && canvas.width > 0)) {
      return null;
    }
    const box = canvas.getBoundingClientRect();
    const { data, width, height } = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        if ((data[(y * width + x) * 4 + 3] ?? 0) > 0) {
          return box.left + (x * box.width) / width;
        }
      }
    }
    return null;
  });

/** The rim's first arcs' paths, the machines' padding and Jump's glyph's size and ink, with `--ink-muted` resolved. */
const glassStyles = (page: Page) =>
  page.evaluate(
    ([machinesSel, jumpSel]) => {
      const caw = document.querySelector("[data-needs-caw]");
      const machines = document.querySelector(machinesSel as string);
      const jump = document.querySelector(jumpSel as string);
      const muted = document.createElement("span");
      muted.style.color = "var(--ink-muted)";
      document.body.append(muted);
      const inkMuted = getComputedStyle(muted).color;
      muted.remove();
      const m = machines ? getComputedStyle(machines) : null;
      const j = jump ? getComputedStyle(jump) : null;
      return {
        count:
          caw?.querySelector("[data-slot=rim]")?.getAttribute("data-count") ??
          "?",
        roundArc:
          caw
            ?.querySelector("[data-slot=rim] [data-slot=round] path")
            ?.getAttribute("d") ?? "",
        standArc:
          caw
            ?.querySelector("[data-slot=rim] [data-slot=standing] path")
            ?.getAttribute("d") ?? "",
        round:
          (caw
            ?.querySelector("[data-slot=rim] [data-slot=round]")
            ?.getClientRects().length ?? 0) > 0,
        pad: m ? [m.paddingInlineStart, m.paddingInlineEnd] : null,
        jump: j
          ? { inline: j.inlineSize, block: j.blockSize, color: j.color }
          : null,
        inkMuted,
      };
    },
    [MACHINES, JUMP_SVG] as const
  );

const gap = (
  from: { right: number } | null,
  to: { left: number } | null
): number | null => (from && to ? to.left - from.right : null);

/** The glass group's geometry and ink gaps. */
const glassRead = async (page: Page) => {
  const styles = await glassStyles(page);
  const jumpInk = await svgInk(page, JUMP_SVG);
  const symbolInk = await svgInk(page, `${MACHINES} svg`);
  const number = await numberInk(page);
  const face = await faceInk(page);
  const rim = ARC_RADIUS.exec(styles.roundArc)?.[1];
  const standY = FIRST_Y.exec(styles.standArc)?.[1];
  return {
    ...styles,
    rim: rim ? Number(rim) : null,
    standY: standY ? Number(standY) : null,
    jumpToMachines: gap(jumpInk, symbolInk),
    symbolToNumber: gap(symbolInk, number),
    numberToCaw: gap(number, face === null ? null : { left: face }),
  };
};

const px = (n: number | null) => (n === null ? "none" : n.toFixed(2));

/** The glass group on `view`, Caw's rim drawing one arc. */
const glassLeg = async (kit: Kit, page: Page, leg: string, desk: boolean) => {
  await page.waitForFunction(
    () =>
      document.querySelector("[data-needs-caw] [data-slot=rim] path") !==
        null &&
      (document
        .querySelector<HTMLCanvasElement>(
          "[data-needs-caw] [data-caw-face] canvas"
        )
        ?.getContext("2d")
        ?.getImageData(0, 0, 1, 1) ?? null) !== null,
    undefined,
    { timeout: 60_000 }
  );
  // The arc's draw-in and his still's paint.
  await page.waitForTimeout(800);
  const g = await glassRead(page);
  const stand = g.standY === null ? null : RING_MID - g.standY;
  kit.check(
    `${leg}: Caw's rim arc has radius ${GLASS.rim} and the phone outline half height ${GLASS.stand}`,
    g.rim === GLASS.rim && stand === GLASS.stand,
    `rim r ${g.rim}, outline half height ${stand} (first point y ${g.standY}), count ${g.count}, ${g.round ? "circle" : "outline"} shown`
  );
  if (!desk) {
    kit.check(
      `${leg}: the phone's group holds Caw alone`,
      g.jumpToMachines === null && g.numberToCaw === null,
      `machines pad ${g.pad?.join(" ") ?? "none"} (in the sidebar), jump ${g.jump ? `${g.jump.inline}×${g.jump.block} ${g.jump.color}` : "none"}`
    );
    return;
  }
  kit.check(
    `${leg}: .machines padding-inline is ${GLASS.pad.join(" ")} (--mark-inset, and it plus the symbol's grid margin)`,
    g.pad?.[0] === GLASS.pad[0] && g.pad?.[1] === GLASS.pad[1],
    `padding-inline ${g.pad?.join(" ") ?? "none"}`
  );
  kit.check(
    `${leg}: Jump's glyph is ${GLASS.jump} square in --ink-muted`,
    g.jump?.inline === GLASS.jump &&
      g.jump?.block === GLASS.jump &&
      g.jump?.color === g.inkMuted,
    `${g.jump?.inline}×${g.jump?.block}, color ${g.jump?.color}, --ink-muted ${g.inkMuted}`
  );
  kit.check(
    `${leg}: ink gaps read`,
    g.jumpToMachines !== null && g.numberToCaw !== null,
    `Jump → machines ${px(g.jumpToMachines)}, symbol → number ${px(g.symbolToNumber)}, number → Caw ${px(g.numberToCaw)}`
  );
};

/** What WebKit's sampler reads of the strip, and what its mask says. */
const strip = (page: Page) =>
  page.evaluate((selector) => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      return null;
    }
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      viewport: document.documentElement.clientWidth,
      background: style.backgroundColor,
      opacity: style.opacity,
      visibility: style.visibility,
      display: style.display,
      mask: style.maskImage,
    };
  }, STRIP);

/** Takes the strip's mask off (main's strip) or gives it back. */
const unmask = (page: Page, bare: boolean) =>
  page.evaluate(
    ([selector, none]) => {
      const el = document.querySelector<HTMLElement>(selector as string);
      if (el) {
        el.style.maskImage = none ? "none" : "";
      }
    },
    [STRIP, bare] as const
  );

/** Hides the strip altogether: the screen as it is with no strip on it. */
const hide = (page: Page, hidden: boolean) =>
  page.evaluate(
    ([selector, none]) => {
      const el = document.querySelector<HTMLElement>(selector as string);
      if (el) {
        el.style.display = none ? "none" : "";
      }
    },
    [STRIP, hidden] as const
  );

const rgb = (c: Rgb) => `rgb(${c.join(", ")})`;

/** A colour with no alpha below 1: no `rgba`, no `/ a`, not transparent. */
const opaque = (colour: string) =>
  !(
    colour.startsWith("rgba") ||
    colour.includes("/") ||
    colour === "transparent"
  );

/** Where two captures differ: device px, "x,y". */
const differs = (p: Raster, q: Raster): string[] => {
  const found: string[] = [];
  for (let i = 0; i < p.data.length; i += 4) {
    if (
      p.data[i] !== q.data[i] ||
      p.data[i + 1] !== q.data[i + 1] ||
      p.data[i + 2] !== q.data[i + 2]
    ) {
      const n = i / 4;
      found.push(`${n % p.width},${Math.floor(n / p.width)}`);
    }
  }
  return found;
};

type Pane = (
  view: keyof typeof HEAD,
  theme: Theme,
  scale?: number
) => Promise<Page>;

/** The strip as WebKit's sampler takes it, with its mask and without. */
const boxLeg = async (kit: Kit, page: Page, leg: string) => {
  const bar = await page.evaluate(
    () => document.documentElement.dataset.bar ?? ""
  );
  const masked = await strip(page);
  await unmask(page, true);
  const bare = await strip(page);
  await unmask(page, false);
  if (!(masked && bare)) {
    kit.check(`${leg}: the strip is on the page`, false);
    return;
  }
  const [fill] = await colours(page, [masked.background]);
  kit.check(
    `${leg}: the strip's border box is at least 90% of the viewport's width and over 10px tall`,
    masked.width >= 0.9 * masked.viewport && masked.height > 10,
    `${masked.width}×${masked.height} at top ${masked.top}, viewport ${masked.viewport}, bar "${bar}"`
  );
  kit.check(
    `${leg}: its computed background-color is opaque and the same with the mask off`,
    masked.background === bare.background && opaque(masked.background),
    `masked ${masked.background}, unmasked ${bare.background} (${fill ? rgb(fill) : "?"})`
  );
  kit.check(
    `${leg}: opacity 1, visibility visible, display not none`,
    masked.opacity === "1" &&
      masked.visibility === "visible" &&
      masked.display !== "none",
    `opacity ${masked.opacity}, visibility ${masked.visibility}, display ${masked.display}, mask ${masked.mask}`
  );
};

/** The desk's top rows with main's strip (mask off), with this one, and with none. */
const inkLeg = async (kit: Kit, page: Page, leg: string) => {
  const glass = await page.evaluate(() => {
    const r = document
      .querySelector('[data-slot="tools"]')
      ?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  });
  const [shelf] = await colours(page, [(await strip(page))?.background ?? ""]);
  if (!(glass && shelf)) {
    kit.check(`${leg}: the glass group is on the page`, false);
    return;
  }
  // `ring`: a pixel of the glass's top ring or the rail's edge, which the
  // shelf covered. The others stand on the bar's own ground (the shelf
  // while it hosts) or the glass's shadow, and are quoted as drawn.
  const ringRow = Math.round(glass.y);
  const mid = glass.x + glass.width / 2;
  const start = glass.x + 12;
  const points = ROWS.flatMap((y) => [
    {
      name: `glass mid (${Math.round(mid)}, ${y})`,
      x: mid,
      y,
      ring: y === ringRow,
    },
    {
      name: `glass start (${Math.round(start)}, ${y})`,
      x: start,
      y,
      ring: false,
    },
    { name: `rail (${RAIL_X}, ${y})`, x: RAIL_X, y, ring: true },
  ]);
  await unmask(page, true);
  const before = await capture(page, CLIP);
  await unmask(page, false);
  const after = await capture(page, CLIP);
  const again = await capture(page, CLIP);
  await hide(page, true);
  const none = await capture(page, CLIP);
  await hide(page, false);
  const read = points.map((p) => ({
    ...p,
    before: at(before, p.x, p.y),
    after: at(after, p.x, p.y),
  }));
  const noise = differs(after, again);
  const stripped = differs(after, none);
  kit.check(
    `${leg}: main's strip drew the shelf ${rgb(shelf)} over the top rows`,
    read.every((p) => off(p.before, shelf) <= 3),
    read.map((p) => `${p.name}: ${rgb(p.before)} → ${rgb(p.after)}`).join("; ")
  );
  kit.check(
    `${leg}: the masked strip leaves the glass's own top ring (row ${ringRow}) and the rail there`,
    read.filter((p) => p.ring).every((p) => off(p.after, shelf) > 3),
    `glass at ${Math.round(glass.x)},${Math.round(glass.y)} ${Math.round(glass.width)}×${Math.round(glass.height)}`
  );
  kit.check(
    `${leg}: the screen's top 16 rows are the same as with no strip at all`,
    stripped.length === 0,
    `${stripped.length} of ${after.data.length / 4} pixels differ: ${stripped.slice(0, 24).join(" ")}; between two captures of the masked strip ${noise.length}: ${noise.slice(0, 24).join(" ")}`
  );
};

/**
 * The machines' item at the desk with `machines` joined: its number drawn
 * only above 0, its name saying it only then, and with no number it is a
 * plain item (no padding of its own) (DESIGN.md, The Earned Count Rule).
 */
const machinesLeg = async (
  kit: Kit,
  base: string,
  theme: Theme,
  machines: number
) => {
  const page = await kit.page("desk", { theme });
  await open(page, `${base}/`, MACHINES, 120_000);
  const said = await page
    .waitForFunction(
      ([sel, want]) => {
        const item = document.querySelector(sel as string);
        const label = item?.getAttribute("aria-label") ?? "";
        const wanted =
          want === 0
            ? label === "Machines"
            : label.startsWith(`${want} machine`);
        return item && wanted
          ? {
              label,
              num:
                item.querySelector('[data-slot="num"]')?.textContent ?? "none",
              pad: getComputedStyle(item).paddingInline,
            }
          : null;
      },
      [MACHINES, machines] as const,
      { timeout: 60_000 }
    )
    .then((handle) => handle.jsonValue())
    .catch(() =>
      page.$eval(MACHINES, (item) => ({
        label: item.getAttribute("aria-label") ?? "",
        num: item.querySelector('[data-slot="num"]')?.textContent ?? "none",
        pad: getComputedStyle(item).paddingInline,
      }))
    );
  const num = machines > 0 ? String(machines) : "none";
  const label =
    machines > 0
      ? `${machines} ${machines === 1 ? "machine" : "machines"}`
      : "Machines";
  kit.check(
    `machines desk ${theme}, ${machines} joined: the number is ${num}, the name "${label}"${machines > 0 ? "" : ", a plain item"}`,
    !!said &&
      said.num === num &&
      // Above 0 the name may go on to say what needs attention.
      (machines > 0 ? said.label.startsWith(label) : said.label === label) &&
      (machines > 0 || said.pad === "0px"),
    JSON.stringify(said)
  );
  await page.close();
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  const base = await fleet.devDashboard();
  for (const theme of THEMES) {
    await machinesLeg(kit, base, theme, 0);
  }
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  for (const theme of THEMES) {
    await machinesLeg(kit, base, theme, 1);
  }
  await fleet.accountSignedIn();
  const alpha = await fleet.spawn("claude", "Alpha");
  await fleet.send(alpha, "hello");
  const beta = await fleet.spawn("claude", "Beta");
  await fleet.send(beta, "hello");

  /** A page on `view` with both sessions in its one pane, Alpha in front. */
  const pane: Pane = async (view, theme, scale) => {
    const page = await kit.page(view, { theme, ...(scale ? { scale } : {}) });
    await page.addInitScript(
      ([tabs, active]) => {
        localStorage.setItem(
          "cawco-workspace",
          JSON.stringify({
            v: 1,
            root: { t: "l", id: "pone", tabs, active, opened: null },
            focusedLeaf: "pone",
          })
        );
      },
      [[alpha, beta], alpha] as const
    );
    await open(page, `${base}/session/${alpha}`, "[data-session-tab]", 120_000);
    // As `open` hands the page over, it draws its own answers: Caw's head the
    // side NeedsCaw sets from the width (`head`, 24 on a phone, 20 in the
    // wide bar's group), not the server's guess from the cookie.
    const side = await page.evaluate(() => {
      const face = document.querySelector<HTMLElement>(
        "[data-needs-caw] [data-caw-phase]"
      );
      return face ? getComputedStyle(face).getPropertyValue("--side") : null;
    });
    kit.check(
      `${view} ${theme}${scale ? ` ${scale}x` : ""}: as open() returns, Caw's head is ${HEAD[view]}px`,
      side === `${HEAD[view]}px`,
      `--side ${side ?? "no face"}`
    );
    // The bar marks the root once it has placed the tabs: hosting them at
    // the desk, floating over the phone's tab row. The strip's colour follows.
    await page.waitForFunction(
      (mark) => (document.documentElement.dataset.bar ?? "").includes(mark),
      view === "desk" ? "hosting" : "floating",
      { timeout: 30_000 }
    );
    await settle(page);
    await page.waitForTimeout(400);
    return page;
  };

  for (const view of ["desk", "phone"] as const) {
    for (const theme of THEMES) {
      const page = await pane(view, theme);
      await boxLeg(kit, page, `${view} ${theme}`);
      await page.close();
    }
  }
  for (const theme of THEMES) {
    const page = await pane("desk", theme, 1);
    await inkLeg(kit, page, `desk 1x ${theme}`);
    await page.close();
  }
  await sessionAsking(fleet, "Gamma", "edge-top");
  for (const view of ["desk", "phone"] as const) {
    for (const theme of THEMES) {
      const page = await pane(view, theme);
      await glassLeg(kit, page, `glass ${view} ${theme}`, view === "desk");
      await page.close();
    }
  }
};

const spec: Spec = {
  group: "iPhone Safari",
  name: "edge-top",
  run,
};
export default spec;
