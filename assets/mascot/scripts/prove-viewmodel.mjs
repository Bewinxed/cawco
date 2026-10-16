// Proves each of Caw's Rive files (assets/mascot/caw/<status>.riv and peek.riv) on Rive's official
// runtime (@rive-app/canvas-advanced, WASM) in headless Chromium: its `Caw` view model drives its
// state machine, his enter plays once and fires `entered` on his still, `dark` puts the cream rim
// on, `pixel` sets that rim's width and nothing else, a resting file holds its one drawing, a
// beating file holds its still and plays its beat whole after one of its holds and never two in a
// row, every drawing stays on screen two frames or more, reduced motion holds its still, and it
// loads and instances within the 100 ms budget.
//
// The expected pictures come from the file itself: each loop's own animations (the loop, a scheme,
// a motion state) are applied directly, without the state machine, and every slot of every loop is
// rendered in light and in dark. The state machine is then driven only through the view model, and
// every frame it renders must be exactly one of those pictures.
//
// Each run gets a fresh page and so a fresh WASM instance. Every page pins the runtime's sources of
// randomness (its clocks and crypto.getRandomValues, see SEED_RANDOM) before the runtime loads, and
// each file runs twice to show the random hold draws are pinned.
//
// usage: node prove-viewmodel.mjs [--dir ../caw]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  BEATS,
  enterOf,
  FILES,
  fileName,
  KIT_RIM,
  PLAYS,
  RESTS,
} from "./scene.mjs";

const ADVANCE_S = 0.5;
const SIZE = 512;
const FPS = 24;
/** How long reduced motion is watched for movement. */
const HOLD_S = 1;
/** A watch starts past the 200 ms scheme fade, half a frame off the drawings' keys. */
const SETTLE_S = 0.25 + 0.5 / FPS;
/**
 * A beating file is watched with motion for this many of its longest cycles (its longest hold and
 * its beat), so the watch holds two beats begun and the interval between them whatever the phase
 * it starts on.
 */
const WATCH_CYCLES = 3;
/** Loops of the longest one a playing file is watched for with motion. */
const WATCH_LOOPS = 5;
/** How far a hold seen between two beats may be from one of the file's holds, in frames. */
const HOLD_TOLERANCE = 2;
/** Load plus instancing, steady state, per file. */
const BUDGET_MS = 100;
const TIMING_RUNS = 6;
const CHROMIUM_DIR = /^chromium-\d+$/;
/**
 * `pixel` values the rim is proven at: unset, half the kit's rim (held at the kit's), and one
 * device pixel where his box is drawn at 18 px on a 2x and on a 1x screen (512 / 36, 512 / 18).
 */
const RIM_PIXELS = [0, KIT_RIM / 2, 512 / 36, 512 / 18];
/** The artboard's 592 px drawn on the proof's 512 px canvas. */
const CANVAS_PER_ARTBOARD = 512 / 592;
/** How far the rim's measured reach may be from `pixel`, in canvas px: a pixel's half-width each side. */
const RIM_TOLERANCE = 1;
/** The Variant layer's states a random draw lands on: a hold, the beat, or a loop. */
const DRAWN_STATE = /^(hold_\d+|beat|loop_.+)$/;

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith("--")) {
    args[argv[i].slice(2)] = argv[i + 1];
  }
}
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dir = args.dir ?? here("../caw");
/** What a resting file's one picture is called among the expected pictures. */
const REST = "rest";
/**
 * A file's loops: its beat (loops/beats.json), with its holds in frames; the loops it plays
 * (loops/plays.json); or none for one that rests on one drawing (loops/rests.json).
 */
const loopsOf = (status) =>
  [
    ...(BEATS[status] ? [BEATS[status]] : []),
    ...(PLAYS[status] ?? []).map((loop) => ({ loop })),
  ].map(({ loop: name, holds }) => {
    const timing = JSON.parse(
      readFileSync(here(`../loops/${name}/timing.json`), "utf8")
    );
    return {
      name,
      animation: `loop_${name}`,
      frames: timing.frames,
      starts: timing.drawings.map((d) => d.start),
      holds: holds?.map((s) => s * FPS),
    };
  });

/** Scheme and reduced motion in every combination, back to the start. */
const STEPS = [
  { dark: false, reducedMotion: false },
  { dark: true, reducedMotion: false },
  { dark: true, reducedMotion: true },
  { dark: false, reducedMotion: true },
  { dark: false, reducedMotion: false },
  { dark: true, reducedMotion: false },
  { dark: false, reducedMotion: false },
];

