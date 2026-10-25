/**
 * The shape of a pin's foot (PinFoot): the pin as one silhouette with the
 * card hung beside it (DESIGN.md, "A card that hangs from its anchor"; "A
 * thread beside its pin"). Drawn in the foot's own box, the pin's pill as
 * drawn with its focus ring (`RING_OUT` round its box): its far end keeps
 * the pill's corners, its near end (the side facing the card) runs square
 * into the cut at the card's edge, and each of its flanks (the pill's top
 * and bottom) flares into that edge by the neck's flare there, a quarter
 * turn of that radius, as the glass's foot flares into the top bar's card.
 *
 * Written for a card at the pin's end side (the cut at the box's right
 * edge) and turned over for one at its start side (the cut at its left),
 * which turns each arc's way round.
 *
 * - `footPath`: the silhouette, closed a pixel past the cut (`OVER`, under
 *   the card's edge);
 * - `footEdge`: its edge line, `HALF` in, open along the cut, where the
 *   card's own edge (and its neck's cut) takes it on;
 * - `facePath`: the pill's face, which the foot leaves open so the pin's own
 *   fill shows through it, never painted over.
 */

/** How far the pin as drawn stands round its box: its 2px raised ring and its 2px focus ring (PinMark, the overlay's pins.ts `RING`). */
export const RING_OUT = 4;
/** Half the edge's 1px stroke: the edge line is drawn this far in from the silhouette's edge. */
const HALF = 0.5;
/** A pill's tail corner's radius: `--radius-hair` (pins.ts `TAIL_R`). */
export const TAIL_R = 2;
/** How far the foot runs on past the cut, under the card's edge, px. */
export const OVER = 1;
/** A pill's dot across: `--status-dot-size`, as PinFoot reads it off the page. */
const DOT = 6;

/** The corner a pill's tail is (pins.ts `Tail`), standing on its point; none for a pin on the page as a whole. */
export type PinTail =
  "bottom-start" | "bottom-end" | "top-start" | "top-end" | "none";

