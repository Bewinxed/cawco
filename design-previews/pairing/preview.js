/**
 * The pairing card, played moment by moment, in the motion language of the
 * design the owner pinned (PairingQr.svelte and PairingPanel.svelte on
 * cawco/pairing-page-r4, ffea611a5) with only the changes his pins asked:
 *
 *   asking     the code's dots wait as a cloud at their scattered start,
 *              stepped back, each drifting once a breath; no finder eyes
 *   waiting    the dots lock onto their modules (r4's arrive, made one
 *              continuous settle: no shuffle, no hold, and no dot's path
 *              ever crosses the head), the letters type in on the same
 *              beat; then one ring leaves the card's edge once a breath
 *   lastminute the countdown takes the line, and the ring warms
 *   checking   (the scan) the dots pour into the head, inner first, the
 *              letters leave, and the card becomes the device
 *   approved   the device leaves; the ending arrives, its check drawn last
 *   removed    (Remove device) Paired's card changes in place
 *   denied     the device's strokes burst out and fall out of the frame
 *   expired,   the line under the code leaves, then the dots burst out
 *   nomatch,   from the head and fall out of the frame; the head squeezes
 *   failed     and shakes, face shut; the card folds to the ending, its
 *              glyph drawn last; Expired's letters fly into its verdict
 *              and are struck
 *
 * Each ending (report a8f73fdb §3) is a verdict (a status glyph and one
 * sentence), the device's record, what it means, and the acts, one coral.
 *
 * The card's edge while the hub works is cruip's animated gradient border.
 * Each other change is a transitions.dev recipe on the house's tokens: the
 * card resizing between moments ("Card resize"), the title ("Text morph"),
 * the line under the code ("Text states swap"), the device card arriving
 * ("Panel reveal").
 *
 * How a moment plays: the card is put in the moment it plays from at once,
 * then it is set in the new moment's resting state and, in the same frame,
 * every part's Web Animation is issued from where the part was drawn, its
 * last keyframe the resting style itself (fill both); the dots, drawn on a
 * canvas, each get a track read from one such run. Nothing waits on a
 * timer; the only timers are the hub's data (the record landing, a place
 * lookup) and the clock's seconds.
 */
import { QR } from "./lib/qr.js";
import { TextMorph, TextSwap } from "./lib/swap.js";

/* ---------------------------------------------------------------- data */

const CODE = "JWKHDQ";
/** The head's tile and the modules round it kept clear, in modules from the symbol's edge. */
const LOGO_AT = (QR.side - QR.logo) / 2;
/** The symbol's middle, in modules (the head's centre). */
const MIDDLE = QR.side / 2;
/** How far a scattered dot starts from its module, in modules (r4's SCATTER). */
const SCATTER = 6;
/** How far a bursting dot flies out from the head, as a share of its way from it (r4's BURST). */
const BURST = 0.6;
/** A dot's radius, in modules (r4's). */
const DOT_R = 0.42;

const POSE = {
  asking: "asking",
  waiting: "waiting",
  lastminute: "lastminute",
  checking: "checking",
  approved: "approved",
  denied: "denied",
  expired: "expired",
  nomatch: "nomatch",
  failed: "failed",
  // Remove device: the device let go, calm.
  removed: "removed",
};
/** Every drawing of Caw the page shows. */
const DRAWINGS = [...new Set(Object.values(POSE))];
/**
 * By night Caw is his night still: the same drawing on the house's paper
 * rim (`--paper`, the Caw panel and Decisions list previews' night stills),
 * so his black body stands off the dark page.
 */
const night = matchMedia("(prefers-color-scheme: dark)");
const cawSrc = (pose) => `./caw/${pose}${night.matches ? "-night" : ""}.png`;

const TITLE = {
  code: "Scan with the CawCo app",
  device: "A phone wants in",
  approved: "Paired",
  removed: "Removed",
  denied: "Not let in",
  expired: "That code expired",
  nomatch: "That scan didn't match",
  failed: "Pairing didn't start",
  "failed-down": "Pairing didn't start",
};

const READOUT = {
  asking: "Getting a code…",
  waiting: "Or approve it in Needs you, or Configure › Devices.",
  lastminute: "This code ends in 0:42",
};

/** The device the phone's record names, as the endings say it (the public case). */
const RECORD = ["iPhone", "iOS 26.1", "203.0.113.7", "Riyadh, Saudi Arabia"];
/** Which of the record's parts is the address (set in the mono figure). */
const RECORD_ADDR = 2;

/**
 * Each ending's words, verbatim from report a8f73fdb §3, in its note 2's
 * shape: the glyph, its tone, the verdict (`{code}` is Expired's struck
 * code), the record (null where none), what it means, the acts (one coral).
 * "removed" is Paired after Remove device (§3 A), "failed-down" Failed's
 * second sample cause.
 */
const NEW_CODE = { label: "New code", tone: "primary", act: "again" };
const OUTCOME = {
  approved: {
    glyph: "check",
    tone: "done",
    said: "Bewin's iPhone can run the fleet.",
    record: RECORD,
    means:
      "Its push answers permissions and questions from the lock screen, and it sees every machine, project and session. It's listed in Configure › Devices.",
    acts: [
      { label: "Remove device", tone: "ghost", act: "remove" },
      { label: "Open Devices", tone: "primary", act: "devices" },
    ],
  },
  removed: {
    glyph: "close",
    tone: "",
    said: "Bewin's iPhone was removed. It can pair again with a new code.",
    record: RECORD,
    means: null,
    acts: [NEW_CODE],
  },
  denied: {
    glyph: "close",
    tone: "fail",
    said: "Bewin's iPhone was denied.",
    record: RECORD,
    means:
      "Nothing reached it, and this code is spent. If that was your phone, make a new code and scan it again.",
    acts: [NEW_CODE],
  },
  expired: {
    glyph: "clock",
    tone: "",
    said: "No phone scanned {code} in its five minutes.",
    record: null,
    means: "Nothing was paired. A new code lasts another five.",
    acts: [NEW_CODE],
  },
  nomatch: {
    glyph: "close",
    tone: "fail",
    said: "A phone scanned a code this hub isn't showing.",
    record: null,
    means:
      "It was an old code, or another hub's. Only the code on this screen pairs here. Make a new one and scan that.",
    acts: [NEW_CODE],
  },
  failed: {
    glyph: "close",
    tone: "fail",
    said: "Pairing is off on this hub, so no code was made (403).",
    record: null,
    means: "Turn it on in Configure › Devices, then retry.",
    acts: [
      { label: "Retry", tone: "ghost", act: "again" },
      { label: "Open Devices", tone: "primary", act: "devices" },
    ],
  },
  "failed-down": {
    glyph: "close",
    tone: "fail",
    said: "The hub didn't answer (502). Nothing was changed.",
    record: null,
    means: "Retry once it's back; the code is made then.",
    acts: [{ label: "Retry", tone: "primary", act: "again" }],
  },
};

/** The three network cases, as the device card says them. */
const NETWORK = {
  public: {
    addr: "203.0.113.7",
    tag: "",
    second: "Riyadh, Saudi Arabia",
    mono: false,
    late: true,
  },
  tailnet: {
    addr: "100.84.12.9",
    tag: "tailnet",
    second: "bewin-iphone",
    mono: true,
    late: false,
  },
  lan: {
    addr: "192.168.1.42",
    tag: "your network",
    second: "",
    mono: false,
    late: false,
  },
};

/** The iPhone's line drawing, one path per stroke, on a 96 box. */
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