const runtimeDir = here("./node_modules/@rive-app/canvas-advanced/");
/**
 * Runs before the runtime and pins everything its randomness can be seeded from: the clocks the
 * WASM imports (clock_time_get, emscripten_date_now and emscripten_get_now read Date.now and
 * performance.now) stand still at a fixed epoch, and crypto.getRandomValues (Emscripten's
 * /dev/urandom) becomes a fixed-seed xorshift32 stream. The proof advances the state machine by
 * explicit times, so nothing it measures reads the clock. Load timing reads a separate real clock.
 */
const SEED_RANDOM = `
window.realNow = performance.now.bind(performance);
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
  // Load plus instancing as an app does it: parse, artboard, state machine, bind, first frame.
  const timings = [];
  for (let k = 0; k < job.timingRuns; k++) {
    const t0 = realNow();
    const f = await rive.load(bytes);
    const a = f.artboardByName("Caw");
    const m = new rive.StateMachineInstance(a.stateMachineByName("CawStates"), a);
    m.bindViewModelInstance(f.defaultArtboardViewModel(a).defaultInstance());
    m.advanceAndApply(0);
    timings.push(realNow() - t0);
    m.delete();
    a.delete();
  }
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

  // Expected pictures and each loop's frames, from the loops' own animations, no state machine.
  const still = file.artboardByName("Caw");
  const play = (name, time) => {
    const a = new rive.LinearAnimationInstance(still.animationByName(name), still);
    a.advance(time);
    a.apply(1);
    a.delete();
  };
  const show = (loop, time, dark) => {
    play(loop.animation, time);
    play(dark ? "scheme_dark" : "scheme_light", 0);
    play("motion_full", 0);
    still.advance(0);
    return snap(still);
  };
  const expected = [];
  const timelines = {};
  if (job.loops.length === 0) {
    // A resting file: its one drawing, in each scheme.
    for (const dark of [false, true]) {
      play("variant_still", 0);
      play(dark ? "scheme_dark" : "scheme_light", 0);
      play("motion_full", 0);
      still.advance(0);
      expected.push({ loop: job.rest, dark, slot: 0, frame: snap(still) });
    }
  }
  // His enter's frames, in light.
  const enter = [];
  for (let f = 0; f < job.enterFrames; f++) {
    play("enter", (f + 0.5) / job.fps);
    play("scheme_light", 0);
    play("motion_full", 0);
    still.advance(0);
    enter.push(snap(still));
  }
  for (const loop of job.loops) {
    for (const dark of [false, true]) {
      loop.starts.forEach((start, slot) => {
        // Mid-way through the slot's first frame, clear of the key on its start.
        expected.push({ loop: loop.name, dark, slot, frame: show(loop, (start + 0.5) / job.fps, dark) });
      });
    }
    timelines[loop.name] = [];
    for (let f = 0; f < loop.frames; f++) {
      timelines[loop.name].push(show(loop, (f + 0.5) / job.fps, false));
    }
  }

  // The state machine, driven only through the Caw view model.
  const ab = file.artboardByName("Caw");
  const sm = new rive.StateMachineInstance(ab.stateMachineByName("CawStates"), ab);
  const vm = file.defaultArtboardViewModel(ab);
  const vmi = vm.defaultInstance();
  sm.bindViewModelInstance(vmi);
  const report = {
    timings,
    inputs: sm.inputCount(),
    viewModel: vm.name,
    properties: vm.getProperties(),
    enums: file.enums().map((e) => ({ name: e.name, values: e.values })),
    enter,
    expected,
    timelines,
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
    vmi.boolean("dark").value = s.dark;
    vmi.boolean("reducedMotion").value = s.reducedMotion;
    return { dark: vmi.boolean("dark").value, reducedMotion: vmi.boolean("reducedMotion").value };
  };
  report.enters = vmi.boolean("enters").value;
  // The steps begin once his enter has ended.
  seek((job.enterFrames + 1) / job.fps);
  for (const s of job.steps) {
    const readBack = set(s);
    changed.length = 0;
    seek(job.advance);
    report.steps.push({ readBack, states: [...changed], frame: snap(ab) });
  }
  // Watched in light, one frame (1/24 s) apart from past the scheme fade, half a frame off the
  // keys: with motion for several loops, reduced for job.hold.
  for (const reducedMotion of [false, true]) {
    set({ dark: false, reducedMotion });
    changed.length = 0;
    seek(job.settle);
    const frames = [];
    const count = reducedMotion ? Math.round(job.hold * job.fps) : job.watchFrames;
    for (let k = 0; k < count; k++) {
      frames.push(snap(ab));
      seek(1 / job.fps);
    }
    report.watches.push({ reducedMotion, states: [...changed], frames });
  }
  // His arrival: a fresh state machine, one frame (1/24 s) apart, half a frame off the keys,
  // until \`entered\` fires or his enter's length and a second have gone by.
  {
    const a = file.artboardByName("Caw");
    const m = new rive.StateMachineInstance(a.stateMachineByName("CawStates"), a);
    // Its own instance of \`Caw\`, so nothing set above is left on it.
    const v = file.defaultArtboardViewModel(a).instanceByName("Default");
    m.bindViewModelInstance(v);
    // Taken before anything fires: a trigger's changes count from when it is first asked for.
    const entered = v.trigger("entered");
    m.advanceAndApply(0.5 / job.fps);
    const frames = [];
    let at = null;
    for (let k = 0; k < job.enterFrames + job.fps && at === null; k++) {
      // Read before drawing: drawing the frame clears a trigger's change.
      if (entered.hasChanged) at = k / job.fps;
      frames.push(snap(a));
      m.advanceAndApply(1 / job.fps);
    }
    report.arrival = { frames, at };
    m.delete();
    a.delete();
  }
  // His rim on a fresh file's first frame in dark: whole, as on his settled still, never fading
  // in at load (the bar plays a clip over a face drawn with it). The rim is what dark draws and
  // light does not; its mean alpha on the first frame against the still's, held a second.
  {
    const fresh = (dark, seconds) => {
      const a = file.artboardByName("Caw");
      const m = new rive.StateMachineInstance(a.stateMachineByName("CawStates"), a);
      const v = file.defaultArtboardViewModel(a).instanceByName("Default");
      m.bindViewModelInstance(v);
      v.boolean("dark").value = dark;
      v.boolean("reducedMotion").value = seconds > 0;
      m.advanceAndApply(0);
      for (let t = 0; t < seconds - 1e-9; t += 1 / 60) m.advanceAndApply(1 / 60);
      renderer.clear();
      renderer.save();
      renderer.align(rive.Fit.contain, rive.Alignment.center, { minX: 0, minY: 0, maxX: job.size, maxY: job.size }, a.bounds);
      a.draw(renderer);
      renderer.restore();
      rive.resolveAnimationFrame();
      const data = ctx.getImageData(0, 0, job.size, job.size).data;
      m.delete();
      a.delete();
      return data;
    };
    const rim = (dark, light) => {
      let count = 0;
      let sum = 0;
      let ink = 0;
      for (let i = 3; i < dark.length; i += 4) {
        ink += light[i] > 127 ? 1 : 0;
        if (dark[i] > light[i] + 10) {
          count += 1;
          sum += dark[i] - light[i];
        }
      }
      return { ink, count, mean: count ? sum / count : 0 };
    };
    report.rimAtLoad = { first: rim(fresh(true, 0), fresh(false, 0)), settled: rim(fresh(true, 1), fresh(false, 1)) };
  }
  // \`pixel\` sizes the rim: his still, held, on a fresh state machine per value, in dark and in
  // light. The rim's reach in canvas px: how far its pixels (half covered or more in dark, less
  // than half in light) lie from his body's (half covered or more in light), the 99th
  // percentile, so the outline's straight and convex runs, where the rim is its full width,
  // decide it and its concave notches, where it overlaps itself, do not.
  {
    const render = (pixel, dark) => {
      const a = file.artboardByName("Caw");
      const m = new rive.StateMachineInstance(a.stateMachineByName("CawStates"), a);
      const v = file.defaultArtboardViewModel(a).instanceByName("Default");
      m.bindViewModelInstance(v);
      v.boolean("dark").value = dark;
      v.boolean("reducedMotion").value = true;
      v.number("pixel").value = pixel;
      for (let k = 0; k < 60; k++) m.advanceAndApply(1 / 60);
      renderer.clear();
      renderer.save();
      renderer.align(rive.Fit.contain, rive.Alignment.center, { minX: 0, minY: 0, maxX: job.size, maxY: job.size }, a.bounds);
      a.draw(renderer);
      renderer.restore();
      rive.resolveAnimationFrame();
      const data = ctx.getImageData(0, 0, job.size, job.size).data;
      m.delete();
      a.delete();
      return data;
    };
    const n = job.size;
    report.rim = job.pixels.map((pixel) => {
      const dark = render(pixel, true);
      const light = render(pixel, false);
      const body = (i) => light[i * 4 + 3] >= 128;
      const reach = Math.ceil(pixel * job.canvasPerArtboard) + 4;
      const distances = [];
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x;
          if (body(i) || dark[i * 4 + 3] < 128) continue;
          let nearest = Infinity;
          for (let dy = -reach; dy <= reach; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= n) continue;
            for (let dx = -reach; dx <= reach; dx++) {
              const xx = x + dx;
              if (xx < 0 || xx >= n) continue;
              const d = dx * dx + dy * dy;
              if (d < nearest && body(yy * n + xx)) nearest = d;
            }
          }
          distances.push(Math.sqrt(nearest));
        }
      }
      distances.sort((p, q) => p - q);
      const width = distances[Math.floor(0.99 * (distances.length - 1))] ?? 0;
      return { pixel, dark: digest(dark), light: digest(light), width };
    });
  }
  return report;
};
window.ready = true;
`;

