/**
 * Both folder strips on the bench (/motion/folder-proof, no hub): the real
 * PaneTabs (six tabs: needs you, working, idle, done, failed, idle) and the
 * real WorkTabs (Working and Finished), on the desk and the phone, light and
 * dark. Each tab is one SVG path, its sheet filled and its rim stroked
 * inside it (TabItem, fold-path.ts); a switch is a come-forward (TabsList).
 * The session strip switches from its second tab to its third and jumps
 * from its second to its fourth, past the rimless idle third; the home's
 * from Working to Finished. Each switch is caught on the clock (anim.ts) and
 * read at every 5% and either side of the stack's flip.
 *
 * Engine (every frame read), from the DOM and computed values:
 *  - shape: each tab's path is its box's outline drawn at scale 1 (its view
 *    box the box one flare wider each side, the svg drawn at that size one
 *    flare out), written in one command structure (M C C A L A C C) in
 *    every pose, at rest every free foot the flare's quarter turn, a
 *    folded one straight down, both shoulders at the radius, no bow, no
 *    rise;
 *  - folds: a side is folded exactly where a tab ranked above covers its
 *    foot as the two are drawn now (or the host stands it flush);
 *  - stack: at rest the chosen tab on top, each tab above those farther;
 *  - come-forward (owner: "u know in folder tabs when u pull one forward and
 *    it bends the others before it snaps forward and releases the
 *    pressure"): one run on the track (`tab-come-forward`) with the tabs'
 *    --pick on its start and length, all on --choose-ease; no run in the
 *    strip on a box's size or place, every tab's layout box as at rest, and
 *    across the run every tab's box and the strip's scroll the same at
 *    every frame (no layout shift); the press to the flip at 45%
 *    (`--tab-snap-at`, read at 20% and 40%; owner: "it doesn't seem or
 *    look like the tab is pushing physically form back to front"): the tab
 *    being chosen a rigid card still under each neighbour ranked above it,
 *    lifted whole and lifting, its path as it stood (0.5px), each such
 *    neighbour's side over it bent away from it and bending, past 2px at
 *    the most, every other path as at rest; the chosen tab's sides as they
 *    stood at every frame; at 46% the stack flipped, the chosen tab on top
 *    and its feet spreading; after it the chosen tab's foot going past the
 *    flare and a bent side springing past straight before both settle, the
 *    chosen tab back on the shelf by 100%, the neighbours at rest (0.5px);
 *    at 0% every path as it stood and at 100% as it stands landed; every
 *    tab drawn chosen whole, its feet as drawn, at every frame;
 *  - interruption: a switch caught mid-way by another starts from the paths
 *    as drawn (within 0.05px);
 *  - less motion, and the keyboard (ArrowRight on the chosen tab, Enter on
 *    the next): the choice instant, no run, the stack and paths landed;
 *  - scroll: a choice that scrolls the strip to show its tab (the phone's)
 *    rides the motion, at 0% where it stood, one way only, landed at 100%;
 *  - rims (the session strip): at rest the chosen tab's at its tone's full
 *    strength (tab-rim-mix-chosen; tab-rim-mix-idle idle or done), an
 *    unchosen one's at tab-rim-mix-subtle, an unchosen idle one's at none;
 *    on a switch each moves one way from rest to rest and by 0.08 at most
 *    across the flip; a jump passes a tab wearing none;
 *  - taper: each tab's gradient is no ink on the shelf, rises and never
 *    falls, 90% whole by 40% of the taper along a flared foot and whole by
 *    the shoulder;
 *  - fades (on a strip that runs past an end, each tab drawn chosen clear
 *    of the edge fades, but the one a switch leaves where the two are wider
 *    than the track), whole (each tab drawn chosen, its feet too, cut off by
 *    nothing: the track while it clips or masks, nor any box round it) and
 *    titles (none cut), at rest and landed; on the way, the two tabs a
 *    switch draws chosen taken by an edge no more than at one end of the
 *    ride or the other (the scroll carries them between).
 * Ink, at rest (what drawing alone decides): one stroke down every shared
 * edge, its front tab's, none where that tab wears no rim (the rims read
 * with each tab's cast edge, `.shade`, taken away); one piece where
 * two tops meet; the chosen rim at 3:1 against the shelf and the fills
 * either side of it; on the rimless strip, each seam's edge on its front
 * tab's side.
 *
 * The seam where a card or menu hangs from its tab is the hang spec's
 * (one silhouette: specs/web/hang.ts, probe-kit/joint.ts).
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each rule is read case by case, as the drawing has them.
import type { Page } from "playwright-core";
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
  frames,
  type Kit,
  open,
  type Spec,
  settle,
  THEMES,
  type View,
} from "../../kit";

const VIEWS_READ: View[] = ["desk", "phone"];
/** Where the stack flips, of the clock's progress (TabsList `FLIP`). */
const FLIP = 0.5;
/** Just before the flip, and just after it. */
const PRE = 0.49;
const POST = 0.51;
/** The frames a switch is read at: every 5% and either side of the flip. */
const FRACTIONS = [
  ...Array.from({ length: 21 }, (_, k) => k / 20),
  PRE,
  POST,
].sort((a, b) => a - b);
/** Room round the strip in every capture, css px. */
const ROOM = 24;
/** How far a strength may move across the stack's flip (PRE to POST). */
const SWAP_STEP = 0.08;
/** The come-forward's clock (TabsList `FORWARD`). */
const FORWARD = "tab-come-forward";
/**
 * What a run in the strip may never drive: a box's size or place. (A
 * composited move of a tab is caught by its box as drawn, `boxes`.)
 */
