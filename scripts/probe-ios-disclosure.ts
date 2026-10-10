#!/usr/bin/env bun
/**
 * iOS disclosure probe: in the iPhone app's transcript, a row the reader
 * folds shut closes in place. Everything above it stays where it stood, and
 * the rows below follow its closing edge, with no jump and no settle after.
 * Opening is as smooth.
 *
 *   bun scripts/probe-ios-disclosure.ts [--before <rev>] [--keep]
 *
 * Run from the repo root in a shell that reaches the Mac as `ssh mac` (not
 * a CawCo workspace). It:
 *
 *  1. compiles this checkout on the Mac (build-both.sh ios --compile-only),
 *     and with `--before <rev>` that revision too, from a worktree under
 *     .probe/ (removed at the end): a revision with the DEBUG
 *     `Disclosure` trace (DisclosureProbe) and the old mechanism, so the
 *     same run shows the jump and its fix;
 *  2. stands up a scratch fleet here (scratch-fleet.ts: a real hub, agent and
 *     sessiond, Claude Code on a mock model) and runs five turns in one
 *     session, each a Bash call (`seq N01 N10`) that Claude Code really runs,
 *     so the transcript holds five tool rows whose bodies open;
 *  3. forwards the scratch hub to the Mac's loopback (`ssh -R`), and in a
 *     simulator of its own launches each build with `-paywall-env sandbox`,
 *     opened on that session;
 *  4. drives it with real touches (axe): "middle" opens and shuts a tool row
 *     with rows above and below it on screen; "foot" scrolls to the end,
 *     opens the last tool row, scrolls to the new end, and shuts it there
 *     (where the list's foot comes up to meet it); then, under Reduce Motion
 *     (this checkout only), shuts the middle row again;
 *  5. reads each toggle's per-frame trace from the simulator's log (the y in
 *     the list's view of the row above, the toggled row's top and foot, and
 *     the row below, off their presentation layers, from before the toggle
 *     until 0.6s after it), prints it, and checks it.
 *
 * Checks, on this checkout's build (a `--before` build's are printed, not
 * counted): the row above and the toggled row's top move ≤ 0.5pt; the foot
 * moves one way only (back ≤ 0.5pt) with no overshoot past where it lands;
 * once the motion's time is up it moves ≤ 0.5pt (no settle); the row below
 * keeps its distance to the foot within 0.5pt. Under Reduce Motion the foot
 * stands at its end in the first frame.
 *
 * It stops only what it started: the fleet's processes by PID, the tunnel,
 * the simulator it created (deleted at the end), the worktree it added.
 * `--keep` keeps the fleet's sandbox. Exits 0 only if every check passed.
 */
import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { scratchFleet, until } from "./scratch-fleet";

const argv = process.argv.slice(2);
const keep = argv.includes("--keep");
const beforeAt = argv.indexOf("--before");
const beforeRev = beforeAt >= 0 ? argv[beforeAt + 1] : undefined;
if (beforeAt >= 0 && !beforeRev) {
  console.error("usage: probe-ios-disclosure.ts [--before <rev>] [--keep]");
  process.exit(2);
}
const root = resolve(import.meta.dir, "..");
const home = process.env.HOME ?? "";
const SSH = ["ssh", "-F", join(home, ".ssh", "config"), "-o", "BatchMode=yes"];
const AXE = "/opt/homebrew/bin/axe";
const TURNS = 5;
/** --dur-exit and --dur-reveal (design/tokens): when each motion's time is up. */
const DURATION = { shut: 160, open: 240 };
const BUILT_IOS = /^BUILT iOS$/m;
const BUILT_IOS_18 = /^BUILT iOS 18\.5$/m;
const TURN_ASKED = /disclosure turn (\d)/;
const TOOL_TURN = /seq (\d)01/;
const BEGIN_LINE = /\bbegin \d+ (open|shut) /;
const SAMPLE_LINE =
  /\b(?:base|f) \d+ ms=(-?\d+) above=(\S+) top=(\S+) foot=(\S+) below=(\S+) offset=(\S+) size=\S+ inset=(\S+)/;
/** What a `--before` build's checks say: printed, not counted. */
const sayBefore = (step: string, ok: boolean, detail: string) =>
  console.log(`  (before) ${ok ? "pass" : "FAIL"} ${step}: ${detail}`);