function chromiumPath() {
  // Where Playwright installs its browsers (playwright-core registry): PLAYWRIGHT_BROWSERS_PATH,
  // else the XDG cache home ($XDG_CACHE_HOME, or ~/.cache when it is unset) and ms-playwright.
  const root =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    join(
      process.env.XDG_CACHE_HOME || join(process.env.HOME, ".cache"),
      "ms-playwright"
    );
  const revs = existsSync(root)
    ? readdirSync(root)
        .filter((d) => CHROMIUM_DIR.test(d))
        .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
    : [];
  // Newest revision first; newer revisions ship chrome-linux64, older ones chrome-linux.
  for (const rev of revs) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const exe = join(root, rev, sub, "chrome");
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

async function run(bytes, loops, enterFrames) {
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
    timingRuns: TIMING_RUNS,
    // A resting file is watched as long as reduced motion is.
    watchFrames: watchFrames(loops),
    rest: REST,
    enterFrames,
    loops,
    steps: STEPS,
    pixels: RIM_PIXELS,
    canvasPerArtboard: CANVAS_PER_ARTBOARD,
  };
  const report = await page.evaluate(
    ([b64, j]) => window.run(b64, j),
    [bytes.toString("base64"), job]
  );
  await context.close();
  return report;
}

/**
 * How many frames a file is watched for with motion: a resting file as long as reduced motion; a
 * beating file three of its longest cycles; a playing file five of its longest loop.
 */