/** Each moment's control, and the moment it plays from. */
const MOMENTS = [
  ["asking", "Asking", "expired"],
  ["waiting", "Waiting", "asking"],
  ["lastminute", "Last minute", "waiting"],
  ["checking-public", "Checking · public", "waiting"],
  ["checking-tailnet", "Checking · tailnet", "waiting"],
  ["checking-lan", "Checking · LAN", "waiting"],
  ["approved", "Approved", "checking-public"],
  ["removed", "Removed", "approved"],
  ["denied", "Denied", "checking-public"],
  ["expired", "Expired", "lastminute"],
  ["nomatch", "Scan matches nothing", "waiting"],
  ["failed", "Failed · pairing off", "asking"],
  ["failed-down", "Failed · hub silent", "asking"],
];
const FROM = Object.fromEntries(MOMENTS.map(([m, , from]) => [m, from]));

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
  for (const n of [
    "control",
    "toggle",
    "exit",
    "morph",
    "fade",
    "pop",
    "panel",
    "settle",
    "stagger",
    "ghost",
  ]) {
    D[n] = ms(`--dur-${n}`);
  }
  D.breath = ms("--breath");
  for (const n of ["out", "in-out", "drawer", "glide-in", "glide-out", "crossfade"]) {
    E[n] = token(`--ease-${n}`);
  }
  for (const n of [
    "qr-dim-opacity",
    "qr-ping-reach",
    "qr-ping-opacity",
    "qr-squeeze",
    "qr-pulse-scale",
    "pop-scale",
  ]) {
    V[n] = Number.parseFloat(token(`--${n}`));
  }
  V.shake = Number.parseFloat(token("--shake-distance"));
  V.overshoot = Number.parseFloat(token("--shake-overshoot"));
  V.lift = token("--space-1");
  V.reveal = token("--space-8");
}

const reduced = matchMedia("(prefers-reduced-motion: reduce)");

/* -------------------------------------------------------------- state */

const settings = { hub: "auto", ticks: true };
const stages = [];
let last = "waiting";

function kindOf(m) {
  if (m === "asking" || m === "waiting" || m === "lastminute") {
    return "code";
  }
  return m.startsWith("checking") ? "device" : "outcome";
}
/** The card's ring at an ending (report a8f73fdb note 5): done, fail, or the hairline. */
function outcomeOf(m) {
  return OUTCOME[m]?.tone ?? "";
}
const isDead = (m) => m === "expired" || m === "nomatch" || m.startsWith("failed");

/* ------------------------------------------------------ the dots' paths */

/**
 * The same scatter for the same code: r4's linear congruential generator
 * (Numerical Recipes' constants) seeded from the text.
 */
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

/** The head's square, a dot's radius and half a module round it, in modules: what no arriving dot's disc ever enters. */
const KEEP_OUT = {
  lo: LOGO_AT - DOT_R - 0.08,
  hi: LOGO_AT + QR.logo + DOT_R + 0.08,
};
const inKeepOut = (p) =>
  p.x > KEEP_OUT.lo && p.x < KEEP_OUT.hi && p.y > KEEP_OUT.lo && p.y < KEEP_OUT.hi;
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
/** Whether the triangle a, b, c meets the keep-out square: any drift position on a–b travelling straight to c stays inside it. */
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
 * its drift (`a`, the start turned a quarter and halved), its way to the
 * head, its distance from the head and its own random number. A start whose
 * drift or whose way home would cross the head is drawn again, so the cloud
 * never covers the head and no arriving dot crosses it.
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
      const ps = { x: home.x + dx, y: home.y + dy };
      const pa = { x: home.x + ax, y: home.y + ay };
      if (!triangleMeets(ps, pa, home)) {
        s = { x: dx, y: dy };
        a = { x: ax, y: ay };
        break;
      }
    }
    return {
      x,
      y,
      s,
      a,
      far: Math.hypot(home.x - MIDDLE, home.y - MIDDLE) / reach,
      r: random(),
    };
  });
}
const DOTS = dotsOf();

const t = (p) => `translate(${p.x.toFixed(3)}px, ${p.y.toFixed(3)}px)`;

/* ------------------------------------------------------------- build */

const SVG = "http://www.w3.org/2000/svg";

function build(viewport) {
  const { layout } = viewport.dataset;
  const frag = document.getElementById("stage").content.cloneNode(true);
  const stage = frag.querySelector(".stage");
  stage.dataset.layout = layout;
  viewport.append(frag);

  const $ = (sel) => stage.querySelector(sel);
  const S = {
    layout,
    stage,
    caw: $(".caw"),
    title: new TextMorph($(".title")),
    titleEl: $(".title"),
    cardWrap: $(".card-wrap"),
    card: $(".card"),
    ping: $(".ping"),
    scenes: {
      code: $(".scene-code"),
      device: $(".scene-device"),
      outcome: $(".scene-outcome"),
    },
    well: $(".well"),
    code: $(".code"),
    eyesSvg: $(".code .eyes"),
    /** The dots' motion: the clock it is read from and each dot's track, or null where every dot stands on its module. */
    dotRun: null,
    /** What the dots' canvas last drew: the clock's time, or "rest". */
    dotsDrawn: null,
    eyes: [],
    badge: $(".badge"),
    letters: $(".letters"),
    tiles: [],
    glyphs: [],
    readout: $(".readout"),
    live: $(".readout .live"),
    words: new TextSwap($(".readout .words")),
    wire: $(".wire"),
    strokes: [],
    facts: $(".facts"),
    actions: $(".actions"),
    addr: $(".addr"),
    second: $(".second"),
    ago: $(".ago"),
    deny: $('[data-act="deny"]'),
    approve: $('[data-act="approve"]'),
    mark: $(".mark"),
    said: $(".said"),
    lead: new TextSwap($(".said .lead")),
    spent: $(".said .spent"),
    letters2: [],
    strike: $(".said .strike"),
    tail: $(".said .tail"),
    record: $(".record"),
    means: $(".means"),
    acts: $(".acts"),
    ghost: $('[data-slot="ghost"]'),
    leadEl: $(".said .lead"),
    primary: new TextMorph($('[data-slot="primary"]')),
    primaryEl: $('[data-slot="primary"]'),
    moment: null,
    network: "public",
    pingRun: null,
    pingTail: null,
    timers: [],
    runs: [],
  };

  // Sizes: the card's width, and the QR in whole modules inside it.
  const cardW = layout === "phone" ? 366 : 335;
  const pad = 18;
  const m = Math.floor((cardW - 2 - 2 * pad - 18) / QR.side);
  Object.assign(S, { cardW, m, q: m * QR.side });
  stage.style.setProperty("--card-w", `${cardW}px`);
  stage.style.setProperty("--q", `${S.q}px`);
  stage.style.setProperty("--m", `${m}px`);
  stage.style.setProperty("--badge", `${QR.logo * m}px`);
  stage.style.setProperty("--badge-at", `${LOGO_AT * m}px`);
  const cawSize = layout === "phone" ? 64 : 80;
  S.caw.width = cawSize;
  S.caw.height = cawSize;

  // The code: each dark module a dot, drawn on the dots' canvas (placed once the card is laid out), the finder eyes rounded rings round a dot (r4).
  S.dotsCanvas = document.createElement("canvas");
  S.dotsCanvas.className = "dots";
  S.dotsCanvas.setAttribute("aria-hidden", "true");
  S.dotsPen = S.dotsCanvas.getContext("2d");
  S.code.prepend(S.dotsCanvas);
  S.eyesSvg.setAttribute("viewBox", `0 0 ${QR.side} ${QR.side}`);
  for (const [ex, ey] of QR.eyes) {
    const g = document.createElementNS(SVG, "g");
    g.setAttribute("class", "eye");
    const ring = document.createElementNS(SVG, "rect");
    for (const [k, v] of Object.entries({
      x: ex + 0.5,
      y: ey + 0.5,
      width: 6,
      height: 6,
      rx: 1.9,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1,
    })) {
      ring.setAttribute(k, String(v));
    }
    const pupil = document.createElementNS(SVG, "circle");
    pupil.setAttribute("cx", String(ex + 3.5));
    pupil.setAttribute("cy", String(ey + 3.5));
    pupil.setAttribute("r", "1.5");
    pupil.setAttribute("fill", "currentColor");
    g.append(ring, pupil);
    g.dataset.cx = String(ex + 3.5);
    g.dataset.cy = String(ey + 3.5);
    S.eyesSvg.append(g);
    S.eyes.push(g);
  }

  for (const letter of CODE) {
    const tile = document.createElement("span");
    tile.className = "tile";
    const glyph = document.createElement("span");
    glyph.className = "glyph";
    glyph.textContent = letter;
    tile.append(glyph);
    S.letters.append(tile);
    S.tiles.push(tile);
    S.glyphs.push(glyph);
    // Expired's verdict holds the same six letters, struck.
    const l = document.createElement("span");
    l.className = "l";
    l.textContent = letter;
    S.strike.before(l);
    S.letters2.push(l);
  }

  // The wireframe: one inline svg per stroke, each cut to its own ink, so each can burst alone.
  for (const d of STROKES) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 96 96");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    svg.append(path);
    S.wire.append(svg);
    const b = path.getBBox();
    const bleed = 1.5;
    const pct = (v) => `${((v / 96) * 100).toFixed(3)}%`;
    svg.setAttribute(
      "viewBox",
      `${b.x - bleed} ${b.y - bleed} ${b.width + 2 * bleed} ${b.height + 2 * bleed}`
    );
    Object.assign(svg.style, {
      insetInlineStart: pct(b.x - bleed),
      insetBlockStart: pct(b.y - bleed),
      inlineSize: pct(b.width + 2 * bleed),
      blockSize: pct(b.height + 2 * bleed),
    });
    svg.dataset.cx = String(b.x + b.width / 2);
    svg.dataset.cy = String(b.y + b.height / 2);
    S.strokes.push(svg);
  }

  S.approve.addEventListener("click", () => playStages([S], "approved"));
  S.deny.addEventListener("click", () => playStages([S], "denied"));
  // An ending's acts: New code and Retry play the code again, Remove device plays the removal;
  // Open Devices has no page yet, so it plays nothing.
  const act = (event) => {
    const to = { again: "asking", remove: "removed" }[event.currentTarget.dataset.act];
    if (to) {
      playStages([S], to);
    }
  };
  S.ghost.addEventListener("click", act);
  S.primaryEl.addEventListener("click", act);

  // The band's lap pauses once its strength has reached 0.
  S.card.addEventListener("transitionend", (event) => {
    if (event.propertyName === "--band" && !S.card.hasAttribute("data-busy")) {
      S.card.classList.remove("lap");
    }
  });
  stages.push(S);
  return S;
}