await mkdir(join(root, ".probe"), { recursive: true });
console.log(
  `  at ${(await Bun.$`git -C ${root} log -1 --format=%h\ %s`.text()).trim()}`
);

let failures = 0;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failures += 1;
  }
};

/** Runs `script` in bash on the Mac; its stdout, or throws with its stderr. */
async function mac(script: string): Promise<string> {
  const child = Bun.spawn([...SSH, "mac", "bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`mac exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

// ── 1. Compile ───────────────────────────────────────────────────────────
interface Build {
  /** The simulator app on the Mac. */
  app: string;
  label: "before" | "after";
}

/** Compiles the checkout at `dir` on the Mac; its app, or exits on failure. */
async function compile(dir: string, label: Build["label"]): Promise<Build> {
  console.log(`  compiling ${label} (${dir})`);
  const build = Bun.spawn(
    ["bash", "apps/apple/scripts/build-both.sh", "ios", "--compile-only"],
    { cwd: dir, stdout: "pipe", stderr: "inherit" }
  );
  const text = await new Response(build.stdout).text();
  process.stdout.write(text);
  const code = await build.exited;
  check(
    `compile ${label}`,
    code === 0 && BUILT_IOS.test(text) && BUILT_IOS_18.test(text),
    code === 0 ? "BUILT iOS and BUILT iOS 18.5" : `build-both.sh exited ${code}`
  );
  if (code !== 0) {
    process.exit(1);
  }
  // The Mac-side build folder build-both.sh used (its BUILD naming).
  const top = (
    await Bun.$`git -C ${dir} rev-parse --show-toplevel`.text()
  ).trim();
  const name = top === join(home, "cockpit") ? "main" : basename(top);
  return {
    label,
    app: `$HOME/build/cawco-apple/${name}/DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app`,
  };
}

let beforeTree: string | undefined;
const builds: Build[] = [];
try {
  if (beforeRev) {
    const short = (
      await Bun.$`git -C ${root} rev-parse --short ${beforeRev}`.text()
    ).trim();
    beforeTree = join(root, ".probe", `disclosure-before-${short}`);
    await Bun.$`git -C ${root} worktree add --detach ${beforeTree} ${beforeRev}`.quiet();
    builds.push(await compile(beforeTree, "before"));
  }
  builds.push(await compile(root, "after"));
} catch (error) {
  console.log(`FAIL compile: ${error}`);
  if (beforeTree) {
    await Bun.$`git -C ${root} worktree remove --force ${beforeTree}`.nothrow();
  }
  process.exit(1);
}

// ── 2. The scratch fleet ─────────────────────────────────────────────────
const fleet = await scratchFleet({
  name: "probe-ios-disclosure",
  respond: (seen) => {
    // A side call (the session's title) offers no tools.
    if (!seen.tools) {
      return { everyMs: 5, words: ["Disclosure probe"] };
    }
    // The turn's own message asks for the call; the one after it carries
    // the call's result (`seq`'s numbers), and the turn ends in words.
    const turn = TURN_ASKED.exec(seen.last)?.[1];
    if (!turn) {
      return { everyMs: 5, words: ["Listed", " them."] };
    }
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: `seq ${turn}01 ${turn}10`,
          description: `List turn ${turn}`,
        },
      },
    };
  },
});

let tunnel: ReturnType<typeof Bun.spawn> | undefined;
let udid = "";

interface Node {
  frame?: { x: number; y: number; width: number; height: number };
  label?: string;
  value?: string;
}

/** Every element of the app's accessibility tree, flattened, the app first. */
async function tree(): Promise<Node[]> {
  const raw = await mac(`${AXE} describe-ui --udid ${udid}`);
  const nodes: Node[] = [];
  const walk = (at: unknown) => {
    if (Array.isArray(at)) {
      for (const child of at) {
        walk(child);
      }
      return;
    }
    if (!at || typeof at !== "object") {
      return;
    }
    const o = at as Record<string, unknown>;
    nodes.push({
      label: (o.AXLabel ?? o.label) as string | undefined,
      value: (o.AXValue ?? o.value) as string | undefined,
      frame: o.frame as Node["frame"],
    });
    walk(o.children);
  };
  walk(JSON.parse(raw));
  return nodes;
}