const LAYOUT =
  /^(width|height|min-|max-|inset|top|left|right|bottom|margin|padding|flex|gap|grid|font|letter-spacing|line-height|border-width|scroll)/;

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
  const els = [...document.querySelectorAll<HTMLElement>(`${root} ${tab}`)];
  const first = getComputedStyle(els[0] as HTMLElement);
  // What cuts the strip off: the track while it clips or masks, and every
  // box round it that does, up to a fixed box (the bench's), which no box
  // round it clips.
  const cuts = (s: CSSStyleDeclaration) =>
    s.overflowX !== "visible" || s.maskImage !== "none";
  let hostLeft = Number.NEGATIVE_INFINITY;
  let hostRight = Number.POSITIVE_INFINITY;
  let host = "";
  for (
    let up = track.parentElement;
    up && up !== document.body;
    up = up.parentElement
  ) {
    const style = getComputedStyle(up);
    if (cuts(style)) {
      const box = up.getBoundingClientRect();
      if (box.left > hostLeft || box.right < hostRight) {
        host += `${up.tagName.toLowerCase()}.${[...up.classList].join(".")} ${style.overflowX}${style.maskImage === "none" ? "" : " masked"} ${box.left.toFixed(0)}–${box.right.toFixed(0)}; `;
      }
      hostLeft = Math.max(hostLeft, box.left);
      hostRight = Math.min(hostRight, box.right);
    }
    if (style.position === "fixed") {
      break;
    }
  }
  const tabs = els.map((el) => {
    const ff = (
      el.matches(".ff-tab") ? el : el.querySelector(".ff-tab")
    ) as HTMLElement;
    const box = ff.getBoundingClientRect();
    const fs = getComputedStyle(ff);
    const es = getComputedStyle(el);
    const svg = ff.querySelector("svg.fold");
    const drawn = svg?.getBoundingClientRect();
    const rim = svg?.querySelector(".rim");
    const text = el.querySelector(".label .text") as HTMLElement;
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: ff.offsetWidth,
      height: ff.offsetHeight,
      // Its layout box, as the track lays it out: no transform in it.
      laid: `${laid(el).offsetLeft}+${laid(el).offsetWidth} ${ff.offsetLeft}+${ff.offsetWidth}`,
      // Any transform on it or its box as laid out (none: a switch moves no tab).
      turned: [fs.translate, fs.transform, es.translate, es.transform]
        .concat(
          laid(el) === el
            ? []
            : [
                getComputedStyle(laid(el)).translate,
                getComputedStyle(laid(el)).transform,
              ]
        )
        .filter((v) => v !== "none")
        .join(" "),
      slopeStart: num(fs, "--slope-start"),
      slopeEnd: num(fs, "--slope-end"),
      tone: el.dataset.tone ?? "",
      chosen:
        el.hasAttribute("data-chosen") || el.classList.contains("selected"),
      z: Number(getComputedStyle(laid(el)).zIndex),
      flush: ff.dataset.flush ?? "",
      flare: num(fs, "--flare"),
      radius: num(fs, "--radius"),
      viewBox: svg?.getAttribute("viewBox") ?? "",
      svg: drawn
        ? { left: drawn.left, width: drawn.width, height: drawn.height }
        : null,
      d: svg?.querySelector("defs path")?.getAttribute("d") ?? "",
      stops: [...(svg?.querySelectorAll("linearGradient stop") ?? [])].map(
        (stop) => ({
          offset: Number(stop.getAttribute("offset")),
          ink: Number(stop.getAttribute("stop-opacity")),
        })
      ),
      rim: rim ? Number(getComputedStyle(rim).opacity) : 0,
      rimFull: num(es, "--rim-full"),
      label: text.textContent ?? "",
      labelScroll: text.scrollWidth,
      labelClient: text.clientWidth,
    };
  });
  return {
    track: {
      left: tr.left,
      right: tr.right,
      top: tr.top,
      bottom: tr.bottom,
      scroll: track.scrollLeft,
      scrollWidth: track.scrollWidth,
      overflows: track.scrollWidth > track.clientWidth + 0.5,
      masked: ts.maskImage !== "none",
      cuts: cuts(ts),
      hostLeft,
      hostRight,
      host,
      fadeStart: num(ts, "--fade-start"),
      fadeEnd: num(ts, "--fade-end"),
      capStart: cap("--fade-cap-start"),
      capEnd: cap("--fade-cap-end"),
      radius: num(ts, "--radius"),
      flare: num(ts, "--flare"),
      overlap: num(ts, "--overlap"),
      clearance:
        num(ts, "--overlap") + num(ts, "--flare") + num(ts, "--space-1"),
      stroke: num(first, "--rim-w") || 1,
      taper: num(first, "--tab-rim-taper"),
      ease: num(first, "--tab-rim-taper-ease"),
      subtle: num(first, "--tab-rim-mix-subtle"),
      chosenMix: num(first, "--tab-rim-mix-chosen"),
      idleMix: num(first, "--tab-rim-mix-idle"),
    },
    tabs,
    width: innerWidth,
    phone: innerWidth <= 899,
  };
}
type Layout = ReturnType<typeof layoutOf>;
type Tab = Layout["tabs"][number];

const near = (a: number, b: number, by = 0.5) => Math.abs(a - b) <= by;
const r2 = (n: number) => String(Math.round(n * 100) / 100);
/** The one command structure every pose of a tab's path is written in (fold-path.ts). */
const STRUCTURE = "MCLALALC";
const COMMAND = /([A-Z])([^A-Z]*)/g;
const SPACES = /\s+/;
/** A path's commands, each with its numbers. */
const commandsOf = (d: string) =>
  [...d.matchAll(COMMAND)].map((m) => ({
    c: m[1] as string,
    n: (m[2] ?? "").trim().split(SPACES).filter(Boolean).map(Number),
  }));

/**
 * The pose a path is drawn in, read back from its points: each side's foot
 * (where its run meets the foot, x in the path's box), its tuck (that foot
 * in from the tab's edge, px), its spread (the tip's way out past the
 * foot, of the flare), and the command structure.
 */
function poseOf(t: Tab) {
  const cs = commandsOf(t.d);
  const { width: w, flare: f } = t;
  const n = (k: number, i: number) => cs[k]?.n[i] ?? Number.NaN;
  const feet: [number, number] = [n(1, 4), n(6, 0)];
  return {
    structure: cs.map((x) => x.c).join(""),
    feet,
    tips: [n(0, 0), n(7, 4)] as [number, number],
    tuck: [feet[0] - f, f + w - feet[1]] as [number, number],
    spread: [(feet[0] - n(0, 0)) / f, (n(7, 4) - feet[1]) / f] as [
      number,
      number,
    ],
  };
}

/** Whether a path's start side is folded (its foot straight down), and its end: at rest, 0 or 1. */
const foldsOf = (t: Tab): [boolean, boolean] => {
  const { spread } = poseOf(t);
  return [spread[0] < 0.5, spread[1] < 0.5];
};

/**
 * shape: the path is the box's outline at scale 1 in the one command
 * structure, a free foot the flare's quarter turn to the shelf one flare
 * out (its handles 0.5523 of the flare along each tangent), a folded one
 * straight down the box's edge, both sides straight, both shoulders at the
 * radius, its top on the box's.
 */
function shapeFaults(t: Tab): string[] {
  const out: string[] = [];
  const { width: w, height: h, flare: f, radius: r } = t;
  const [vx, vy, vw, vh] = t.viewBox.split(" ").map(Number);
  if (!(vx === 0 && vy === 0 && near(vw ?? 0, w + 2 * f) && near(vh ?? 0, h))) {
    out.push(`view box ${t.viewBox}, not 0 0 ${w + 2 * f} ${h}`);
  }
  if (!(
    t.svg &&
    near(t.svg.width, vw ?? 0) &&
    near(t.svg.height, vh ?? 0) &&
    near(t.svg.left, t.left - f)
  )) {
    out.push(
      `drawn ${t.svg ? `${t.svg.width.toFixed(1)}×${t.svg.height.toFixed(1)} at ${(t.svg.left - t.left).toFixed(1)}` : "nothing"}, not its view box one flare out`
    );
  }
  const pose = poseOf(t);
  if (pose.structure !== STRUCTURE) {
    out.push(`commands ${pose.structure}, not ${STRUCTURE}`);
  }
  const q = 0.5523 * f;
  const [foldStart, foldEnd] = foldsOf(t);
  const start = foldStart
    ? `M ${r2(f)} ${r2(h)} C ${r2(f)} ${r2(h)} ${r2(f)} ${r2(h - f)} ${r2(f)} ${r2(h - f)}`
    : `M 0 ${r2(h)} C ${r2(q)} ${r2(h)} ${r2(f)} ${r2(h - f + q)} ${r2(f)} ${r2(h - f)}`;
  const end = foldEnd
    ? `C ${r2(f + w)} ${r2(h - f)} ${r2(f + w)} ${r2(h)} ${r2(f + w)} ${r2(h)}`
    : `C ${r2(f + w)} ${r2(h - f + q)} ${r2(2 * f + w - q)} ${r2(h)} ${r2(2 * f + w)} ${r2(h)}`;
  if (!t.d.startsWith(start)) {
    out.push(`start ${t.d.slice(0, 60)}, not ${start}`);
  }
  if (!t.d.endsWith(end)) {
    out.push(`end …${t.d.slice(-60)}, not ${end}`);
  }
  if (!(near(pose.tuck[0], 0, 0.01) && near(pose.tuck[1], 0, 0.01))) {
    out.push(`sides tucked ${pose.tuck.map((b) => b.toFixed(2)).join("/")}`);
  }
  if (t.turned) {
    out.push(`transformed ${t.turned}`);
  }
  const shoulders = t.d.match(/A (\S+) \S+ 0 0 1/g) ?? [];
  if (
    shoulders.length !== 2 ||
    shoulders.some((a) => a !== `A ${r2(r)} ${r2(r)} 0 0 1`)
  ) {
    out.push(`shoulders ${shoulders.join(", ")}, not two of radius ${r}`);
  }
  return out;
}

