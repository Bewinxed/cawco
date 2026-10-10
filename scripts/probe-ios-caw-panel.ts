#!/usr/bin/env bun
/**
 * iOS Caw panel probe: tapping Caw opens a non-modal panel under him that
 * holds every notification, Needs you first, then Notices. Nothing covers
 * the rest of the screen: a tap on a transcript row while the panel is open
 * reaches the row and closes the panel.
 *
 *   bun scripts/probe-ios-caw-panel.ts [--keep]
 *
 * Run from the repo root in a shell that reaches the Mac as `ssh mac` (not
 * a CawCo workspace). It:
 *
 *  1. compiles the app on the Mac (build-both.sh ios --compile-only);
 *  2. stands up a scratch fleet here (scratch-fleet.ts: a real hub, agent
 *     and sessiond, Claude Code on a mock model) with two sessions: "Panel
 *     probe", which ran one Bash call (a transcript row to tap), and "Needs
 *     probe", started in the `default` permission mode, whose Bash call the
 *     hub parks as a permission ask; then files the probe account's sign-in
 *     as a login moved in from the machine's own Claude Code store, which
 *     the hub serves as a moved-login notice;
 *  3. forwards the scratch hub to the Mac's loopback (`ssh -R`);
 *  4. on an iPhone and then an iPad simulator, launches the app with
 *     `-paywall-env sandbox` on "Panel probe" and drives it with axe: taps
 *     Caw, reads the panel, captures it light and dark, taps the transcript
 *     row outside it; on the iPad it also dismisses the notice and approves
 *     the ask from the panel;
 *  5. prints `PASS <step>` / `FAIL <step>` per check, saves the captures to a
 *     folder it names, and exits 0 only if every check passed.
 *
 * It stops only what it started: the fleet's processes by PID, the tunnel,
 * and the simulators it created (deleted at the end). `--keep` keeps the
 * fleet's sandbox for reading.
 */
import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  ACCOUNT,
  MACHINE,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const root = resolve(import.meta.dir, "..");
const home = process.env.HOME ?? "";
const SSH = ["ssh", "-F", join(home, ".ssh", "config"), "-o", "BatchMode=yes"];
const AXE = "/opt/homebrew/bin/axe";
const out = join(root, ".probe", `ios-caw-panel-${Date.now()}`);
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
const top = (
  await Bun.$`git -C ${root} rev-parse --show-toplevel`.text()
).trim();
const build = top === join(home, "cockpit") ? "main" : basename(top);
const app = `$HOME/build/cawco-apple/${build}/DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app`;

// ── 2. The scratch fleet ─────────────────────────────────────────────────
const tag = crypto.randomUUID().slice(0, 6);
const ROW = `panel-row-${tag}`;
const ASK = `panel-ask-${tag}`;
const respond = (request: Seen) => {
  // A session's turn (tools offered), started by one of the probe's messages.
  if (request.tools && request.last.includes(ROW)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: { command: "echo row-output", description: "Print a line" },
      },
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
  return { everyMs: 10, words: ["Row", " done."] };
};
const fleet = await scratchFleet({ name: "probe-ios-caw-panel", respond });

let tunnel: ReturnType<typeof Bun.spawn> | undefined;
const sims: string[] = [];

interface Frame {
  height: number;
  width: number;
  x: number;
  y: number;
}
interface Node {
  frame?: Frame;
  id?: string;
  label?: string;
  value?: string;
}

/** Every element of the app's accessibility tree, flattened; or with `point`, what is under that point. */
async function tree(
  udid: string,
  point?: { x: number; y: number }
): Promise<Node[]> {
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
      frame: o.frame as Frame | undefined,
    });
    walk(o.children);
  };
  walk(JSON.parse(raw));
  return nodes;
}
const said = (nodes: Node[]) =>
  nodes
    .filter((n) => n.id || n.label)
    .map((n) => n.label ?? n.id)
    .slice(0, 3)
    .join(" < ") || "nothing labelled";
const centre = (f: Frame) => ({ x: f.x + f.width / 2, y: f.y + f.height / 2 });
const inside = (f: Frame, p: { x: number; y: number }) =>
  p.x >= f.x && p.x <= f.x + f.width && p.y >= f.y && p.y <= f.y + f.height;
const pause = (ms: number) => Bun.sleep(ms);
/** One finger's tap at a point, in points. */
const tap = (udid: string, p: { x: number; y: number }) =>
  mac(`${AXE} tap -x ${Math.round(p.x)} -y ${Math.round(p.y)} --udid ${udid}`);

