/**
 * Caw does what his project needs from its own settings and memory, and asks
 * the person with a card, in his thread, when it is theirs to decide.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model), a stand-in Cawrier for pushes, a stand-in GitHub API, and an
 * `x-use` connection (a stdio MCP stub whose calls are logged) granted to no
 * project. Project A is a git checkout; project B a plain folder holding a
 * `.env` and a mode-700 `private/` folder. Caw is steered by his thread's
 * words, in order:
 *
 * (r) Caw's instructions say to ask with the card, never in text, and never
 *     to hand the person shell commands.
 * (0) Before any grant, Caw's action_propose on x-use is refused as the
 *     owner saw it: "Neither this session's delegate type nor its project
 *     lists the connection x-use."
 * (a) project_settings grant_connection applies at once: x-use lists A, the
 *     thread notes it, a session of A calls x-use's tool (the stub logs it),
 *     and Caw's action_propose on x-use is filed.
 * (b) link_repo and set_lands apply: A's remote and lands.
 * (c) Naming project B is refused, and B is unchanged.
 * (d) Caw's memory write commits as Caw, and the thread notes it.
 * (e) Asks in the thread, on the web: AskUserQuestion's card is in the
 *     thread's composer, the pick reaches Caw as the tool's result and he
 *     replies with it; project_settings with ask: true is an Approve/Deny
 *     card there (pushed "Project setting" under the project, opening the
 *     thread), applying only on Approve; a second, denied from elsewhere,
 *     changes nothing and the thread says declined; a memory proposal Caw
 *     asked about, answered from Caw's panel (the hub's answer command),
 *     commits as you and the thread shows it answered.
 * (f) create_repo on B is always the card: it names the repository, private,
 *     the files and size, and the .env and private/ as left out; Approve
 *     creates the repository through the stand-in with the connection's
 *     token, the pushed tree holds neither, B is linked, and the token is in
 *     neither B's place nor the agent's logs.
 *
 *   bun scripts/probe-kit/run.ts project-settings
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the steps are read in order, one after another.
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const CAW = "You are Caw, the lead of the project";
const RULE =
  "Never end a message with a question for them to answer in text. Never hand them shell commands or ask them for setup details in text";
const REFUSED =
  "Neither this session's delegate type nor its project lists the connection x-use.";
const TOKEN = "ghp_probeTokenThatMustStayInTheHub0000000000";
const OWNER = "probe-owner";
const PUBLISHED = "probe-published";
const QUESTION = "Which writer model should the writer type run?";
const PICK = "Opus for the writer";
const THREAD_IN_ALL = /\(thread ([0-9a-f-]{36})\)/g;
/** A publish card's size: "4 files, 0.0 MB". */
const SIZE_WORDS = /\d+ files?, \d+\.\d MB/;

const PS = "mcp__cawco__project_settings";
const MEMORY = "mcp__cawco__memory_propose";
const ACTION = "mcp__cawco__action_propose";
const REPLY = "mcp__cawco__thread_reply";
const ASK = "AskUserQuestion";
const CONN = "mcp__cawco__conn__x-use__get_account_health";

/** One call of a step: its tool and input, given the request (the thread's id is in the wake). */
interface Call {
  input: (request: Seen, thread: string) => object;
  name: string;
}

