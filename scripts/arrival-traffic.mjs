// biome-ignore-all lint/performance/noAwaitInLoops: this driver is a sequencer.
// Every loop here is a scenario played in order — each one remounts the
// transcript and records it in isolation — so the awaits are the schedule, not
// a missed batching opportunity.

/**
 * ARRIVAL TRAFFIC — drive the transcript's row-arrival motion and report what
 * Chrome actually animated.
 *
 * The DevTools Animations panel, scripted. It records `Animation.animationStarted`
 * over CDP, which is what Chrome CREATED — not what a computed style happened to
 * say a frame later, and not what the source implies should have happened. That
 * distinction is the whole point: the defect this was built for (a run of tool
 * calls animating only its first call) was invisible in the source and invisible
 * in a screenshot, and obvious the moment the animations were listed.
 *
 * It drives `/motion/traffic`, which mounts the real Transcript against a
 * synthetic session, so a scenario costs a few seconds instead of a model
 * session's worth of tokens.
 *
 *   bun scripts/arrival-traffic.mjs --url=http://127.0.0.1:3000
 *   bun scripts/arrival-traffic.mjs --scenario=run --headed --rate=0.2
 *
 * Exits non-zero if the arrival contract below is broken, so it can gate a
 * change to the motion code.
 */

import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
function playwright() {
  const roots = [process.cwd()];
  try {
    roots.push(`${execSync("npm root -g").toString().trim()}/uisentinel`);
  } catch {
    // No global npm root. The local resolution below is the common case.
  }
  for (const root of roots) {
    try {
      return require_(
        require_.resolve("playwright", {
          paths: [root, `${root}/node_modules`],
        })
      );
    } catch {
      // Not resolvable under this root; try the next one.
    }
  }
  return require_("playwright");
}

const argv = process.argv.slice(2);
const opt = Object.fromEntries(
  argv
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, ...v] = a.slice(2).split("=");
      return [k, v.length ? v.join("=") : true];
    })
);
/**
 * Svelte scopes keyframe names per component (`svelte-1a2b3c-reserve`), so the
 * storyboard's own name is the tail. Matched as a suffix rather than stripped
 * as a prefix: a scope hash is itself lowercase-and-hyphens often enough that
 * a lazy prefix strip stops at the wrong hyphen, and `msg-word` contains one,
 * which is exactly how it went missing. Longest alternative first so
 * `msg-word` is not read as `word`.
 */
const STORYBOARD =
  /(?:^|-)(thinking-open-reserve|thinking-close-reserve|swap-reserve|msg-word|reserve|render|reveal|draw|word)$/;

const base = opt.url ?? "http://127.0.0.1:3000";
const scenario = opt.scenario ?? "all";
const rate = Number(opt.rate ?? 1);

/**
 * THE ARRIVAL CONTRACT.
 *
 * Each scenario says what it does to the transcript and what the motion must
 * look like afterwards. These are the invariants the storyboard promises, in
 * the form a recording can actually check.
 */
const SCENARIOS = {
  /* A run of tool calls, arriving one at a time into ONE folded row. The row is
     created by the first call and every later call is appended to it, which is
     the case that used to animate exactly once. */
  run: {
    what: "6 tool calls, 900ms apart, folding into one row",
    async drive(bench) {
      await bench.evaluate(() => window.__traffic.run(6, 900));
    },
    expect: (a) => [
      ["one reserve per call", a.count("reserve"), 6],
      ["one render per call", a.count("render"), 6],
      ["one glyph reveal per call", a.inTools("reveal").length, 6],
      [
        "no reveal on an expired clock",
        a.inTools("reveal").filter((x) => x.delay === 0).length,
        0,
      ],
    ],
  },

  /* The same run, faster than the stagger window. The queue must compress
     rather than queue up a tail: a burst still drains inside one window. */
  burst: {
    what: "6 tool calls, 120ms apart",
    async drive(bench) {
      await bench.evaluate(() => window.__traffic.run(6, 120));
    },
    expect: (a) => [
      ["one reserve per call", a.count("reserve"), 6],
      [
        "no reveal on an expired clock",
        a.inTools("reveal").filter((x) => x.delay === 0).length,
        0,
      ],
    ],
  },

  /* Prose. A paragraph reserves its space like any other row — it did not,
     for a long time, because opening was gated on owning a rail. The viewport
     is pinned while a row opens, so a turn that did not open left the follow
     loop to close an 82px gap on its own: one jolt, then a flat crawl at a
     pace unrelated to the words appearing. */
  prose: {
    what: "4 assistant paragraphs arriving",
    async drive(bench) {
      for (let i = 0; i < 4; i += 1) {
        await bench.evaluate(
          (n) =>
            window.__traffic.assistant(
              `Turn ${n}. A paragraph of prose long enough to wrap onto more than one line, so the space it reserves is worth watching.`
            ),
          i
        );
        await bench.waitForTimeout(800);
      }
    },
    expect: (a) => [
      ["one reserve per paragraph", a.count("reserve"), 4],
      ["the words reveal", a.count("msg-word") > 0, true],
    ],
  },

  /* The live tail changing its mind: reasoning, then the answer, in ONE
     container. These used to be two rows, so the reasoning was removed at full
     height and the answer opened a fresh space below the hole — measured as an
     18px single-frame lurch on a viewport pinned to the bottom. The space must
     be held across the swap and tween to the new size. */
  swap: {
    what: "reasoning giving way to the answer in one container",
    async drive(bench) {
      await bench.evaluate(() =>
        window.__traffic.thinking(
          "Working out how the rail behaves when a run of calls arrives together."
        )
      );
      await bench.waitForTimeout(1100);
      await bench.evaluate(() => {
        window.__traffic.thinking(null);
        window.__traffic.streaming(
          "Here is the answer that takes the reasoning block's place in the same container."
        );
      });
      await bench.waitForTimeout(1400);
    },
    expect: (a) => [
      ["the container reserves once, not twice", a.count("reserve"), 1],
      ["the same container morphs between phases", a.count("swap-reserve"), 1],
    ],
  },

  /* History landing is not an arrival. Opening a conversation must be silent —
     this is the regression that made every refresh replay the whole transcript.
     Seeded through `reset`, so the rows are present when the transcript mounts,
     which is what a page load actually looks like. */
  history: {
    what: "a transcript opening on 14 rows of history",
    seed: 0,
    async drive(bench) {
      await bench.evaluate(() => window.__traffic.reset(14));
      await bench.waitForTimeout(1800);
    },
    expect: (a) => [["opening a conversation is silent", a.total, 0]],
  },
};

