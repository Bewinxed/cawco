/**
 * The pairing surface, played moment by moment, as the build spec
 * (pairing-design.md) draws it: the object column (Caw on the axis, the one
 * object slot holding the paper or the device, the letter run under it) and
 * the words column, every word on one start edge. The thing the hub gave
 * stays and wears each failure; one object travels across every change (the
 * code's head becomes the app icon on the phone's screen, the icon becomes
 * the tick or the lock).
 *
 * Each change is a storyboard (§7): one lead at 0, then beats at the times
 * the spec writes, in ms after the trigger. How a board plays: what the
 * surface shows is read, the surface is set in the new moment's resting
 * state, and in the same frame every part's Web Animation is issued from
 * where the part was drawn, its last keyframe the resting style (fill both).
 * What leaves a place it keeps (a button, a line) leaves as a copy drawn
 * where it stood; what stays and moves slides from where it stood (FLIP).
 * Caw's status changes, the hub's record landing and the drift's start are
 * cues: Web Animations that draw nothing, whose end does the change, so the
 * page's one clock (and the proof's, through the DevTools Animation domain)
 * holds every beat. Nothing waits on a timer but the clock's seconds.
 */
import { caw, cawEvents } from "./caw.svelte.js";
import badgeOpen from "./caw/badge.png";
import badgeShut from "./caw/badge-shut.png";
import { QR } from "./lib/qr.js";
import { TextMorph, TextSwap } from "./lib/swap.js";

/* ---------------------------------------------------------------- data */

const CODE = "JWKHDQ";
/** The head's tile in modules from the symbol's edge, and the symbol's middle. */
const LOGO_AT = (QR.side - QR.logo) / 2;
const MIDDLE = QR.side / 2;
/** How far a scattered dot starts from its module, and a dot's radius, in modules (r4's). */
const SCATTER = 6;
const DOT_R = 0.42;

/**
 * The owner's real phone, as the hub and his tailnet record it, nothing
 * more: the hub's one device (push_devices: name "iPhone", platform ios) and
 * its tailnet name and address (`tailscale status`: iphone182-1,
 * 100.99.18.79). Over the public internet and the LAN the hub records no
 * address, so those cases show no address line (spec §6, Checking).
 */
const DEVICE = { name: "iPhone", kind: "iOS" };
const NETWORK = {
  public: null,
  tailnet: { addr: "100.99.18.79", tag: "tailnet", alias: "iphone182-1" },
  lan: null,
};
/** The clock time an answer is recorded at (spec §6). */
const AT = "15:04";
/** done.riv's one loop, done-dust-off: 124 frames at 24 fps (assets/mascot/loops/done-dust-off). */
const DONE_ONCE = (124 / 24) * 1000;

/** Each moment's frame and how it is named in the preview's bar. */
const MOMENTS = [
  ["asking", "Asking"],
  ["waiting", "Waiting"],
  ["lastminute", "Last minute"],
  ["checking-public", "Checking · public"],
  ["checking-tailnet", "Checking · tailnet"],
  ["checking-lan", "Checking · LAN"],
  ["approved", "Paired"],
  ["denied", "Denied"],
  ["expired", "The code expired"],
  ["nomatch-spent", "Wrong code · expired code"],
  ["nomatch-foreign", "Wrong code · not this hub's"],
  ["failed", "The hub didn't answer"],
  ["removed", "Removed"],
];
/** The board each moment's control plays, from the moment it plays from. */
const FROM = {
  asking: "open",
  waiting: "asking",
  lastminute: "waiting",
  "checking-public": "waiting",
  "checking-tailnet": "waiting",
  "checking-lan": "waiting",
  approved: "checking-tailnet",
  denied: "checking-tailnet",
  expired: "lastminute",
  "nomatch-spent": "waiting",
  "nomatch-foreign": "waiting",
  failed: "asking",
  removed: "approved",
};

/** The owner's two picks (spec §6 Denied, and whether Removed stays on this surface). */
const PICKS = {
  denied: [
    ["quiet", "Denied: New code quiet"],
    ["coral", "Denied: New code coral"],
  ],
  removed: [
    ["retired", "Paired"],
    ["kept", "Paired · with Remove device"],
  ],
};
const pick = { denied: "quiet", removed: "retired" };

const kindOf = (m) => {
  if (m === "open") {
    return "none";
  }
  return m.startsWith("checking") || ["approved", "denied", "removed"].includes(m) ? "device" : "code";
};
const netOf = (m) => (m.startsWith("checking") ? m.split("-")[1] : "tailnet");

const NEW_CODE_QUIET = { label: "New code", act: "again", tone: "" };
const NEW_CODE_CORAL = { label: "New code", act: "again", tone: "primary" };

/**
 * Each moment at rest (spec §6): Caw's file, the title, the lines, the
 * facts, the acts, and what the object slot and the letter run hold.
 */
function restOf(m) {
  const kind = kindOf(m);
  const base = {
    kind,
    caw: { status: "ready", still: false },
    title: "Scan with the CawCo app",
    line1: null,
    line2: null,
    facts: kind === "device",
    when: "",
    after: "",
    acts: {},
    code: null,
    head: null,
    run: null,
    screen: { letters: false, mark: null },
    wireDim: false,
    ping: null,
  };
  switch (m) {
    case "open":
      return { ...base, title: "" };
    case "asking":
      return {
        ...base,
        caw: { status: "loading", still: false },
        line1: { mark: "live", text: "Getting a code…" },
        code: "cloud",
        head: "code",
      };
    case "waiting":
      return { ...base, code: "live", head: "code", run: "live", ping: "coral" };
    case "lastminute":
      return {
        ...base,
        line1: { text: "Expires in", figure: "0:42" },
        code: "live",
        head: "code",
        run: "live",
        ping: "warm",
      };
    case "nomatch-spent":
    case "nomatch-foreign":
      return {
        ...base,
        title: "Wrong code scanned",
        line1: {
          mark: "warn",
          text:
            m === "nomatch-spent" ? "That code expired. Scan this one." : "Not a code from this hub. Scan this one.",
        },
        code: "live",
        head: "code",
        run: "live",
        ping: "coral",
      };
    case "expired":
      return {
        ...base,
        caw: { status: "sleeping", still: false },
        title: "The code expired",
        line1: { mark: "clock", text: "No one scanned it in ten minutes." },
        acts: { primary: { label: "New code", act: "again", tone: "primary" } },
        code: "dim",
        run: "struck",
      };
    case "retrying":
      // Retry's request is out: the stopped cloud, the same words, Caw's reconnecting loop, no act.
      return {
        ...base,
        caw: { status: "reconnecting", still: false },
        title: "The hub didn't answer",
        line1: { mark: "question", text: "No code was made. Retry asks the hub again." },
        code: "held",
      };
    case "failed":
      return {
        ...base,
        caw: { status: "reconnecting", still: true },
        title: "The hub didn't answer",
        line1: { mark: "question", text: "No code was made. Retry asks the hub again." },
        acts: { primary: { label: "Retry", act: "retry", tone: "primary" } },
        code: "held",
      };
    case "approved":
      return {
        ...base,
        title: "Paired",
        when: `paired ${AT}`,
        after: "Its lock screen now answers permissions and questions.",
        acts: {
          ...(pick.removed === "kept" ? { ghost: { label: "Remove device", act: "remove", tone: "ghost" } } : {}),
          primary: { label: "Done", act: "done", tone: "primary" },
        },
        screen: { letters: false, mark: "check" },
      };
    case "denied":
      return {
        ...base,
        title: "Denied",
        line1: { text: "It was turned away and got nothing.", tone: "verdict" },
        line2: { text: "If it was yours, make a new code and scan again." },
        when: `denied ${AT}`,
        acts: { primary: pick.denied === "coral" ? NEW_CODE_CORAL : NEW_CODE_QUIET },
        screen: { letters: false, mark: "lock" },
        wireDim: true,
      };
    case "removed":
      return {
        ...base,
        title: "Removed",
        when: `removed ${AT}`,
        acts: { primary: NEW_CODE_QUIET },
        screen: { letters: false, mark: "unlink" },
        wireDim: true,
      };
    default:
      // Checking, on each network.
      return {
        ...base,
        caw: { status: "needs-you", still: false },
        title: "Is this you?",
        line1: { text: "Approve only if this is the code on the device in front of you." },
        when: "asked 8s ago",
        acts: {
          second: { label: "Deny", act: "deny", tone: "" },
          primary: { label: "Approve", act: "approve", tone: "primary" },
        },
        head: "device",
        screen: { letters: true, mark: null },
      };
  }
}

/* -------------------------------------------------------------- marks */

/**
 * The marks (spec §4), Solar's linear set and the house's Tick, verbatim:
 * each path, and whether it carries a round join.
 */
const MARKS = {
  check: [{ d: "M5 12.5l4.5 4.5L19 7.5", join: true, tick: true }],
  lock: [
    {
      d: "M2 16C2 13.1716 2 11.7574 2.87868 10.8787C3.75736 10 5.17157 10 8 10H16C18.8284 10 20.2426 10 21.1213 10.8787C22 11.7574 22 13.1716 22 16C22 18.8284 22 20.2426 21.1213 21.1213C20.2426 22 18.8284 22 16 22H8C5.17157 22 3.75736 22 2.87868 21.1213C2 20.2426 2 18.8284 2 16Z",
    },
    { d: "M12 14V18" },
    { d: "M6 10V8C6 4.68629 8.68629 2 12 2C15.3137 2 18 4.68629 18 8V10" },
  ],
  clock: [{ circle: true }, { d: "M12 8V12L14.5 14.5", join: true }],
  warn: [
    {
      d: "M5.31171 10.7615C8.23007 5.58716 9.68925 3 12 3C14.3107 3 15.7699 5.58716 18.6883 10.7615L19.0519 11.4063C21.4771 15.7061 22.6897 17.856 21.5937 19.428C20.4978 21 17.7864 21 12.3637 21H11.6363C6.21356 21 3.50217 21 2.40626 19.428C1.31034 17.856 2.52291 15.7061 4.94805 11.4063L5.31171 10.7615Z",
    },
    { d: "M12 8V13" },
    { d: "M12 16H12.0001", join: true },
  ],
  question: [
    { circle: true },
    {
      d: "M10.125 8.875C10.125 7.83947 10.9645 7 12 7C13.0355 7 13.875 7.83947 13.875 8.875C13.875 9.56245 13.505 10.1635 12.9534 10.4899C12.478 10.7711 12 11.1977 12 11.75V13",
    },
    { d: "M12 16H12.0001", join: true },
  ],
  unlink: [
    { d: "M10 5.04877L10.367 4.70563C12.7995 2.43146 16.7432 2.43146 19.1757 4.70563C21.6081 6.9798 21.6081 10.667 19.1757 12.9411L16.9735 15" },
    { d: "M14 18.9278L13.6345 19.2773C11.2123 21.5937 7.25434 21.5644 4.83209 19.248C2.43376 16.9546 2.37639 13.2153 4.74095 10.89L5.64594 10" },
    { d: "M6.58739 3L7.5 5.20521" },
    { d: "M3.50238 6.08658L9.05021 8.79453" },
  ],
};

