#!/usr/bin/env bun
/**
 * Restore probe: a session whose turn was running when its process died is
 * back mid-turn once the hub restores it, handed that turn back exactly once.
 *
 *   bun scripts/probe-restore-turn.ts [--harness claude|opencode|pi]...
 *
 * A scratch hub, agent and sessiond run as their own processes with a temp
 * HOME, on loopback, against a local mock model endpoint that streams a slow
 * reply. Fake keys only; nothing here reaches a real provider or this
 * machine's services. Each process is stopped by the PID it was started
 * under, never by pattern.
 *
 *   A. Each harness's session is sent a turn; while the mock streams it, the
 *      agent is stopped and sessiond's process tree killed (what systemd's
 *      control-group stop does), then both start again. The session must be
 *      handed back its turn once: the mock sees one new request carrying the
 *      hand-back, and the hub holds one hand-back send.
 *   B. The hub is killed (SIGKILL) and started again: no second hand-back.
 *   C. (claude) Two delegates asleep on a cut turn from before the hub kept
 *      the turn it cut, past the restore's horizon: one whose workspace is
 *      there is woken to carry on, once; one whose workspace is gone fails,
 *      and its parent is told.
 *
 * Prints `restore probe: <harness> continued once; no repeat after hub
 * restart` per harness that passed, and exits 0 only if every one did.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CLAUDE_JSON_NAME } from "../packages/core/src/claude-dirs";

type Harness = "claude" | "opencode" | "pi";
const ALL: Harness[] = ["claude", "opencode", "pi"];
const root = resolve(import.meta.dir, "..");
const MACHINE = "restore-probe";
const HAND_BACK =
  /CawCo restarted this session's process|A restart cut your turn/;

const wanted = (() => {
  const named: Harness[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--harness") {
      named.push(argv[i + 1] as Harness);
      i += 1;
    }
  }
  return named.length ? named : ALL;
})();

const delay = (ms: number) => Bun.sleep(ms);
async function until<T>(
  label: string,
  read: () => T | Promise<T>,
  accept: (value: T) => boolean,
  ms = 120_000
): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each look follows the scratch services' last state
    const value = await Promise.resolve(read()).catch(() => undefined as T);
    if (value !== undefined && accept(value)) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error(`${label}: not within ${ms / 1000}s`);
    }
    await delay(500);
  }
}

// ── The sandbox ─────────────────────────────────────────────────────────
// On real disk, not /tmp: a delegate's workspace boundary mounts paths from
// its home, and a /tmp private to whatever runs this is not one it sees.
const sandbox = join(
  process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? "/tmp", ".cache"),
  `restore-probe-${crypto.randomUUID().slice(0, 8)}`
);
const home = join(sandbox, "home");
// In a folder of its own: a workspace boundary hides the database's folder.
const dbPath = join(sandbox, "hub", "hub.db");
const sessiondSocket = join(sandbox, "sessiond.sock");
await mkdir(join(home, ".config", "cawco"), { recursive: true });
await mkdir(join(sandbox, "hub"), { recursive: true });

const freePort = async (): Promise<number> => {
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};
const hubPort = await freePort();
const previewPort = await freePort();
const mcpPort = await freePort();
const base = `http://127.0.0.1:${hubPort}`;

// ── The mock model endpoint ─────────────────────────────────────────────
/** One request the mock answered: which probe session's, and what it was. */
interface Seen {
  at: number;
  handBack: boolean;
  slow: boolean;
  tag: string | undefined;
  tools: boolean;
}
const seen: Seen[] = [];
const TAG = /SLOW-PROBE ([\w-]+)/;
const textOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part: { text?: string; content?: unknown }) =>
      typeof part.text === "string" ? part.text : textOf(part.content)
    )
    .join(" ");
};
const encoder = new TextEncoder();
/** An SSE stream of `events`, one every `everyMs`, cancelled when the client goes. */
const sseStream = (events: string[], everyMs: number) => {
  let timer: ReturnType<typeof setInterval> | undefined;
  return new Response(
    new ReadableStream({
      start(controller) {
        let at = 0;
        const next = () => {
          if (at >= events.length) {
            clearInterval(timer);
            controller.close();
            return;
          }
          try {
            controller.enqueue(encoder.encode(events[at]));
          } catch {
            clearInterval(timer);
          }
          at += 1;
        };
        next();
        timer = setInterval(next, everyMs);
      },
      cancel() {
        clearInterval(timer);
      },
    }),
    { headers: { "content-type": "text/event-stream" } }
  );
};
const SLOW_WORDS = Array.from({ length: 240 }, (_, i) => `word${i} `);
const anthropicEvents = (words: string[]): string[] => {
  const ev = (type: string, data: object) =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  return [
    ev("message_start", {
      message: {
        id: `msg_${crypto.randomUUID()}`,
        type: "message",
        role: "assistant",
        model: "claude-probe",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    }),
    ev("content_block_start", {
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    ...words.map((text) =>
      ev("content_block_delta", {
        index: 0,
        delta: { type: "text_delta", text },
      })
    ),
    ev("content_block_stop", { index: 0 }),
    ev("message_delta", {
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: words.length },
    }),
    ev("message_stop", {}),
  ];
};
const chatEvents = (words: string[]): string[] => {
  const chunk = (delta: object, finish: string | null) =>
    `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 0, model: "mock", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  return [
    chunk({ role: "assistant", content: "" }, null),
    ...words.map((content) => chunk({ content }, null)),
    chunk({}, "stop"),
    `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 0, model: "mock", choices: [], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })}\n\n`,
    "data: [DONE]\n\n",
  ];
};
const mock = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method !== "POST") {
      return Response.json({ data: [] });
    }
    const body = (await request.json().catch(() => ({}))) as {
      messages?: { role: string; content: unknown }[];
      stream?: boolean;
      tools?: unknown[];
    };
    if (path.endsWith("/count_tokens")) {
      return Response.json({ input_tokens: 100 });
    }
    const users = (body.messages ?? []).filter((one) => one.role === "user");
    const all = users.map((one) => textOf(one.content)).join("\n");
    const last = textOf(users.at(-1)?.content);
    const tools = (body.tools?.length ?? 0) > 0;
    const handBack = HAND_BACK.test(last);
    const slow = tools && !handBack && TAG.test(last);
    seen.push({
      at: Date.now(),
      handBack,
      slow,
      tag: all.match(TAG)?.[1],
      tools,
    });
    const words = slow
      ? SLOW_WORDS
      : [handBack ? "probe-continued" : "probe-ok"];
    const chat = path.endsWith("/chat/completions");
    if (body.stream === false && !chat) {
      return Response.json({
        id: `msg_${crypto.randomUUID()}`,
        type: "message",
        role: "assistant",
        model: "claude-probe",
        content: [{ type: "text", text: words.join("") }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 2 },
      });
    }
    return sseStream(
      chat ? chatEvents(words) : anthropicEvents(words),
      slow ? 1000 : 5
    );
  },
});
const mockBase = `http://127.0.0.1:${mock.port}`;