const browser = await playwright().chromium.launch({ headless: !opt.headed });
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 950 },
});
const page = await ctx.newPage();
// Bench traffic is local; isolate the recording from dev-server HMR.
await page.routeWebSocket(/.*/, () => undefined);
await page.goto(`${base}/motion/traffic`, { waitUntil: "networkidle" });

const cdp = await ctx.newCDPSession(page);
await cdp.send("DOM.enable");
await cdp.send("Runtime.enable");
await cdp.send("Animation.enable");
if (rate !== 1) {
  await cdp.send("Animation.setPlaybackRate", { playbackRate: rate });
}

let recording = [];
let armed = false;

async function describe(backendNodeId) {
  try {
    const { object } = await cdp.send("DOM.resolveNode", { backendNodeId });
    const { result } = await cdp.send("Runtime.callFunctionOn", {
      objectId: object.objectId,
      returnByValue: true,
      functionDeclaration: `function () {
        const el = this.nodeType === 1 ? this : this.parentElement;
        if (!el) return JSON.stringify({ tag: "(pseudo)" });
        const wrapper = el.closest(".arrive");
        return JSON.stringify({
          tag: el.tagName.toLowerCase(),
          inTools: !!el.closest(".tools"),
          still: wrapper ? wrapper.classList.contains("still") : null,
          text: (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 30),
        });
      }`,
    });
    return JSON.parse(result.value);
  } catch {
    return { tag: "?", inTools: false, still: null, text: "" };
  }
}

cdp.on("Animation.animationStarted", async ({ animation }) => {
  if (!armed) {
    return;
  }
  const src = animation.source ?? {};
  const raw = animation.name || src.keyframesRule?.name || "?";
  const name = raw.match(STORYBOARD)?.[1];
  if (!name) {
    return;
  }
  recording.push({
    name,
    delay: Math.round(src.delay ?? 0),
    dur: Math.round(src.duration ?? 0),
    ...(await describe(src.backendNodeId)),
  });
});

/** What a scenario's expectations are checked against. */
const analysis = () => ({
  total: recording.length,
  count: (name) => recording.filter((rec) => rec.name === name).length,
  inTools: (name) =>
    recording.filter((rec) => rec.name === name && rec.inTools),
});

const names = scenario === "all" ? Object.keys(SCENARIOS) : [scenario];
let failed = 0;

for (const key of names) {
  const s = SCENARIOS[key];
  if (!s) {
    console.error(
      `unknown scenario: ${key}\nknown: ${Object.keys(SCENARIOS).join(", ")}`
    );
    process.exit(2);
  }

  // Every scenario starts from a transcript that has LANDED and gone quiet.
  // Arrivals are gated on exactly that, so a bench that skipped it would
  // measure the silence rather than the motion. `reset` remounts, so each
  // scenario is judged on its own and not on what the last one taught the
  // component.
  const seedCount = s.seed ?? 12;
  await page.evaluate((count) => window.__traffic.reset(count), seedCount);
  await page.waitForTimeout(1600);

  recording = [];
  armed = true;
  await s.drive(page);
  await page.waitForTimeout(1600);
  armed = false;

  const checks = s.expect(analysis());
  const bad = checks.filter(([, got, want]) => got !== want);
  failed += bad.length;

  console.log(`\n${bad.length ? "FAIL" : "ok  "}  ${key} — ${s.what}`);
  for (const [label, got, want] of checks) {
    const mark = got === want ? "  " : "->";
    console.log(
      `   ${mark} ${label}: ${got}${got === want ? "" : ` (expected ${want})`}`
    );
  }
  if (bad.length || opt.verbose) {
    const tally = {};
    for (const a of recording) {
      tally[a.name] = (tally[a.name] ?? 0) + 1;
    }
    console.log(`      recorded: ${JSON.stringify(tally)}`);
    for (const a of recording) {
      console.log(
        `      ${a.name.padEnd(8)} delay=${String(a.delay).padEnd(4)} inTools=${String(a.inTools).padEnd(5)} "${a.text}"`
      );
    }
  }
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
