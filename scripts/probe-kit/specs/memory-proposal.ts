/**
 * A project's memory proposals are parked, shown and answered on every
 * surface, and Caw's own memory write needs no answer (685a5ea2: Caw's
 * `memory_propose` commits as Caw, noted in his thread; with `ask: true` it
 * is a proposal parked in his thread; the curator's park as before, made in
 * the curator run's session). The hub parks each proposal on machine "hub"
 * under its own id (`p-…`), no session row behind it.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model, a stand-in Cawrier with a device registered on the hidden
 * route): a project; a session in it that notes two facts; the curator's
 * proposal of a file the person wrote, citing the second; then Caw asked on
 * a thread for one plain write (knowledge/web.md) and three proposals with
 * `ask: true` (AGENTS.md, a knowledge file citing the first note,
 * knowledge/web.md again). Every push checked is titled "Memory proposal"
 * with the project under it, never the work's words; its `projectId` the
 * project's and its thread the project's; its `instanceId` the proposal's
 * id; Open only; and it opens where the proposal was made. In order:
 *
 * (o) The curator's proposal is parked on machine "hub" under its own id,
 *     no session row, made in its run's session, and pushed so. The person
 *     edits the file's head while it waits. The web dashboard at
 *     /session/<p-…>: the tab moves to that session, the card in its
 *     composer, nothing says a session is missing; Approve merges the
 *     proposal into the person's edit (the hub's temp dir: memory.ts
 *     `mergeThree`), commits as the person, and the card leaves.
 * (m) Caw's plain write commits knowledge/web.md as Caw at once, and his
 *     thread notes it; nothing of it is parked.
 * (k) Caw's three are parked in his thread, each on machine "hub" under
 *     its own id, with no session row.
 * (p) Their pushes, each carrying his thread.
 * (w) The web dashboard at /session/<p-…> of his knowledge/web.md
 *     proposal: the server's HTML and the page say nothing of a missing
 *     session, the tab moves to his thread, the card is in its composer;
 *     Approve commits as the person, the thread says so and the card leaves.
 * The built app on an iPhone simulator of its own (a mac-slot.sh slot,
 * deleted at the end), which draws a proposal Caw made in a thread as the
 * card alone until it has a thread screen (HubConnection.swift `askAlone`):
 * (a) Launched as a tap on the AGENTS.md proposal's push launches it
 *     (`-push-route session:<p-…>`): the route lands (not "isn't on the
 *     hub"), the card says Approve on, Deny on, nothing under them,
 *     answering on machine "hub", and the pane is the card alone: its
 *     transcript hidden (`probe alone`), no "isn't reachable" on screen.
 * (b) Its Approve: the proposal leaves /api/pending, AGENTS.md's newest
 *     commit is the person's ("you"), titled by the proposal's why, and the
 *     pane leaves.
 * (c) Launched as a tap on the cited knowledge proposal's push, its Deny:
 *     the proposal leaves, the knowledge file is never written, the note it
 *     cited is archived "rejected", and the pane leaves.
 *
 *   bash apps/apple/scripts/build-both.sh ios
 *   bun scripts/probe-kit/run.ts memory-proposal
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 * The fleet's checks run before the app is looked for, so a host without the
 * Mac still reads them; (a) to (c) need the Mac.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the proposals, the web's answers and the app's are read in order, step by step.
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
/** The worker's two notes: the first Caw's cited proposal cites, the second the curator's. */
const FACTS = [
  "Releases are cut on Thursdays.",
  "Hotfixes ship the same day.",
] as const;
const [FACT, CURATED_FACT] = FACTS;
const ASKED = /PROBE-PROPOSAL-ASK (n-\d{8}-\d{6}-[0-9a-f]{6})/;
const NOTE_ID = /n-\d{8}-\d{6}-[0-9a-f]{6}/;
/** A memory_propose result (memory.ts `propose`): committed at once, or parked. */
const PROPOSE_RESULT = /"committed":true|"waiting":"/g;
const NOTE_RESULT = '"taint":';
/** A proposal id's stamp (memory.ts `PROPOSAL_ID`): `YYYYMMDD-HHMMSS`. */
const STAMP_MARKS = /[-:T]/g;
const STAMP_DAY = /^(\d{8})/;
const OUTCOME = /outcome: (.*)/;
/** The hub's log lines about Caw and memory, for a failed wait on Caw to show. */
const CAW_LINE = /caw|memory|thread|lead/i;
const LOG_HEAD = /^.*\] /;
const TRAILING_SLASH = /\/$/;

