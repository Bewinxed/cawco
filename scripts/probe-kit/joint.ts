/**
 * The joint where a hang (a card, a menu) meets the folder tab it hangs from
 * (motion/hang-shape): its geometry from the engine, and its stroke read by
 * ink across the outline (rule 7: a seam is what drawing alone decides).
 *
 * The outline is one 1px stroke lying just inside the silhouette's edge.
 * Read across it (along the outline's normal, from 4px outside to 4px
 * inside, bilinear luminance in device px) at every point of the joint (the
 * hang's top edge running into the foot's tip, and the foot's quarter turn
 * up to the flank), and on a straight edge for reference (the hang's side,
 * half way down):
 *  - core: how fully the stroke's ink is reached at its middle, against the
 *    fill inside (1 = the stroke's own ink);
 *  - inner: where the ink falls to half going in, px from the silhouette's
 *    edge (1 for a 1px stroke): no gap (0), no doubled stroke (past 1);
 *  - fall: the inner edge's 90%-to-10% fall, device px (its sharpness);
 *  - second: the most ink found from 0.75px past the stroke to 3px in (a
 *    second edge);
 *  - level: how far the darkest (or lightest) px stands from the stroke's own
 *    ink, of 255.
 */
import type { Page } from "playwright-core";
import { capture, dx, dy, px, type Raster, type Rgb } from "./ink";

/** The engine's account of a hang and its tab, on the page. */
export interface JointGeometry {
  card: { bottom: number; left: number; right: number; top: number };
  flare: number;
  flush: { end: boolean; start: boolean };
  /** The outline's path as drawn. */
  outline: string;
  /** The stroke's ink at the joint (`border-control`), and the hang's fill under its head. */
  stroke: Rgb;
  tab: { bottom: number; left: number; right: number; top: number };
  /** The tab's own sheet as drawn and the stack's ranks: what lies under the joint. */
  tabSheet: string;
}

/** Reads a hang's geometry: `card` its surface's selector; its tab is the one hung. */
export const jointGeometry = (page: Page, card: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    const ff = document.querySelector<HTMLElement>(".tab[data-hung] .ff-tab");
    const line = document.querySelector<SVGPathElement>(
      ".hang-outline path.line"
    );
    if (!(el && ff && line)) {
      return null;
    }
    // The stroke's ink as drawn: the token resolved through a canvas into
    // sRGB (a computed colour keeps its own space: oklch, light-dark()).
    const probe = document.createElement("span");
    probe.style.color = "var(--border-control)";
    document.body.append(probe);
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const paint = canvas.getContext("2d") as CanvasRenderingContext2D;
    paint.fillStyle = getComputedStyle(probe).color;
    paint.fillRect(0, 0, 1, 1);
    const [r0, g0, b0] = paint.getImageData(0, 0, 1, 1).data;
    probe.remove();
    const c = el.getBoundingClientRect();
    const t = ff.getBoundingClientRect();
    return {
      card: { left: c.left, right: c.right, top: c.top, bottom: c.bottom },
      tab: { left: t.left, right: t.right, top: t.top, bottom: t.bottom },
      flare: Number.parseFloat(
        getComputedStyle(ff).getPropertyValue("--flare")
      ),
      flush: {
        start: Math.abs(c.left - t.left) <= 1,
        end: Math.abs(c.right - t.right) <= 1,
      },
      outline: line.getAttribute("d") ?? "",
      // The tab's own sheet as drawn, and its rank against its neighbours:
      // what lies under the outline where the joint is read.
      tabSheet: `${ff.querySelector("svg.fold defs path")?.getAttribute("d") ?? ""} | ranks ${[
        ...(ff.closest(".ff-tabs-list")?.children ?? []),
      ]
        .map((one) => getComputedStyle(one).zIndex)
        .join(
          ","
        )} (hung ${getComputedStyle(ff.closest(".tab") as Element).zIndex})`,
      stroke: [r0 ?? 0, g0 ?? 0, b0 ?? 0] as [number, number, number],
    };
  }, card);

/** A path's commands, each with its numbers. */
const COMMAND = /([MLCAZ])([^MLCAZ]*)/g;
const SPACES = /\s+/;

const lum = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Luminance at a page point, bilinear between device px centres. */
function sample(r: Raster, x: number, y: number): number {
  const X = dx(r, x) - 0.5;
  const Y = dy(r, y) - 0.5;
  const x0 = Math.floor(X);
  const y0 = Math.floor(Y);
  const fx = X - x0;
  const fy = Y - y0;
  const at = (i: number, j: number) => lum(px(r, x0 + i, y0 + j));
  return (
    at(0, 0) * (1 - fx) * (1 - fy) +
    at(1, 0) * fx * (1 - fy) +
    at(0, 1) * (1 - fx) * fy +
    at(1, 1) * fx * fy
  );
}

/** One read across the outline at a point of its edge (`x`, `y`), `nx`/`ny` the unit normal pointing in. */
export interface Across {
  core: number;
  fall: number;
  inner: number;
  level: number;
  /** The ink every 0.25px from the edge in to 4px, in hundredths: what a failing read crossed. */
  profile: number[];
  second: number;
}

