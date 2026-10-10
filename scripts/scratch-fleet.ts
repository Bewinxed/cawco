/**
 * A scratch fleet for probes: a real hub, agent and sessiond, each its own
 * process with a temp HOME, on loopback, against a local mock model endpoint.
 * Fake keys only; nothing here reaches a real provider or this machine's
 * services. Each process is stopped by the PID it was started under, never
 * by pattern.
 *
 * The mock answers every harness's model request (Anthropic messages for
 * Claude Code, OpenAI chat completions for opencode and pi) with the words
 * the probe's `respond` picks, streamed at its pace, and keeps every request
 * it answered in `seen`.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseProcId } from "../packages/agent/src/proc-id";
import { SessiondClient } from "../packages/agent/src/sessiond-client";
import { CLAUDE_JSON_NAME } from "../packages/core/src/claude-dirs";

export type Harness = "claude" | "opencode" | "pi";
export const HARNESSES: Harness[] = ["claude", "opencode", "pi"];

/** One request the mock answered. */
export interface Seen {
  /** Every user message's text, joined: the conversation so far. */
  all: string;
  at: number;
  /** The last user message's text: what started this request. */
  last: string;
  /** Whether the harness offered tools: a session's turn, not a side call (a title). */
  tools: boolean;
}

/**
 * What the mock answers a request with: its words, one every `everyMs`; or,
 * with `tool` (Anthropic messages only), one call of that tool.
 */
export interface Reply {
  everyMs: number;
  tool?: { input: object; name: string };
  words: string[];
}

export const delay = (ms: number) => Bun.sleep(ms);