/** knowledge/web.md as Caw writes it, then as he proposes it. */
const WEB = {
  path: "knowledge/web.md",
  written:
    "# Web\n\n- The dashboard answers proposals.\n\n## Where\n\n- Nothing yet.\n",
  proposed:
    "# Web\n\n- The dashboard answers proposals.\n\n## Where\n\n- In Caw's thread.\n",
} as const;
/** Caw's calls on the thread, in order; all but the first ask. */
const FILES = {
  plain: { path: WEB.path, content: WEB.written, why: "What the web is" },
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
  web: { path: WEB.path, content: WEB.proposed, why: "Where the web answers" },
} as const;
const CAW_CALLS = [FILES.plain, FILES.agents, FILES.cited, FILES.web] as const;
/**
 * knowledge/hotfixes.md as the person wrote it, the curator's proposal of
 * it, the person's edit of its head while that waits, and the two merged.
 */
const CURATED = {
  path: "knowledge/hotfixes.md",
  written: "# Hotfixes\n\n- They ship.\n\n## When\n\n- Not said yet.\n",
  proposed: `# Hotfixes\n\n- They ship.\n\n## When\n\n- ${CURATED_FACT}\n`,
  edited:
    "# Hotfixes and patches\n\n- They ship.\n\n## When\n\n- Not said yet.\n",
  merged: `# Hotfixes and patches\n\n- They ship.\n\n## When\n\n- ${CURATED_FACT}\n`,
  why: "When hotfixes ship",
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
      originInstanceId?: string | null;
      projectId?: string | null;
      requestId?: string;
      threadId?: string | null;
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
    originInstanceId?: string;
    threadId?: string;
    toolName: string;
  };
  requestId: string;
}