/* --------------------------------------------------------- resting */

/** Fills the device card for a network case; `placeIn`: the place row has landed. */
function fillDevice(S, network, { recordIn, placeIn }) {
  const net = NETWORK[network];
  S.network = network;
  S.addr.replaceChildren();
  const code = document.createElement("code");
  code.textContent = net.addr;
  S.addr.append(code);
  if (net.tag) {
    S.addr.append(` · ${net.tag}`);
  }
  S.second.className = net.mono ? "second alias" : "second place";
  S.second.replaceChildren();
  if (net.mono) {
    const alias = document.createElement("code");
    alias.textContent = net.second;
    S.second.append(alias);
  } else {
    S.second.textContent = net.second;
  }
  S.second.hidden = !net.second || (net.late && !placeIn);
  S.deny.disabled = !recordIn;
  S.approve.disabled = !recordIn;
}

/** An ending's verdict split at Expired's code: the words before it, and after. */
function verdictOf(out) {
  const [lead, tail = ""] = out.said.split("{code}");
  return { lead, tail, code: out.said.includes("{code}") };
}

/** Puts ending `m`'s words in the card (note 2's shape): glyph, verdict, record, means, acts. */
function fillOutcome(S, m) {
  const out = OUTCOME[m];
  if (!out) {
    return;
  }
  S.mark.dataset.glyph = out.glyph;
  S.mark.dataset.tone = out.tone;
  const v = verdictOf(out);
  S.lead.put(v.lead);
  S.spent.hidden = !v.code;
  S.tail.textContent = v.tail;
  S.record.hidden = !out.record;
  S.record.replaceChildren(
    ...(out.record ?? []).map((text, i) => {
      const part = document.createElement("span");
      part.className = i === RECORD_ADDR ? "part addr" : "part";
      part.textContent = text;
      return part;
    })
  );
  S.means.hidden = !out.means;
  S.means.textContent = out.means ?? "";
  const ghost = out.acts.find((a) => a.tone === "ghost");
  const primary = out.acts.find((a) => a.tone === "primary");
  S.ghost.hidden = !ghost;
  S.ghost.textContent = ghost?.label ?? "";
  S.ghost.dataset.act = ghost?.act ?? "";
  S.primary.put(primary.label);
  S.primaryEl.dataset.act = primary.act;
}

/**
 * The card's height in each moment, measured once as the page starts (the
 * scene's own height and the card's two 1px edges), so a moment's first
 * frame reads no layout to find it.
 */
function measureHeights(S) {
  const of = (kind) => S.scenes[kind].offsetHeight + 2;
  const heights = { code: of("code"), device: {}, outcome: {} };
  for (const net of Object.keys(NETWORK)) {
    fillDevice(S, net, { recordIn: true, placeIn: false });
    const pending = of("device");
    fillDevice(S, net, { recordIn: true, placeIn: true });
    heights.device[net] = { pending, in: of("device") };
  }
  for (const m of Object.keys(OUTCOME)) {
    fillOutcome(S, m);
    heights.outcome[m] = of("outcome");
  }
  S.heights = heights;
}

function heightFor(S, m, { placeIn = true } = {}) {
  const kind = kindOf(m);
  if (kind === "code") {
    return S.heights.code;
  }
  if (kind === "device") {
    const h = S.heights.device[m.split("-")[1]];
    return placeIn ? h.in : h.pending;
  }
  return S.heights.outcome[m];
}

/** The card's height; the "Card resize" recipe's transition (in the CSS) carries it. */
function setHeight(S, h) {
  S.height = h;
  // On the card's wrap, the card filling it: on the proof's WebKit a card running its lap (a CSS
  // animation of --border-angle) drew no other run's height.
  S.cardWrap.style.height = `${h}px`;
}

/**
 * r4's ping: one ring leaves the card's edge once a breath, fading from
 * qr-ping-opacity as it grows qr-ping-reach past the edge on every side (a
 * scale per axis from the card's size), so its top stays under the title.
 */
function startPing(S, after = 0) {
  stopPing(S);
  const now = performance.timeOrigin + performance.now();
  const at = Math.ceil((now + after) / D.breath) * D.breath;
  const reach = 2 * V["qr-ping-reach"];
  const grow = `scale(${(1 + reach / S.cardW).toFixed(4)}, ${(1 + reach / S.height).toFixed(4)})`;
  S.pingRun = S.ping.animate(
    [
      { opacity: V["qr-ping-opacity"], transform: "none" },
      { opacity: 0, transform: grow },
    ],
    {
      duration: D.breath,
      easing: E.out,
      delay: at - now,
      iterations: Number.POSITIVE_INFINITY,
    }
  );
  S.pingRun.id = "ping";
}

