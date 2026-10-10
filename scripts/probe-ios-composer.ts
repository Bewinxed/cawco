#!/usr/bin/env bun
/**
 * iOS composer probe: the iPhone composer's `/` menu lists the session's
 * commands and skills as the web's does, filters as it is typed, and the
 * history wheel opens on a swipe up from the composer, not on a long press.
 *
 *   bun scripts/probe-ios-composer.ts [--keep]
 *
 * Run from the repo root in a shell that reaches the Mac as `ssh mac` (not
 * a CawCo workspace). It:
 *
 *  1. compiles the app on the Mac (build-both.sh ios --compile-only);
 *  2. stands up a scratch fleet here (scratch-fleet.ts: a real hub, agent
 *     and sessiond, Claude Code on a mock model) whose session's project
 *     holds a `show-me` skill and a `ship-it` command, so `/sh` matches two;
 *     the session is spawned through the hub, so its rows are the hub's own;
 *  3. forwards the scratch hub to the Mac's loopback (`ssh -R`), where a
 *     simulator of its own reaches it at 127.0.0.1;
 *  4. launches the app there with `-paywall-env sandbox`, opened on that
 *     session, and drives it with axe: types `/`, then `sh`, swipes up from
 *     the composer, dismisses the wheel, long-presses the composer;
 *  5. prints what the accessibility tree held at each step, and saves light
 *     and dark captures to a folder it names.
 *
 * It stops only what it started: the fleet's processes by PID, the tunnel,
 * and the simulator it created (deleted at the end). `--keep` keeps the
 * fleet's sandbox for reading.
 *
 * Prints `PASS <step>` / `FAIL <step>` per check and exits 0 only if every
 * check passed.
 */
import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { projectClaudeDir } from "../packages/core/src/paths";
import { scratchFleet, until } from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const root = resolve(import.meta.dir, "..");
const home = process.env.HOME ?? "";
const SSH = ["ssh", "-F", join(home, ".ssh", "config"), "-o", "BatchMode=yes"];
const AXE = "/opt/homebrew/bin/axe";
// Inside the checkout it runs from (git-ignored), so whoever reads the run
// reads the captures beside it.
const out = join(root, ".probe", `ios-composer-${Date.now()}`);
await mkdir(out, { recursive: true });
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
{
  const build = Bun.spawn(
    ["bash", "apps/apple/scripts/build-both.sh", "ios", "--compile-only"],
    { cwd: root, stdout: "pipe", stderr: "inherit" }
  );
  const text = await new Response(build.stdout).text();
  process.stdout.write(text);
  const code = await build.exited;
  check(
    "compile",
    code === 0 && /^BUILT iOS$/m.test(text) && /^BUILT iOS 18\.5$/m.test(text),
    code === 0 ? "BUILT iOS and BUILT iOS 18.5" : `build-both.sh exited ${code}`
  );
  if (code !== 0) {
    process.exit(1);
  }
}
// The Mac-side build folder build-both.sh used (its BUILD naming).
const top = (
  await Bun.$`git -C ${root} rev-parse --show-toplevel`.text()
).trim();
const build = top === join(home, "cockpit") ? "main" : basename(top);
const app = `$HOME/build/cawco-apple/${build}/DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app`;

// ── 2. The scratch fleet ─────────────────────────────────────────────────
const fleet = await scratchFleet({
  name: "probe-ios-composer",
  respond: () => ({ everyMs: 20, words: ["ok"] }),
});
// The project's own skill and command: Claude Code lists them with the rest.
await mkdir(projectClaudeDir(fleet.workdir, "skills", "show-me"), {
  recursive: true,
});
await Bun.write(
  projectClaudeDir(fleet.workdir, "skills", "show-me", "SKILL.md"),
  "---\nname: show-me\ndescription: Shows the owner what changed, with a preview.\n---\nShow the change.\n"
);
await mkdir(projectClaudeDir(fleet.workdir, "commands"), { recursive: true });
await Bun.write(
  projectClaudeDir(fleet.workdir, "commands", "ship-it.md"),
  "---\ndescription: Ships the branch once its checks pass.\n---\nShip it.\n"
);