/** The iPhone's wire, nine strokes on a 96 box (its screen 36 × 56 at 30, 20). */
const STROKES = [
  "M30 20a10 10 0 0 1 10 -10h16a10 10 0 0 1 10 10",
  "M66 20V76",
  "M66 76a10 10 0 0 1 -10 10h-16a10 10 0 0 1 -10 -10",
  "M30 76V20",
  "M43.5 15.5h9",
  "M42 81.5h12",
  "M68.5 32v11",
  "M27.5 29v6",
  "M27.5 38v6",
];

const SVG = "http://www.w3.org/2000/svg";

function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

/** A mark as an inline svg on the 24 grid: bare, its stroke the current colour. */
function markSvg(name, strokeWidth) {
  const svg = svgEl("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": strokeWidth,
    "stroke-linecap": "round",
    class: `m-${name}`,
    "aria-hidden": "true",
  });
  for (const p of MARKS[name]) {
    const el = p.circle ? svgEl("circle", { cx: 12, cy: 12, r: 10 }) : svgEl("path", { d: p.d });
    if (p.join) {
      el.setAttribute("stroke-linejoin", "round");
    }
    if (p.tick) {
      el.setAttribute("pathLength", "1");
      el.setAttribute("class", "tick");
    }
    svg.append(el);
  }
  return svg;
}

/* ------------------------------------------------------------- tokens */

const root = document.documentElement;
const token = (name) => getComputedStyle(root).getPropertyValue(name).trim();
const TIMES = /calc\(\s*([\d.]+)(ms|s)\s*\*\s*([\d.]+)\s*\)/;
const PLAIN = /([\d.]+)(ms|s)/;
/** A duration token in ms ("260ms", "1.2s", "calc(500ms * 4)"). */
function ms(name) {
  const value = token(name);
  const times = TIMES.exec(value);
  if (times) {
    return Number(times[1]) * (times[2] === "s" ? 1000 : 1) * Number(times[3]);
  }
  const plain = PLAIN.exec(value);
  return plain ? Number(plain[1]) * (plain[2] === "s" ? 1000 : 1) : 0;
}
const D = {};
const E = {};
const V = {};
function readTokens() {
  for (const n of ["control", "toggle", "exit", "morph", "fade", "pop", "panel", "settle", "stagger", "reveal", "hold"]) {
    D[n] = ms(`--dur-${n}`);
  }
  D.breath = ms("--breath");
  for (const n of ["out", "in-out", "drawer", "crossfade"]) {
    E[n] = token(`--ease-${n}`);
  }
  for (const n of ["qr-dim-opacity", "qr-ping-reach", "qr-ping-opacity", "qr-squeeze", "qr-pulse-scale", "pop-scale"]) {
    V[n] = Number.parseFloat(token(`--${n}`));
  }
  V.lift = token("--space-1");
  V.rise = token("--space-3");
  V.digit = token("--space-2");
}

const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const deskQuery = matchMedia("(width >= 900px)");

/* ------------------------------------------------------- the dots' paths */

/** The same scatter for the same code: r4's linear congruential generator seeded from the text. */
function seeded(text) {
  const MODULUS = 2 ** 32;
  let seed = 0;
  for (const char of text) {
    seed = (seed * 31 + (char.codePointAt(0) ?? 0)) % MODULUS;
  }
  return () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % MODULUS;
    return seed / MODULUS;
  };
}