function watchFrames(loops) {
  if (loops.length === 0) {
    return Math.round(HOLD_S * FPS);
  }
  if (loops[0].holds) {
    return WATCH_CYCLES * (Math.max(...loops[0].holds) + loops[0].frames);
  }
  return WATCH_LOOPS * Math.max(...loops.map((l) => l.frames));
}

/**
 * A watch's frames as plays: each frame is matched to a slot of one of the file's loops
 * (preferring the loop already playing), and a new play starts whenever the loop changes or its
 * slot number goes back. Unmatched frames come back as null.
 */
function playsIn(loops, pictures, frames) {
  const out = [];
  let current = null;
  for (const f of frames) {
    const candidates = (pictures.get(f) ?? []).filter(
      (c) => !c.dark && loops.some((l) => l.name === c.loop)
    );
    if (candidates.length === 0) {
      return null;
    }
    const d =
      candidates.find(
        (c) => current && c.loop === current.loop && c.slot >= current.last
      ) ?? candidates[0];
    if (!current || d.loop !== current.loop || d.slot < current.last) {
      current = { loop: d.loop, slots: new Set(), first: d.slot, last: d.slot };
      out.push(current);
    }
    current.slots.add(d.slot);
    current.last = d.slot;
  }
  return out;
}

/**
 * A lone loop on repeat: the watch's pictures, run by run, must be the loop's own (its timeline's
 * runs) over and over, from some run of it on. Its first and last drawing are one picture, so a
 * seam cannot be told from a play by its pictures, and the loop's runs are taken as a cycle: its
 * last run is its first. Returns how many seams the watch crosses, or null where a picture breaks
 * the cycle.
 */