interface ThreadMessage {
  author: string;
  body?: string;
  noteTitle?: string;
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
    // Each call answered so far moves Caw to the next.
    const done = all.match(PROPOSE_RESULT)?.length ?? 0;
    const file = CAW_CALLS[done];
    if (!file) {
      return text("ok");
    }
    return call(request, PROPOSE, {
      path: file.path,
      content: file.content,
      why: file.why,
      ...(file === FILES.plain ? {} : { ask: true }),
      ...(file === FILES.cited ? { notes: [asked[1]] } : {}),
    });
  }
  if (all.includes(WORKER)) {
    const noted = all.split(NOTE_RESULT).length - 1;
    const fact = FACTS[noted];
    return fact ? call(request, NOTE, { text: fact }) : text("ok");
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

  // ── A project, and two notes in its inbox ──────────────────────────────
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
  await fleet.send(worker, `${WORKER}: note when releases and hotfixes go.`);
  /** The inbox note saying `fact`: its id. */
  const noteOf = (fact: string) =>
    until(
      `the worker's note "${fact}"`,
      async (): Promise<string> => {
        for (const path of await listing(projectId, "memory/inbox")) {
          // biome-ignore lint/performance/noAwaitInLoops: a note or two
          if ((await wordsOf(projectId, path)).includes(fact)) {
            return NOTE_ID.exec(path)?.[0] ?? "";
          }
        }
        return "";
      },
      Boolean,
      180_000
    );
  const noteId = await noteOf(FACT);
  const curatedNote = await noteOf(CURATED_FACT);

  // ── The curator's proposal ─────────────────────────────────────────────
  // Filed as its run's memory_propose files it (memory.ts `Proposal`), as
  // ios-parity.ts files it: a curator run needs a workspace of its own, which
  // a workspace's boundary refuses to make, so the worker's session stands as
  // the run's. The hub parks every open proposal as it starts: restarted, it
  // parks this one as a curator's, made in that session.
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(STAMP_MARKS, "")
    .slice(0, 14)
    .replace(STAMP_DAY, "$1-");
  const curatedId = `p-${stamp}-${crypto.randomUUID().slice(0, 6)}`;
  await http("PUT", `/api/projects/${projectId}/folder/file`, {
    path: CURATED.path,
    content: CURATED.written,
    message: "Hotfixes",
  });
  const history = await fleet.api<{ commits: { sha: string }[] }>(
    `/api/projects/${projectId}/folder/history`
  );
  await http("PUT", `/api/projects/${projectId}/folder/file`, {
    path: `memory/proposals/${curatedId}.json`,
    content: JSON.stringify({
      base: history.commits[0]?.sha ?? "",
      before: CURATED.written,
      by: "Memory curator",
      content: CURATED.proposed,
      id: curatedId,
      notes: [curatedNote],
      path: CURATED.path,
      projectId,
      session: worker,
      time: now.toISOString(),
      why: CURATED.why,
    }),
    message: `memory: propose a change to ${CURATED.path}`,
  });
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();

  /** Where a proposal is parked: machine "hub", its own id, no session row. */
  const parkedAlone = (ask: Ask | undefined) =>
    ask?.machineId === "hub" &&
    ask.instanceId === ask.requestId &&
    ask.instanceId.startsWith("p-") &&
    fleet.instance(ask.instanceId) === undefined;
  const pushFor = (ask: Ask) =>
    pushed.find(
      (one) =>
        one.payload.cawco.kind === "ask" &&
        one.payload.cawco.requestId === ask.requestId
    );
  /** The hub's pushes for `of`, each "Memory proposal" under the project, opening its id where it was made. */
  const checkPushes = async (
    label: string,
    of: Ask[],
    madeIn: (cawco: Pushed["payload"]["cawco"]) => boolean
  ) => {
    await until(
      `${label}: a push for each proposal`,
      () => of.every((ask) => pushFor(ask) !== undefined),
      Boolean,
      30_000
    ).catch(() => undefined);
    const pushes = of.map((ask) => ({ ask, push: pushFor(ask) }));
    kit.check(
      `${label}: each proposal's push is titled "Memory proposal" under its project, in its project's thread, opening its id where it was made`,
      pushes.every(
        ({ ask, push }) =>
          push?.payload.aps.alert?.title === "Memory proposal" &&
          push.payload.aps.alert.subtitle === "Proposal probe" &&
          push.payload.aps["thread-id"] === projectId &&
          push.payload.cawco.projectId === projectId &&
          push.payload.cawco.instanceId === ask.instanceId &&
          push.payload.aps.category === "CAWCO_PERMISSION_OPEN" &&
          madeIn(push.payload.cawco)
      ),
      pushes
        .map(
          ({ ask, push }) =>
            `${ask.payload.input.path}: ${push ? `"${push.payload.aps.alert?.title}" / "${push.payload.aps.alert?.subtitle}", project ${push.payload.cawco.projectId}, thread-id ${push.payload.aps["thread-id"]}, ${push.payload.aps.category}, opens ${push.payload.cawco.instanceId}, Caw thread ${push.payload.cawco.threadId ?? "none"}, origin ${push.payload.cawco.originInstanceId ?? "none"}` : "no push"}`
        )
        .join("; ")
    );
  };

  // ── The web dashboard ──────────────────────────────────────────────────
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  // The card in a composer (Prompt.svelte `.choice`).
  const card = ".ask";
  const approve = ".choice button:has-text('Approve'):not([disabled])";
  const at = (id: string) => `${base}/session/${id}`;
  const shownAt = () => decodeURIComponent(page.url());
  /** Every missing-session word the page shows, sampled from its first paint to its card. */
  const missingSeen: string[] = [];
  const sample = async () => {
    const said = await page.getByText(MISSING).count();
    if (said > 0) {
      missingSeen.push(`${said} at ${page.url()}`);
    }
  };
  /**
   * Opens a proposal's own id and clicks Approve on its card: where the tab
   * moved, whether the card was drawn there, and whether it left after.
   */
  const approveOnWeb = async (ask: Ask, to: string, label: string) => {
    try {
      await page.goto(at(ask.instanceId), { waitUntil: "domcontentloaded" });
      await sample();
      const moved = await until(
        `${label}: the tab moves`,
        async () => {
          await sample();
          return shownAt();
        },
        (url) => url.endsWith(`/session/${to}`),
        60_000
      ).catch(() => shownAt());
      const drawn = await until(
        `${label}: the card in the composer`,
        async () => {
          await sample();
          return page
            .locator(card)
            .getByText(ask.payload.input.path ?? "")
            .count();
        },
        (count) => count > 0,
        60_000
      ).catch(() => 0);
      await page.click(approve);
      await until(
        `${label}: the proposal answered`,
        proposals,
        (left) => !left.some((x) => x.requestId === ask.requestId),
        60_000
      ).catch(() => undefined);
      const gone = await until(
        `${label}: the card leaves`,
        () => page.locator(approve).count(),
        (count) => count === 0,
        20_000
      ).then(
        () => true,
        () => false
      );
      return {
        moved,
        drawn,
        gone,
        answered: !(await proposals()).some(
          (x) => x.requestId === ask.requestId
        ),
      };
    } catch (error) {
      const labels = await page
        .locator("button")
        .evaluateAll((every) =>
          every.map(
            (b) => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? ""
          )
        );
      await writeFile(join(kit.out, `${label}-buttons.txt`), labels.join("\n"));
      throw error;
    }
  };

  // ── (o) the curator's proposal, parked and answered on the web ─────────
  const curated = await until(
    "o: the curator's proposal parked",
    proposals,
    (found) => found.some((one) => one.requestId === curatedId),
    60_000
  ).then((found) => found.find((one) => one.requestId === curatedId));
  kit.check(
    "o: the curator's proposal is parked on machine hub under its own id, with no session row, made in its run's session",
    parkedAlone(curated) &&
      curated?.payload.originInstanceId === worker &&
      !curated.payload.threadId,
    `${curated?.instanceId} on ${curated?.machineId}, origin ${curated?.payload.originInstanceId ?? "none"}, thread ${curated?.payload.threadId ?? "none"}`
  );
  if (!curated) {
    return;
  }
  await checkPushes(
    "o",
    [curated],
    (cawco) => cawco.originInstanceId === worker && !cawco.threadId
  );
  // The person edits the file's head while the proposal waits: Approve
  // merges the two in the hub's temp dir (memory.ts `mergeThree`).
  await http("PUT", `/api/projects/${projectId}/folder/file`, {
    path: CURATED.path,
    content: CURATED.edited,
    message: "Hotfixes and patches",
  });
  const o = await approveOnWeb(curated, worker, "o");
  kit.check(
    "o: its own id opens the session it was made in, its card in the composer, nothing says the session is missing",
    o.moved.endsWith(`/session/${worker}`) &&
      o.drawn > 0 &&
      missingSeen.length === 0,
    `at ${o.moved}; card drawn ${o.drawn}; page: ${missingSeen.join(", ") || "never said it"}`
  );
  const curatedCommit = await newest(projectId, CURATED.path);
  const curatedNow = await wordsOf(projectId, CURATED.path);
  kit.check(
    "o: Approve there merges the proposal into the person's edit, commits it as the person, and the card leaves",
    o.answered &&
      curatedCommit?.author === "you" &&
      curatedCommit.message.startsWith(`${CURATED.path}: ${CURATED.why}`) &&
      curatedNow === CURATED.merged &&
      o.gone,
    `commit ${curatedCommit?.sha.slice(0, 9)} by ${curatedCommit?.author}: ${curatedCommit?.message.split("\n")[0]}; file ${JSON.stringify(curatedNow)}; card ${o.gone ? "gone" : "still on screen"}`
  );

  // ── Caw's write and his three proposals ────────────────────────────────
  const opened = JSON.parse(
    (
      await http("POST", `/api/projects/${projectId}/threads`, {
        body: `PROBE-PROPOSAL-ASK ${noteId}`,
      })
    ).text
  ) as { thread: { id: string } };
  const thread = opened.thread.id;
  const messages = async (): Promise<ThreadMessage[]> =>
    (
      JSON.parse(
        (await http("GET", `/api/projects/${projectId}/threads/${thread}`)).text
      ) as { messages: ThreadMessage[] }
    ).messages;
  const noted = (title: string) =>
    until(
      `the thread's note "${title}"`,
      messages,
      (all) => all.some((one) => one.noteTitle === title),
      30_000
    ).then(
      (all) => all.find((one) => one.noteTitle === title),
      () => undefined
    );
  const cawAsks = async () =>
    (await proposals()).filter((ask) => ask.payload.threadId === thread);
  const asks = await until(
    "Caw's three proposals parked",
    cawAsks,
    (found) => found.length === 3,
    240_000
  ).catch(async (error: unknown) => {
    const caw = fleet.seen.filter((one) => one.all.includes(CAW));
    const hubSaid = (await fleet.logs("hub"))
      .split("\n")
      .filter((line) => CAW_LINE.test(line))
      .slice(-25);
    throw new Error(
      [
        error instanceof Error ? error.message : String(error),
        `Parked: ${
          (await proposals())
            .map((ask) => `${ask.payload.input.path} (${ask.instanceId})`)
            .join(", ") || "none"
        }.`,
        `Caw's requests to the model: ${caw.length}; his last ended: ${caw.at(-1)?.last.slice(-600) ?? "(none)"}`,
        `The hub's lines of Caw and memory:\n${hubSaid.join("\n") || "(none)"}`,
      ].join("\n"),
      { cause: error }
    );
  });
  const cawAsk = (path: string) =>
    asks.find((ask) => ask.payload.input.path === path);
  const agents = cawAsk(FILES.agents.path);
  const cited = cawAsk(FILES.cited.path);
  const web = cawAsk(FILES.web.path);

  // ── (m) Caw's plain write ──────────────────────────────────────────────
  const plain = await newest(projectId, FILES.plain.path);
  const plainNote = await noted(`Caw wrote ${FILES.plain.path}`);
  kit.check(
    "m: Caw's memory_propose without ask commits as Caw at once, and his thread notes it",
    plain?.author === "Caw" &&
      plain.message.startsWith(`${FILES.plain.path}: ${FILES.plain.why}`) &&
      (await wordsOf(projectId, FILES.plain.path)) === WEB.written &&
      plainNote !== undefined,
    `commit ${plain?.sha.slice(0, 9)} by ${plain?.author}: ${plain?.message.split("\n")[0]}; note ${plainNote?.body ?? "none"}`
  );

  // ── (k) where each is parked ───────────────────────────────────────────
  kit.check(
    "k: Caw's three with ask are parked in his thread, each on machine hub under its own id, with no session row",
    [agents, cited, web].every(
      (ask) => parkedAlone(ask) && !ask?.payload.originInstanceId
    ),
    asks
      .map(
        (ask) =>
          `${ask.payload.input.path}: ${ask.instanceId} on ${ask.machineId}, thread ${ask.payload.threadId ?? "none"}, origin ${ask.payload.originInstanceId ?? "none"}`
      )
      .join("; ")
  );
  if (!(agents && cited && web)) {
    return;
  }

  // ── (p) the hub's push for each ────────────────────────────────────────
  await checkPushes(
    "p",
    [agents, cited, web],
    (cawco) => cawco.threadId === thread && !cawco.originInstanceId
  );

  // ── (w) the web: Caw's proposal, in his thread ─────────────────────────
  const served = await (await fetch(at(web.instanceId))).text();
  missingSeen.length = 0;
  const w = await approveOnWeb(web, `thread:${thread}`, "w");
  kit.check(
    "w: the proposal's own id opens Caw's thread, its card in the composer, nothing says the session is missing, first paint or after",
    w.moved.endsWith(`/session/thread:${thread}`) &&
      w.drawn > 0 &&
      !served.includes(MISSING) &&
      missingSeen.length === 0,
    `at ${w.moved}; card drawn ${w.drawn}; server HTML ${served.includes(MISSING) ? "says" : "does not say"} "${MISSING}"; page: ${missingSeen.join(", ") || "never said it"}`
  );
  const webCommit = await newest(projectId, WEB.path);
  const approvedNote = await noted(`You approved the change to ${WEB.path}`);
  kit.check(
    "w: Approve in the thread commits it as the person, the thread says so, and the card leaves",
    w.answered &&
      webCommit?.author === "you" &&
      webCommit.message.startsWith(`${WEB.path}: ${FILES.web.why}`) &&
      (await wordsOf(projectId, WEB.path)) === WEB.proposed &&
      approvedNote !== undefined &&
      w.gone,
    `commit ${webCommit?.sha.slice(0, 9)} by ${webCommit?.author}: ${webCommit?.message.split("\n")[0]}; note ${approvedNote?.body ?? "none"}; card ${w.gone ? "gone" : "still on screen"}`
  );

  // ── The app ────────────────────────────────────────────────────────────
  const app = appPath();
  if (!kit.check("the app is built", existsSync(app), app)) {
    await cawrier.stop(true);
    return;
  }
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
      const shownCard = await until(
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
      return { landed, card: shownCard, shown, alone, from };
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
        applied.message.startsWith(
          `${FILES.agents.path}: ${FILES.agents.why}`
        ) &&
        agentsNow.includes("The probe project ships a small service."),
      `commit ${applied?.sha.slice(0, 9)} by ${applied?.author}: ${applied?.message.split("\n")[0]}`
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
    await cawrier.stop(true);
  }
}

export default { name: "memory-proposal", run } satisfies Spec;