/** folds: each side folded exactly where a tab above covers its foot as drawn, or flush. */
function foldFaults(L: Layout): string[] {
  return L.tabs.flatMap((t, i) => {
    const over = L.tabs.filter((u) => u.z > t.z);
    const want: [boolean, boolean] = [
      t.flush === "start" ||
        over.some((u) => u.left <= t.left + 0.5 && u.right >= t.left - 0.5),
      t.flush === "end" ||
        over.some((u) => u.right >= t.right - 0.5 && u.left <= t.right + 0.5),
    ];
    const has = foldsOf(t);
    return (["start", "end"] as const).flatMap((side, k) =>
      has[k] === want[k]
        ? []
        : [
            `${i} ${side} ${has[k] ? "folded" : "flared"}, ${want[k] ? "covered" : "uncovered"}`,
          ]
    );
  });
}

/**
 * taper: the gradient up from the shelf, read along a flared foot (its
 * stroke's middle round the flare, then up the run): no ink on the shelf,
 * never falling, 90% whole from 40% of the taper on, whole by the shoulder.
 */
function taperFaults(L: Layout, t: Tab): string[] {
  const { stroke, taper } = L.track;
  const f = t.flare;
  const h = t.height;
  const mid = f + stroke / 2;
  const along = (y: number) =>
    y <= f
      ? mid * Math.acos(Math.max(-1, 1 - y / f))
      : (mid * Math.PI) / 2 + (y - f);
  const out: string[] = [];
  const [tip] = t.stops;
  if (tip?.offset !== 0 || tip.ink > 0.001) {
    out.push(`on the shelf ${tip ? `${tip.ink} at ${tip.offset}` : "no stop"}`);
  }
  t.stops.forEach((s, k) => {
    const y = s.offset * h;
    if (k > 0 && s.ink < (t.stops[k - 1]?.ink ?? 0) - 0.001) {
      out.push(`falls at ${y.toFixed(2)}px`);
    }
    if (taper > 0 && along(y) >= taper * 0.4 && s.ink < 0.9 - 0.001) {
      out.push(
        `${s.ink} at ${along(y).toFixed(1)}px along, 90% due by ${(taper * 0.4).toFixed(1)}`
      );
    }
    if (y >= h - t.radius - 0.01 && s.ink < 0.999) {
      out.push(`${s.ink} at the shoulder (${y.toFixed(2)}px)`);
    }
  });
  return out.slice(0, 3);
}

/** rims at rest: the chosen at its tone's full, an unchosen at subtle, an unchosen idle at none. */
function rimFaults(L: Layout): string[] {
  const { subtle, chosenMix, idleMix } = L.track;
  return L.tabs.flatMap((t, i) => {
    const quiet = t.tone === "quiet";
    let want = subtle;
    if (t.chosen) {
      want = quiet || t.tone === "done" ? idleMix : chosenMix;
    } else if (quiet) {
      want = 0;
    }
    return near(t.rim, want, 0.01)
      ? []
      : [
          `${i}${t.tone[0]}${t.chosen ? " chosen" : ""} rim ${t.rim.toFixed(3)}, not ${want}`,
        ];
  });
}

/** fades and titles in one frame (`kept`: the tabs drawn chosen). */
function boundsFaults(L: Layout, kept: number[]): Record<string, string[]> {
  const tr = L.track;
  const span =
    Math.max(...kept.map((k) => (L.tabs[k] as Tab).right)) -
    Math.min(...kept.map((k) => (L.tabs[k] as Tab).left));
  const tight = kept.length > 1 && span > tr.right - tr.left + 0.5;
  const fadeIn = Math.min(tr.fadeStart * (L.phone ? 1.5 : 1), tr.capStart);
  const fadeOut = Math.min(tr.fadeEnd, tr.capEnd);
  // What cuts a tab off: the boxes round the track that clip, and the
  // track itself while it clips or masks.
  const cutLeft = Math.max(tr.hostLeft, tr.cuts ? tr.left : -1e9);
  const cutRight = Math.min(tr.hostRight, tr.cuts ? tr.right : 1e9);
  return {
    // Fades are drawn only where the strip runs past an end, masked.
    fades:
      tr.overflows && tr.masked
        ? kept.flatMap((k, nth) => {
            const t = L.tabs[k] as Tab;
            const clear =
              t.left >= tr.left + fadeIn - 0.5 &&
              t.right <= tr.right - fadeOut + 0.5;
            return clear || (tight && nth === 0)
              ? []
              : [
                  `${k} ${(tr.left + fadeIn - t.left).toFixed(1)}/${(t.right - (tr.right - fadeOut)).toFixed(1)}`,
                ];
          })
        : [],
    // whole: each tab drawn chosen, its feet too (where their tips stand
    // as drawn, a spread past the flare included), cut off by nothing.
    whole: kept.flatMap((k, nth) => {
      const t = L.tabs[k] as Tab;
      const { tips } = poseOf(t);
      const svgLeft = t.svg?.left ?? t.left - t.flare;
      const left = Math.min(t.left - t.flare, svgLeft + tips[0]);
      const right = Math.max(t.right + t.flare, svgLeft + tips[1]);
      return (left >= cutLeft - 0.5 && right <= cutRight + 0.5) ||
        (tight && nth === 0)
        ? []
        : [
            `${k} cut ${Math.max(0, cutLeft - left).toFixed(1)}/${Math.max(0, right - cutRight).toFixed(1)} (track ${tr.left.toFixed(0)}–${tr.right.toFixed(0)}${tr.cuts ? " cuts" : ""}; ${tr.host || "no host cuts"})`,
          ];
    }),
    titles: L.tabs.flatMap((t, i) =>
      t.labelScroll > t.labelClient
        ? [`${i} ${t.labelScroll}>${t.labelClient}`]
        : []
    ),
  };
}

/**
 * How much of the tab at `k` an edge takes in one frame, px: what cuts its
 * box and feet off (as `whole` reads them), and how far it stands into an
 * edge's fade (as `fades` reads it, where the strip draws them).
 */
