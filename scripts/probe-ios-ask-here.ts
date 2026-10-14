#!/usr/bin/env bun
/**
 * iOS ask-in-place probe: The Open Page Rule for the questions that were
 * dialogs. Each is asked under the row or list it was asked from, nothing
 * is presented over the page, its confirm pends while the hub works, and a
 * hub refusal stays under the question in the hub's words.
 *
 *   bun scripts/probe-ios-ask-here.ts [--built] [--keep] [--device iphone|ipad] [--runtime <id>]
 *
 * Run from the repo root on the Mac itself (a CawCo workspace on the Mac
 * included). It:
 *
 *  1. compiles the app (build-both.sh ios --compile-only), unless --built;
 *  2. stands up a scratch fleet (scratch-fleet.ts, CAWCO_NO_MDNS=1) with,
 *     on its machine: a Claude Code session that answered a turn and was
 *     stopped (Delete transcript), one whose start failed (Remove session)
 *     and a running spin-off (Discard); and a second machine, gone offline
 *     (Remove machine);
 *  3. launches the app on an iPhone (default) or an iPad with `-ask-probe`,
 *     which drives each question through the function its menu item runs
 *     and logs what the screen shows (AskProbe.swift);
 *  4. takes the machine down when the app asks for it, so the hub refuses
 *     the transcript's delete, and brings it back, so it is tried again;
 *  5. checks each logged step.
 *
 * Prints `PASS` / `FAIL` per check and exits 0 only if all pass. It stops
 * only what it started; the simulator it created is deleted.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { type MacSim, macSim } from "./lib/mac-sim";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const runtime =
  flag("--runtime") ?? "com.apple.CoreSimulator.SimRuntime.iOS-26-0";
const ipad = flag("--device") === "ipad";
const device = ipad
  ? "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB"
  : undefined;
const root = resolve(import.meta.dir, "..");
const out = join(
  process.env.TMPDIR ?? join(root, ".probe"),
  `ios-ask-here-${ipad ? "ipad" : "iphone"}`
);
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
    failures.push(`FAIL ${name}: ${detail.slice(0, 400)}`);
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

/** A workflow step's prompt: its turn runs long, so the step stays running. */
const SLOW = "PROBE-SLOW-STEP";
const respond = (request: Seen): Reply =>
  request.all.includes(SLOW)
    ? { everyMs: 1000, words: Array.from({ length: 600 }, () => "step") }
    : { everyMs: 5, words: ["Answered", "."] };
