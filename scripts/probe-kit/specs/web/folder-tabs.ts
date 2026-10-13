/**
 * Both folder strips on the bench (/motion/folder-proof, no hub): the real
 * PaneTabs (six tabs: needs you, working, idle, done, failed, idle) and the
 * real WorkTabs (Working and Finished), on the desk and the phone, light and
 * dark. The session strip switches from its second tab to its third, the
 * home's from Working to Finished; each switch is caught on the clock
 * (anim.ts) and read at every 5% of it and either side of the handover.
 *
 * Engine (every frame read), from computed values:
 *  - one clock: everything moving in the strip as the switch starts runs on
 *    one (sheets, cards, titles, rims, their lean and their glow);
 *  - feet: each switching tab's flared foot in front and in view stands at
 *    its sheet's opacity, within 0.03: body and feet one shape on one clock;
 *  - handover: no rim's strength moves over 0.08 from 49% to 51%, and where
 *    a seam's front changes there its stroke's strength holds within 15%;
 *  - jump (the second tab to the fourth, past the rimless idle third): the
 *    outgoing and incoming tops never dip under the lower of their two rests
 *    and move one way;
 *  - subtle: at rest every unchosen tab that is not idle wears its rim at
 *    `tab-rim-mix-subtle`, under the chosen one's, and draws;
 *  - idle none: an unchosen idle tab's rim draws nothing.
 * Geometry: fades (each tab drawn chosen clear of the edge fades, but the
 * one a switch leaves where the two are wider than the track) and titles
 * (none cut).
 * Ink, at rest and at 0, 25, 49, 50, 51, 75 and 100% (what drawing alone
 * decides): one stroke down every shared edge, drawn by its front side only;
 * one piece where two tops meet; the chosen rim at 3:1; each free foot's
 * taper; and on the rimless strip, each seam's edge where the glide puts it,
 * moving one way. Ink at every 5% of the switch (composite): each switching
 * tab's flared foot as drawn never falls back along it by more than 0.07 of
 * its whole.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each rule is read case by case, as the drawing has them.
import { Clock, type Look, overlay } from "../../anim";
import {
  at,
  capture,
  contrast,
  dx,
  dy,
  inkOver,
  pieces,
  px,
  type Raster,
  type Rgb,
  strokes,
} from "../../ink";
import {
  type Kit,
  open,
  type Spec,
  settle,
  THEMES,
  type View,
} from "../../kit";

const VIEWS_READ: View[] = ["desk", "phone"];
/** The frames ink is read at, % of the switch. */
const INK_PCTS = [0, 25, 49, 50, 51, 75, 100];
/** The frames the engine is read at: every 5% and either side of the handover. */
const PCTS = [...Array.from({ length: 21 }, (_, k) => k * 5), 49, 51].sort(
  (a, b) => a - b
);
/** Room round the strip in every capture, css px. */
const ROOM = 24;
/** How far a foot may stand off its sheet's opacity. */
const FOOT_TOLERANCE = 0.03;

interface Strip {
  api: "session" | "work";
  count: number;
  /** Whether it draws a rim (PaneTabs); WorkTabs has none by design (5c57755c). */
  rim: boolean;
  root: string;
  tab: string;
}
const STRIPS: Strip[] = [
  {
    api: "session",
    root: '[data-strip="session"]',
    tab: ".tab",
    count: 6,
    rim: true,
  },
  {
    api: "work",
    root: '[data-strip="work"]',
    tab: ".ff-tab",
    count: 2,
    rim: false,
  },
];

/** Everything the engine says about a strip in one frame. */
function layoutOf({ root, tab }: { root: string; tab: string }) {
  const track = document.querySelector(`${root} .ff-tabs-list`) as HTMLElement;
  const tr = track.getBoundingClientRect();
  const ts = getComputedStyle(track);
  const num = (s: CSSStyleDeclaration, n: string) =>
    Number.parseFloat(s.getPropertyValue(n)) || 0;
  const cap = (n: string) => {
    const v = Number.parseFloat(track.style.getPropertyValue(n));
    return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
  };
  const laid = (el: HTMLElement) => {
    let up = el;
    while (up.parentElement && up.parentElement !== track) {
      up = up.parentElement;
    }
    return up;
  };
  const op = (el: Element | null) =>
    el ? Number(getComputedStyle(el).opacity) : 0;
  const els = [...document.querySelectorAll<HTMLElement>(`${root} ${tab}`)];
  const tabs = els.map((el) => {
    const r = el.getBoundingClientRect();
    const l = laid(el);
    const ls = getComputedStyle(l);
    const rim = el.querySelector<HTMLElement>(".rim");
    const text = el.querySelector(".label .text") as HTMLElement;
    const ff = el.matches(".ff-tab") ? el : el.querySelector(".ff-tab");
    const rs = rim ? getComputedStyle(rim) : null;
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      tone: el.dataset.tone ?? "",
      chosen:
        el.hasAttribute("data-chosen") || el.classList.contains("selected"),
      z: Number(ls.getPropertyValue("--z") || 0),
      cutStart: Number(l.style.getPropertyValue("--cut-start") || 0),
      cutEnd: Number(l.style.getPropertyValue("--cut-end") || 0),
      sheet: ff ? Number(getComputedStyle(ff, "::after").opacity) : 0,
      label: text.textContent ?? "",
      labelScroll: text.scrollWidth,
      labelClient: text.clientWidth,
      rim:
        rim && rs
          ? {
              opacity: op(rim),
              top: op(rim) * op(rim.querySelector(".rim-top")),
              F: num(rs, "--F"),
              fn: num(rs, "--fn"),
              tn: num(rs, "--tn"),
              taper: num(rs, "--tl"),
              ease: num(rs, "--te"),
              radius: num(rs, "--radius"),
              lean: new DOMMatrix(rs.transform === "none" ? "" : rs.transform)
                .m22,
              sides: (["start", "end"] as const).map((side) => {
                const s = rim.querySelector(
                  `.rim-side[data-side="${side}"]`
                ) as HTMLElement;
                const sr = s.getBoundingClientRect();
                return {
                  side,
                  left: sr.left,
                  right: sr.right,
                  op: op(s),
                  plain: op(s.querySelector(".rim-plain")),
                  flared: op(s.querySelector(".rim-flared")),
                  under: ls.getPropertyValue(`--under-${side}`).trim() === "1",
                };
              }),
            }
          : null,
    };
  });
  return {
    track: {
      left: tr.left,
      right: tr.right,
      top: tr.top,
      bottom: tr.bottom,
      fadeStart: num(ts, "--fade-start"),
      fadeEnd: num(ts, "--fade-end"),
      capStart: cap("--fade-cap-start"),
      capEnd: cap("--fade-cap-end"),
      radius: num(ts, "--radius"),
      flare: num(ts, "--flare"),
      stroke: num(ts, "--rim-w"),
      tuck: num(ts, "--overlap") - num(ts, "--rim-w"),
    },
    tabs,
    subtle: Number.parseFloat(
      getComputedStyle(els[0] as HTMLElement).getPropertyValue(
        "--tab-rim-mix-subtle"
      )
    ),
    phone: innerWidth <= 899,
  };
}
type Layout = ReturnType<typeof layoutOf>;
type Tab = Layout["tabs"][number];
type Side = NonNullable<Tab["rim"]>["sides"][number];

