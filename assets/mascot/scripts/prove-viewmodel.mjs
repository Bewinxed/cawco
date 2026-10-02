// Proves that caw.riv's `Caw` view model drives its state machine exactly as the old
// input-driven file did, on Rive's official runtime (@rive-app/canvas-advanced, WASM) in
// headless Chromium.
//
// Each file runs in its own fresh page, so each gets a fresh WASM instance. Every page pins the
// runtime's sources of randomness (its clocks and crypto.getRandomValues, see SEED_RANDOM) before
// the runtime loads, and both files get the identical sequence of changes, so the random
// loading/reconnecting turns are pinned the same way in both. The new file runs twice to show the
// pin holds. Every step advances the same time; each frame of the new file must equal its twin
// from the old one, pixel for pixel.
//
// usage: node prove-viewmodel.mjs [--before old.riv] [--after caw.riv] [--frames dir]
//   --before defaults to the last input-driven caw.riv in git (407a705e).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const ADVANCE_S = 0.5;
const SIZE = 512;
const CHROMIUM_DIR = /^chromium-\d+$/;
const TURN_STATE = /^turn_(loading|reconnecting)_/;

/** `--name value` pairs. */
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith("--")) {
    args[argv[i].slice(2)] = argv[i + 1];
  }
}
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const before = args.before
  ? readFileSync(args.before)
  : execFileSync("git", ["show", "407a705e:assets/mascot/caw.riv"], {
      cwd: here("."),
      maxBuffer: 64 * 1024 * 1024,
    });
const after = readFileSync(args.after ?? here("../caw.riv"));

