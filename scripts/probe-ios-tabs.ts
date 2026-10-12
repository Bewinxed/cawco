#!/usr/bin/env bun
/**
 * iOS folder-tab switch probe: a tap moves the choice the way the web's
 * fluid-tabs do, one cross-fade in place on one clock (`durSettle`, 400ms,
 * on `easeCrossfade`): the old sheet fades out over its own card as the new
 * one fades in over its own, every rim's strength follows the clock, nothing
 * slides, wipes or masks a sheet, and the front tab changes at half way;
 * where two tabs meet, the gliding side's ink leans toward its neighbour's,
 * so the seam's colour never changes at the handover; and a finger that
 * takes the pages while a tap's switch runs carries the strip on from where
 * it was drawn, with no jump.
 *
 *   bun scripts/probe-ios-tabs.ts [--built] [--keep]
 *
 * Run from the repo root on the Mac itself (a CawCo workspace on the Mac
 * included). It:
 *
 *  1. compiles the app (build-both.sh ios --compile-only), unless --built;
 *  2. stands up a scratch fleet (scratch-fleet.ts) with four Claude Code
 *     sessions: three kept working (a slow mock turn) so their rims wear the
 *     live ink, whose strength the choice moves (an idle rim's does not),
 *     and the third parked on a permission ask, its rim the attention ink;
 *  3. on an iPhone 16 Pro and an iPad Pro 11-inch (M4), iOS 18.5, light and
 *     dark, launches the app with `-open-session a,b,c,d -tabs-probe`: the
 *     strip taps a step to a neighbour and a jump past one on the real
 *     clock, logging every frame, then the same two on a stepped clock that
 *     holds the clock's quarters and f = 0.45/0.5/0.55, capturing the window
 *     and the strip at each (PaneTabsView `-tabs-probe`); the held step is
 *     the working fourth tab to the attention third, whose seam's ink is
 *     read at f = 0.45/0.5/0.55. Then, on three working tabs in a row, a
 *     real tap on the second (axe tap, at the point the app logs) and
 *     straight after it a finger's drag on the pages toward the third (axe
 *     drag), which takes the pages while the tap's switch runs: retried
 *     until it takes the tap's own switch between 0.1 and 0.9 of the way;
 *  4. checks every logged frame and copies the captures and the log to
 *     $TMPDIR/ios-tabs/ (or ./.probe/ios-tabs).
 *
 * Prints `PASS <check>` / `FAIL <check>` and exits 0 only if all pass. It
 * stops only what it started; the simulators it created are deleted.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { type Seen, scratchFleet, until } from "./scratch-fleet";

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const root = resolve(import.meta.dir, "..");
const out = join(process.env.TMPDIR ?? join(root, ".probe"), "ios-tabs");
await mkdir(out, { recursive: true });
const cache =
  process.env.XDG_CACHE_HOME ??
  join(process.env.HOME ?? "", "Library", "Caches");
const top = (
  await Bun.$`git -C ${root} rev-parse --show-toplevel`.text()
).trim();
const build =
  top === join(process.env.HOME ?? "", "cockpit") ? "main" : basename(top);
const app = join(
  cache,
  "cawco-apple",
  build,
  "DerivedData",
  "Build",
  "Products",
  "Debug-iphonesimulator",
  "CawCo.app"
);

let failed = 0;
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) {
    failed += 1;
  }
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};
const sh = async (script: string): Promise<string> => {
  const child = Bun.spawn(["bash", "-c", `set -euo pipefail\n${script}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
};

if (!args.includes("--built")) {
  const text = await sh(
    "bash apps/apple/scripts/build-both.sh ios --compile-only"
  );
  check("compile", /^BUILT iOS 18\.5$/m.test(text), "BUILT iOS 18.5");
}

// ── The fleet: three sessions mid-turn for the whole run, one asking ─────
const WORK = "tabs-probe-work";
const ASK = "tabs-probe-ask";
const respond = (request: Seen) => {
  if (request.tools && request.last.includes(WORK)) {
    return {
      everyMs: 2000,
      words: Array.from({ length: 900 }, (_, n) => `word${n} `),
    };
  }
  if (request.tools && request.last.includes(ASK)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: { command: `touch ${ASK}.txt`, description: "Make a file" },
      },
    };
  }
  return { everyMs: 10, words: ["Done."] };
};
const fleet = await scratchFleet({ name: "probe-ios-tabs", respond });
const sims: string[] = [];

interface Tab {
  chevron: number;
  fill: string;
  id: string;
  keys: string;
  lead: string;
  moved: number;
  pick: number;
  rim: number;
  sheet: number;
  sheetShown: number;
  tabTransform: string;
  top: string;
  trail: string;
}
interface Sample {
  f: number;
  front: string;
  label: string;
  scroll: number;
  t: number | "landed";
  tabs: Tab[];
  toward: string;
}

const LINE =
  /tabs (\S+) t=(\S+) f=(\S+) front=(\S+) toward=(\S+) seams=\S* scroll=(\S+) \|\| (.*)$/;
const TAB =
  /^(\S+) pick=(\S+) sheet=(\S+)\/(\S+) tint=\S+ rim=(\S+) chev=(\S+) moved=(\d) tx=(.+?) keys=(\S+) fill=(\S+) under=\S+ top=(\S+) lead=(\S+) trail=(\S+)/;
function parse(log: string): Sample[] {
  return log.split("\n").flatMap((line) => {
    const m = LINE.exec(line);
    if (!m) {
      return [];
    }
    const tabs = m[7].split(" | ").flatMap((part) => {
      const t = TAB.exec(part.trim());
      return t
        ? [
            {
              id: t[1],
              pick: +t[2],
              sheet: +t[3],
              sheetShown: +t[4],
              rim: +t[5],
              chevron: +t[6],
              moved: +t[7],
              tabTransform: t[8],
              keys: t[9],
              fill: t[10],
              top: t[11],
              lead: t[12],
              trail: t[13],
            },
          ]
        : [];
    });
    return [
      {
        label: m[1],
        t: m[2] === "landed" ? "landed" : +m[2],
        f: +m[3],
        front: m[4],
        toward: m[5],
        scroll: +m[6],
        tabs,
      },
    ];
  });
}

const monotonic = (values: number[], rising: boolean) =>
  values.every(
    (v, i) =>
      i === 0 ||
      (rising ? v >= values[i - 1] - 1e-6 : v <= values[i - 1] + 1e-6)
  );

/** The checks on one switch's samples, between the tab it left and the one it went to. */
function judge(
  run: string,
  label: string,
  samples: Sample[],
  from: string,
  to: string
) {
  const timed = samples.filter((s) => s.t !== "landed");
  const landed = samples.find((s) => s.t === "landed");
  const tab = (s: Sample, id: string) =>
    s.tabs.find((t) => id.startsWith(t.id));
  const name = `${run} ${label}`;
  if (timed.length < 2 || !landed) {
    check(
      `${name} sampled`,
      false,
      `${timed.length} frames, landed ${landed ? "yes" : "no"}`
    );
    return;
  }
  const first = <T>(values: T[]) => values[0];
  const final = <T>(values: T[]) => values.at(-1) as T;
  const leaving = timed.map((s) => tab(s, from)?.sheet ?? Number.NaN);
  const coming = timed.map((s) => tab(s, to)?.sheet ?? Number.NaN);
  check(
    `${name} sheets cross-fade`,
    monotonic(leaving, false) &&
      monotonic(coming, true) &&
      first(leaving) === 1 &&
      first(coming) === 0 &&
      final(leaving) === 0 &&
      final(coming) === 1,
    `leaving ${leaving.map((v) => v.toFixed(2)).join(" ")}; coming ${coming.map((v) => v.toFixed(2)).join(" ")}`
  );
  // A frame is sampled before or after its commit: what is on screen then is
  // exactly the value this frame or the one before set, and nothing between
  // them, when no implicit fade runs.
  const near = (a: number, b: number | undefined) =>
    b !== undefined && Math.abs(a - b) < 1e-3;
  const onScreen = timed.every((s, i) =>
    s.tabs.every(
      (t, k) =>
        near(t.sheetShown, t.sheet) ||
        (i > 0 && near(t.sheetShown, timed[i - 1].tabs[k]?.sheet))
    )
  );
  check(
    `${name} sheet drawn as set`,
    onScreen,
    "each frame's on-screen sheet opacity is exactly a value the clock set (no implicit fade)"
  );
  const rimOut = timed.map((s) => tab(s, from)?.rim ?? Number.NaN);
  const rimIn = timed.map((s) => tab(s, to)?.rim ?? Number.NaN);
  check(
    `${name} rims follow the clock`,
    monotonic(rimOut, false) &&
      monotonic(rimIn, true) &&
      first(rimOut) > final(rimOut) &&
      final(rimIn) > first(rimIn),
    `leaving ${rimOut.map((v) => v.toFixed(3)).join(" ")}; coming ${rimIn.map((v) => v.toFixed(3)).join(" ")}`
  );
  const still = samples.every((s) =>
    s.tabs.every(
      (t) => t.moved === 0 && t.tabTransform === "id" && t.keys === "-"
    )
  );
  check(
    `${name} nothing slides or wipes`,
    still,
    "no sheet transform, mask or running animation; every tab's transform identity"
  );
  const fronts = timed.map((s) => `${s.f.toFixed(3)}:${s.front}`);
  // Before half way the tab it leaves is in front, past it the one it goes to; at half way either.
  const frontOk = timed.every(
    (s) =>
      (s.f >= 0.5 || from.startsWith(s.front)) &&
      (s.f <= 0.5 || to.startsWith(s.front))
  );
  check(`${name} front changes at half way`, frontOk, fronts.join(" "));
  const scrolls = timed.map((s) => s.scroll);
  const moved = final(scrolls) !== first(scrolls);
  check(
    `${name} strip scrolls on the clock`,
    monotonic(scrolls, final(scrolls) >= first(scrolls)),
    moved
      ? `scroll ${scrolls.map((v) => v.toFixed(1)).join(" ")}`
      : `the chosen tab was in view: scroll held at ${first(scrolls)}`
  );
  const last = final(timed);
  const same =
    last.scroll === landed.scroll &&
    last.tabs.every((t, i) => {
      const l = landed.tabs[i];
      return (
        l &&
        l.sheet === t.sheet &&
        l.rim === t.rim &&
        l.fill === t.fill &&
        l.pick === t.pick
      );
    });
  check(
    `${name} lands where t=1 stood`,
    same,
    `scroll ${last.scroll} → ${landed.scroll}`
  );
}