const fleet = await scratchFleet({ name: "probe-ios-ask-here", respond });
let sim: MacSim | undefined;
const GHOST = "ask-ghost";
/** The workflow run Cancel run is asked of, once the app asked for one. */
let runId = "";

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const row = (id: string) =>
    fleet.query<{ status: string; session_id: string | null; kind: string }>(
      "SELECT status, session_id, kind FROM instances WHERE id = ?",
      id
    )[0];

  // Delete transcript: a session that answered a turn, then stopped.
  const del = await fleet.spawn("claude", "Delete me", fleet.repo);
  await fleet.send(del, "Say anything.");
  await until(
    "the delete session answered",
    async () =>
      JSON.stringify(await fleet.api(`/api/instances/${del}/transcript`)),
    (text) => text.includes("Answered"),
    180_000
  );
  await Bun.sleep(1500);
  await fleet.stopSession(del);
  await until(
    "the delete session at rest with its transcript",
    () => row(del),
    (one) =>
      Boolean(one?.session_id) &&
      !["running", "starting"].includes(one?.status ?? ""),
    60_000
  );

  // Remove session: a start that failed before the harness made a conversation.
  const remove = crypto.randomUUID();
  await fleet.post({
    verb: "spawn",
    machineId: MACHINE,
    instanceId: remove,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId: remove,
      // A folder that cannot be made (the agent makes a missing one): the start fails.
      cwd: "/dev/null/never",
      harness: "claude",
      model: MODEL.claude,
      title: "Never started",
      permissionMode: "bypassPermissions",
    },
  });
  await until(
    "the never-started session at rest",
    () => row(remove),
    (one) =>
      Boolean(one) &&
      !one?.session_id &&
      !["running", "starting"].includes(one?.status ?? ""),
    120_000
  ).catch((error: unknown) => {
    throw new Error(
      `${String(error)}; the hub holds ${JSON.stringify(row(remove) ?? null)}`
    );
  });

  // Discard: a running spin-off, mid-turn, so every home lists it under
  // Working (an idle one is listed by the phone's Recent alone).
  const discard = await fleet.spawn("claude", "Spin-off", fleet.repo, {
    scratch: {},
  });
  await fleet.send(discard, `${SLOW} keep going`);
  check(
    "the spin-off is a scratch session",
    row(discard)?.kind === "scratch",
    `kind ${row(discard)?.kind}`
  );

  // Remove machine: a second machine, gone.
  const ghost = await fleet.launchMachine(GHOST);
  ghost.agent.kill("SIGTERM");
  await until(
    "the second machine offline",
    () => fleet.api<{ machineId: string; status: string }[]>("/api/agents"),
    (rows) =>
      rows.some((one) => one.machineId === GHOST && one.status !== "online"),
    60_000
  );

  const { port } = new URL(fleet.base);
  sim = await macSim({ runtime, device });
  const { udid } = sim;
  await sh(`xcrun simctl install ${udid} "${app}"`);
  const streamed = join(out, "ask.stream");
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
      'subsystem == "dev.cawco.app" AND category == "AskProbe"',
    ],
    { stdout: Bun.file(streamed), stderr: "ignore" }
  );
  await Bun.sleep(1500);
  const ids = `del=${del},remove=${remove},discard=${discard},main=${MACHINE},ghost=${GHOST}`;
  const launched = await sh(
    `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -ask-probe -ask-probe-ids ${ids}`
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

  // The app reads each confirm in flight with the hub held still: a local
  // hub answers within a frame. "hold the hub" freezes it, "free the hub" lets it go.
  const times = (text: string, line: string) => text.split(line).length - 1;
  let held = 0;
  let freed = 0;
  const followHolds = async () => {
    const text = await log();
    for (; held < times(text, "ask-probe: hold the hub"); held += 1) {
      fleet.freeze("hub", true);
    }
    for (; freed < times(text, "ask-probe: free the hub"); freed += 1) {
      fleet.freeze("hub", false);
    }
  };
  const holds = setInterval(() => {
    followHolds().catch((error: unknown) => console.log(`… hold: ${error}`));
  }, 100);

  // The app hands the script its turns: the machine down, then back.
  await until(
    "the app asks for the machine to go",
    log,
    (text) =>
      text.includes(`ask-probe: take ${MACHINE} offline`) ||
      text.includes("ask-probe: done"),
    300_000
  );
  if ((await log()).includes(`ask-probe: take ${MACHINE} offline`)) {
    await fleet.stop("agent");
    await until(
      "the app asks for the machine back",
      log,
      (text) =>
        text.includes(`ask-probe: bring ${MACHINE} back`) ||
        text.includes("ask-probe: done"),
      240_000
    );
    fleet.launch("agent");
    await fleet.agentUp();
  }
  // Cancel run: a workflow whose one step runs for minutes, started once the app asks.
  await until(
    "the app asks for a run",
    log,
    (text) =>
      text.includes("ask-probe: start a run") ||
      text.includes("ask-probe: done"),
    300_000
  );
  if ((await log()).includes("ask-probe: start a run")) {
    const workflow = await fleet.api<{ id: string }>("/api/workflows", {
      name: "Probe slow run",
      program: `import { z } from "zod"; export const inputs = z.object({}); export default async function(w: Workflow<typeof inputs>) { return await w.run({ title: "Probe slow step", harness: "claude", model: ${JSON.stringify(MODEL.claude)}, prompt: ${JSON.stringify(`${SLOW} take your time`)}, timeoutMinutes: 30, retries: 0, output: z.object({ ok: z.boolean() }) }); }`,
    });
    const started = await fleet.api<{ runId: string }>(
      `/api/workflows/${workflow.id}/runs`,
      { workspace: { machineId: MACHINE, path: fleet.workdir } }
    );
    ({ runId } = started);
  }
  await until(
    "the probe done",
    log,
    (text) => text.includes("ask-probe: done"),
    300_000
  );
  clearInterval(holds);
  await sh(
    `xcrun simctl io ${udid} screenshot "${join(out, "end.png")}"`
  ).catch(() => "");
  stream.kill();
  const all = await log();
  await writeFile(join(out, "ask.log"), all);

  /** The logged line for `step` on `id`, after the prefix. */
  const said = (step: string, id: string) => {
    const line = all.split("\n").find((one) => one.includes(`${step} [${id}]`));
    return line ? line.slice(line.indexOf(`${step} [`)) : "";
  };
  const expect = (
    name: string,
    step: string,
    id: string,
    ...parts: (string | RegExp)[]
  ) => {
    const line = said(step, id);
    const missing = parts.filter((part) =>
      typeof part === "string" ? !line.includes(part) : !part.test(line)
    );
    check(
      name,
      line !== "" && missing.length === 0,
      line
        ? `${line}${missing.length ? `  (missing: ${missing.join(", ")})` : ""}`
        : `no "${step}" line`
    );
  };
  const free = "over the page: none";

  // Remove session.
  expect(
    "Remove session asks under its row, the page open",
    "remove asked",
    remove,
    "'Remove this session?' confirm 'Remove session' cancel on",
    "under its row: yes",
    free
  );
  expect(
    "Cancel puts it away, the row stays",
    "remove cancelled",
    remove,
    "question: none on screen",
    /row: (?!no row)/
  );
  expect(
    "Remove pends in place",
    "remove in flight",
    remove,
    "confirm 'Removing…' spinning cancel off",
    "under its row: yes",
    free
  );
  expect(
    "Remove answered: the row and its question go",
    "remove answered",
    remove,
    "question: none on screen",
    "row: no row on screen"
  );

  // Discard.
  expect(
    "Discard asks under its row",
    "discard asked",
    discard,
    "'Discard this spin-off?' confirm 'Discard spin-off'",
    "under its row: yes",
    free
  );
  expect(
    "Discard pends in place",
    "discard in flight",
    discard,
    "confirm 'Discarding…' spinning cancel off",
    "under its row: yes"
  );
  expect(
    "Discard answered: the row and its question go",
    "discard answered",
    discard,
    "question: none on screen",
    "row: no row on screen"
  );

  // Delete transcript, refused while its machine is away, then tried again.
  expect(
    "Delete asks under its row",
    "delete asked",
    del,
    "'Delete this transcript?' confirm 'Delete transcript'",
    "under its row: yes",
    free
  );
  expect(
    "Delete pends in place",
    "delete in flight",
    del,
    "confirm 'Deleting…' spinning cancel off",
    "under its row: yes"
  );
  expect(
    "The hub's refusal stays under the question",
    "delete answered",
    del,
    /refused '[^']+'/,
    "confirm 'Delete transcript'",
    "cancel on",
    "under its row: yes",
    free
  );
  expect(
    "Tried again once the machine is back: the row goes",
    "delete again answered",
    del,
    "question: none on screen",
    "row: no row on screen"
  );

  // Remove machine.
  expect(
    "Remove machine asks under its row, naming its sessions",
    "remove machine asked",
    MACHINE,
    `confirm 'Remove machine'`,
    /reaches \[[^\]]+\]/,
    "under its row: yes",
    free
  );
  expect(
    "Back online, the machine's question goes",
    "remove machine, back online",
    MACHINE,
    "question: none on screen",
    "row: listed"
  );
  expect(
    "Remove machine asks under the gone machine's row",
    "remove machine asked",
    GHOST,
    "'Remove ",
    "confirm 'Remove machine'",
    "under its row: yes",
    free
  );
  expect(
    "Remove machine pends in place",
    "remove machine in flight",
    GHOST,
    "confirm 'Removing…' spinning cancel off"
  );
  expect(
    "Remove machine answered: the row and its question go",
    "remove machine answered",
    GHOST,
    "question: none on screen",
    "row: gone"
  );

  // Full Send.
  expect(
    "Full Send asks under the list, the rows live",
    "full send asked",
    "fullSend",
    "'Switch to Full Send?' confirm 'Switch to Full Send'",
    "under the list: yes",
    "over the popover: none",
    "rows live: true",
    "picked: nothing"
  );
  expect(
    "Cancel puts Full Send's question away",
    "full send cancelled",
    "fullSend",
    "question: none on screen",
    "picked: nothing"
  );
  expect(
    "Another mode's pick puts it away",
    "full send, another mode picked",
    "fullSend",
    "question: none on screen",
    "picked: acceptEdits"
  );
  expect(
    "Full Send's yes is the pick",
    "full send confirmed",
    "fullSend",
    "question: none on screen",
    "picked: fullSend"
  );

  // Cancel run.
  const run = `run:${runId}`;
  expect(
    "Cancel run asks under the run's head, naming the step running now",
    "workflow cancel asked",
    run,
    "'Cancel this run?' confirm 'Cancel run' cancel on",
    /reaches \[[^\]]+\]/,
    "under its head: yes",
    free
  );
  expect(
    "Cancel run pends in place",
    "workflow cancel in flight",
    run,
    "confirm 'Cancelling…' spinning cancel off",
    "under its head: yes",
    free
  );
  expect(
    "Cancel run answered: the run is cancelled and the question goes",
    "workflow cancel answered",
    run,
    "question: none on screen",
    /run: \S*cancel/
  );
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
