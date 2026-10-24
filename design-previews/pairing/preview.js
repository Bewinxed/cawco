/**
 * The pairing card, played moment by moment (the design's §C tables).
 *
 * How a moment plays: the card is put in the moment it plays from at once,
 * then `go(moment)` sets the new moment's resting state at once and, in the
 * same frame, issues every part's animation from where it was drawn, each
 * with `fill: backwards`, so its last keyframe is the resting style itself:
 * nothing holds, nothing snaps when a run ends, and nothing waits on a timer
 * (the only timers here are the hub's data: the device record landing, a
 * place lookup, the clock's seconds). Parts move by transform and opacity;
 * the band and ring are registered properties on CSS transitions; the
 * card's height tweens on the drawer curve.
 */
import { MorphText } from "./lib/morph.js";
import { CRACK, FALL, pointsOf, SHARDS } from "./lib/shards.js";

/* ---------------------------------------------------------------- data */

/** The QR: version 4 (33 modules), ECC H, the badge's square (modules 11 to 21) cleared. */
const MODULES = 33;
const HOLE = { from: 11, to: 22 };
/** The 6×6 cluster grid's edges, in modules: whole modules but at the badge's middle. */
const EDGES = [0, 6, 11, 16.5, 22, 27, 33];
const CODE = "JWKHDQ";
/** Where the open beak is in the swallowing drawing, as fractions of Caw's box (measured on tk_H9hHoUZygKjL5CQPYzv7I). */
const BEAK = [0.58, 0.72];

const POSE = {
  asking: "asking",
  waiting: "waiting",
  lastminute: "lastminute",
  checking: "checking",
  swallowing: "swallowing",
  approved: "approved",
  denied: "denied",
  expired: "expired",
  nomatch: "denied",
  failed: "denied",
};

const TITLE = {
  code: "Scan with the CawCo app",
  device: "A phone wants in",
  approved: "Paired",
  denied: "Not let in",
  expired: "That code expired",
  nomatch: "That scan didn't match",
  failed: "Pairing didn't start",
};

const READOUT = {
  asking: "Getting a code…",
  waiting: "Or approve it in Needs you, or Configure › Devices.",
};

