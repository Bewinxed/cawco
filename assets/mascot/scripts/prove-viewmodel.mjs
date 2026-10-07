// Proves each of Caw's Rive files (assets/mascot/caw/<status>.riv and peek.riv) on Rive's official
// runtime (@rive-app/canvas-advanced, WASM) in headless Chromium: its `Caw` view model drives its
// state machine, his enter plays once and fires `entered` on his still, `dark` puts the cream rim
// on, its variants take turns without repeating one, every drawing stays on screen two frames or
// more, reduced motion holds its still, and it loads and instances within the 100 ms budget.
//
// The expected pictures come from the file itself: each loop's own animations (the loop, a scheme,
// a motion state) are applied directly, without the state machine, and every slot of every loop is
// rendered in light and in dark. The state machine is then driven only through the view model, and
// every frame it renders must be exactly one of those pictures.
//
// Each run gets a fresh page and so a fresh WASM instance. Every page pins the runtime's sources of
// randomness (its clocks and crypto.getRandomValues, see SEED_RANDOM) before the runtime loads, and
// each file runs twice to show the random variant draws are pinned.
//
// usage: node prove-viewmodel.mjs [--dir ../caw]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { enterOf, FILES, fileName, RESTS } from "./scene.mjs";

const ADVANCE_S = 0.5;
const SIZE = 512;
const FPS = 24;
/** How long reduced motion is watched for movement. */
const HOLD_S = 1;
/** A watch starts past the 200 ms scheme fade, half a frame off the drawings' keys. */
const SETTLE_S = 0.25 + 0.5 / FPS;
/** Loops of the longest variant each file is watched for with motion. */
const WATCH_LOOPS = 5;
/** Load plus instancing, steady state, per file. */
const BUDGET_MS = 100;
const TIMING_RUNS = 6;
const CHROMIUM_DIR = /^chromium-\d+$/;
const LOOP_STATE = /^loop_(.+)$/;

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith("--")) {
    args[argv[i].slice(2)] = argv[i + 1];
  }
}
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dir = args.dir ?? here("../caw");
const takes = JSON.parse(readFileSync(here("../loops/takes.json"), "utf8"));
/** What a resting file's one picture is called among the expected pictures. */
const REST = "rest";
/** A file's loops: none for one that rests on one drawing (loops/rests.json), the peek included. */
const loopsOf = (status) =>
  (RESTS[status] ? [] : takes[status]).map(({ loop: name }) => {
    const timing = JSON.parse(
      readFileSync(here(`../loops/${name}/timing.json`), "utf8")
    );
    return {
      name,
      animation: `loop_${name}`,
      frames: timing.frames,
      starts: timing.drawings.map((d) => d.start),
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
    watchFrames: loops.length
      ? WATCH_LOOPS * Math.max(...loops.map((l) => l.frames))
      : Math.round(HOLD_S * FPS),
    rest: REST,
    enterFrames,
    loops,
    steps: STEPS,
  };
  const report = await page.evaluate(
    ([b64, j]) => window.run(b64, j),
    [bytes.toString("base64"), job]
  );
  await context.close();
  return report;
}

/**
 * A watch's frames as plays: each frame is matched to a slot of one of the file's loops
 * (preferring the loop already playing), and a new play starts whenever the loop changes or its
 * slot number goes back. Unmatched frames come back as null.
 */
function plays(loops, pictures, frames) {
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

const runtimeVersion = JSON.parse(
  readFileSync(join(runtimeDir, "package.json"), "utf8")
).version;
console.log(
  `runtime: @rive-app/canvas-advanced ${runtimeVersion} on Chromium ${browser.version()}`
);
const totals = {
  files: 0,
  ok: 0,
  looping: 0,
  animate: 0,
  stills: 0,
  rested: 0,
  held: 0,
  drawn: 0,
  enter: 0,
  plain: 0,
  there: 0,
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
      .map((f) => f.states.filter((s) => LOOP_STATE.test(s)).join(","))
      .join("|");
  if (picks(now) !== picks(again)) {
    fail("random variant draws differ between two runs");
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

  // With motion: every play that starts on its first slot and runs to the next play shows all
  // its slots; with several loops, never the same one twice in a row.
  const [full, reduced] = now.watches;
  const beforeWatch = failures.length;
  const seq = resting ? null : plays(loops, pictures, full.frames);
  let rotation = "one loop";
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
  } else if (seq) {
    const complete = seq.slice(0, -1).filter((p) => p.first === 0);
    const whole = complete.every(
      (p) => p.slots.size === loops.find((l) => l.name === p.loop).starts.length
    );
    if (complete.length === 0 || !whole) {
      const missing = (p) => {
        const n = loops.find((l) => l.name === p.loop).starts.length;
        const gone = [...new Array(n).keys()].filter(
          (s) => s >= p.first && s <= p.last && !p.slots.has(s)
        );
        return gone.length ? ` missing ${gone.join(",")}` : "";
      };
      fail(
        `plays ${seq.map((p) => `${p.loop}[${p.first}..${p.last}:${p.slots.size}${missing(p)}]`).join(" ")}`
      );
    }
    const order = seq.map((p) => p.loop);
    if (loops.length > 1) {
      const repeats = order.some((n, k) => k > 0 && n === order[k - 1]);
      rotation = `${order.map((n) => n.slice(name.length + 1)).join(" → ")} (${new Set(order).size} of ${loops.length}${repeats ? ", a REPEAT" : ", no repeats"})`;
      if (repeats || new Set(order).size < 2) {
        fail(`rotation ${order.join(" → ")}`);
      }
    }
  } else {
    fail("a watched frame matches none of its loops' slots");
  }
  // Every play showed all its drawings, and the loops took turns without repeating one.
  if (!resting) {
    totals.looping += 1;
    totals.animate += failures.length === beforeWatch ? 1 : 0;
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
      `reducedMotion ${held ? "holds still" : "MOVES"}; rotation ${rotation}; ${arrival} — ${ok ? "ok" : "FAIL"}`
  );
}
await browser.close();
for (const f of failures) {
  console.log(`  FAIL ${f}`);
}
console.log(`loops animate: ${totals.animate}/${totals.looping}`);
console.log(`stills rest: ${totals.rested}/${totals.stills}`);
console.log(`reducedMotion holds still: ${totals.held}/${totals.files}`);
console.log(`drawn enters play and land: ${totals.enter}/${totals.drawn}`);
console.log(`no drawn enter, simply there: ${totals.there}/${totals.plain}`);
console.log(`files proven: ${totals.ok}/${totals.files}`);
if (failures.length === 0 && totals.ok === FILES.length) {
  console.log("Caw view model drives the state machine in every file");
} else {
  process.exitCode = 1;
}