/** The ping in flight finishes; none starts. */
function finishPing(S) {
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

/** The ping's loop stops; `tail`: the ring still in flight goes too (a jump to a moment, not a play into one). */
function stopPing(S, { tail = false } = {}) {
  S.pingRun?.cancel();
  S.pingRun = null;
  if (tail) {
    S.pingTail?.cancel();
    S.pingTail = null;
  }
}

/* ------------------------------------------------------- the dots */

/*
 * The code's ~420 dots are drawn on one canvas per card. Each moment's dot
 * motion is r4's, written as one track per dot (its delay, duration, curve
 * and keyframes, in modules from its module), and every track is read from
 * one clock: a Web Animation on the canvas that changes nothing drawn, so
 * the page's clock (and the proof's, through the DevTools Animation domain)
 * holds and seeks the dots like any other part. One element per dot made
 * every play restyle and composite ~840 animated elements in its first
 * frame (66–89ms of style on the proof's host); one canvas draws them all in
 * a path a frame.
 */

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
    // Newton's method on x(s) = p, then bisection where the slope is flat.
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
 * One dot's track, on Web Animations' timing model: `delay`, `duration`,
 * `iterations`, `alternate`, filled both ways; `ch` maps a channel (x and y
 * in modules from its module, s its scale, o its opacity) to its curve over
 * the whole run and its keyframes ([offset, value, the curve to the next]).
 */
const track = (timing, ch) => ({ iterations: 1, alternate: false, ...timing, ch });
const kf = (offset, value, ease = "linear") => [offset, value, curveOf(ease)];
const REST = { x: 0, y: 0, s: 1, o: 1 };

/** Where a track has its dot at time `time` (ms on its clock). */
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

/** Every dot where its track has it now (its clock's time), or on its module. */
function dotsNow(S) {
  const run = S.dotRun;
  if (!run) {
    return DOTS.map(() => REST);
  }
  const time = Number(run.clock.currentTime ?? 0);
  return run.tracks.map((tr) => (tr ? trackAt(tr, time) : REST));
}

/** Plays `tracks` on the dots from now: one clock as long as the longest. */
function playDots(S, tracks, id = "dots") {
  const end = Math.max(...tracks.map((tr) => (tr ? tr.delay + tr.duration * tr.iterations : 0)));
  const clock = part(S, S.dotsCanvas, [{ opacity: 1 }, { opacity: 1 }], { duration: end, easing: "linear", id });
  S.dotRun = { clock, tracks, loop: false };
  drawSoon();
}

/** r4's cloud: each dot drifting between its two scattered places once a breath, on its own beat; its clock a loop. */
function startDrift(S) {
  stopDrift(S);
  const clock = S.dotsCanvas.animate([{ opacity: 1 }, { opacity: 1 }], {
    duration: D.breath,
    iterations: Number.POSITIVE_INFINITY,
  });
  clock.id = "drift";
  const tracks = DOTS.map((dot) =>
    track(
      { delay: -dot.r * D.breath, duration: D.breath, iterations: Number.POSITIVE_INFINITY, alternate: true },
      {
        x: { ease: curveOf(E["in-out"]), frames: [kf(0, dot.s.x), kf(1, dot.a.x)] },
        y: { ease: curveOf(E["in-out"]), frames: [kf(0, dot.s.y), kf(1, dot.a.y)] },
      }
    )
  );
  S.dotRun = { clock, tracks, loop: true };
  drawSoon();
}

function stopDrift(S) {
  if (S.dotRun?.loop) {
    S.dotRun.clock.cancel();
    S.dotRun = null;
    drawSoon();
  }
}

/** Where each dot is drawn now, in modules from its module. */
const driftAt = (S) => dotsNow(S).map(({ x, y }) => ({ x, y }));

/**
 * The dots' canvas covers the card from the code's corner (a falling dot
 * is drawn until the card's edge clips it), at the screen's pixel density.
 */
function placeDots(S, tallest) {
  const { x, y } = offsetIn(S.code, S.card);
  const c = S.dotsCanvas;
  const dpr = window.devicePixelRatio || 1;
  Object.assign(c.style, {
    insetInlineStart: `${-x}px`,
    insetBlockStart: `${-y}px`,
    inlineSize: `${S.cardW}px`,
    blockSize: `${tallest}px`,
  });
  S.dotsTall = tallest;
  c.width = Math.ceil(S.cardW * dpr);
  c.height = Math.ceil(tallest * dpr);
  S.dotsAt = { x, y, dpr };
  S.dotsInk = getComputedStyle(S.code).color;
  S.dotsDrawn = null;
}

/** Draws a card's dots where they are now: every whole dot in one path, each fading one alone. */
function drawDots(S) {
  const pen = S.dotsPen;
  const { x: ox, y: oy, dpr } = S.dotsAt;
  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.clearRect(0, 0, S.dotsCanvas.width, S.dotsCanvas.height);
  pen.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
  pen.fillStyle = S.dotsInk;
  const r = DOT_R * S.m;
  const now = dotsNow(S);
  pen.beginPath();
  now.forEach((p, i) => {
    if (p.o >= 1 && p.s > 0) {
      const cx = (DOTS[i].x + 0.5 + p.x) * S.m;
      const cy = (DOTS[i].y + 0.5 + p.y) * S.m;
      pen.moveTo(cx + r * p.s, cy);
      pen.arc(cx, cy, r * p.s, 0, 2 * Math.PI);
    }
  });
  pen.fill();
  now.forEach((p, i) => {
    if (p.o > 0 && p.o < 1 && p.s > 0) {
      pen.globalAlpha = p.o;
      pen.beginPath();
      pen.arc((DOTS[i].x + 0.5 + p.x) * S.m, (DOTS[i].y + 0.5 + p.y) * S.m, r * p.s, 0, 2 * Math.PI);
      pen.fill();
    }
  });
  pen.globalAlpha = 1;
}

let drawing = 0;
/** Draws every card whose dots moved since its last drawing, each frame while a dot clock runs or is held. */
function drawSoon() {
  drawing ||= requestAnimationFrame(() => {
    drawing = 0;
    let again = false;
    for (const S of stages) {
      if (!S.dotsAt) {
        continue;
      }
      const run = S.dotRun;
      const key = run ? `${run.clock.currentTime}` : "rest";
      if (key !== S.dotsDrawn) {
        drawDots(S);
        S.dotsDrawn = key;
      }
      again ||= Boolean(run && run.clock.playState !== "finished");
    }
    if (again) {
      drawSoon();
    }
  });
}

function clearTimers(S) {
  for (const timer of S.timers) {
    clearInterval(timer);
    clearTimeout(timer);
  }
  S.timers = [];
}

/** The clock's seconds: the countdown, and how long ago the phone asked. */
function tick(S, m) {
  // biome-ignore lint/suspicious/noUnnecessaryConditions: the proof's stillClock() turns ticks off at run time
  if (!settings.ticks) {
    return;
  }
  if (m === "lastminute") {
    let left = 42;
    S.timers.push(
      setInterval(() => {
        left = left > 1 ? left - 1 : 42;
        S.words.put(`This code ends in 0:${String(left).padStart(2, "0")}`);
      }, 1000)
    );
  }
  if (kindOf(m) === "device") {
    let ago = 8;
    S.ago.textContent = `${ago}s`;
    S.timers.push(
      setInterval(() => {
        ago += 1;
        S.ago.textContent = `${ago}s`;
      }, 1000)
    );
  }
}

/**
 * Puts the card in moment `m`'s resting state. `still`: at once, the band,
 * ring and height too (the moment a play starts from); otherwise those take
 * their CSS transitions and every part is left for the caller to animate
 * into this state.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one resting state per moment, set field by field in the card's order
function rest(S, m, { still = false, keepPing = false, ping = true } = {}) {
  for (const held of S.runs) {
    held.cancel();
  }
  S.runs = [];
  for (const ghost of S.scenes.outcome.querySelectorAll(".leaving")) {
    ghost.remove();
  }
  clearTimers(S);
  if (!keepPing) {
    stopPing(S, { tail: still });
  }
  const kind = kindOf(m);
  S.moment = m;

  for (const [name, scene] of Object.entries(S.scenes)) {
    scene.toggleAttribute("data-on", name === kind);
    scene.inert = name !== kind;
  }

  // The code: a cloud while asking, locked on its modules once it is up.
  const asking = m === "asking";
  const up = m === "waiting" || m === "lastminute";
  // A play's dot clock went with the runs above; the cloud's loop stays while asking.
  if (S.dotRun && !S.dotRun.loop) {
    S.dotRun = null;
    drawSoon();
  }
  if (asking) {
    if (!S.dotRun) {
      startDrift(S);
    }
  } else {
    stopDrift(S);
  }
  S.code.style.opacity = asking ? String(V["qr-dim-opacity"]) : up ? "1" : "0";
  for (const eye of S.eyes) {
    eye.style.opacity = up ? "1" : "0";
  }
  for (const glyph of S.glyphs) {
    glyph.style.opacity = up ? "1" : "0";
  }
  S.letters.style.opacity = kind === "code" ? "1" : "0";
  S.badge.src = "./caw/badge.png";
  S.live.style.opacity = asking ? "1" : "0";
  S.words.put(READOUT[m] ?? READOUT.waiting);
  S.cardWrap.toggleAttribute("data-warm", m === "lastminute");

  // The device.
  if (kind === "device") {
    fillDevice(S, m.split("-")[1], { recordIn: true, placeIn: true });
  }
  fillOutcome(S, m);

  // The edge and the height.
  const { card } = S;
  if (still) {
    card.style.transition = "none";
  }
  card.style.setProperty("--band-dur", "var(--dur-pop)");
  card.style.setProperty("--band-delay", "0ms");
  card.style.setProperty("--ring-delay", "0ms");
  card.toggleAttribute("data-busy", asking);
  if (asking) {
    card.classList.add("lap");
  } else if (still) {
    card.classList.remove("lap");
  }
  const outcome = outcomeOf(m);
  if (outcome) {
    card.dataset.outcome = outcome;
  } else {
    delete card.dataset.outcome;
  }
  setHeight(S, heightFor(S, m));
  if (still) {
    getComputedStyle(card).getPropertyValue("--band");
    card.style.transition = "";
  }

  S.title.put(TITLE[kind === "outcome" ? m : kind]);
  S.pose = POSE[m.split("-")[0]];
  S.caw.src = cawSrc(S.pose);
  if (up && ping && !keepPing) {
    startPing(S);
  }
  tick(S, m);
}

/* --------------------------------------------------------- parts */

/**
 * One part's animation. Its last keyframe is the resting style under it, so
 * it holds that frame (fill both) until the next play cancels it, and its
 * end draws exactly what the card rests at.
 */
function part(S, el, keyframes, { duration, easing, delay = 0, composite, fill = "both", id = "part" }) {
  const anim = el.animate(keyframes, { duration, easing, delay, fill, composite });
  anim.id = id;
  S.runs.push(anim);
  return anim;
}

/** transitions.dev "Card resize": the card's height from `from` to where it rests now, over --dur-panel on ease-out, after `delay`. */
function resize(S, from, delay) {
  if (Math.abs(from - S.height) > 0.5) {
    part(S, S.cardWrap, [{ height: `${from}px` }, { height: `${S.height}px` }], {
      duration: D.panel,
      easing: E.out,
      delay,
    });
  }
}

/** A part leaving in place: the "Text states swap" exit (up 4px, a 2px blur, a fade) over --dur-exit. */
const leave = (S, el, delay = 0) =>
  part(
    S,
    el,
    [
      { opacity: 1, transform: "none", filter: "blur(0px)" },
      { opacity: 0, transform: `translateY(-${V.lift})`, filter: "blur(2px)" },
    ],
    { duration: D.exit, easing: E.crossfade, delay }
  );

/** A part arriving in place: a fade over --dur-pop. */
const arrive = (S, el, delay = 0, id = "part") =>
  part(S, el, [{ opacity: 0 }, { opacity: 1 }], { duration: D.pop, easing: E.out, delay, id });

/** The least a bursting part travels sideways, px: so none rises and falls on one spot and hangs at the top. */
const BURST_SIDE = 6;

/**
 * r4's burst: out from `centre` by BURST of the way, then down past `floor`,
 * over --dur-settle, a little late by its own random number. Its rise and
 * fall are a thrown thing's: up on the glide-out curve (the first 35%), down
 * on its mirror, glide-in, so it slows into the top of its arc and speeds out
 * of it; and it keeps travelling sideways the whole way (on ease-out), so
 * it never hangs at the top. Positions are in the part's own units, `px`
 * the screen px a unit is drawn at; `from` is where it is drawn now. The
 * path, in those units: x from `x0` to `x1`, y from `y0` up to `y1` and
 * down to `y2`.
 */
function burstPath({ home, from, centre, floor, r, px = 1, delay = 0 }) {
  const out = {
    x: from.x + (home.x + from.x - centre.x) * BURST,
    y: from.y + (home.y + from.y - centre.y) * BURST,
  };
  let side = out.x - from.x;
  if (Math.abs(side) * px < BURST_SIDE) {
    side = (r < 0.5 ? -BURST_SIDE : BURST_SIDE) / px;
  }
  return {
    timing: { duration: D.settle, delay: delay + r * D.ghost },
    x0: from.x,
    x1: from.x + side * 1.25,
    y0: from.y,
    y1: out.y,
    y2: Math.max(out.y, floor - home.y),
  };
}

/** A burst on an element (a finder eye, a stroke): its sideways travel on `translate`, its rise and fall on `transform`. */
function burst(S, el, path) {
  const b = burstPath(path);
  part(S, el, [{ translate: `${b.x0.toFixed(3)}px 0px` }, { translate: `${b.x1.toFixed(3)}px 0px` }], {
    ...b.timing,
    easing: E.out,
  });
  return part(
    S,
    el,
    [
      { transform: `translateY(${b.y0.toFixed(3)}px)`, easing: E["glide-out"] },
      { transform: `translateY(${b.y1.toFixed(3)}px)`, offset: 0.35, easing: E["glide-in"] },
      { transform: `translateY(${b.y2.toFixed(3)}px)` },
    ],
    { ...b.timing, easing: "linear" }
  );
}

/** The same burst as a dot's track, in modules. */
const burstTrack = (b) =>
  track(b.timing, {
    x: { ease: curveOf(E.out), frames: [kf(0, b.x0), kf(1, b.x1)] },
    y: { ease: curveOf("linear"), frames: [kf(0, b.y0, E["glide-out"]), kf(0.35, b.y1, E["glide-in"]), kf(1, b.y2)] },
  });

/** r4's head when the code dies: its face shut, it squeezes, then shakes once. */
function squeeze(S) {
  S.badge.src = "./caw/badge-shut.png";
  part(
    S,
    S.badge,
    [
      { transform: "none" },
      { transform: `scale(${2 - V["qr-squeeze"]}, ${V["qr-squeeze"]})`, offset: 0.4 },
      { transform: "none" },
    ],
    { duration: D.panel, easing: E.out }
  );
  const shake = D.ghost * 2 + D.stagger * 2;
  part(
    S,
    S.badge,
    [
      { transform: "translateX(0px)", easing: E.out },
      { transform: `translateX(${V.shake}px)`, offset: 0.2857, easing: E.out },
      { transform: `translateX(${-V.shake}px)`, offset: 0.5714, easing: E.out },
      { transform: `translateX(${V.overshoot}px)`, offset: 0.7857, easing: E.out },
      { transform: "translateX(0px)" },
    ],
    { duration: shake, easing: "linear", delay: D.panel, composite: "add" }
  );
}

/* ------------------------------------------------------ the endings */

/** Where `el` stands in `root`, in layout px (offsets: a frame drawn at a scale reads its own px). */
function offsetIn(el, root) {
  let x = 0;
  let y = 0;
  for (let at = el; at && at !== root; at = at.offsetParent) {
    x += at.offsetLeft + (at.offsetParent?.clientLeft ?? 0);
    y += at.offsetTop + (at.offsetParent?.clientTop ?? 0);
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/**
 * The status glyph arrives as the arrival ends, so it is the last thing
 * drawn (report a8f73fdb note 4). The done check: transitions.dev "Success
 * check" on the house's tokens: the glyph fades in, sharpens (2px blur) and
 * grows from 0.6 over --dur-toggle, and the tick draws its stroke from
 * --dur-ghost in (the recipe's path delay) over the same; the recipe's 80°
 * turn and 40px bob are left out, as the house's status glyphs never turn.
 * The fail and clock glyphs: transitions.dev "Icon swap" on DESIGN's status
 * glyph (in from 0.92, 2px blur, over --dur-control). Both end with the
 * arrival.
 */
function glyphIn(S, glyph, at) {
  const svg = S.mark.querySelector(`.g-${glyph}`);
  const from = { opacity: 0, filter: "blur(2px)" };
  const to = { opacity: 1, transform: "none", filter: "blur(0px)" };
  if (glyph === "check") {
    const start = at + D.pop - D.toggle - D.ghost;
    part(S, svg, [{ ...from, transform: "scale(0.6)" }, to], {
      duration: D.toggle,
      easing: E.out,
      delay: start,
      id: "glyph",
    });
    part(S, svg.querySelector(".tick"), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
      duration: D.toggle,
      easing: E.out,
      delay: start + D.ghost,
      id: "glyph",
    });
    return;
  }
  part(S, svg, [{ ...from, transform: "scale(0.92)" }, to], {
    duration: D.control,
    easing: E.out,
    delay: at + D.pop - D.control,
    id: "glyph",
  });
}

/** An ending's rows arrive in place at `at` (a fade over --dur-pop), the glyph drawn as they land. Expired's letters fly in by their own job. */
function arriveEnding(S, m, at) {
  const out = OUTCOME[m];
  arrive(S, S.leadEl, at, "arrive");
  if (verdictOf(out).tail) {
    arrive(S, S.tail, at);
  }
  if (out.record) {
    arrive(S, S.record, at);
  }
  if (out.means) {
    arrive(S, S.means, at);
  }
  arrive(S, S.acts, at);
  glyphIn(S, out.glyph, at);
}

/**
 * Expired's code is the one object on both sides of the ending: its six
 * letters fly from their tiles into the verdict's struck code (a FLIP, each
 * letter from its tile's glyph box, at its size, to its place, over
 * --dur-panel on the drawer curve) while the card folds, then the strike
 * draws left to right over --dur-morph. Until they fly, the letters stand
 * in their tiles.
 */
function lettersJob(S, at) {
  const moves = [];
  return {
    lay: () => undefined,
    measure: () => {
      S.letters2.forEach((l, i) => {
        const g = offsetIn(S.glyphs[i], S.card);
        const n = offsetIn(l, S.card);
        moves.push({
          x: g.x + g.w / 2 - (n.x + n.w / 2),
          y: g.y + g.h / 2 - (n.y + n.h / 2),
          s: g.w / n.w,
        });
      });
    },
    start: () => [
      ...S.letters2.map((l, i) => {
        const { x, y, s } = moves[i];
        const run = l.animate(
          [{ transform: `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px) scale(${s.toFixed(4)})` }, { transform: "none" }],
          { duration: D.panel, easing: E.drawer, delay: at, fill: "both" }
        );
        run.id = "flip";
        return run;
      }),
      S.strike.animate([{ transform: "scaleX(0)" }, { transform: "none" }], {
        duration: D.morph,
        easing: E.out,
        delay: at + D.panel,
        fill: "both",
      }),
    ],
  };
}

/**
 * Remove device: Paired's card changes in place. What goes (the means, the
 * ghost act) leaves where it stood (Text states swap's exit) and the card
 * folds once it has; the verdict swaps to the removal (Text states swap:
 * the new sentence wraps to two lines, which the Text morph recipe's one
 * line cannot); the rows that stay slide to their new places (a FLIP over
 * --dur-panel on ease-out, Card resize's curve); the coral's words morph
 * (Text morph); the check gives way to the muted close glyph (Icon swap).
 */
function removeJob(S) {
  const before = { record: S.record.offsetTop, acts: S.acts.offsetTop };
  const ghosts = [S.means, S.ghost].map((el) => {
    const copy = el.cloneNode(true);
    copy.classList.add("leaving");
    copy.inert = true;
    copy.setAttribute("aria-hidden", "true");
    const at = offsetIn(el, S.scenes.outcome);
    Object.assign(copy.style, {
      insetInlineStart: `${at.x}px`,
      insetBlockStart: `${at.y}px`,
      inlineSize: `${at.w}px`,
      blockSize: `${at.h}px`,
    });
    return copy;
  });
  const after = {};
  return {
    ghosts,
    lay: () => S.scenes.outcome.append(...ghosts),
    measure: () => {
      after.record = S.record.offsetTop;
      after.acts = S.acts.offsetTop;
    },
    start: () => {
      const runs = [];
      const slide = (el, dy) => {
        if (Math.abs(dy) > 0.01) {
          runs.push(
            el.animate([{ transform: `translateY(${dy.toFixed(3)}px)` }, { transform: "none" }], {
              duration: D.panel,
              easing: E.out,
              fill: "both",
            })
          );
        }
      };
      slide(S.record, before.record - after.record);
      slide(S.acts, before.acts - after.acts);
      for (const copy of ghosts) {
        const run = copy.animate(
          [
            { opacity: 1, transform: "none", filter: "blur(0px)" },
            { opacity: 0, transform: `translateY(-${V.lift})`, filter: "blur(2px)" },
          ],
          { duration: D.exit, easing: E.crossfade, fill: "both" }
        );
        run.finished.then(
          () => copy.remove(),
          () => undefined
        );
        runs.push(run);
      }
      const swap = { duration: D.control, easing: E.out, fill: "both" };
      runs.push(
        S.mark.querySelector(".g-check").animate(
          [
            { opacity: 1, transform: "none", filter: "blur(0px)" },
            { opacity: 0, transform: "scale(0.92)", filter: "blur(2px)" },
          ],
          swap
        ),
        S.mark.querySelector(".g-close").animate(
          [
            { opacity: 0, transform: "scale(0.92)", filter: "blur(2px)" },
            { opacity: 1, transform: "none", filter: "blur(0px)" },
          ],
          swap
        )
      );
      return runs;
    },
  };
}

/* ------------------------------------------------------- the hub */

function landRecord(S) {
  S.card.style.setProperty("--band-dur", "var(--dur-exit)");
  S.card.style.setProperty("--band-delay", "0ms");
  S.card.removeAttribute("data-busy");
  S.deny.disabled = false;
  S.approve.disabled = false;
  if (NETWORK[S.network].late && settings.hub === "auto") {
    S.timers.push(setTimeout(() => landPlace(S), 500));
  }
}

/** A late place row arrives: the card resizes ("Card resize") as the row fades in. */
function landPlace(S) {
  if (!S.second.hidden || kindOf(S.moment) !== "device") {
    return;
  }
  S.second.hidden = false;
  const from = S.height;
  setHeight(S, heightFor(S, S.moment, { placeIn: true }));
  resize(S, from, 0);
  arrive(S, S.second);
}

/* ------------------------------------------------------- moments */

/**
 * Plays moment `m` from where the card stands, in phases a page of several
 * stages runs together (`playStages`): `plan` reads what the motion starts
 * from; `write` puts the card in its resting state; the texts lay out and
 * measure their parts; `animate` issues every part's animation.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one branch per moment, read in the storyboard's order
function plan(S, m) {
  const was = { moment: S.moment, height: S.height };
  const kindWas = kindOf(was.moment);
  const kind = kindOf(m);
  const flat = reduced.matches;
  const dead = isDead(m);
  const keepPing = m === "lastminute" && was.moment === "waiting";
  // Where each dot is drawn as the moment starts: its drift's place in the cloud, else its module.
  const at = was.moment === "asking" ? driftAt(S) : null;
  /** Where a dot is, in modules from its module, as the moment starts. */
  const fromOf = (i) => at?.[i] ?? { x: 0, y: 0 };
  // The card's foot, in the code's modules: what a falling dot passes to be out of the frame.
  const floor = (was.height - S.well.offsetTop) / S.m + 1;
  // A dead code's burst waits for the words under it to leave (--dur-exit), so no dot falls through them.
  const burstAt = dead ? D.exit : 0;
  // When the parts leaving have all left the frame: the card folds to the next words then.
  const gone = burstAt + D.settle + D.ghost;

  // The card resizes when what it held has gone: at the swallow's end, once the burst is out of the frame;
  // Remove device's card folds once what leaves it has gone.
  let resizeAt = 0;
  if (kindWas === "code" && kind === "device") {
    resizeAt = D.panel + D.pop;
  } else if (dead || m === "denied") {
    resizeAt = gone;
  } else if (m === "removed") {
    resizeAt = D.exit;
  }
  const morph = { morph: D.morph, resize: D.pop, easing: E.out };
  const swap = { duration: D.exit, easing: E.crossfade, lift: V.lift };
  const titleAt = dead || m === "denied" ? 0 : kind === "device" ? D.panel + D.pop : 0;
  const jobs = [
    S.title.prepare(TITLE[kind === "outcome" ? m : kind], { ...morph, delay: flat ? 0 : titleAt }),
  ];
  if (m === "waiting" || m === "lastminute") {
    jobs.push(S.words.prepare(READOUT[m], { ...swap, delay: 0 }));
  }
  if (m === "removed" && was.moment === "approved") {
    jobs.push(
      S.lead.prepare(verdictOf(OUTCOME.removed).lead, { ...swap, delay: 0 }),
      S.primary.prepare(OUTCOME.removed.acts[0].label, { ...morph, delay: 0 })
    );
    if (!flat) {
      jobs.push(removeJob(S));
    }
  }
  if (m === "expired" && !flat) {
    jobs.push(lettersJob(S, gone));
  }

  const write = () => {
    last = m;
    if (!keepPing) {
      finishPing(S);
    }
    rest(S, m, { keepPing });
    const { card } = S;
    if (m === "waiting") {
      card.style.setProperty("--band-dur", "var(--dur-exit)");
    }
    if (kind === "device") {
      // The band runs while the hub's record is on its way.
      card.setAttribute("data-busy", "");
      card.classList.add("lap");
      fillDevice(S, m.split("-")[1], { recordIn: false, placeIn: false });
      setHeight(S, heightFor(S, m, { placeIn: false }));
      if (settings.hub === "auto") {
        S.timers.push(setTimeout(() => landRecord(S), 700));
      }
    }
    if (flat) {
      return;
    }
    // What leaves by burst or swallow keeps its drawing while it goes.
    if (kindWas === "code" && kind !== "code") {
      const wasUp = was.moment !== "asking";
      S.code.style.opacity = wasUp ? "1" : String(V["qr-dim-opacity"]);
      for (const el of S.eyes) {
        el.style.opacity = wasUp ? "1" : "0";
      }
      // Expired's letters are drawn by the verdict's copies, standing in the tiles until they fly.
      for (const el of S.glyphs) {
        el.style.opacity = wasUp && m !== "expired" ? "1" : "0";
      }
      S.letters.style.opacity = "1";
    }
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one branch per moment (the storyboard above)
  const animate = () => {
    for (const job of jobs) {
      if (job) {
        S.runs.push(...job.start());
      }
    }
    resize(S, was.height, flat ? 0 : resizeAt);
    if (flat) {
      // Less motion: what leaves fades, the height lands, what arrives fades in.
      if (kindWas !== kind) {
        part(S, S.scenes[kindWas], [{ opacity: 1 }, { opacity: 0 }], { duration: D.fade, easing: E.out });
        part(S, S.scenes[kind], [{ opacity: 0 }, { opacity: 1 }], { duration: D.fade, easing: E.out });
      } else if (m === "waiting") {
        part(S, S.code, [{ opacity: V["qr-dim-opacity"] }, { opacity: 1 }], { duration: D.fade, easing: E.out });
      }
      return;
    }
    if (m === "asking") {
      // The places open: the ending leaves, the card resizes, then the cloud and the head come in, the empty boxes with them.
      part(S, S.scenes[kindWas], [{ opacity: 1 }, { opacity: 0 }], { duration: D.exit, easing: E.out });
      part(S, S.code, [{ opacity: 0 }, { opacity: V["qr-dim-opacity"] }], {
        duration: D.pop,
        easing: E.out,
        delay: D.exit,
      });
      arrive(S, S.badge, D.exit);
      arrive(S, S.letters, D.exit);
      arrive(S, S.readout, D.exit + D.panel);
    } else if (m === "waiting") {
      // r4's arrive, one continuous settle: every dot from where the cloud has it straight onto its module.
      playDots(
        S,
        DOTS.map((dot, i) => {
          const from = fromOf(i);
          return track(
            { delay: dot.r * D.stagger * 2, duration: D.settle },
            {
              x: { ease: curveOf(E.out), frames: [kf(0, from.x), kf(1, 0)] },
              y: { ease: curveOf(E.out), frames: [kf(0, from.y), kf(1, 0)] },
            }
          );
        })
      );
      part(S, S.code, [{ opacity: V["qr-dim-opacity"] }, { opacity: 1 }], { duration: D.settle, easing: E.out });
      for (const eye of S.eyes) {
        part(
          S,
          eye,
          [
            { opacity: 0, transform: `scale(${V["pop-scale"]})` },
            { opacity: 1, transform: "none" },
          ],
          { duration: D.pop, easing: E.out, delay: D.settle - D.pop + D.stagger * 2 }
        );
      }
      // The letters type in on the same beat.
      const beat = (D.settle - D.pop) / (S.glyphs.length - 1);
      S.glyphs.forEach((glyph, i) => {
        part(
          S,
          glyph,
          [
            { opacity: 0, transform: `scale(${V["pop-scale"]})` },
            { opacity: 1, transform: "none" },
          ],
          { duration: D.pop, easing: E.out, delay: i * beat }
        );
      });
      leave(S, S.live);
      startPing(S, D.settle + D.stagger * 2);
    } else if (kind === "device") {
      // The scan: the dots pour into the head, inner first (r4's swallow); the letters and the line leave;
      // the head gulps; then the card becomes the device (Card resize, Panel reveal).
      const swallow = curveOf(E["in-out"]);
      playDots(
        S,
        DOTS.map((dot) =>
          track(
            { delay: dot.far * D.panel, duration: D.pop },
            {
              x: { ease: swallow, frames: [kf(0, 0), kf(1, MIDDLE - (dot.x + 0.5))] },
              y: { ease: swallow, frames: [kf(0, 0), kf(1, MIDDLE - (dot.y + 0.5))] },
              s: { ease: swallow, frames: [kf(0, 1), kf(1, V["pop-scale"])] },
              o: { ease: swallow, frames: [kf(0, 1), kf(1, 0)] },
            }
          )
        )
      );
      for (const eye of S.eyes) {
        const into = { x: MIDDLE - Number(eye.dataset.cx), y: MIDDLE - Number(eye.dataset.cy) };
        part(
          S,
          eye,
          [
            { transform: "none", opacity: 1 },
            { transform: `${t(into)} scale(${V["pop-scale"]})`, opacity: 0 },
          ],
          { duration: D.pop, easing: E["in-out"], delay: D.panel }
        );
      }
      leave(S, S.letters);
      leave(S, S.readout);
      part(
        S,
        S.badge,
        [{ transform: "none" }, { transform: `scale(${V["qr-pulse-scale"]})`, offset: 0.5 }, { transform: "none" }],
        { duration: D.pop, easing: E.out, delay: D.panel }
      );
      const swallowed = D.panel + D.pop;
      part(S, S.scenes.code, [{ opacity: 1 }, { opacity: 0 }], { duration: D.exit, easing: E.out, delay: swallowed });
      // Panel reveal: up from --space-8 below, a 2px cross-blur and a fade, over --dur-settle.
      part(
        S,
        S.scenes.device,
        [
          { opacity: 0, transform: `translateY(${V.reveal})`, filter: "blur(2px)" },
          { opacity: 1, transform: "none", filter: "blur(0px)" },
        ],
        { duration: D.settle, easing: E.out, delay: swallowed }
      );
    } else if (m === "approved") {
      // The device leaves (Panel reveal's close, on the house's faster exit); the card resizes; the words come in.
      part(
        S,
        S.scenes.device,
        [
          { opacity: 1, transform: "none", filter: "blur(0px)" },
          { opacity: 0, transform: `translateY(${V.reveal})`, filter: "blur(2px)" },
        ],
        { duration: D.exit, easing: E.out }
      );
      arriveEnding(S, m, D.exit);
    } else if (m === "removed") {
      // Everything is in the jobs: removeJob, the verdict's swap, the coral's morph, the title's.
    } else if (m === "denied") {
      // The device's strokes burst out from its middle and fall out of the frame; its words leave.
      const units = S.wire.offsetWidth / 96;
      const wireTop = S.wire.offsetTop + S.scenes.device.offsetTop;
      const strokeFloor = (was.height - wireTop) / units + 4;
      const rs = seeded("denied");
      S.strokes.forEach((svg) => {
        const home = { x: Number(svg.dataset.cx), y: Number(svg.dataset.cy) };
        burst(S, svg, {
          home: { x: home.x * units, y: home.y * units },
          from: { x: 0, y: 0 },
          centre: { x: 48 * units, y: 48 * units },
          floor: strokeFloor * units,
          r: rs(),
        });
      });
      leave(S, S.facts);
      leave(S, S.actions);
      part(S, S.scenes.device, [{ opacity: 1 }, { opacity: 0 }], { duration: D.control, easing: E.out, delay: gone });
      arriveEnding(S, m, gone);
    } else if (dead) {
      // The words under the code leave; then r4's burst: every dot out from the head, then down out of the frame.
      // The head squeezes and shakes, face shut, from the first frame.
      playDots(
        S,
        DOTS.map((dot, i) =>
          burstTrack(
            burstPath({
              home: { x: dot.x + 0.5, y: dot.y + 0.5 },
              from: fromOf(i),
              centre: { x: MIDDLE, y: MIDDLE },
              floor,
              r: dot.r,
              px: S.m,
              delay: burstAt,
            })
          )
        )
      );
      for (const eye of S.eyes) {
        burst(S, eye, {
          home: { x: Number(eye.dataset.cx), y: Number(eye.dataset.cy) },
          from: { x: 0, y: 0 },
          centre: { x: MIDDLE, y: MIDDLE },
          floor,
          r: 0.5,
          px: S.m,
          delay: burstAt,
        });
      }
      squeeze(S);
      // Expired's tiles stay, their letters the verdict's copies; the other codes' letters leave with the line.
      if (m !== "expired") {
        leave(S, S.letters);
      }
      leave(S, S.readout);
      part(S, S.scenes.code, [{ opacity: 1 }, { opacity: 0 }], { duration: D.control, easing: E.out, delay: gone });
      arriveEnding(S, m, gone);
    }
  };

  return { jobs: jobs.filter(Boolean), write, animate };
}

/** Plays `m` on `list`'s stages: their reads, then their writes, then their animations, in one frame. */
function playStages(list, m) {
  const plans = list.map((S) => plan(S, m));
  const jobs = plans.flatMap((p) => p.jobs);
  for (const p of plans) {
    p.write();
  }
  for (const job of jobs) {
    job.lay();
  }
  for (const job of jobs) {
    job.measure();
  }
  for (const p of plans) {
    p.animate();
  }
}

/* ------------------------------------------------------- controls */

/** Puts both stages in the moment `m` plays from, at once (the preview's own step, no part of the design's motion). */
function snap(m) {
  for (const S of stages) {
    // The from-state's ping starts only where the moment keeps it.
    rest(S, FROM[m], { still: true, ping: m === "lastminute" });
  }
  for (const b of document.querySelectorAll("[data-moment]")) {
    b.setAttribute("aria-pressed", String(b.dataset.moment === m));
  }
}

/** Plays `m` on both stages: every part of both issued in one frame. */
function goAll(m) {
  playStages(stages, m);
}

const nextFrame = () => new Promise((done) => requestAnimationFrame(() => done()));

/** The from-state drawn on a frame of its own, then the moment played from it. */
async function play(m) {
  snap(m);
  await nextFrame();
  await nextFrame();
  goAll(m);
}

/**
 * The frames stand at their real widths, side by side where they fit and
 * one above the other where they don't; a frame wider than the window is
 * drawn whole at the scale that fits it, never cut or scrolled.
 */
function fitFrames() {
  const frames = document.querySelector(".frames");
  const style = getComputedStyle(frames);
  const room =
    frames.clientWidth - Number.parseFloat(style.paddingInlineStart) - Number.parseFloat(style.paddingInlineEnd);
  for (const fit of document.querySelectorAll(".fit")) {
    const viewport = fit.querySelector(".viewport");
    const width = viewport.offsetWidth;
    const scale = Math.min(1, room / width);
    fit.style.setProperty("--fit", String(scale));
    fit.style.inlineSize = `${width * scale}px`;
    fit.style.blockSize = `${viewport.offsetHeight * scale}px`;
  }
}

async function start() {
  readTokens();
  root.style.setProperty("--breath-phase", `${-((performance.timeOrigin + performance.now()) % (2 * D.breath))}ms`);
  await document.fonts.ready;
  await Promise.all(
    [...DRAWINGS, ...DRAWINGS.map((p) => `${p}-night`), "badge", "badge-shut"].map((p) => {
      const img = new Image();
      img.src = `./caw/${p}.png`;
      return img.decode().catch(() => undefined);
    })
  );
  for (const viewport of document.querySelectorAll(".viewport")) {
    build(viewport);
  }
  // The stage stands as tall as its tallest moment, so nothing below moves.
  for (const S of stages) {
    measureHeights(S);
    rest(S, "waiting", { still: true });
    placeDots(S, Math.max(S.heights.code, ...Object.values(S.heights.outcome), ...Object.values(S.heights.device).map((h) => h.in)));
    S.stage.style.setProperty("--stage-h", `${S.stage.offsetHeight + 24}px`);
  }
  fitFrames();
  // The frames' room is the window's width: refit as it changes, read off the page's bar, as wide
  // as the window and sized by nothing the refit moves. (Observed, the frames saw their own refit
  // change their height, a loop WebKit reports as an error; the window's resize event, on the
  // proof's WebKit, once left a jump from 1440 to 390 unfitted.)
  new ResizeObserver(fitFrames).observe(document.querySelector(".bar"));
  // The dots' canvases follow the screen's pixel density (a zoom, another screen).
  const watchDensity = () =>
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      "change",
      () => {
        for (const S of stages) {
          placeDots(S, S.dotsTall);
        }
        drawSoon();
        watchDensity();
      },
      { once: true }
    );
  watchDensity();
  // Day and night follow the system as it turns.
  night.addEventListener("change", () => {
    for (const S of stages) {
      S.caw.src = cawSrc(S.pose);
    }
  });

  const list = document.querySelector('[data-slot="moments"]');
  for (const [m, label] of MOMENTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.moment = m;
    b.textContent = label;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => play(m));
    list.append(b);
  }
  document.querySelector('[data-slot="replay"]').addEventListener("click", () => play(last));
  play("waiting");
  document.documentElement.dataset.ready = "";
}