/** Caw's steps, by the word that starts each in his thread. */
const STEPS: Record<string, Call[]> = {
  "PROBE-0": [
    {
      name: ACTION,
      input: () => ({
        connection: "x-use",
        tool: "get_account_health",
        args: { account: "@probebrand" },
        reason: "Probe: is the brand account healthy.",
      }),
    },
  ],
  "PROBE-A": [
    {
      name: PS,
      input: () => ({
        changes: [{ kind: "grant_connection", connection: "x-use" }],
        reason: "The scheduled posts go out through x-use.",
      }),
    },
  ],
  "PROBE-A2": [
    {
      name: ACTION,
      input: () => ({
        connection: "x-use",
        tool: "get_account_health",
        args: { account: "@probebrand" },
        reason: "Probe: is the brand account healthy, now granted.",
      }),
    },
  ],
  "PROBE-B": [
    {
      name: PS,
      input: () => ({
        changes: [
          { kind: "link_repo", github: `${OWNER}/linked` },
          { kind: "set_lands", lands: "pr" },
        ],
        reason: "Website work lands as pull requests on its repository.",
      }),
    },
  ],
  "PROBE-C": [
    {
      name: PS,
      input: () => ({
        project: "Plain probe",
        changes: [{ kind: "set_lands", lands: "branch" }],
        reason: "Probe: another project's setting.",
      }),
    },
  ],
  "PROBE-D": [
    {
      name: MEMORY,
      input: () => ({
        path: "knowledge/voice.md",
        content: "# Voice\n\n- Short sentences, no hype.\n",
        why: "How the brand writes",
      }),
    },
  ],
  "PROBE-Q": [
    {
      name: ASK,
      input: () => ({
        questions: [
          {
            question: QUESTION,
            header: "Writer",
            multiSelect: false,
            options: [
              { label: PICK, description: "The writer type runs Opus." },
              {
                label: "Sonnet for the writer",
                description: "The writer type runs Sonnet.",
              },
            ],
          },
        ],
      }),
    },
    {
      name: REPLY,
      input: (request, thread) => ({
        thread,
        body: `PROBE-ACTED: ${request.all.includes(PICK) ? PICK : "no pick heard"}`,
      }),
    },
  ],
  "PROBE-E": [
    {
      name: PS,
      input: () => ({
        changes: [{ kind: "set_lands", lands: "branch" }],
        reason: "Work lands on its own branch while the site is young.",
        ask: true,
      }),
    },
  ],
  "PROBE-F": [
    {
      name: PS,
      input: () => ({
        changes: [{ kind: "set_lands", lands: "main" }],
        reason: "Probe: a change the person declines.",
        ask: true,
      }),
    },
  ],
  "PROBE-G": [
    {
      name: MEMORY,
      input: () => ({
        path: "knowledge/audience.md",
        content: "# Audience\n\n- Founders who ship.\n",
        why: "Who the site is for",
        ask: true,
      }),
    },
  ],
  "PROBE-H": [
    {
      name: PS,
      input: () => ({
        changes: [{ kind: "create_repo", name: PUBLISHED }],
        reason: "The site's source is published so its work lands as PRs.",
      }),
    },
  ],
};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** The last tool the conversation called, from the request's own messages. */
const lastTool = (request: Seen): string | undefined => {
  try {
    const body = JSON.parse(request.body) as {
      messages?: { content?: unknown; role?: string }[];
    };
    for (const message of [...(body.messages ?? [])].reverse()) {
      if (message.role === "assistant" && Array.isArray(message.content)) {
        const used = (message.content as { name?: string; type?: string }[])
          .filter((block) => block.type === "tool_use")
          .at(-1);
        if (used?.name) {
          return used.name;
        }
      }
    }
  } catch {
    // A body that is not JSON names no tool.
  }
  return undefined;
};

/** `value`, or a throw naming what was not there. */
const must = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) {
    throw new Error(`${what} never came`);
  }
  return value;
};

