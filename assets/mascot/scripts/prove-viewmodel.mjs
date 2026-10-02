// Proves that caw.riv's `Caw` view model drives its state machine, and that every status plays
// its loop and holds its still under reduced motion, on Rive's official runtime
// (@rive-app/canvas-advanced, WASM) in headless Chromium.
//
// The expected pictures come from the file itself: in the same runtime, each loop's own
// animations (its pose or turn, a scheme, a motion state) are applied directly, without the state
// machine, and every drawing of every loop is rendered in light and in dark. The state machine is
// then driven only through the `Caw` view model, and every frame it renders must be exactly one of
// those pictures: a drawing of the loop its status selects, in the scheme `dark` selects, and the
// loop's first drawing (its still) whenever `reducedMotion` is on.
//
// Each run gets a fresh page and so a fresh WASM instance. Every page pins the runtime's sources of
// randomness (its clocks and crypto.getRandomValues, see SEED_RANDOM) before the runtime loads, and
// the file runs twice to show the random loading/reconnecting turns are pinned.
//
// usage: node prove-viewmodel.mjs [--riv caw.riv] [--frames dir]
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const STATUS = [
  "ready",
  "working",
  "needs_you",
  "idle",
  "done",
  "trying",
  "loading",
  "reconnecting",
];
/** Loops per status (assets/mascot/loops), and the animation that plays each. */
const PLAIN = {
  ready: "ready",
  working: "working",
  needs_you: "needs-you",
  idle: "idle",
  done: "done",
  trying: "trying",
};
const TURNS = {
  loading: ["feather", "dots", "peer"],
  reconnecting: ["reach", "search", "hop"],
};
const ADVANCE_S = 0.5;
const SIZE = 512;
const FPS = 24;
/** How long reduced motion is watched for movement. */
const HOLD_S = 1;
/** A watch starts past the 200 ms state fade, half a frame off the drawings' keys. */
const SETTLE_S = 0.25 + 0.5 / FPS;
/** Frames watched past one full loop, to see it repeat. */
const EXTRA_FRAMES = 12;
const CHROMIUM_DIR = /^chromium-\d+$/;
const TURN_STATE = /^turn_(loading|reconnecting)_(\w+)$/;

/** `--name value` pairs. */
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith("--")) {
    args[argv[i].slice(2)] = argv[i + 1];
  }
}
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const riv = readFileSync(args.riv ?? here("../caw.riv"));

/** Every loop: its animation, the status it belongs to, and its drawings' start frames. */
const loops = [];
for (const status of STATUS) {
  const names =
    status in TURNS
      ? TURNS[status].map((v) => `${status}-${v}`)
      : [PLAIN[status]];
  for (const name of names) {
    const timing = JSON.parse(
      readFileSync(here(`../loops/${name}/timing.json`), "utf8")
    );
    loops.push({
      name,
      status,
      pose: `pose_${status}`,
      turn: status in TURNS ? `turn_${status}_${name.split("-")[1]}` : null,
      frames: timing.frames,
      starts: timing.drawings.map((d) => d.start),
    });
  }
}

/** Every status × dark × reducedMotion, then repeated loading/reconnecting entries. */
const steps = [];
for (const reducedMotion of [false, true]) {
  for (const dark of [false, true]) {
    for (let status = 0; status < STATUS.length; status += 1) {
      steps.push({ status, dark, reducedMotion });
    }
  }
}
for (let round = 0; round < 6; round += 1) {
  for (const status of [6, 0, 7, 0]) {
    steps.push({ status, dark: round % 2 === 1, reducedMotion: false });
  }
}

const runtimeDir = here("./node_modules/@rive-app/canvas-advanced/");
/**
 * Runs before the runtime and pins everything its randomness can be seeded from: the clocks the
 * WASM imports (clock_time_get, emscripten_date_now and emscripten_get_now read Date.now and
 * performance.now) stand still at a fixed epoch, and crypto.getRandomValues (Emscripten's
 * /dev/urandom) becomes a fixed-seed xorshift32 stream. The proof advances the state machine by
 * explicit times, so nothing it measures reads the clock.
 */