/** The foot as drawn now. */
export interface FootShape {
  /** The flare at the card's edge above the pin (its start along the edge) and below it (its end), px; 0 where the pin stands flush with the card's corner. */
  flareEnd: number;
  flareStart: number;
  /** The pin's box with its rings: the foot's own box, px. */
  h: number;
  /** The side of the pin the card stands at. */
  side: "start" | "end";
  tail: PinTail;
  w: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A pill's corner radii grown `by` round its box (pins.ts `corners`): [top-left, top-right, bottom-right, bottom-left], each held to half its height. */
export const pillCorners = (
  h: number,
  tail: PinTail,
  by: number
): [number, number, number, number] => {
  const pill = h / 2 + by;
  const hair = TAIL_R + by;
  return [
    tail === "top-start" ? hair : pill,
    tail === "top-end" ? hair : pill,
    tail === "bottom-end" ? hair : pill,
    tail === "bottom-start" ? hair : pill,
  ];
};

/** A rounded box's path, each corner its own radius (pins.ts `shapePath`). */
export function boxPath(
  x: number,
  y: number,
  w: number,
  h: number,
  [tl, tr, br, bl]: [number, number, number, number]
): string {
  const most = Math.min(w, h) / 2;
  const [a, b, c, d] = [tl, tr, br, bl].map((r) => Math.min(r, most));
  return [
    `M ${r2(x + a)} ${r2(y)}`,
    `H ${r2(x + w - b)}`,
    `A ${r2(b)} ${r2(b)} 0 0 1 ${r2(x + w)} ${r2(y + b)}`,
    `V ${r2(y + h - c)}`,
    `A ${r2(c)} ${r2(c)} 0 0 1 ${r2(x + w - c)} ${r2(y + h)}`,
    `H ${r2(x + d)}`,
    `A ${r2(d)} ${r2(d)} 0 0 1 ${r2(x)} ${r2(y + h - d)}`,
    `V ${r2(y + a)}`,
    `A ${r2(a)} ${r2(a)} 0 0 1 ${r2(x + a)} ${r2(y)}`,
    "Z",
  ].join(" ");
}

/** The far end's corners (top, bottom), from the pill's own grown by its rings: the tail's where it stands there. */
function farCorners(s: FootShape): { bottom: number; top: number } {
  const [tl, tr, br, bl] = pillCorners(s.h - 2 * RING_OUT, s.tail, RING_OUT);
  const most = Math.min(s.w, s.h) / 2;
  return s.side === "end"
    ? { top: Math.min(tl, most), bottom: Math.min(bl, most) }
    : { top: Math.min(tr, most), bottom: Math.min(br, most) };
}

/** A point written for a card at the end side, laid where the card stands. */
const pointOf = (s: FootShape) => (x: number, y: number) =>
  `${r2(s.side === "end" ? x : s.w - x)} ${r2(y)}`;
/** An arc's sweep, turned over with the shape for a card at the start side. */
const sweepOf = (s: FootShape) => (sweep: 0 | 1) =>
  s.side === "end" ? sweep : 1 - sweep;

/**
 * The foot's silhouette, closed along the cut (the box's edge facing the
 * card), from the top flare's tip on the cut round the far end to the
 * bottom flare's tip.
 */
export function footPath(s: FootShape): string {
  const pt = pointOf(s);
  const sw = sweepOf(s);
  const { w, h } = s;
  const far = farCorners(s);
  const fs = s.flareStart;
  const fe = s.flareEnd;
  const out: string[] = [];
  if (fs > 0) {
    out.push(
      `M ${pt(w, -fs)}`,
      `A ${r2(fs)} ${r2(fs)} 0 0 ${sw(1)} ${pt(w - fs, 0)}`
    );
  } else {
    out.push(`M ${pt(w, 0)}`);
  }
  out.push(`L ${pt(far.top, 0)}`);
  out.push(`A ${r2(far.top)} ${r2(far.top)} 0 0 ${sw(0)} ${pt(0, far.top)}`);
  out.push(`L ${pt(0, h - far.bottom)}`);
  out.push(
    `A ${r2(far.bottom)} ${r2(far.bottom)} 0 0 ${sw(0)} ${pt(far.bottom, h)}`
  );
  if (fe > 0) {
    out.push(
      `L ${pt(w - fe, h)}`,
      `A ${r2(fe)} ${r2(fe)} 0 0 ${sw(1)} ${pt(w, h + fe)}`
    );
  } else {
    out.push(`L ${pt(w, h)}`);
  }
  // Closed a pixel past the cut, under the card's edge: wherever the card
  // and the pin land a part of a pixel apart, no seam of the ground shows
  // between them (the glass's join runs a pixel into the card's top, too).
  out.push(`L ${pt(w + OVER, h + fe)}`, `L ${pt(w + OVER, -fs)}`, "Z");
  return out.join(" ");
}

/**
 * The shapes the foot's liquid bridge is drawn from, `p` of the way out
 * (PinFoot's goo): the pin as drawn, its near end rounding square as `p`
 * goes from 0 to 1, and each flank's flare grown to `p` of its own, as
 * shapes apart, which the bridge melts into one. At 1 they are the foot.
 */
export function footAt(s: FootShape, p: number): string {
  const t = Math.min(1, Math.max(0, p));
  const pt = pointOf(s);
  const sw = sweepOf(s);
  const { w, h } = s;
  const far = farCorners(s);
  const near = (Math.min(w, h) / 2) * (1 - t);
  const [nearTop, nearBottom] = [near, near];
  const corners: [number, number, number, number] =
    s.side === "end"
      ? [far.top, nearTop, nearBottom, far.bottom]
      : [nearTop, far.top, far.bottom, nearBottom];
  const body = boxPath(0, 0, w, h, corners);
  const fillet = (f: number, top: boolean) => {
    if (f <= 0) {
      return "";
    }
    const y = top ? 0 : h;
    const tip = top ? -f : h + f;
    return `M ${pt(w, tip)} A ${r2(f)} ${r2(f)} 0 0 ${sw(top ? 1 : 0)} ${pt(w - f, y)} L ${pt(w, y)} Z`;
  };
  return [body, fillet(s.flareStart * t, true), fillet(s.flareEnd * t, false)]
    .filter(Boolean)
    .join(" ");
}

/**
 * The foot's edge line, `HALF` in from its silhouette, open along the cut:
 * a flare's line is the band between its radius f and f + 1 at its middle
 * (f + `HALF` about the flare's centre), from where it crosses the cut on,
 * so it meets the card's edge and its neck's cut (motion/hang `neckCut`)
 * as one stroke.
 */
export function footEdge(s: FootShape): string {
  const pt = pointOf(s);
  const sw = sweepOf(s);
  const { w, h } = s;
  const far = farCorners(s);
  const fs = s.flareStart;
  const fe = s.flareEnd;
  /** Where a flare's middle circle crosses the cut, past the flare's centre. */
  const cross = (f: number) => Math.sqrt((f + HALF) ** 2 - f ** 2);
  const out: string[] = [];
  if (fs > 0) {
    out.push(
      `M ${pt(w, -fs + cross(fs))}`,
      `A ${r2(fs + HALF)} ${r2(fs + HALF)} 0 0 ${sw(1)} ${pt(w - fs, HALF)}`
    );
  } else {
    out.push(`M ${pt(w, HALF)}`);
  }
  out.push(`L ${pt(far.top, HALF)}`);
  out.push(
    `A ${r2(far.top - HALF)} ${r2(far.top - HALF)} 0 0 ${sw(0)} ${pt(HALF, far.top)}`
  );
  out.push(`L ${pt(HALF, h - far.bottom)}`);
  out.push(
    `A ${r2(far.bottom - HALF)} ${r2(far.bottom - HALF)} 0 0 ${sw(0)} ${pt(far.bottom, h - HALF)}`
  );
  if (fe > 0) {
    out.push(
      `L ${pt(w - fe, h - HALF)}`,
      `A ${r2(fe + HALF)} ${r2(fe + HALF)} 0 0 ${sw(1)} ${pt(w, h + fe - cross(fe))}`
    );
  } else {
    out.push(`L ${pt(w, h - HALF)}`);
  }
  return out.join(" ");
}

/** The pill's face in the foot's box: its own box, `RING_OUT` in, its corners round but for its tail. */
export function facePath(s: FootShape): string {
  const fw = s.w - 2 * RING_OUT;
  const fh = s.h - 2 * RING_OUT;
  return boxPath(RING_OUT, RING_OUT, fw, fh, pillCorners(fh, s.tail, 0));
}

/** The pill's dot on its top end corner (PinMark, pins.ts `dotOf`), in the foot's box: a circle of the dot's size, `size` across. */
export function dotPath(s: FootShape, size = DOT): string {
  const r = size / 2;
  const cx = s.w - RING_OUT - 1;
  const cy = RING_OUT + 1;
  return `M ${r2(cx - r)} ${r2(cy)} a ${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0 a ${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0 Z`;
}