const OUTCOME = {
  approved: { said: "Bewin's iPhone can run the fleet.", link: true },
  denied: { said: "Bewin's iPhone was denied.", button: "New code" },
  expired: { said: "Codes last five minutes.", button: "New code" },
  nomatch: {
    said: "That scan was for another code. Make a new one and scan it.",
    button: "New code",
  },
  failed: {
    said: "Pairing is off on this hub. Turn it on in Configure › Devices, then try again.",
    button: "Retry",
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
const WIRE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${STROKES.join("")}"/></svg>`;
const WIRE_MASK = `url("data:image/svg+xml,${encodeURIComponent(WIRE_SVG)}")`;

/** Each moment's control, and the moment it plays from. */
const MOMENTS = [
  ["asking", "Asking", "expired"],
  ["waiting", "Waiting", "asking"],
  ["lastminute", "Last minute", "waiting"],
  ["checking-public", "Checking · public", "waiting"],
  ["checking-tailnet", "Checking · tailnet", "waiting"],
  ["checking-lan", "Checking · LAN", "waiting"],
  ["approved", "Approved", "checking-public"],
  ["denied", "Denied", "checking-public"],
  ["expired", "Expired", "lastminute"],
  ["nomatch", "Scan matches nothing", "waiting"],
  ["failed", "Failed before a code", "asking"],
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
function readTokens() {
  for (const n of [
    "control",
    "exit",
    "morph",
    "fade",
    "pop",
    "panel",
    "settle",
    "cascade",
    "stagger",
    "loop",
  ]) {
    D[n] = ms(`--dur-${n}`);
  }
  D.breath = ms("--breath");
  D.pingSpread = Number.parseFloat(token("--c-change-ping-spread")) || 10;
  for (const n of ["out", "in-out", "drawer", "glide-in"]) {
    E[n] = token(`--ease-${n}`);
  }
}

const reduced = matchMedia("(prefers-reduced-motion: reduce)");

/* -------------------------------------------------------------- state */

const settings = { fork: "approve", hub: "auto", ticks: true };
const stages = [];
let last = "waiting";

function kindOf(m) {
  if (m === "asking" || m === "waiting" || m === "lastminute") {
    return "code";
  }
  return m.startsWith("checking") ? "device" : "outcome";
}
function outcomeOf(m) {
  if (m === "approved") {
    return "done";
  }
  return m === "denied" || m === "nomatch" || m === "failed" ? "fail" : "";
}

/* ------------------------------------------------------------- build */

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
    title: new MorphText($(".title")),
    titleEl: $(".title"),
    card: $(".card"),
    ping: $(".ping"),
    scenes: {
      code: $(".scene-code"),
      device: $(".scene-device"),
      outcome: $(".scene-outcome"),
    },
    well: $(".well"),
    recess: $(".recess"),
    clusters: [],
    badge: $(".badge"),
    letters: $(".letters"),
    tiles: [],
    readout: $(".readout"),
    dot: $(".readout .dot"),
    words: new MorphText($(".readout .words"), { wrap: true }),
    wire: $(".wire"),
    strokes: [],
    facts: $(".facts"),
    addr: $(".addr"),
    second: $(".second"),
    ago: $(".ago"),
    deny: $('[data-act="deny"]'),
    approve: $('[data-act="approve"]'),
    said: $(".said"),
    link: $('[data-act="devices"]'),
    again: $('[data-act="again"]'),
    debris: $(".debris"),
    flight: $(".flight"),
    moment: null,
    network: "public",
    pingRun: null,
    timers: [],
    runs: [],
  };

  // Sizes: the card's width, and the QR in whole modules inside it.
  const cardW = layout === "phone" ? 366 : 335;
  const pad = 18;
  const m = Math.floor((cardW - 2 - 2 * pad - 18) / MODULES);
  const q = m * MODULES;
  const holeAt = HOLE.from * m;
  const holeW = (HOLE.to - HOLE.from) * m;
  Object.assign(S, { cardW, m, q });
  stage.style.setProperty("--card-w", `${cardW}px`);
  stage.style.setProperty("--q", `${q}px`);
  stage.style.setProperty("--m", `${m}px`);
  stage.style.setProperty("--badge", `${holeW - 2 * m}px`);
  stage.style.setProperty("--badge-at", `${holeAt + m}px`);
  const cawSize = layout === "phone" ? 64 : 80;
  S.caw.width = cawSize;
  S.caw.height = cawSize;

  // 32 clusters: the 6×6 grid of the one QR image, the badge's four cells left empty.
  const holder = $(".clusters");
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      if (row >= 2 && row <= 3 && col >= 2 && col <= 3) {
        continue;
      }
      const el = document.createElement("div");
      el.className = "cluster";
      const x = EDGES[col] * m;
      const y = EDGES[row] * m;
      const w = (EDGES[col + 1] - EDGES[col]) * m;
      const h = (EDGES[row + 1] - EDGES[row]) * m;
      Object.assign(el.style, {
        insetInlineStart: `${x}px`,
        insetBlockStart: `${y}px`,
        inlineSize: `${w}px`,
        blockSize: `${h}px`,
        maskPosition: `${-x}px ${-y}px`,
      });
      el.dataset.cx = String(x + w / 2);
      el.dataset.cy = String(y + h / 2);
      holder.append(el);
      S.clusters.push(el);
    }
  }

  for (const letter of CODE) {
    const tile = document.createElement("span");
    tile.className = "tile";
    tile.textContent = letter;
    S.letters.append(tile);
    S.tiles.push(tile);
  }

  // The wireframe: one inline svg per stroke, so each can travel alone.
  for (const d of STROKES) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 96 96");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
    S.wire.append(svg);
    S.strokes.push(svg);
  }

  S.approve.addEventListener("click", () => playStages([S], "approved"));
  S.deny.addEventListener("click", () => playStages([S], "denied"));
  S.again.addEventListener("click", () => playStages([S], "asking"));
  S.link.addEventListener("click", (event) => event.preventDefault());

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

