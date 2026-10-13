#!/usr/bin/env bun
/**
 * iOS queued-message probe: a message the reader sends to a session busy
 * mid-turn stays in the transcript from the moment it leaves the composer,
 * queued until Claude Code takes it, then delivered, and never vanishes,
 * whatever arrives meanwhile, a hub restart included.
 *
 *   bun scripts/probe-ios-queued.ts --app <CawCo.app> [--keep]
 *
 * Run from the repo root on the Mac (a CawCo workspace on the Mac runs it
 * too: the scratch fleet is loopback, the simulator is local). It:
 *
 *  1. stands up a scratch fleet (scratch-fleet.ts) with one Claude session,
 *     whose mock model streams a long reply to a `HOLD` message, so a turn
 *     stays open for about forty seconds;
 *  2. opens the session in the app on an iOS 18.5 simulator of its own, and
 *     sends `HOLD` from the hub's side: the session is busy;
 *  3. types a message into the app's composer and sends it;
 *  4. reads where the app's transcript holds that message from the app's
 *     own DEBUG log (TranscriptView `probe sends`: this device's row, the
 *     hub's queue, among the blocks, or absent; its state; how many rows
 *     hold its id) at the send, +0.5 s, +2 s and +5 s; restarts the hub with
 *     the message still queued, and reads again once the app is back; then
 *     after the turn ends and Claude Code has read it;
 *  5. relaunches the app cold as the control, and counts the rows that
 *     carry the message's words in its accessibility tree.
 *
 * Checks: at every read the message is drawn, in exactly one row, `local`
 * or `queue` until the turn ends and `blocks:read` after; across every line
 * the app logged from the send on, it is never absent and never in two rows.
 * It stops only what it started: the fleet's processes, the log stream and
 * the simulator it created (deleted at the end).
 */
import type { Subprocess } from "bun";
import { type Reply, type Seen, scratchFleet, until } from "./scratch-fleet";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const app = option("--app");
if (!app) {
  console.log(
    "usage: bun scripts/probe-ios-queued.ts --app <CawCo.app> [--keep]"
  );
  process.exit(2);
}
const keep = args.includes("--keep");
const AXE = "/opt/homebrew/bin/axe";
const HOLD = "HOLD";
const WORDS = "queued probe message";

let failures = 0;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failures += 1;
  }
};
const pause = (ms: number) => Bun.sleep(ms);
const sh = async (script: string): Promise<string> => {
  const child = Bun.spawn(["bash", "-s"], {
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
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
};

/** A turn held open by a long reply to `HOLD`; anything else answered at once. */
const respond = (seen: Seen): Reply =>
  seen.last.includes(HOLD)
    ? {
        everyMs: 250,
        words: Array.from({ length: 160 }, (_, i) => `step ${i + 1}. `),
      }
    : { everyMs: 20, words: ["Done."] };
const fleet = await scratchFleet({ name: "probe-ios-queued", respond });

interface Node {
  frame?: { x: number; y: number; width: number; height: number };
  id?: string;
  label?: string;
}
let udid = "";
const tree = async (): Promise<Node[]> => {
  const out: Node[] = [];
  const walk = (node: Record<string, unknown>) => {
    out.push({
      id: node.AXUniqueId as string | undefined,
      label: (node.AXLabel ?? node.label) as string | undefined,
      frame: node.frame as Node["frame"],
    });
    for (const child of (node.children as
      | Record<string, unknown>[]
      | undefined) ?? []) {
      walk(child);
    }
  };
  const roots = JSON.parse(
    await sh(`${AXE} describe-ui --udid ${udid}`)
  ) as Record<string, unknown>[];
  for (const root of roots) {
    walk(root);
  }
  return out;
};
const tapNode = async (node: Node | undefined) => {
  const f = node?.frame;
  if (!f) {
    throw new Error("nothing to tap");
  }
  await sh(
    `${AXE} tap -x ${Math.round(f.x + f.width / 2)} -y ${Math.round(f.y + f.height / 2)} --udid ${udid}`
  );
};

/** A log line's stamp, process and category, up to what it says. */
const LOG_PREFIX = /^.*\] /;
/** Every `probe sends` line the app logged, with when this probe heard it. */
const heard: { at: number; line: string }[] = [];
let stream: Subprocess | undefined;
const listen = () => {
  const child = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Transcript" OR category == "Ledger" OR category == "Hub")'`,
    ],
    { stdout: "pipe", stderr: "ignore" }
  );
  (async () => {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of child.stdout) {
      rest += decoder.decode(chunk, { stream: true });
      const lines = rest.split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) {
        if (
          line.includes("probe sends") ||
          line.includes("page adopted") ||
          line.includes("hub socket") ||
          (line.includes("stream: ") && !line.includes(" applied"))
        ) {
          heard.push({ at: Date.now(), line: line.replace(LOG_PREFIX, "") });
        }
      }
    }
  })().catch(() => undefined);
  return child;
};