// ── The harnesses' config, pointed at the mock ──────────────────────────
// A Claude account dir signed in with a fake login: Claude Code reports it
// signed in as the probe's identity and sends the fake token to the mock.
const ACCOUNT = "acct-restore-probe";
const accountDir = join(home, ".cawco", "accounts", ACCOUNT, "claude");
await mkdir(accountDir, { recursive: true });
await writeFile(
  join(accountDir, ".credentials.json"),
  JSON.stringify({
    claudeAiOauth: {
      accessToken: "sk-ant-oat01-fake-restore-probe",
      refreshToken: "sk-ant-ort01-fake-restore-probe",
      expiresAt: Date.now() + 365 * 24 * 60 * 60_000,
      scopes: ["user:inference", "user:profile"],
      subscriptionType: "max",
    },
  })
);
await writeFile(
  join(accountDir, CLAUDE_JSON_NAME),
  JSON.stringify({
    hasCompletedOnboarding: true,
    oauthAccount: {
      emailAddress: "probe@restore-probe.test",
      organizationName: "Restore Probe",
      accountUuid: "00000000-0000-4000-8000-000000000001",
      organizationUuid: "00000000-0000-4000-8000-000000000002",
    },
  })
);
await writeFile(
  join(home, ".config", "cawco", "config.json"),
  JSON.stringify({ hubUrl: base })
);
const mockModel = (name: string) => ({
  name,
  tool_call: true,
  limit: { context: 100_000, output: 4000 },
});
await mkdir(join(home, ".config", "opencode"), { recursive: true });
await writeFile(
  join(home, ".config", "opencode", "opencode.json"),
  JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    autoupdate: false,
    share: "disabled",
    model: "mockoc/mock-oc",
    small_model: "mockoc/mock-oc",
    provider: {
      mockoc: {
        name: "Mock",
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL: `${mockBase}/v1`, apiKey: "fake-opencode-key" },
        models: { "mock-oc": mockModel("Mock OC") },
      },
    },
  })
);
await mkdir(join(home, ".pi", "agent"), { recursive: true });
await writeFile(
  join(home, ".pi", "agent", "models.json"),
  JSON.stringify({
    providers: {
      mockpi: {
        baseUrl: `${mockBase}/v1`,
        api: "openai-completions",
        apiKey: "fake-pi-key",
        models: [
          {
            id: "mock-pi",
            name: "Mock PI",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 100_000,
            maxTokens: 4000,
          },
        ],
      },
    },
  })
);
const MODEL: Record<Harness, string> = {
  claude: "claude-haiku-4-5",
  opencode: "mockoc/mock-oc",
  pi: "mockpi/mock-pi",
};