export function across(
  r: Raster,
  stroke: number,
  x: number,
  y: number,
  nx: number,
  ny: number
): Across {
  const step = 0.125 / r.scale;
  const at = (t: number) => sample(r, x + nx * t, y + ny * t);
  const fill = at(3.75);
  const span = stroke - fill;
  const ink = (t: number) => (at(t) - fill) / span;
  // Its middle: the most ink over the stroke's px.
  let core = 0;
  let level = 255;
  for (let t = 0; t <= 1; t += step) {
    core = Math.max(core, ink(t));
    const v = Math.round(
      lum(px(r, Math.floor(dx(r, x + nx * t)), Math.floor(dy(r, y + ny * t))))
    );
    level = Math.min(level, Math.abs(v - stroke));
  }
  // Going in from its middle: where the ink falls to half, and its fall.
  let inner = Number.NaN;
  let hi = Number.NaN;
  let lo = Number.NaN;
  for (let t = 0.5; t <= 3; t += step) {
    const v = ink(t);
    if (Number.isNaN(hi) && v <= 0.9) {
      hi = t;
    }
    if (Number.isNaN(inner) && v <= 0.5) {
      inner = t;
    }
    if (Number.isNaN(lo) && v <= 0.1) {
      lo = t;
      break;
    }
  }
  let second = 0;
  for (let t = (Number.isNaN(lo) ? 1 : lo) + 0.75; t <= 3; t += step) {
    second = Math.max(second, ink(t));
  }
  return {
    core,
    inner,
    fall: (lo - hi) * r.scale,
    second,
    level,
    profile: Array.from({ length: 17 }, (_, k) =>
      Math.round(ink(k * 0.25) * 100)
    ),
  };
}

/** The joint's reads on each side the hang flares on, and the reference, at the page's scale. */
export async function jointInk(page: Page, g: JointGeometry) {
  const f = g.flare;
  const shelf = g.tab.bottom;
  const clip = {
    x: Math.floor(g.card.left - 8),
    y: Math.floor(g.tab.top - 4),
    width: Math.ceil(g.card.right - g.card.left + 16),
    height: Math.ceil(Math.min(g.card.bottom, shelf + 160) - g.tab.top + 8),
  };
  const r = await capture(page, clip);
  const stroke = lum(g.stroke);
  const mid = shelf + Math.min(80, (g.card.bottom - shelf) / 2);
  const reference = across(r, stroke, g.card.left, mid, 1, 0);
  const sides: {
    side: "start" | "end";
    reads: { at: string; read: Across }[];
  }[] = [];
  for (const side of ["start", "end"] as const) {
    if (g.flush[side]) {
      continue;
    }
    const way = side === "start" ? -1 : 1;
    const tip = side === "start" ? g.tab.left - f : g.tab.right + f;
    const reads: { at: string; read: Across }[] = [];
    // The top edge's run, out from the tip to 4px before the hang's corner.
    const corner = side === "start" ? g.card.left + 12 : g.card.right - 12;
    for (let s = 0; s <= Math.abs(tip - corner) - 2; s += 0.5) {
      const x = tip + way * s;
      reads.push({
        at: `edge ${s}px out`,
        read: across(r, stroke, x, shelf, 0, 1),
      });
    }
    // The foot's quarter turn, from its tip up to the flank: the edge is
    // the circle of radius f about (tip, shelf - f); in is away from it.
    for (let a = 0; a <= 90; a += 5) {
      const th = (a * Math.PI) / 180;
      const ux = -way * Math.sin(th);
      const uy = Math.cos(th);
      reads.push({
        at: `foot ${a}°`,
        read: across(r, stroke, tip + ux * f, shelf - f + uy * f, ux, uy),
      });
    }
    sides.push({ side, reads });
  }
  return { reference, sides };
}

/**
 * The tangent's turn where the foot meets the hang's edge, degrees, read
 * off the outline's commands: the top edge's last run into the foot's tip
 * against the foot's first handle out of it (each side the hang flares on).
 */
export function jointTurns(g: JointGeometry): number[] {
  const cmds = [...g.outline.matchAll(COMMAND)].map((m) => ({
    c: m[1] as string,
    n: (m[2] ?? "").trim().split(SPACES).filter(Boolean).map(Number),
  }));
  const turns: number[] = [];
  const angle = (ax: number, ay: number, bx: number, by: number) => {
    const d = (Math.atan2(by, bx) - Math.atan2(ay, ax)) * (180 / Math.PI);
    return Math.abs(((d + 540) % 360) - 180);
  };
  // The path opens at the start foot's tip (M), its first cubic leaving it;
  // it closes on the top edge's last run into that tip (an L before Z).
  const [first, foot0] = cmds;
  const lastL = [...cmds].reverse().find((c) => c.c === "L");
  if (!g.flush.start && first && foot0 && lastL) {
    const [tx, ty] = first.n as [number, number];
    const before = cmds[cmds.indexOf(lastL) - 1];
    const bn = before?.n ?? [];
    const px0 = bn.at(-2) ?? tx;
    const py0 = bn.at(-1) ?? ty;
    turns.push(
      angle(tx - px0, ty - py0, (foot0.n[0] ?? 0) - tx, (foot0.n[1] ?? 0) - ty)
    );
  }
  // The end foot: its cubic into its tip, then the edge's first run out.
  const endFoot = cmds.findIndex(
    (c, k) => k > 1 && c.c === "C" && cmds[k + 1]?.c === "L"
  );
  const endCubic = cmds[endFoot];
  const run = cmds[endFoot + 1];
  if (!g.flush.end && endCubic && run) {
    const [, , hx, hy, tx, ty] = endCubic.n as number[];
    turns.push(
      angle(
        (tx ?? 0) - (hx ?? 0),
        (ty ?? 0) - (hy ?? 0),
        (run.n[0] ?? 0) - (tx ?? 0),
        (run.n[1] ?? 0) - (ty ?? 0)
      )
    );
  }
  return turns;
}