/** The reader's message's place in a `probe sends` line, by the first 8 of its id. */
const SEND = /(\w{8})=(\w+)(?::(\S+?)x(\d+))?(?=\s|$)/g;
interface Place {
  place: string;
  rows: number;
  state: string;
}
const placeIn = (line: string, id: string): Place | undefined => {
  for (const m of line.matchAll(SEND)) {
    if (m[1] === id) {
      return { place: m[2], state: m[3] ?? "", rows: Number(m[4] ?? 0) };
    }
  }
};
/** The newest `probe sends` line heard by now. */
const latest = () => heard.filter((h) => h.line.includes("probe sends")).at(-1);
let mine = "";
const read = (
  label: string,
  expect: (place: string, state: string) => boolean,
  want: string
) => {
  const line = latest();
  const found = line && mine ? placeIn(line.line, mine) : undefined;
  check(
    `${label}: the message is drawn once, ${want}`,
    found !== undefined && found.rows === 1 && expect(found.place, found.state),
    line ? line.line : "no probe line yet"
  );
};

const launch = () =>
  sh(
    `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${sessionId} >/dev/null`
  );
const busy = async () =>
  (
    await fleet.api<{ tail?: { busy?: boolean } }>(
      `/api/instances/${sessionId}/transcript`
    )
  ).tail?.busy === true;