// A repository with a remote, for the delegates of phase C.
const origin = join(sandbox, "origin.git");
const repo = join(sandbox, "repo");
await Bun.$`git init -q --bare ${origin} && git clone -q ${origin} ${repo} 2>/dev/null && git -C ${repo} -c user.email=p@p -c user.name=p commit -q --allow-empty -m init && git -C ${repo} push -q origin HEAD`.quiet();
const workdir = join(sandbox, "work");
await mkdir(workdir, { recursive: true });

// ── The scratch services ────────────────────────────────────────────────
const env: Record<string, string> = {
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  HOME: home,
  USER: process.env.USER ?? "probe",
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_CACHE_HOME: join(home, ".cache"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  CAWCO_DB_PATH: dbPath,
  CAWCO_HUB_PORT: String(hubPort),
  CAWCO_PREVIEW_PORT: String(previewPort),
  CAWCO_MCP_PORT: String(mcpPort),
  HOST: "127.0.0.1",
  CAWCO_HUB_URL: `ws://127.0.0.1:${hubPort}/ws`,
  CAWCO_NO_MDNS: "1",
  CAWCO_MACHINE_ID: MACHINE,
  CAWCO_SESSIOND_ENDPOINT: sessiondSocket,
  ANTHROPIC_BASE_URL: mockBase,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  DISABLE_AUTOUPDATER: "1",
  OPENCODE_DISABLE_MODELS_FETCH: "1",
};
const ENTRY = {
  hub: "packages/hub/src/index.ts",
  agent: "packages/agent/src/cli.ts",
  sessiond: "packages/sessiond/src/main.ts",
} as const;
type Role = keyof typeof ENTRY;
const procs: Partial<Record<Role, ReturnType<typeof Bun.spawn>>> = {};
let launches = 0;
const launch = (role: Role) => {
  launches += 1;
  const child = Bun.spawn([process.execPath, ENTRY[role]], {
    cwd: root,
    env,
    stdout: Bun.file(join(sandbox, `${role}-${launches}.log`)),
    stderr: Bun.file(join(sandbox, `${role}-${launches}.err`)),
  });
  procs[role] = child;
  console.log(`… ${role} started, pid ${child.pid}`);
  return child;
};
const exited = (child: ReturnType<typeof Bun.spawn>, ms: number) =>
  Promise.race([child.exited.then(() => true), delay(ms).then(() => false)]);
const stop = async (role: Role, signal: "SIGTERM" | "SIGKILL" = "SIGTERM") => {
  const child = procs[role];
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill(signal);
  if (!(await exited(child, 10_000))) {
    child.kill("SIGKILL");
    await child.exited;
  }
  console.log(`… ${role} (pid ${child.pid}) stopped with ${signal}`);
};
/** Every descendant of `pid`, read from /proc. */
const descendants = async (pid: number): Promise<number[]> => {
  const children = new Map<number, number[]>();
  for (const entry of await readdir("/proc")) {
    const id = Number(entry);
    if (!Number.isInteger(id)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one /proc entry at a time
    const stat = await Bun.file(`/proc/${id}/stat`)
      .text()
      .catch(() => "");
    const parent = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    children.set(parent, [...(children.get(parent) ?? []), id]);
  }
  const out: number[] = [];
  const walk = (at: number) => {
    for (const child of children.get(at) ?? []) {
      out.push(child);
      walk(child);
    }
  };
  walk(pid);
  return out;
};
/** sessiond and every process under it, as a control-group stop ends them. */
const killSessiond = async () => {
  const child = procs.sessiond;
  if (!child) {
    return;
  }
  const tree = [child.pid, ...(await descendants(child.pid))];
  for (const pid of tree) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // gone already
    }
  }
  await delay(3000);
  for (const pid of tree) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // gone already
    }
  }
  await child.exited;
  console.log(
    `… sessiond (pid ${child.pid}) and its ${tree.length - 1} children killed`
  );
};