/** An ink as the probe logs it: extended-sRGB components, unclamped. */
const rgb = (ink: string) => ink.split(",").map(Number);

/**
 * The seam between the two tabs a held step trades, at f = 0.45, 0.5, 0.55:
 * the ink of the side the front tab draws there (the leaving tab's up to
 * half way, the coming tab's past it), as a share of the way from the
 * leaving tab's own ink to the coming tab's (0 its own, 1 the other's). The
 * side's ink leans as far as the seam has glided, so the share is f either
 * side of the handover: half way, whichever tab draws the seam draws it in
 * the same ink, and the colour moves on evenly through the handover rather
 * than changing there. (The tab behind keeps its own ink on a side its
 * neighbour's card covers, as the web's does.)
 */
function judgeSeam(run: string, samples: Sample[], from: string, to: string) {
  const name = `${run} seam ink`;
  const at = (s: Sample) => s.tabs.findIndex((t) => from.startsWith(t.id));
  const near = samples.filter(
    (s) => typeof s.t === "number" && [0.45, 0.5, 0.55].includes(s.f)
  );
  if (near.length !== 3) {
    check(name, false, `${near.length} of the f=0.45/0.5/0.55 stops logged`);
    return;
  }
  const readings = near.map((s) => {
    const fromAt = at(s);
    const toAt = s.tabs.findIndex((t) => to.startsWith(t.id));
    const [left, right] =
      fromAt < toAt
        ? [s.tabs[fromAt], s.tabs[toAt]]
        : [s.tabs[toAt], s.tabs[fromAt]];
    const own = rgb(s.tabs[fromAt].top);
    const other = rgb(s.tabs[toAt].top);
    const drawer = s.front === left.id ? left : right;
    const ink = s.front === left.id ? left.trail : right.lead;
    const seam = rgb(ink);
    const span = other.map((v, k) => v - own[k]);
    const length = span.reduce((sum, v) => sum + v * v, 0);
    const share =
      seam.reduce((sum, v, k) => sum + (v - own[k]) * span[k], 0) / length;
    return { f: s.f, share, drawer: drawer.id, ink, length };
  });
  const leans = readings.every((r) => Math.abs(r.share - r.f) <= 0.02);
  check(
    name,
    leans && readings.every((r) => r.length > 1e-4),
    `${from.slice(0, 8)} ${near[0].tabs[at(near[0])].top} → ${to.slice(0, 8)} ${near[0].tabs.find((t) => to.startsWith(t.id))?.top}: ${readings
      .map(
        (r) =>
          `f=${r.f.toFixed(2)} drawn by ${r.drawer} in ${r.ink}, share ${r.share.toFixed(3)}`
      )
      .join("; ")}`
  );
}