function fillOutcome(S, m) {
  const out = OUTCOME[m];
  if (!out) {
    return;
  }
  S.said.textContent = out.said;
  S.link.hidden = !out.link;
  S.again.hidden = !out.button;
  S.again.textContent = out.button ?? "";
  S.scenes.outcome.toggleAttribute("data-has-button", Boolean(out.button));
}

/**
 * The card's height in each moment, measured once as the page starts (the
 * scene's own height and the card's two 1px edges), so a moment's first
 * frame reads no layout to find it.
 */
function measureHeights(S) {
  const of = (kind) => S.scenes[kind].offsetHeight + 2;
  const heights = { code: 0, device: {}, outcome: {} };
  heights.code = of("code");
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

function setHeight(S, h) {
  S.height = h;
  S.card.style.blockSize = `${h}px`;
}

/** The ping's loop: a ring leaving the card's contour each --dur-loop, from the breath's next wall-clock multiple at least `after` ms on. */
function startPing(S, after = 0) {
  stopPing(S);
  const spread = D.pingSpread;
  const sx = (S.cardW + 2 * spread) / S.cardW;
  const sy = (S.height + 2 * spread) / S.height;
  const now = performance.timeOrigin + performance.now();
  const at = Math.ceil((now + after) / D.breath) * D.breath;
  S.pingRun = S.ping.animate(
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: `scale(${sx}, ${sy})` },
    ],
    {
      duration: D.loop,
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
  }
  S.pingRun = null;
}

function stopPing(S) {
  S.pingRun?.cancel();
  S.pingRun = null;
  for (const ring of S.ping.getAnimations()) {
    ring.cancel();
  }
}