const api = async <T>(path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path}: ${response.status} ${text}`);
  }
  return JSON.parse(text) as T;
};
let socket: WebSocket | undefined;
const dashboard = async (): Promise<WebSocket> => {
  if (socket?.readyState === WebSocket.OPEN) {
    return socket;
  }
  const next = new WebSocket(`ws://127.0.0.1:${hubPort}/ws/dashboard`);
  await new Promise<void>((done, fail) => {
    next.onopen = () => done();
    next.onerror = () => fail(new Error("the dashboard socket did not open"));
  });
  socket = next;
  return next;
};
const post = async (message: object) =>
  (await dashboard()).send(JSON.stringify(message));
const query = <T>(sql: string, ...params: (string | number)[]): T[] => {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.query(sql).all(...params) as T[];
  } finally {
    db.close();
  }
};
const write = (sql: string, ...params: (string | number | null)[]) => {
  const db = new Database(dbPath);
  try {
    db.query(sql).run(...params);
  } finally {
    db.close();
  }
};

const hubUp = async () => {
  await until(
    "the hub answering",
    () => fetch(`${base}/health`).then((r) => r.ok),
    Boolean,
    90_000
  );
  socket = undefined;
};
const agentUp = () =>
  until(
    "the agent online with custody",
    () =>
      api<{ machineId: string; status: string; custody?: { state: string } }[]>(
        "/api/agents"
      ),
    (rows) =>
      rows.some(
        (row) =>
          row.machineId === MACHINE &&
          row.status === "online" &&
          row.custody?.state === "available"
      ),
    120_000
  );
const sessiondUp = () =>
  until(
    "sessiond listening",
    () => existsSync(sessiondSocket),
    Boolean,
    30_000
  );
const instance = (id: string) =>
  query<{
    status: string;
    turn_open_at: number | null;
    spawned_at: number | null;
    updated_at: number;
  }>(
    "SELECT status, turn_open_at, spawned_at, updated_at FROM instances WHERE id = ?",
    id
  )[0];
const handBacksStored = (id: string) =>
  query<{ n: number }>(
    "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND (body LIKE '%CawCo restarted this session%' OR body LIKE '%A restart cut your turn%')",
    id
  )[0]?.n ?? 0;
const handBacksSeen = (tag: string) =>
  seen.filter((one) => one.handBack && one.tools && one.tag === tag).length;

const spawn = async (
  harness: Harness,
  title: string,
  cwd = workdir
): Promise<string> => {
  const instanceId = crypto.randomUUID();
  await post({
    verb: "spawn",
    machineId: MACHINE,
    instanceId,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId,
      cwd,
      harness,
      model: MODEL[harness],
      title,
      ...(harness === "pi" ? {} : { permissionMode: "bypassPermissions" }),
    },
  });
  await until(
    `${harness} session running`,
    () => instance(instanceId),
    (row) => row?.status === "running",
    180_000
  );
  return instanceId;
};
const send = (instanceId: string, text: string) =>
  post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "send",
    machineId: MACHINE,
    sessionId: instanceId,
    payload: {
      instanceId,
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: text },
        parent_tool_use_id: null,
        origin: { kind: "human" },
      },
    },
  });

const results: { harness: string; ok: boolean; detail: string }[] = [];
const check = (harness: string, ok: boolean, detail: unknown) => {
  results.push({ harness, ok, detail: JSON.stringify(detail) });
  console.log(`${ok ? "PASS" : "FAIL"} ${harness}: ${JSON.stringify(detail)}`);
};