/** A side's outline x (one flare in from its own box), and whether it stands clear of the fades with room to read. */
function sideAt(L: Layout, t: Tab, s: Side) {
  const F = t.rim?.F ?? 0;
  const x0 = s.side === "start" ? s.left + F : s.right - F;
  const reach = F + 2;
  return {
    x0,
    inView:
      x0 - reach > L.track.left + L.track.fadeStart * 1.5 + 2 &&
      x0 + reach < L.track.right - L.track.fadeEnd - 2,
  };
}

/** Where the strip stands with its room, inside the viewport. */
const clipOf = (page: import("playwright-core").Page, strip: Strip) =>
  page.evaluate(
    ({ room, root }) => {
      const r = (
        document.querySelector(`${root} .ff-tabs-list`) as HTMLElement
      ).getBoundingClientRect();
      const x = Math.max(0, Math.floor(r.left - room));
      const y = Math.max(0, Math.floor(r.top - room));
      return {
        x,
        y,
        width: Math.min(innerWidth, Math.ceil(r.right + room)) - x,
        height: Math.min(innerHeight, Math.ceil(r.bottom + room)) - y,
      };
    },
    { room: ROOM, root: strip.root }
  );

/** What `selector` names hidden, with everything inside it. */
const hidden = (selector: string): Look[] => [
  { selector, style: { visibility: "hidden" } },
  { selector: `${selector} *`, style: { visibility: "hidden" } },
];
/** The rims' glow off. */
const glowOff = (strip: Strip): Look[] => [
  { selector: `${strip.root} .rim`, style: { filter: "none" } },
];
/** The elements marked `data-kit-pick` (by `pick`). */
const PICKED = "[data-kit-pick]";

/** Marks elements (per tab, under it) as `PICKED`; none clears the marks. */
const pick = (
  page: import("playwright-core").Page,
  strip: Strip,
  picks: { tab: number; sel: string }[]
) =>
  page.evaluate(
    ({ root, tab, list }) => {
      for (const el of document.querySelectorAll("[data-kit-pick]")) {
        el.removeAttribute("data-kit-pick");
      }
      const tabs = document.querySelectorAll<HTMLElement>(`${root} ${tab}`);
      for (const p of list) {
        for (const el of tabs[p.tab]?.querySelectorAll(p.sel) ?? []) {
          el.setAttribute("data-kit-pick", "");
        }
      }
    },
    { root: strip.root, tab: strip.tab, list: picks }
  );

/** The page drawn with `looks` (anim.ts `overlay`) and the strip captured; the overlay taken away after. */
async function captureWith(
  page: import("playwright-core").Page,
  clip: Awaited<ReturnType<typeof clipOf>>,
  looks: Look[]
): Promise<Raster> {
  await overlay(page, looks);
  try {
    return await capture(page, clip);
  } finally {
    await overlay(page, []);
  }
}

/** One frame's ink captures and readings for a strip (see the file's head). */
async function inkFrame(
  page: import("playwright-core").Page,
  strip: Strip,
  L: Layout
) {
  const clip = await clipOf(page, strip);
  if (!strip.rim) {
    // The rimless strip: its sheets alone, what is written on them hidden.
    await pick(
      page,
      strip,
      L.tabs.map((_, i) => ({ tab: i, sel: ":scope > *" }))
    );
    const sheet = await captureWith(page, clip, hidden(PICKED));
    await pick(page, strip, []);
    return { sheet: sheetEdges(sheet, L) };
  }
  const base = await capture(page, clip);
  // Each seam's behind side hidden, then its front side: one edge is the front's alone.
  const seams = seamBoxes(L);
  const facing = (s: (typeof seams)[number], front: boolean) => {
    const leftFront = s.front === s.i;
    const left = front === leftFront;
    return {
      tab: left ? s.i : s.i + 1,
      sel: `.rim-side[data-side="${left ? "end" : "start"}"]`,
    };
  };
  await pick(
    page,
    strip,
    seams.map((s) => facing(s, false))
  );
  const behindHidden = await captureWith(page, clip, hidden(PICKED));
  await pick(
    page,
    strip,
    seams.map((s) => facing(s, true))
  );
  const frontHidden = await captureWith(page, clip, hidden(PICKED));
  // The rims' ink with the glow off: shown; the plain feet alone and whole;
  // hidden; each parity alone.
  const lit = await captureWith(page, clip, glowOff(strip));
  const plainLit = await captureWith(page, clip, [
    {
      selector: `${strip.root} .rim`,
      style: { filter: "none", opacity: "1" },
    },
    { selector: `${strip.root} .rim-side`, style: { opacity: "1" } },
    { selector: `${strip.root} .rim-plain`, style: { opacity: "1" } },
    { selector: `${strip.root} .rim-flared`, style: { visibility: "hidden" } },
  ]);
  const unlit = await captureWith(page, clip, [
    ...glowOff(strip),
    ...hidden(`${strip.root} .rim`),
  ]);
  const alone = async (shown: 0 | 1) => {
    await pick(
      page,
      strip,
      L.tabs.flatMap((_, i) =>
        i % 2 === shown ? [] : [{ tab: i, sel: ".rim" }]
      )
    );
    return captureWith(page, clip, [...glowOff(strip), ...hidden(PICKED)]);
  };
  const even = await alone(0);
  const odd = await alone(1);
  await pick(page, strip, []);
  return {
    base,
    sides: seams.map((s) => ({
      ...s,
      behindPx: changed(base, behindHidden, s.box),
      frontPx: changed(base, frontHidden, s.box),
    })),
    corners: corners(L, even, odd, unlit),
    taper: taperOf(L, lit, plainLit, unlit),
  };
}

