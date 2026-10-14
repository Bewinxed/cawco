/**
 * A project's memory proposal (hub memory.ts) opens from its push straight
 * to a card whose Approve and Deny work, though no session row stands behind
 * it: the hub parks it on machine "hub" under its own id (`p-…`), and the
 * app answers it on the machine its envelope named.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model): a project, a session in it that notes a fact, then Caw asked
 * on a thread for three proposals (AGENTS.md, a knowledge file citing the
 * note, a second knowledge file). The built app on an iPhone simulator of
 * its own (a mac-slot.sh slot, deleted at the end), in order:
 *
 * (p) The hub's push for each (to a stand-in Cawrier, a device registered
 *     on the hidden route): titled "Memory proposal" with the project under
 *     it, never the work's words; its `projectId` the project's and its
 *     thread the project's; its `instanceId` the proposal's id; Open only.
 * (a) Launched as a tap on the AGENTS.md proposal's push launches it
 *     (`-push-route session:<p-…>`, the route PushNote reads off the hub's
 *     `ask` push: its `instanceId` is the proposal's id): the route lands
 *     (not "isn't on the hub"), the card says Approve on, Deny on, nothing
 *     under them, answering on machine "hub", and the pane is the card
 *     alone: its transcript hidden (`probe alone`), no "isn't reachable"
 *     on screen.
 * (b) Its Approve: the proposal leaves /api/pending, AGENTS.md's newest
 *     commit is the person's ("you"), titled by the proposal's why, and the
 *     pane leaves.
 * (c) Launched as a tap on the cited knowledge proposal's push, its Deny:
 *     the proposal leaves, the knowledge file is never written, the note it
 *     cited is archived "rejected", and the pane leaves.
 * (w) The web dashboard at /session/<p-…>: the server's HTML and the page
 *     say nothing of a missing session, the pane's card has Approve, which
 *     commits the file as the person, and the pane leaves.
 *
 *   bash apps/apple/scripts/build-both.sh ios
 *   bun scripts/probe-kit/run.ts memory-proposal
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the push, the app's two answers and the web's are read in order, step by step.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const AXE = "/opt/homebrew/bin/axe";
/** iOS 18.5, where axe reaches the simulator from a workspace (ios-seen.ts). */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const NOTE = "mcp__cawco__memory_note";
const PROPOSE = "mcp__cawco__memory_propose";
const CAW = "You are Caw, the lead of the project";
const WORKER = "PROBE-PROPOSAL-WORKER";
const FACT = "Releases are cut on Thursdays.";
const ASKED = /PROBE-PROPOSAL-ASK (n-\d{8}-\d{6}-[0-9a-f]{6})/;
const OUTCOME = /outcome: (.*)/;
const LOG_HEAD = /^.*\] /;
const TRAILING_SLASH = /\/$/;
/** The three proposals Caw makes, in order. */
const FILES = {
  agents: {
    path: "AGENTS.md",
    content:
      "# Proposal probe\n\n## About\n\n- The probe project ships a small service.\n",
    why: "What the project is",
  },
  cited: {
    path: "knowledge/releases.md",
    content: `# Releases\n\n- ${FACT}\n`,
    why: "When releases are cut",
  },
  web: {
    path: "knowledge/web.md",
    content: "# Web\n\n- The dashboard answers proposals too.\n",
    why: "The web answers",
  },
} as const;

/** What the hub sent a stand-in Cawrier for one push (push.ts `payloadOf`). */
interface Pushed {
  collapseId?: string;
  payload: {
    aps: {
      alert?: { body: string; subtitle?: string; title: string };
      category?: string;
      "thread-id"?: string;
    };
    cawco: {
      instanceId?: string;
      kind: string;
      projectId?: string | null;
      requestId?: string;
    };
  };
}
/** Words a pane says when it has no session to show. */
const MISSING = "isn't reachable";