const SEED_RANDOM = `
const EPOCH = 1767225600000;
Date.now = () => EPOCH;
performance.now = () => 0;
let s = 0x2545f491;
Object.defineProperty(crypto, "getRandomValues", {
  value: (array) => {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      bytes[i] = s & 0xff;
    }
    return array;
  },
});
`;
const PAGE = `
import RiveFactory from "/canvas_advanced.mjs";
const STATUS = ${JSON.stringify(STATUS)};
const rive = await RiveFactory({ locateFile: (f) => "/" + f });
// A frame's identity: FNV-1a and djb2 over its RGBA, 64 bits together. Frames are compared in the
// page, so only these cross back to Node (crypto.subtle needs a secure origin, which this isn't).
function digest(d) {
  let a = 0x811c9dc5;
  let b = 5381;
  for (let i = 0; i < d.length; i++) {
    a = Math.imul(a ^ d[i], 0x01000193);
    b = (Math.imul(b, 33) + d[i]) | 0;
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
window.run = async (b64, job) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const file = await rive.load(bytes);
  const canvas = document.createElement("canvas");
  canvas.width = job.size;
  canvas.height = job.size;
  document.body.appendChild(canvas);
  const renderer = rive.makeRenderer(canvas);
  const ctx = canvas.getContext("2d");
  const snap = (ab) => {
    renderer.clear();
    renderer.save();
    renderer.align(rive.Fit.contain, rive.Alignment.center, { minX: 0, minY: 0, maxX: job.size, maxY: job.size }, ab.bounds);
    ab.draw(renderer);
    renderer.restore();
    rive.resolveAnimationFrame();
    return digest(ctx.getImageData(0, 0, job.size, job.size).data);
  };

  // Expected pictures: each loop's own animations applied directly, in layer order, no state machine.
  const still = file.artboardByName("Caw");
  const play = (name, time) => {
    const a = new rive.LinearAnimationInstance(still.animationByName(name), still);
    a.advance(time);
    a.apply(1);
    a.delete();
  };
  const expected = [];
  for (const loop of job.loops) {
    for (const dark of [false, true]) {
      loop.starts.forEach((start, drawing) => {
        // Mid-way through the drawing's first frame, clear of the key on its start.
        const t = (start + 0.5) / job.fps;
        play(loop.pose, loop.turn ? 0 : t);
        if (loop.turn) play(loop.turn, t);
        play(dark ? "scheme_dark" : "scheme_light", 0);
        play("motion_full", 0);
        still.advance(0);
        expected.push({ loop: loop.name, dark, drawing, frame: snap(still) });
      });
    }
  }

  // The state machine, driven only through the Caw view model.
  const ab = file.artboardByName("Caw");
  const sm = new rive.StateMachineInstance(ab.stateMachineByName("CawStates"), ab);
  const vm = file.defaultArtboardViewModel(ab);
  const vmi = vm.defaultInstance();
  sm.bindViewModelInstance(vmi);
  const report = {
    inputs: sm.inputCount(),
    viewModel: vm.name,
    properties: vm.getProperties(),
    enums: file.enums().map((e) => ({ name: e.name, values: e.values })),
    expected,
    steps: [],
    watches: [],
  };
  const changed = [];
  const collect = () => {
    for (let i = 0; i < sm.stateChangedCount(); i++) changed.push(sm.stateChangedNameByIndex(i));
  };
  const seek = (sec) => {
    sm.advanceAndApply(0);
    collect();
    for (let t = 0; t < sec - 1e-9; t += 1 / 60) {
      sm.advanceAndApply(Math.min(1 / 60, sec - t));
      collect();
    }
  };
  const set = (s) => {
    vmi.enum("status").value = STATUS[s.status];
    vmi.boolean("dark").value = s.dark;
    vmi.boolean("reducedMotion").value = s.reducedMotion;
    return { status: vmi.enum("status").value, dark: vmi.boolean("dark").value, reducedMotion: vmi.boolean("reducedMotion").value };
  };
  seek(0);
  for (const s of job.steps) {
    const readBack = set(s);
    changed.length = 0;
    seek(job.advance);
    report.steps.push({ readBack, states: [...changed], frame: snap(ab), png: job.keep ? canvas.toDataURL("image/png") : null });
  }
  // Each status watched over time, light, once with motion and once reduced. It is entered fresh
  // from another status, then watched from past its 200 ms fade, half a frame off the keys, one
  // frame (1/24 s) apart: with motion for one loop and job.extra frames more, reduced for job.hold.
  for (let status = 0; status < STATUS.length; status++) {
    for (const reducedMotion of [false, true]) {
      set({ status: (status + 1) % STATUS.length, dark: false, reducedMotion });
      seek(job.advance);
      set({ status, dark: false, reducedMotion });
      changed.length = 0;
      seek(job.settle);
      const states = [...changed];
      const frames = [];
      const count = reducedMotion ? Math.round(job.hold * job.fps) : job.longestFrames + job.extra;
      for (let k = 0; k < count; k++) {
        frames.push(snap(ab));
        seek(1 / job.fps);
      }
      report.watches.push({ status, reducedMotion, states, frames });
    }
  }
  return report;
};
window.ready = true;
`;