function edgesOf(L: Layout, k: number): { cut: number; fade: number } {
  const tr = L.track;
  const t = L.tabs[k] as Tab;
  const { tips } = poseOf(t);
  const svgLeft = t.svg?.left ?? t.left - t.flare;
  const left = Math.min(t.left - t.flare, svgLeft + tips[0]);
  const right = Math.max(t.right + t.flare, svgLeft + tips[1]);
  const cutLeft = Math.max(tr.hostLeft, tr.cuts ? tr.left : -1e9);
  const cutRight = Math.min(tr.hostRight, tr.cuts ? tr.right : 1e9);
  const fadeIn = Math.min(tr.fadeStart * (L.phone ? 1.5 : 1), tr.capStart);
  const fadeOut = Math.min(tr.fadeEnd, tr.capEnd);
  return {
    cut: Math.max(0, cutLeft - left) + Math.max(0, right - cutRight),
    fade:
      tr.overflows && tr.masked
        ? Math.max(0, tr.left + fadeIn - t.left) +
          Math.max(0, t.right - (tr.right - fadeOut))
        : 0,
  };
}

/** Every engine rule a frame at rest answers to. */
function restFaults(strip: Strip, L: Layout, kept: number[]) {
  const top = Math.max(...L.tabs.map((t) => t.z));
  const chosen = L.tabs.findIndex((t) => t.chosen);
  return {
    shape: L.tabs.flatMap((t, i) => shapeFaults(t).map((w) => `${i} ${w}`)),
    folds: foldFaults(L),
    stack: L.tabs.flatMap((t, i) => {
      const far = Math.abs(i - chosen);
      const wrong =
        (t.chosen && t.z !== top) ||
        L.tabs.some((u, j) => Math.abs(j - chosen) > far && u.z >= t.z);
      return wrong ? [`${i} at ${t.z}`] : [];
    }),
    ...(strip.rim
      ? {
          rims: rimFaults(L),
          taper: L.tabs.flatMap((t, i) =>
            taperFaults(L, t).map((w) => `${i} ${w}`)
          ),
        }
      : {}),
    ...boundsFaults(L, kept),
  };
}

/* ── Ink, at rest ───────────────────────────────────────────────────── */

/** Where the strip stands with its room, inside the viewport. */
const clipOf = (page: Page, strip: Strip) =>
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
  { selector: `${strip.root} .fold .rim`, style: { filter: "none" } },
];
/** The elements marked `data-kit-pick` (by `pick`). */
const PICKED = "[data-kit-pick]";

/** Marks elements (per tab, under it) as `PICKED`; none clears the marks. */
const pick = (
  page: Page,
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
  page: Page,
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

/** A seam's front tab: the one ranked above. */
const frontOf = (L: Layout, i: number) =>
  (L.tabs[i] as Tab).z > (L.tabs[i + 1] as Tab).z ? i : i + 1;

/**
 * one stroke: every row down each shared edge in view (under the shoulders
 * to above the foot) crosses the strokes its front tab's rim calls for, by
 * its strength faded by the taper low on it: one at 0.3 or more, none at
 * none, never two, none wider than one stroke. A stroke reaches 30% of the
 * strongest run's contrast in its row (a glow's tint past a stroke is not a
 * second one).
 */
function oneStroke(L: Layout, base: Raster): string[] {
  const f = fills(L, base);
  const { taper, ease } = L.track;
  const one = Math.max(3, Math.ceil(L.track.stroke * base.scale));
  return L.tabs.slice(0, -1).flatMap((a, i) => {
    const b = L.tabs[i + 1] as Tab;
    const lo = Math.min(b.left, a.right);
    const hi = Math.max(b.left, a.right);
    if (!(f.inTrack(lo - 2) && f.inTrack(hi + 2))) {
      return [];
    }
    const front = L.tabs[frontOf(L, i)] as Tab;
    const fa = f.fillOf(a);
    const fb = f.fillOf(b);
    const y0 = Math.max(a.top, b.top) + L.track.radius + 3;
    const y1 = Math.min(a.bottom, b.bottom) - L.track.flare - 2;
    let off = 0;
    let rows = 0;
    let first = "";
    for (let y = y0; y <= y1; y += 1 / base.scale) {
      rows += 1;
      const height = Math.min(a.bottom, b.bottom) - y;
      const fade =
        taper > 0 && height < taper
          ? 1 - (1 - Math.min(1, height / taper)) ** ease
          : 1;
      const strength = front.rim * fade;
      const all = strokes(base, lo - 2, hi + 2, y, fa, fb);
      const best = Math.max(1, ...all.map((s) => s.peak));
      const kept = all.filter((s) => s.peak >= 1 + (best - 1) * 0.3);
      const n = kept.reduce((sum, s) => sum + s.peaks, 0);
      const core = Math.max(0, ...kept.map((s) => s.core));
      let wrong = n > 1 || core > one;
      if (strength <= 0.01) {
        wrong = n !== 0;
      } else if (strength >= 0.3) {
        wrong = n !== 1 || core > one;
      }
      if (wrong && !first) {
        first = `${height.toFixed(1)}px up, front ${frontOf(L, i)} at ${strength.toFixed(2)}: ${n} stroke(s) ${JSON.stringify(kept)}`;
      }
      off += wrong ? 1 : 0;
    }
    return off > 0 ? [`${i}|${i + 1} ${off}/${rows} rows (${first})`] : [];
  });
}

/**
 * corner: where two tops meet, each rim's own ink (shown alone against all
 * hidden, glow off) in a box round the seam's top, read against that rim's
 * own strongest there (a third of it; none under 60 of 765), as connected
 * pieces of 4 px or more. One piece is the shoulder meeting the top behind;
 * two is a stub or a notch.
 */
function corners(
  L: Layout,
  even: Raster,
  odd: Raster,
  unlit: Raster
): string[] {
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
    const found = pieces(mask, w, h).filter((n) => n >= 4).length;
    return found <= 1 ? [] : [`${i}|${i + 1} ${found} pieces`];
  });
}

/** 3:1: the chosen rim's top against the shelf, and each side it stands in front of against the fills either side. */
function threeToOne(L: Layout, base: Raster): string[] {
  const out: string[] = [];
  const tr = L.track;
  const fl = fills(L, base);
  L.tabs.forEach((t, i) => {
    const vis =
      Math.max(0, Math.min(t.right, tr.right) - Math.max(t.left, tr.left)) /
      (t.right - t.left);
    if (!t.chosen || vis <= 0.5) {
      return;
    }
    const mid = (t.left + t.right) / 2;
    const shelf = fl.shelfAt(mid);
    const below = at(base, mid, t.top + 7);
    let peak = 0;
    let vsShelf = 0;
    for (let y = t.top - 4; y <= t.top + 5; y += 1 / base.scale) {
      const c = at(base, mid, y);
      const d = Math.min(contrast(c, shelf), contrast(c, below));
      if (d > peak) {
        peak = d;
        vsShelf = contrast(c, shelf);
      }
    }
    if (vsShelf < 3) {
      out.push(`${i} top ${vsShelf.toFixed(2)}:1`);
    }
    for (const j of [i - 1, i]) {
      const a = L.tabs[j];
      const b = L.tabs[j + 1];
      if (!(a && b) || frontOf(L, j) !== i) {
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
        ...strokes(base, lo - 2, hi + 2, y, fl.fillOf(a), fl.fillOf(b)).map(
          (s) => Math.min(s.vsA, s.vsB)
        )
      );
      if (c < 3) {
        out.push(`side ${j}|${j + 1} ${c.toFixed(2)}:1`);
      }
    }
  });
  return out;
}