function repeatsIn(timeline, frames) {
  const cycle = runsOf(timeline).map((r) => r.pic);
  if (cycle.length > 1 && cycle[0] === cycle.at(-1)) {
    cycle.pop();
  }
  const seen = runsOf(frames).map((r) => r.pic);
  for (let phase = 0; phase < cycle.length; phase += 1) {
    if (seen.every((p, k) => p === cycle[(k + phase) % cycle.length])) {
      return seen.filter((_, k) => k > 0 && (k + phase) % cycle.length === 0)
        .length;
    }
  }
  return null;
}

/** A playing file's watch: its lone loop on repeat, or its loops taking turns, each whole. */
function provePlays(loops, pictures, frames, timelines, name) {
  if (loops.length === 1) {
    const [loop] = loops;
    const seams = repeatsIn(timelines[loop.name], frames);
    if (seams === null) {
      return {
        fault: `${loop.name} breaks its repeat`,
        line: "BREAKS its repeat",
      };
    }
    const line = `${loop.name} on repeat, ${(loop.frames / FPS).toFixed(2)} s, ${seams} seams in ${(frames.length / FPS).toFixed(1)} s`;
    return seams < WATCH_LOOPS - 1
      ? { fault: `${seams} seams`, line }
      : { line };
  }
  const seq = playsIn(loops, pictures, frames);
  if (!seq) {
    return {
      fault: "a watched frame matches none of its loops' slots",
      line: "UNMATCHED",
    };
  }
  // Every play that starts on its first slot and runs to the next play shows all its slots.
  const complete = seq.slice(0, -1).filter((p) => p.first === 0);
  const slotsOf = (p) => loops.find((l) => l.name === p.loop).starts.length;
  const order = seq.map((p) => p.loop);
  const repeats = order.some((n, k) => k > 0 && n === order[k - 1]);
  const line = `${order.map((n) => n.slice(name.length + 1)).join(" → ")} (${new Set(order).size} of ${loops.length}${repeats ? ", a REPEAT" : ", no repeats"})`;
  if (
    complete.length === 0 ||
    !complete.every((p) => p.slots.size === slotsOf(p))
  ) {
    return {
      fault: `plays ${seq.map((p) => `${p.loop}[${p.first}..${p.last}:${p.slots.size}]`).join(" ")}`,
      line,
    };
  }
  if (repeats || new Set(order).size < 2) {
    return { fault: `rotation ${order.join(" → ")}`, line };
  }
  return { line };
}

/** Frames as runs of one picture: each run's picture, its first frame and its length. */
function runsOf(frames) {
  const runs = [];
  for (const [k, f] of frames.entries()) {
    if (runs.length && runs.at(-1).pic === f) {
      runs.at(-1).n += 1;
    } else {
      runs.push({ pic: f, at: k, n: 1 });
    }
  }
  return runs;
}

/**
 * A beating file's watch read as holds and beats. The beat's own frames (its timeline) open and
 * close on his still; between them lie its inner pictures. Every run of the watch must be his
 * still or part of a beat, a beat's inner pictures met whole and in order, each followed by his
 * still; a watch may open inside a beat and end inside one. Returns the frame each whole beat
 * starts on (its inner pictures less the beat's own opening still), those found so far with a
 * reason where it fails.
 */
function beatsIn(timeline, frames) {
  const own = runsOf(timeline);
  const still = own[0].pic;
  const lead = own[0].n;
  const inner = own.slice(1, -1).map((r) => r.pic);
  const runs = runsOf(frames);
  const starts = [];
  let k = 0;
  // A watch that opens inside a beat: its runs up to his still are the end of the beat's.
  if (runs[0].pic !== still) {
    const until = runs.findIndex((r) => r.pic === still);
    const head = runs
      .slice(0, until < 0 ? runs.length : until)
      .map((r) => r.pic);
    const tail = inner.slice(inner.length - head.length);
    if (head.some((p, j) => p !== tail[j])) {
      return {
        fault: "the watch opens on frames that are not the end of a beat",
        starts,
      };
    }
    k = head.length;
  }
  while (k < runs.length) {
    if (runs[k].pic === still) {
      k += 1;
      continue;
    }
    const n = Math.min(inner.length, runs.length - k);
    for (let j = 0; j < n; j += 1) {
      if (runs[k + j].pic !== inner[j]) {
        return {
          fault: `frame ${runs[k + j].at} is neither his still nor the beat's next drawing`,
          starts,
        };
      }
    }
    if (n === inner.length) {
      if (k + n < runs.length && runs[k + n].pic !== still) {
        return {
          fault: `the beat at frame ${runs[k].at} is not followed by his still`,
          starts,
        };
      }
      starts.push(runs[k].at - lead);
    }
    k += n;
  }
  return { starts };
}