/** Each shared edge in view: its box under the shoulders to the shelf, and its front tab. */
function seamBoxes(L: Layout) {
  return L.tabs.slice(0, -1).flatMap((a, i) => {
    const b = L.tabs[i + 1] as Tab;
    const lo = Math.min(b.left, a.right) - 4;
    const hi = Math.max(b.left, a.right) + 4;
    if (lo < L.track.left + 1 || hi > L.track.right - 1) {
      return [];
    }
    const top = Math.max(a.top, b.top) + L.track.radius;
    return [
      {
        i,
        front: a.z > b.z ? i : i + 1,
        box: { left: lo, right: hi, top, bottom: Math.min(a.bottom, b.bottom) },
      },
    ];
  });
}

/** The device pixels inside a css box two captures differ on (by more than 24 of 765). */
function changed(
  p: Raster,
  q: Raster,
  b: { bottom: number; left: number; right: number; top: number }
): number {
  let n = 0;
  for (
    let y = Math.floor(dy(p, b.top));
    y < Math.ceil(dy(p, b.bottom));
    y += 1
  ) {
    for (
      let x = Math.floor(dx(p, b.left));
      x < Math.ceil(dx(p, b.right));
      x += 1
    ) {
      n += inkOver(p, q, x, y) > 24 ? 1 : 0;
    }
  }
  return n;
}

/**
 * Where two tops meet: each rim's own ink (shown alone against all hidden,
 * glow off) in a box round the seam's top, read against that rim's own
 * strongest there (a third of it; none under 60 of 765), as connected
 * pieces of 4 px or more. One piece is the shoulder meeting the top behind;
 * two is a stub or a notch.
 */
function corners(L: Layout, even: Raster, odd: Raster, unlit: Raster) {
  return L.tabs.slice(0, -1).flatMap((a, i) => {
    const b = L.tabs[i + 1] as Tab;
    const lo = Math.min(b.left, a.right);
    const hi = Math.max(b.left, a.right);
    if (!(lo - 12 > L.track.left + 1 && hi + 12 < L.track.right - 1)) {
      return [];
    }
    const top = Math.min(a.top, b.top);
    const x0 = Math.round(dx(unlit, lo - 5));
    const y0 = Math.round(dy(unlit, top - 4));
    const w = Math.round(dx(unlit, hi + 3)) - x0 + 1;
    const h = Math.round(dy(unlit, top + L.track.radius + 2)) - y0 + 1;
    const rimAlone = (k: number) => {
      const shown = k % 2 === 0 ? even : odd;
      const vs = new Float64Array(w * h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          vs[y * w + x] = inkOver(shown, unlit, x0 + x, y0 + y);
        }
      }
      const peak = Math.max(...vs);
      return { vs, floor: peak < 60 ? Number.POSITIVE_INFINITY : peak / 3 };
    };
    const l = rimAlone(i);
    const r = rimAlone(i + 1);
    const mask = Uint8Array.from(l.vs, (v, k) =>
      v >= l.floor || (r.vs[k] ?? 0) >= r.floor ? 1 : 0
    );
    const found = pieces(mask, w, h).filter((n) => n >= 4);
    return [{ between: `${i}|${i + 1}`, pieces: found.length }];
  });
}

/**
 * Each free foot's taper, read from its tip: a plain foot row by row up the
 * outline (off the plain feet alone and whole), a flared foot across the
 * stroke at each step round its quarter turn (each step the mean over the
 * device px of arc it stands for, so the grid's phase is not read as the
 * stroke) and then up the run; each sample at its distance along the stroke.
 */