/** The same sequence for both files: every status × dark × reducedMotion, then re-entries. */
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
function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
window.run = async (b64, mode, steps, size, advance, keepPng) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const file = await rive.load(bytes);
  const ab = file.artboardByName("Caw");
  const sm = new rive.StateMachineInstance(ab.stateMachineByName("CawStates"), ab);
  const report = { inputs: sm.inputCount(), frames: [] };
  let vmi = null;
  const inputs = {};
  if (mode === "viewmodel") {
    const vm = file.defaultArtboardViewModel(ab);
    report.viewModel = vm ? vm.name : null;
    report.properties = vm ? vm.getProperties() : [];
    report.enums = file.enums().map((e) => ({ name: e.name, values: e.values }));
    vmi = vm.defaultInstance();
    sm.bindViewModelInstance(vmi);
  } else {
    for (let i = 0; i < sm.inputCount(); i++) inputs[sm.input(i).name] = sm.input(i);
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  document.body.appendChild(canvas);
  const renderer = rive.makeRenderer(canvas);
  const ctx = canvas.getContext("2d");
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
  seek(0);
  for (const s of steps) {
    let readBack = null;
    if (mode === "viewmodel") {
      vmi.enum("status").value = STATUS[s.status];
      vmi.boolean("dark").value = s.dark;
      vmi.boolean("reducedMotion").value = s.reducedMotion;
      readBack = { status: vmi.enum("status").value, dark: vmi.boolean("dark").value, reducedMotion: vmi.boolean("reducedMotion").value };
    } else {
      inputs.status.asNumber().value = s.status;
      inputs.dark.asBool().value = s.dark;
      inputs.reducedMotion.asBool().value = s.reducedMotion;
    }
    changed.length = 0;
    seek(advance);
    const states = [...changed];
    renderer.clear();
    renderer.save();
    renderer.align(rive.Fit.contain, rive.Alignment.center, { minX: 0, minY: 0, maxX: size, maxY: size }, ab.bounds);
    ab.draw(renderer);
    renderer.restore();
    rive.resolveAnimationFrame();
    // The raw pixels go back to Node, which compares them; PNGs only when frames are kept.
    const rgba = ctx.getImageData(0, 0, size, size).data;
    report.frames.push({ rgba: toBase64(rgba), png: keepPng ? canvas.toDataURL("image/png") : null, readBack, states });
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
  for (const rev of revs) {
    const exe = join(root, rev, "chrome-linux", "chrome");
    if (existsSync(exe)) {
      return exe;
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
async function run(bytes, mode) {
  // A fresh context and page per file: a fresh WASM instance under the pinned clocks and entropy.
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
  const report = await page.evaluate(
    ([b64, m, s, size, adv, png]) => window.run(b64, m, s, size, adv, png),
    [
      Buffer.from(bytes).toString("base64"),
      mode,
      steps,
      SIZE,
      ADVANCE_S,
      Boolean(args.frames),
    ]
  );
  await context.close();
  for (const frame of report.frames) {
    frame.rgba = Buffer.from(frame.rgba, "base64");
    frame.hash = createHash("sha256").update(frame.rgba).digest("hex");
  }
  return report;
}

/** Pixels whose RGBA differ between two frames of the same size. */
function differingPixels(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (
      a[i] !== b[i] ||
      a[i + 1] !== b[i + 1] ||
      a[i + 2] !== b[i + 2] ||
      a[i + 3] !== b[i + 3]
    ) {
      n += 1;
    }
  }
  return n;
}

const runtimeVersion = JSON.parse(
  readFileSync(join(runtimeDir, "package.json"), "utf8")
).version;
console.log(`runtime: @rive-app/canvas-advanced ${runtimeVersion}`);
const old = await run(before, "inputs");
const now = await run(after, "viewmodel");
const again = await run(after, "viewmodel");
await browser.close();
const picks = (r) =>
  r.frames
    .map((f) => f.states.filter((s) => s.startsWith("turn_")).join(","))
    .join("|");
const pinned = picks(now) === picks(again);
console.log(
  `random turns pinned: ${pinned ? "identical across two runs" : "DIFFERENT across two runs"}`
);

console.log(`before: ${old.inputs} inputs; after: inputs: ${now.inputs}`);
console.log(`view model: ${now.viewModel}`);
for (const p of now.properties) {
  console.log(`  ${p.name}: ${p.type}${p.enumName ? ` (${p.enumName})` : ""}`);
}
for (const e of now.enums) {
  console.log(`enum ${e.name}: ${e.values.join(", ")}`);
}

if (args.frames) {
  mkdirSync(args.frames, { recursive: true });
}
let matched = 0;
const failures = [];
const turns = [];
steps.forEach((s, i) => {
  const a = old.frames[i];
  const b = now.frames[i];
  const label = `${STATUS[s.status]}${s.dark ? " dark" : ""}${s.reducedMotion ? " reducedMotion" : ""}`;
  const rb = b.readBack;
  const readOk =
    rb.status === STATUS[s.status] &&
    rb.dark === s.dark &&
    rb.reducedMotion === s.reducedMotion;
  const diff = differingPixels(a.rgba, b.rgba);
  if (diff === 0 && readOk) {
    matched += 1;
  } else {
    failures.push(
      `step ${i} (${label}): ${diff ? `${diff} pixels differ ` : ""}${readOk ? "" : `read back ${JSON.stringify(rb)} `}` +
        `states before [${a.states.join(" ")}] after [${b.states.join(" ")}]`
    );
  }
  const turn = b.states.find((st) => TURN_STATE.test(st));
  if (turn) {
    turns.push(`${i}:${turn.replace("turn_", "")}`);
  }
  if (args.frames) {
    for (const [tag, f] of [
      ["before", a],
      ["after", b],
    ]) {
      writeFileSync(
        join(args.frames, `${String(i).padStart(2, "0")}-${tag}.png`),
        Buffer.from(f.png.split(",")[1], "base64")
      );
    }
  }
});
const distinct = new Set(now.frames.map((f) => f.hash)).size;
console.log(
  `frames: ${matched}/${steps.length} pixel-identical to the input-driven file (${distinct} distinct frames)`
);
console.log(`random turns: ${turns.join(" ")}`);
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