interface Ask {
  instanceId: string;
  machineId: string;
  payload: {
    input: { path?: string };
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
  if (all.includes(CAW)) {
    const asked = ASKED.exec(all);
    if (!asked) {
      return text("ok");
    }
    for (const [key, file] of Object.entries(FILES)) {
      if (!all.includes(`"path":"${file.path}"`)) {
        return call(request, PROPOSE, {
          path: file.path,
          content: file.content,
          why: file.why,
          ...(key === "cited" ? { notes: [asked[1]] } : {}),
        });
      }
    }
    return text("ok");
  }
  if (all.includes(WORKER) && !all.includes('"taint":')) {
    return call(request, NOTE, { text: FACT });
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

interface Node {
  frame?: { x: number; y: number; width: number; height: number };
  id?: string;
  label?: string;
}

async function run(kit: Kit): Promise<void> {
  const app = appPath();
  if (!kit.check("the app is built", existsSync(app), app)) {
    return;
  }
  // A stand-in Cawrier: every push the hub makes, as it sent it.
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

  const http = async (method: string, path: string, body?: object) => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, text: await response.text() };
  };
  const fileOf = (project: string, path: string) =>
    http(
      "GET",
      `/api/projects/${project}/folder/file?path=${encodeURIComponent(path)}`
    );
  const wordsOf = async (project: string, path: string) => {
    const read = await fileOf(project, path);
    return read.status === 200
      ? (JSON.parse(read.text) as { content: string }).content
      : "";
  };
  const listing = async (project: string, path: string): Promise<string[]> => {
    const read = await http(
      "GET",
      `/api/projects/${project}/folder?path=${encodeURIComponent(path)}`
    );
    return read.status === 200
      ? (JSON.parse(read.text) as { entries: { path: string }[] }).entries.map(
          (entry) => entry.path
        )
      : [];
  };
  const newest = async (project: string, path: string) =>
    (
      JSON.parse(
        (
          await http(
            "GET",
            `/api/projects/${project}/folder/history?path=${encodeURIComponent(path)}`
          )
        ).text
      ) as { commits: { author: string; message: string; sha: string }[] }
    ).commits[0];
  const proposals = async (): Promise<Ask[]> =>
    (await fleet.api<Ask[]>("/api/pending")).filter(
      (ask) => ask.payload.toolName === PROPOSE
    );

  // ── A project, a note in its inbox, Caw's three proposals ──────────────
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
    {
      name: "Proposal probe",
      machineId: MACHINE,
      cwd: src,
      caw: false,
    }
  );
  const projectId = made.project?.id ?? made.id ?? "";
  const worker = await fleet.spawn("claude", "Probe worker", src, {
    projectId,
  });
  await fleet.send(worker, `${WORKER}: note when releases are cut.`);
  const note = await until(
    "the worker's note",
    async (): Promise<string> => {
      for (const path of await listing(projectId, "memory/inbox")) {
        // biome-ignore lint/performance/noAwaitInLoops: a note or two
        if ((await wordsOf(projectId, path)).includes(FACT)) {
          return path;
        }
      }
      return "";
    },
    Boolean,
    180_000
  );
  const noteId = note.split("/").at(-1)?.replace(".md", "") ?? "";
  await http("POST", `/api/projects/${projectId}/threads`, {
    body: `PROBE-PROPOSAL-ASK ${noteId}`,
  });
  const asks = await until(
    "Caw's three proposals parked",
    proposals,
    (found) => found.length === 3,
    240_000
  );
  const askFor = (path: string) =>
    asks.find((ask) => ask.payload.input.path === path);
  const agents = askFor(FILES.agents.path);
  const cited = askFor(FILES.cited.path);
  const web = askFor(FILES.web.path);
  kit.check(
    "each proposal is parked on machine hub under its own id, with no session row",
    [agents, cited, web].every(
      (ask) =>
        ask?.machineId === "hub" &&
        ask.instanceId === ask.requestId &&
        ask.instanceId.startsWith("p-") &&
        fleet.instance(ask.instanceId) === undefined
    ),
    asks
      .map(
        (ask) =>
          `${ask.payload.input.path}: ${ask.instanceId} on ${ask.machineId}`
      )
      .join("; ")
  );
  if (!(agents && cited && web)) {
    return;
  }