let tunnel: ReturnType<typeof Bun.spawn> | undefined;
let udid = "";
const marker = `probe hello ${crypto.randomUUID().slice(0, 6)}`;

interface Node {
  frame?: { x: number; y: number; width: number; height: number };
  id?: string;
  label?: string;
  value?: string;
}

/** Every element of the app's accessibility tree, flattened; or with
 * `point`, the element under that point and what holds it. */
async function tree(point?: { x: number; y: number }): Promise<Node[]> {
  const where = point
    ? ` --point ${Math.round(point.x)},${Math.round(point.y)}`
    : "";
  const raw = await mac(`${AXE} describe-ui${where} --udid ${udid}`);
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
      id: (o.AXUniqueId ?? o.identifier) as string | undefined,
      label: (o.AXLabel ?? o.label) as string | undefined,
      value: (o.AXValue ?? o.value) as string | undefined,
      frame: o.frame as Node["frame"],
    });
    walk(o.children);
  };
  walk(JSON.parse(raw));
  return nodes;
}
const rowsOf = (nodes: Node[]) =>
  nodes.filter((n) => n.id?.startsWith("composer-command-"));
/** The wheel's own draft row ("Your draft: …", "Your draft, empty"): the
 * transcript's bubble carries the sent message's words too, so only this
 * row says the wheel is up. */
const wheelOf = (nodes: Node[]) =>
  nodes.filter((n) => n.label?.startsWith("Your draft") === true);
/** What a point query found, for the report. */
const said = (nodes: Node[]) =>
  nodes
    .filter((n) => n.id || n.label)
    .map((n) => n.id ?? n.label)
    .slice(0, 3)
    .join(" < ") || "nothing labelled";
const fieldFrame = async () =>
  (await tree()).find((n) => n.id === "steer-message")?.frame;
const shot = async (name: string) => {
  const b64 = await mac(`F=$(mktemp -d)
xcrun simctl io ${udid} screenshot "$F/shot.png" >/dev/null 2>&1
base64 < "$F/shot.png"
rm -rf "$F"`);
  const file = join(out, `${name}.png`);
  await Bun.write(file, Buffer.from(b64.replace(/\s/g, ""), "base64"));
  console.log(`  capture: ${file}`);
};
const appearance = (mode: "light" | "dark") =>
  mac(`xcrun simctl ui ${udid} appearance ${mode}`);
const pause = (ms: number) => Bun.sleep(ms);
const LOG_PREFIX = /^.*\[dev\.cawco\.app:Swipe\]\s*/;
/** The swipe recognizer's own account of the last few seconds (a DEBUG build's `Swipe` log). */
const swipeLog = async (what: string) => {
  const lines = (
    await mac(
      `xcrun simctl spawn ${udid} log show --last 8s --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Swipe"' | tail -30`
    ).catch((error) => String(error))
  )
    .split("\n")
    .filter((line) => line.includes("Swipe"));
  console.log(`  swipe log, ${what}: ${lines.length === 0 ? "nothing" : ""}`);
  for (const line of lines) {
    console.log(`    ${line.replace(LOG_PREFIX, "")}`);
  }
};

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const id = await fleet.spawn("claude", "Slash menu probe");
  await fleet.send(id, `${marker}: say ok.`);
  const facts = await until(
    "the session's `/` list in its transcript facts",
    () =>
      fleet.api<{
        facts?: { commands?: { names: string[]; skills: string[] } };
      }>(`/api/instances/${id}/transcript`),
    (page) => (page.facts?.commands?.names.length ?? 0) > 0,
    180_000
  );
  const names = facts.facts?.commands?.names ?? [];
  check(
    "hub serves the list",
    names.includes("show-me") && names.includes("ship-it"),
    `${names.length} names, show-me ${names.includes("show-me")}, ship-it ${names.includes("ship-it")}, skills [${(facts.facts?.commands?.skills ?? []).join(", ")}]`
  );

  // ── 3. The tunnel ──────────────────────────────────────────────────────
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

  // ── 4. The simulator ───────────────────────────────────────────────────
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
xcrun simctl create "CawCo probe composer" "$TYPE" "$RUNTIME"`)
  ).trim();
  console.log(`  simulator ${udid}`);
  await mac(`xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl install ${udid} "${app}"