/** The head's square and a dot's reach round it, in modules: what no drifting or arriving dot enters. */
const KEEP_OUT = { lo: LOGO_AT - DOT_R - 0.08, hi: LOGO_AT + QR.logo + DOT_R + 0.08 };
const inKeepOut = (p) => p.x > KEEP_OUT.lo && p.x < KEEP_OUT.hi && p.y > KEEP_OUT.lo && p.y < KEEP_OUT.hi;
/** Whether the segment p→q passes through the keep-out square (Liang–Barsky). */
function crossesKeepOut(p, q) {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (const [pp, qq] of [
    [-dx, p.x - KEEP_OUT.lo],
    [dx, KEEP_OUT.hi - p.x],
    [-dy, p.y - KEEP_OUT.lo],
    [dy, KEEP_OUT.hi - p.y],
  ]) {
    if (pp === 0) {
      if (qq < 0) {
        return false;
      }
    } else {
      const r = qq / pp;
      if (pp < 0) {
        t0 = Math.max(t0, r);
      } else {
        t1 = Math.min(t1, r);
      }
      if (t0 > t1) {
        return false;
      }
    }
  }
  return true;
}
/** Whether the triangle a, b, c meets the keep-out square. */
function triangleMeets(a, b, c) {
  if ([a, b, c].some(inKeepOut)) {
    return true;
  }
  if (crossesKeepOut(a, b) || crossesKeepOut(b, c) || crossesKeepOut(c, a)) {
    return true;
  }
  const centre = { x: MIDDLE, y: MIDDLE };
  const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const s1 = side(a, b, centre);
  const s2 = side(b, c, centre);
  const s3 = side(c, a, centre);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

/**
 * Each dot's numbers, r4's: its scattered start (`s`) and the other end of
 * its drift (`a`), its distance from the head (`far`, 0 to 1) and its own
 * random number. A start whose drift or way home would cross the head is
 * drawn again, so the cloud never covers the head.
 */
function dotsOf() {
  const random = seeded(QR.text);
  const reach = Math.hypot(MIDDLE, MIDDLE);
  return QR.dots.map(([x, y]) => {
    const home = { x: x + 0.5, y: y + 0.5 };
    let s = { x: 0, y: 0 };
    let a = { x: 0, y: 0 };
    for (let tries = 0; tries < 40; tries += 1) {
      const dx = Math.max(-x, Math.min(QR.side - 1 - x, (random() * 2 - 1) * SCATTER));
      const dy = Math.max(-y, Math.min(QR.side - 1 - y, (random() * 2 - 1) * SCATTER));
      const ax = Math.max(-x, Math.min(QR.side - 1 - x, dy * -0.5));
      const ay = Math.max(-y, Math.min(QR.side - 1 - y, dx * 0.5));
      if (!triangleMeets({ x: home.x + dx, y: home.y + dy }, { x: home.x + ax, y: home.y + ay }, home)) {
        s = { x: dx, y: dy };
        a = { x: ax, y: ay };
        break;
      }
    }
    return { x, y, s, a, far: Math.hypot(home.x - MIDDLE, home.y - MIDDLE) / reach, r: random() };
  });
}
const DOTS = dotsOf();
/** The innermost dot's distance from the head: the pour is timed from it, so the first dot moves at 0. */
const FAR_MIN = Math.min(...DOTS.map((dot) => dot.far));
/** A dot's (or an eye's) delay in the pour: inner first, the outermost at --dur-panel (280). */
const pourDelay = (far) => (Math.max(0, far - FAR_MIN) / (1 - FAR_MIN)) * D.panel;

/** A CSS `linear` or `cubic-bezier()` curve as a function of progress. */
function curve(spec) {
  if (spec === "linear") {
    return (p) => p;
  }
  const n = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(spec);
  if (!n) {
    throw new Error(`curve: ${spec} is neither linear nor cubic-bezier()`);
  }
  const [x1, y1, x2, y2] = n.slice(1).map(Number);
  const at = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  const slope = (a, b, s) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s * s;
  return (p) => {
    if (p <= 0 || p >= 1) {
      return p <= 0 ? 0 : 1;
    }
    let s = p;
    for (let i = 0; i < 8; i += 1) {
      const d = slope(x1, x2, s);
      if (Math.abs(d) < 1e-6) {
        break;
      }
      s -= (at(x1, x2, s) - p) / d;
    }
    if (Math.abs(at(x1, x2, s) - p) > 1e-5 || s < 0 || s > 1) {
      let lo = 0;
      let hi = 1;
      s = p;
      for (let i = 0; i < 40; i += 1) {
        if (at(x1, x2, s) < p) {
          lo = s;
        } else {
          hi = s;
        }
        s = (lo + hi) / 2;
      }
    }
    return at(y1, y2, s);
  };
}
const curves = new Map();
const curveOf = (spec) => {
  if (!curves.has(spec)) {
    curves.set(spec, curve(spec));
  }
  return curves.get(spec);
};

/**
 * One dot's track on Web Animations' timing model: `delay`, `duration`,
 * `iterations`, `alternate`; `ch` maps a channel (x and y in modules from
 * its module, s its scale, o its opacity) to its curve and keyframes.
 */
const track = (timing, ch) => ({ iterations: 1, alternate: false, ...timing, ch });
const kf = (offset, value, ease = "linear") => [offset, value, curveOf(ease)];
const REST = { x: 0, y: 0, s: 1, o: 1 };

/** Where a track has its dot at `time` (ms on its clock). */
function trackAt(tr, time) {
  const local = time - tr.delay;
  let p = 0;
  if (local > 0) {
    const iteration = Math.min(Math.floor(local / tr.duration), tr.iterations - 1);
    p = Math.min(1, (local - iteration * tr.duration) / tr.duration);
    if (tr.alternate && iteration % 2 === 1) {
      p = 1 - p;
    }
  }
  const out = { ...REST };
  for (const [name, { ease, frames }] of Object.entries(tr.ch)) {
    const q = ease(p);
    let i = 0;
    while (i < frames.length - 2 && q > frames[i + 1][0]) {
      i += 1;
    }
    const [o0, v0, step] = frames[i];
    const [o1, v1] = frames[i + 1];
    out[name] = v0 + (v1 - v0) * step(o1 === o0 ? 1 : (q - o0) / (o1 - o0));
  }
  return out;
}

/** r4's cloud: each dot drifting between its two scattered places once a breath, on its own beat. */
const driftTracks = () =>
  DOTS.map((dot) =>
    track(
      { delay: -dot.r * D.breath, duration: D.breath, iterations: Number.POSITIVE_INFINITY, alternate: true },
      {
        x: { ease: curveOf(E["in-out"]), frames: [kf(0, dot.s.x), kf(1, dot.a.x)] },
        y: { ease: curveOf(E["in-out"]), frames: [kf(0, dot.s.y), kf(1, dot.a.y)] },
      }
    )
  );

/* -------------------------------------------------------------- state */

const settings = { hub: "auto", ticks: true };
/** The one stage. */
let S = null;
let last = "waiting";

/* ------------------------------------------------------------- build */

function build() {
  const stage = document.querySelector(".stage");
  const $ = (sel) => stage.querySelector(sel);
  S = {
    frame: document.querySelector(".frame"),
    stage,
    object: $(".object"),
    slot: $(".slot"),
    ping: $(".ping"),
    paper: $(".paper"),
    code: $(".code"),
    dotsCanvas: $(".code .dots"),
    eyesSvg: $(".code .eyes"),
    eyes: [],
    device: $(".device"),
    strokes: [],
    screen: $(".screen"),
    iconSpot: $(".icon-spot"),
    screenLetters: $(".screen-letters"),
    screenGlyphs: [],
    screenMark: $(".screen-mark"),
    screenMarks: {},
    head: $(".head"),
    faceOpen: null,
    faceShut: null,
    runRow: $(".run-row"),
    run: $(".run"),
    runGlyphs: [],
    strike: $(".run .strike"),
    words: $(".words"),
    titleEl: $(".title"),
    title: new TextMorph($(".title")),
    line1: $('[data-line="1"]'),
    line2: $('[data-line="2"]'),
    markCell: $('[data-line="1"] .mark-cell'),
    lineMarks: {},
    line1Text: $('[data-line="1"] .text'),
    figure: $('[data-line="1"] .figure'),
    line2Text: $('[data-line="2"] .text'),
    lines: $(".lines"),
    facts: $(".facts"),
    name: $(".facts .name"),
    kind: $(".facts .kind"),
    addr: $(".facts .addr"),
    alias: $(".facts .alias"),
    whenEl: $(".facts .when"),
    when: new TextSwap($(".facts .when .text")),
    after: $(".after"),
    acts: $(".acts"),
    btn: {
      ghost: $('[data-slot="ghost"]'),
      second: $('[data-slot="second"]'),
      primary: $('[data-slot="primary"]'),
    },
    moment: "open",
    runs: [],
    timers: [],
    pingRun: null,
    pingTail: null,
    dotRun: null,
    dotsDrawn: null,
    dotsAlpha: 1,
    recordIn: true,
    figure0: "0:42",
  };
  S.primaryText = new TextMorph(S.btn.primary);

  // The head: Caw's app icon, its open face and its shut face in one cell.
  for (const [cls, src] of [
    ["face face-open", badgeOpen],
    ["face face-shut", badgeShut],
  ]) {
    const img = document.createElement("img");
    img.className = cls;
    img.alt = "";
    img.src = src;
    S.head.append(img);
  }
  S.faceOpen = $(".face-open");
  S.faceShut = $(".face-shut");

  // The finder eyes: a rounded ring round a dot (r4).
  S.eyesSvg.setAttribute("viewBox", `0 0 ${QR.side} ${QR.side}`);
  for (const [ex, ey] of QR.eyes) {
    const g = svgEl("g", { class: "eye" });
    g.append(
      svgEl("rect", {
        x: ex + 0.5,
        y: ey + 0.5,
        width: 6,
        height: 6,
        rx: 1.9,
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1,
      }),
      svgEl("circle", { cx: ex + 3.5, cy: ey + 3.5, r: 1.5, fill: "currentColor" })
    );
    g.dataset.cx = String(ex + 3.5);
    g.dataset.cy = String(ey + 3.5);
    S.eyesSvg.append(g);
    S.eyes.push(g);
  }

  // The device's wire: nine strokes, each drawn by its own length (pathLength 1).
  for (const d of STROKES) {
    const path = svgEl("path", { d, pathLength: 1 });
    S.device.append(path);
    S.strokes.push(path);
  }

  // The letter run (two groups of three) and the screen's two rows.
  S.run.setAttribute("aria-label", `Code ${CODE.slice(0, 3)} ${CODE.slice(3)}`);
  for (const half of [CODE.slice(0, 3), CODE.slice(3)]) {
    const group = document.createElement("span");
    group.className = "group";
    group.setAttribute("aria-hidden", "true");
    const row = document.createElement("span");
    row.className = "row";
    for (const letter of half) {
      const g = document.createElement("span");
      g.className = "g";
      g.textContent = letter;
      group.append(g);
      S.runGlyphs.push(g);
      const sg = g.cloneNode(true);
      row.append(sg);
      S.screenGlyphs.push(sg);
    }
    S.strike.before(group);
    S.screenLetters.append(row);
  }

  // The marks: the line's (16px, 1.5 pen) and the screen's (wire / 4, stroke 0.5: the same 1.5px pen).
  const live = document.createElement("span");
  live.className = "live";
  S.lineMarks.live = live;
  S.markCell.append(live);
  for (const name of ["clock", "warn", "question"]) {
    S.lineMarks[name] = markSvg(name, 1.5);
    S.markCell.append(S.lineMarks[name]);
  }
  for (const name of ["check", "lock", "unlink"]) {
    S.screenMarks[name] = markSvg(name, 0.5);
    S.screenMark.append(S.screenMarks[name]);
  }

  // Every act plays the flow on from where it stands.
  for (const button of Object.values(S.btn)) {
    button.addEventListener("click", (event) => {
      const to = {
        deny: "denied",
        approve: "approved",
        again: "asking",
        retry: "retrying",
        remove: "removed",
        done: null,
      }[event.currentTarget.dataset.act];
      if (to) {
        play(S.moment, to);
      }
    });
  }
}

/**
 * The strike through the caps' middle (not the line box's): the run's
 * baseline in its line box, from its face's metrics, less half a capital's
 * height, read off the face itself.
 */
function placeStrike() {
  const cs = getComputedStyle(S.run);
  const pen = document.createElement("canvas").getContext("2d");
  pen.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const face = pen.measureText(CODE);
  const cap = pen.measureText("H").actualBoundingBoxAscent;
  const size = Number.parseFloat(cs.fontSize);
  const line = Number.parseFloat(cs.lineHeight);
  const baseline = (line - (face.fontBoundingBoxAscent + face.fontBoundingBoxDescent)) / 2 + face.fontBoundingBoxAscent;
  // In em, so it follows the run's fluid size; the pen's own half in px.
  const middle = (baseline - cap / 2) / size;
  S.strike.style.insetBlockStart = `calc(${middle.toFixed(4)}em - ${Number.parseFloat(getComputedStyle(S.strike).blockSize) / 2}px)`;
}

/** Puts the frame's sizes on the window's width: Desk at 900px and wider, Phone under it. */
function applyLayout() {
  const layout = deskQuery.matches ? "desk" : "phone";
  S.frame.dataset.layout = layout;
  S.layout = layout;
  S.m = layout === "desk" ? 10 : 9;
  caw.size = layout === "desk" ? 128 : 96;
  placeDots();
  placeStrike();
}

/* ------------------------------------------------------- the dots */

function dotsNow() {
  const run = S.dotRun;
  if (!run) {
    return DOTS.map(() => REST);
  }
  const time = Number(run.clock.currentTime ?? 0);
  return run.tracks.map((tr) => (tr ? trackAt(tr, time) : REST));
}

/** Plays `tracks` on the dots: one clock as long as the longest (a Web Animation that draws nothing). */
function playDots(tracks, id) {
  stopDrift();
  // The clock starts as its first dot does; its time still counts from the board's trigger.
  const start = Math.max(0, Math.min(...tracks.map((tr) => tr.delay)));
  const end = Math.max(...tracks.map((tr) => tr.delay + tr.duration * tr.iterations));
  const clock = part(S.dotsCanvas, [{ opacity: 1 }, { opacity: 1 }], {
    delay: start,
    duration: Math.max(end - start, 1),
    easing: "linear",
    id,
  });
  S.dotRun = { clock, tracks, loop: false };
  drawSoon();
  return clock;
}

/** The cloud drifting, its clock a loop from `from` ms on it. */
function startDrift(from = 0) {
  stopDrift();
  const clock = S.dotsCanvas.animate([{ opacity: 1 }, { opacity: 1 }], {
    duration: D.breath,
    iterations: Number.POSITIVE_INFINITY,
    id: "drift",
  });
  clock.currentTime = from;
  S.dotRun = { clock, tracks: driftTracks(), loop: true, from };
  drawSoon();
}

function stopDrift() {
  if (S.dotRun?.loop) {
    S.dotRun.clock.cancel();
    S.dotRun = null;
    drawSoon();
  }
}

/** The cloud stopped where it stands: tracks read at one held time, drawn once. */
const heldAt = (tracks, time) => ({
  clock: { currentTime: time, playState: "finished" },
  tracks,
  loop: false,
  held: true,
});

/** The dots' canvas covers the code at the screen's pixel density. */
function placeDots() {
  const c = S.dotsCanvas;
  const dpr = window.devicePixelRatio || 1;
  const side = S.m * QR.side;
  c.width = Math.ceil(side * dpr);
  c.height = Math.ceil(side * dpr);
  S.dpr = dpr;
  S.dotsInk = getComputedStyle(S.code).color;
  S.dotsDrawn = null;
  drawSoon();
}

/** Draws the dots where they are now. */
function drawDots() {
  const pen = S.dotsCanvas.getContext("2d");
  const { dpr } = S;
  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.clearRect(0, 0, S.dotsCanvas.width, S.dotsCanvas.height);
  pen.setTransform(dpr, 0, 0, dpr, 0, 0);
  pen.fillStyle = S.dotsInk;
  const r = DOT_R * S.m;
  const now = dotsNow();
  const alpha = S.dotRun ? 1 : S.dotsAlpha;
  now.forEach((p, i) => {
    const o = p.o * alpha;
    if (o > 0 && p.s > 0) {
      pen.globalAlpha = o;
      pen.beginPath();
      pen.arc((DOTS[i].x + 0.5 + p.x) * S.m, (DOTS[i].y + 0.5 + p.y) * S.m, r * p.s, 0, 2 * Math.PI);
      pen.fill();
    }
  });
  pen.globalAlpha = 1;
}

let drawing = 0;
/** Draws the dots once they moved, each frame while a dot clock runs. */
function drawSoon() {
  drawing ||= requestAnimationFrame(() => {
    drawing = 0;
    if (!S?.dpr) {
      return;
    }
    const run = S.dotRun;
    const key = run ? `${run.clock.currentTime}|${S.m}` : `rest|${S.dotsAlpha}|${S.m}`;
    if (key !== S.dotsDrawn) {
      drawDots();
      S.dotsDrawn = key;
    }
    if (run && run.clock.playState !== "finished") {
      drawSoon();
    }
  });
}

/* --------------------------------------------------------- the parts */

/** One part's animation: its last keyframe the resting style under it, held (fill both) until the next play. */
function part(el, keyframes, { duration, easing = "linear", delay = 0, fill = "both", id = "part", composite }) {
  const anim = el.animate(keyframes, { duration, easing, delay, fill, composite, id });
  S.runs.push(anim);
  return anim;
}

/** A cue: a run that draws nothing and calls `fn` at `at`, on the page's one clock. */
function cue(at, fn, what) {
  const anim = part(S.stage, [{ visibility: "visible" }, { visibility: "visible" }], {
    duration: Math.max(at, 1),
    fill: "none",
    id: `cue:${what}`,
  });
  anim.finished.then(fn, () => undefined);
  return anim;
}

const SHOWN = { opacity: 1, transform: "none", filter: "blur(0px)" };
const popFrom = () => ({ opacity: 0, transform: `scale(${V["pop-scale"]})`, filter: "blur(2px)" });
/** An arrival (§7): --dur-pop on --ease-out from scale 0.92 with a 2px blur. */
const pop = (el, at, id = "pop") => part(el, [popFrom(), SHOWN], { delay: at, duration: D.pop, easing: E.out, id });
/** An exit (§7): --dur-exit on --ease-crossfade, up 4px, a 2px blur, a fade. */
const exit = (el, at, id = "exit", duration = D.exit) =>
  part(el, [SHOWN, { opacity: 0, transform: `translateY(-${V.lift})`, filter: "blur(2px)" }], {
    delay: at,
    duration,
    easing: E.crossfade,
    id,
  });
/** transitions.dev "Icon swap" (from 0.92, 2px blur, --dur-control): in and out. */
const iconIn = (el, at, id = "icon") =>
  part(el, [{ opacity: 0, transform: "scale(0.92)", filter: "blur(2px)" }, SHOWN], {
    delay: at,
    duration: D.control,
    easing: E.out,
    id,
  });
const iconOut = (el, at, id = "icon") =>
  part(el, [SHOWN, { opacity: 0, transform: "scale(0.92)", filter: "blur(2px)" }], {
    delay: at,
    duration: D.control,
    easing: E.out,
    id,
  });
/** transitions.dev "Text states swap", the new side: in from below with a 2px blur. */
const swapIn = (el, at, duration, id = "swap") =>
  part(el, [{ opacity: 0, transform: `translateY(${V.lift})`, filter: "blur(2px)" }, SHOWN], {
    delay: at,
    duration,
    easing: E.crossfade,
    id,
  });
/** transitions.dev "Texts reveal": rows rising in, 40ms apart, the beat `total` long. */
function reveal(els, at, total, id = "reveal") {
  const each = total - (els.length - 1) * 40;
  els.forEach((el, i) => {
    part(el, [{ opacity: 0, transform: `translateY(${V.rise})`, filter: "blur(2px)" }, SHOWN], {
      delay: at + i * 40,
      duration: each,
      easing: E.out,
      id,
    });
  });
}

/** An element that left the rest of the moment stays drawn until its last run ends, then goes. */
function linger(el, anim, gone) {
  anim.finished.then(gone, () => undefined);
}

/* ------------------------------------------------------- resting */

/** Where the head rests: on the code's centre, or on the screen's icon spot; in the slot's px. */
function headRect(where) {
  if (where === "code") {
    const side = QR.logo * S.m;
    const at = (S.m * (QR.side + 2) - side) / 2;
    return { x: at, y: at, w: side, h: side };
  }
  const slot = S.slot.getBoundingClientRect();
  const r = S.iconSpot.getBoundingClientRect();
  return { x: r.left - slot.left, y: r.top - slot.top, w: r.width, h: r.height };
}

function placeHead(where) {
  if (!where) {
    S.head.remove();
    return;
  }
  if (!S.head.isConnected) {
    S.slot.append(S.head);
  }
  const r = headRect(where);
  Object.assign(S.head.style, {
    insetInlineStart: `${r.x}px`,
    insetBlockStart: `${r.y}px`,
    inlineSize: `${r.w}px`,
    blockSize: `${r.h}px`,
  });
  S.faceOpen.style.opacity = "1";
  S.faceShut.style.opacity = "0";
}

/** A line's mark cell shows `mark` alone (the live dot, the clock, the warning, the question), or none. */
function setLineMark(mark) {
  S.markCell.hidden = !mark;
  S.markCell.dataset.mark = mark;
  for (const [name, el] of Object.entries(S.lineMarks)) {
    el.style.opacity = name === mark ? "1" : "0";
  }
}

function setFigure(text) {
  S.figure.replaceChildren(
    ...[...text].map((c) => {
      const d = document.createElement("span");
      d.className = "d";
      d.textContent = c;
      return d;
    })
  );
}

function fillLine(el, textHost, line) {
  el.hidden = !line;
  if (!line) {
    return;
  }
  textHost.replaceChildren(Object.assign(document.createElement("span"), { textContent: line.text }));
  if (line.tone) {
    el.dataset.tone = line.tone;
  } else {
    delete el.dataset.tone;
  }
}

/** The device's facts on `network`; `skel`: the hub's record not landed yet, each row a skeleton at its size. */
function fillFacts(network, skel) {
  const net = NETWORK[network];
  const value = (p, ...content) => {
    const v = document.createElement("span");
    v.className = "v";
    v.append(...content);
    p.replaceChildren(v);
    if (skel) {
      p.dataset.skel = "";
      const bar = document.createElement("span");
      bar.className = "skel";
      bar.setAttribute("aria-hidden", "true");
      p.append(bar);
    } else {
      delete p.dataset.skel;
    }
  };
  value(S.name, DEVICE.name);
  value(S.kind, DEVICE.kind);
  S.addr.hidden = !net;
  S.alias.hidden = !net;
  if (net) {
    value(S.addr, Object.assign(document.createElement("code"), { textContent: net.addr }), ` · ${net.tag}`);
    value(S.alias, net.alias);
  }
}

function fillActs(acts) {
  for (const [slot, b] of Object.entries(S.btn)) {
    const act = acts[slot];
    b.hidden = !act;
    b.disabled = false;
    if (!act) {
      continue;
    }
    if (slot === "primary") {
      S.primaryText.put(act.label);
    } else {
      b.textContent = act.label;
    }
    b.dataset.act = act.act;
    if (act.tone) {
      b.dataset.tone = act.tone;
    } else {
      delete b.dataset.tone;
    }
  }
}

function clearTimers() {
  for (const timer of S.timers) {
    clearInterval(timer);
  }
  S.timers = [];
}

/** The clock's seconds: the last minute's countdown, how long ago the phone asked. */
function tick(m) {
  if (!settings.ticks) {
    return;
  }
  if (m === "lastminute") {
    let left = Number(S.figure.textContent.split(":")[1]);
    S.timers.push(
      setInterval(() => {
        left = left > 1 ? left - 1 : 59;
        tickFigure(`0:${String(left).padStart(2, "0")}`);
      }, 1000)
    );
  }
  if (m.startsWith("checking")) {
    let ago = 8;
    S.timers.push(
      setInterval(() => {
        ago += 1;
        S.when.put(`asked ${ago}s ago`);
      }, 1000)
    );
  }
}

/** transitions.dev "Number pop-in": the digits that changed re-enter, over --dur-control. */
function tickFigure(text, at = 0, id = "digit", into = S.figure) {
  const was = into.textContent;
  if (into === S.figure) {
    setFigure(text);
  } else {
    into.replaceChildren(
      ...[...text].map((c) => Object.assign(document.createElement("span"), { className: "d", textContent: c }))
    );
  }
  [...into.children].forEach((d, i) => {
    if (was[i] !== text[i]) {
      const run = d.animate(
        [{ opacity: 0, transform: `translateY(${V.digit})`, filter: "blur(2px)" }, SHOWN],
        { delay: at, duration: D.control, easing: E.out, fill: "both", id }
      );
      if (at > 0 || id.startsWith("lead")) {
        S.runs.push(run);
      }
    }
  });
}

/**
 * Puts the surface in moment `m`'s resting state at once. Caw is left to
 * the caller: a board changes him on its cues, a jump mounts him afresh.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one resting state, set part by part in the surface's order
function rest(m, { keepPing = false, keepTail = false, recordIn = true } = {}) {
  for (const run of S.runs) {
    run.cancel();
  }
  S.runs = [];
  for (const ghost of S.stage.querySelectorAll(".leaving")) {
    ghost.remove();
  }
  clearTimers();
  if (!keepPing) {
    stopPing({ tail: !keepTail });
  }
  const R = restOf(m);
  S.moment = m;
  S.rest = R;
  S.stage.dataset.kind = R.kind;
  S.stage.dataset.moment = m;

  // The object slot: the paper and its code, or the device.
  S.paper.hidden = R.kind !== "code";
  S.code.style.opacity = R.code === "cloud" || R.code === "held" ? String(V["qr-dim-opacity"]) : "1";
  S.dotsAlpha = R.code === "dim" ? V["qr-dim-opacity"] : 1;
  for (const eye of S.eyes) {
    eye.style.opacity = R.code === "live" ? "1" : R.code === "dim" ? String(V["qr-dim-opacity"]) : "0";
  }
  if (R.code === "cloud") {
    if (!S.dotRun?.loop) {
      startDrift(S.heldTime ?? 0);
    }
  } else {
    stopDrift();
    S.dotRun = R.code === "held" ? heldAt(driftTracks(), S.heldTime ?? D.breath * 0.1) : null;
  }
  S.dotsDrawn = null;
  drawSoon();

  S.device.toggleAttribute("hidden", R.kind !== "device");
  S.device.style.opacity = R.wireDim ? "0.5" : "1";
  S.screenLetters.style.opacity = R.screen.letters ? "1" : "0";
  for (const [name, el] of Object.entries(S.screenMarks)) {
    el.toggleAttribute("hidden", name !== R.screen.mark);
  }
  placeHead(R.head);

  S.run.style.opacity = R.run ? "1" : "0";
  S.strike.style.transform = R.run === "struck" ? "none" : "scaleX(0)";
  S.ping.toggleAttribute("data-warm", R.ping === "warm");

  // The words.
  S.title.put(R.title);
  S.titleEl.hidden = !R.title;
  fillLine(S.line1, S.line1Text, R.line1);
  setLineMark(R.line1?.mark ?? "");
  S.figure.hidden = !R.line1?.figure;
  S.line1.toggleAttribute("data-figure", Boolean(R.line1?.figure));
  if (R.line1?.figure) {
    setFigure(S.figure0);
  }
  fillLine(S.line2, S.line2Text, R.line2);
  S.lines.hidden = !(R.line1 || R.line2);
  S.facts.hidden = !R.facts;
  S.recordIn = recordIn;
  if (R.facts) {
    fillFacts(netOf(m), !recordIn);
  }
  S.when.put(R.when);
  S.whenEl.hidden = !R.when;
  S.after.textContent = R.after;
  S.after.hidden = !R.after;
  // The acts take their new words and tone at once: no colour eases under an act that is not drawn yet.
  S.acts.classList.add("still");
  fillActs(R.acts);
  for (const b of Object.values(S.btn)) {
    getComputedStyle(b).backgroundColor;
  }
  S.acts.classList.remove("still");
  if (!recordIn) {
    for (const b of Object.values(S.btn)) {
      b.disabled = true;
    }
  }
  S.acts.hidden = Object.keys(R.acts).length === 0;

  if (R.ping && !keepPing) {
    startPing();
  }
  tick(m);
}

/* ------------------------------------------------------------ the ping */

/**
 * The ping: one 2px ring leaving the paper's edge once a breath, growing
 * --qr-ping-reach past it while fading 0.7 → 0, each ring on the breath's
 * clock (its next multiple at or after `after` ms from now).
 */
function startPing(after = 0) {
  stopPing();
  const now = performance.timeOrigin + performance.now();
  const at = Math.ceil((now + after) / D.breath) * D.breath;
  const side = S.m * (QR.side + 2);
  const grow = `scale(${((side + 2 * V["qr-ping-reach"]) / side).toFixed(4)})`;
  S.pingRun = S.ping.animate(
    [
      { opacity: V["qr-ping-opacity"], transform: "none" },
      { opacity: 0, transform: grow },
    ],
    { duration: D.breath, easing: E.out, delay: at - now, iterations: Number.POSITIVE_INFINITY, id: "ping" }
  );
}

/** The ring in flight finishes its lap; none follows. */
function finishPing() {
  const flying = S.pingRun;
  if (!flying) {
    return;
  }
  const { currentIteration } = flying.effect.getComputedTiming();
  if (currentIteration === null || currentIteration === undefined) {
    flying.cancel();
  } else {
    flying.effect.updateTiming({ iterations: currentIteration + 1 });
    S.pingTail = flying;
  }
  S.pingRun = null;
}

function stopPing({ tail = false } = {}) {
  S.pingRun?.cancel();
  S.pingRun = null;
  if (tail) {
    S.pingTail?.cancel();
    S.pingTail = null;
  }
}

/** Ms from now to the breath's next multiple at or after `after` ms. */
function toBreath(after) {
  const now = performance.timeOrigin + performance.now();
  return Math.ceil((now + after) / D.breath) * D.breath - now;
}

/* ------------------------------------------------------- Caw */

/** Caw shows `status`; `fresh` mounts him anew (a jump), else his component leaves and the new file comes in. */
function setCaw({ status, still = false }, { fresh = false } = {}) {
  caw.status = status;
  caw.still = still;
  if (fresh) {
    caw.present = true;
    caw.key += 1;
  }
}

/* ---------------------------------------------------- the words engine */

/** The words column's parts a board compares, by name. */
const WORD_PARTS = ["line1", "line2", "name", "kind", "addr", "alias", "after", "ghost", "second", "primary"];
const wordEl = (k) => (k === "when" ? S.whenEl : (S.btn[k] ?? S[k]));
const shownNow = (el) => !el.hidden && !el.closest("[hidden]") && el.isConnected;
const keyOf = (el) =>
  `${el.textContent}|${el.dataset.tone ?? ""}|${el.dataset.act ?? ""}|${el.querySelector?.(".mark-cell:not([hidden])") ? S.markCell.dataset.mark ?? "" : ""}`;

/** What each part of the words column shows now, and where (in the column's px). */
function readWords() {
  const box = S.words.getBoundingClientRect();
  const out = {};
  for (const k of WORD_PARTS) {
    const el = wordEl(k);
    const shown = shownNow(el);
    const r = shown ? el.getBoundingClientRect() : null;
    out[k] = {
      shown,
      key: shown ? keyOf(el) : "",
      rect: r ? { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height } : null,
      copy: shown ? el.cloneNode(true) : null,
    };
  }
  for (const k of ["title", "when"]) {
    const el = k === "title" ? S.titleEl : S.whenEl;
    const shown = shownNow(el);
    const r = shown ? el.getBoundingClientRect() : null;
    out[k] = {
      shown,
      text: el.textContent,
      rect: r ? { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height } : null,
      copy: shown ? el.cloneNode(true) : null,
    };
  }
  return out;
}

/** A copy of what left, drawn where it stood until its exit ends. */
function ghostOf(was) {
  const copy = was.copy;
  copy.classList.add("leaving");
  copy.inert = true;
  copy.removeAttribute("aria-live");
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, {
    position: "absolute",
    insetInlineStart: `${was.rect.x}px`,
    insetBlockStart: `${was.rect.y}px`,
    inlineSize: `${was.rect.w}px`,
    blockSize: `${was.rect.h}px`,
    margin: "0",
    pointerEvents: "none",
  });
  S.words.append(copy);
  return copy;
}