let sessionId = "";

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  sessionId = await fleet.spawn("claude", "Queued probe");
  await fleet.send(sessionId, "Say hello.");
  await until("the first turn over", busy, (b) => !b, 120_000);

  udid = (
    await sh(`TYPE=$(xcrun simctl list devicetypes -j | python3 -c '
import json, sys
names = {d["name"]: d["identifier"] for d in json.load(sys.stdin)["devicetypes"]}
print(names["iPhone 16 Pro"])
')
xcrun simctl create "CawCo probe queued" "$TYPE" com.apple.CoreSimulator.SimRuntime.iOS-18-5`)
  ).trim();
  console.log(`  simulator ${udid} (iOS 18.5)`);
  await sh(`xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl install ${udid} "${app}"`);
  stream = listen();
  await launch();
  const field = await until(
    "the session's composer on screen",
    async () => (await tree()).find((n) => n.id === "steer-message"),
    (node) => node?.frame !== undefined,
    120_000
  );

  // ── Busy mid-turn ──────────────────────────────────────────────────────
  await fleet.send(sessionId, `${HOLD}: work through the steps.`);
  await until("the session busy", busy, Boolean, 60_000);
  await pause(1500);
  check("the session is busy before the send", await busy(), "tail.busy true");

  // ── The send, from the app's composer ──────────────────────────────────
  await tapNode(field);
  await pause(800);
  await sh(`${AXE} type '${WORDS}' --udid ${udid}`);
  await pause(400);
  const sendButton = (await tree()).find((n) => n.id === "send-steer");
  const from = heard.length;
  await tapNode(sendButton);
  const t0 = Date.now();
  // Its id: the send this device drew (`local`), first heard after the tap.
  const first = await until(
    "the message drawn by this device",
    () =>
      heard
        .slice(from)
        .map((h) => [...h.line.matchAll(SEND)].find((m) => m[2] === "local"))
        .find(Boolean),
    Boolean,
    5000
  );
  mine = first?.[1] ?? "";
  const drawnAfter =
    (heard.slice(from).find((h) => h.line.includes(`${mine}=local`))?.at ??
      t0) - t0;
  console.log(`  message ${mine}, drawn ${drawnAfter} ms after the tap`);
  read("at the send", (p) => p === "local" || p === "queue", "local or queued");
  const waiting = (p: string, s: string) =>
    (p === "local" && s === "sending") || (p === "queue" && s === "pending");
  await pause(Math.max(0, t0 + 500 - Date.now()));
  read("+0.5 s", waiting, "sending here or pending on the hub");
  await pause(Math.max(0, t0 + 2000 - Date.now()));
  read("+2 s", waiting, "sending here or pending on the hub");
  await pause(Math.max(0, t0 + 5000 - Date.now()));
  read("+5 s", (p, s) => p === "queue" && s === "pending", "queued on the hub");
  check("+5 s: the session is still mid-turn", await busy(), "tail.busy true");

  // ── A hub restart with the message queued: the owner's case ────────────
  const beforeRestart = heard.length;
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  await until(
    "the app's read after the reconnect",
    () =>
      heard
        .slice(beforeRestart)
        .find((h) => h.line.includes(`page adopted for ${sessionId}`)),
    Boolean,
    60_000
  );
  await pause(1000);
  const stillBusy = await busy();
  read(
    "after the hub restart and the app's read",
    (p, s) =>
      stillBusy
        ? p === "queue" && s === "pending"
        : p === "queue" || p === "blocks",
    stillBusy ? "queued on the hub" : "queued or delivered"
  );

  // ── The turn ends, Claude Code reads it ────────────────────────────────
  await until(
    "the message delivered",
    () => {
      const line = latest();
      return line ? placeIn(line.line, mine) : undefined;
    },
    (found) => found?.place === "blocks" && found.state === "read",
    180_000
  );
  read("after the turn", (p, s) => p === "blocks" && s === "read", "delivered");

  // ── Every line from the send on ────────────────────────────────────────
  const lines = heard
    .slice(from)
    .filter(
      (h) => h.line.includes("probe sends") && h.line.includes(`${mine}=`)
    );
  const places = lines.map((h) => ({
    at: h.at,
    found: placeIn(h.line, mine) ?? { place: "absent", state: "", rows: 0 },
  }));
  const gone = places.filter((p) => p.found.place === "absent");
  const doubled = places.filter((p) => p.found.rows > 1);
  console.log("  every place the app drew it in, from the send on:");
  for (const { at, found } of places) {
    console.log(
      `    +${at - t0} ms ${found.place}:${found.state} x${found.rows}`
    );
  }
  check(
    "never absent from the send on",
    gone.length === 0,
    `${lines.length} lines, ${gone.length} absent`
  );
  check(
    "never in two rows",
    doubled.length === 0,
    `${doubled.length} lines with more than one row`
  );
  const restartLines = heard
    .slice(beforeRestart)
    .filter((h) => !h.line.includes("probe sends"))
    .slice(0, 12);
  for (const h of restartLines) {
    console.log(`    restart: +${h.at - t0} ms ${h.line}`);
  }

  // ── The control: a cold launch reads it whole ──────────────────────────
  await sh(`xcrun simctl terminate ${udid} dev.cawco.app`);
  await launch();
  const shown = await until(
    "the message's words on screen after a cold launch",
    // The field capitalises a message's first word as it is typed.
    async () =>
      (await tree()).filter(
        (n) => n.label?.toLowerCase().includes(WORDS) === true
      ),
    (nodes) => nodes.length > 0,
    120_000
  );
  check(
    "cold launch: the message's words are drawn",
    shown.length >= 1,
    `${shown.length} element(s) carry them`
  );
} catch (error) {
  console.log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  failures += 1;
  console.log("  the app's last lines:");
  for (const h of heard.slice(-25)) {
    console.log(`    ${h.line}`);
  }
  if (udid) {
    const nodes = await tree().catch(() => []);
    console.log(
      `  on screen: ${nodes
        .filter((n) => n.id || n.label)
        .map((n) => n.id ?? n.label)
        .slice(0, 40)
        .join(" | ")}`
    );
  }
} finally {
  stream?.kill();
  if (udid) {
    await sh(`xcrun simctl shutdown ${udid} >/dev/null 2>&1 || true
xcrun simctl delete ${udid}`).catch(() => undefined);
  }
  await fleet.close();
  await fleet.clean(keep);
}
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