/** The proof's handle: play a moment, land the hub's data by hand. */
window.preview = {
  play,
  snap,
  go: goAll,
  stages,
  keepOut: KEEP_OUT,
  /**
   * A card's dots as the canvas draws them now (the proof reads them here:
   * a canvas holds no element per dot): whether a play's clock moves them,
   * the canvas's own px, and each dot's disc centre and radius in those px
   * with its move (px), scale and opacity.
   */
  dotsOf(layout) {
    const S = stages.find((s) => s.layout === layout);
    const r = DOT_R * S.m;
    return {
      live: Boolean(S.dotRun && !S.dotRun.loop),
      m: S.m,
      r,
      dots: dotsNow(S).map((p, i) => ({
        cx: S.dotsAt.x + (DOTS[i].x + 0.5 + p.x) * S.m,
        cy: S.dotsAt.y + (DOTS[i].y + 0.5 + p.y) * S.m,
        r: r * p.s,
        tx: p.x * S.m,
        ty: p.y * S.m,
        s: p.s,
        o: p.o,
      })),
    };
  },
  manualHub(on) {
    settings.hub = on ? "manual" : "auto";
  },
  /** Holds the clock's seconds still (the countdown, "asked 8s ago"), for a held read. */
  stillClock(on) {
    settings.ticks = !on;
  },
  landRecord() {
    for (const S of stages) {
      landRecord(S);
    }
  },
  landPlace() {
    for (const S of stages) {
      landPlace(S);
    }
  },
};

start();