/**
 * sheet edge (the rimless strip): along each seam's mid-height, the device
 * px where the fill steps most across the overlap and 4px past it, its
 * labels hidden, where the fills differ (over 1.03:1): on the front tab's
 * edge, within 1px.
 */
function sheetEdges(L: Layout, r: Raster): string[] {
  const lum = (x: number, y: number) => {
    const [cr, cg, cb] = px(r, x, y);
    const lin = (v: number) => {
      const s = v / 255;
      return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(cr) + 0.7152 * lin(cg) + 0.0722 * lin(cb);
  };
  return L.tabs.slice(0, -1).flatMap((a, i) => {
    const b = L.tabs[i + 1] as Tab;
    const want = frontOf(L, i) === i ? a.right : b.left;
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
    if (contrast(px(r, best.x - 6, y), px(r, best.x + 7, y)) <= 1.03) {
      return [];
    }
    const found = (best.x + 1) / r.scale + r.x;
    const ink = (x: number) => px(r, Math.round(dx(r, x)), y).join(",");
    return Math.abs(found - want) > 1
      ? [
          `${i}|${i + 1} at ${found.toFixed(2)}, front edge ${want.toFixed(2)} (rgb at front edge −4 ${ink(want - 4)}, behind's edge −2 ${ink(Math.min(a.right, b.left) - 2)}, +2 ${ink(Math.min(a.right, b.left) + 2)}, past +4 ${ink(Math.max(a.right, b.left) + 4)})`,
        ]
      : [];
  });
}

/** The ink rules at rest. */
async function inkFaults(page: Page, strip: Strip, L: Layout) {
  const clip = await clipOf(page, strip);
  if (!strip.rim) {
    // Its sheets alone: everything written on them (labels, the chosen
    // count's wash) hidden.
    await pick(
      page,
      strip,
      L.tabs.map((_, i) => ({ tab: i, sel: ":scope > :not(svg.fold)" }))
    );
    const sheets = await captureWith(page, clip, hidden(PICKED));
    await pick(page, strip, []);
    return { "sheet edge": sheetEdges(L, sheets) };
  }
  const base = await capture(page, clip);
  // The rims as drawn with each tab's cast edge on the one behind
  // (PaneTabs `.shade`, drawn rimmed or not) taken away: the strokes a seam
  // shows are its rims'.
  const rims = await captureWith(page, clip, [
    ...glowOff(strip),
    ...hidden(`${strip.root} .shade`),
  ]);
  const unlit = await captureWith(page, clip, [
    ...glowOff(strip),
    ...hidden(`${strip.root} .fold .rim`),
  ]);
  const alone = async (shown: 0 | 1) => {
    await pick(
      page,
      strip,
      L.tabs.flatMap((_, i) =>
        i % 2 === shown ? [] : [{ tab: i, sel: ".fold .rim" }]
      )
    );
    return captureWith(page, clip, [...glowOff(strip), ...hidden(PICKED)]);
  };
  const even = await alone(0);
  const odd = await alone(1);
  await pick(page, strip, []);
  return {
    "one stroke": oneStroke(L, rims),
    corner: corners(L, even, odd, unlit),
    "3:1": threeToOne(L, base),
  };
}

/* ── A switch ───────────────────────────────────────────────────────── */

/**
 * The come-forward's clock's curve and the --pick runs' curves, as the page
 * holds them, the choice's own, and every property any run in the strip
 * drives.
 */
const curves = (page: Page, root: string) =>
  page.evaluate((sel) => {
    const track = document.querySelector(`${sel} .ff-tabs-list`) as Element;
    const want = getComputedStyle(track)
      .getPropertyValue("--choose-ease")
      .trim();
    const runs = (document.querySelector(sel) as Element).getAnimations({
      subtree: true,
    });
    return {
      want,
      forward: runs
        .filter((run) => run.id === "tab-come-forward")
        .map((run) => String(run.effect?.getTiming().easing ?? "")),
      picks: runs
        .filter(
          (run) =>
            run instanceof CSSTransition && run.transitionProperty === "--pick"
        )
        .map((run) => String(run.effect?.getTiming().easing ?? "")),
      driven: [
        ...new Set(
          runs.flatMap((run) =>
            run instanceof CSSTransition
              ? [run.transitionProperty]
              : ((run.effect as KeyframeEffect | null)?.getKeyframes() ?? [])
                  .flatMap((frame) => Object.keys(frame))
                  .filter(
                    (k) =>
                      ![
                        "offset",
                        "easing",
                        "composite",
                        "computedOffset",
                      ].includes(k)
                  )
                  .map((k) =>
                    k.startsWith("--")
                      ? k
                      : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
                  )
          )
        ),
      ],
    };
  }, root);

/**
 * A frame's layout: every tab's box as laid out, and as drawn in the
 * strip's content (its place on the screen less the strip's scroll, so a
 * scroll riding the clock is not a tab moving), and the strip's width.
 */
const boxesOf = (L: Layout) =>
  `${L.tabs.map((t) => `${t.laid} ${(t.left - L.track.left + L.track.scroll).toFixed(1)}+${(t.right - t.left).toFixed(2)}`).join(" | ")} || width ${L.track.scrollWidth}`;

/**
 * Which tab's sheet paints on top at each point, by hit-testing the sheets
 * alone (for the read, every other thing in the strip takes no pointer):
 * the tab's index in the strip, or -1 where no sheet is hit.
 */
const paintsAt = (
  page: Page,
  strip: Strip,
  points: { x: number; y: number }[]
) =>
  page.evaluate(
    ({ root, tab, spots }) => {
      const style = document.createElement("style");
      style.textContent = `${root} * { pointer-events: none !important; } ${root} svg.fold use.sheet { pointer-events: visiblePainted !important; }`;
      document.head.append(style);
      const tabs = [...document.querySelectorAll(`${root} ${tab}`)];
      const found = spots.map(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return hit?.matches("svg.fold use.sheet")
          ? tabs.findIndex((t) => t.contains(hit))
          : -1;
      });
      style.remove();
      return found;
    },
    { root: strip.root, tab: strip.tab, spots: points }
  );

/**
 * Points on the chosen tab's C sides where it overlaps a neighbour: each
 * side's foot (a quarter flare out from its edge, 1px above the shelf) and
 * its flank (1px in from its edge, half way up); `feet` false for the
 * flanks alone.
 */
function sidePoints(L: Layout, i: number, feet: boolean) {
  const t = L.tabs[i] as Tab;
  const mid = (t.top + t.bottom) / 2;
  const sides: { at: string; x: number; y: number }[] = [];
  if (i > 0) {
    sides.push({ at: "start flank", x: t.left + 1, y: mid });
    if (feet) {
      sides.push({
        at: "start foot",
        x: t.left - t.flare / 4,
        y: t.bottom - 1,
      });
    }
  }
  if (i < L.tabs.length - 1) {
    sides.push({ at: "end flank", x: t.right - 1, y: mid });
    if (feet) {
      sides.push({ at: "end foot", x: t.right + t.flare / 4, y: t.bottom - 1 });
    }
  }
  // Only where the strip shows them: a side the strip has scrolled past its
  // edge, or a box round it cuts off, paints nothing to hit.
  const tr = L.track;
  const from = Math.max(tr.hostLeft, tr.cuts ? tr.left : 0, 0) + 1;
  const to = Math.min(tr.hostRight, tr.cuts ? tr.right : 1e9, L.width) - 1;
  return sides.filter(({ x }) => x >= from && x <= to);
}