/** The moved login's row (MovedLogins.svelte): the account's name is its entry, its ✕ "Dismiss moved logins". */
const NOTICE = "Probe";
const NOTICE_DISMISS = "Dismiss moved logins";
/** Caw's own label: "Needs you, N". The panel's head reads "Needs you" alone. */
const CAW_LABEL = /^Needs you, \d+$/;
const caw = (nodes: Node[]) =>
  nodes.find((n) => CAW_LABEL.test(n.label ?? "") && n.frame);
const approve = (nodes: Node[]) =>
  nodes.find((n) => n.label?.startsWith("Approve ") === true);
const dismiss = (nodes: Node[]) =>
  nodes.find((n) => n.label === NOTICE_DISMISS);
/** The panel's box: its group, or else what it holds. */
const panelBox = (nodes: Node[]): Frame | undefined => {
  const group = nodes.find((n) => n.label === "Notifications" && n.frame);
  if (group?.frame) {
    return group.frame;
  }
  const parts = nodes.filter(
    (n) =>
      n.frame &&
      (n.label === "Needs you" ||
        n.label === "Notices" ||
        n.label === NOTICE ||
        n.label?.startsWith("Approve ") === true ||
        n.label?.startsWith("Deny ") === true ||
        n.label?.startsWith("Dismiss ") === true)
  );
  if (parts.length === 0) {
    return;
  }
  const x0 = Math.min(...parts.map((n) => n.frame?.x ?? 0));
  const y0 = Math.min(...parts.map((n) => n.frame?.y ?? 0));
  const x1 = Math.max(
    ...parts.map((n) => (n.frame?.x ?? 0) + (n.frame?.width ?? 0))
  );
  const y1 = Math.max(
    ...parts.map((n) => (n.frame?.y ?? 0) + (n.frame?.height ?? 0))
  );
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
/** The Bash call's transcript row: a disclosure line that names its command. */
const toolRow = (nodes: Node[]) =>
  nodes.find(
    (n) =>
      n.frame &&
      (n.value === "Collapsed" || n.value === "Expanded") &&
      (n.label ?? "").includes("row-output")
  ) ??
  nodes.find(
    (n) => n.frame && (n.value === "Collapsed" || n.value === "Expanded")
  );

const shot = async (udid: string, name: string) => {
  const png = await mac(`F=$(mktemp -d)
xcrun simctl io ${udid} screenshot "$F/s.png" >/dev/null 2>&1
base64 < "$F/s.png"
rm -rf "$F"`);
  const file = join(out, `${name}.png`);
  await Bun.write(file, Buffer.from(png.replace(/\s/g, ""), "base64"));
  console.log(`  capture: ${file}`);
};

/** A new simulator of the newest runtime's `pattern` device (an iPhone Pro, an iPad Pro). */
async function simulator(pattern: string, name: string): Promise<string> {
  const udid = (
    await mac(`read -r RUNTIME TYPE < <(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
best = None
for runtime, devices in json.load(sys.stdin)["devices"].items():
    m = re.search(r"\\.iOS-(\\d+)-(\\d+)$", runtime)
    if not m:
        continue
    for d in devices:
        if re.fullmatch(r"${pattern}", d["name"]):
            key = (int(m[1]), int(m[2]), d["name"])
            if best is None or key > best[0]:
                best = (key, runtime, d["deviceTypeIdentifier"])
if best is None:
    sys.exit("no simulator matching ${pattern}")
print(best[1], best[2])
')
xcrun simctl create "${name}" "$TYPE" "$RUNTIME"`)
  ).trim();
  sims.push(udid);
  return udid;
}

type Kind = "phone" | "pad";

/**
 * Launches the app on `udid`, taps Caw and reads the panel; captures it light
 * and dark. Its box, or nothing when the panel never opened.
 */
async function openPanel(
  kind: Kind,
  udid: string,
  port: number,
  rowSession: string
): Promise<Frame | undefined> {
  await mac(`xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl status_bar ${udid} override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3
xcrun simctl install ${udid} "${app}"
xcrun simctl ui ${udid} appearance light
xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${rowSession} >/dev/null`);
  const head = await until(
    `${kind}: Caw counting the ask`,
    async () => caw(await tree(udid)),
    (node) => node?.label === "Needs you, 1",
    180_000
  ).catch(() => undefined);
  let nodes = await tree(udid);
  check(
    `${kind}: Caw's rim counts needs-you only`,
    head?.label === "Needs you, 1",
    `Caw reads "${caw(nodes)?.label ?? "not found"}" with one ask and one notice waiting`
  );
  if (!head?.frame) {
    return;
  }
  check(
    `${kind}: the panel starts closed`,
    !(approve(nodes) || dismiss(nodes)),
    approve(nodes)
      ? "an Approve button is on screen before Caw was tapped"
      : "no Approve or Dismiss on screen"
  );
  const row = toolRow(nodes);
  console.log(
    `  ${kind}: transcript row ${row ? `"${row.label}" ${row.value} at ${JSON.stringify(row.frame)}` : "not found"}`
  );

  await tap(udid, centre(head.frame));
  await pause(1200);
  nodes = await tree(udid);
  const box = panelBox(nodes);
  check(
    `${kind}: tapping Caw opens the panel`,
    caw(nodes)?.value === "Open" && box !== undefined,
    `Caw's value "${caw(nodes)?.value ?? ""}", panel ${box ? JSON.stringify(box) : "not found"}`
  );
  const ask = approve(nodes);
  check(
    `${kind}: the panel lists the needs-you ask`,
    ask !== undefined &&
      nodes.some((n) => n.label?.startsWith("Deny ") === true),
    ask ? `"${ask.label}" and its Deny` : "no Approve button"
  );
  check(
    `${kind}: the panel lists the notice, under Needs you`,
    dismiss(nodes) !== undefined &&
      nodes.some((n) => n.label === NOTICE) &&
      nodes.some((n) => n.label?.startsWith("from Claude Code on ") === true) &&
      (dismiss(nodes)?.frame?.y ?? 0) >
        (ask?.frame?.y ?? Number.POSITIVE_INFINITY) - 1,
    dismiss(nodes)
      ? `"${NOTICE}", "${nodes.find((n) => n.label?.startsWith("from Claude Code on ") === true)?.label ?? "no from-line"}", its ✕ at y ${Math.round(dismiss(nodes)?.frame?.y ?? 0)}, the ask's Approve at y ${Math.round(ask?.frame?.y ?? 0)}`
      : `no "${NOTICE_DISMISS}"; labels: ${nodes
          .map((n) => n.label)
          .filter(Boolean)
          .slice(0, 40)
          .join(" | ")}`
  );
  await shot(udid, `${kind}-panel-light`);
  await mac(`xcrun simctl ui ${udid} appearance dark`);
  await pause(1500);
  await shot(udid, `${kind}-panel-dark`);
  await mac(`xcrun simctl ui ${udid} appearance light`);
  await pause(1500);
  return box;
}

/**
 * Nothing covers the screen: the transcript row outside the open panel is
 * what a finger lands on there, and a tap on it both reaches it and closes
 * the panel.
 */
async function tapThrough(kind: Kind, udid: string, box: Frame) {
  let nodes = await tree(udid);
  const target = toolRow(nodes);
  if (!target?.frame) {
    check(
      `${kind}: a tap outside reaches the row`,
      false,
      "no transcript row to tap"
    );
    return;
  }
  const at = centre(target.frame);
  const covered = inside(box, at);
  const under = await tree(udid, at);
  check(
    `${kind}: nothing covers the transcript row outside the panel`,
    !covered &&
      under.some((n) => n.value === "Collapsed" || n.value === "Expanded"),
    covered
      ? `the row's centre ${JSON.stringify(at)} is under the panel ${JSON.stringify(box)}; scroll it clear first`
      : `at the row's centre: ${said(under)}`
  );
  const before = target.value;
  await tap(udid, at);
  await pause(1500);
  nodes = await tree(udid);
  const after = toolRow(nodes)?.value;
  check(
    `${kind}: a tap on the row reaches the row`,
    after !== undefined && after !== before,
    `the row went ${before} → ${after ?? "gone"}`
  );
  check(
    `${kind}: the same tap closes the panel`,
    !(approve(nodes) || dismiss(nodes)) && caw(nodes)?.value !== "Open",
    approve(nodes)
      ? "the panel's Approve is still on screen"
      : `closed; Caw's value "${caw(nodes)?.value ?? ""}"`
  );
  await shot(udid, `${kind}-after-tap-light`);
}

/** Opens the panel again, dismisses the notice by its ✕ and approves the ask. */
async function answerFromPanel(kind: Kind, udid: string) {
  const reopen = caw(await tree(udid));
  if (!reopen?.frame) {
    check(
      `${kind}: the notice's ✕ dismisses it`,
      false,
      "Caw not found to reopen the panel"
    );
    return;
  }
  await tap(udid, centre(reopen.frame));
  await pause(1200);
  let nodes = await tree(udid);
  const cross = dismiss(nodes);
  if (cross?.frame) {
    await tap(udid, centre(cross.frame));
    await pause(1500);
  }
  nodes = await tree(udid);
  const stays = dismiss(nodes) !== undefined;
  check(
    `${kind}: the notice's ✕ dismisses it`,
    cross !== undefined && !stays && approve(nodes) !== undefined,
    cross === undefined
      ? "no ✕ to tap"
      : `${stays ? "still listed" : "gone"}; the ask ${approve(nodes) ? "is" : "is not"} still listed`
  );
  const yes = approve(nodes);
  if (yes?.frame) {
    await tap(udid, centre(yes.frame));
  }
  const gone = await until(
    `${kind}: the ask leaving the panel`,
    async () => approve(await tree(udid)),
    (node) => node === undefined,
    60_000
  )
    .then(() => true)
    .catch(() => false);
  const pending = JSON.stringify(await fleet.api<unknown>("/api/pending"));
  check(
    `${kind}: Approve answers the ask from the panel`,
    yes !== undefined && gone && !pending.includes(ASK),
    `${gone ? "the ask left the panel" : "the ask is still listed"}; the hub's pending asks ${pending.includes(ASK) ? "still hold it" : "no longer hold it"}`
  );
  await shot(udid, `${kind}-answered-light`);
}

/**
 * One device's pass. `last`: the pass that also dismisses the notice and
 * approves the ask, which take them away for every device after it.
 */
async function pass(
  kind: Kind,
  udid: string,
  port: number,
  rowSession: string,
  last: boolean
) {
  const box = await openPanel(kind, udid, port, rowSession);
  if (!box) {
    return;
  }
  await tapThrough(kind, udid, box);
  if (last) {
    await answerFromPanel(kind, udid);
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

  const rowSession = await fleet.spawn("claude", "Panel probe");
  await fleet.send(rowSession, `${ROW}: print a line.`);
  await until(
    "the row session's Bash call answered",
    async () =>
      JSON.stringify(
        await fleet.api<unknown>(`/api/instances/${rowSession}/transcript`)
      ),
    (text) => text.includes("Row done."),
    180_000
  );
  const askSession = await fleet.spawn("claude", "Needs probe", fleet.workdir, {
    permissionMode: "default",
  });
  await fleet.send(askSession, `${ASK}: make a file.`);
  const pending = await until(
    "the hub parking the Bash permission ask",
    async () => JSON.stringify(await fleet.api<unknown>("/api/pending")),
    (text) => text.includes(askSession) && text.includes(ASK),
    180_000
  );
  check(
    "hub parks the ask",
    pending.includes(askSession),
    `pending holds ${askSession}`
  );

  // The notice: the probe account's sign-in, as one moved in from the machine's own Claude Code store.
  fleet.write(
    "UPDATE account_signins SET moved_at = ?, moved_from = 'claude' WHERE account_id = ? AND machine_id = ?",
    Date.now(),
    ACCOUNT,
    MACHINE
  );
  const accounts = await fleet.api<{
    signins: { accountId: string; movedAt: number | null }[];
  }>("/api/accounts");
  const moved =
    accounts.signins.find((one) => one.accountId === ACCOUNT)?.movedAt ?? null;
  check("hub serves the moved login", moved !== null, `movedAt ${moved}`);

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

  // ── 4. Phone, then iPad ────────────────────────────────────────────────
  const phone = await simulator("iPhone \\d+ Pro", "CawCo probe panel phone");
  console.log(`  phone simulator ${phone}`);
  await pass("phone", phone, port, rowSession, false);
  await mac(`xcrun simctl shutdown ${phone} >/dev/null 2>&1 || true`);
  const pad = await simulator("iPad Pro.*", "CawCo probe panel iPad");
  console.log(`  iPad simulator ${pad}`);
  await pass("pad", pad, port, rowSession, true);
} catch (error) {
  check("probe", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const udid of sims) {
    // biome-ignore lint/performance/noAwaitInLoops: one ssh session at a time, each simulator torn down in turn
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