function clearTimers(S) {
  for (const t of S.timers) {
    clearInterval(t);
    clearTimeout(t);
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
 * Puts the card in moment `m`'s resting state. `still`: at once, the band
 * and ring too (the moment a play starts from); otherwise the band and ring
 * take their CSS transitions and every part is left for the caller to
 * animate into this state.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one resting state per moment, set field by field in the card's order
function rest(S, m, { still = false, keepPing = false, ping = true } = {}) {
  for (const held of S.runs) {
    held.cancel();
  }
  S.runs = [];
  S.debris.replaceChildren();
  S.flight.replaceChildren();
  clearTimers(S);
  if (!keepPing) {
    stopPing(S);
  }
  const kind = kindOf(m);
  S.moment = m;

  for (const [name, scene] of Object.entries(S.scenes)) {
    scene.toggleAttribute("data-on", name === kind);
    scene.inert = name !== kind;
  }

  // The code.
  const codeUp = m === "waiting" || m === "lastminute";
  const codeScene = kind === "code";
  for (const el of S.clusters) {
    el.style.opacity = codeUp ? "1" : "0";
    el.style.visibility = "";
  }
  for (const el of S.tiles) {
    el.style.visibility = "";
  }
  S.letters.style.opacity = codeUp ? "1" : "0";
  S.badge.src = "./caw/badge.png";
  S.badge.style.visibility = codeScene ? "" : "hidden";
  S.recess.style.visibility = codeScene ? "" : "hidden";
  S.dot.style.opacity = m === "asking" ? "1" : "0";
  S.words.put(
    m === "lastminute"
      ? "This code ends in 0:42"
      : (READOUT[m] ?? READOUT.waiting)
  );
  S.wire.style.visibility = "";

  // The device.
  if (kind === "device") {
    fillDevice(S, m.split("-")[1], { recordIn: true, placeIn: true });
  }
  fillOutcome(S, m);

  // The edge.
  const { card } = S;
  if (still) {
    card.style.transition = "none";
  }
  card.style.setProperty("--band-dur", "var(--dur-pop)");
  card.style.setProperty("--band-delay", "0ms");
  card.style.setProperty("--ring-delay", "0ms");
  const busy = m === "asking";
  card.toggleAttribute("data-busy", busy);
  if (busy) {
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
  if (still) {
    getComputedStyle(card).getPropertyValue("--band");
    card.style.transition = "";
  }

  setHeight(S, heightFor(S, m));
  S.title.put(TITLE[kind === "outcome" ? m : kind]);
  S.caw.src = `./caw/${POSE[m.split("-")[0]]}.png`;
  if (codeUp && ping && !keepPing) {
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
function part(
  S,
  el,
  keyframes,
  { duration, easing, delay = 0, composite, fill = "both" }
) {
  const anim = el.animate(keyframes, {
    duration,
    easing,
    delay,
    fill,
    composite,
  });
  anim.id = "part";
  S.runs.push(anim);
  return anim;
}

/** The card's height from `from` to its resting height. */
function fold(
  S,
  from,
  { delay = 0, duration = D.panel, easing = E.drawer } = {}
) {
  const to = S.card.style.blockSize;
  if (`${from}px` === to) {
    return;
  }
  part(S, S.card, [{ blockSize: `${from}px` }, { blockSize: to }], {
    duration,
    easing,
    delay,
  });
}

const fadeOut = (S, el, { delay = 0, duration = D.exit, scale = true } = {}) =>
  part(
    S,
    el,
    scale
      ? [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "scale(0.95)" },
        ]
      : [{ opacity: 1 }, { opacity: 0 }],
    { duration, easing: E.out, delay }
  );

const fadeIn = (S, el, { delay = 0, duration = D.pop, from = 0.95 } = {}) =>
  part(
    S,
    el,
    from === 1
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: `scale(${from})` },
          { opacity: 1, transform: "none" },
        ],
    { duration, easing: E.out, delay }
  );

/** `el`'s box in `within`'s coordinates. */
function boxIn(el, within) {
  const a = el.getBoundingClientRect();
  const b = within.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

/**
 * The shatter (C4), drawn: the subject's drawing cut into the 16 shards at
 * the box read before anything changed (`box`, in the debris layer's
 * coordinates), the badge whole beside them. Answers the animations to run.
 */
function shatter(S, subject, box, { badgeAt, fromHeight }) {
  const pending = [];
  for (const shard of SHARDS) {
    const pts = pointsOf(shard.clip);
    const xs = pts.map(([px]) => px);
    const ys = pts.map(([, py]) => py);
    const [minX, maxX, minY, maxY] = [
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...ys),
      Math.max(...ys),
    ];
    const x = box.x + (box.w * minX) / 100;
    const y = box.y + (box.h * minY) / 100;
    const w = (box.w * (maxX - minX)) / 100;
    const h = (box.h * (maxY - minY)) / 100;
    const el = document.createElement("div");
    el.className = "shard";
    el.dataset.shard = shard.id;
    const rel = pts
      .map(
        ([px, py]) =>
          `${(((px - minX) / (maxX - minX)) * 100).toFixed(2)}% ${(((py - minY) / (maxY - minY)) * 100).toFixed(2)}%`
      )
      .join(", ");
    const cx = (box.w * shard.centroid[0]) / 100 + box.x - x;
    const cy = (box.h * shard.centroid[1]) / 100 + box.y - y;
    Object.assign(el.style, {
      insetInlineStart: `${x}px`,
      insetBlockStart: `${y}px`,
      inlineSize: `${w}px`,
      blockSize: `${h}px`,
      clipPath: `polygon(${rel})`,
      transformOrigin: `${cx}px ${cy}px`,
    });
    el.style.setProperty("--shard-ground", subject.ground);
    el.style.setProperty("--shard-ink", subject.ink);
    el.style.setProperty("--shard-mask", subject.mask);
    el.style.setProperty("--shard-size", subject.size);
    el.style.setProperty(
      "--shard-at",
      `${subject.at[0] - (x - box.x)}px ${subject.at[1] - (y - box.y)}px`
    );
    S.debris.append(el);
    const dirX = shard.centroid[0] - 50;
    const dirY = shard.centroid[1] - 50;
    const len = Math.hypot(dirX, dirY) || 1;
    const crack = `translate(${((dirX / len) * CRACK.offsetPx).toFixed(2)}px, ${((dirY / len) * CRACK.offsetPx).toFixed(2)}px)`;
    const fall = `translate(${((shard.driftX / 100) * box.w).toFixed(2)}px, ${(fromHeight - y + h).toFixed(1)}px) rotate(${shard.rotate}deg)`;
    pending.push(() => {
      part(S, el, [{ transform: "none" }, { transform: crack }], {
        duration: D.control,
        easing: E.out,
      });
      return part(S, el, [{ transform: "none" }, { transform: fall }], {
        duration: D.settle,
        easing: E["glide-in"],
        delay: FALL.startAfterCrack + shard.stagger,
        composite: "add",
      });
    });
  }
  if (badgeAt) {
    const copy = document.createElement("img");
    copy.className = "badge";
    copy.alt = "";
    copy.src = "./caw/badge-shut.png";
    Object.assign(copy.style, {
      insetInlineStart: `${badgeAt.x}px`,
      insetBlockStart: `${badgeAt.y}px`,
    });
    S.debris.append(copy);
    const fall = `translate(-6px, ${(fromHeight - badgeAt.y + badgeAt.h).toFixed(1)}px) rotate(-14deg)`;
    pending.push(() =>
      part(S, copy, [{ transform: "none" }, { transform: fall }], {
        duration: D.settle,
        easing: E["glide-in"],
      })
    );
  }
  return () => {
    const out = pending.map((begin) => begin());
    Promise.all(out.map((r) => r.finished)).then(
      () => {
        if (S.runs.includes(out[0])) {
          S.debris.replaceChildren();
        }
      },
      () => undefined
    );
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

/** A late place row arrives through morph(): the card tweens to its new height as the row fades in. */
function landPlace(S) {
  if (!S.second.hidden || kindOf(S.moment) !== "device") {
    return;
  }
  const from = S.height;
  S.second.hidden = false;
  setHeight(S, heightFor(S, S.moment, { placeIn: true }));
  fold(S, from, { duration: D.morph });
  part(S, S.second, [{ opacity: 0 }, { opacity: 1 }], {
    duration: D.morph,
    easing: E.out,
  });
}

/* ------------------------------------------------------- moments */

/**
 * Plays moment `m` from where the card stands, in phases a page of several
 * stages runs together (`playStages`), so the frame that starts it lays
 * the page out as few times as it can: `plan` reads every box the motion
 * starts from; the plan's `write` puts the card in its resting state and
 * draws the shards and flights; the MorphTexts read and write their
 * letters; `animate` issues every part's animation.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the design's §C tables, one branch per moment, read in the order the tables run
function plan(S, m) {
  const was = { moment: S.moment, height: S.height };
  const kindWas = kindOf(was.moment);
  const kind = kindOf(m);
  const { fork } = settings;
  const flat = reduced.matches;
  const shattering =
    m === "denied" || m === "expired" || m === "nomatch" || m === "failed";
  const keepPing = m === "lastminute" && was.moment === "waiting";
  const delay240 = 4 * D.stagger;
  const swallowCode =
    !flat && kind === "device" && kindWas === "code" && fork === "scan";
  const swallowDevice = !flat && m === "approved" && fork === "approve";

  // Reads: every box the motion starts from.
  let parts = [];
  if (swallowCode) {
    parts = [
      ...S.clusters.map((el) => ({ el })),
      { el: S.badge },
      ...S.tiles.map((el) => ({ el })),
    ];
  }
  if (swallowDevice) {
    const scale = S.wire.getBoundingClientRect().width / 96;
    parts = S.strokes.map((svg) => {
      const b = svg.querySelector("path").getBBox();
      return {
        el: svg,
        centre: (at) => ({
          x: at.x + (b.x + b.width / 2) * scale,
          y: at.y + (b.y + b.height / 2) * scale,
        }),
      };
    });
  }
  const boxes = parts.map((p) => boxIn(p.el, S.stage));
  const caw = parts.length ? boxIn(S.caw, S.stage) : null;
  let shards = null;
  if (shattering && !flat) {
    const code = kindWas === "code";
    const inner = (el) => {
      const b = boxIn(el, S.card);
      return { ...b, x: b.x - 1, y: b.y - 1 };
    };
    shards = {
      box: inner(m === "denied" ? S.wire : S.recess),
      badgeAt: code ? inner(S.badge) : null,
      subject:
        m === "denied"
          ? {
              ground: "transparent",
              ink: "var(--ink-muted)",
              mask: WIRE_MASK,
              size: `${S.wire.offsetWidth}px ${S.wire.offsetWidth}px`,
              at: [0, 0],
            }
          : {
              ground: "var(--surface-recess)",
              ink:
                was.moment === "asking" ? "transparent" : "var(--ink-strong)",
              mask: was.moment === "asking" ? "none" : 'url("./qr.svg")',
              size: `${S.q}px ${S.q}px`,
              at: [S.m, S.m],
            },
    };
  }
  const morph = { duration: D.morph, easing: E.out, fade: flat };
  // The words change with the fold: at 240ms where the fold waits for the swallow or the crack, else at once.
  const late =
    (kind === "device" && fork === "scan") || swallowDevice || shattering;
  const titleAt = !flat && late ? delay240 : 0;
  const jobs = [
    S.title.prepare(TITLE[kind === "outcome" ? m : kind], {
      ...morph,
      delay: titleAt,
    }),
  ];
  if (!flat && m === "waiting") {
    jobs.push(
      S.words.prepare(READOUT.waiting, { ...morph, delay: D.cascade - D.pop })
    );
  }
  if (!flat && m === "lastminute") {
    jobs.push(S.words.prepare("This code ends in 0:42", morph));
  }

  let shatterRuns = null;
  let flights = [];

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each moment's resting state, then what leaves by flight or shatter
  const write = () => {
    last = m;
    if (!keepPing) {
      finishPing(S);
    }
    rest(S, m, { keepPing });
    const { card } = S;
    if (m === "waiting") {
      card.style.setProperty("--band-dur", "var(--dur-exit)");
      card.style.setProperty("--band-delay", `${D.cascade - D.pop}ms`);
    }
    if (swallowDevice) {
      card.style.setProperty("--ring-delay", `${delay240}ms`);
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
    // What leaves by flight or shatter is drawn as its copies now, its own drawing hidden.
    if (swallowCode) {
      S.recess.style.visibility = "visible";
      for (const el of [...S.clusters, S.badge, ...S.tiles]) {
        el.style.visibility = "hidden";
      }
    }
    if (kind === "device" && fork === "approve" && kindWas === "code") {
      S.badge.style.visibility = "visible";
      S.recess.style.visibility = "visible";
      for (const el of S.clusters) {
        el.style.opacity = "1";
      }
      S.letters.style.opacity = "1";
    }
    if (swallowDevice) {
      S.wire.style.visibility = "hidden";
    }
    if (parts.length) {
      S.caw.src = "./caw/swallowing.png";
      flights = drawFlights(S, parts, boxes, caw);
    }
    if (shards) {
      shatterRuns = shatter(S, shards.subject, shards.box, {
        badgeAt: shards.badgeAt,
        fromHeight: was.height,
      });
      if (kindWas === "code") {
        S.letters.style.opacity = was.moment === "asking" ? "0" : "1";
      } else {
        S.wire.style.visibility = "hidden";
      }
    }
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one branch per moment's table (C1 to C5)
  const animate = () => {
    for (const job of jobs) {
      if (job) {
        S.runs.push(...job.start());
      }
    }
    if (flat) {
      // Less motion: what leaves fades, the height lands, what arrives fades in.
      if (kindWas !== kind) {
        part(S, S.scenes[kindWas], [{ opacity: 1 }, { opacity: 0 }], {
          duration: D.fade,
          easing: E.out,
        });
        part(S, S.scenes[kind], [{ opacity: 0 }, { opacity: 1 }], {
          duration: D.fade,
          easing: E.out,
        });
      } else if (m === "waiting") {
        for (const el of [...S.clusters, S.letters]) {
          part(S, el, [{ opacity: 0 }, { opacity: 1 }], {
            duration: D.fade,
            easing: E.out,
          });
        }
      }
      return;
    }
    if (m === "asking") {
      // C5: New code → asking.
      fold(S, was.height);
      part(S, S.scenes[kindWas], [{ opacity: 1 }, { opacity: 0 }], {
        duration: D.exit,
        easing: E.out,
      });
      fadeIn(S, S.recess);
      fadeIn(S, S.badge);
      part(S, S.readout, [{ opacity: 0 }, { opacity: 1 }], {
        duration: D.morph,
        easing: E.out,
      });
    } else if (m === "waiting") {
      // C1: the code grows in, centre out, none crossing the badge.
      const centre = (HOLE.from + (HOLE.to - HOLE.from) / 2) * S.m;
      const ds = S.clusters.map((el) =>
        Math.hypot(el.dataset.cx - centre, el.dataset.cy - centre)
      );
      const near = Math.min(...ds);
      const far = Math.max(...ds);
      S.clusters.forEach((el, i) => {
        part(
          S,
          el,
          [
            { opacity: 0, transform: "scale(0.92)" },
            { opacity: 1, transform: "none" },
          ],
          {
            duration: D.pop,
            easing: E.out,
            delay: ((ds[i] - near) / (far - near)) * (D.cascade - D.pop),
          }
        );
      });
      fadeIn(S, S.letters, { delay: D.cascade - D.pop });
      part(S, S.dot, [{ opacity: 1 }, { opacity: 0 }], {
        duration: D.morph,
        easing: E.out,
        delay: D.cascade - D.pop,
      });
      startPing(S, D.cascade);
    } else if (kind === "device" && fork === "approve") {
      // C2: the code leaves in place, the card folds, the device arrives.
      part(S, S.scenes.code, [{ opacity: 1 }, { opacity: 0 }], {
        duration: D.exit,
        easing: E.out,
      });
      for (const el of [...S.clusters, S.badge, S.letters]) {
        part(S, el, [{ transform: "none" }, { transform: "scale(0.95)" }], {
          duration: D.exit,
          easing: E.out,
        });
      }
      fold(S, was.height);
      fadeIn(S, S.scenes.device);
    } else if (kind === "device" && fork === "scan") {
      // The fork: the code streams into Caw's beak at the scan; the device arrives as it lands.
      part(S, S.scenes.code, [{ opacity: 1 }, { opacity: 0 }], {
        duration: D.exit,
        easing: E.out,
      });
      fly(S, flights, "checking");
      fold(S, was.height, { delay: delay240 });
      fadeIn(S, S.scenes.device, { delay: delay240 });
    } else if (m === "approved" && fork === "approve") {
      // C3: the device streams into Caw's beak; the card folds behind it.
      fly(S, flights, "approved");
      fadeOut(S, S.scenes.device);
      fold(S, was.height, { delay: delay240 });
      fadeIn(S, S.scenes.outcome, { delay: delay240, from: 1 });
    } else if (m === "approved") {
      // The fork's Approve: a plain fold.
      fadeOut(S, S.scenes.device);
      fold(S, was.height);
      fadeIn(S, S.scenes.outcome, { from: 1 });
    } else if (shattering) {
      // C4: any dead end shatters the drawing in the well.
      shatterRuns();
      part(S, S.scenes[kindWas], [{ opacity: 1 }, { opacity: 0 }], {
        duration: D.exit,
        easing: E.out,
        delay: FALL.startAfterCrack,
      });
      fold(S, was.height, { delay: delay240 });
      fadeIn(S, S.scenes.outcome, { delay: delay240, from: 1 });
    }
  };

  return { jobs: jobs.filter(Boolean), write, animate };
}

/** The copies that fly, drawn where their parts stood, each aimed at the beak. */
function drawFlights(S, parts, boxes, caw) {
  const beak = { x: caw.x + caw.w * BEAK[0], y: caw.y + caw.h * BEAK[1] };
  return parts.map(({ el, centre }, i) => {
    const at = boxes[i];
    const copy = el.cloneNode(true);
    copy.style.removeProperty("visibility");
    copy.style.opacity = "0";
    Object.assign(copy.style, {
      insetInlineStart: `${at.x}px`,
      insetBlockStart: `${at.y}px`,
      inlineSize: `${at.w}px`,
      blockSize: `${at.h}px`,
      transform: "",
    });
    const c = centre ? centre(at) : { x: at.x + at.w / 2, y: at.y + at.h / 2 };
    copy.style.transformOrigin = `${c.x - at.x}px ${c.y - at.y}px`;
    S.flight.append(copy);
    return {
      copy,
      dx: beak.x - c.x,
      dy: beak.y - c.y,
      d: Math.hypot(beak.x - c.x, beak.y - c.y),
    };
  });
}

/**
 * The swallow (C3's stroke motion): each copy flies into Caw's beak,
 * nearest the beak first over 0–4 staggers, shrinking to 0.15 and fading
 * over its last 40%. Caw takes `after` once the last lands.
 */
function fly(S, flights, after) {
  const near = Math.min(...flights.map((f) => f.d));
  const far = Math.max(...flights.map((f) => f.d));
  const runs = flights.map(({ copy, dx, dy, d }) =>
    part(
      S,
      copy,
      [
        { transform: "none", opacity: 1 },
        { opacity: 1, offset: 0.6 },
        {
          transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.15)`,
          opacity: 0,
        },
      ],
      {
        duration: D.panel,
        easing: E["in-out"],
        delay: far > near ? ((d - near) / (far - near)) * 4 * D.stagger : 0,
      }
    )
  );
  Promise.all(runs.map((r) => r.finished)).then(
    () => {
      if (S.runs.includes(runs[0])) {
        S.caw.src = `./caw/${after}.png`;
        S.flight.replaceChildren();
      }
    },
    () => undefined
  );
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
    job.read();
  }
  for (const job of jobs) {
    job.shift();
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

const nextFrame = () =>
  new Promise((done) => requestAnimationFrame(() => done()));

/** The from-state drawn on a frame of its own, then the moment played from it. */
async function play(m) {
  snap(m);
  await nextFrame();
  await nextFrame();
  goAll(m);
}

function setFork(fork) {
  settings.fork = fork;
  for (const b of document.querySelectorAll("[data-fork]")) {
    b.setAttribute("aria-pressed", String(b.dataset.fork === fork));
  }
}

async function start() {
  readTokens();
  root.style.setProperty(
    "--breath-phase",
    `${-((performance.timeOrigin + performance.now()) % (2 * D.breath))}ms`
  );
  await document.fonts.ready;
  await Promise.all(
    [...new Set(Object.values(POSE)), "badge", "badge-shut"].map((p) => {
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
    const tallest = S.stage.offsetHeight;
    S.stage.style.setProperty("--stage-h", `${tallest + 12}px`);
  }

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
  document
    .querySelector('[data-slot="replay"]')
    .addEventListener("click", () => play(last));
  for (const b of document.querySelectorAll("[data-fork]")) {
    b.addEventListener("click", () => setFork(b.dataset.fork));
  }
  play("waiting");
  document.documentElement.dataset.ready = "";
}

/** The proof's handle: play a moment, choose the fork, land the hub's data by hand. */
window.preview = {
  play,
  snap,
  go: goAll,
  setFork,
  stages,
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