try {
  launch("sessiond");
  await sessiondUp();
  launch("hub");
  await hubUp();
  // The probe's Claude account: a console account the fake key signs in.
  write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Probe', 'blue', 0, 0, ?)",
    ACCOUNT,
    Date.now()
  );
  launch("agent");
  await agentUp();
  if (wanted.includes("claude")) {
    await until(
      "the probe's Claude account signed in",
      () =>
        query<{ state: string }>(
          "SELECT state FROM account_signins WHERE account_id = ?",
          ACCOUNT
        )[0],
      (row) => row?.state === "signed-in",
      120_000
    );
  }

  // ── A. Cut mid-turn by a sessiond and agent stop ──────────────────────
  const sessions = new Map<Harness, string>();
  for (const harness of wanted) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one session up at a time
      const id = await spawn(harness, `Restore probe ${harness}`);
      sessions.set(harness, id);
      await send(id, `SLOW-PROBE ${harness}: count slowly.`);
      await until(
        `${harness} turn streaming`,
        () => seen.some((one) => one.slow && one.tag === harness),
        Boolean,
        180_000
      );
      await until(
        `${harness} turn written down`,
        () => instance(id),
        (row) => row?.turn_open_at !== null,
        30_000
      );
      console.log(
        `… ${harness} ${id} mid-turn: ${JSON.stringify(instance(id))}`
      );
    } catch (error) {
      sessions.delete(harness);
      check(harness, false, { phase: "reach", error: String(error) });
    }
  }
  await delay(3000);
  await stop("agent");
  await killSessiond();
  launch("sessiond");
  await sessiondUp();
  launch("agent");
  await agentUp();
  for (const [harness, id] of sessions) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: each harness's hand-back is waited for in turn
      await until(
        `${harness} handed back its turn`,
        () => handBacksSeen(harness),
        (n) => n >= 1,
        240_000
      );
    } catch (error) {
      check(harness, false, {
        phase: "hand-back",
        error: String(error),
        row: instance(id),
        stored: handBacksStored(id),
      });
      sessions.delete(harness);
    }
  }
  await delay(20_000);
  const afterRestore = new Map<Harness, { seen: number; stored: number }>();
  for (const [harness, id] of sessions) {
    afterRestore.set(harness, {
      seen: handBacksSeen(harness),
      stored: handBacksStored(id),
    });
  }

  // ── B. The hub killed and started again ──────────────────────────────
  await stop("hub", "SIGKILL");
  launch("hub");
  await hubUp();
  await agentUp();
  // Three heartbeats and a register's restores: room for any repeat.
  await delay(50_000);
  for (const [harness, id] of sessions) {
    const before = afterRestore.get(harness);
    const now = { seen: handBacksSeen(harness), stored: handBacksStored(id) };
    const ok =
      before?.seen === 1 &&
      before.stored === 1 &&
      now.seen === 1 &&
      now.stored === 1;
    check(harness, ok, {
      afterRestore: before,
      afterHubRestart: now,
      row: instance(id),
    });
    if (ok) {
      console.log(
        `restore probe: ${harness} continued once; no repeat after hub restart`
      );
    }
  }

  // ── C. Delegates asleep on a cut turn, past the horizon ──────────────
  if (wanted.includes("claude")) {
    await phaseC();
  }
} catch (error) {
  check("probe", false, {
    error: error instanceof Error ? error.stack : String(error),
  });
} finally {
  socket?.close();
  await stop("agent");
  await stop("hub");
  await killSessiond();
  await mock.stop(true);
}