function taperOf(
  L: Layout,
  lit: Raster,
  plainLit: Raster | null,
  unlit: Raster
) {
  const { scale } = lit;
  const inkAt = (shot: Raster, x: number, y: number) => {
    const fx = dx(shot, x) - 0.5;
    const fy = dy(shot, y) - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const u = fx - ix;
    const v = fy - iy;
    const c = (a: number, b: number) => inkOver(shot, unlit, a, b);
    return (
      c(ix, iy) * (1 - u) * (1 - v) +
      c(ix + 1, iy) * u * (1 - v) +
      c(ix, iy + 1) * (1 - u) * v +
      c(ix + 1, iy + 1) * u * v
    );
  };
  const DS = 0.25;
  const step = 1 / scale;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return L.tabs.flatMap((t, i) => {
    const { rim } = t;
    if (!rim || rim.opacity <= 0.01) {
      return [];
    }
    const shoulder = t.bottom - t.top - rim.radius;
    const R = rim.fn + rim.tn / 2;
    const A = (R * Math.PI) / 2;
    return rim.sides.flatMap((s) => {
      const { x0, inView } = sideAt(L, t, s);
      if (s.under || !inView || rim.opacity * s.op <= 0.01) {
        return [];
      }
      const dir = s.side === "start" ? 1 : -1;
      const { F } = rim;
      const top = Math.min(
        rim.taper + 8,
        (t.bottom - t.top - rim.radius) / Math.max(rim.lean, 0.1) - 1
      );
      const row = (shot: Raster, h: number) => {
        const y = t.bottom - h * rim.lean;
        let sum = 0;
        for (let k = -1.5; k <= rim.tn + 1.5; k += DS) {
          sum += inkAt(shot, x0 + dir * k, y) * DS;
        }
        return Math.round(sum);
      };
      const paths: {
        alone: boolean;
        name: string;
        full: number;
        samples: { s: number; ink: number }[];
      }[] = [];
      if (plainLit && s.plain > 0.01) {
        const samples: { s: number; ink: number }[] = [];
        for (let h = step / 2; h <= top; h += step) {
          samples.push({ s: r2(h), ink: row(plainLit, h) });
        }
        paths.push({
          alone: s.flared <= 0.01,
          name: "plain",
          full: Math.min(rim.taper, shoulder),
          samples,
        });
      }
      if (s.flared > 0.01) {
        const samples: { s: number; ink: number }[] = [];
        const cx = x0 - dir * F;
        const across = (phi: number) => {
          let sum = 0;
          for (let r = F - 1.5; r <= F + rim.tn + 1.5; r += DS) {
            sum +=
              inkAt(
                lit,
                cx + dir * r * Math.sin(phi),
                t.bottom - (F - r * Math.cos(phi)) * rim.lean
              ) * DS;
          }
          return sum;
        };
        for (let arc = step / 2; arc <= A; arc += step) {
          let sum = 0;
          for (let k = 0; k < 8; k += 1) {
            sum += across((arc - step / 2 + ((k + 0.5) * step) / 8) / R);
          }
          samples.push({ s: r2(arc), ink: Math.round(sum / 8) });
        }
        for (let h = F + step / 2; h <= top; h += step) {
          samples.push({ s: r2(A + h - F), ink: row(lit, h) });
        }
        paths.push({
          alone: s.plain <= 0.01,
          name: "flared",
          full:
            rim.taper <= A
              ? rim.taper
              : A + Math.min(rim.taper - A, shoulder - F),
          samples,
        });
      }
      return paths.map((p) => ({
        tab: i,
        side: s.side,
        path: p.name,
        strength: rim.opacity * s.op,
        samples: p.samples,
        full: p.full,
        faults: taperFaults(p.samples, p.full, p.alone, rim.taper),
      }));
    });
  });
}

/** The rims' ink with the glow off, shown and hidden: what a flared foot is read off between the full ink frames. */
async function litFrame(
  page: import("playwright-core").Page,
  strip: Strip,
  L: Layout
) {
  const clip = await clipOf(page, strip);
  const lit = await captureWith(page, clip, glowOff(strip));
  const unlit = await captureWith(page, clip, [
    ...glowOff(strip),
    ...hidden(`${strip.root} .rim`),
  ]);
  return taperOf(L, lit, null, unlit);
}

/**
 * How far a flared foot may fall back along it as the screen draws it, a
 * share of its whole: the taper rises from the tip and never falls, and the
 * reader's own grain upright is under 0.05. A leaning tab's foot fell 0.10
 * to 0.134 at 390 where the mask's two tiles met, before they became one
 * line (3a925746).
 */
const COMPOSITE_FALL = 0.07;

/**
 * composite: each of the switching tabs' flared feet as drawn (both feet at
 * their strengths, glow off), drawn strong enough to read (0.1 of a rim or
 * more: a rim at a tenth reads as noise), never falls back along it, up to
 * where its taper ends, by more than `COMPOSITE_FALL` of its whole.
 */
function compositeFaults(
  paths: ReturnType<typeof taperOf>,
  tabs: number[],
  pct: number
): string[] {
  return paths.flatMap((p) => {
    if (p.path !== "flared" || !tabs.includes(p.tab) || p.strength < 0.1) {
      return [];
    }
    const end = Math.min(p.full, p.samples.at(-1)?.s ?? p.full);
    const whole = Math.max(
      0,
      ...p.samples
        .filter((q) => q.s >= end - 1 && q.s <= p.full + 5)
        .map((q) => q.ink)
    );
    let most = 0;
    let fall = 0;
    let where = 0;
    for (const q of p.samples) {
      if (q.s > p.full) {
        break;
      }
      if (whole > 0 && (most - q.ink) / whole > fall) {
        fall = (most - q.ink) / whole;
        where = q.s;
      }
      most = Math.max(most, q.ink);
    }
    return fall > COMPOSITE_FALL
      ? [`${p.tab}${p.side[0]} ${pct}%: falls ${fall.toFixed(3)} at ${where}px`]
      : [];
  });
}

/**
 * One path down a foot from its tip: no ink at the tip, never falling back
 * by more than a tenth of the whole, 80% whole a px past where the taper
 * ends and, drawn alone, 90% whole within the first 40% of the taper.
 */
function taperFaults(
  samples: { ink: number; s: number }[],
  full: number,
  alone: boolean,
  taper: number
): string[] {
  const end = Math.min(full, samples.at(-1)?.s ?? full);
  const whole = Math.max(
    0,
    ...samples
      .filter((p) => p.s >= end - 1 && p.s <= full + 5)
      .map((p) => p.ink)
  );
  if (whole === 0) {
    return ["no ink"];
  }
  const out: string[] = [];
  const tip = samples[0]?.ink ?? 0;
  if (tip > whole * 0.1) {
    out.push(`tip ${Math.round((tip / whole) * 100)}%`);
  }
  let most = 0;
  for (const p of samples) {
    if (p.s > full) {
      break;
    }
    if (p.ink < most - whole * 0.1) {
      out.push(`falls at ${p.s}px`);
      break;
    }
    most = Math.max(most, p.ink);
  }
  const past = samples.find((p) => p.s >= full + 1);
  if (alone && past && past.ink < whole * 0.8) {
    out.push(`${Math.round((past.ink / whole) * 100)}% at ${past.s}px`);
  }
  const ninety = samples.find((p) => p.ink >= whole * 0.9)?.s;
  if (alone && (ninety === undefined || ninety > taper * 0.4)) {
    out.push(`90% at ${ninety ?? "-"}px > 40% of ${taper}`);
  }
  return out;
}