xcrun simctl ui ${udid} appearance light
xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${id} >/dev/null`);
  const field = await until(
    "the session's composer on screen",
    async () => (await tree()).find((n) => n.id === "steer-message"),
    (node) => node?.frame !== undefined,
    120_000
  );
  const f = field?.frame ?? { x: 0, y: 0, width: 0, height: 0 };
  const cx = Math.round(f.x + f.width / 2);
  const cy = Math.round(f.y + f.height / 2);

  // ── 5. `/` ─────────────────────────────────────────────────────────────
  await mac(`${AXE} tap -x ${cx} -y ${cy} --udid ${udid}`);
  await pause(1200);
  await mac(`${AXE} type '/' --udid ${udid}`);
  // The menu asks the session for its details as it opens.
  await pause(3000);
  let nodes = await tree();
  let rows = rowsOf(nodes);
  check(
    "`/` lists commands",
    rows.length > 0,
    `${rows.length} rows; first: ${rows
      .slice(0, 6)
      .map((r) => `${r.label}${r.value ? ` — ${r.value}` : ""}`)
      .join(" | ")}`
  );
  // Where the menu stands, by what the screen shows at three points: the
  // AX tree also lists the rows scrolled out of the menu's 320pt, so their
  // frames say nothing about what is on screen. The pill's top is 6pt above
  // the field's, and the menu's foot 7pt above that.
  const now = (await fieldFrame()) ?? f;
  const onField = await tree({ x: cx, y: now.y + now.height / 2 });
  const overPill = await tree({ x: cx, y: now.y - 6 - 7 - 14 });
  const overMenu = await tree({ x: cx, y: now.y - 6 - 7 - 320 - 16 });
  // The text view's middle answers with its inner layout view, which carries
  // no label: uncovered means no menu row is what the finger lands on there.
  check(
    "the field stays uncovered",
    !onField.some((n) => n.id?.startsWith("composer-command-") === true),
    `at the field's middle: ${said(onField)}`
  );
  check(
    "the menu stands right above the pill",
    overPill.some((n) => n.id?.startsWith("composer-command-") === true),
    `14pt above the menu's foot: ${said(overPill)}`
  );
  check(
    "the menu is at most 320pt tall, its list scrolling inside",
    !overMenu.some((n) => n.id?.startsWith("composer-command-") === true),
    `16pt above the menu's highest top: ${said(overMenu)}`
  );
  check(
    "VoiceOver reads each row",
    rows.length > 0 && rows.every((r) => (r.label ?? "").startsWith("/")),
    `${rows.filter((r) => r.label).length} of ${rows.length} rows labelled`
  );
  await shot("slash-light");

  await mac(`${AXE} type 'sh' --udid ${udid}`);
  await pause(1500);
  nodes = await tree();
  rows = rowsOf(nodes);
  const labels = rows.map((r) => r.label ?? "");
  check(
    "`/sh` filters",
    labels.includes("/show-me") &&
      labels.includes("/ship-it") &&
      labels.every((l) => l.includes("sh")),
    `${rows.length} rows: ${rows.map((r) => `${r.label}${r.value ? ` — ${r.value}` : ""}`).join(" | ")}`
  );
  await shot("slash-sh-light");
  await appearance("dark");
  await pause(800);
  await shot("slash-sh-dark");

  // ── 6. Swipe up from the composer ──────────────────────────────────────
  const sx = Math.round(f.x + Math.min(40, f.width / 4));
  const field2 =
    (await tree()).find((n) => n.id === "steer-message")?.frame ?? f;
  const sy = Math.round(field2.y + field2.height / 2);
  // One finger moving up (axe `drag`: touch down, moves, up). axe `swipe` is
  // its multi-touch gesture, and the composer's swipe takes one finger.
  const drag = (y: number) =>
    mac(
      `${AXE} drag --start-x ${sx} --start-y ${y} --end-x ${sx} --end-y ${y - 160} --duration 0.4 --steps 30 --udid ${udid}`
    );
  /** Escape (HID 41) folds a wheel still up, until none is; whether it went. */
  const closeWheel = async () => {
    await until(
      "the wheel closed",
      async () => {
        const up = wheelOf(await tree()).length > 0;
        if (up) {
          await mac(`${AXE} key 41 --udid ${udid}`);
        }
        return !up;
      },
      Boolean,
      6000
    ).catch(() => undefined);
    return wheelOf(await tree()).length === 0;
  };
  // From the field's text first: it is most of the pill, and while it is
  // written in its loupe is the swipe's rival for the finger.
  await drag(sy);
  await pause(1200);
  await swipeLog("the drag from the field's text");
  nodes = await tree();
  const wheel = wheelOf(nodes);
  const sent = nodes.filter((n) => n.label?.startsWith(marker) === true);
  check(
    "a swipe up from the field's text opens the wheel",
    wheel.length > 0,
    `draft row: ${wheel.map((w) => w.label).join(" | ") || "none"}; elements with the sent words (bubble and wheel row): ${sent.length}`
  );
  // The wheel takes the field's place: the `/` menu over it goes as it opens.
  check(
    "the wheel replaces the menu",
    rowsOf(nodes).length === 0,
    `the menu's rows while the wheel is up: ${rowsOf(nodes).length}`
  );
  await shot("wheel-dark");
  await appearance("light");
  await pause(800);
  await shot("wheel-light");

  // Dismissed with a tap outside it, on the transcript halfway up the screen.
  await mac(`${AXE} tap -x ${cx} -y ${Math.round(sy / 2)} --udid ${udid}`);
  await pause(1500);
  const left = wheelOf(await tree());
  check(
    "a tap outside closes it",
    left.length === 0,
    left.length === 0
      ? "the draft row is gone"
      : `still up: ${left.map((w) => w.label).join(" | ")}`
  );

  // From the pill's own rim, 3pt under the field, with the wheel closed first.
  const closedForRim = await closeWheel();
  const rimField = (await fieldFrame()) ?? field2;
  const rim = Math.round(rimField.y + rimField.height + 3);
  await drag(rim);
  await pause(1200);
  await swipeLog("the drag from the pill's rim");
  const fromRim = wheelOf(await tree());
  check(
    "a swipe up from the pill's rim opens the wheel",
    closedForRim && fromRim.length > 0,
    closedForRim
      ? `from y ${rim}: ${fromRim.map((w) => w.label).join(" | ") || "no draft row"}`
      : "the wheel could not be closed first, so the drag proves nothing"
  );

  // ── 7. A long press no longer opens it ─────────────────────────────────
  await closeWheel();
  const before = wheelOf(await tree()).length;
  console.log(
    `  before the long press: ${before === 0 ? "wheel closed" : "wheel STILL UP"}`
  );
  const field3 = (await fieldFrame()) ?? f;
  const lx = Math.round(field3.x + field3.width / 2);
  const ly = Math.round(field3.y + field3.height / 2);
  await mac(
    `${AXE} touch -x ${lx} -y ${ly} --down --up --delay 1.5 --udid ${udid}`
  );
  await pause(1200);
  await swipeLog("the long press");
  const after = wheelOf(await tree());
  check(
    "a long press does not open it",
    before === 0 && after.length === 0,
    before === 0
      ? `after a 1.5s press on the field: ${after.length === 0 ? "no draft row" : after.map((w) => w.label).join(" | ")}`
      : "the wheel could not be closed first, so the press proves nothing"
  );
  await shot("long-press-light");
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
}

console.log(`Captures: ${out}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