/**
 * One switch from `from` to `to`, caught and read at every fraction:
 * its clock, the two tabs' slides, the swap, the folds, the rims and the
 * bounds at each.
 */
async function readSwitch(
  kit: Kit,
  page: Page,
  strip: Strip,
  where: string,
  from: number,
  to: number,
  choose: string
) {
  const layout = () =>
    page.evaluate(layoutOf, { root: strip.root, tab: strip.tab });
  const rest = await layout();
  const clock = await Clock.on(page);
  const within =
    strip.api === "work" ? `${strip.root} .ff-tabs-list` : strip.root;
  await clock.catchRuns(() => page.evaluate(choose), within);
  const timed = clock.runs.filter((run) => !(run.loop || run.scroll));
  const lead = timed.find((run) => run.name === FORWARD);
  const astray = timed.filter(
    (run) =>
      run.start === null ||
      lead?.start === null ||
      Math.abs((run.start ?? 0) - (lead?.start ?? 0)) > 0.5 ||
      Math.abs(run.end - (lead?.end ?? 0)) > 0.5
  );
  const curve = await curves(page, strip.root);
  kit.check(
    `${where}: the switch is one come-forward run on the track (${FORWARD}) with every run in the strip on its start and length, all on --choose-ease`,
    Boolean(lead) &&
      timed.filter((run) => run.name === FORWARD).length === 1 &&
      astray.length === 0 &&
      curve.forward.length === 1 &&
      curve.picks.length >= 2 &&
      [...curve.forward, ...curve.picks].every((e) => e === curve.want),
    `${timed.map((run) => `${run.type} ${run.name} ${run.start}+${run.end}`).join(", ")}; curves ${[...curve.forward, ...curve.picks].join(" ")} against ${curve.want}${astray.length ? `; off: ${astray.map((run) => run.name).join(", ")}` : ""}`
  );
  const layoutDriven = curve.driven.filter((p) => LAYOUT.test(p));
  kit.check(
    `${where}: no run in the strip drives a box's size or place (it drives ${curve.driven.join(", ")})`,
    layoutDriven.length === 0,
    layoutDriven.join(", ") || undefined
  );
  const series: { f: number; L: Layout; paints: number[] }[] = [];
  for (const f of FRACTIONS) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame of the switch at a time
    await clock.seek(f, FORWARD);
    const L = await layout();
    series.push({
      f,
      L,
      paints:
        f > FLIP ? await paintsAt(page, strip, sidePoints(L, to, false)) : [],
    });
  }
  await clock.release();
  await settle(page, 300);
  const landed = await layout();
  const landedPoints = sidePoints(landed, to, true);
  const landedPaints = await paintsAt(page, strip, landedPoints);
  const out: Record<string, string[]> = {
    boxes: [],
    poses: [],
    front: [],
    neighbours: [],
    sweep: [],
    flip: [],
    folds: [],
    rims: [],
    fades: [],
    whole: [],
    titles: [],
  };
  const frame = (f: number) => series.find((s) => s.f === f)?.L as Layout;
  const pct = (f: number) => `${Math.round(f * 100)}%`;
  // boxes: no tab's box, as laid out or as drawn in the strip, nor the
  // strip's width, moves at any frame, from rest on.
  const still = boxesOf(rest);
  for (const { f, L } of series) {
    if (boxesOf(L) !== still) {
      out.boxes.push(`${pct(f)}: ${boxesOf(L)} (at rest ${still})`);
    }
  }
  // scroll: where the choice scrolls the strip to show its tab whole, it
  // rides the motion: at 0% where it stood, one way only, at 100% where it
  // lands (never ahead of the motion's first frame).
  const scrolls = series.map(({ L }) => L.track.scroll);
  const way = Math.sign(landed.track.scroll - rest.track.scroll);
  const back = scrolls.findIndex(
    (s, k) => k > 0 && (s - (scrolls[k - 1] ?? s)) * way < -0.5
  );
  kit.check(
    `${where}: the strip's scroll rides the motion (at rest, 0%, 25%, 50%, 75%, 100%, landed: ${[rest.track.scroll, ...[0, 0.25, 0.5, 0.75, 1].map((f) => frame(f).track.scroll), landed.track.scroll].map((s) => s.toFixed(1)).join(" → ")})`,
    near(scrolls[0] ?? 0, rest.track.scroll, 0.5) &&
      near(scrolls.at(-1) ?? 0, landed.track.scroll, 0.5) &&
      back < 0,
    back < 0 ? undefined : `turns back at ${pct(series[back]?.f ?? 0)}`
  );
  // poses: one command structure at every frame; at 0% every path as it
  // stood, at 100% as it stands landed.
  for (const { f, L } of series) {
    for (const [i, t] of L.tabs.entries()) {
      const s = poseOf(t).structure;
      if (s !== STRUCTURE) {
        out.poses.push(`${pct(f)}: ${i} ${s}`);
      }
    }
  }
  const ds = (L: Layout) => L.tabs.map((t) => t.d);
  const differs = (a: Layout, b: Layout) =>
    ds(a).flatMap((d, i) => (d === ds(b)[i] ? [] : [i]));
  if (differs(frame(0), rest).length > 0) {
    out.poses.push(`0%: tabs ${differs(frame(0), rest)} off where they stood`);
  }
  if (differs(frame(1), landed).length > 0) {
    out.poses.push(
      `100%: tabs ${differs(frame(1), landed)} off where they land (${frame(1)
        .tabs.map((t) => t.d)
        .join(" | ")} against ${landed.tabs.map((t) => t.d).join(" | ")})`
    );
  }
  // front (owner: "a small c shape svg path at the side of the tab"): the
  // chosen tab's sheet paints over both neighbours at each C side, its
  // flanks from the flip on and its feet too once landed (elementFromPoint
  // on the sheets alone).
  landedPaints.forEach((hit, k) => {
    if (hit !== to) {
      out.front.push(
        `landed: ${landedPoints[k]?.at} paints ${hit < 0 ? "no sheet" : `tab ${hit}`}, not ${to}`
      );
    }
  });
  for (const { f, L, paints } of series) {
    const points = sidePoints(L, to, false);
    paints.forEach((hit, k) => {
      if (hit !== to) {
        out.front.push(
          `${pct(f)}: ${points[k]?.at} paints ${hit < 0 ? "no sheet" : `tab ${hit}`}, not ${to}`
        );
      }
    });
  }
  // neighbours: no tab outside the two the switch passes between moves
  // (its path as at rest at every frame and landed), and no tab is
  // transformed at any frame.
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  for (const { f, L } of [...series, { f: 2, L: landed }]) {
    const when = f > 1 ? "landed" : pct(f);
    for (const [i, t] of L.tabs.entries()) {
      if ((i < lo || i > hi) && t.d !== (rest.tabs[i] as Tab).d) {
        out.neighbours.push(
          `${when}: ${i} drawn ${t.d}, at rest ${(rest.tabs[i] as Tab).d}`
        );
      }
      if (t.turned) {
        out.neighbours.push(`${when}: ${i} transformed ${t.turned}`);
      }
    }
  }
  // sweep: each pair of neighbours the switch re-ranks, scrubbed on the
  // clock. The side of the one in front before (the one nearer `from`)
  // tucks before the flip, its foot folding and its C stepping in by the
  // overlap; at half way it stands on the other's tucked edge (within
  // 0.5px), both feet folded; after the flip the other's side sweeps out
  // to its full flare, never before, never back; at 100% the tucked side
  // back on its own edge.
  const { overlap } = rest.track;
  const page0 = (L: Layout, i: number, k: 0 | 1) =>
    ((L.tabs[i] as Tab).svg?.left ?? 0) + poseOf(L.tabs[i] as Tab).feet[k];
  for (let i = lo; i < hi; i += 1) {
    const [tucker, tk, sweeper, sk] =
      from < to ? ([i, 1, i + 1, 0] as const) : ([i + 1, 0, i, 1] as const);
    const pose = (L: Layout, j: number) => poseOf(L.tabs[j] as Tab);
    const name = `${tucker}'s ${tk ? "end" : "start"} / ${sweeper}'s ${sk ? "end" : "start"}`;
    const half = frame(FLIP);
    const t5 = pose(half, tucker);
    const s5 = pose(half, sweeper);
    if (!(
      near(t5.spread[tk] ?? 1, 0, 0.01) &&
      near(t5.tuck[tk] ?? 0, overlap, 0.05) &&
      near(s5.spread[sk] ?? 1, 0, 0.01) &&
      near(s5.tuck[sk] ?? 1, 0, 0.01)
    )) {
      out.sweep.push(
        `50% ${name}: spread ${t5.spread[tk]?.toFixed(2)}/${s5.spread[sk]?.toFixed(2)}, tuck ${t5.tuck[tk]?.toFixed(2)}/${s5.tuck[sk]?.toFixed(2)} (overlap ${overlap})`
      );
    }
    const gap = page0(half, tucker, tk) - page0(half, sweeper, sk);
    if (Math.abs(gap) > 0.5) {
      out.sweep.push(`50% ${name}: the tucked edges ${gap.toFixed(2)}px apart`);
    }
    const t1 = pose(frame(1), tucker);
    const s1 = pose(frame(1), sweeper);
    if (!(
      near(s1.spread[sk] ?? 0, 1, 0.01) &&
      near(t1.spread[tk] ?? 1, 0, 0.01) &&
      near(t1.tuck[tk] ?? 1, 0, 0.05)
    )) {
      out.sweep.push(
        `100% ${name}: spread ${t1.spread[tk]?.toFixed(2)}/${s1.spread[sk]?.toFixed(2)}, tuck ${t1.tuck[tk]?.toFixed(2)}`
      );
    }
    let last = Number.NEGATIVE_INFINITY;
    let was = Number.POSITIVE_INFINITY;
    for (const { f, L } of series) {
      const s = pose(L, sweeper).spread[sk] ?? 0;
      const t = pose(L, tucker).spread[tk] ?? 0;
      if (f < FLIP && s > 0.01) {
        out.sweep.push(
          `${pct(f)}: ${sweeper}'s side out ${s.toFixed(2)} before the flip`
        );
      }
      if (s < last - 0.005) {
        out.sweep.push(
          `${pct(f)}: ${sweeper}'s side back ${last.toFixed(2)}→${s.toFixed(2)}`
        );
      }
      if (f <= FLIP && t > was + 0.005) {
        out.sweep.push(
          `${pct(f)}: ${tucker}'s side out again ${was.toFixed(2)}→${t.toFixed(2)}`
        );
      }
      last = s;
      was = t;
    }
  }
  // flip: in one frame at half way, the tab being chosen under its
  // neighbours before it and over them after it (at half way itself, where
  // nothing drawn changes, either).
  for (const { f, L } of series.filter((s) => s.f !== FLIP)) {
    const top = Math.max(...L.tabs.map((t) => t.z));
    if (((L.tabs[to] as Tab).z === top) !== f >= FLIP) {
      out.flip.push(
        `${pct(f)}: ${(L.tabs[to] as Tab).z === top ? "on top" : "under"}`
      );
    }
  }
  kit.note(
    `${where}: scrubbed (each re-ranked pair's tucking side spread/tuck px, sweeping side spread, chosen tab under or over): ${[
      0,
      0.25,
      PRE,
      FLIP,
      POST,
      0.75,
      1,
    ]
      .map((f) => {
        const L = frame(f);
        const top = Math.max(...L.tabs.map((t) => t.z));
        const pairs = Array.from({ length: hi - lo }, (_, k) => {
          const [tucker, tk, sweeper, sk] =
            from < to
              ? ([lo + k, 1, lo + k + 1, 0] as const)
              : ([lo + k + 1, 0, lo + k, 1] as const);
          const t = poseOf(L.tabs[tucker] as Tab);
          const s = poseOf(L.tabs[sweeper] as Tab);
          return `${t.spread[tk].toFixed(2)}/${t.tuck[tk].toFixed(2)} ${s.spread[sk].toFixed(2)}`;
        });
        return `${pct(f)} ${pairs.join(", ")} ${(L.tabs[to] as Tab).z === top ? "over" : "under"}`;
      })
      .join("; ")}`
  );
  for (const f of [0, 1]) {
    out.folds.push(...foldFaults(frame(f)).map((w) => `${pct(f)}: ${w}`));
  }
  // whole and fades: landed, the tab chosen whole and clear of the fades;
  // on the way, where the choice scrolls the strip to show it (it stood
  // past the edge), each of the two tabs drawn chosen is taken by an edge
  // no more than at one end of the ride or the other: the scroll carries
  // them between, never further out (1px for a foot's spring past the
  // flare).
  const ends = [from, to].map((k) => ({
    k,
    a: edgesOf(frame(0), k),
    b: edgesOf(frame(1), k),
  }));
  for (const { f, L } of series) {
    const when = `${Math.round(f * 100)}%`;
    const b = boundsFaults(L, [to]);
    out.titles.push(...b.titles.map((w) => `${when}: ${w}`));
    if (f === 1) {
      out.fades.push(...b.fades.map((w) => `${when}: ${w}`));
      out.whole.push(...b.whole.map((w) => `${when}: ${w}`));
      continue;
    }
    for (const { k, a, b: z } of ends) {
      const e = edgesOf(L, k);
      if (e.cut > Math.max(a.cut, z.cut) + 1) {
        out.whole.push(
          `${when}: ${k} cut ${e.cut.toFixed(1)}, past its ends' ${a.cut.toFixed(1)} and ${z.cut.toFixed(1)}`
        );
      }
      if (e.fade > Math.max(a.fade, z.fade) + 1) {
        out.fades.push(
          `${when}: ${k} ${e.fade.toFixed(1)} into a fade, past its ends' ${a.fade.toFixed(1)} and ${z.fade.toFixed(1)}`
        );
      }
    }
  }
  if (strip.rim) {
    // rims: one way from rest to rest, and no jump across the flip.
    rest.tabs.forEach((_, i) => {
      const s = series.map(({ L }) => (L.tabs[i] as Tab).rim);
      const dir = Math.sign((s.at(-1) ?? 0) - (s[0] ?? 0));
      s.forEach((v, k) => {
        if (k > 0 && (v - (s[k - 1] as number)) * dir < -0.002) {
          out.rims.push(
            `${i} back ${(s[k - 1] as number).toFixed(3)}→${v.toFixed(3)} at ${Math.round((series[k]?.f ?? 0) * 100)}%`
          );
        }
      });
      const across = Math.abs(
        (frame(POST).tabs[i] as Tab).rim - (frame(PRE).tabs[i] as Tab).rim
      );
      if (across > SWAP_STEP) {
        out.rims.push(`${i} jumps ${across.toFixed(3)} across the flip`);
      }
    });
  }
  return out;
}