/** The next call of `calls` after the last one made this turn; ToolSearch first for a deferred tool. */
const next = (request: Seen, calls: Call[], thread: string): Reply => {
  const last = request.afterTool ? lastTool(request) : undefined;
  const done = last ? calls.findIndex((one) => one.name === last) : -1;
  const call = calls[done + 1];
  if (!call) {
    return text("ok");
  }
  if (request.toolNames.includes(call.name)) {
    return {
      everyMs: 5,
      words: [],
      tool: { name: call.name, input: call.input(request, thread) },
    };
  }
  return request.toolNames.includes("ToolSearch") && last !== "ToolSearch"
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${call.name}`, max_results: 1 },
        },
      }
    : text(`${call.name} is not offered`);
};

/**
 * The step this request's turn is on: the newest step word in the whole
 * conversation. After a tool call the request's `last` is the tool's
 * result, so the wake's words are read from `all`, which holds every one.
 */
const stepOf = (request: Seen): string | undefined => {
  let newest: { at: number; key: string } | undefined;
  for (const key of Object.keys(STEPS)) {
    const at = request.all.lastIndexOf(`${key}:`);
    if (at >= 0 && (!newest || at > newest.at)) {
      newest = { at, key };
    }
  }
  return newest?.key;
};

/** The thread the newest wake named. */
const threadOf = (request: Seen): string => {
  const all = [...request.all.matchAll(THREAD_IN_ALL)];
  return all.at(-1)?.[1] ?? "";
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (!request.all.includes(CAW) && request.all.includes("PROBE-CONN")) {
    return next(
      request,
      [{ name: CONN, input: () => ({ account: "@probebrand" }) }],
      ""
    );
  }
  if (!request.all.includes(CAW)) {
    return text("ok");
  }
  const marker = stepOf(request);
  if (!marker) {
    return text("ok");
  }
  return next(request, STEPS[marker] ?? [], threadOf(request));
};

/** The x-use stub: an MCP server on stdio, one read-only tool, each call logged. */
const STUB = `
const { appendFileSync } = require("node:fs");
const log = process.argv[2];
let buffer = "";
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (let at = buffer.indexOf("\\n"); at >= 0; at = buffer.indexOf("\\n")) {
    const line = buffer.slice(0, at);
    buffer = buffer.slice(at + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.method === "initialize") {
      send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "x-use-stub", version: "1" } } });
    } else if (m.method === "tools/list") {
      send({ jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "get_account_health", description: "An account's health.", inputSchema: { type: "object", properties: { account: { type: "string" } } }, annotations: { readOnlyHint: true } }] } });
    } else if (m.method === "tools/call") {
      appendFileSync(log, JSON.stringify(m.params) + "\\n");
      send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "PROBE-HEALTH ok" }] } });
    } else if (m.id !== undefined) {
      send({ jsonrpc: "2.0", id: m.id, result: {} });
    }
  }
});
`;

interface Pushed {
  payload: {
    aps: { alert?: { subtitle?: string; title: string } };
    cawco: { kind: string; requestId?: string; threadId?: string | null };
  };
}

interface Ask {
  instanceId: string;
  machineId: string;
  payload: {
    input: Record<string, unknown>;
    presentation: { detail?: string; summary: string };
    threadId?: string;
    toolName: string;
    toolUseId?: string;
  };
  requestId: string;
}

interface ThreadMessage {
  author: string;
  body?: string;
  noteTitle?: string;
}

async function run(kit: Kit): Promise<void> {
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
  // The stand-in GitHub: a repository made is a bare one in the sandbox.
  const github = join(fleet.sandbox, "github");
  await mkdir(github, { recursive: true });
  const created: { auth: string | null; name: string; private: boolean }[] = [];
  const githubApi = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/user/repos") {
        const body = (await request.json()) as {
          name: string;
          private: boolean;
        };
        created.push({
          auth: request.headers.get("authorization"),
          name: body.name,
          private: body.private,
        });
        if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) {
          return Response.json({ message: "Bad credentials" }, { status: 401 });
        }
        const bare = join(github, `${body.name}.git`);
        // GitHub's default branch is the first one pushed: the place's main.
        await Bun.$`git init -q --bare -b main ${bare}`.quiet();
        return Response.json(
          { full_name: `${OWNER}/${body.name}`, clone_url: bare },
          { status: 201 }
        );
      }
      return new Response(null, { status: 404 });
    },
  });
  fleet.env.CAWCO_CAWRIER_ORIGIN = `http://127.0.0.1:${cawrier.port}`;
  fleet.env.CAWCO_GITHUB_API = `http://127.0.0.1:${githubApi.port}`;
  try {
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
    const json = async <T>(path: string): Promise<T> =>
      JSON.parse((await http("GET", path)).text) as T;

    // ── the connections: x-use (the stub), and GitHub's ─────────────────────
    const stub = join(fleet.sandbox, "x-use-stub.cjs");
    const calls = join(fleet.sandbox, "x-use-calls.log");
    await writeFile(stub, STUB);
    await writeFile(calls, "");
    const madeConn = await http("POST", "/api/connections", {
      name: "x-use",
      service: "X",
      account: "@probebrand",
      transport: "stdio",
      command: process.execPath,
      args: [stub, calls],
      auth: "none",
    });
    await http("POST", "/api/connections", {
      name: "github-probe",
      service: "github",
      account: OWNER,
      transport: "http",
      url: `http://127.0.0.1:${githubApi.port}/mcp`,
      auth: "bearer",
    });
    await http("PUT", "/api/connections/github-probe/key", { key: TOKEN });
    const connection = async (name: string) =>
      (
        await json<{ connections: { name: string; projects: string[] }[] }>(
          "/api/connections"
        )
      ).connections.find((one) => one.name === name);
    kit.check(
      "setup: x-use made, granted to no project",
      madeConn.status === 200 &&
        (await connection("x-use"))?.projects.length === 0,
      madeConn.text.slice(0, 200)
    );

    // ── the projects: A a checkout, B a plain folder ────────────────────────
    await writeFile(
      join(fleet.home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    const src = join(fleet.sandbox, "site");
    await mkdir(src, { recursive: true });
    await Bun.$`git init -q -b main && echo site > README.md && git add -A && git commit -qm 'First commit'`
      .cwd(src)
      .env({ ...process.env, HOME: fleet.home })
      .quiet();
    const plain = join(fleet.sandbox, "plain");
    await mkdir(join(plain, "private"), { recursive: true });
    await writeFile(join(plain, "README.md"), "# Plain probe\n");
    await writeFile(join(plain, "index.html"), "<h1>Plain</h1>\n");
    await writeFile(
      join(plain, ".env"),
      "X_COOKIE=probe-cookie-value-that-stays-home\n"
    );
    await writeFile(join(plain, "private", "session.json"), "{}\n");
    await chmod(join(plain, "private"), 0o700);
    const make = async (name: string, cwd: string) => {
      const made = await fleet.api<{ id?: string; project?: { id: string } }>(
        "/api/projects",
        { name, machineId: MACHINE, cwd, caw: false }
      );
      return made.project?.id ?? made.id ?? "";
    };
    const projectA = await make("Site probe", src);
    const projectB = await make("Plain probe", plain);
    const project = async (id: string) =>
      (
        await json<{ id: string; lands: string; remote: string | null }[]>(
          "/api/projects"
        )
      ).find((one) => one.id === id);

    // ── Caw's thread, and his steps ──────────────────────────────────────────
    /** A thread opened with `body`, or the hub's refusal in its own words. */
    const openThread = async (projectId: string, body: string) => {
      const said = await http("POST", `/api/projects/${projectId}/threads`, {
        body,
      });
      if (said.status !== 200) {
        throw new Error(
          `The thread was refused (${said.status}): ${said.text}`
        );
      }
      return JSON.parse(said.text) as { thread: { id: string } };
    };
    const opened = await openThread(
      projectA,
      "PROBE-0: check the brand account."
    );
    const thread = opened.thread.id;
    const messages = async (
      projectId = projectA,
      threadId = thread
    ): Promise<ThreadMessage[]> =>
      (
        await json<{ messages: ThreadMessage[] }>(
          `/api/projects/${projectId}/threads/${threadId}`
        )
      ).messages;
    const say = (said: string, projectId = projectA, threadId = thread) =>
      http("POST", `/api/projects/${projectId}/threads/${threadId}/messages`, {
        body: said,
      });
    /** Caw's turn on `marker` ended: his last request answered with words. */
    const turnDone = (marker: string) =>
      until(
        `Caw's ${marker} turn`,
        () =>
          fleet.seen.findLast(
            (one) => one.all.includes(CAW) && stepOf(one) === marker
          ),
        (one) => one?.afterTool === true && lastTool(one) !== "ToolSearch",
        240_000
      ).then((one) => must(one, `Caw's ${marker} turn`));
    const resultOf = async (marker: string) => (await turnDone(marker)).all;

    // (r) his instructions
    await turnDone("PROBE-0");
    kit.check(
      "r: Caw's instructions say to ask with the card, never in text or shell commands",
      fleet.seen.some((one) => one.all.includes(CAW) && one.all.includes(RULE)),
      RULE
    );
    // (0) the owner's refusal, before any grant
    const before = await resultOf("PROBE-0");
    kit.check(
      "0: before the grant, action_propose on x-use is refused as the owner saw it",
      before.includes(REFUSED),
      before.includes(REFUSED) ? REFUSED : before.slice(-300)
    );

    // (a) grant_connection applies at once
    await say("PROBE-A: grant x-use.");
    await turnDone("PROBE-A");
    const granted = await until(
      "a: x-use lists project A",
      () => connection("x-use"),
      (one) => one?.projects.includes(projectA) === true,
      30_000
    ).catch(() => undefined);
    const noted = (title: string, projectId = projectA, threadId = thread) =>
      until(
        `the thread's note "${title}"`,
        () => messages(projectId, threadId),
        (all) => all.some((one) => one.noteTitle === title),
        30_000
      ).then(
        (all) => all.find((one) => one.noteTitle === title),
        () => undefined
      );
    const grantNote = await noted("Caw changed this project's settings");
    kit.check(
      "a: grant_connection applies at once, and the thread says what changed",
      granted !== undefined &&
        (grantNote?.body ?? "").includes(
          "Let this project's sessions use x-use (X as @probebrand)"
        ),
      `projects ${JSON.stringify(granted?.projects)}; note ${grantNote?.body ?? "none"}`
    );
    const worker = await fleet.spawn("claude", "Probe worker", src, {
      projectId: projectA,
    });
    await fleet.send(worker, "PROBE-CONN: read the brand account's health.");
    const logged = await until(
      "a: the stub logs the session's call",
      async () => (await readFile(calls, "utf8")).trim(),
      Boolean,
      180_000
    ).catch(() => "");
    kit.check(
      "a: a session of the project calls x-use's tool through the hub",
      logged.includes("get_account_health") && logged.includes("@probebrand"),
      logged || "the stub logged no call"
    );
    await say("PROBE-A2: check the brand account again.");
    const after = await resultOf("PROBE-A2");
    const actions = await json<{ actions: { connection: string }[] }>(
      `/api/actions?projectId=${projectA}`
    );
    kit.check(
      "a: after the grant, Caw's action_propose on x-use is filed, not refused",
      actions.actions.some((one) => one.connection === "x-use") &&
        !after.slice(after.lastIndexOf("PROBE-A2")).includes(REFUSED),
      `${actions.actions.length} action(s) filed`
    );

    // (b) link_repo and set_lands
    await say("PROBE-B: link the repository and land as PRs.");
    await turnDone("PROBE-B");
    const linked = await until(
      "b: A linked and landing as PRs",
      () => project(projectA),
      (one) =>
        one?.remote === `github.com/${OWNER}/linked` && one.lands === "pr",
      30_000
    ).catch(() => project(projectA));
    kit.check(
      "b: link_repo and set_lands apply",
      linked?.remote === `github.com/${OWNER}/linked` && linked.lands === "pr",
      `remote ${linked?.remote}, lands ${linked?.lands}`
    );

    // (c) another project
    await say("PROBE-C: set the plain project's landing.");
    const other = await resultOf("PROBE-C");
    const b = await project(projectB);
    kit.check(
      "c: naming another project is refused in one sentence, and it is unchanged",
      other.includes("Plain probe is not your project") && b?.lands === "main",
      `B lands ${b?.lands}`
    );

    // (d) a memory write commits as Caw
    await say("PROBE-D: note the brand voice.");
    await turnDone("PROBE-D");
    const history = await json<{
      commits: { author: string; message: string }[];
    }>(
      `/api/projects/${projectA}/folder/history?path=${encodeURIComponent("knowledge/voice.md")}`
    );
    const voiceNote = await noted("Caw wrote knowledge/voice.md");
    kit.check(
      "d: Caw's memory write commits as Caw, and the thread notes it",
      history.commits[0]?.author === "Caw" &&
        history.commits[0].message.startsWith(
          "knowledge/voice.md: How the brand writes"
        ) &&
        voiceNote !== undefined,
      `commit by ${history.commits[0]?.author}: ${history.commits[0]?.message}; note ${voiceNote?.body ?? "none"}`
    );

    // (e) asks in the thread, on the web
    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    const card = ".ask";
    const approve = ".choice button:has-text('Approve'):not([disabled])";
    const pending = () => fleet.api<Ask[]>("/api/pending");
    const askOf = (tool: string) =>
      until(
        `an ask of ${tool} parked`,
        async () =>
          (await pending()).find((one) => one.payload.toolName === tool),
        Boolean,
        240_000
      ).then((one) => must(one, `an ask of ${tool}`));
    await page.goto(`${base}/session/thread:${thread}`, {
      waitUntil: "domcontentloaded",
    });

    // His question, with options
    await say("PROBE-Q: the writer model needs your call.");
    const question = await askOf(ASK);
    await until(
      "e: the question's card in the thread",
      () => page.locator(card).getByText(QUESTION).count(),
      (count) => count > 0,
      60_000
    );
    kit.check(
      "e: Caw's question is parked in his thread and drawn in its composer",
      question.payload.threadId === thread,
      `thread ${question.payload.threadId}`
    );
    await page.locator(`${card} .kit-chip:has-text('${PICK}')`).click();
    await page.locator(`${card} .qact button:has-text('Answer')`).click();
    const acted = await until(
      "e: Caw acts on the pick",
      () => messages(),
      (all) =>
        all.some(
          (one) =>
            one.author === "caw" && (one.body ?? "").includes("PROBE-ACTED")
        ),
      120_000
    ).then(
      (all) =>
        all.find((one) => (one.body ?? "").includes("PROBE-ACTED"))?.body,
      () => undefined
    );
    kit.check(
      "e: the pick reaches Caw as the tool's result, and he acts on it",
      acted === `PROBE-ACTED: ${PICK}`,
      acted ?? "no reply"
    );

    // project_settings with ask: true, approved on the web
    await say("PROBE-E: ask me before landing on a branch.");
    const setting = await askOf(PS);
    const pushOf = (requestId: string) =>
      until(
        "its push",
        () =>
          pushed.find(
            (one) =>
              one.payload.cawco.kind === "ask" &&
              one.payload.cawco.requestId === requestId
          ),
        Boolean,
        30_000
      ).catch(() => undefined);
    const settingPush = await pushOf(setting.requestId);
    kit.check(
      'e: the project-setting ask is parked in the thread at its call, and pushed as "Project setting" under the project, opening the thread',
      setting.payload.threadId === thread &&
        typeof setting.payload.toolUseId === "string" &&
        settingPush?.payload.aps.alert?.title === "Project setting" &&
        settingPush.payload.aps.alert.subtitle === "Site probe" &&
        settingPush.payload.cawco.threadId === thread,
      `thread ${setting.payload.threadId}, call ${setting.payload.toolUseId}, push "${settingPush?.payload.aps.alert?.title}" / "${settingPush?.payload.aps.alert?.subtitle}" opening ${settingPush?.payload.cawco.threadId}`
    );
    await until(
      "e: the setting's card in the thread",
      () =>
        page
          .locator(card)
          .getByText("Land this project's work on a branch of its own")
          .count(),
      (count) => count > 0,
      60_000
    );
    kit.check(
      "e: nothing applies before the answer",
      (await project(projectA))?.lands === "pr"
    );
    await page.click(approve);
    const approved = await noted("You approved a project setting");
    const landsNow = (await project(projectA))?.lands;
    const settingResult = await resultOf("PROBE-E");
    kit.check(
      "e: Approve in the thread applies it, the thread says so, and Caw hears it",
      landsNow === "branch" &&
        approved !== undefined &&
        settingResult.includes("The person approved it, and it applied"),
      `lands ${landsNow}; note ${approved?.body ?? "none"}`
    );

    // A second, denied from elsewhere (the hub's answer command)
    await say("PROBE-F: ask me before landing on main.");
    const declined = await askOf(PS);
    await fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "permission.answer",
      machineId: declined.machineId,
      sessionId: declined.instanceId,
      // As the dashboard's answer goes (client.svelte.ts `wirePayload`).
      payload: {
        requestId: declined.requestId,
        args: [declined.requestId, { behavior: "deny", message: "Not yet." }],
      },
    });
    const declinedNote = await noted("You declined a project setting");
    const deniedResult = await resultOf("PROBE-F");
    const cardGone = await until(
      "e: the declined card leaves the thread",
      () => page.locator(approve).count(),
      (count) => count === 0,
      30_000
    ).then(
      () => true,
      () => false
    );
    kit.check(
      "e: Deny changes nothing, the thread says declined, Caw hears it, and the card leaves the web thread",
      (await project(projectA))?.lands === "branch" &&
        declinedNote !== undefined &&
        deniedResult.includes(
          "The person declined this project-settings change"
        ) &&
        cardGone,
      `note ${declinedNote?.body ?? "none"}`
    );

    // A memory proposal Caw asked about, answered from Caw's panel
    await say("PROBE-G: ask me before writing the audience.");
    const proposal = await askOf(MEMORY);
    const proposalPush = await pushOf(proposal.requestId);
    await until(
      "e: the proposal's card in the thread",
      () => page.locator(card).getByText("knowledge/audience.md").count(),
      (count) => count > 0,
      60_000
    ).catch(() => 0);
    const drawn = await page
      .locator(card)
      .getByText("knowledge/audience.md")
      .count();
    kit.check(
      "e: the memory proposal is parked in Caw's thread, drawn there, and its push opens the thread",
      proposal.payload.threadId === thread &&
        drawn > 0 &&
        proposalPush?.payload.aps.alert?.title === "Memory proposal" &&
        proposalPush.payload.cawco.threadId === thread,
      `thread ${proposal.payload.threadId}; drawn ${drawn}; push opens ${proposalPush?.payload.cawco.threadId}`
    );
    await fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "permission.answer",
      machineId: proposal.machineId,
      sessionId: proposal.instanceId,
      payload: {
        requestId: proposal.requestId,
        args: [
          proposal.requestId,
          { behavior: "allow", updatedInput: proposal.payload.input },
        ],
      },
    });
    const answeredNote = await noted(
      "You approved the change to knowledge/audience.md"
    );
    const audience = await json<{
      commits: { author: string }[];
    }>(
      `/api/projects/${projectA}/folder/history?path=${encodeURIComponent("knowledge/audience.md")}`
    );
    await until(
      "e: the thread's row of the answer, on the web",
      () =>
        page
          .getByText("You approved the change to knowledge/audience.md")
          .count(),
      (count) => count > 0,
      30_000
    ).catch(() => 0);
    kit.check(
      "e: answered from Caw's panel, it commits as you and the web thread shows it answered",
      audience.commits[0]?.author === "you" &&
        answeredNote !== undefined &&
        (await page
          .getByText("You approved the change to knowledge/audience.md")
          .count()) > 0 &&
        (await page.locator(approve).count()) === 0,
      `commit by ${audience.commits[0]?.author}; note ${answeredNote?.body ?? "none"}`
    );

    // (f) create_repo on B, behind the card
    const threadB = await openThread(
      projectB,
      "PROBE-H: publish the site's source."
    );
    const publish = await until(
      "f: the publish's ask",
      async () =>
        (await pending()).find(
          (one) =>
            one.payload.toolName === PS &&
            one.payload.threadId === threadB.thread.id
        ),
      Boolean,
      240_000
    ).then((one) => must(one, "the publish's ask"));
    const words = `${publish.payload.presentation.summary} — ${publish.payload.presentation.detail ?? ""}`;
    kit.check(
      "f: create_repo is always the card: the repository, private, files, size, and .env and private/ left out",
      publish.payload.presentation.summary ===
        `Publish this project to a private GitHub repository, ${OWNER}/${PUBLISHED}` &&
        SIZE_WORDS.test(publish.payload.presentation.detail ?? "") &&
        (publish.payload.presentation.detail ?? "").includes(".env (") &&
        (publish.payload.presentation.detail ?? "").includes("private/ ("),
      words
    );
    await page.goto(`${base}/session/thread:${threadB.thread.id}`, {
      waitUntil: "domcontentloaded",
    });
    await until(
      "f: the publish's card in B's thread",
      () => page.locator(approve).count(),
      (count) => count > 0,
      60_000
    );
    await page.click(approve);
    const linkedB = await until(
      "f: B linked",
      () => project(projectB),
      (one) => one?.remote === `github.com/${OWNER}/${PUBLISHED}`,
      180_000
    ).catch(() => project(projectB));
    const bare = join(github, `${PUBLISHED}.git`);
    const tree = (
      await Bun.$`git -C ${bare} ls-tree -r --name-only HEAD`.nothrow().quiet()
    )
      .text()
      .split("\n")
      .filter(Boolean);
    kit.check(
      "f: Approve creates the private repository with the connection's token, pushes the place without .env or private/, and links B",
      created.length === 1 &&
        created[0]?.private === true &&
        created[0].auth === `Bearer ${TOKEN}` &&
        tree.includes("README.md") &&
        tree.includes("index.html") &&
        !tree.some((path) => path === ".env" || path.startsWith("private/")) &&
        linkedB?.remote === `github.com/${OWNER}/${PUBLISHED}`,
      `made ${JSON.stringify(created.map(({ name, private: closed }) => ({ name, private: closed })))}; tree ${tree.join(", ")}; B remote ${linkedB?.remote}`
    );
    const placeConfig = await readFile(join(plain, ".git", "config"), "utf8");
    const agentLogs = await fleet.logs("agent");
    kit.check(
      "f: the token stays in the hub: not in B's place, not in the agent's logs",
      !(placeConfig.includes(TOKEN) || agentLogs.includes(TOKEN)),
      "searched .git/config and the agent's log"
    );
    const published = await noted(
      "You approved a project setting",
      projectB,
      threadB.thread.id
    );
    kit.check(
      "f: B's thread says what was published and what was left out",
      (published?.body ?? "").includes(
        `Link this project to github.com/${OWNER}/${PUBLISHED}`
      ) && (published?.body ?? "").includes(".env ("),
      published?.body ?? "no note"
    );
  } finally {
    // What a reviewer reads after a failure: every request the mock answered, and the hub's log.
    await writeFile(
      join(kit.out, "seen.txt"),
      fleet.seen
        .map(
          (one) =>
            `${new Date(one.at).toISOString()} tools=${one.tools} afterTool=${one.afterTool} lastTool=${lastTool(one) ?? "-"} caw=${one.all.includes(CAW)} offered=${one.toolNames.length}\n  last: ${one.last.slice(0, 300).replaceAll("\n", " ")}`
        )
        .join("\n")
    );
    // The fleet's sandbox may already be gone (it goes with a failed run).
    await writeFile(
      join(kit.out, "hub.log"),
      await fleet.logs("hub").catch((error: Error) => error.message)
    );
    await cawrier.stop(true);
    await githubApi.stop(true);
  }
}

export default { name: "project-settings", run } satisfies Spec;