  // ── (p) the hub's push for each ────────────────────────────────────────
  const pushFor = (ask: Ask) =>
    pushed.find(
      (one) =>
        one.payload.cawco.kind === "ask" &&
        one.payload.cawco.requestId === ask.requestId
    );
  await until(
    "p: a push for each proposal",
    () => [agents, cited, web].every((ask) => pushFor(ask) !== undefined),
    Boolean,
    30_000
  ).catch(() => undefined);
  const pushes = [agents, cited, web].map((ask) => ({
    ask,
    push: pushFor(ask),
  }));
  kit.check(
    "p: each proposal's push is titled \"Memory proposal\" under its project, in its project's thread, opening its id",
    pushes.every(
      ({ ask, push }) =>
        push?.payload.aps.alert?.title === "Memory proposal" &&
        push.payload.aps.alert.subtitle === "Proposal probe" &&
        push.payload.aps["thread-id"] === projectId &&
        push.payload.cawco.projectId === projectId &&
        push.payload.cawco.instanceId === ask.instanceId &&
        push.payload.aps.category === "CAWCO_PERMISSION_OPEN"
    ),
    pushes
      .map(
        ({ ask, push }) =>
          `${ask.payload.input.path}: ${push ? `"${push.payload.aps.alert?.title}" / "${push.payload.aps.alert?.subtitle}", project ${push.payload.cawco.projectId}, thread ${push.payload.aps["thread-id"]}, ${push.payload.aps.category}, opens ${push.payload.cawco.instanceId}` : "no push"}`
      )
      .join("; ")
  );

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
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Push" OR category == "Restore" OR category == "Permission")'`,
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

