#!/usr/bin/env bun
/**
 * iOS follows probe: the app's socket follows a session only while something
 * on it shows the session (web parity, apps/dashboard stream.ts `letGo`).
 * When the last pane, card or peek showing it goes, the app sends
 * `stream.unsubscribe`, and the hub sends that socket none of the session's
 * events; shown again, it is followed again and its transcript is whole.
 *
 *   bun scripts/probe-ios-follows.ts [--built] [--keep] [--runtime <id>]
 *
 * Run from the repo root on the Mac itself (a CawCo workspace on the Mac
 * included). It:
 *
 *  1. compiles the app (build-both.sh ios --compile-only), unless --built;
 *  2. stands up a scratch fleet (scratch-fleet.ts, CAWCO_NO_MDNS=1) with two
 *     Claude Code sessions, A and B, on the mock model;
 *  3. on an iPad Pro 11-inch (M4) (iOS 26.0 by default), launches the app
 *     with `-open-session A,B`: A opened, then B, both as tabs;
 *  4. A answers a turn while it is shown: its events reach the app;
 *  5. A's tab is closed by its close button (axe, by its accessibility
 *     label): the app logs `stream: unsubscribe A`, then A and B each answer
 *     a turn: 0 of A's events reach the app, B's do;
 *  6. A is opened again from the sidebar: it is subscribed again, the turn it
 *     answered unfollowed is on screen, and a new turn's events reach the app.
 *
 * What the hub sends the app's socket is counted where it lands: every
 * `stream.event` and `stream.backlog` the socket carries passes through
 * `Ledger.handle`, which logs one `stream: <id> seq …` or `stream: backlog
 * for <id>` line for it, whatever it then does with it. Prints `PASS` /
 * `FAIL` per check and exits 0 only if all pass. It stops only what it
 * started; the simulator it created is deleted.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { type MacSim, macSim } from "./lib/mac-sim";
import {
  MACHINE,
  type Reply,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const runtimeAt = args.indexOf("--runtime");
const runtime =
  runtimeAt === -1
    ? "com.apple.CoreSimulator.SimRuntime.iOS-26-0"
    : (args[runtimeAt + 1] ?? "");
const root = resolve(import.meta.dir, "..");
const out = join(process.env.TMPDIR ?? join(root, ".probe"), "ios-follows");
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
const failures: string[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) {
    failed += 1;
    failures.push(`FAIL ${name}: ${detail.slice(0, 300)}`);
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
  check("compile", /^BUILT iOS/m.test(text), "BUILT iOS");
}

const TAG = /PROBE-[A-Z0-9-]+/;
/** A turn's words name the prompt they answer, so each reply is findable. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  const asked = request.last.match(TAG)?.[0] ?? "nothing";
  return {
    everyMs: 40,
    words: ["Answer ", "to ", asked, ...Array.from({ length: 12 }, () => ".")],
  };
};
const fleet = await scratchFleet({ name: "probe-ios-follows", respond });
let sim: MacSim | undefined;

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const transcript = async (id: string) =>
    JSON.stringify(await fleet.api<unknown>(`/api/instances/${id}/transcript`));
  /** Sends `tag` to `id` and waits for the hub's transcript to hold its answer. */
  const turn = async (id: string, tag: string) => {
    await fleet.send(id, `Answer ${tag}.`);
    await until(
      `${id.slice(0, 8)} answering ${tag}`,
      () => transcript(id),
      // The prompt is "Answer <tag>."; only the reply says "to <tag>".
      (text) => text.includes(`to ${tag}`),
      180_000
    );
    // The mock streams its dots after the tag: let the turn end.
    await Bun.sleep(2000);
  };
  const titleA = "Follow probe alpha";
  const titleB = "Follow probe beta";
  // In a project, so the sidebar lists A once its tab is gone.
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Follows",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const inProject = { projectId: project.id };
  const a = await fleet.spawn("claude", titleA, fleet.repo, inProject);
  const b = await fleet.spawn("claude", titleB, fleet.repo, inProject);
  await turn(a, "PROBE-A0");
  await turn(b, "PROBE-B0");
  const { port } = new URL(fleet.base);

  sim = await macSim({
    runtime,
    device: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB",
  });
  const { udid } = sim;
  await sh(`xcrun simctl install ${udid} "${app}"`);
  const streamed = join(out, "ledger.stream");
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
      "debug",
      "--predicate",
      'subsystem == "dev.cawco.app" AND (category == "Ledger" OR category == "Transcript")',
    ],
    { stdout: Bun.file(streamed), stderr: "ignore" }
  );
  await Bun.sleep(1500);
  const launched = await sh(
    `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${a},${b}`
  );
  const pid = /dev\.cawco\.app: (\d+)/.exec(launched)?.[1];
  if (!pid) {
    throw new Error(`no pid in the launch's answer: ${launched}`);
  }
  const lines = async () =>
    (await Bun.file(streamed).text())
      .split("\n")
      .filter((line) => line.includes(`CawCo[${pid}:`));
  const log = async () => (await lines()).join("\n");
  const [a8, b8] = [a.slice(0, 8), b.slice(0, 8)];
  /** The lines of what the hub sent this socket for a session. */
  const sent = (all: string[], id8: string) =>
    all.filter(
      (line) =>
        line.includes(`stream: ${id8} seq `) ||
        line.includes(`stream: backlog for ${id8}`)
    );
  const mark = async () => (await lines()).length;
  const since = async (from: number) => (await lines()).slice(from);
  const shot = (name: string) =>
    sh(`xcrun simctl io ${udid} screenshot "${join(out, `${name}.png`)}"`);
  const ui = () => sh(`/opt/homebrew/bin/axe describe-ui --udid ${udid}`);
  interface Node {
    AXLabel?: string | null;
    children?: Node[];
    frame?: { height: number; width: number; x: number; y: number };
    type?: string;
  }
  /** The centre of the first element whose label starts with `prefix` (of `type`, when named). */
  const centre = (tree: string, prefix: string, type?: string) => {
    const walk = (nodes: Node[]): Node | undefined => {
      for (const node of nodes) {
        if (
          node.AXLabel?.startsWith(prefix) &&
          node.frame &&
          (!type || node.type === type)
        ) {
          return node;
        }
        const inner = walk(node.children ?? []);
        if (inner) {
          return inner;
        }
      }
      return undefined;
    };
    const found = walk(JSON.parse(tree) as Node[]);
    if (!found?.frame) {
      throw new Error(`no element labelled ${prefix}… on screen`);
    }
    const { x, y, width, height } = found.frame;
    return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
  };

  await until(
    "both sessions subscribed",
    log,
    (text) =>
      text.includes(`stream: subscribe ${a8}`) &&
      text.includes(`stream: subscribe ${b8}`),
    120_000
  );

  // ── 4. A shown: its turn streams to the app ──────────────────────────
  let at = await mark();
  await turn(a, "PROBE-A1");
  const shown = sent(await since(at), a8);
  check(
    "A streams while shown",
    shown.length > 0,
    `${shown.length} of A's events reached the app during its turn`
  );

  // ── 5. A's tab closed: let go, and the hub sends it nothing ──────────
  const before = await ui();
  await writeFile(join(out, "ui-before-close.json"), before);
  // A finger closes a tab from its options: held, then "Close"
  // (PaneTabsView: no close button on a touch screen).
  // The tab strip's tab: a radio button (a sidebar row is not one).
  const tab = centre(before, `${titleA},`, "RadioButton");
  await sh(
    `/opt/homebrew/bin/axe batch --udid ${udid} --step "touch -x ${tab.x} -y ${tab.y} --down" --step "sleep 1.2" --step "touch -x ${tab.x} -y ${tab.y} --up"`
  );
  await Bun.sleep(800);
  await writeFile(join(out, "ui-menu.json"), await ui());
  await sh(`/opt/homebrew/bin/axe tap --udid ${udid} --label Close`);
  await until(
    "A let go",
    log,
    (text) => text.includes(`stream: unsubscribe ${a8}`),
    30_000
  );
  const unsubscribed = (await lines()).findIndex((line) =>
    line.includes(`stream: unsubscribe ${a8}`)
  );
  check(
    "closing A's tab unsubscribes A, not B",
    unsubscribed >= 0 && !(await log()).includes(`stream: unsubscribe ${b8}`),
    (await lines())[unsubscribed] ?? "no unsubscribe line"
  );
  at = await mark();
  await Promise.all([turn(a, "PROBE-A2"), turn(b, "PROBE-B2")]);
  const after = await since(at);
  const ofA = sent(after, a8);
  const ofB = sent(after, b8);
  check(
    "0 of A's events after the let-go",
    ofA.length === 0,
    `${ofA.length} of A's events reached the app while A answered PROBE-A2${ofA.length ? `: ${ofA.slice(0, 3).join(" | ")}` : ""}`
  );
  check(
    "B still streams on the same socket",
    ofB.length > 0,
    `${ofB.length} of B's events reached the app while B answered PROBE-B2`
  );
  await shot("after-close");

  // ── 6. A opened again: followed, whole, streaming ────────────────────
  const closed = await ui();
  await writeFile(join(out, "ui-after-close.json"), closed);
  at = await mark();
  // The sidebar's row: "<status>: <title>".
  const row = centre(closed, `Idle: ${titleA}`);
  await sh(`/opt/homebrew/bin/axe tap --udid ${udid} -x ${row.x} -y ${row.y}`);
  await until(
    "A followed again",
    log,
    (text) =>
      text.split("\n").slice(at).join("\n").includes(`stream: subscribe ${a8}`),
    60_000
  );
  const reopened = await ui();
  await writeFile(join(out, "ui-reopened.json"), reopened);
  await shot("reopened");
  check(
    "A reopened shows the turn it answered unfollowed",
    reopened.includes("PROBE-A2"),
    reopened.includes("PROBE-A2")
      ? "the reply to PROBE-A2 is in the reopened pane"
      : "no PROBE-A2 in the screen's accessibility tree"
  );
  at = await mark();
  await turn(a, "PROBE-A3");
  const again = sent(await since(at), a8);
  const showing = await ui();
  check(
    "A streams again once shown",
    again.length > 0 && showing.includes("PROBE-A3"),
    `${again.length} of A's events reached the app; PROBE-A3 on screen: ${showing.includes("PROBE-A3")}`
  );
  await shot("new-turn");
  stream.kill();
  await writeFile(join(out, "ledger.log"), await log());
} catch (error) {
  check(
    "run",
    false,
    String(error instanceof Error ? (error.stack ?? error.message) : error)
  );
} finally {
  await sim?.release();
  await fleet.close();
  await fleet.clean(keep);
}
console.log(`  captures and logs: ${out}`);
console.log(
  failed === 0 ? "all checks pass" : `${failed} failed:\n${failures.join("\n")}`
);
process.exit(failed === 0 ? 0 : 1);