/**
 * A tap's switch, then the swipe that took the pages from it: no frame
 * across the takeover moves any sheet, rim or the strip further than the
 * largest step of the frames either side of it.
 */
/** Whether the swipe took the tap's own switch part-way, 0.1 to 0.9 of it. */
function tookMidway(samples: Sample[]): boolean {
  const frames = samples.filter((s) => s.t !== "landed");
  const at = frames.findIndex((s) => s.label.endsWith("-ride"));
  if (at < 1) {
    return false;
  }
  const tapped = frames[0].toward;
  const took = frames[at - 1].f;
  return (
    frames.slice(0, at).every((s) => s.toward === tapped) &&
    took > 0.1 &&
    took < 0.9
  );
}

function judgeTakeover(run: string, samples: Sample[]) {
  const name = `${run} takeover`;
  const frames = samples.filter((s) => s.t !== "landed");
  const at = frames.findIndex((s) => s.label.endsWith("-ride"));
  if (at < 1) {
    check(
      name,
      false,
      `the finger took no switch under way (${at === 0 ? "no tap frames first" : "no swipe frames"})`
    );
    return;
  }
  // The switch it took is the tap's own, under way: every frame before it
  // heading for the tapped tab, the strip part-way there.
  const tapped = frames[0].toward;
  const took = frames[at - 1].f;
  check(
    `${name} mid-switch`,
    tookMidway(frames),
    `the tap toward ${tapped} ran ${at} frames to f=${took.toFixed(3)} (its tabs' sheets ${frames[at - 1].tabs.map((t) => t.sheet.toFixed(2)).join(" ")}) when the finger took the pages; the swipe headed ${[...new Set(frames.slice(at).map((s) => s.toward))].join(" → ")}`
  );
  const series: [string, (s: Sample) => number[]][] = [
    ["sheets", (s) => s.tabs.map((t) => t.sheet)],
    ["rims", (s) => s.tabs.map((t) => t.rim)],
    ["scroll", (s) => [s.scroll]],
  ];
  for (const [what, read] of series) {
    const steps = frames
      .slice(1)
      .map((s, i) =>
        Math.max(...read(s).map((v, k) => Math.abs(v - read(frames[i])[k])))
      );
    const takeover = steps[at - 1];
    const around = [
      ...steps.slice(Math.max(0, at - 5), at - 1),
      ...steps.slice(at, at + 4),
    ];
    const normal = Math.max(...around);
    check(
      `${name} ${what} continuous`,
      takeover <= normal + 1e-3,
      `step at the takeover ${takeover.toFixed(3)}; frames either side ${around.map((v) => v.toFixed(3)).join(" ")}`
    );
  }
}

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  // Long enough that the phone's strip overflows, so the jump scrolls it.
  const titles = [
    "Plan the release notes",
    "Build the tab strip motion",
    "Review the folder tabs",
    "Ship the iOS build to TestFlight",
  ];
  // The third asks (its rim the attention ink); the rest work (the live ink).
  const ids = await Promise.all(
    titles.map(async (title, at) => {
      if (at === 2) {
        const id = await fleet.spawn("claude", title, fleet.workdir, {
          permissionMode: "default",
        });
        await fleet.send(id, `${ASK}: make a file.`);
        await until(
          `${id} asking`,
          async () => JSON.stringify(await fleet.api<unknown>("/api/pending")),
          (text) => text.includes(id),
          180_000
        );
        return id;
      }
      const id = await fleet.spawn("claude", title);
      await fleet.send(id, `${WORK}: keep going.`);
      await until(
        `${id} working`,
        async () =>
          JSON.stringify(
            await fleet.api<unknown>(`/api/instances/${id}/transcript`)
          ),
        (text) => text.includes("word3"),
        180_000
      );
      return id;
    })
  );
  const { port } = new URL(fleet.base);

  // Each screen in points, portrait, and how long the takeover's swipe
  // takes: a second on both, as the pages follow a scripted swipe only part
  // of the way into it, later the longer it is.
  for (const [kind, type, width, height, drag] of [
    [
      "phone",
      "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
      402,
      874,
      1.0,
    ],
    [
      "pad",
      "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB",
      834,
      1210,
      1.0,
    ],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one simulator at a time, its runs in order
    const created = await sh(
      `xcrun simctl create "CawCo tabs probe ${kind}" ${type} com.apple.CoreSimulator.SimRuntime.iOS-18-5`
    );
    const udid = created.trim();
    sims.push(udid);
    await sh(
      `xcrun simctl boot ${udid}; xcrun simctl bootstatus ${udid} -b >/dev/null; xcrun simctl install ${udid} "${app}"`
    );
    for (const style of ["light", "dark"] as const) {
      const run = `${kind} ${style}`;
      // biome-ignore lint/performance/noAwaitInLoops: one appearance at a time on the one app
      await sh(`xcrun simctl ui ${udid} appearance ${style}`);
      // The probe's lines as they are logged: the log store drops older
      // ones under this many, so they are streamed to a file instead.
      const streamed = join(out, `${kind}-${style}.stream`);
      const stream = Bun.spawn(
        [
          "xcrun",
          "simctl",
          "spawn",
          udid,
          "log",
          "stream",
          "--style",
          "compact",
          "--level",
          "default",
          "--predicate",
          'subsystem == "dev.cawco.app" AND category == "TabsProbe"',
        ],
        { stdout: Bun.file(streamed), stderr: "ignore" }
      );
      await Bun.sleep(1500);
      const launched = await sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${ids.join(",")} -tabs-probe`
      );
      // This launch's lines only.
      const pid = /dev\.cawco\.app: (\d+)/.exec(launched)?.[1];
      if (!pid) {
        stream.kill();
        throw new Error(`no pid in the launch's answer: ${launched}`);
      }
      const read = async () =>
        (await Bun.file(streamed).text())
          .split("\n")
          .filter((line) => line.includes(`CawCo[${pid}:`))
          .join("\n");
      await until(
        `${run}: the probe's switches`,
        read,
        (text) => text.includes("tabs probe armed takeover attempt=1 "),
        240_000
      ).catch(() => undefined);
      // A tap on the armed tab, at the point the app gives, and straight
      // after it a finger down on the pages, dragged toward the third tab;
      // when it took no switch under way (the tap had landed first), the
      // app arms another attempt.
      const y = Math.round(height * 0.55);
      let log = "";
      let takeover: Sample[] = [];
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: one finger at a time
        const armed = await until(
          `${run}: takeover ${attempt} armed`,
          read,
          (text) => text.includes(`armed takeover attempt=${attempt} `),
          30_000
        ).catch(async () => read());
        const tap = new RegExp(
          `armed takeover attempt=${attempt} .* tap=(\\d+),(\\d+)`
        ).exec(armed);
        if (!tap) {
          break;
        }
        await sh(
          // One HID session (axe batch): the tap, then the finger down on the
          // pages after a wait that differs by attempt. Even so the pages
          // follow a scripted finger only some 450ms after the tap, past a
          // 400ms switch: the app runs a takeover's tap on a clock 6× as
          // long (PaneTabsView `-tabs-probe`), which the takeover's
          // continuity does not depend on. A step that fails is an attempt
          // that took nothing, and the next is tried.
          `/opt/homebrew/bin/axe batch --udid ${udid} --continue-on-error --step "tap -x ${tap[1]} -y ${tap[2]}" --step "sleep ${[0.1, 0.03, 0.18, 0.0, 0.25][attempt - 1]}" --step "swipe --start-x ${Math.round(width * 0.88)} --start-y ${y} --end-x ${Math.round(width * 0.12)} --end-y ${y} --duration ${drag}" || true`
        );
        log = await until(
          `${run}: takeover ${attempt} landing`,
          read,
          (text) => text.includes(`takeover landed attempt=${attempt} `),
          30_000
        ).catch(async () => read());
        takeover = parse(log).filter((s) =>
          s.label.startsWith(`takeover${attempt}`)
        );
        const ride = takeover.findIndex((s) => s.label.endsWith("-ride"));
        const took = ride > 0 ? takeover[ride - 1].f : 0;
        if (tookMidway(takeover)) {
          break;
        }
        console.log(
          `  ${run}: takeover ${attempt} took the pages at f=${took.toFixed(3)} of the tap; trying again`
        );
      }
      stream.kill();
      await writeFile(join(out, `${kind}-${style}.log`), log);
      const container = (
        await sh(`xcrun simctl get_app_container ${udid} dev.cawco.app data`)
      ).trim();
      // Each run's captures are named by idiom and style, so none is overwritten.
      await sh(
        `cp "${container}/tmp/tabs-probe/${kind}-${style}-"*.png "${out}/"`
      );
      const begins = [
        ...log.matchAll(/tabs probe begin (\S+) from=(\S+) to=(\S+)/g),
      ];
      const samples = parse(log);
      for (const label of ["step", "jump", "step-held", "jump-held"]) {
        const begin = begins.find((b) => b[1] === label);
        if (!begin) {
          check(`${run} ${label}`, false, "never began");
          continue;
        }
        judge(
          run,
          label,
          samples.filter((s) => s.label === label),
          begin[2],
          begin[3]
        );
      }
      const held = samples
        .filter((s) => s.label.endsWith("held") && s.t !== "landed")
        .map((s) => `${s.label}@${s.f}`);
      check(`${run} stops captured`, held.length === 14, held.join(" "));
      const step = begins.find((b) => b[1] === "step-held");
      if (step) {
        judgeSeam(
          run,
          samples.filter((s) => s.label === "step-held"),
          step[2],
          step[3]
        );
      }
      judgeTakeover(run, takeover);
    }
  }
} catch (error) {
  check(
    "run",
    false,
    String(error instanceof Error ? (error.stack ?? error.message) : error)
  );
  for (const role of ["agent", "sessiond"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: printed in order
    const text = await fleet.logs(role).catch(() => "");
    console.log(
      `  ${role}'s log, last lines:\n${text.split("\n").slice(-25).join("\n")}`
    );
  }
} finally {
  for (const udid of sims) {
    // biome-ignore lint/performance/noAwaitInLoops: one simulator's teardown at a time
    await sh(
      `xcrun simctl shutdown ${udid} >/dev/null 2>&1 || true; xcrun simctl delete ${udid}`
    ).catch(() => undefined);
  }
  await fleet.close();
  await fleet.clean(keep);
}
console.log(`  captures and logs: ${out}`);
process.exit(failed === 0 ? 0 : 1);