/**
 * The words column played from `before` to where it rests now, by the
 * board's `w`: `exits` (what leaves, as a copy where it stood, at its time;
 * `out` for any other), `enters` ([time, how] for what comes in), the
 * title's morph and the time row's swap, the primary act's words morphing
 * in place (`morph`), and `follow`, when what stays slides to its new place.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every part of the column compared, each said where it is decided
function playWords(before, w) {
  const jobs = [];
  const now = readWords();
  for (const k of WORD_PARTS) {
    const b = before[k];
    const a = now[k];
    const el = wordEl(k);
    const same = b.shown && a.shown && b.key === a.key;
    if (k === "primary" && w.morph !== undefined && b.shown && a.shown) {
      continue;
    }
    if (b.shown && !same) {
      const ghost = ghostOf(b);
      const anim = exit(ghost, w.exits?.[k] ?? w.out ?? 0, w.exitIds?.[k] ?? (w.exits?.[k] === 0 ? "lead:exit" : "exit"));
      linger(ghost, anim, () => ghost.remove());
    }
    if (a.shown && !same && !w.reveal?.keys.includes(k)) {
      const listed = w.enters?.[k];
      const [at, how, dur] = listed ?? [w.in ?? 0, "pop"];
      // Only an arrival the board names at 0 is its lead's; any other at 0 is a fault the proof names.
      const id = listed && at === 0 ? "lead:enter" : "enter";
      if (how === "pop") {
        pop(el, at, id);
      } else if (how === "swap") {
        swapIn(el, at, dur ?? D.pop, id);
      } else if (how === "marked") {
        iconIn(S.markCell, at, id);
        swapIn(S.line1Text, at + D.control, D.pop, "enter");
      }
    }
  }
  if (w.reveal) {
    const els = w.reveal.keys.map(wordEl).filter((el) => shownNow(el));
    reveal(els, w.reveal.at, w.reveal.total);
  }
  // The title: in by a pop where none stood, else its morph.
  if (!before.title.shown && now.title.shown) {
    pop(S.titleEl, w.title ?? 0, w.title === 0 ? "lead:title" : "title");
  } else if (before.title.shown && now.title.shown && before.title.text !== S.title.text) {
    const next = S.title.text;
    S.title.put(before.title.text);
    jobs.push(S.title.prepare(next, { morph: D.morph, resize: D.pop, easing: E.out, delay: w.title, id: "title" }));
  }
  // The time row: Text states swap in place.
  if (before.when.shown && now.when.shown && before.when.text !== S.when.text) {
    const next = S.when.text;
    S.when.put(before.when.text);
    jobs.push(
      S.when.prepare(next, {
        delay: w.when?.[0] ?? 0,
        duration: w.when?.[1] ?? D.exit,
        easing: E.crossfade,
        lift: V.lift,
        id: "when",
      })
    );
  } else if (!before.when.shown && now.when.shown && !w.reveal?.keys.includes("when")) {
    pop(S.whenEl, w.in ?? 0, "enter");
  } else if (before.when.shown && !now.when.shown) {
    const ghost = ghostOf(before.when);
    linger(ghost, exit(ghost, w.out ?? 0), () => ghost.remove());
  }
  if (w.morph !== undefined && before.primary.shown && now.primary.shown) {
    const next = S.primaryText.text;
    S.primaryText.put(before.primary.copy.textContent.trim());
    jobs.push(S.primaryText.prepare(next, { morph: D.morph, resize: D.pop, easing: E.out, delay: w.morph, id: "lead:morph" }));
  }
  for (const job of jobs) {
    if (job) {
      job.lay();
    }
  }
  for (const job of jobs) {
    if (job) {
      job.measure();
    }
  }
  for (const job of jobs) {
    if (job) {
      S.runs.push(...job.start());
    }
  }
  // What stays slides from where it stood to its new place (FLIP), at `follow`.
  const after = readWords();
  for (const k of [...WORD_PARTS, "when"]) {
    const b = before[k];
    const a = after[k];
    const el = k === "when" ? S.whenEl : wordEl(k);
    const kept = k === "when" ? b.shown && a.shown : b.shown && a.shown && (b.key === a.key || (k === "primary" && w.morph !== undefined));
    if (!(kept && b.rect && a.rect)) {
      continue;
    }
    const dx = b.rect.x - a.rect.x;
    const dy = b.rect.y - a.rect.y;
    const dw = Math.abs(b.rect.w - a.rect.w) > 0.5 && k === "primary";
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || dw) {
      const from = { transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)` };
      const to = { transform: "none" };
      if (dw) {
        Object.assign(from, { flexGrow: 0, flexShrink: 0, flexBasis: `${b.rect.w}px` });
        Object.assign(to, { flexGrow: 0, flexShrink: 0, flexBasis: `${a.rect.w}px` });
      }
      part(el, [from, to], { delay: w.follow ?? D.exit, duration: D.panel, easing: E.out, id: "follow" });
    }
  }
}

/* ----------------------------------------------------- the boards */

