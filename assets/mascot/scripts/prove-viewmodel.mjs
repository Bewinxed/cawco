// Proves each of Caw's per-status Rive files (assets/mascot/caw/<status>.riv) on Rive's official
// runtime (@rive-app/canvas-advanced, WASM) in headless Chromium: its `Caw` view model drives its
// state machine, `dark` puts the cream rim on, its variants take turns without repeating one,
// every drawing stays on screen two frames or more, reduced motion holds its still, and it loads
// and instances within the 100 ms budget.
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
import { clipsOf, FROM, fileName, STATUS } from "./scene.mjs";

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
/** The statuses that rest on one drawing and have no loops (loops/rests.json). */
const rests = JSON.parse(readFileSync(here("../loops/rests.json"), "utf8"));
/** What a resting file's one picture is called among the expected pictures. */
const REST = "rest";
const loopsOf = (status) =>
  (rests[status] ? [] : takes[status]).map(({ loop: name }) => {
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
  // The empty page (before \`from\` is set, after the exit) and each clip's frames, in light.
  const light = (name, time) => {
    play(name, time);
    play("scheme_light", 0);
    play("motion_full", 0);
    still.advance(0);
    return snap(still);
  };
  const hidden = light("variant_hidden", 0);
  const clips = {};
  for (const clip of job.clips) {
    clips[clip.name] = [];
    for (let f = 0; f < clip.frames; f++) {
      clips[clip.name].push(light("clip_" + clip.name, (f + 0.5) / job.fps));
    }
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
    hidden,
    clips,
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
  seek(0);
  report.unset = snap(ab);
  // A first appearance: his enter plays, and the steps begin once it has ended.
  vmi.enum("from").value = "none";
  const entered = vmi.trigger("entered");
  for (let t = 0; t < 4 && !entered.hasChanged; t += 1 / 60) {
    seek(1 / 60);
  }
  report.enteredFirst = entered.hasChanged;
  entered.clearChanges();
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
  // Each way in, then out: a fresh state machine per \`from\` value, one frame (1/24 s) apart,
  // half a frame off the keys. \`leave\` is asked the moment he has come in, \`exit\` on his still.
  report.drives = job.froms.map((from) => {
    const a = file.artboardByName("Caw");
    const m = new rive.StateMachineInstance(a.stateMachineByName("CawStates"), a);
    // Its own instance of \`Caw\`, so nothing an earlier drive set is left on it.
    const v = file.defaultArtboardViewModel(a).instanceByName("Default");
    m.bindViewModelInstance(v);
    m.advanceAndApply(0);
    const before = snap(a);
    const fresh = v.enum("from").value + "," + v.boolean("leave").value + "," + v.boolean("exit").value;
    // Taken before anything fires: a trigger's changes count from when it is first asked for.
    const triggers = {
      entered: v.trigger("entered"),
      still: v.trigger("still"),
      gone: v.trigger("gone"),
    };
    const fired = (name) => {
      const p = triggers[name];
      const yes = p.hasChanged;
      if (yes) p.clearChanges();
      return yes;
    };
    const run = (until, limit) => {
      const frames = [];
      for (let k = 0; k < limit * job.fps; k++) {
        m.advanceAndApply(1 / job.fps);
        // Read before drawing: drawing the frame clears a trigger's change.
        const hit = fired(until);
        frames.push(snap(a));
        if (hit) return { frames, at: (k + 1) / job.fps };
      }
      return { frames, at: null };
    };
    v.enum("from").value = from;
    m.advanceAndApply(0.5 / job.fps);
    // With no clip he is there, and \`entered\` fires, in that very advance.
    const there = fired("entered");
    const first = snap(a);
    const coming = there ? { frames: [], at: 0 } : run("entered", 4);
    v.boolean("leave").value = true;
    const stilling = run("still", 7);
    v.boolean("exit").value = true;
    const going = run("gone", 4);
    m.delete();
    a.delete();
    return { from, fresh, before, first, coming, stilling, going };
  });
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

async function run(bytes, loops, clips, froms) {
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
    clips,
    froms,
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
  ways: 0,
  waysOk: 0,
};
const failures = [];
/** Each file's still, and each arrival clip's first picture, to compare across files. */
const stills = {};
const arrivalStarts = [];
for (const status of STATUS) {
  const name = fileName(status);
  const fail = (m) => failures.push(`${name}.riv: ${m}`);
  const before = failures.length;
  const bytes = readFileSync(join(dir, `${name}.riv`));
  const loops = loopsOf(status);
  const resting = loops.length === 0;
  /** The picture reduced motion holds: the first loop's first drawing, or the rest drawing. */
  const stillOf = loops[0]?.name ?? REST;
  const ways = clipsOf(status);
  const clipFrames = (clip) =>
    JSON.parse(readFileSync(here(`../clips/${clip}/timing.json`), "utf8"))
      .frames;
  const clips = [
    ...new Set([ways.enter, ways.exit, ...Object.values(ways.arrivals)].flat()),
  ].map((clip) => ({ name: clip, frames: clipFrames(clip) }));
  // A first appearance, and every status he can arrive from by a clip.
  const froms = [
    "none",
    ...Object.keys(ways.arrivals).filter((f) => ways.arrivals[f].length),
  ];
  // biome-ignore lint/performance/noAwaitInLoops: one file at a time, so no run's load timing shares the CPU with another
  const now = await run(bytes, loops, clips, froms);
  const again = await run(bytes, loops, clips, froms);
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
    JSON.stringify(now.enums) !==
      JSON.stringify([{ name: "CawFrom", values: FROM }]) ||
    props !==
      JSON.stringify([
        ["reducedMotion", "boolean"],
        ["dark", "boolean"],
        ["from", "enumType"],
        ["leave", "boolean"],
        ["exit", "boolean"],
        ["entered", "trigger"],
        ["still", "trigger"],
        ["gone", "trigger"],
      ])
  ) {
    fail(
      `contract: view model ${now.viewModel} ${props}, enums ${JSON.stringify(now.enums)}, ${now.inputs} inputs`
    );
  }
  if (now.unset !== now.hidden) {
    fail("before `from` is set it draws something");
  }
  if (!now.enteredFirst) {
    fail("a first appearance never fires `entered`");
  }

  // The ways in and out. Frames are compared as the order of distinct pictures: a way in shows
  // its clips' drawings in order and ends on his still; `leave` brings his still and `still`;
  // `exit` shows the exit's drawings in order and ends on an empty page with `gone`.
  const stillPicture = now.expected.find(
    (e) => e.loop === stillOf && e.slot === 0 && !e.dark
  ).frame;
  const distinct = (frames) =>
    frames.filter((f, k) => k === 0 || f !== frames[k - 1]);
  const same = (a, b) => a.length === b.length && a.every((f, k) => f === b[k]);
  const played = (clipNames) => clipNames.flatMap((c) => now.clips[c]);
  const within = (at, frames) =>
    at !== null && Math.abs(at * FPS - frames) <= 2;
  for (const clip of clips) {
    const runs = [];
    for (const [k, f] of now.clips[clip.name].entries()) {
      if (k > 0 && f === now.clips[clip.name][k - 1]) {
        runs[runs.length - 1] += 1;
      } else {
        runs.push(1);
      }
    }
    if (!runs.every((n) => n >= 2)) {
      fail(`clip ${clip.name} drawings on screen for ${runs.join(",")} frames`);
    }
  }
  const exitFrames = ways.exit.reduce((n, c) => n + clipFrames(c), 0);
  let waysOk = 0;
  const timing = [];
  for (const d of now.drives) {
    const at = failures.length;
    const coming = d.from === "none" ? ways.enter : ways.arrivals[d.from];
    const comingFrames = coming.reduce((n, c) => n + clipFrames(c), 0);
    if (d.fresh !== "unset,false,false") {
      fail(`from ${d.from}: its \`Caw\` instance starts as ${d.fresh}`);
    }
    if (d.before !== now.hidden) {
      fail(`from ${d.from}: something is drawn before \`from\` is set`);
    }
    if (coming.length) {
      const shown = distinct([d.first, ...d.coming.frames]);
      // The frame `entered` fires on is his still or his first loop's first drawing: the same picture.
      if (!same(shown, distinct([...played(coming), stillPicture]))) {
        fail(
          `from ${d.from}: the way in does not show ${coming.join(" + ")} in order, then his still`
        );
      }
      if (!within(d.coming.at, comingFrames)) {
        fail(
          `from ${d.from}: entered after ${d.coming.at} s, clips last ${comingFrames} frames`
        );
      }
      if (now.clips[coming.at(-1)].at(-1) !== stillPicture) {
        fail(`from ${d.from}: ${coming.at(-1)} does not land on his still`);
      }
    } else if (d.coming.at === null) {
      fail(`from ${d.from}: never entered`);
    }
    if (d.stilling.at === null || d.stilling.frames.at(-1) !== stillPicture) {
      fail(
        `from ${d.from}: \`leave\` did not bring his still (\`still\` after ${d.stilling.at} s, on his still: ${d.stilling.frames.at(-1) === stillPicture})`
      );
    }
    const leaving = distinct([d.stilling.frames.at(-1), ...d.going.frames]);
    if (
      d.going.at === null ||
      !same(leaving, distinct([stillPicture, ...played(ways.exit), now.hidden]))
    ) {
      fail(
        `from ${d.from}: \`exit\` does not show ${ways.exit.join(" + ") || "nothing"} in order, then an empty page`
      );
    } else if (!within(d.going.at, exitFrames)) {
      fail(
        `from ${d.from}: gone after ${d.going.at} s, exit lasts ${exitFrames} frames`
      );
    }
    waysOk += failures.length === at ? 1 : 0;
    timing.push(`${d.from} in ${Math.round((comingFrames / FPS) * 1000)} ms`);
  }
  totals.ways += now.drives.length;
  totals.waysOk += waysOk;
  stills[name] = stillPicture;
  for (const [from, coming] of Object.entries(ways.arrivals)) {
    if (coming.length) {
      arrivalStarts.push({
        name,
        from,
        clip: coming[0],
        frame: now.clips[coming[0]][0],
      });
    }
  }

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
      `reducedMotion ${held ? "holds still" : "MOVES"}; rotation ${rotation}; ways ${waysOk}/${now.drives.length} (${timing.join(", ")}; out ${Math.round((exitFrames / FPS) * 1000)} ms) — ${ok ? "ok" : "FAIL"}`
  );
}
await browser.close();
// A status change hands over on one picture: an arrival opens on the other file's still.
let handovers = 0;
for (const a of arrivalStarts) {
  if (a.frame === stills[a.from]) {
    handovers += 1;
  } else {
    failures.push(
      `${a.name}.riv: ${a.clip} does not open on ${a.from}'s still`
    );
  }
}
for (const f of failures) {
  console.log(`  FAIL ${f}`);
}
console.log(`loops animate: ${totals.animate}/${totals.looping}`);
console.log(`stills rest: ${totals.rested}/${totals.stills}`);
console.log(`reducedMotion holds still: ${totals.held}/${totals.files}`);
console.log(`ways in and out: ${totals.waysOk}/${totals.ways}`);
console.log(`handovers on one picture: ${handovers}/${arrivalStarts.length}`);
console.log(`files proven: ${totals.ok}/${totals.files}`);
if (failures.length === 0 && totals.ok === STATUS.length) {
  console.log("Caw view model drives the state machine in every status file");
} else {
  process.exitCode = 1;
}
