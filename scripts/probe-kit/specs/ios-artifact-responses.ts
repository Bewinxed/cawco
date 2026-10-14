/**
 * iOS: an artifact's responses event is drawn as one quiet line, never the
 * person's bubble (core ARTIFACT_RESPONSES; Notes.swift `SystemLineView`).
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) and the built app on an iPhone simulator of its own (a
 * mac-slot.sh slot, deleted at the end). A session makes a decision page,
 * its pick set by the agent's patch (a note ending on a Return); the app is
 * opened on the session (`-open-session`); the session goes busy in a turn
 * the mock answers a word a second, and the page is sent twice through the
 * hub's own send (the panel's path), the second with the page's words. Then:
 *
 * 1. The hub holds exactly one pending send to the session, of the system
 *    origin `artifact`; the first is `replaced`.
 * 2. The app, opened on the session (`-open-session`), draws that send as
 *    `ui.system_note/artifact_responses` (its DEBUG `probe drawn` line), in
 *    its queue (`probe sends`: `queue:pending`), and nothing as `user`.
 * 3. Once the turn ends and the agent reads it, the same row is among the
 *    blocks, read, still the note.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-artifact-responses
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

/** iOS 18.5, the app's oldest target, as the other iOS specs run it. */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const CREATE = "mcp__cawco__artifact_create";
const UPDATE = "mcp__cawco__artifact_update";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const BUSY = "PROBE-BUSY answer slowly";
/** How long the busy turn's answer streams, s. */
const BUSY_S = 90;
/** The responses notice (core injected.ts `artifactResponsesNotice`). */
const NOTICE = /^\[CawCo\] The page "coconut-song" has new responses since \d+/;
const LOG_HEAD = /^.*\] /;
const TRAILING_SLASH = /\/$/;
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Song</title></head>
<body><h1>Which song?</h1>
<div data-cawco-choice="song">
  <button data-option="cover" type="button">The cover</button>
  <button data-option="original" type="button">The original</button>