/**
 * Each board (spec §7), named `from>to`: its words (`w`, for playWords) and
 * its object column (`object`, given what the surface showed as it began).
 * Times are the spec's, ms after the trigger.
 */
const BOARDS = {
  // Asking: the page opens. LEAD Caw arrives by his loading file's enter.
  "open>asking": {
    w: { title: 520, enters: { line1: [580, "pop"] } },
    object() {
      setCaw({ status: "loading" }, { fresh: true });
      pop(S.paper, 200, "paper");
      fadeCloudIn(260);
      pop(S.head, 460, "head");
    },
  },
  // The code arrives. LEAD the dots lock on, ink 0.3 → 1.
  "asking>waiting": {
    w: { exits: { line1: 700 } },
    object(was) {
      const from = was.dots;
      playDots(
        DOTS.map((dot, i) =>
          track(
            { delay: dot.r * D.control, duration: D.settle },
            {
              x: { ease: curveOf(E.out), frames: [kf(0, from[i].x), kf(1, 0)] },
              y: { ease: curveOf(E.out), frames: [kf(0, from[i].y), kf(1, 0)] },
            }
          )
        ),
        "lead:dots"
      );
      part(S.code, [{ opacity: V["qr-dim-opacity"] }, { opacity: 1 }], {
        duration: D.settle,
        easing: E.out,
        id: "lead:ink",
      });
      for (const eye of S.eyes) {
        pop(eye, D.control, "eyes");
      }
      // The letters type in: six glyphs, a pop each, 28ms apart, a step's gap between the groups.
      [0, 1, 2, 4, 5, 6].forEach((step, i) => pop(S.runGlyphs[i], 700 + step * 28, "letters"));
      cue(700, () => setCaw({ status: "ready" }), "caw");
      startPing(1200);
    },
  },
  // LEAD "Expires in 0:59" enters; the ping warms with it.
  "waiting>lastminute": {
    keepPing: true,
    before() {
      S.figure0 = "0:59";
    },
    w: { enters: { line1: [0, "swap", D.pop] } },
    object(was) {
      const warm = getComputedStyle(S.ping).borderColor;
      part(S.ping, [{ borderColor: was.pingInk }, { borderColor: warm }], {
        duration: D.fade,
        easing: E.out,
        id: "lead:warm",
      });
    },
  },
  // The scan. LEAD the pour: each dot into the head, inner first; the eyes last.
  "waiting>checking": {
    recordIn: false,
    w: {
      title: 1440,
      reveal: { at: 1500, total: 360, keys: ["line1", "name", "kind", "addr", "alias", "when"] },
      enters: { second: [1740, "pop"], primary: [1740, "pop"] },
    },
    object(was) {
      finishPing();
      const pour = curveOf(E.crossfade);
      playDots(
        DOTS.map((dot) =>
          track(
            { delay: pourDelay(dot.far), duration: D.pop },
            {
              x: { ease: pour, frames: [kf(0, 0), kf(1, MIDDLE - (dot.x + 0.5))] },
              y: { ease: pour, frames: [kf(0, 0), kf(1, MIDDLE - (dot.y + 0.5))] },
              s: { ease: pour, frames: [kf(0, 1), kf(1, V["pop-scale"])] },
              o: { ease: pour, frames: [kf(0, 1), kf(1, 0)] },
            }
          )
        ),
        "lead:pour"
      );
      for (const eye of S.eyes) {
        const into = { x: MIDDLE - Number(eye.dataset.cx), y: MIDDLE - Number(eye.dataset.cy) };
        const far = Math.hypot(into.x, into.y) / Math.hypot(MIDDLE, MIDDLE);
        part(
          eye,
          [
            { transform: "none", opacity: 1 },
            { transform: `translate(${into.x}px, ${into.y}px) scale(${V["pop-scale"]})`, opacity: 0 },
          ],
          { duration: D.pop, easing: E.crossfade, delay: pourDelay(far), id: pourDelay(far) < 1 ? "lead:eyes" : "pour" }
        );
      }
      // The head pulses as the last of the code pours in, then holds it alone on the paper.
      const grow = V["qr-pulse-scale"];
      const shift = ((1 - grow) / 2) * was.head.w;
      part(
        S.head,
        [
          { transform: "translate(0px, 0px) scale(1)" },
          { transform: `translate(${shift}px, ${shift}px) scale(${grow})`, offset: 0.5 },
          { transform: "translate(0px, 0px) scale(1)" },
        ],
        { delay: 280, duration: D.pop, easing: E.out, composite: "add", id: "pulse" }
      );
      // ONE OBJECT: the head glides to the screen's top, shrinking to the icon (FLIP).
      flip(S.head, was.head, headRect("device"), 840, D.settle, E.drawer, "head");
      // The letter run follows 60ms later onto the screen under it, landing at the screen's size.
      S.runGlyphs.forEach((g, i) => {
        flipGlyph(S.screenGlyphs[i], was.glyphs[i], 900, D.settle, E.drawer);
      });
      // The run's row empties with the letters' travel and folds away on the same clock; the phone's words ride up with it.
      part(S.runRow, [{ blockSize: `${was.runRow}px` }, { blockSize: "0px" }], {
        delay: 840,
        duration: D.settle,
        easing: E.out,
        id: "run-row",
      });
      // The phone's outline draws itself round them.
      for (const path of S.strokes) {
        part(path, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
          delay: 840,
          duration: D.settle,
          easing: E.out,
          id: "outline",
        });
      }
      // The paper fades beneath.
      S.paper.hidden = false;
      linger(
        S.paper,
        part(S.paper, [{ opacity: 1 }, { opacity: 0 }], { delay: 900, duration: D.pop, easing: E.crossfade, id: "paper" }),
        () => {
          if (S.rest.kind !== "code") {
            S.paper.hidden = true;
          }
        }
      );
      cue(1240, () => setCaw({ status: "needs-you" }), "caw");
      if (settings.hub === "auto") {
        cue(2260, () => landRecord(), "record");
      }
    },
  },
  // Approve. LEAD the press; Deny exits; Approve's words morph to "Done" in place.
  "checking>approved": {
    w: {
      // The hint is about a decision already made: it leaves with Deny; what stays moves up into its place in the hold.
      exits: { second: 0, line1: 0 },
      morph: 0,
      title: 960,
      when: [1420, 210],
      enters: { after: [1480, "pop"], ghost: [1480, "pop"] },
      follow: 160,
    },
    object() {
      lingerScreenLetters(400);
      headGives(560, "check");
      cue(560, () => setCaw({ status: "done" }), "caw");
      cue(560 + D.fade + DONE_ONCE, () => setCaw({ status: "ready" }), "caw-rest");
    },
  },
  // Deny. LEAD the press; Deny exits, Approve 60ms later.
  "checking>denied": {
    w: {
      exits: { second: 0, primary: 60, line1: 0 },
      exitIds: { primary: "lead:exit" },
      title: 700,
      when: [960, 180],
      reveal: { at: 960, total: 360, keys: ["line1", "line2"] },
      enters: { primary: [1400, "pop"] },
      follow: 960,
    },
    object() {
      lingerScreenLetters(400);
      headGives(560, "lock");
      part(S.device, [{ opacity: 1 }, { opacity: 0.5 }], { delay: 560, duration: D.settle, easing: E.out, id: "dim" });
      cue(560, () => setCaw({ status: "ready" }), "caw");
    },
  },
  // LEAD the figure ticks 0:01 → 0:00; the ring in flight finishes its lap.
  "lastminute>expired": {
    before() {
      S.figure0 = "0:01";
    },
    w: {
      exits: { line1: 1000 },
      exitIds: { line1: "exit" },
      enters: { line1: [1160, "swap", D.pop], primary: [1420, "pop"] },
      title: 1160,
    },
    object(was) {
      finishPing();
      // The ghost of the line holds the figure: it ticks to 0:00 there.
      const ghostFigure = S.words.querySelector(".leaving .figure");
      if (ghostFigure) {
        tickFigure("0:00", 0, "lead:tick", ghostFigure);
      }
      // The code goes out from its edge to its head.
      playDots(
        DOTS.map((dot) =>
          track(
            { delay: 300 + (1 - dot.far) * D.panel, duration: D.fade },
            { o: { ease: curveOf(E.out), frames: [kf(0, 1), kf(1, V["qr-dim-opacity"])] } }
          )
        ),
        "dim"
      );
      for (const eye of S.eyes) {
        const far = Math.hypot(MIDDLE - Number(eye.dataset.cx), MIDDLE - Number(eye.dataset.cy)) / Math.hypot(MIDDLE, MIDDLE);
        part(eye, [{ opacity: 1 }, { opacity: V["qr-dim-opacity"] }], {
          delay: 300 + (1 - far) * D.panel,
          duration: D.fade,
          easing: E.out,
          id: "dim",
        });
      }
      headShuts(580, 860, was.head);
      part(S.strike, [{ transform: "scaleX(0)" }, { transform: "none" }], {
        delay: 860,
        duration: D.settle,
        easing: E.out,
        id: "strike",
      });
      cue(860, () => setCaw({ status: "sleeping" }), "caw");
    },
  },
  // New code. LEAD the press; New code exits.
  "expired>asking": {
    w: { exits: { primary: 0, line1: 400 }, exitIds: { line1: "exit" }, enters: { line1: [610, "swap", 210] }, title: 400 },
    object() {
      // The strike withdraws right to left.
      part(S.strike, [{ transform: "none" }, { transform: "scaleX(0)" }], {
        delay: 120,
        duration: D.exit,
        easing: E.crossfade,
        id: "strike",
      });
      S.run.style.opacity = "1";
      let gone = null;
      for (const g of S.runGlyphs) {
        gone = exit(g, 160, "letters");
      }
      linger(S.run, gone, () => {
        S.run.style.opacity = S.rest.run ? "1" : "0";
      });
      liftIntoCloud(160);
      for (const eye of S.eyes) {
        part(eye, [{ opacity: V["qr-dim-opacity"], transform: "none" }, { opacity: 0, transform: `scale(${V["pop-scale"]})` }], {
          delay: 160,
          duration: D.pop,
          easing: E.out,
          id: "eyes",
        });
      }
      pop(S.head, 280, "head");
      cue(400, () => setCaw({ status: "loading" }), "caw");
    },
  },
  // New code from Denied. LEAD the press; New code exits; the lock leaves first.
  "denied>asking": {
    w: {
      exits: { primary: 0, line1: 120, line2: 120, name: 120, kind: 120, addr: 120, alias: 120 },
      enters: { line1: [610, "swap", 210] },
      out: 120,
      title: 400,
    },
    object: (was) => deviceToCloud(was, "lock"),
  },
  "removed>asking": {
    w: {
      exits: { primary: 0, name: 120, kind: 120, addr: 120, alias: 120 },
      enters: { line1: [610, "swap", 210] },
      out: 120,
      title: 400,
    },
    object: (was) => deviceToCloud(was, "unlink"),
  },
  // LEAD the ⚠ arrives in the words column's mark cell. The code, the paper, the letters and the ping do not move.
  "waiting>nomatch": {
    keepPing: true,
    w: { enters: { line1: [0, "marked"] }, title: 300 },
    object() {
      // Nothing of the code changes.
    },
  },
  // LEAD the cloud coasts to a stop.
  "asking>failed": {
    w: { exits: { line1: 880 }, exitIds: { line1: "exit" }, enters: { line1: [1090, "swap", 210], primary: [1300, "pop"] }, title: 1040 },
    object(was) {
      const drift = driftTracks();
      const now = was.driftTime;
      const ahead = now + D.breath * 0.1;
      S.heldTime = ahead;
      const clock = playDots(
        DOTS.map((_, i) => {
          const from = trackAt(drift[i], now);
          const to = trackAt(drift[i], ahead);
          return track(
            { delay: 0, duration: D.settle },
            {
              x: { ease: curveOf(E.out), frames: [kf(0, from.x), kf(1, to.x)] },
              y: { ease: curveOf(E.out), frames: [kf(0, from.y), kf(1, to.y)] },
            }
          );
        }),
        "lead:coast"
      );
      clock.finished.then(
        () => {
          if (S.dotRun?.clock === clock) {
            S.dotRun = heldAt(drift, ahead);
            S.dotsDrawn = null;
            drawSoon();
          }
        },
        () => undefined
      );
      cue(200, () => setCaw({ status: "reconnecting", still: true }), "caw");
      headShuts(400, 880, was.head);
    },
  },
  // Retry. LEAD the press; Retry exits. Caw plays reconnecting's loop for as long as the request is out;
  // nothing else changes until the hub answers.
  "failed>retrying": {
    w: { exits: { primary: 0 } },
    object() {
      setCaw({ status: "reconnecting", still: false });
    },
  },
  // The hub answers with a code: Asking's board from 0, on the answer. LEAD Caw arrives by his loading
  // file's enter; the head returns, the title and the line change, the cloud drifts on from where it stood.
  "retrying>asking": {
    w: { exits: { line1: 420 }, exitIds: { line1: "exit" }, enters: { line1: [580, "pop"] }, title: 520 },
    object() {
      setCaw({ status: "loading" });
      stopDrift();
      S.dotRun = heldAt(driftTracks(), S.heldTime ?? 0);
      S.dotsDrawn = null;
      drawSoon();
      pop(S.head, 460, "head");
      cue(toBreath(700), () => {
        if (S.dotRun?.held) {
          startDrift(S.heldTime ?? 0);
        }
      }, "drift");
    },
  },
  // Remove device (only where the owner keeps Removed here): Denied's board on Paired.
  "approved>removed": {
    w: {
      exits: { ghost: 0, primary: 60, after: 700 },
      exitIds: { primary: "lead:exit" },
      title: 700,
      when: [960, 180],
      enters: { primary: [1400, "pop"] },
      follow: 960,
    },
    object() {
      const check = S.screenMarks.check;
      check.removeAttribute("hidden");
      linger(check, iconOut(check, 400, "mark"), () => {
        check.toggleAttribute("hidden", S.rest.screen.mark !== "check");
      });
      iconIn(S.screenMarks.unlink, 400, "mark");
      part(S.device, [{ opacity: 1 }, { opacity: 0.5 }], { delay: 400, duration: D.settle, easing: E.out, id: "dim" });
    },
  },
};