/** Reads until `accept` holds, every half second, or throws naming `label`. */
export async function until<T>(
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

const anthropicEvents = (words: string[], tool?: Reply["tool"]): string[] => {
  const ev = (type: string, data: object) =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const start = ev("message_start", {
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
  });
  if (tool) {
    return [
      start,
      ev("content_block_start", {
        index: 0,
        content_block: {
          type: "tool_use",
          id: `toolu_${crypto.randomUUID().replaceAll("-", "")}`,
          name: tool.name,
          input: {},
        },
      }),
      ev("content_block_delta", {
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: JSON.stringify(tool.input),
        },
      }),
      ev("content_block_stop", { index: 0 }),
      ev("message_delta", {
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 5 },
      }),
      ev("message_stop", {}),
    ];
  }
  return [
    start,
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

/** A unix socket's longest path, in bytes, its NUL apart (`sun_path` is 108). */
const SOCKET_PATH_MAX = 107;
/** What srt's longest socket adds to the runtime dir: `/cawco-srt/<12 hex>/claude-socks-<16 hex>.sock`. */
const SRT_SOCKET_TAIL = 58;

export const MACHINE = "scratch-fleet";
export const ACCOUNT = "acct-scratch-fleet";
export const MODEL: Record<Harness, string> = {
  claude: "claude-haiku-4-5",
  opencode: "mockoc/mock-oc",
  pi: "mockpi/mock-pi",
};

const ENTRY = {
  hub: "packages/hub/src/index.ts",
  agent: "packages/agent/src/cli.ts",
  sessiond: "packages/sessiond/src/main.ts",
} as const;
export type Role = keyof typeof ENTRY;

/** A row of `instances`, as the probes read it. */
export interface InstanceSnapshot {
  last_error: string | null;
  spawned_at: number | null;
  status: string;
  turn_open_at: number | null;
  updated_at: number;
}

/** A row of `sent_messages`, as the probes read it. */
export interface SendSnapshot {
  owed: string | null;
  reason: string | null;
  state: string;
  uuid: string;
}

/**
 * Stands the fleet's files up (the sandbox, the harnesses' config pointed at
 * the mock, a signed-in fake Claude account, a repository with a remote) and
 * returns what drives it. Nothing runs until the probe launches it.
 */
export async function scratchFleet(options: {
  name: string;
  respond: (request: Seen) => Reply;
}) {
  const root = resolve(import.meta.dir, "..");
  // On real disk, not /tmp: a delegate's workspace boundary mounts paths from
  // its home, and a /tmp private to whatever runs this is not one it sees.
  const scratch =
    process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? "/tmp", ".cache");
  const sandbox = join(
    scratch,
    `${options.name}-${crypto.randomUUID().slice(0, 8)}`
  );
  const home = join(sandbox, "home");
  // In a folder of its own: a workspace boundary hides the database's folder.
  const dbPath = join(sandbox, "hub", "hub.db");
  const sessiondSocket = join(sandbox, "sessiond.sock");
  await mkdir(join(home, ".config", "cawco"), { recursive: true });
  await mkdir(join(sandbox, "hub"), { recursive: true });
  // The agent's XDG_RUNTIME_DIR, where a delegate's workspace boundary puts
  // srt's temp dir and its proxy sockets (boundary.ts `srtTmpOf`). The
  // longest is `<runtime>/cawco-srt/<12 hex>/claude-socks-<16 hex>.sock`, the
  // runtime dir and 58 bytes, and a socket path holds 107 (108 with its NUL).
  // So it sits beside the sandbox, not in it: `sf-XXXXXX` in the same scratch
  // dir is 31 bytes under ~/.cache, as short as the runtime dir the boundary
  // handover rig ran real srt boundaries under. Mode 700, as a runtime dir is.
  const runtime = await mkdtemp(join(scratch, "sf-"));
  await chmod(runtime, 0o700);
  if (runtime.length + SRT_SOCKET_TAIL > SOCKET_PATH_MAX) {
    console.warn(
      `… ${runtime} is too long for a workspace boundary's srt sockets (${runtime.length + SRT_SOCKET_TAIL} > ${SOCKET_PATH_MAX} bytes): a delegate's boundary will not start here`
    );
  }

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

  // ── The mock model endpoint ───────────────────────────────────────────
  const seen: Seen[] = [];
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
      const users = (body.messages ?? []).filter(
        (message) => message.role === "user"
      );
      const one: Seen = {
        at: Date.now(),
        all: users.map((user) => textOf(user.content)).join("\n"),
        last: textOf(users.at(-1)?.content),
        tools: (body.tools?.length ?? 0) > 0,
      };
      seen.push(one);
      const reply = options.respond(one);
      const chat = path.endsWith("/chat/completions");
      if (body.stream === false && !chat) {
        return Response.json({
          id: `msg_${crypto.randomUUID()}`,
          type: "message",
          role: "assistant",
          model: "claude-probe",
          content: [{ type: "text", text: reply.words.join("") }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 2 },
        });
      }
      return sseStream(
        chat
          ? chatEvents(reply.words)
          : anthropicEvents(reply.words, reply.tool),
        reply.everyMs
      );
    },
  });
  const mockBase = `http://127.0.0.1:${mock.port}`;

  // ── The harnesses' config, pointed at the mock ────────────────────────
  // A Claude account dir signed in with a fake login: Claude Code reports it
  // signed in as the probe's identity and sends the fake token to the mock.
  const accountDir = join(home, ".cawco", "accounts", ACCOUNT, "claude");
  await mkdir(accountDir, { recursive: true });
  await writeFile(
    join(accountDir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: "sk-ant-oat01-fake-scratch-fleet",
        refreshToken: "sk-ant-ort01-fake-scratch-fleet",
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
        emailAddress: "probe@scratch-fleet.test",
        organizationName: "Scratch Fleet",
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
      model: MODEL.opencode,
      small_model: MODEL.opencode,
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

  // A repository with a remote, for delegates' workspaces.
  const origin = join(sandbox, "origin.git");
  const repo = join(sandbox, "repo");
  await Bun.$`git init -q --bare ${origin} && git clone -q ${origin} ${repo} 2>/dev/null && git -C ${repo} -c user.email=p@p -c user.name=p commit -q --allow-empty -m init && git -C ${repo} push -q origin HEAD`.quiet();
  const workdir = join(sandbox, "work");
  await mkdir(workdir, { recursive: true });

  // ── The scratch services ──────────────────────────────────────────────
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    USER: process.env.USER ?? "probe",
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    XDG_RUNTIME_DIR: runtime,
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
  const stop = async (
    role: Role,
    signal: "SIGTERM" | "SIGKILL" = "SIGTERM"
  ) => {
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
  /**
   * Freezes a role's process where it stands (SIGSTOP), or lets it run on
   * (SIGCONT): what reaches it meanwhile waits at its door, read when it runs.
   */
  const freeze = (role: Role, frozen: boolean) => {
    const child = procs[role];
    if (!child || child.exitCode !== null) {
      throw new Error(`${role} is not running`);
    }
    child.kill(frozen ? "SIGSTOP" : "SIGCONT");
    console.log(`… ${role} (pid ${child.pid}) ${frozen ? "frozen" : "thawed"}`);
  };
  /** The log files a role's launches wrote so far, read whole, oldest first. */
  const logs = async (role: Role): Promise<string> => {
    const files = (await readdir(sandbox))
      .filter((file) => file.startsWith(`${role}-`))
      .sort(
        (a, b) =>
          Number(a.split("-")[1]?.split(".")[0]) -
          Number(b.split("-")[1]?.split(".")[0])
      );
    const texts = await Promise.all(
      files.map((file) => Bun.file(join(sandbox, file)).text())
    );
    return texts.join("\n");
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
      const parent = Number(
        stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]
      );
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
  /** Sends `signal` to `pid` and every process under it. */
  const killTree = async (pid: number, signal: "SIGTERM" | "SIGKILL") => {
    const tree = [pid, ...(await descendants(pid))];
    for (const one of tree) {
      try {
        process.kill(one, signal);
      } catch {
        // gone already
      }
    }
  };
  /** sessiond and every process under it, as a control-group stop ends them. */
  const killSessiond = async () => {
    const child = procs.sessiond;
    if (!child) {
      return;
    }
    const tree = [child.pid, ...(await descendants(child.pid))];
    await killTree(child.pid, "SIGTERM");
    await delay(3000);
    await killTree(child.pid, "SIGKILL");
    await child.exited;
    console.log(
      `… sessiond (pid ${child.pid}) and its ${tree.length - 1} children killed`
    );
  };
  /** What sessiond holds: each live process's proc id and PID. */
  const heldProcs = async (): Promise<{ procId: string; pid: number }[]> => {
    const client = await SessiondClient.connect(sessiondSocket);
    try {
      return client.procs
        .filter((proc) => proc.alive)
        .map(({ procId, pid }) => ({ procId, pid }));
    } finally {
      client.close();
    }
  };
  /** The PID sessiond runs a session's own process under (Claude Code, a pi host), by its proc id. */
  const sessionPid = async (
    instanceId: string
  ): Promise<number | undefined> => {
    const client = await SessiondClient.connect(sessiondSocket);
    try {
      return client.procs.find((proc) => {
        const id = parseProcId(proc.procId);
        return (
          proc.alive &&
          (id.kind === "claude" || id.kind === "pi") &&
          id.instanceId === instanceId
        );
      })?.pid;
    } finally {
      client.close();
    }
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
        api<
          { machineId: string; status: string; custody?: { state: string } }[]
        >("/api/agents"),
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
  /** The probe's Claude account, filed before the agent reports it, then signed in. */
  const fileAccount = () =>
    write(
      "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Probe', 'blue', 0, 0, ?)",
      ACCOUNT,
      Date.now()
    );
  const accountSignedIn = () =>
    until(
      "the probe's Claude account signed in",
      () =>
        query<{ state: string }>(
          "SELECT state FROM account_signins WHERE account_id = ?",
          ACCOUNT
        )[0],
      (row) => row?.state === "signed-in",
      120_000
    );
  const instance = (id: string) =>
    query<InstanceSnapshot>(
      "SELECT status, last_error, turn_open_at, spawned_at, updated_at FROM instances WHERE id = ?",
      id
    )[0];
  const sendRow = (uuid: string) =>
    query<SendSnapshot>(
      "SELECT uuid, state, reason, owed FROM sent_messages WHERE uuid = ?",
      uuid
    )[0];

  const spawn = async (
    harness: Harness,
    title: string,
    cwd = workdir,
    /** More of the spawn's payload (its `projectId`). */
    extra: object = {}
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
        ...extra,
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
  /** A person's message to a session, through the dashboard; its uuid. */
  const send = async (instanceId: string, text: string): Promise<string> => {
    const uuid = crypto.randomUUID();
    await post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "send",
      machineId: MACHINE,
      sessionId: instanceId,
      payload: {
        instanceId,
        message: {
          type: "user",
          uuid,
          message: { role: "user", content: text },
          parent_tool_use_id: null,
          origin: { kind: "human" },
        },
      },
    });
    return uuid;
  };
  /** A dashboard control to a session's machine (e.g. `sleep`). */
  const control = (instanceId: string, method: string, args: unknown[] = []) =>
    post({
      verb: "control",
      machineId: MACHINE,
      instanceId,
      requestId: crypto.randomUUID(),
      payload: { instanceId, method, args },
    });
  /** A person's stop, through the dashboard. */
  const stopSession = (instanceId: string) =>
    post({
      verb: "stop",
      machineId: MACHINE,
      instanceId,
      requestId: crypto.randomUUID(),
      payload: { instanceId },
    });

  /** Stops everything this fleet started and its mock. */
  const close = async () => {
    socket?.close();
    await stop("agent");
    await stop("hub");
    await killSessiond();
    await mock.stop(true);
  };
  /** Deletes the sandbox and the runtime dir beside it, unless `keep`. */
  const clean = async (keep: boolean) => {
    if (keep) {
      console.log(
        `The sandbox is kept for reading: ${sandbox} (runtime dir ${runtime})`
      );
      return;
    }
    await rm(sandbox, { recursive: true, force: true });
    await rm(runtime, { recursive: true, force: true });
  };

  return {
    /** The hub's own address, `http://127.0.0.1:<port>`. */
    base,
    sandbox,
    home,
    sessiondSocket,
    /** The scratch services' environment: their HOME, hub and machine. */
    env,
    repo,
    workdir,
    seen,
    launch,
    stop,
    freeze,
    logs,
    killTree,
    killSessiond,
    sessionPid,
    heldProcs,
    api,
    post,
    query,
    write,
    hubUp,
    agentUp,
    sessiondUp,
    fileAccount,
    accountSignedIn,
    instance,
    sendRow,
    spawn,
    send,
    control,
    stopSession,
    close,
    clean,
  };
}

export type Fleet = Awaited<ReturnType<typeof scratchFleet>>;