function chromiumPath() {
  const root = join(process.env.HOME, ".cache", "ms-playwright");
  const revs = existsSync(root)
    ? readdirSync(root)
        .filter((d) => CHROMIUM_DIR.test(d))
        .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
    : [];
  // Newest revision first; newer revisions ship chrome-linux64, older ones chrome-linux.
  for (const rev of revs) {
    for (const dir of ["chrome-linux64", "chrome-linux"]) {
      const exe = join(root, rev, dir, "chrome");
      if (existsSync(exe)) {
        return exe;
      }
    }
  }
  throw new Error(
    `No cached Chromium under ${root}; run: npx playwright-core install chromium`
  );
}

const ORIGIN = "http://caw.local";
const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumPath(),
});
async function run() {
  // A fresh context and page per run: a fresh WASM instance under the pinned clocks and entropy.
  const context = await browser.newContext();
  await context.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") {
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><body><script>${SEED_RANDOM}</script><script type="module">${PAGE}</script></body>`,
      });
    }
    if (path === "/canvas_advanced.mjs") {
      return route.fulfill({
        contentType: "text/javascript",
        body: readFileSync(join(runtimeDir, "canvas_advanced.mjs")),
      });
    }
    if (path.endsWith(".wasm")) {
      // The module asks for its own file name; the package ships the binary as rive.wasm.
      return route.fulfill({
        contentType: "application/wasm",
        body: readFileSync(join(runtimeDir, "rive.wasm")),
      });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[page] ${e.message}`));
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction("window.ready === true", null, {
    timeout: 60_000,
  });
  const job = {
    size: SIZE,
    fps: FPS,
    advance: ADVANCE_S,
    hold: HOLD_S,
    settle: SETTLE_S,
    extra: EXTRA_FRAMES,
    longestFrames: Math.max(...loops.map((l) => l.frames)),
    keep: Boolean(args.frames),
    loops,
    steps,
  };
  const report = await page.evaluate(
    ([b64, j]) => window.run(b64, j),
    [riv.toString("base64"), job]
  );
  await context.close();
  return report;
}

const runtimeVersion = JSON.parse(
  readFileSync(join(runtimeDir, "package.json"), "utf8")
).version;
console.log(
  `runtime: @rive-app/canvas-advanced ${runtimeVersion} on Chromium ${browser.version()}`
);
const now = await run();
const again = await run();
await browser.close();

/** frame digest → every (loop, dark, drawing) that renders exactly so. */
const pictures = new Map();
for (const e of now.expected) {
  pictures.set(e.frame, [...(pictures.get(e.frame) ?? []), e]);
}
const drawingsOf = (h) => pictures.get(h) ?? [];
const loopOfStates = (status, states) => {
  const name = STATUS[status];
  if (!(name in TURNS)) {
    return PLAIN[name];
  }
  const turn = states.map((s) => s.match(TURN_STATE)).find(Boolean);
  return turn ? `${turn[1]}-${turn[2]}` : null;
};

const picks = (r) =>
  r.steps
    .map((f) => f.states.filter((s) => s.startsWith("turn_")).join(","))
    .join("|");
const pinned = picks(now) === picks(again);
console.log(
  `random turns pinned: ${pinned ? "identical across two runs" : "DIFFERENT across two runs"}`
);
console.log(`inputs: ${now.inputs}`);
console.log(`view model: ${now.viewModel}`);
for (const p of now.properties) {
  console.log(`  ${p.name}: ${p.type}${p.enumName ? ` (${p.enumName})` : ""}`);
}
for (const e of now.enums) {
  console.log(`enum ${e.name}: ${e.values.join(", ")}`);
}
console.log(
  `expected pictures: ${now.expected.length} (${loops.length} loops, light and dark), ${pictures.size} distinct`
);