/** The cloud's dots fading in where its drift starts them, from `at`, delayed r × --dur-reveal; the drift then starts on a breath. */
function fadeCloudIn(at) {
  const drift = driftTracks();
  const clock = playDots(
    DOTS.map((dot, i) => {
      const p = trackAt(drift[i], 0);
      return track(
        { delay: at + dot.r * D.reveal, duration: D.fade },
        {
          x: { ease: curveOf("linear"), frames: [kf(0, p.x), kf(1, p.x)] },
          y: { ease: curveOf("linear"), frames: [kf(0, p.y), kf(1, p.y)] },
          o: { ease: curveOf(E.out), frames: [kf(0, 0), kf(1, 1)] },
        }
      );
    }),
    "cloud"
  );
  S.heldTime = 0;
  const end = at + D.reveal + D.fade;
  cue(end + toBreath(end) - end, () => {
    if (S.dotRun?.clock === clock) {
      startDrift(0);
    }
  }, "drift");
}

/** An expired code's dim dots lift from their modules to the cloud's scattered starts, head first, then drift. */
function liftIntoCloud(at) {
  const drift = driftTracks();
  const clock = playDots(
    DOTS.map((dot, i) => {
      const to = trackAt(drift[i], 0);
      return track(
        { delay: at + dot.far * D.panel, duration: D.settle },
        {
          x: { ease: curveOf(E["in-out"]), frames: [kf(0, 0), kf(1, to.x)] },
          y: { ease: curveOf(E["in-out"]), frames: [kf(0, 0), kf(1, to.y)] },
        }
      );
    }),
    "lift"
  );
  S.heldTime = 0;
  const end = at + D.panel + D.settle;
  cue(end + toBreath(end) - end, () => {
    if (S.dotRun?.clock === clock) {
      startDrift(0);
    }
  }, "drift");
}

