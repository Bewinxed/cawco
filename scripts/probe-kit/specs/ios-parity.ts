/**
 * iOS parity with the web for where asks appear and how sessions and
 * machines are acted on (owner: "ios should have 1:1 parity with the web
 * app"): the web's 685a5ea2 (an ask is answered where it was made) and
 * 464cb194 (a machine's questions on its row), and the rail's session menu.
 *
 * A scratch fleet on the Mac (real hub, agent and sessiond, Claude Code
 * against the mock model, a stand-in Cawrier): a project; per device a
 * worker session that notes a fact, then the project's memory curator run,
 * whose turn proposes a knowledge file citing it; a second machine, gone
 * offline. The built app on an iPhone 16 Pro and an iPad Pro 11-inch (M4),
 * iOS 18.5, each in a mac-slot.sh slot of its own, with `-parity-probe`
 * (ParityProbe.swift), whose log lines are read here:
 *
 * (p) the hub's push for the curator's proposal carries the curator run's
 *     session as `originInstanceId`;
 * (a) routed as a tap on that push routes it, the app opens the session
 *     that made the proposal, its card in that session's composer, nothing
 *     presented over the page;
 * (b) a pane opened on the proposal's own id moves to that session;
 * (c) Approve in that composer answers it: it leaves the hub's pending
 *     asks, the composer and Caw's panel;
 * (r) iPad: the rail's session row carries the session's menu, and Delete
 *     transcript asks under that rail row, pends, and deletes the session;
 * (m) the gone machine's keychain unlock opens under its row, the hub's
 *     refusal of the password said in it; the hub's refusal of an install
 *     stands under the same row with Try again; nothing presented.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-parity
 *
 * `PROBE_DEVICE=iPhone` (or `iPad`) runs one device. The app is this
 * checkout's simulator build (`PROBE_IOS_APP` names another).
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each device's steps are read in order.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
const DEVICES = [
  {
    tag: "iPhone",
    wide: false,
    type: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
  },
  {
    tag: "iPad",
    wide: true,
    type: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB",
  },
];
const NOTE = "mcp__cawco__memory_note";
const PROPOSE = "mcp__cawco__memory_propose";
const WORKER = "PROBE-PARITY-WORKER";
const NOTE_ID = /n-\d{8}-\d{6}-[0-9a-f]{6}/;
const WORKER_TAG = /PROBE-PARITY-WORKER (\w+)/;
/** A proposal id's stamp (memory.ts `PROPOSAL_ID`): `YYYYMMDD-HHMMSS`. */
const STAMP_MARKS = /[-:T]/g;
const STAMP_DAY = /^(\d{8})/;
const UNLOCK_FORM = /under its row: unlock\(.*Unlock /;
const UNLOCK_REFUSED = /under its row: unlock\(.*Unlock .*\[Unlock off\]/;
const INSTALL_REFUSED = /fault\('.*nothing was installed.*' \+ Try again\)/;
const GHOST = "parity-ghost";
/** The compact log's head, up to the `[subsystem:category] ` tag: the probe's own lines carry `[id]` tags. */
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
const TRAILING_SLASH = /\/$/;

interface Pushed {
  payload: {
    cawco: {
      instanceId?: string;
      kind: string;
      originInstanceId?: string | null;
      requestId?: string;
      threadId?: string | null;
    };
  };
}

interface Ask {
  instanceId: string;
  machineId: string;
  payload: {
    input: { path?: string };
    originInstanceId?: string;
    toolName: string;
  };
  requestId: string;
}

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
/** A session that must call `name`: loads it with ToolSearch first when it is deferred. */
const call = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return { everyMs: 5, words: [], tool: { name, input } };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${name}`, max_results: 1 },
        },
      }
    : text(`${name} is not offered`);
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const { all } = request;
  const worker = WORKER_TAG.exec(all);
  if (worker && !all.includes('"taint":')) {
    return call(request, NOTE, {
      text: `Parity fact for the ${worker[1]}: releases are cut on Thursdays.`,
    });
  }
  return text("ok");
};

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [said, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || said.trim()}`);
  }
  return said;
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