const runtimeVersion = JSON.parse(
  readFileSync(join(runtimeDir, "package.json"), "utf8")
).version;
console.log(
  `runtime: @rive-app/canvas-advanced ${runtimeVersion} on Chromium ${browser.version()}`
);
const totals = {
  files: 0,
  ok: 0,
  beating: 0,
  beats: 0,
  playing: 0,
  plays: 0,
  stills: 0,
  rested: 0,
  held: 0,
  drawn: 0,
  enter: 0,
  plain: 0,
  there: 0,
  rim: 0,
  rimAtLoad: 0,
};
const failures = [];
for (const status of FILES) {
  const name = fileName(status);
  const fail = (m) => failures.push(`${name}.riv: ${m}`);
  const before = failures.length;
  const bytes = readFileSync(join(dir, `${name}.riv`));
  const loops = loopsOf(status);
  const resting = loops.length === 0;
  /** The picture reduced motion holds: the first loop's first drawing, or the rest drawing. */
  const stillOf = loops[0]?.name ?? REST;
  const enter = enterOf(status);
  const enterFrames = enter
    ? JSON.parse(readFileSync(here(`../clips/${enter}/timing.json`), "utf8"))
        .frames
    : 0;
  // biome-ignore lint/performance/noAwaitInLoops: one file at a time, so no run's load timing shares the CPU with another
  const now = await run(bytes, loops, enterFrames);
  const again = await run(bytes, loops, enterFrames);
  totals.files += 1;

  const pictures = new Map();
  for (const e of now.expected) {
    pictures.set(e.frame, [...(pictures.get(e.frame) ?? []), e]);
  }
  const picks = (r) =>
    [...r.steps, ...r.watches]
      .map((f) => f.states.filter((s) => DRAWN_STATE.test(s)).join(","))
      .join("|");
  if (picks(now) !== picks(again)) {
    fail("random hold draws differ between two runs");
  }
  const props = JSON.stringify(now.properties.map((p) => [p.name, p.type]));
  if (
    now.inputs !== 0 ||
    now.viewModel !== "Caw" ||
    now.enums.length !== 0 ||
    props !==
      JSON.stringify([
        ["reducedMotion", "boolean"],
        ["dark", "boolean"],
        ["entered", "trigger"],
        ["enters", "boolean"],
        ["pixel", "number"],
      ])
  ) {
    fail(
      `contract: view model ${now.viewModel} ${props}, enums ${JSON.stringify(now.enums)}, ${now.inputs} inputs`
    );
  }
  if (now.enters !== Boolean(enter)) {
    fail(
      `\`enters\` reads ${now.enters} in a file with ${enter ? "a" : "no"} drawn enter`
    );
  }

  // His arrival, compared as the order of distinct pictures. A drawn enter shows its drawings in
  // order, each two frames or more, and `entered` fires as it lands on his still. With none he is
  // there on the first frame, on his rest or on a loop's first drawing, and `entered` never
  // fires: the apps fade him in.
  const stillPicture = now.expected.find(
    (e) => e.loop === stillOf && e.slot === 0 && !e.dark
  ).frame;
  const distinct = (frames) =>
    frames.filter((f, k) => k === 0 || f !== frames[k - 1]);
  const same = (a, b) => a.length === b.length && a.every((f, k) => f === b[k]);
  const beforeArrival = failures.length;
  const { frames: arrived, at } = now.arrival;
  if (enter) {
    const runs = [];
    for (const [k, f] of now.enter.entries()) {
      if (k > 0 && f === now.enter[k - 1]) {
        runs[runs.length - 1] += 1;
      } else {
        runs.push(1);
      }
    }
    if (!runs.every((n) => n >= 2)) {
      fail(`${enter} drawings on screen for ${runs.join(",")} frames`);
    }
    if (now.enter.at(-1) !== stillPicture) {
      fail(`${enter} does not land on his still`);
    }
    if (!same(distinct(arrived), distinct([...now.enter, stillPicture]))) {
      fail(`his arrival does not show ${enter} in order, then his still`);
    }
    if (at === null || Math.abs(at * FPS - enterFrames) > 2) {
      fail(`entered after ${at} s, ${enter} lasts ${enterFrames} frames`);
    }
    totals.drawn += 1;
    totals.enter += failures.length === beforeArrival ? 1 : 0;
  } else {
    const first = (pictures.get(arrived[0]) ?? []).some(
      (d) => d.slot === 0 && !d.dark
    );
    if (!first) {
      fail("with no drawn enter his first frame is not a first drawing");
    }
    if (at !== null) {
      fail(`with no drawn enter \`entered\` fired after ${at} s`);
    }
    totals.plain += 1;
    totals.there += failures.length === beforeArrival ? 1 : 0;
  }
  const ledge = RESTS[status]?.ledgeLine;
  const arrival =
    (enter
      ? `${enter} ${Math.round((enterFrames / FPS) * 1000)} ms`
      : "no drawn enter") +
    (ledge ? `, ledge line at ${(ledge * 100).toFixed(2)}% of the box` : "");

  // Scheme and reduced motion: each step shows a slot of one of the loops in the scheme `dark`
  // selects; under reduced motion, the first loop's first slot.
  let matched = 0;
  STEPS.forEach((s, i) => {
    const f = now.steps[i];
    const ok =
      f.readBack.dark === s.dark &&
      f.readBack.reducedMotion === s.reducedMotion &&
      (pictures.get(f.frame) ?? []).some((d) =>
        s.reducedMotion
          ? d.loop === stillOf && d.slot === 0 && d.dark === s.dark
          : d.dark === s.dark
      );
    matched += ok ? 1 : 0;
    if (!ok) {
      fail(
        `step ${i} (dark ${s.dark}, reducedMotion ${s.reducedMotion}) shows no expected picture`
      );
    }
  });

  // With motion: a resting file holds its drawing; a beating file holds its still, and every beat
  // plays whole between two holds, each hold one of the file's; a playing file repeats its lone
  // loop, or its loops take turns, each whole, never the same twice running.
  const [full, reduced] = now.watches;
  const beforeWatch = failures.length;
  let rotation = "";
  if (resting) {
    // A resting file holds its one drawing with motion on, as it does with motion reduced.
    const rested =
      new Set(full.frames).size === 1 &&
      (pictures.get(full.frames[0]) ?? []).some(
        (d) => d.loop === REST && !d.dark
      );
    rotation = rested ? "rests on its drawing" : "MOVES at rest";
    totals.stills += 1;
    totals.rested += rested ? 1 : 0;
    if (!rested) {
      fail(`at rest it shows ${new Set(full.frames).size} distinct frames`);
    }
  } else if (PLAYS[status]) {
    const played = provePlays(
      loops,
      pictures,
      full.frames,
      now.timelines,
      name
    );
    rotation = played.line;
    if (played.fault) {
      fail(played.fault);
    }
    totals.playing += 1;
    totals.plays += failures.length === beforeWatch ? 1 : 0;
  } else {
    const [beat] = loops;
    const seen = beatsIn(now.timelines[beat.name], full.frames);
    // Between two beats' starts: the beat itself, then the hold.
    const holds = seen.starts
      .slice(1)
      .map((s, k) => s - seen.starts[k] - beat.frames);
    const strays = holds.filter(
      (h) => !beat.holds.some((want) => Math.abs(h - want) <= HOLD_TOLERANCE)
    );
    rotation = seen.fault
      ? seen.fault
      : `beat ${beat.name} ${(beat.frames / FPS).toFixed(2)} s at ${seen.starts.map((s) => (s / FPS).toFixed(2)).join(", ")} s, holds ${holds.map((h) => (h / FPS).toFixed(2)).join(", ")} s of ${beat.holds.map((h) => h / FPS).join("/")}`;
    if (seen.fault) {
      fail(seen.fault);
    } else if (holds.length < 1) {
      fail(`${seen.starts.length} whole beats in ${full.frames.length} frames`);
    } else if (strays.length) {
      fail(
        `holds of ${strays.join(", ")} frames, none of ${beat.holds.join(", ")}`
      );
    }
    totals.beating += 1;
    totals.beats += failures.length === beforeWatch ? 1 : 0;
  }
  // On twos, read from the file: each loop's frames at 1/24 s, as runs of the same picture.
  let twos = 0;
  for (const loop of loops) {
    const runs = [];
    for (const [k, h] of now.timelines[loop.name].entries()) {
      if (k > 0 && h === now.timelines[loop.name][k - 1]) {
        runs[runs.length - 1] += 1;
      } else {
        runs.push(1);
      }
    }
    if (runs.every((n) => n >= 2)) {
      twos += 1;
    } else {
      fail(`${loop.name} drawings on screen for ${runs.join(",")} frames`);
    }
  }
  // Reduced: one picture throughout, the first loop's first slot.
  const held =
    new Set(reduced.frames).size === 1 &&
    (pictures.get(reduced.frames[0]) ?? []).some(
      (d) => d.loop === stillOf && d.slot === 0 && !d.dark
    );
  if (held) {
    totals.held += 1;
  } else {
    fail(
      `reduced motion shows ${new Set(reduced.frames).size} distinct frames`
    );
  }
  // `pixel` sizes the dark rim and nothing else: light is the same picture at every value; unset
  // and below the kit's rim it is the kit's (the picture the scheme steps matched); above it the
  // rim reaches `pixel` out from his body on the canvas, within RIM_TOLERANCE.
  const [unset, below, ...sized] = now.rim;
  const kitDark = now.expected.find(
    (e) => e.loop === stillOf && e.slot === 0 && e.dark
  ).frame;
  const rimFaults = [
    new Set(now.rim.map((r) => r.light)).size === 1
      ? null
      : "light changes with pixel",
    unset.dark === kitDark ? null : "unset pixel does not draw the kit's rim",
    below.dark === unset.dark
      ? null
      : "pixel under the kit's rim is not held at it",
    ...sized.map((r) => {
      const want = r.pixel * CANVAS_PER_ARTBOARD;
      return Math.abs(r.width - want) <= RIM_TOLERANCE
        ? null
        : `pixel ${r.pixel.toFixed(2)} draws a ${r.width.toFixed(2)} px rim, not ${want.toFixed(2)}`;
    }),
  ].filter(Boolean);
  for (const f of rimFaults) {
    fail(f);
  }
  totals.rim += rimFaults.length === 0 ? 1 : 0;
  // Loaded in dark, his first frame carries his rim whole: 90% of the settled still's mean rim
  // alpha or more (a first frame with nothing of him drawn, an enter from an empty page, has
  // nothing to ring).
  const { first: loadRim, settled: stillRim } = now.rimAtLoad;
  const loadsWhole = loadRim.ink === 0 || loadRim.mean >= 0.9 * stillRim.mean;
  if (!loadsWhole) {
    fail(
      `loaded in dark his rim is at ${loadRim.mean.toFixed(0)} of ${stillRim.mean.toFixed(0)} alpha: it fades in`
    );
  }
  totals.rimAtLoad += loadsWhole ? 1 : 0;
  const rimLine = `rim ${sized.map((r) => `${r.width.toFixed(1)}/${(r.pixel * CANVAS_PER_ARTBOARD).toFixed(1)}`).join(", ")} px`;
  const steady = [...now.timings.slice(1)].sort((a, b) => a - b);
  const median = steady[Math.floor(steady.length / 2)];
  if (median > BUDGET_MS) {
    fail(`load + instance ${median.toFixed(0)} ms, over ${BUDGET_MS} ms`);
  }
  const ok = failures.length === before;
  totals.ok += ok ? 1 : 0;
  console.log(
    `${name}.riv ${(bytes.length / 1e6).toFixed(2)} MB: load+instance ${median.toFixed(0)} ms (cold ${now.timings[0].toFixed(0)}); ` +
      `scheme/reduced steps ${matched}/${STEPS.length}; on twos ${twos}/${loops.length} loops; ` +
      `reducedMotion ${held ? "holds still" : "MOVES"}; rotation ${rotation}; ${arrival}; ${rimLine} — ${ok ? "ok" : "FAIL"}`
  );
}
await browser.close();
for (const f of failures) {
  console.log(`  FAIL ${f}`);
}
console.log(
  `beats leave and land between holds: ${totals.beats}/${totals.beating}`
);
console.log(
  `loops repeat or take turns, whole: ${totals.plays}/${totals.playing}`
);
console.log(`stills rest: ${totals.rested}/${totals.stills}`);
console.log(`reducedMotion holds still: ${totals.held}/${totals.files}`);
console.log(`drawn enters play and land: ${totals.enter}/${totals.drawn}`);
console.log(`no drawn enter, simply there: ${totals.there}/${totals.plain}`);
console.log(`pixel sizes the dark rim: ${totals.rim}/${totals.files}`);
console.log(`rim whole at load: ${totals.rimAtLoad}/${totals.files}`);
console.log(`files proven: ${totals.ok}/${totals.files}`);
if (failures.length === 0 && totals.ok === FILES.length) {
  console.log("Caw view model drives the state machine in every file");
} else {
  process.exitCode = 1;
}