/**
 * interruption: `first` caught and held at 70%, then `second` chosen:
 * every path at the second's first frame is where the first had it (within
 * 0.05px a point): the pull starts from the paths as drawn, never a jump.
 */
async function readInterrupt(
  page: Page,
  strip: Strip,
  first: string,
  second: string
): Promise<string[]> {
  const layout = () =>
    page.evaluate(layoutOf, { root: strip.root, tab: strip.tab });
  const clock = await Clock.on(page);
  await clock.catchRuns(() => page.evaluate(first), strip.root);
  await clock.seek(0.7, FORWARD);
  const before = await layout();
  await clock.catchRuns(() => page.evaluate(second), strip.root);
  // Its first frame, drawn.
  await clock.seek(0, FORWARD);
  const after = await layout();
  await clock.release();
  await settle(page, 300);
  const nums = (d: string) => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  return before.tabs.flatMap((t, i) => {
    const a = nums(t.d);
    const b = nums(after.tabs[i]?.d ?? "");
    const off = Math.max(0, ...a.map((x, k) => Math.abs(x - (b.at(k) ?? 1e9))));
    return a.length === b.length && off <= 0.05
      ? []
      : [
          `${i} moved ${off.toFixed(2)}px as the second switch began (${t.d} → ${after.tabs[i]?.d})`,
        ];
  });
}