if (args.frames) {
  mkdirSync(args.frames, { recursive: true });
}
// Steps: each frame is a drawing of the selected loop in the selected scheme; its still when reduced.
// A loading/reconnecting step entered from the same status keeps the variant it already had.
let matched = 0;
const failures = [];
const turns = [];
const variant = { 6: null, 7: null };
steps.forEach((s, i) => {
  const f = now.steps[i];
  const label = `${STATUS[s.status]}${s.dark ? " dark" : ""}${s.reducedMotion ? " reducedMotion" : ""}`;
  const rb = f.readBack;
  const readOk =
    rb.status === STATUS[s.status] &&
    rb.dark === s.dark &&
    rb.reducedMotion === s.reducedMotion;
  let loop = loopOfStates(s.status, f.states);
  if (s.status in variant) {
    loop = loop ?? variant[s.status];
    variant[s.status] = loop;
  }
  const shown = drawingsOf(f.frame);
  const ok = shown.some(
    (d) =>
      d.loop === loop &&
      d.dark === s.dark &&
      (!s.reducedMotion || d.drawing === 0)
  );
  if (ok && readOk) {
    matched += 1;
  } else {
    const saw =
      shown
        .map((d) => `${d.loop}${d.dark ? " dark" : ""} #${d.drawing}`)
        .join(", ") || "no expected picture";
    failures.push(
      `step ${i} (${label}): expected ${loop}${s.dark ? " dark" : ""}${s.reducedMotion ? " #0" : ""}, saw ${saw}` +
        `${readOk ? "" : `; read back ${JSON.stringify(rb)}`}; states [${f.states.join(" ")}]`
    );
  }
  const turn = f.states.find((st) => TURN_STATE.test(st));
  if (turn) {
    turns.push(`${i}:${turn.replace("turn_", "")}`);
  }
  if (args.frames) {
    writeFileSync(
      join(args.frames, `step-${String(i).padStart(2, "0")}.png`),
      Buffer.from(f.png.split(",")[1], "base64")
    );
  }
});
console.log(
  `frames: ${matched}/${steps.length} show the loop their status selects, in the scheme dark selects (still when reducedMotion)`
);
console.log(`random turns: ${turns.join(" ")}`);

// Watches. With motion: every frame is a drawing of the status's loop, every one of its drawings
// shows within one loop, and one loop length later the same drawing is back (it loops). Reduced:
// every frame is the same picture, the loop's first drawing, its still.
let animate = 0;
let hold = 0;
for (const w of now.watches) {
  const status = STATUS[w.status];
  const loop = loopOfStates(w.status, w.states);
  const meta = loops.find((l) => l.name === loop);
  const drawings = w.frames.map(
    (f) =>
      drawingsOf(f).find((d) => d.loop === loop && !d.dark)?.drawing ?? null
  );
  const shown = drawings.map((d) => (d === null ? "?" : d)).join(" ");
  if (w.reducedMotion) {
    const ok = drawings.every((d) => d === 0) && new Set(w.frames).size === 1;
    hold += ok ? 1 : 0;
    if (!ok) {
      failures.push(
        `reducedMotion ${status} (${loop}): ${new Set(w.frames).size} distinct frames, drawings ${shown}`
      );
    }
  } else {
    const period = meta?.frames ?? 0;
    const repeats = drawings.slice(period).every((d, k) => d === drawings[k]);
    const ok =
      meta &&
      drawings.every((d) => d !== null) &&
      new Set(drawings.slice(0, period)).size === meta.starts.length &&
      repeats;
    animate += ok ? 1 : 0;
    if (ok) {
      console.log(
        `  ${status}: ${loop}, all ${meta.starts.length} drawings within ${period} frames, repeating after ${period}`
      );
    } else {
      failures.push(`loop ${status} (${loop}): drawings over time ${shown}`);
    }
  }
}
console.log(`loops animate: ${animate}/${STATUS.length}`);
console.log(`reducedMotion holds still: ${hold}/${STATUS.length}`);
for (const f of failures) {
  console.log(`  FAIL ${f}`);
}

const contractOk =
  now.inputs === 0 &&
  now.viewModel === "Caw" &&
  JSON.stringify(now.properties.map((p) => [p.name, p.type])) ===
    // The runtime names its enum DataType `enumType`.
    JSON.stringify([
      ["status", "enumType"],
      ["reducedMotion", "boolean"],
      ["dark", "boolean"],
    ]) &&
  JSON.stringify(now.enums.find((e) => e.name === "status")?.values) ===
    JSON.stringify(STATUS);
if (!contractOk) {
  console.log(
    "FAIL contract: expected view model Caw {status enum, reducedMotion, dark} and no inputs"
  );
}
if (failures.length === 0 && contractOk && pinned) {
  console.log("Caw view model drives the state machine");
} else {
  process.exitCode = 1;
}