/** The tool rows on screen (a line VoiceOver reads as Collapsed or Expanded), by turn. */
const toolRows = (nodes: Node[]) =>
  nodes
    .filter(
      (n) =>
        (n.value === "Collapsed" || n.value === "Expanded") &&
        n.frame !== undefined
    )
    .map((n) => ({
      node: n,
      turn: Number(TOOL_TURN.exec(n.label ?? "")?.[1] ?? 0),
    }))
    .filter((row) => row.turn > 0);

const pause = (ms: number) => Bun.sleep(ms);
const tap = (x: number, y: number) =>
  mac(`${AXE} tap -x ${Math.round(x)} -y ${Math.round(y)} --udid ${udid}`);
/** One finger from `fromY` to `toY` at the screen's middle. */
const drag = (x: number, fromY: number, toY: number) =>
  mac(
    `${AXE} drag --start-x ${Math.round(x)} --start-y ${Math.round(fromY)} --end-x ${Math.round(x)} --end-y ${Math.round(toY)} --duration 0.25 --steps 15 --udid ${udid}`
  );

interface Sample {
  above: number | null;
  below: number | null;
  foot: number | null;
  inset: number;
  ms: number;
  offset: number;
  top: number | null;
}

/** The trace of the newest toggle logged since `since` (the Mac's clock). */
async function trace(
  since: string
): Promise<{ open: boolean; samples: Sample[] } | undefined> {
  const text = await mac(
    `xcrun simctl spawn ${udid} log show --start '${since}' --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Disclosure"'`
  );
  let open = false;
  let samples: Sample[] = [];
  let found = false;
  const num = (s: string | undefined) =>
    s === undefined || s === "nil" ? null : Number(s);
  for (const line of text.split("\n")) {
    const begin = BEGIN_LINE.exec(line);
    if (begin) {
      found = true;
      open = begin[1] === "open";
      samples = [];
      continue;
    }
    const m = SAMPLE_LINE.exec(line);
    if (m && found) {
      samples.push({
        ms: Number(m[1]),
        above: num(m[2]),
        top: num(m[3]),
        foot: num(m[4]),
        below: num(m[5]),
        offset: Number(m[6]),
        inset: Number(m[7]),
      });
    }
  }
  return found ? { open, samples } : undefined;
}

const fmt = (v: number | null) =>
  v === null ? "   nil" : v.toFixed(1).padStart(7);

interface Trace {
  open: boolean;
  samples: Sample[];
}

/** The most `key` strayed from where it stood before the toggle; null with no such row. */
function drift(s: Sample[], key: "above" | "top"): number | null {
  const b = s[0][key];
  if (b === null) {
    return null;
  }
  return Math.max(
    0,
    ...s.map((x) => (x[key] === null ? 0 : Math.abs((x[key] as number) - b)))
  );
}

/** How the toggled row's foot travelled, and how the row below kept to it. */
function footOf(t: Trace) {
  const s = t.samples;
  const feet = s.map((x) => x.foot).filter((v): v is number => v !== null);
  const final = feet.at(-1) ?? 0;
  const way = t.open ? 1 : -1;
  let back = 0;
  for (let i = 1; i < feet.length; i += 1) {
    back = Math.max(back, way * (feet[i - 1] - feet[i]));
  }
  const overshoot = t.open
    ? Math.max(...feet) - final
    : final - Math.min(...feet);
  const end = (t.open ? DURATION.open : DURATION.shut) + 40;
  const settle = Math.max(
    0,
    ...s
      .filter((x) => x.ms >= end && x.foot !== null)
      .map((x) => Math.abs((x.foot as number) - final))
  );
  const [base] = s;
  const gap0 =
    base.below !== null && base.foot !== null ? base.below - base.foot : null;
  const gapDrift =
    gap0 === null
      ? null
      : Math.max(
          0,
          ...s
            .filter((x) => x.below !== null && x.foot !== null)
            .map((x) =>
              Math.abs((x.below as number) - (x.foot as number) - gap0)
            )
        );
  const first = s.find((x) => x.ms > 0 && x.foot !== null)?.foot ?? null;
  return {
    back,
    end,
    final,
    first,
    gapDrift,
    moved: (feet[0] ?? 0) - final,
    overshoot,
    settle,
  };
}