/** Denied or Removed → Asking: the mark leaves at once, the outline undraws as the paper arrives beneath with the cloud. */
function deviceToCloud(was, mark) {
  const m = S.screenMarks[mark];
  m.removeAttribute("hidden");
  linger(m, exit(m, 0, "lead:mark"), () => {
    m.toggleAttribute("hidden", S.rest.screen.mark !== mark);
  });
  S.device.removeAttribute("hidden");
  S.device.style.opacity = "0.5";
  let undrawn = null;
  for (const path of S.strokes) {
    undrawn = part(path, [{ strokeDashoffset: 0 }, { strokeDashoffset: 1 }], {
      delay: 160,
      duration: D.settle,
      easing: E.out,
      id: "outline",
    });
  }
  linger(S.device, undrawn, () => {
    S.device.toggleAttribute("hidden", S.rest.kind !== "device");
    S.device.style.opacity = "1";
  });
  pop(S.paper, 160, "paper");
  // The run's row grows back with the paper: the code's moments have it, the device's do not.
  part(S.runRow, [{ blockSize: "0px" }, { blockSize: `${S.runRow.getBoundingClientRect().height}px` }], {
    delay: 160,
    duration: D.settle,
    easing: E.out,
    id: "run-row",
  });
  fadeCloudIn(220);
  pop(S.head, 280, "head");
  cue(400, () => setCaw({ status: "loading" }), "caw");
}

/** The screen's letters leave at `at`: the code is spent. */
function lingerScreenLetters(at) {
  S.screenLetters.style.opacity = "1";
  linger(S.screenLetters, exit(S.screenLetters, at, "letters"), () => {
    S.screenLetters.style.opacity = S.rest.screen.letters ? "1" : "0";
  });
}

/**
 * ONE OBJECT: the icon on the screen gives way to the outcome's mark in
 * place at `at`: the tick by transitions.dev "Success check" (a fade, an 8px
 * blur, from 0.6 over --dur-settle, its stroke drawn from 160 in over 400),
 * the lock by "Icon swap".
 */
function headGives(at, mark) {
  placeHead("device");
  linger(S.head, iconOut(S.head, at, "head"), () => {
    if (!S.rest.head) {
      S.head.remove();
    }
  });
  const svg = S.screenMarks[mark];
  if (mark === "check") {
    part(svg, [{ opacity: 0, filter: "blur(8px)", transform: "scale(0.6)" }, SHOWN], {
      delay: at,
      duration: D.settle,
      easing: E.out,
      id: "check",
    });
    part(svg.querySelector(".tick"), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
      delay: at + 160,
      duration: D.settle,
      easing: E.out,
      id: "check",
    });
  } else {
    iconIn(svg, at, "mark");
  }
}

/** The head shuts (Icon swap to its shut face) at `at`, squeezes once, and leaves at `gone`. */
function headShuts(at, gone, wasHead) {
  if (!S.head.isConnected) {
    S.slot.append(S.head);
  }
  Object.assign(S.head.style, {
    insetInlineStart: `${wasHead.x}px`,
    insetBlockStart: `${wasHead.y}px`,
    inlineSize: `${wasHead.w}px`,
    blockSize: `${wasHead.h}px`,
  });
  iconOut(S.faceOpen, at, "face");
  iconIn(S.faceShut, at, "face");
  const squeeze = V["qr-squeeze"];
  part(
    S.head,
    [{ scale: "1" }, { scale: `${2 - squeeze} ${squeeze}`, offset: 0.4 }, { scale: "1" }],
    { delay: at, duration: D.panel, easing: E.out, id: "squeeze" }
  );
  linger(S.head, exit(S.head, gone, "head"), () => {
    if (!S.rest.head) {
      S.head.remove();
    }
  });
}

