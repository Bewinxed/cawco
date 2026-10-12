#!/usr/bin/env bun
/**
 * iOS folder-tab switch probe: a tap moves the choice the way the web's
 * fluid-tabs do, one cross-fade in place on one clock (`durSettle`, 400ms,
 * on `easeCrossfade`): the old sheet fades out over its own card as the new
 * one fades in over its own, every rim's strength follows the clock, nothing
 * slides, wipes or masks a sheet, and the front tab changes at half way.
 *
 *   bun scripts/probe-ios-tabs.ts [--built] [--keep]
 *
 * Run from the repo root on the Mac itself (a CawCo workspace on the Mac
 * included). It:
 *
 *  1. compiles the app (build-both.sh ios --compile-only), unless --built;
 *  2. stands up a scratch fleet (scratch-fleet.ts) with four Claude Code
 *     sessions, each kept working (a slow mock turn) so its rim wears the
 *     live ink, whose strength the choice moves (an idle rim's does not);
 *  3. on an iPhone 16 Pro and an iPad Pro 11-inch (M4), iOS 18.5, light and
 *     dark, launches the app with `-open-session a,b,c,d -tabs-probe`: the
 *     strip taps a step to a neighbour and a jump past one on the real
 *     clock, logging every frame, then the same two on a stepped clock that
 *     holds 0/25/50/75/100% and captures the window and the strip at each
 *     (PaneTabsView `-tabs-probe`);
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

// ── The fleet: four sessions, each mid-turn for the whole run ────────────
const WORK = "tabs-probe-work";
const respond = (request: Seen) =>
  request.tools && request.last.includes(WORK)
    ? {
        everyMs: 2000,
        words: Array.from({ length: 900 }, (_, n) => `word${n} `),
      }
    : { everyMs: 10, words: ["Done."] };
const fleet = await scratchFleet({ name: "probe-ios-tabs", respond });
const sims: string[] = [];

interface Tab {
  chevron: number;
  fill: string;
  id: string;
  keys: string;
  moved: number;
  pick: number;
  rim: number;
  sheet: number;
  sheetShown: number;
  tabTransform: string;
}
interface Sample {
  f: number;
  front: string;
  label: string;
  scroll: number;
  t: number | "landed";
  tabs: Tab[];
}

const LINE =
  /tabs (\S+) t=(\S+) f=(\S+) front=(\S+) seams=\S* scroll=(\S+) \|\| (.*)$/;
const TAB =
  /^(\S+) pick=(\S+) recede=\S+ sheet=(\S+)\/(\S+) tint=\S+ rim=(\S+) glow=\S+ chevron=(\S+) sheetMoved=(\d) tabTransform=(.+?) keys=(\S+) sheetX=\S+ card=\S+ fill=(\S+)/;
function parse(log: string): Sample[] {
  return log.split("\n").flatMap((line) => {
    const m = LINE.exec(line);
    if (!m) {
      return [];
    }
    const tabs = m[6].split(" | ").flatMap((part) => {
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
        scroll: +m[5],
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
  const ids = await Promise.all(
    titles.map(async (title) => {
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

  for (const [kind, type] of [
    ["phone", "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro"],
    ["pad", "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB"],
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
      const launched = await sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${ids.join(",")} -tabs-probe`
      );
      // This launch's lines only: an earlier run's are in the same log.
      const pid = /dev\.cawco\.app: (\d+)/.exec(launched)?.[1];
      if (!pid) {
        throw new Error(`no pid in the launch's answer: ${launched}`);
      }
      const read = () =>
        sh(
          `xcrun simctl spawn ${udid} log show --last 5m --style compact --predicate 'processID == ${pid} AND subsystem == "dev.cawco.app" AND category == "TabsProbe"'`
        );
      const log = await until(
        `${run}: the probe's switches`,
        read,
        (text) => text.includes("tabs probe done"),
        240_000
      ).catch(async () => read());
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
        .map((s) => `${s.label}@${s.t}`);
      check(`${run} quarters captured`, held.length === 10, held.join(" "));
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