/**
 * Each seam's edge on the rimless strip: along the tab's mid-height, the
 * device px where the fill steps most across the overlap and 4px past it,
 * and the step's contrast (the fills 6px either side); none at 1.03:1 or
 * less (the fills look the same there). The glide puts it on the front
 * tab's side, its cut times the seam's tuck in.
 */
function sheetEdges(r: Raster, L: Layout) {
  const lum = (x: number, y: number) => {
    const [cr, cg, cb] = px(r, x, y);
    const lin = (v: number) => {
      const s = v / 255;
      return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(cr) + 0.7152 * lin(cg) + 0.0722 * lin(cb);
  };
  return L.tabs.slice(0, -1).map((a, i) => {
    const b = L.tabs[i + 1] as Tab;
    const predicted =
      a.z > b.z
        ? a.right - a.cutEnd * L.track.tuck
        : b.left + b.cutStart * L.track.tuck;
    const y = Math.round(dy(r, (a.top + a.bottom) / 2));
    const x0 = Math.floor(dx(r, Math.min(b.left, a.right) - 4));
    const x1 = Math.ceil(dx(r, Math.max(b.left, a.right) + 4));
    let best = { x: x0, step: 0 };
    for (let x = x0; x < x1; x += 1) {
      const s = Math.abs(lum(x + 1, y) - lum(x, y));
      if (s > best.step) {
        best = { x, step: s };
      }
    }
    const c = contrast(px(r, best.x - 6, y), px(r, best.x + 7, y));
    return {
      between: `${i}|${i + 1}`,
      predicted,
      at: c > 1.03 ? (best.x + 1) / r.scale + r.x : null,
    };
  });
}

/** The fills, the shelf, and where a fill is read: a tab's middle, clear of its ends and the track's fades. */
function fills(L: Layout, base: Raster) {
  const tr = L.track;
  const fillX = (t: Tab) =>
    Math.min(
      Math.max(
        (t.left + t.right) / 2,
        t.left + 16,
        tr.left + tr.fadeStart * 1.5
      ),
      t.right - 16,
      tr.right - tr.fadeEnd
    );
  return {
    fillX,
    fillOf: (t: Tab): Rgb => at(base, fillX(t), t.bottom - 3),
    shelfAt: (x: number): Rgb => at(base, x, tr.top - 8),
    inTrack: (x: number) => x > tr.left + 1 && x < tr.right - 1,
    fadedAt: (x: number) =>
      x < tr.left + tr.fadeStart * 1.5 + 3 || x > tr.right - tr.fadeEnd - 3,
  };
}

/**
 * Every shared edge, row by row down its side (under the shoulders to above
 * the foot): how many strokes each row crosses, and its widest core. A
 * stroke reaches 30% of the strongest run's contrast in its row (a glow's
 * tint past a stroke is not a second one).
 */
function seamRows(L: Layout, base: Raster) {
  const f = fills(L, base);
  const one = Math.max(3, Math.ceil(L.track.stroke * base.scale));
  return L.tabs.slice(0, -1).flatMap((a, i) => {
    const b = L.tabs[i + 1] as Tab;
    const lo = Math.min(b.left, a.right);
    const hi = Math.max(b.left, a.right);
    if (!(f.inTrack(lo - 2) && f.inTrack(hi + 2))) {
      return [];
    }
    const fa = f.fillOf(a);
    const fb = f.fillOf(b);
    const rows: [number, number, number][] = [];
    const y0 = Math.max(a.top, b.top) + L.track.radius + 3;
    const y1 = Math.min(a.bottom, b.bottom) - L.track.flare - 2;
    for (let y = y0; y <= y1; y += 1 / base.scale) {
      const all = strokes(base, lo - 2, hi + 2, y, fa, fb);
      const best = Math.max(1, ...all.map((s) => s.peak));
      const kept = all.filter((s) => s.peak >= 1 + (best - 1) * 0.3);
      rows.push([
        Math.min(a.bottom, b.bottom) - y,
        kept.reduce((n, s) => n + s.peaks, 0),
        Math.max(0, ...kept.map((s) => s.core)),
      ]);
    }
    return [{ i, front: a.z > b.z ? i : i + 1, rows, one }];
  });
}

/** A side's strength at a seam: the front tab's side facing it (its end when it is the left one). */
const seamStrength = (L: Layout, front: number, i: number) => {
  const t = L.tabs[front] as Tab;
  const side = t.rim?.sides[front === i ? 1 : 0];
  return (t.rim?.opacity ?? 0) * (side?.op ?? 0);
};
/** What a row should cross by that strength: one stroke at 0.3 or more, none at none, one or none between, never two. */
const wantOf = (s: number): "none" | "one" | "one or none" => {
  if (s <= 0.01) {
    return "none";
  }
  return s >= 0.3 ? "one" : "one or none";
};

interface Frame {
  at: string;
  ink: Awaited<ReturnType<typeof inkFrame>> | null;
  kept: number[];
  L: Layout;
}

/** Every rule's faults in one frame read at rest or on the switch. */
function frameFaults(strip: Strip, f: Frame): Record<string, string[]> {
  const { L } = f;
  const rest = ["rest", "rest2", "100%"].includes(f.at);
  const out: Record<string, string[]> = { fades: [], titles: [] };
  // fades: each tab drawn chosen clear of both edge fades as drawn (each
  // cut at its cap; the phone's start fade 1.5 of its length), but the
  // one a switch leaves where the two are wider together than the track.
  const tr = L.track;
  const span =
    Math.max(...f.kept.map((k) => (L.tabs[k] as Tab).right)) -
    Math.min(...f.kept.map((k) => (L.tabs[k] as Tab).left));
  const tight = f.kept.length > 1 && span > tr.right - tr.left + 0.5;
  const fadeIn = Math.min(tr.fadeStart * (L.phone ? 1.5 : 1), tr.capStart);
  const fadeOut = Math.min(tr.fadeEnd, tr.capEnd);
  f.kept.forEach((k, nth) => {
    const t = L.tabs[k] as Tab;
    const clear =
      t.left >= tr.left + fadeIn - 0.5 && t.right <= tr.right - fadeOut + 0.5;
    if (!(clear || (tight && nth === 0))) {
      out.fades.push(
        `${k} ${(tr.left + fadeIn - t.left).toFixed(1)}/${(t.right - (tr.right - fadeOut)).toFixed(1)}`
      );
    }
  });
  out.titles = L.tabs.flatMap((t, i) =>
    t.labelScroll > t.labelClient
      ? [`${i} ${t.labelScroll}>${t.labelClient}`]
      : []
  );
  if (!strip.rim) {
    return out;
  }
  // idle none: an unchosen idle tab (not drawn chosen) wears no rim.
  out["idle none"] = L.tabs.flatMap((t, i) =>
    t.tone === "quiet" && !f.kept.includes(i) && (t.rim?.opacity ?? 0) > 0.001
      ? [`${i} rim ${t.rim?.opacity}`]
      : []
  );
  // subtle: at rest, every unchosen tab that is not idle at the token, under the chosen, drawn.
  const chosen = L.tabs.find((t) => t.chosen);
  out.subtle = rest
    ? L.tabs.flatMap((t, i) => {
        const o = t.rim?.opacity ?? 0;
        if (t.chosen || t.tone === "quiet") {
          return [];
        }
        return Math.abs(o - L.subtle) > 0.01 ||
          o >= (chosen?.rim?.opacity ?? 1) ||
          o <= 0
          ? [`${i}${t.tone[0]} op${o}`]
          : [];
      })
    : [];
  const { ink } = f;
  if (!(ink && "base" in ink && ink.base)) {
    return out;
  }
  // one stroke: every row down a seam crosses the strokes its front side's
  // strength calls for (faded by the taper low on it), no wider than one;
  // and of its two sides only the front's draws (none where it wears none).
  const rimOf = (k: number) => (L.tabs[k] as Tab).rim;
  out["one stroke"] = [
    ...seamRows(L, ink.base).flatMap((s) => {
      const rim = rimOf(s.front);
      const fadeEnd = rim
        ? Math.min(
            rim.taper,
            (L.tabs[s.front] as Tab).bottom -
              (L.tabs[s.front] as Tab).top -
              rim.radius
          )
        : 0;
      const off = s.rows.filter(([h, n, core]) => {
        const fade =
          rim && fadeEnd > 0 && h < fadeEnd
            ? 1 - (1 - Math.min(1, h / rim.taper)) ** rim.ease
            : 1;
        const want = wantOf(seamStrength(L, s.front, s.i) * fade);
        if (want === "one") {
          return n !== 1 || core > s.one;
        }
        return want === "none" ? n !== 0 : n > 1 || core > s.one;
      }).length;
      return off > 0 ? [`${s.i}|${s.i + 1} ${off}/${s.rows.length} rows`] : [];
    }),
    ...ink.sides.flatMap((s) => {
      const want = wantOf(seamStrength(L, s.front, s.i));
      const ok =
        s.behindPx === 0 &&
        (want === "one or none" || (want === "one") === s.frontPx > 0);
      return ok
        ? []
        : [
            `${s.i}|${s.i + 1} sides front ${s.frontPx}px behind ${s.behindPx}px`,
          ];
    }),
  ];
  out.corner = ink.corners.flatMap((c) =>
    c.pieces <= 1 ? [] : [`${c.between} ${c.pieces} pieces`]
  );
  out.taper = ink.taper.flatMap((p) =>
    p.faults.length === 0
      ? []
      : [`${p.tab}${p.side[0]} ${p.path} ${p.faults.join(",")}`]
  );
  // 3:1 at rest: the chosen rim's top against the shelf, and each side it
  // stands in front of (in view, out of the fades) against the fills.
  out["3:1"] = [];
  if (rest) {
    const fl = fills(L, ink.base);
    L.tabs.forEach((t, i) => {
      const vis =
        Math.max(0, Math.min(t.right, tr.right) - Math.max(t.left, tr.left)) /
        (t.right - t.left);
      if (!t.chosen || vis <= 0.5) {
        return;
      }
      const mid = (t.left + t.right) / 2;
      const shelf = fl.shelfAt(mid);
      const below = at(ink.base, mid, t.top + 7);
      let peak = 0;
      let vsShelf = 0;
      for (let y = t.top - 4; y <= t.top + 5; y += 1 / ink.base.scale) {
        const c = at(ink.base, mid, y);
        const d = Math.min(contrast(c, shelf), contrast(c, below));
        if (d > peak) {
          peak = d;
          vsShelf = contrast(c, shelf);
        }
      }
      if (vsShelf < 3) {
        out["3:1"].push(`${i} top ${vsShelf.toFixed(2)}:1`);
      }
      for (const j of [i - 1, i]) {
        const a = L.tabs[j];
        const b = L.tabs[j + 1];
        if (!(a && b) || (a.z > b.z ? j : j + 1) !== i) {
          continue;
        }
        const lo = Math.min(b.left, a.right);
        const hi = Math.max(b.left, a.right);
        const xa = fl.fillX(a);
        const xb = fl.fillX(b);
        const inView =
          fl.inTrack(lo) &&
          fl.inTrack(hi) &&
          fl.inTrack(xa) &&
          fl.inTrack(xb) &&
          xa <= lo - 7 &&
          xb >= hi + 7;
        if (!inView || fl.fadedAt(lo) || fl.fadedAt(hi)) {
          continue;
        }
        const y = Math.min((a.top + a.bottom) / 2, (b.top + b.bottom) / 2);
        const c = Math.max(
          0,
          ...strokes(
            ink.base,
            lo - 2,
            hi + 2,
            y,
            fl.fillOf(a),
            fl.fillOf(b)
          ).map((s) => Math.min(s.vsA, s.vsB))
        );
        if (c < 3) {
          out["3:1"].push(`side ${j}|${j + 1} ${c.toFixed(2)}:1`);
        }
      }
    });
  }
  return out;
}

/** The engine's rules across a switch's frames (the strip with a rim). */
function switchFaults(series: { pct: number; L: Layout }[], from: number) {
  const out: Record<string, string[]> = { feet: [], handover: [] };
  // feet: each switching tab's flared foot in front and in view at its sheet's opacity.
  const read = new Set<number>();
  for (const { pct, L } of series) {
    for (const i of [from, from + 1]) {
      const t = L.tabs[i] as Tab;
      for (const s of t.rim?.sides ?? []) {
        if (s.under || !sideAt(L, t, s).inView) {
          continue;
        }
        read.add(i);
        if (Math.abs(s.flared - t.sheet) > FOOT_TOLERANCE) {
          out.feet.push(
            `${i}${s.side[0]} ${pct}%: foot ${s.flared.toFixed(3)} sheet ${t.sheet.toFixed(3)}`
          );
        }
      }
    }
  }
  for (const i of [from, from + 1]) {
    if (!read.has(i)) {
      out.feet.push(`tab ${i} no foot read`);
    }
  }
  // handover: from 49% to 51%, no rim jumps, and a seam whose front changes holds its stroke.
  const before = series.find((f) => f.pct === 49)?.L;
  const after = series.find((f) => f.pct === 51)?.L;
  if (before && after) {
    before.tabs.forEach((t, i) => {
      const later = after.tabs[i] as Tab;
      if (Math.abs((later.rim?.opacity ?? 0) - (t.rim?.opacity ?? 0)) > 0.08) {
        out.handover.push(`${i} rim ${t.rim?.opacity} → ${later.rim?.opacity}`);
      }
    });
    const frontOf = (L: Layout, i: number) =>
      (L.tabs[i] as Tab).z > (L.tabs[i + 1] as Tab).z ? i : i + 1;
    for (let i = 0; i < before.tabs.length - 1; i += 1) {
      const a = frontOf(before, i);
      const b = frontOf(after, i);
      if (a === b) {
        continue;
      }
      const s0 = seamStrength(before, a, i);
      const s1 = seamStrength(after, b, i);
      if (Math.max(s0, s1) / Math.max(0.001, Math.min(s0, s1)) > 1.15) {
        out.handover.push(
          `${i}|${i + 1} stroke ${s0.toFixed(3)} → ${s1.toFixed(3)}`
        );
      }
    }
  }
  return out;
}

/** A jump's faults: it passes a rimless tab, and the two tops stay at or over their lower rest, one way. */
function jumpFaults(series: { pct: number; L: Layout }[], from: number) {
  const out: string[] = [];
  const past = series[0]?.L.tabs[from + 1];
  if (!(past?.tone === "quiet" && (past.rim?.top ?? 1) <= 0.001)) {
    out.push(
      `passes tab ${from + 1} (${past?.tone} at ${past?.rim?.top}), not a rimless one`
    );
  }
  for (const [name, i] of [
    ["outgoing", from],
    ["incoming", from + 2],
  ] as const) {
    const tops = series.map((f) => f.L.tabs[i]?.rim?.top ?? Number.NaN);
    const first = tops[0] as number;
    const last = tops.at(-1) as number;
    const floor = Math.min(first, last);
    const way = Math.sign(last - first);
    tops.forEach((s, k) => {
      if (!(s >= floor - 0.001)) {
        out.push(`${name} ${i} ${s} < ${floor} at ${series[k]?.pct}%`);
      }
      if (k > 0 && (s - (tops[k - 1] as number)) * way < -0.001) {
        out.push(`${name} ${i} back ${tops[k - 1]}→${s} at ${series[k]?.pct}%`);
      }
    });
  }
  return out;
}

async function readStrip(
  kit: Kit,
  view: View,
  theme: (typeof THEMES)[number],
  s: Strip
) {
  const page = await kit.page(view, { theme });
  const base = await kit.bench();
  const openAt = async (index: number, work: string) => {
    await open(
      page,
      `${base}/motion/folder-proof?theme=${theme}&at=${index}&work=${work}`,
      () => "__ft" in window,
      120_000
    );
    await page.waitForFunction(
      (st) =>
        document.querySelectorAll(`${st.root} ${st.tab}`).length === st.count,
      s,
      { timeout: 60_000 }
    );
    await settle(page, 300);
  };
  const layout = () => page.evaluate(layoutOf, { root: s.root, tab: s.tab });
  const api = s.api === "work" ? "window.__ft.work" : "window.__ft";
  const where = `${s.api} ${view} ${theme}`;
  const faults: Record<string, string[]> = {};
  const add = (when: string, found: Record<string, string[]>) => {
    for (const [name, list] of Object.entries(found)) {
      faults[name] = [
        ...(faults[name] ?? []),
        ...list.map((one) => `${when}: ${one}`),
      ];
    }
  };
  const glide: (number | null)[][] = [];

  // At rest, then the switch from the chosen tab to its next.
  await openAt(1, "working");
  const ids = (await page.evaluate(`${api}.ids`)) as string[];
  const chosen = (await page.evaluate(`${api}.chosen()`)) as string | null;
  const from = ids.indexOf(chosen ?? (ids[0] as string));
  const restL = await layout();
  const restInk = await inkFrame(page, s, restL);
  add(
    "rest",
    frameFaults(s, { at: "rest", L: restL, kept: [from], ink: restInk })
  );
  if ("sheet" in restInk && restInk.sheet) {
    glide.push(restInk.sheet.map((e) => e.at));
  }
  const clock = await Clock.on(page);
  const within = s.api === "work" ? `${s.root} .ff-tabs-list` : s.root;
  await clock.catchRuns(
    () => page.evaluate(`${api}.choose(${JSON.stringify(ids[from + 1])})`),
    within
  );
  // Everything moving in the strip as the switch starts: sheets, cards,
  // titles, rims, their lean and their glow (`.rim`'s filter).
  const clockOf = clock.oneClock();
  kit.check(
    `${where}: everything in the strip moves on the switch's one clock, the rims' glow with it`,
    clockOf.faults.length === 0,
    `${clockOf.runs} runs from ${clockOf.start ?? "no start"}${clockOf.faults.length ? `; ${clockOf.faults.slice(0, 3).join("; ")}` : ""}`
  );
  const series: { pct: number; L: Layout }[] = [];
  for (const pct of PCTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame of the switch at a time
    await clock.seek(pct / 100);
    const L = await layout();
    series.push({ pct, L });
    if (s.rim && !INK_PCTS.includes(pct)) {
      add(`${pct}%`, {
        composite: compositeFaults(
          await litFrame(page, s, L),
          [from, from + 1],
          pct
        ),
      });
    }
    if (INK_PCTS.includes(pct)) {
      const ink = await inkFrame(page, s, L);
      if ("taper" in ink && ink.taper) {
        add(`${pct}%`, {
          composite: compositeFaults(ink.taper, [from, from + 1], pct),
        });
      }
      add(
        `${pct}%`,
        frameFaults(s, {
          at: `${pct}%`,
          L,
          kept: pct < 100 ? [from, from + 1] : [from + 1],
          ink,
        })
      );
      if ("sheet" in ink && ink.sheet) {
        glide.push(ink.sheet.map((e) => e.at));
        add(`${pct}%`, {
          "sheet edge": ink.sheet.flatMap((e) =>
            e.at !== null && Math.abs(e.at - e.predicted) > 1
              ? [
                  `${e.between} at ${e.at.toFixed(2)}, glide ${e.predicted.toFixed(2)}`,
                ]
              : []
          ),
        });
      }
    }
  }
  await clock.release();
  if (s.rim) {
    add("switch", switchFaults(series, from));
    // The jump past the rimless idle tab: second to fourth.
    await openAt(1, "working");
    const jumpClock = await Clock.on(page);
    await jumpClock.catchRuns(
      () => page.evaluate(`${api}.choose(${JSON.stringify(ids[from + 2])})`),
      within
    );
    const jump: { pct: number; L: Layout }[] = [];
    for (let pct = 0; pct <= 100; pct += 5) {
      // biome-ignore lint/performance/noAwaitInLoops: one frame of the jump at a time
      await jumpClock.seek(pct / 100);
      jump.push({ pct, L: await layout() });
    }
    await jumpClock.release();
    add("jump", { jump: jumpFaults(jump, from) });
  } else {
    // The rimless strip's edges move one way across the switch, never back.
    const moves: string[] = [];
    (glide[0] ?? []).forEach((_, k) => {
      const shown = glide.flatMap((g) =>
        g[k] === null || g[k] === undefined ? [] : [g[k] as number]
      );
      const way = Math.sign((shown.at(-1) ?? 0) - (shown[0] ?? 0));
      for (let j = 1; j < shown.length; j += 1) {
        if (((shown[j] as number) - (shown[j - 1] as number)) * way < -0.5) {
          moves.push(
            `${k}|${k + 1} back ${shown[j - 1]?.toFixed(2)}→${shown[j]?.toFixed(2)}`
          );
        }
      }
    });
    add("glide", { "sheet edge": moves });
  }
  // At its start: the session strip's first tab chosen; the home's Finished.
  await openAt(0, "finished");
  const firstL = await layout();
  const firstInk = await inkFrame(page, s, firstL);
  add(
    "rest2",
    frameFaults(s, {
      at: "rest2",
      L: firstL,
      kept: [s.api === "work" ? 1 : 0],
      ink: firstInk,
    })
  );
  if ("sheet" in firstInk && firstInk.sheet) {
    add("rest2", {
      "sheet edge": firstInk.sheet.flatMap((e) =>
        e.at !== null && Math.abs(e.at - e.predicted) > 1
          ? [
              `${e.between} at ${e.at.toFixed(2)}, glide ${e.predicted.toFixed(2)}`,
            ]
          : []
      ),
    });
  }
  if ("sheet" in restInk && restInk.sheet) {
    add("rest", {
      "sheet edge": restInk.sheet.flatMap((e) =>
        e.at !== null && Math.abs(e.at - e.predicted) > 1
          ? [
              `${e.between} at ${e.at.toFixed(2)}, glide ${e.predicted.toFixed(2)}`,
            ]
          : []
      ),
    });
  }
  const rules = s.rim
    ? [
        "one stroke",
        "corner",
        "3:1",
        "idle none",
        "subtle",
        "taper",
        "handover",
        "jump",
        "feet",
        "composite",
        "fades",
        "titles",
      ]
    : ["sheet edge", "fades", "titles"];
  for (const name of rules) {
    const list = faults[name] ?? [];
    kit.check(
      `${where}: ${name}`,
      list.length === 0,
      list.slice(0, 6).join("; ") || undefined
    );
  }
  await page.close();
}

const spec: Spec = {
  name: "folder-tabs",
  run: async (kit) => {
    for (const view of VIEWS_READ) {
      for (const theme of THEMES) {
        for (const s of STRIPS) {
          // biome-ignore lint/performance/noAwaitInLoops: one strip, width and theme at a time
          await readStrip(kit, view, theme, s);
        }
      }
    }
  },
};
export default spec;