async function phaseC(): Promise<void> {
  const parent = await spawn("claude", "Restore probe parent", repo);
  // A parent with a conversation of its own, as every delegating session has.
  const answered = seen.length;
  await send(parent, "Say hello.");
  await until(
    "the parent's first turn",
    () => seen.length,
    (n) => n > answered,
    120_000
  );
  await delay(5000);
  const items: {
    name: string;
    workItemId: string;
    instanceId: string;
    workspaceId: string;
  }[] = [];
  for (const name of ["item-wake", "item-gone", "item-open"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one delegate at a time
    const started = await api<{ workItemId: string; instanceId: string }>(
      "/api/work-items",
      {
        parentInstanceId: parent,
        title: `Restore probe ${name}`,
        prompt: `SLOW-PROBE ${name}: count slowly.`,
        harness: "claude",
        model: MODEL.claude,
        cwd: repo,
        checks: [{ name: "Probe check", command: "true" }],
      }
    );
    await until(
      `${name} streaming`,
      () => seen.some((one) => one.slow && one.tag === name),
      Boolean,
      180_000
    );
    const [item] = query<{ workspace_id: string }>(
      "SELECT workspace_id FROM work_items WHERE id = ?",
      started.workItemId
    );
    items.push({ name, ...started, workspaceId: item?.workspace_id ?? "" });
  }
  await delay(3000);
  await stop("agent");
  await stop("hub");
  await killSessiond();
  // Asleep, last moved two hours ago (past the restore's horizon). item-wake
  // and item-gone as the migration leaves a row from before this fix: the
  // turn it had open unrecorded, so their transcripts decide; item-gone's
  // workspace is gone. item-open keeps the open turn this hub recorded.
  const twoHoursAgo = Date.now() - 2 * 60 * 60_000;
  const byName = (name: string) => items.find((item) => item.name === name);
  const open = byName("item-open");
  const recorded = open ? instance(open.instanceId)?.turn_open_at : undefined;
  if (!(typeof recorded === "number" && recorded > 0)) {
    throw new Error(
      `item-open's open turn was not recorded: ${String(recorded)}`
    );
  }
  for (const item of items) {
    write(
      `UPDATE instances SET status = 'sleeping', updated_at = ?${item.name === "item-open" ? "" : ", turn_open_at = -1"} WHERE id = ?`,
      twoHoursAgo,
      item.instanceId
    );
  }
  const gone = byName("item-gone");
  if (gone) {
    write(
      "UPDATE workspaces SET state = 'archived' WHERE id = ?",
      gone.workspaceId
    );
  }
  const handBacksTo = (name: string) =>
    seen.filter((one) => one.handBack && one.tools && one.tag === name).length;
  const wakeCount = () => handBacksTo("item-wake");
  launch("sessiond");
  await sessiondUp();
  launch("hub");
  await hubUp();
  launch("agent");
  await agentUp();
  const wake = byName("item-wake");
  try {
    await until("item-wake carried on", wakeCount, (n) => n >= 1, 240_000);
    await until(
      "item-open carried on",
      () => handBacksTo("item-open"),
      (n) => n >= 1,
      240_000
    );
    const failed = await until(
      "item-gone failed",
      () =>
        query<{ state: string; error: string | null }>(
          "SELECT state, error FROM work_items WHERE id = ?",
          gone?.workItemId ?? ""
        )[0],
      (row) => row?.state === "failed",
      60_000
    );
    const told = await until(
      "the parent told",
      () =>
        query<{ n: number }>(
          "SELECT count(*) AS n FROM sent_messages WHERE instance_id = ? AND body LIKE '%cut by a restart%'",
          parent
        )[0]?.n ?? 0,
      (n) => n >= 1,
      60_000
    );
    // A second hub start settles nothing twice.
    await stop("hub", "SIGKILL");
    launch("hub");
    await hubUp();
    await agentUp();
    await delay(30_000);
    // A woken item carries on as any item does: the mock's one-word answers
    // never call finish_item, so the item's own rule may end it for that
    // later. What counts is that the settle woke it rather than failed it.
    const stateOf = (workItemId: string | undefined) => {
      const [row] = query<{ state: string; error: string | null }>(
        "SELECT state, error FROM work_items WHERE id = ?",
        workItemId ?? ""
      );
      return row?.error?.includes("cut by a restart")
        ? `failed by the settle: ${row.error}`
        : "woken";
    };
    const woken = {
      requests: wakeCount(),
      stored: handBacksStored(wake?.instanceId ?? ""),
      item: stateOf(wake?.workItemId),
    };
    const reopened = {
      requests: handBacksTo("item-open"),
      stored: handBacksStored(open?.instanceId ?? ""),
      item: stateOf(open?.workItemId),
    };
    const once = (one: typeof woken) =>
      one.requests === 1 && one.stored === 1 && one.item === "woken";
    const ok = once(woken) && once(reopened) && told === 1;
    check("settle", ok, {
      unrecordedWoken: woken,
      recordedWoken: reopened,
      goneItem: failed,
      parentTold: told,
    });
    if (ok) {
      console.log(
        "restore probe: asleep items settled once; no repeat after hub restart"
      );
    }
  } catch (error) {
    check("settle", false, { error: String(error) });
  }
}

const failed = results.filter((one) => !one.ok);
if (failed.length === 0 && !process.env.RESTORE_PROBE_KEEP) {
  await rm(sandbox, { recursive: true, force: true });
} else {
  console.log(`The sandbox is kept for reading: ${sandbox}`);
}
console.log(
  `${results.length - failed.length}/${results.length} checks passed`
);
process.exit(failed.length === 0 && results.length > 0 ? 0 : 1);