/** FLIP: `el`, resting at `to` (slot px), is drawn from `from` until `at`, then glides there. */
function flip(el, from, to, at, duration, easing, id) {
  const k = from.w / to.w;
  part(
    el,
    [
      { transform: `translate(${(from.x - to.x).toFixed(2)}px, ${(from.y - to.y).toFixed(2)}px) scale(${k.toFixed(4)})` },
      { transform: "none" },
    ],
    { delay: at, duration, easing, id }
  );
}

/** FLIP for one letter: from the run's glyph box (page px) onto the screen's, scaled by the two sizes. */
function flipGlyph(el, from, at, duration, easing) {
  const to = el.getBoundingClientRect();
  const k = from.h / to.height;
  part(
    el,
    [
      { transform: `translate(${(from.x - to.left).toFixed(2)}px, ${(from.y - to.top).toFixed(2)}px) scale(${k.toFixed(4)})` },
      { transform: "none" },
    ],
    { delay: at, duration, easing, id: "letters" }
  );
}

/** What the object column shows as a board begins. */
function readObject() {
  const slot = S.slot.getBoundingClientRect();
  const h = S.head.isConnected ? S.head.getBoundingClientRect() : null;
  const time = Number(S.dotRun?.clock.currentTime ?? 0);
  return {
    dots: dotsNow().map(({ x, y }) => ({ x, y })),
    dotRun: S.dotRun,
    driftTime: S.dotRun?.loop ? time : (S.heldTime ?? 0),
    head: h ? { x: h.left - slot.left, y: h.top - slot.top, w: h.width, h: h.height } : null,
    glyphs: S.runGlyphs.map((g) => {
      const r = g.getBoundingClientRect();
      return { x: r.left, y: r.top, h: r.height };
    }),
    pingInk: getComputedStyle(S.ping).borderColor,
    runRow: S.runRow.getBoundingClientRect().height,
  };
}

/** The hub's record lands: transitions.dev "Skeleton reveal" (400), and Deny and Approve answer. */
function landRecord() {
  for (const p of [S.name, S.kind, S.addr, S.alias]) {
    const bar = p.querySelector(".skel");
    const value = p.querySelector(".v");
    if (!(bar && value)) {
      continue;
    }
    delete p.dataset.skel;
    const fade = { duration: D.settle, easing: E.crossfade, fill: "both", id: "record" };
    value.animate([{ opacity: 0, filter: "blur(2px)" }, { opacity: 1, filter: "blur(0px)" }], fade);
    bar.animate([{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(2px)" }], fade).finished.then(
      () => bar.remove(),
      () => undefined
    );
  }
  S.recordIn = true;
  for (const b of Object.values(S.btn)) {
    b.disabled = false;
  }
}

/* ------------------------------------------------------- moments */

const family = (m) => (m.startsWith("checking") ? "checking" : m.startsWith("nomatch") ? "nomatch" : m);
const boardName = (from, to) => `${family(from)}>${family(to)}`;
const boardOf = (from, to) => BOARDS[boardName(from, to)] ?? null;

/** Where each board's last beat ends, ms (spec §7; the boards the spec leaves out, the preview's). */
const BOARD_END = {
  "open>asking": 840,
  "asking>waiting": 1200,
  "waiting>lastminute": 260,
  "waiting>checking": 2000,
  "checking>approved": 1900,
  "checking>denied": 1660,
  "lastminute>expired": 1680,
  "expired>asking": 820,
  "denied>asking": 820,
  "removed>asking": 820,
  "waiting>nomatch": 480,
  "asking>failed": 1560,
  "failed>retrying": 160,
  "retrying>asking": 840,
  "approved>removed": 1660,
};

/** Plays the board from where the surface stands to `to`. */
/**
 * Retry's request to the hub. The surface changes on the hub's answer
 * (`hubAnswers`), never on a timer of its own: the preview's pretend hub
 * answers after --dur-hold, or, with the hub in the proof's hands, when the
 * proof says so.
 */
function askHub() {
  if (settings.hub === "auto") {
    S.timers.push(setTimeout(hubAnswers, D.hold));
  }
}

/** The hub answered Retry with a code: Asking's board plays from where the surface stands. */
function hubAnswers() {
  if (S.moment === "retrying") {
    go("asking");
  }
}

function go(to) {
  const from = S.moment;
  const board = boardOf(from, to);
  last = to;
  markMoment(to);
  board?.before?.();
  const before = readWords();
  const was = readObject();
  if (!board?.keepPing) {
    finishPing();
  }
  rest(to, { keepPing: board?.keepPing, keepTail: true, recordIn: board?.recordIn ?? true });
  if (to === "retrying") {
    askHub();
  }
  if (!board || reduced.matches) {
    // Less motion, or no board: the surface lands and fades in over --dur-fade; Caw follows at once.
    setCaw(restOf(to).caw);
    part(S.words, [{ opacity: 0 }, { opacity: 1 }], { duration: D.fade, easing: E.out, id: "fade" });
    if (kindOf(from) !== kindOf(to)) {
      part(S.slot, [{ opacity: 0 }, { opacity: 1 }], { duration: D.fade, easing: E.out, id: "fade" });
    }
    if (to.startsWith("checking") && settings.hub === "auto") {
      cue(D.fade, () => landRecord(), "record");
    }
    return;
  }
  // The words column's parts, then the object column's.
  playWords(before, board.w);
  board.object(was);
  // The board's last beat, as the spec writes it: the length a scrub reads its fractions of.
  cue(BOARD_END[boardName(from, to)], () => undefined, "end");
}

/**
 * Puts the surface in `m` at once (the preview's own step, no part of the
 * design's motion), Caw mounted afresh in its file; resolves once he has
 * entered and two frames have drawn.
 */
async function snap(m, { figure } = {}) {
  S.figure0 = figure ?? "0:42";
  S.heldTime = m === "failed" || m === "retrying" ? D.breath * 0.1 : 0;
  rest(m);
  markMoment(m);
  if (m === "open") {
    caw.present = false;
  } else {
    const entered = new Promise((done) => {
      cawEvents.entered = done;
      setTimeout(done, 4000);
    });
    setCaw(restOf(m).caw, { fresh: true });
    await entered;
  }
  await nextFrame();
  await nextFrame();
}

const nextFrame = () => new Promise((done) => requestAnimationFrame(() => done()));

/** The from-state drawn on frames of its own, then the board played from it. */
async function play(from, to) {
  if (from !== S.moment) {
    await snap(from, { figure: to === "expired" ? "0:01" : undefined });
  }
  go(to);
}

function markMoment(m) {
  for (const b of document.querySelectorAll("[data-moment]")) {
    b.setAttribute("aria-pressed", String(b.dataset.moment === m));
  }
}

/**
 * Picks one of the owner's two choices; the moment it touches plays again
 * where it is the one shown. Resolves once that play has begun.
 */
function setPick(name, value) {
  if (pick[name] === value) {
    return Promise.resolve();
  }
  pick[name] = value;
  for (const b of document.querySelectorAll(`[data-pick="${name}"]`)) {
    b.setAttribute("aria-pressed", String(b.dataset.value === value));
  }
  const removed = document.querySelector('[data-moment="removed"]');
  removed.hidden = pick.removed !== "kept";
  if (name === "removed" && pick.removed !== "kept" && last === "removed") {
    last = "approved";
  }
  if ((name === "denied" && last === "denied") || (name === "removed" && ["approved", "removed"].includes(last))) {
    return play(FROM[last], last);
  }
  return Promise.resolve();
}

export async function start() {
  readTokens();
  build();
  applyLayout();
  deskQuery.addEventListener("change", () => {
    applyLayout();
    rest(S.moment, { recordIn: S.recordIn });
  });
  // The dots' canvas follows the screen's pixel density (a zoom, another screen).
  const watchDensity = () =>
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      "change",
      () => {
        placeDots();
        watchDensity();
      },
      { once: true }
    );
  watchDensity();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", placeDots);

  const list = document.querySelector('[data-slot="moments"]');
  for (const [m, label] of MOMENTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.moment = m;
    b.textContent = label;
    b.setAttribute("aria-pressed", "false");
    b.hidden = m === "removed" && pick.removed !== "kept";
    b.addEventListener("click", () => play(FROM[m], m));
    list.append(b);
  }
  document.querySelector('[data-slot="replay"]').addEventListener("click", () => play(FROM[last], last));
  for (const [name, options] of Object.entries(PICKS)) {
    const seg = document.querySelector(`[data-slot="pick-${name}"]`);
    for (const [value, label] of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.pick = name;
      b.dataset.value = value;
      b.textContent = label;
      b.setAttribute("aria-pressed", String(pick[name] === value));
      b.addEventListener("click", () => setPick(name, value));
      seg.append(b);
    }
  }
  await document.fonts.ready;
  placeStrike();
  await snap("open");
  await play("asking", "waiting");
  root.dataset.ready = "";
}

/** The proof's handle. */
window.preview = {
  moments: MOMENTS.map(([m]) => m),
  from: FROM,
  boards: Object.keys(BOARDS),
  snap,
  go,
  play,
  /** Puts the surface in `m` at rest, Caw afresh, the hub's record landed. */
  rest: (m) => snap(m),
  landRecord,
  /** The hub answers Retry's request (the hub in the proof's hands). */
  answer: () => hubAnswers(),
  manualHub(on) {
    settings.hub = on ? "manual" : "auto";
  },
  /** Holds the clock's seconds still (the countdown, "asked 8s ago"). */
  stillClock(on) {
    settings.ticks = !on;
    if (on) {
      clearTimers();
    }
  },
  pick: setPick,
  /** The board a play from where the surface stands to `to` runs, or none. */
  boardFor: (to) => (boardOf(S.moment, to) ? boardName(S.moment, to) : null),
  get moment() {
    return S.moment;
  },
  /** The dots as the canvas draws them now: each disc's centre and radius in the code's px, its move, scale and opacity. */
  dotsOf() {
    const r = DOT_R * S.m;
    const alpha = S.dotRun ? 1 : S.dotsAlpha;
    return {
      m: S.m,
      r,
      live: Boolean(S.dotRun && !S.dotRun.loop && !S.dotRun.held),
      dots: dotsNow().map((p, i) => ({
        cx: (DOTS[i].x + 0.5 + p.x) * S.m,
        cy: (DOTS[i].y + 0.5 + p.y) * S.m,
        r: r * p.s,
        o: p.o * alpha,
      })),
    };
  },
  keepOut: KEEP_OUT,
};