/** Prints a trace and checks it; `counted`: its failures count. */
function judge(
  name: string,
  t: Trace | undefined,
  counted: boolean,
  reduced = false
) {
  const say = counted ? check : sayBefore;
  if (!t || t.samples.length < 3) {
    say(
      name,
      false,
      "no trace in the log (is this a DEBUG build with DisclosureProbe?)"
    );
    return;
  }
  const s = t.samples;
  console.log(`  ${name}: ${t.open ? "open" : "shut"}, ${s.length} samples`);
  console.log("       ms   above     top    foot   below  offset   inset");
  for (const x of s) {
    console.log(
      `   ${String(x.ms).padStart(6)} ${fmt(x.above)} ${fmt(x.top)} ${fmt(x.foot)} ${fmt(x.below)} ${fmt(x.offset)} ${fmt(x.inset)}`
    );
  }
  const above = drift(s, "above");
  const top = drift(s, "top");
  const { back, end, final, first, gapDrift, moved, overshoot, settle } =
    footOf(t);
  say(
    `${name}: the row above stays`,
    above === null ? false : above <= 0.5,
    above === null
      ? "no row above on screen"
      : `moved at most ${above.toFixed(2)}pt`
  );
  say(
    `${name}: the row's top stays`,
    top !== null && top <= 0.5,
    `moved at most ${top?.toFixed(2)}pt`
  );
  say(
    `${name}: the foot moves one way, no overshoot`,
    back <= 0.5 && overshoot <= 0.5,
    `travelled ${moved.toFixed(1)}pt, back ${back.toFixed(2)}pt, overshoot ${overshoot.toFixed(2)}pt`
  );
  say(
    `${name}: no settle after ${end}ms`,
    settle <= 0.5,
    `moved ${settle.toFixed(2)}pt after`
  );
  say(
    `${name}: the row below follows the foot`,
    gapDrift === null || gapDrift <= 0.5,
    gapDrift === null
      ? "no row below on screen"
      : `its gap drifted ${gapDrift.toFixed(2)}pt`
  );
  if (reduced) {
    say(
      `${name}: under Reduce Motion the end state is the first frame`,
      first !== null && Math.abs(first - final) <= 0.5,
      `first frame's foot ${first?.toFixed(1)}, end ${final.toFixed(1)}`
    );
  }
}

/** The Mac's clock now, as `log show --start` reads it. */
const clock = async () => (await mac(`date '+%Y-%m-%d %H:%M:%S'`)).trim();