    const tree = async (): Promise<Node[]> => {
      const out: Node[] = [];
      const walk = (node: Record<string, unknown>) => {
        out.push({
          id: node.AXUniqueId as string | undefined,
          label: (node.AXLabel ?? node.label) as string | undefined,
          frame: node.frame as Node["frame"],
        });
        for (const kid of (node.children as
          | Record<string, unknown>[]
          | undefined) ?? []) {
          walk(kid);
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
    const tap = async (id: string) => {
      const node = await until(
        `the ${id} button on screen`,
        async () => (await tree()).find((n) => n.id === id),
        Boolean,
        30_000
      );
      const f = node?.frame;
      if (!f) {
        throw new Error(`nothing to tap for ${id}`);
      }
      await sh(
        `${AXE} tap -x ${Math.round(f.x + f.width / 2)} -y ${Math.round(f.y + f.height / 2)} --udid ${udid}`
      );
    };

    /** Opens the proposal as a tap on its push that launches the app does; the card's line once it says it. */
    const openFromPush = async (ask: Ask, label: string) => {
      const from = heard.length;
      await until(
        `${label}: the app launched`,
        () =>
          sh(
            `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -push-route session:${ask.instanceId} >/dev/null`
          ).then(() => true),
        Boolean,
        60_000
      );
      const landed = await until(
        `${label}: the route`,
        // ShellController `applyRoute`: `route session("<id>") landed`, or `route session <id> is not on the hub`.
        () =>
          heard
            .slice(from)
            .find(
              (l) =>
                l.includes(`route session("${ask.instanceId}") landed`) ||
                l.includes(`route session ${ask.instanceId} is not on the hub`)
            ),
        Boolean,
        90_000
      ).catch(() => undefined);
      const card = await until(
        `${label}: the card answerable`,
        () =>
          heard
            .slice(from)
            .findLast(
              (l) =>
                l.includes(`probe card ${ask.requestId} `) &&
                l.includes("approve on deny on")
            ),
        Boolean,
        60_000
      ).catch(() =>
        heard
          .slice(from)
          .findLast((l) => l.includes(`probe card ${ask.requestId} `))
      );
      // SessionViewController `syncAskAlone`: the pane is the card alone.
      const alone = heard
        .slice(from)
        .find((l) =>
          l.includes(
            `probe alone ${ask.instanceId}: asking true transcript hidden`
          )
        );
      const shown = await tree();
      await writeFile(
        join(kit.out, `${label}-tree.json`),
        JSON.stringify(shown, null, 2)
      );
      return { landed, card, shown, alone, from };
    };
    /** The pane's word that its ask settled and it leaves, and the screen after. */
    const leaves = async (ask: Ask, from: number) => {
      const line = await until(
        "the pane leaves",
        () =>
          heard
            .slice(from)
            .find((l) =>
              l.includes(
                `probe alone ${ask.instanceId}: asking false transcript hidden leaving`
              )
            ),
        Boolean,
        20_000
      ).catch(() => undefined);
      const after = await until(
        "the card gone from the screen",
        async () => {
          const nodes = await tree();
          return nodes.some((n) => n.id === "prompt-approve")
            ? undefined
            : nodes;
        },
        Boolean,
        20_000
      ).catch(() => undefined);
      return { line, gone: after !== undefined };
    };

    // ── (a) a tap on the AGENTS.md proposal's push ─────────────────────────
    const a = await openFromPush(agents, "a");
    kit.check(
      "a: the push's route lands on the proposal",
      a.landed?.includes("landed") === true,
      a.landed ?? "no route line"
    );
    kit.check(
      'a: its card has Approve and Deny enabled, answering on machine "hub", nothing under them',
      a.card?.includes(
        `${agents.requestId} on hub: approve on deny on said nothing`
      ) === true,
      a.card ?? "no probe card line"
    );
    kit.check(
      "a: the pane is the card alone: its transcript hidden, nothing says the session is missing",
      a.alone !== undefined && !a.shown.some((n) => n.label?.includes(MISSING)),
      `${a.alone ?? "no probe alone line"}; on screen: ${a.shown.filter((n) => n.label?.includes(MISSING)).length} missing-session labels`
    );
    kit.check(
      "a: its tab is titled by who asked, not its id",
      a.shown.some((n) => n.label?.includes("Caw")) &&
        !a.shown.some((n) => n.label === agents.instanceId.slice(0, 8)),
      a.shown
        .filter((n) => n.label && (n.frame?.y ?? 999) < 160)
        .map((n) => n.label)
        .join(" | ")
    );

    // ── (b) its Approve ────────────────────────────────────────────────────
    await tap("prompt-approve");
    await until(
      "b: the AGENTS.md proposal answered",
      proposals,
      (left) => !left.some((x) => x.requestId === agents.requestId),
      60_000
    ).catch(() => undefined);
    const applied = await newest(projectId, FILES.agents.path);
    const agentsNow = await wordsOf(projectId, FILES.agents.path);
    kit.check(
      "b: Approve commits AGENTS.md as the person",
      !(await proposals()).some((x) => x.requestId === agents.requestId) &&
        applied?.author === "you" &&
        applied.message === `${FILES.agents.path}: ${FILES.agents.why}` &&
        agentsNow.includes("The probe project ships a small service."),
      `commit ${applied?.sha.slice(0, 9)} by ${applied?.author}: ${applied?.message}`
    );
    const bLeft = await leaves(agents, a.from);
    kit.check(
      "b: after Approve the pane leaves",
      bLeft.line !== undefined && bLeft.gone,
      `${bLeft.line ?? "no leaving line"}; card ${bLeft.gone ? "gone" : "still on screen"}`
    );

    // ── (c) the cited proposal's Deny ──────────────────────────────────────
    const c = await openFromPush(cited, "c");
    kit.check(
      "c: the cited proposal's card has Approve and Deny enabled",
      c.card?.includes(
        `${cited.requestId} on hub: approve on deny on said nothing`
      ) === true,
      c.card ?? "no probe card line"
    );
    await tap("prompt-deny");
    await until(
      "c: the cited proposal answered",
      proposals,
      (left) => !left.some((x) => x.requestId === cited.requestId),
      60_000
    ).catch(() => undefined);
    const archived = await until(
      "c: the cited note archived",
      async () => {
        for (const path of await listing(projectId, "memory/archive")) {
          // biome-ignore lint/performance/noAwaitInLoops: a note or two
          const words = await wordsOf(projectId, path);
          if (words.includes(FACT)) {
            return words;
          }
        }
      },
      Boolean,
      30_000
    ).catch(() => undefined);
    kit.check(
      "c: Deny archives the cited note and writes no file",
      !(await proposals()).some((x) => x.requestId === cited.requestId) &&
        (await fileOf(projectId, FILES.cited.path)).status === 404 &&
        (OUTCOME.exec(archived ?? "")?.[1] ?? "").includes("rejected"),
      `note outcome ${OUTCOME.exec(archived ?? "")?.[1] ?? "(not archived)"}`
    );
    const cLeft = await leaves(cited, c.from);
    kit.check(
      "c: after Deny the pane leaves",
      cLeft.line !== undefined && cLeft.gone,
      `${cLeft.line ?? "no leaving line"}; card ${cLeft.gone ? "gone" : "still on screen"}`
    );
  } finally {
    await writeFile(join(kit.out, "app-log.txt"), heard.join("\n"));
    stream?.kill();
    await sim?.release();
  }

  // ── (w) the web dashboard's pane on the proposal's id ───────────────────
  const base = await fleet.dashboard();
  const at = `${base}/session/${web.instanceId}`;
  const served = await (await fetch(at)).text();
  const page = await kit.page("desk");
  // The pane's own card: the composer grown into the ask (Prompt.svelte `.choice`).
  const approve = ".choice button:has-text('Approve'):not([disabled])";
  /** Every missing-session word the page shows, sampled from its first paint to its card. */
  const missingSeen: string[] = [];
  try {
    await page.goto(at, { waitUntil: "domcontentloaded" });
    const sample = async () => {
      const said = await page.getByText(MISSING).count();
      if (said > 0) {
        missingSeen.push(`${said} at ${page.url()}`);
      }
    };
    await sample();
    await until(
      "w: the pane's card",
      async () => {
        await sample();
        return page.locator(approve).count();
      },
      (count) => count > 0,
      90_000
    );
    await sample();
    kit.check(
      "w: the pane on the proposal's id is its card alone: nothing says the session is missing, first paint or after",
      !served.includes(MISSING) && missingSeen.length === 0,
      `server HTML ${served.includes(MISSING) ? "says" : "does not say"} "${MISSING}"; page: ${missingSeen.join(", ") || "never said it"}`
    );
    await page.click(approve);
  } catch (error) {
    const labels = await page
      .locator("button")
      .evaluateAll((all) =>
        all.map(
          (b) => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? ""
        )
      );
    await writeFile(join(kit.out, "web-buttons.txt"), labels.join("\n"));
    throw error;
  }
  await until(
    "w: the web proposal answered",
    proposals,
    (left) => !left.some((x) => x.requestId === web.requestId),
    60_000
  ).catch(() => undefined);
  const webCommit = await newest(projectId, FILES.web.path);
  kit.check(
    "w: the web dashboard's Approve commits the file as the person",
    !(await proposals()).some((x) => x.requestId === web.requestId) &&
      webCommit?.author === "you" &&
      webCommit.message === `${FILES.web.path}: ${FILES.web.why}`,
    `commit ${webCommit?.sha.slice(0, 9)} by ${webCommit?.author}: ${webCommit?.message}`
  );
  const now = await until(
    "w: the pane leaves",
    () => page.url(),
    (url) => !url.includes(web.instanceId),
    20_000
  ).catch(() => page.url());
  kit.check(
    "w: after Approve the pane leaves",
    !now.includes(web.instanceId) &&
      (await page.locator(approve).count()) === 0,
    `now at ${now}`
  );
  await cawrier.stop(true);
}

export default { name: "memory-proposal", run } satisfies Spec;