</div></body></html>`;

const pause = (ms: number) => Bun.sleep(ms);

async function sh(script: string): Promise<string> {
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
}

function appPath(): string {
  if (process.env.PROBE_IOS_APP) {
    return process.env.PROBE_IOS_APP;
  }
  const home = process.env.HOME ?? "";
  const top = ROOT.replace(TRAILING_SLASH, "");
  const name = top === join(home, "cockpit") ? "main" : top.split("/").at(-1);
  return join(
    process.env.XDG_CACHE_HOME ?? join(home, "Library", "Caches"),
    "cawco-apple",
    name ?? "main",
    "DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app"
  );
}

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** Calls `name` with `input`, loading it through ToolSearch first when it is deferred. */
const callTool = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return { everyMs: 5, words: [], tool: { name, input } };
  }
  if (!request.toolNames.includes("ToolSearch")) {
    return text(`${name} is not offered`);
  }
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: "ToolSearch",
      input: { query: `select:${name}`, max_results: 1 },
    },
  };
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.last.includes(BUSY) && !request.afterTool) {
    return {
      everyMs: 1000,
      words: Array.from({ length: BUSY_S }, (_, i) => `step ${i + 1}. `),
    };
  }
  if (NOTICE.test(request.last)) {
    return text("Read the responses.");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  const reply = callTool(request, ask.name, ask.input);
  if (reply.tool?.name === ask.name) {
    issued.add(marker);
  }
  return reply;
};

/** A drawn row in a `probe drawn` line, by the first 8 of its id. */
const drawnAs = (line: string, id8: string): string | undefined =>
  new RegExp(`${id8}=(\\S+)`).exec(line)?.[1];
/** A row's place and state in a `probe sends` line, by the first 8 of its id. */
const placedAs = (line: string, id8: string): string | undefined =>
  new RegExp(`${id8}=(\\w+:\\S+?)x\\d+`).exec(line)?.[1];

async function run(kit: Kit): Promise<void> {
  const app = appPath();
  if (!kit.check("the app is built", existsSync(app), app)) {
    return;
  }
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Responses", fleet.repo);

  let sent = 0;
  const call = async (tool: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  const created = await call(CREATE, {
    kind: "page",
    name: "coconut-song",
    html: PAGE,
  });
  const id = created.match(ANSWERED_ID)?.[1];
  if (!kit.check("the decision page is made", !!id, created.slice(0, 300))) {
    return;
  }
  const pick = (note: string) =>
    call(UPDATE, {
      id,
      patch: [
        {
          op: "add",
          path: "/song",
          value: { options: ["cover"], note },
        },
      ],
    });
  /** The page's Send, through the hub's preview listener, as the panel's goes. */
  const sendPage = async (words?: string) => {
    const response = await fetch(
      `http://127.0.0.1:${fleet.env.CAWCO_PREVIEW_PORT}/__cawco/artifact/${id}/send`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cawco-preview": session,
        },
        body: JSON.stringify(words ? { text: words } : {}),
      }
    );
    if (!response.ok) {
      throw new Error(`send ${response.status}: ${await response.text()}`);
    }
  };
  const events = () =>
    fleet
      .query<{ body: string; state: string; uuid: string }>(
        "SELECT uuid, state, body FROM sent_messages WHERE instance_id = ? ORDER BY accepted_at",
        session
      )
      .filter((row) => row.body.includes('"name":"artifact"'));

  await pick("The whole point is the coconut song\nnothing to do with it\n");

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: string[] = [];
  try {
    sim = await macSim(SIM);
    const { udid } = sim;
    console.log(`  simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Transcript"'`,
      ],
      { stdout: "pipe", stderr: "ignore" }
    );
    stream = child;
    (async () => {
      const decoder = new TextDecoder();
      const reader = child.stdout.getReader();
      let rest = "";
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: the stream is read in order
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        rest += decoder.decode(value, { stream: true });
        const split = rest.split("\n");
        rest = split.pop() ?? "";
        for (const line of split) {
          if (line.includes("dev.cawco.app")) {
            heard.push(line.replace(LOG_HEAD, ""));
          }
        }
      }
    })().catch(() => undefined);
    await pause(1500);
    await until(
      "the app launched",
      () =>
        sh(
          `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} >/dev/null`
        ).then(() => true),
      Boolean,
      60_000
    );
    await until(
      "the app showing the session's transcript",
      () => heard.find((line) => line.includes("probe reply")),
      Boolean,
      90_000
    );

    // The session busy, the app open on it: two Sends, the second with the
    // page's words, so it is something new the hub takes.
    await fleet.send(session, BUSY);
    await until(
      "the busy turn",
      () => fleet.seen.find((one) => one.tools && one.last.includes(BUSY)),
      Boolean,
      120_000
    );
    const busyAt = Date.now();
    await sendPage();
    await sendPage("Picked the cover.");
    const held = await until(
      "the second event standing in for the first",
      events,
      (rows) => rows.length === 2 && rows[0].state === "replaced",
      20_000
    ).catch(events);
    const pending = held.filter((row) => row.state === "pending");
    kit.check(
      "1: one pending send of origin system:artifact; the first is replaced",
      pending.length === 1 && held[0]?.state === "replaced",
      JSON.stringify(held.map((row) => ({ uuid: row.uuid, state: row.state })))
    );
    const id8 = (pending[0]?.uuid ?? "").slice(0, 8);

    // 2. While the turn runs: the queued event, drawn as the note.
    const drawnLine = (want: (kind: string) => boolean) =>
      heard.findLast((line) => {
        const kind = line.includes("probe drawn")
          ? drawnAs(line, id8)
          : undefined;
        return kind !== undefined && want(kind);
      });
    const queued = await until(
      "the app drawing the event",
      () => drawnLine(() => true),
      Boolean,
      90_000
    ).catch(() => undefined);
    const place = heard
      .filter((line) => line.includes("probe sends"))
      .map((line) => placedAs(line, id8))
      .findLast(Boolean);
    const stillBusy = Date.now() - busyAt < BUSY_S * 1000;
    await sh(
      `xcrun simctl io ${udid} screenshot "${join(kit.out, "ios-artifact-responses-waiting.png")}" >/dev/null`
    );
    kit.check(
      "2: the app draws the waiting event as ui.system_note/artifact_responses in its queue, nothing as user, while the turn runs",
      !!queued &&
        drawnAs(queued, id8) === "ui.system_note/artifact_responses" &&
        place === "queue:pending" &&
        stillBusy &&
        !heard.some((line) => drawnAs(line, id8) === "user"),
      `drawn: ${queued ?? "nothing"}; place ${place}; ${Date.now() - busyAt} ms into the busy turn`
    );

    // 3. Once the agent read it: among the blocks, still the note.
    const read = await until(
      "the event read, among the blocks",
      () =>
        heard
          .filter((line) => line.includes("probe sends"))
          .map((line) => placedAs(line, id8))
          .findLast(Boolean),
      (where) => where === "blocks:read",
      (BUSY_S + 60) * 1000
    ).catch(() => undefined);
    await pause(1500);
    const last = drawnLine(() => true);
    await sh(
      `xcrun simctl io ${udid} screenshot "${join(kit.out, "ios-artifact-responses-read.png")}" >/dev/null`
    );
    kit.check(
      "3: once read, the row is among the blocks and still the note",
      read === "blocks:read" &&
        !!last &&
        drawnAs(last, id8) === "ui.system_note/artifact_responses",
      `place ${read}; drawn ${last}`
    );
  } finally {
    stream?.kill();
    await sim?.release();
  }
}

const spec: Spec = { name: "ios-artifact-responses", run };
export default spec;