/**
 * An instant choice (less motion, or the keyboard's): `act` chooses the tab
 * at `to`, and no come-forward run starts, every path lands and the stack
 * is ranked for it.
 */
async function readCalm(
  page: Page,
  strip: Strip,
  to: number,
  act: () => Promise<unknown>
): Promise<string[]> {
  await act();
  await frames(page);
  await frames(page);
  const runs = await page.evaluate(
    (sel) =>
      (document.querySelector(sel) as Element)
        .getAnimations({ subtree: true })
        .filter((run) => run.id === "tab-come-forward").length,
    strip.root
  );
  const L = await page.evaluate(layoutOf, {
    root: strip.root,
    tab: strip.tab,
  });
  const rest = restFaults(strip, L, [to]);
  return [
    ...(runs > 0 ? [`${runs} come-forward run(s)`] : []),
    ...(L.tabs[to]?.chosen ? [] : [`${to} not chosen`]),
    ...rest.shape,
    ...rest.folds,
    ...rest.stack,
  ];
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
  const faults: Partial<Record<string, string[]>> = {};
  const add = (when: string, found: Record<string, string[] | undefined>) => {
    for (const [name, list] of Object.entries(found)) {
      faults[name] = [
        ...(faults[name] ?? []),
        ...(list ?? []).map((one) => `${when}: ${one}`),
      ];
    }
  };

  // At rest, then the switch from the chosen tab to its next.
  await openAt(1, "working");
  const ids = (await page.evaluate(`${api}.ids`)) as string[];
  const chosen = (await page.evaluate(`${api}.chosen()`)) as string | null;
  const from = ids.indexOf(chosen ?? (ids[0] as string));
  const restL = await layout();
  add("rest", restFaults(s, restL, [from]));
  add("rest", await inkFaults(page, s, restL));
  add(
    "switch",
    await readSwitch(
      kit,
      page,
      s,
      `${where} switch`,
      from,
      from + 1,
      `${api}.choose(${JSON.stringify(ids[from + 1])})`
    )
  );
  await settle(page, 300);
  add("landed", restFaults(s, await layout(), [from + 1]));

  if (s.rim) {
    // The jump past the rimless idle tab: second to fourth.
    await openAt(1, "working");
    const past = (await layout()).tabs[from + 1] as Tab;
    add("jump", {
      jump:
        past.tone === "quiet" && past.rim <= 0.001
          ? []
          : [
              `passes tab ${from + 1} (${past.tone} at ${past.rim}), not a rimless one`,
            ],
    });
    add(
      "jump",
      await readSwitch(
        kit,
        page,
        s,
        `${where} jump`,
        from,
        from + 2,
        `${api}.choose(${JSON.stringify(ids[from + 2])})`
      )
    );

    // Caught mid-way: second to third held at 70%, then the fourth chosen.
    await openAt(1, "working");
    add("interrupt", {
      interrupt: await readInterrupt(
        page,
        s,
        `${api}.choose(${JSON.stringify(ids[from + 1])})`,
        `${api}.choose(${JSON.stringify(ids[from + 2])})`
      ),
    });

    // Less motion: second to third at once.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openAt(1, "working");
    add("less motion", {
      "less motion": await readCalm(page, s, from + 1, () =>
        page.evaluate(`${api}.choose(${JSON.stringify(ids[from + 1])})`)
      ),
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });

    // The keyboard: second to third by ArrowRight on the chosen tab, and by
    // Enter on the third, each instant (owner's preview: keyboard choices
    // never come forward).
    const hits = `${s.root} ${s.tab} .ff-tab > .hit`;
    const pressOn = (index: number, key: string) => async () => {
      await page.evaluate(
        ({ sel, k }) =>
          (
            document.querySelectorAll<HTMLElement>(sel)[k] as HTMLElement
          ).focus(),
        { sel: hits, k: index }
      );
      await page.keyboard.press(key);
    };
    await openAt(1, "working");
    add("keyboard", {
      keyboard: (
        await readCalm(page, s, from + 1, pressOn(from, "ArrowRight"))
      ).map((w) => `ArrowRight: ${w}`),
    });
    await openAt(1, "working");
    add("keyboard", {
      keyboard: (
        await readCalm(page, s, from + 1, pressOn(from + 1, "Enter"))
      ).map((w) => `Enter: ${w}`),
    });
  }

  // At its start: the session strip's first tab chosen; the home's Finished.
  await openAt(0, "finished");
  const firstL = await layout();
  const kept = [s.api === "work" ? 1 : 0];
  add("rest2", restFaults(s, firstL, kept));
  add("rest2", await inkFaults(page, s, firstL));

  const rules = s.rim
    ? [
        "shape",
        "folds",
        "stack",
        "rims",
        "taper",
        "boxes",
        "poses",
        "front",
        "neighbours",
        "sweep",
        "flip",
        "jump",
        "interrupt",
        "less motion",
        "keyboard",
        "one stroke",
        "corner",
        "3:1",
        "fades",
        "whole",
        "titles",
      ]
    : [
        "shape",
        "folds",
        "stack",
        "boxes",
        "poses",
        "front",
        "neighbours",
        "sweep",
        "flip",
        "sheet edge",
        "fades",
        "whole",
        "titles",
      ];
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