async function run(kit: Kit): Promise<void> {
  const app = appPath();
  if (!kit.check("the app is built", existsSync(app), app)) {
    return;
  }
  const pushed: Pushed[] = [];
  const cawrier = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/v1/push") {
        pushed.push((await request.json()) as Pushed);
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 204 });
    },
  });
  const fleet = await kit.fleet(respond);
  fleet.env.CAWCO_CAWRIER_ORIGIN = `http://127.0.0.1:${cawrier.port}`;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  await fleet.api("/api/push/register", {
    pairingId: crypto.randomUUID(),
    secret: Buffer.from(bytes(32)).toString("base64url"),
    key: Buffer.from(bytes(32)).toString("base64"),
    name: "Probe iPhone",
    platform: "ios",
  });
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  // ── A project, and a second machine gone offline ───────────────────────
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(fleet.home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo probe > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: fleet.home })
    .quiet();
  const made = await fleet.api<{ id?: string; project?: { id: string } }>(
    "/api/projects",
    { name: "Parity probe", machineId: MACHINE, cwd: src, caw: false }
  );
  const projectId = made.project?.id ?? made.id ?? "";
  const ghost = await fleet.launchMachine(GHOST);
  ghost.agent.kill("SIGTERM");
  await until(
    "the second machine offline",
    () => fleet.api<{ machineId: string; status: string }[]>("/api/agents"),
    (rows) =>
      rows.some((one) => one.machineId === GHOST && one.status !== "online"),
    60_000
  );

  const proposals = async (): Promise<Ask[]> =>
    (await fleet.api<Ask[]>("/api/pending")).filter(
      (ask) => ask.payload.toolName === PROPOSE
    );

  const http = async (method: string, path: string, body?: object) => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, text: await response.text() };
  };
  /** The notes a proposal already cites. */
  const used = new Set<string>();

  /** A worker notes a fact and stops, and the curator proposes from it: the proposal. */
  const curated = async (tag: string) => {
    const worker = await fleet.spawn("claude", `Worker ${tag}`, src, {
      projectId,
    });
    await fleet.send(worker, `${WORKER} ${tag}: note when releases are cut.`);
    await until(
      `${tag}: the worker's turn ended`,
      async () =>
        JSON.stringify(await fleet.api(`/api/instances/${worker}/transcript`)),
      (said) => said.includes('"taint":') || said.includes(NOTE),
      180_000
    );
    await Bun.sleep(2000);
    await fleet.stopSession(worker);
    await until(
      `${tag}: the worker at rest with its transcript`,
      () =>
        fleet.query<{ status: string; session_id: string | null }>(
          "SELECT status, session_id FROM instances WHERE id = ?",
          worker
        )[0],
      (row) =>
        Boolean(row?.session_id) &&
        !["running", "starting"].includes(row?.status ?? ""),
      60_000
    );
    // The worker's note, waiting in the inbox.
    const inbox = await until(
      `${tag}: the worker's note in the inbox`,
      () =>
        fleet.api<{ entries: { path: string }[] }>(
          `/api/projects/${projectId}/folder?path=memory/inbox`
        ),
      (listed) =>
        listed.entries.some((entry) => NOTE_ID.test(entry.path)) &&
        listed.entries.length > 0,
      60_000
    );
    const cited = inbox.entries
      .map((entry) => NOTE_ID.exec(entry.path)?.[0])
      .filter((one): one is string => one !== undefined)
      .find((one) => !used.has(one));
    if (!cited) {
      return { ask: undefined, worker };
    }
    used.add(cited);
    // The curator's proposal, filed as its run's memory_propose files it
    // (memory.ts `Proposal`): a curator run needs a workspace of its own,
    // which a workspace's boundary refuses to make on this Mac, so the
    // worker's session stands as the run's. The hub parks every open
    // proposal as it starts: restarted, it parks this one as a curator's,
    // made in that session (`originInstanceId`).
    const now = new Date();
    const stamp = now
      .toISOString()
      .replace(STAMP_MARKS, "")
      .slice(0, 14)
      .replace(STAMP_DAY, "$1-");
    const id = `p-${stamp}-${crypto.randomUUID().slice(0, 6)}`;
    const history = await fleet.api<{ commits: { sha: string }[] }>(
      `/api/projects/${projectId}/folder/history`
    );
    await http("PUT", `/api/projects/${projectId}/folder/file`, {
      path: `memory/proposals/${id}.json`,
      content: JSON.stringify({
        base: history.commits[0]?.sha ?? "",
        before: "",
        by: "Memory curator",
        content: `# Parity\n\n- ${cited} is kept.\n`,
        id,
        notes: [cited],
        path: `knowledge/${tag.toLowerCase()}.md`,
        projectId,
        session: worker,
        time: now.toISOString(),
        why: `Keep ${cited}`,
      }),
      message: `memory: propose knowledge/${tag.toLowerCase()}.md`,
    });
    await fleet.stop("hub");
    fleet.launch("hub");
    await fleet.hubUp();
    await fleet.agentUp();
    const asks = await until(
      `${tag}: the curator's proposal parked`,
      proposals,
      (found) => found.some((one) => one.requestId === id),
      60_000
    );
    const ask = asks.find((one) => one.requestId === id);
    return { ask, worker };
  };

  for (const device of DEVICES) {
    if (process.env.PROBE_DEVICE && process.env.PROBE_DEVICE !== device.tag) {
      continue;
    }
    const { tag } = device;
    // biome-ignore lint/performance/noAwaitInLoops: one device after the other, each with its own proposal
    const { ask, worker } = await curated(tag);
    if (!ask) {
      kit.check(`${tag}: a curator proposal`, false, "none parked");
      continue;
    }
    const origin = ask.payload.originInstanceId ?? "";
    kit.check(
      `${tag}: the curator's proposal is parked on machine hub under its own id, made in the curator run's session`,
      ask.machineId === "hub" &&
        ask.instanceId.startsWith("p-") &&
        origin !== "" &&
        fleet.instance(origin) !== undefined,
      `${ask.instanceId} on ${ask.machineId}, origin ${origin || "none"}`
    );
    // (p) the hub's push for it.
    const push = await until(
      `${tag}: p: its push`,
      () =>
        pushed.find(
          (one) =>
            one.payload.cawco.kind === "ask" &&
            one.payload.cawco.requestId === ask.requestId
        ),
      Boolean,
      30_000
    ).catch(() => undefined);
    kit.check(
      `${tag}: p: its push carries the session that made it`,
      push?.payload.cawco.originInstanceId === origin &&
        push.payload.cawco.instanceId === ask.instanceId,
      JSON.stringify(push?.payload.cawco ?? null)
    );

    let sim: MacSim | undefined;
    let stream: Subprocess | undefined;
    const heard: string[] = [];
    try {
      sim = await macSim({ runtime: RUNTIME, device: device.type });
      const { udid } = sim;
      console.log(`  ${tag} simulator ${udid}`);
      await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
      await sh(`xcrun simctl install ${udid} "${app}"`);
      const child = Bun.spawn(
        [
          "bash",
          "-c",
          `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "ParityProbe" OR category == "AskProbe" OR category == "Restore" OR category == "Push")'`,
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
      await Bun.sleep(1500);
      const ids = [
        `proposal=${ask.instanceId}`,
        `origin=${origin}`,
        `ghost=${GHOST}`,
        ...(device.wide ? [`del=${worker}`] : []),
      ].join(",");
      await sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -parity-probe -parity-probe-ids ${ids} >/dev/null`
      );
      // The app reads a confirm in flight with the hub held still (SIGSTOP):
      // "hold the hub" freezes it, "free the hub" lets it go.
      let held = 0;
      let freed = 0;
      const count = (said: string) =>
        heard.filter((one) => one.includes(said)).length;
      const holds = setInterval(() => {
        for (; held < count("parity-probe: hold the hub"); held += 1) {
          fleet.freeze("hub", true);
        }
        for (; freed < count("parity-probe: free the hub"); freed += 1) {
          fleet.freeze("hub", false);
        }
      }, 100);
      await until(
        `${tag}: the probe done`,
        () => heard.find((one) => one.includes("parity-probe: done")),
        Boolean,
        300_000
      ).catch(() => undefined);
      clearInterval(holds);
      if (freed < held) {
        fleet.freeze("hub", false);
      }
      await writeFile(join(kit.out, `${tag}.log`), heard.join("\n"));
      await sh(
        `xcrun simctl io ${udid} screenshot "${join(kit.out, `${tag}-end.png`)}"`
      ).catch(() => "");

      const line = (step: string, id: string) =>
        heard.find((one) => one.includes(`${step} [${id}]`)) ?? "";
      const expect = (
        name: string,
        step: string,
        id: string,
        ...parts: (string | RegExp)[]
      ) => {
        const said = line(step, id);
        const missing = parts.filter((part) =>
          typeof part === "string" ? !said.includes(part) : !part.test(said)
        );
        kit.check(
          `${tag}: ${name}`,
          said !== "" && missing.length === 0,
          said
            ? `${said.slice(said.indexOf(step))}${missing.length ? `  (missing: ${missing.join(", ")})` : ""}`
            : `no "${step}" line`
        );
      };
      const free = "over the page: none";
      const p = ask.instanceId;

      expect(
        "a: the push's fields route to the session that made the proposal",
        "push route",
        p,
        `session("${origin}")`
      );
      expect(
        "a: it lands on that session, the proposal's card in its composer, nothing presented",
        "push landed",
        p,
        `front: ${origin}`,
        `origin's cards: ${p}`,
        "parked: yes",
        "Caw's panel lists it: yes",
        free
      );
      kit.check(
        `${tag}: a: the card in the origin's composer is answerable, on machine hub`,
        heard.some(
          (one) =>
            one.includes(`probe card ${p} on hub:`) &&
            one.includes("approve on deny on")
        ),
        heard.findLast((one) => one.includes(`probe card ${p}`)) ??
          "no probe card line"
      );
      expect(
        "b: a pane opened on the proposal's own id moves to that session",
        "proposal's pane moved",
        p,
        `front: ${origin}`,
        `origin's cards: ${p}`
      );
      kit.check(
        `${tag}: b: the proposal's own pane said it moves, and never stood as the card alone`,
        heard.some((one) =>
          one.includes(`probe alone ${p}: moves to ${origin}`)
        ) &&
          !heard.some((one) => one.includes(`probe alone ${p}: asking true`)),
        heard.find((one) => one.includes(`probe alone ${p}`)) ??
          "no probe alone line"
      );
      const left = !(await proposals()).some(
        (one) => one.requestId === ask.requestId
      );
      expect(
        "c: Approve in the origin's composer answers it: gone from its composer and Caw's panel",
        "answered in its origin",
        p,
        "origin's cards:  |",
        "parked: no",
        "Caw's panel lists it: no"
      );
      kit.check(
        `${tag}: c: the hub holds it no longer`,
        left,
        left ? "gone from /api/pending" : "still pending"
      );

      if (device.wide) {
        expect(
          "r: the rail's session row carries the session's menu",
          "rail menu",
          worker,
          "attached: yes",
          "Delete transcript",
          "Rename…"
        );
        expect(
          "r: Delete transcript asks under the rail row, in the page",
          "rail delete asked",
          worker,
          "'Delete this transcript?'",
          "under its rail row: yes",
          free
        );
        expect(
          "r: it pends in place",
          "rail delete in flight",
          worker,
          "Deleting…",
          "under its rail row: yes"
        );
        expect(
          "r: confirmed, the session is deleted: its rail row and its question go",
          "rail delete answered",
          worker,
          "question: none on screen",
          "rail row: gone"
        );
      }

      expect(
        "m: the unlock opens under the machine's row, nothing presented",
        "unlock opened",
        GHOST,
        UNLOCK_FORM,
        "[Unlock off]",
        free
      );
      expect(
        "m: the hub's refusal of the password is said in the unlock, under the row",
        "unlock answered",
        GHOST,
        UNLOCK_REFUSED,
        free
      );
      expect(
        "m: the hub's refusal of an install stands under the same row, with Try again",
        "install refused",
        GHOST,
        INSTALL_REFUSED,
        free
      );
    } finally {
      stream?.kill();
      await sim?.release();
    }
  }
  await cawrier.stop(true);
}

export default { name: "ios-parity", run } satisfies Spec;
