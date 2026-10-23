/**
 * iOS: "make this a project" (Projects PRD L27–29, "Caw offers 'make this a
 * project' once. Accepting creates the project from the session"), on the
 * session's composer (ProjectOfferCard.swift, as transcript/ProjectOffer.svelte).
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) with "CawCo's to-dos" on, and the built app on an iPhone
 * simulator of its own. A plain session (no project) writes a plan of five
 * open steps; as its turn ends the hub offers it a project (project-offers.ts
 * `plan`). Then:
 *
 * 1. The app, opened on the session, stands the offer on its composer with
 *    the hub's own sentence (`project offer … line=`), read from
 *    `/api/project-offers` on connect.
 * 2. With `-offer-accept` its Create project runs: the hub makes the project
 *    from the session's folder, moves the session into it and answers its
 *    Setup thread; the app says the same project and thread
 *    (`project offer … answered accept`), the hub's `/api/project-offers` no
 *    longer holds the session, its row names the project, and the project's
 *    threads hold the Setup thread: the state the web reads.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-project-offer
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import type { Subprocess } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

/** iOS 18.5, the app's oldest target, as the other iOS specs run it. */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
const COMMAND = /PROBE-CALL:(\d+)/g;
const TODO_WRITE = "mcp__cawco__todo_write";
/** Five open steps: a plan worth a project (project-offers.ts `PLAN_ITEMS`). */
const STEPS = [
  "Map the routes",
  "Write the store",
  "Draw the list",
  "Wire the sync",
  "Ship",
].map((content) => ({ content, status: "pending" }));
const ANSWERED = /answered accept project=(\S+) setup=(\S+)/;

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

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
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
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

interface Offer {
  instanceId: string;
  line: string;
}

const run = async (kit: Kit) => {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
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
  const session = await fleet.spawn("claude", "Routes", fleet.repo);
  asks.set("1", { name: TODO_WRITE, input: { steps: STEPS } });
  await fleet.send(session, "PROBE-CALL:1");
  const offers = () => fleet.api<Offer[]>("/api/project-offers");
  const offered = await until(
    "the hub's offer",
    async () => (await offers()).find((one) => one.instanceId === session),
    Boolean,
    240_000
  ).catch(() => undefined);
  if (
    !kit.check(
      "0: five open steps at the turn's end: the hub offers the plain session a project",
      !!offered,
      JSON.stringify(await offers())
    )
  ) {
    return;
  }

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: string[] = [];
  const said = (prefix: string) =>
    heard.filter((line) => line.startsWith(prefix));
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
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Probe"'`,
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
    const launch = (flags = "") =>
      sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} -preview-probe ${flags} >/dev/null`
      );

    // 1. The offer on the composer, in the hub's words, light and dark.
    let standing: string | undefined;
    for (const theme of ["light", "dark"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one appearance at a time, as the simulator holds one
      await sh(`xcrun simctl ui ${udid} appearance ${theme}`);
      const before = said(`project offer ${session} line=`).length;
      await launch();
      standing = await until(
        `the ${theme} offer`,
        () => said(`project offer ${session} line=`).slice(before).at(-1),
        Boolean,
        90_000
      ).catch(() => standing);
    }
    await sh(`xcrun simctl ui ${udid} appearance light`);
    kit.check(
      "1: the app stands the offer on the session's composer, in the hub's own sentence",
      standing ===
        `project offer ${session} line=${offered?.line} joined=- pending=- refused=-`,
      `app: ${standing ?? "nothing"}; hub: ${offered?.line}`
    );

    // 2. Create project, from the app.
    await launch("-offer-accept");
    const accepted = await until(
      "the app's Create project answered",
      () => said(`project offer ${session} answered accept`).at(-1),
      Boolean,
      120_000
    ).catch(() => said(`project offer ${session}`).at(-1));
    const [, projectId, setupId] = accepted?.match(ANSWERED) ?? [];
    const after = await offers();
    const rows =
      await fleet.api<{ id: string; projectId?: string | null }[]>(
        "/api/instances"
      );
    const row = rows.find((one) => one.id === session);
    const threads = projectId
      ? await fleet.api<{ id: string }[]>(`/api/projects/${projectId}/threads`)
      : [];
    kit.check(
      "2: Create project from the app makes the project from the session and answers its Setup thread: the hub holds no offer, the session's row names the project, its threads hold the Setup thread",
      !!projectId &&
        setupId !== undefined &&
        setupId !== "-" &&
        !after.some((one) => one.instanceId === session) &&
        row?.projectId === projectId &&
        threads.some((thread) => thread.id === setupId),
      `app: ${accepted ?? "nothing"}; hub offers ${JSON.stringify(after)}; row project ${row?.projectId}; threads ${threads.map((one) => one.id).join(",")}`
    );
  } finally {
    stream?.kill();
    await sim?.release();
  }
};

const spec: Spec = { name: "ios-project-offer", run };
export default spec;