/** Taps the turn's tool row and returns its trace. */
async function toggle(turn: number) {
  const row = toolRows(await tree()).find((r) => r.turn === turn);
  if (!row?.node.frame) {
    throw new Error(`turn ${turn}'s tool row is not on screen`);
  }
  const f = row.node.frame;
  const since = await clock();
  await pause(1100);
  await tap(f.x + Math.min(120, f.width / 3), f.y + f.height / 2);
  await pause(1500);
  return trace(since);
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
  const id = await fleet.spawn("claude", "Disclosure probe");
  for (let turn = 1; turn <= TURNS; turn += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each turn after the last one ends
    await fleet.send(id, `disclosure turn ${turn}: list the numbers.`);
    await until(
      `turn ${turn}'s Bash call answered`,
      // The request after the call carries its result: `seq`'s last number.
      () => fleet.seen.some((s) => s.tools && s.last.includes(`${turn}10`)),
      Boolean,
      180_000
    );
    await until(
      `turn ${turn} closed`,
      () => fleet.instance(id),
      (row) => row?.turn_open_at === null,
      120_000
    );
  }

  // ── 3. The tunnel and the simulator ────────────────────────────────────
  const port = Number(new URL(fleet.base).port);
  tunnel = Bun.spawn(
    [
      ...SSH,
      "-N",
      "-o",
      "ExitOnForwardFailure=yes",
      "-R",
      `127.0.0.1:${port}:127.0.0.1:${port}`,
      "mac",
    ],
    { stdout: "ignore", stderr: "inherit" }
  );
  await until(
    "the scratch hub answering on the Mac",
    () => mac(`curl -sf http://127.0.0.1:${port}/health >/dev/null && echo up`),
    (text) => text.trim() === "up",
    30_000
  );
  udid = (
    await mac(`read -r RUNTIME TYPE < <(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
best = None
for runtime, devices in json.load(sys.stdin)["devices"].items():
    m = re.search(r"\\.iOS-(\\d+)-(\\d+)$", runtime)
    if not m:
        continue
    for d in devices:
        pro = re.fullmatch(r"iPhone (\\d+) Pro", d["name"])
        if pro:
            key = (int(m[1]), int(m[2]), int(pro[1]))
            if best is None or key > best[0]:
                best = (key, runtime, d["deviceTypeIdentifier"])
if best is None:
    sys.exit("no iPhone Pro simulator")
print(best[1], best[2])
')
xcrun simctl create "CawCo probe disclosure" "$TYPE" "$RUNTIME"`)
  ).trim();
  console.log(`  simulator ${udid}`);
  await mac(`xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl ui ${udid} appearance light`);

  const launch = async (build: Build) => {
    await mac(`xcrun simctl terminate ${udid} dev.cawco.app >/dev/null 2>&1 || true
xcrun simctl install ${udid} "${build.app}"
xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${id} >/dev/null`);
    await until(
      "the session's last tool row on screen",
      async () => toolRows(await tree()),
      (rows) => rows.some((r) => r.turn === TURNS),
      120_000
    );
    // The first screen lands, then the history behind it.
    await pause(2500);
  };

  // ── 4. Each build ──────────────────────────────────────────────────────
  for (const build of builds) {
    const counted = build.label === "after";
    console.log(`\n── ${build.label} ──`);
    // biome-ignore lint/performance/noAwaitInLoops: one build at a time, in one simulator
    await mac(
      `xcrun simctl spawn ${udid} defaults write com.apple.Accessibility ReduceMotionEnabled -bool false`
    );
    await launch(build);
    const nodes = await tree();
    const screen = nodes[0]?.frame ?? { x: 0, y: 0, width: 402, height: 874 };
    const midX = screen.width / 2;

    // Middle: the earliest tool row with rows above it on screen, in the screen's upper half.
    const rows = toolRows(nodes).sort((a, b) => a.turn - b.turn);
    const middle = rows.find(
      (r) =>
        (r.node.frame?.y ?? 0) > 160 &&
        (r.node.frame?.y ?? 0) < screen.height * 0.5
    );
    if (middle) {
      judge(`${build.label} middle open`, await toggle(middle.turn), counted);
      judge(`${build.label} middle shut`, await toggle(middle.turn), counted);
    } else {
      (counted ? check : sayBefore)(
        `${build.label} middle`,
        false,
        `no tool row in the upper half: ${rows.map((r) => `turn ${r.turn} at y ${r.node.frame?.y}`).join(", ")}`
      );
    }

    // Foot: to the end, open the last call, to the new end, shut it there.
    for (let i = 0; i < 3; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each drag after the last settles
      await drag(midX, screen.height * 0.7, screen.height * 0.25);
      await pause(900);
    }
    await pause(1200);
    judge(`${build.label} foot open`, await toggle(TURNS), counted);
    for (let i = 0; i < 3; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each drag after the last settles
      await drag(midX, screen.height * 0.7, screen.height * 0.25);
      await pause(900);
    }
    await pause(1200);
    judge(`${build.label} foot shut`, await toggle(TURNS), counted);

    if (counted && middle) {
      // Reduce Motion: the app reads it at launch and as it changes.
      await mac(
        `xcrun simctl spawn ${udid} defaults write com.apple.Accessibility ReduceMotionEnabled -bool true`
      );
      await launch(build);
      const again = toolRows(await tree()).find(
        (r) =>
          (r.node.frame?.y ?? 0) > 160 &&
          (r.node.frame?.y ?? 0) < screen.height * 0.5
      );
      if (again) {
        await toggle(again.turn);
        judge(
          `${build.label} reduce-motion shut`,
          await toggle(again.turn),
          counted,
          true
        );
      } else {
        check(
          `${build.label} reduce-motion`,
          false,
          "no tool row in the upper half after relaunch"
        );
      }
    }
  }
} catch (error) {
  check("probe", false, error instanceof Error ? error.message : String(error));
} finally {
  if (udid) {
    await mac(`xcrun simctl terminate ${udid} dev.cawco.app >/dev/null 2>&1 || true
xcrun simctl shutdown ${udid} >/dev/null 2>&1 || true
xcrun simctl delete ${udid}`).catch((error) =>
      console.log(`  simulator cleanup: ${error}`)
    );
  }
  tunnel?.kill();
  await fleet.close();
  await fleet.clean(keep || failures > 0);
  if (beforeTree) {
    await Bun.$`git -C ${root} worktree remove --force ${beforeTree}`.nothrow();
  }
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
