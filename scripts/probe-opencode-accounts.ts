/**
 * Real isolated probe of OpenCode sessions on CawCo accounts: each account its
 * own OpenCode server. Fake credentials and a local mock provider only; it
 * never targets fleet services or a real provider.
 *
 *   bun scripts/probe-opencode-accounts.ts
 *
 * Proves, on the real `opencode` binary, the real agent harness and a private
 * sessiond:
 *   1. a session on account A, moved to B, then back to A: the mock sees each
 *      account's credential; history reads back on B, and an edit made on A is
 *      undone from B;
 *   2. a refresh by pi-ai (its real refresh, the token endpoint answered
 *      here) reaches A's server on its next request;
 *   3. a usage-limit 429 on an account ends the turn on it, and the session,
 *      moved to another account as the hub's at-limit move does, carries on;
 *   4. a model on no account runs on the machine's own server;
 *   5. a cold machine's first start waits out OpenCode's install of its
 *      plugin dependency into the shared config dir, and no account's server
 *      repeats it on its own empty data dir;
 *   6. accounts' servers start on demand and stop once idle, with memory.
 */
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const sandbox =
  process.env.ACCOUNTS_PROBE_SANDBOX ??
  (await mkdtemp(join("/tmp", "accounts-probe-")));
const home = join(sandbox, "home");
const endpoint = join(sandbox, "sessiond.sock");
if (!process.env.ACCOUNTS_PROBE_SANDBOX) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ACCOUNTS_PROBE_SANDBOX: sandbox,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    CAWCO_SESSIOND_ENDPOINT: endpoint,
  };
  env.INVOCATION_ID = undefined;
  env.CAWCO_SERVICE_MODE = undefined;
  env.XPC_SERVICE_NAME = undefined;
  const child = Bun.spawn(
    [process.execPath, import.meta.path, ...process.argv.slice(2)],
    { env, stdout: "inherit", stderr: "inherit" }
  );
  const code = await child.exited;
  if (code === 0 && !process.env.ACCOUNTS_PROBE_KEEP) {
    await rm(sandbox, { recursive: true, force: true });
  } else {
    console.log(`The sandbox is kept for reading: ${sandbox}`);
  }
  process.exit(code);
}
if (homedir() !== home) {
  throw new Error("Probe HOME isolation did not take effect.");
}
if (!Bun.which("opencode")) {
  throw new Error("The real OpenCode binary is required.");
}
const project = join(sandbox, "project");
await mkdir(project, { recursive: true });
await Bun.$`git -C ${project} init -q && git -C ${project} -c user.email=p@p -c user.name=p commit -q --allow-empty -m init`;

// ── The mock provider ───────────────────────────────────────────────────
// It speaks both wire formats the providers here use: Chat Completions
// (`/chat/completions`, the openai-compatible SDK) and the Responses API
// (`/responses`, which OpenCode 1.18.34 always uses for xAI: provider.ts
// 258-262). Each request is recorded with its model, so the title requests
// OpenCode makes on the machine's `small_model` are told apart from turns.
interface Seen {
  auth: string;
  model: string;
  text: string;
  tool: boolean;
}
interface Item {
  content?: unknown;
  role?: string;
  type?: string;
}
const seen: Seen[] = [];
const textOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content)
    ? content.map((part: { text?: string }) => part.text ?? "").join(" ")
    : "";
};
const WRITE = /WRITE (\S+) (\S+)/;
const sse = (events: object[], done = false) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
      (done ? "data: [DONE]\n\n" : ""),
    { headers: { "content-type": "text/event-stream" } }
  );
const chatChunk = (delta: object, finish: string | null) => ({
  id: "c",
  object: "chat.completion.chunk",
  created: 0,
  model: "mock",
  choices: [{ index: 0, delta, finish_reason: finish }],
});
const chatAnswer = (text: string, call?: { id: string; args: string }) =>
  sse(
    [
      chatChunk(
        call
          ? {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: call.id,
                  type: "function",
                  function: { name: "write", arguments: call.args },
                },
              ],
            }
          : { role: "assistant", content: text },
        null
      ),
      chatChunk({}, call ? "tool_calls" : "stop"),
      {
        ...chatChunk({}, null),
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ],
    true
  );
const responsesAnswer = (text: string, call?: { id: string; args: string }) => {
  const response = { id: "r", object: "response", created_at: 0, model: "m" };
  const item = call
    ? {
        type: "function_call",
        name: "write",
        arguments: call.args,
        call_id: call.id,
        id: `fc_${call.id}`,
      }
    : {
        type: "message",
        role: "assistant",
        id: "msg_1",
        status: "completed",
        content: [{ type: "output_text", text }],
      };
  return sse([
    {
      type: "response.created",
      response: { ...response, output: [], status: "in_progress" },
    },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: call
        ? { ...item, arguments: "" }
        : { ...item, content: [], status: "in_progress" },
    },
    ...(call
      ? []
      : [
          {
            type: "response.output_text.delta",
            item_id: "msg_1",
            output_index: 0,
            content_index: 0,
            delta: text,
          },
        ]),
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: {
        ...response,
        output: [item],
        status: "completed",
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    },
  ]);
};
const mock = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const responses = new URL(request.url).pathname.endsWith("/responses");
    const body = (await request.json().catch(() => ({}))) as {
      input?: Item[];
      messages?: Item[];
      model?: string;
    };
    const items = (responses ? body.input : body.messages) ?? [];
    const auth = request.headers.get("authorization") ?? "(none)";
    const text = textOf(
      items.filter((one) => one.role === "user").at(-1)?.content
    );
    const last = items.at(-1);
    const toolTurn = responses
      ? last?.type === "function_call_output"
      : last?.role === "tool";
    seen.push({
      auth,
      model: body.model ?? "",
      text: text.slice(0, 80),
      tool: toolTurn,
    });
    if (auth.includes("limited")) {
      return Response.json(
        {
          error: {
            type: "usage_limit_reached",
            message: "The usage limit has been reached",
          },
        },
        { status: 429 }
      );
    }
    const write = text.match(WRITE);
    const call =
      write && !toolTurn
        ? {
            id: `call_${seen.length}`,
            args: JSON.stringify({
              filePath: join(project, write[1] ?? "note.txt"),
              content: write[2] ?? "",
            }),
          }
        : undefined;
    const answer = `answered with ${auth}`;
    return responses ? responsesAnswer(answer, call) : chatAnswer(answer, call);
  },
});
const baseURL = `${mock.url.origin}/v1`;

// ── The hub: just its CawCo MCP, which a session needs connected ───────
const hub = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/delegation/tools") {
      return Response.json({ tools: [] });
    }
    if (!url.pathname.startsWith("/mcp/") || request.method !== "POST") {
      return new Response(null, { status: 404 });
    }
    const rpc = (await request.json()) as { id?: number; method: string };
    if (rpc.id === undefined) {
      return new Response(null, { status: 202 });
    }
    const results: Record<string, object> = {
      initialize: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "accounts-probe", version: "1" },
      },
      "tools/list": { tools: [] },
    };
    const result = results[rpc.method] ?? {};
    return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
  },
});
process.env.CAWCO_HUB_URL = `${hub.url.origin}/ws`;
await Bun.write(
  join(home, ".config", "cawco", "config.json"),
  JSON.stringify({ hubUrl: `${hub.url.origin}/ws` })
);
// The machine's OpenCode config: xAI (an OAuth account provider whose own
// sign-in plugin sends the stored access token) and `mockai` (a key
// provider) pointed at the mock; `plain` is the machine's own, no account.
const model = (name: string) => ({
  name,
  tool_call: true,
  limit: { context: 100_000, output: 4000 },
});
await Bun.write(
  join(home, ".config", "opencode", "opencode.json"),
  JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    autoupdate: false,
    share: "disabled",
    model: "plain/plain-mock",
    small_model: "plain/plain-mock",
    provider: {
      xai: {
        npm: "@ai-sdk/xai",
        options: { baseURL },
        models: { "xai-mock": model("xAI mock") },
      },
      mockai: {
        name: "Mock",
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL },
        models: { "mockai-mock": model("Mock") },
      },
      plain: {
        name: "Plain",
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL, apiKey: "machine-key" },
        models: { "plain-mock": model("Plain") },
      },
    },
  })
);
process.env.OPENCODE_DISABLE_MODELS_FETCH = "1";

// pi-ai's xAI refresh posts to its token endpoint with the global fetch: the
// probe answers it, with the next token it has queued.
const refreshes: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://auth.x.ai/oauth2/token") {
      const next = refreshes.shift();
      return Promise.resolve(
        next
          ? Response.json({
              access_token: next,
              refresh_token: `refresh-${next}`,
              expires_in: 3600,
            })
          : Response.json({ error: "nothing queued" }, { status: 400 })
      );
    }
    return realFetch(input, init);
  },
  { preconnect: realFetch.preconnect }
) as typeof fetch;

const { providerLimitRefused } = await import("../packages/core/src/index");
const { SessiondServer } = await import("../packages/sessiond/src/server");
const { SessiondClient } = await import(
  "../packages/agent/src/sessiond-client"
);
const accounts = await import("../packages/agent/src/provider-accounts");
const { OpencodeHarness } = await import(
  "../packages/agent/src/harnesses/opencode"
);
type Neutral = import("../packages/core/src/index").NeutralMessage;
type FleetConfig = import("../packages/core/src/index").FleetConfig;
type Session = import("../packages/agent/src/harness").HarnessSession;

const sessiond = new SessiondServer();
await sessiond.listen(endpoint);
const keeper = await SessiondClient.connect(endpoint);

// ── Accounts, through the agent's own paths ────────────────────────────
const piStore = join(home, ".pi", "agent", "auth.json");
const moveXai = async (account: string, access: string, email: string) => {
  await Bun.write(
    piStore,
    JSON.stringify({
      xai: {
        type: "oauth",
        access,
        refresh: `refresh-${access}`,
        expires: Date.now() + 60 * 60_000,
        email,
      },
    })
  );
  await accounts.moveHomeCredential(account, "pi", "xai", {
    email,
    organization: "xai",
  });
};
await moveXai("acct-a", "xai-A1", "a@probe.test");
await moveXai("acct-b", "xai-B1", "b@probe.test");
await accounts.setProviderKey("acct-limited", "mockai", "key-limited", null);
await accounts.setProviderKey("acct-m", "mockai", "key-M", null);

const harness = new OpencodeHarness();
harness.setCustodyReadiness(() => true);

// The fleet's MCP servers, as the hub sends them: two local stdio servers
// (a process each, wherever OpenCode starts them) and one proxied through the
// hub (no process). The machine's real fleet has eight local ones.
const fakeMcp = join(sandbox, "fake-mcp.ts");
await Bun.write(
  fakeMcp,
  `for await (const line of console) {
  if (!line.trim()) continue;
  const rpc = JSON.parse(line);
  if (rpc.id === undefined) continue;
  const results = {
    initialize: { protocolVersion: rpc.params?.protocolVersion ?? "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: process.argv[2], version: "1" } },
    "tools/list": { tools: [{ name: "noop", description: "noop", inputSchema: { type: "object", properties: {} } }] },
  };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: results[rpc.method] ?? {} }) + "\\n");
}
`
);
const localMcp = (name: string) => ({
  name,
  enabled: true,
  scope: "user",
  config: { command: process.execPath, args: [fakeMcp, name] },
});
const fleet = {
  marketplaces: [],
  mcp: [
    localMcp("local-one"),
    localMcp("local-two"),
    {
      name: "proxied-one",
      enabled: true,
      proxied: true,
      scope: "user",
      config: { type: "http", url: `${hub.url.origin}/mcp/fleet/proxied-one` },
    },
  ],
} as unknown as FleetConfig;
await harness.syncFleet(fleet);

// ── Sessions, as the supervisor drives them ─────────────────────────────
interface Handle {
  frames: Neutral[];
  session: Session;
  stored: Map<string, string>;
}
const waiters = new Set<() => void>();
const wake = () => {
  for (const waiter of waiters) {
    waiter();
  }
};
const until = <T>(read: () => T | undefined, ms: number, what: string) =>
  new Promise<T>((resolve, reject) => {
    const check = () => {
      const value = read();
      if (value !== undefined) {
        waiters.delete(check);
        clearTimeout(timer);
        resolve(value);
      }
    };
    const timer = setTimeout(() => {
      waiters.delete(check);
      reject(new Error(`Timed out waiting for ${what}`));
    }, ms);
    waiters.add(check);
    check();
  });

const open = async (
  instanceId: string,
  account: string | undefined,
  modelId: string,
  resume?: { sessionKey: string; atMessage?: string }
): Promise<Handle> => {
  const frames: Neutral[] = [];
  const stored = new Map<string, string>();
  const session = await harness.spawn(
    {
      instanceId,
      cwd: project,
      harness: "opencode",
      model: modelId,
      permissionMode: "bypassPermissions",
      ...(account ? { accountDir: { accountId: account } } : {}),
      ...(resume ? { resume } : {}),
    },
    {
      instanceId,
      cwd: project,
      busy: () => undefined,
      session: () => undefined,
      frame: (message) => {
        frames.push(message);
        const { storedAs } = message as { storedAs?: Record<string, string> };
        for (const [uuid, id] of Object.entries(storedAs ?? {})) {
          stored.set(uuid, id);
        }
        wake();
      },
      permission: (request) =>
        console.warn(`unexpected permission ${request.toolName}`),
      failed: (error) => console.warn(`failed: ${String(error)}`),
      rejected: (_uuid, error) => console.warn(`rejected: ${String(error)}`),
      emit: () => undefined,
      recordSessionAddress: async () => undefined,
    }
  );
  session.attached?.();
  return { frames, session, stored };
};

/** Sends one turn and waits for its result frame. */
const turn = async (handle: Handle, text: string) => {
  const before = handle.frames.length;
  const uuid = crypto.randomUUID();
  handle.session.send(
    {
      message: { role: "user", content: text },
      origin: { kind: "human" },
      uuid,
    },
    {}
  );
  const result = await until(
    () =>
      handle.frames.slice(before).find((frame) => frame.type === "result") as
        | (Neutral & { is_error?: boolean; errors?: string[] })
        | undefined,
    120_000,
    `the result of "${text}"`
  );
  console.log(
    `turn "${text}": ${result.is_error ? `error ${JSON.stringify(result.errors)}` : "answered"}`
  );
  return { result, messageID: handle.stored.get(uuid) };
};

const XAI = "xai/xai-mock";
const MOCKAI = "mockai/mockai-mock";

/** The credentials the mock saw on a turn's requests to its model (OpenCode's title requests run on the machine's `small_model`). */
const authOf = (marker: string, modelId = "xai-mock") =>
  seen
    .filter((entry) => entry.model === modelId && entry.text.includes(marker))
    .map((entry) => entry.auth);

/** The relaunch the hub makes for a move: the old process stopped, the same session spawned on the new account. */
const move = async (
  instanceId: string,
  handle: Handle,
  account: string | undefined,
  modelId: string,
  atMessage?: string
) => {
  await handle.session.stop();
  return open(instanceId, account, modelId, {
    sessionKey: handle.session.sessionId as string,
    ...(atMessage ? { atMessage } : {}),
  });
};

const servers = async () =>
  (await keeper.list()).procs
    .filter((proc) => proc.alive && proc.procId.startsWith("opencode-server"))
    .map((proc) => proc.procId);
const VM_RSS = /VmRSS:\s+(\d+)/;
const rssOf = async (procId: string) => {
  const proc = (await keeper.list()).procs.find((one) => one.procId === procId);
  const status = proc ? await Bun.file(`/proc/${proc.pid}/status`).text() : "";
  const kb = Number(status.match(VM_RSS)?.[1] ?? 0);
  return `${Math.round(kb / 1024)} MiB`;
};
const memory = async () =>
  Object.fromEntries(
    await Promise.all(
      (await servers()).map(async (id) => [id, await rssOf(id)] as const)
    )
  );

/**
 * How long each instance boot took in a server's OpenCode logs: from its
 * `bootstrapping` line to its `init` line, which is where a first boot waits
 * on OpenCode's dependency install.
 */
const BOOT_LINE = /^timestamp=(\S+) .*message=(bootstrapping|init)\b/;
const bootGaps = async (logDir: string): Promise<number[]> => {
  const gaps: number[] = [];
  for (const file of await Array.fromAsync(
    new Bun.Glob("*.log").scan({ cwd: logDir })
  )) {
    let started: number | undefined;
    // biome-ignore lint/performance/noAwaitInLoops: one log at a time
    for (const line of (await Bun.file(join(logDir, file)).text()).split(
      "\n"
    )) {
      const found = line.match(BOOT_LINE);
      if (!found?.[1]) {
        continue;
      }
      const at = Date.parse(found[1]);
      if (found[2] === "bootstrapping") {
        started = at;
      } else if (started !== undefined) {
        gaps.push(at - started);
        started = undefined;
      }
    }
  }
  return gaps;
};

/** A process and every descendant, by RSS, from /proc. */
interface Tree {
  processes: { command: string; pid: number; rssMiB: number }[];
  totalMiB: number;
}
const PARENT = /^\d+ \(.*\) \S (\d+)/;
const PROC_UUID = /-[0-9a-f-]{36}$/;
const treeOf = async (root: number): Promise<Tree> => {
  const children = new Map<number, number[]>();
  for (const entry of await readdir("/proc")) {
    const pid = Number(entry);
    if (!Number.isInteger(pid)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one /proc entry at a time
    const stat = await Bun.file(`/proc/${pid}/stat`)
      .text()
      .catch(() => "");
    const parent = Number(stat.match(PARENT)?.[1] ?? Number.NaN);
    if (Number.isInteger(parent)) {
      children.set(parent, [...(children.get(parent) ?? []), pid]);
    }
  }
  const processes: Tree["processes"] = [];
  const walk = async (pid: number): Promise<void> => {
    const status = await Bun.file(`/proc/${pid}/status`)
      .text()
      .catch(() => "");
    const command = (
      await Bun.file(`/proc/${pid}/cmdline`)
        .text()
        .catch(() => "")
    )
      .replaceAll("\0", " ")
      .trim()
      .slice(0, 120);
    processes.push({
      pid,
      command,
      rssMiB: Math.round(Number(status.match(VM_RSS)?.[1] ?? 0) / 1024),
    });
    for (const child of children.get(pid) ?? []) {
      // biome-ignore lint/performance/noAwaitInLoops: the tree is walked in order
      await walk(child);
    }
  };
  await walk(root);
  return {
    processes,
    totalMiB: processes.reduce((sum, one) => sum + one.rssMiB, 0),
  };
};

const checks: { name: string; ok: boolean; detail: unknown }[] = [];
const check = (name: string, ok: boolean, detail: unknown) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(detail)}`);
};

try {
  // 1. A → B → A, with history and undo.
  let started = performance.now();
  let one = await open("probe-move", "acct-a", XAI);
  const firstStart = performance.now() - started;
  const memAfterStart = await memory();
  const wrote = await turn(one, "turn-1 on A: WRITE note.txt fromA");
  const noteWritten = await Bun.file(join(project, "note.txt")).exists();
  await turn(one, "turn-2 on A");
  started = performance.now();
  one = await move("probe-move", one, "acct-b", XAI);
  const moveToNewServer = performance.now() - started;
  const historyOnB = (
    await harness.getSessionMessages(one.session.sessionId as string, project)
  ).filter((entry) => entry.type === "user").length;
  await turn(one, "turn-3 on B");
  one = await move("probe-move", one, "acct-a", XAI);
  await turn(one, "turn-4 back on A");
  check(
    "each account's credential reached the mock from its own server",
    JSON.stringify([
      authOf("turn-1 on A")[0],
      authOf("turn-2 on A")[0],
      authOf("turn-3 on B")[0],
      authOf("turn-4 back on A")[0],
    ]) ===
      JSON.stringify([
        "Bearer xai-A1",
        "Bearer xai-A1",
        "Bearer xai-B1",
        "Bearer xai-A1",
      ]),
    seen
      .filter((entry) => entry.model === "xai-mock")
      .map(
        (entry) =>
          `${entry.text.slice(0, 18)}${entry.tool ? " (tool result)" : ""} → ${entry.auth}`
      )
  );
  check("history read back on B", historyOnB >= 2, {
    userEntriesOnB: historyOnB,
  });
  // Undo, from B, of the edit made on A.
  one = await move("probe-move", one, "acct-b", XAI, wrote.messageID);
  const noteAfterUndo = await Bun.file(join(project, "note.txt")).exists();
  check("an edit made on A is undone from B", noteWritten && !noteAfterUndo, {
    writtenOnA: noteWritten,
    afterRevertOnB: noteAfterUndo,
  });
  const memAfterTurns = await memory();

  // 2. pi-ai refreshes A; A's server takes the new token on its next request.
  const store = JSON.parse(
    await Bun.file(accounts.opencodeAccountStore("acct-a")).text()
  ) as { xai?: { refresh?: string; access?: string } };
  check(
    "A's OpenCode store holds its token and a marker for the refresh token",
    store.xai?.access === "xai-A1" &&
      store.xai.refresh === accounts.OPENCODE_MARKER,
    store.xai
  );
  one = await move("probe-move", one, "acct-a", XAI);
  const credentialPath = join(
    home,
    ".cawco",
    "accounts",
    "acct-a",
    "credential.json"
  );
  const held = JSON.parse(await Bun.file(credentialPath).text()) as {
    xai: { expires: number };
  };
  held.xai.expires = Date.now() + 10 * 60_000; // inside the agent's 15-minute window
  await Bun.write(credentialPath, JSON.stringify(held));
  refreshes.push("xai-A2");
  await accounts.freshen("acct-a");
  await turn(one, "turn-5 on A after refresh");
  check(
    "a pi-ai refresh reached A's server on its next request",
    authOf("turn-5 on A after refresh")[0] === "Bearer xai-A2",
    authOf("turn-5 on A after refresh")
  );

  // 3. A usage-limit 429 ends the turn; moved as the hub moves it, it carries on.
  let limited = await open("probe-limit", "acct-limited", MOCKAI);
  started = performance.now();
  const refused = await turn(limited, "turn-L at the limit");
  const refusedMs = performance.now() - started;
  check(
    "the 429 ended the turn on the provider's own words, which the hub's at-limit rule reads",
    refused.result.is_error === true &&
      providerLimitRefused(refused.result.errors ?? []),
    { errors: refused.result.errors, msToRefusal: Math.round(refusedMs) }
  );
  limited = await move("probe-limit", limited, "acct-m", MOCKAI);
  const carried = await turn(limited, "turn-L continued on M");
  const movedMs = performance.now() - started;
  check(
    "the session moved to another account and carried on within seconds",
    !carried.result.is_error &&
      authOf("turn-L continued on M", "mockai-mock")[0] === "Bearer key-M" &&
      movedMs < 30_000,
    {
      auth: authOf("turn-L continued on M", "mockai-mock"),
      secondsFrom429ToAnswer: Math.round(movedMs / 100) / 10,
    }
  );

  // 4. A model on no account runs on the machine's own server.
  const plain = await open("probe-plain", undefined, "plain/plain-mock");
  await turn(plain, "turn-P on no account");
  check(
    "a model on no account ran on the machine's server with its own key",
    authOf("turn-P on no account", "plain-mock")[0] === "Bearer machine-key",
    authOf("turn-P on no account", "plain-mock")
  );

  // 4b. Memory: each server's whole process tree with a session on it, once
  // the fleet's MCP servers are synced into every running server as the
  // daemon syncs them on any fleet change.
  await harness.syncFleet(fleet);
  await Bun.sleep(3000);
  const trees = Object.fromEntries(
    await Promise.all(
      (await keeper.list()).procs
        .filter(
          (proc) => proc.alive && proc.procId.startsWith("opencode-server")
        )
        .map(
          async (proc) =>
            [
              proc.procId.replace(PROC_UUID, ""),
              await treeOf(proc.pid),
            ] as const
        )
    )
  );
  console.log(`MEMORY TREES ${JSON.stringify(trees, null, 2)}`);
  const localMcpCopies = (tree: Tree) =>
    tree.processes.filter((row) => row.command.includes("fake-mcp.ts")).length;
  // Every session here is in one directory: an account's server holds at
  // most that directory's set (two local servers), none for its own.
  check(
    "an account's server runs the fleet's MCP servers only for its sessions' directory, none for its own",
    Object.entries(trees).every(
      ([id, tree]) =>
        !id.startsWith("opencode-server-account-") || localMcpCopies(tree) <= 2
    ),
    Object.fromEntries(
      Object.entries(trees).map(([id, tree]) => [
        id,
        { totalMiB: tree.totalMiB, localMcpProcesses: localMcpCopies(tree) },
      ])
    )
  );

  // 5. First starts, from OpenCode's own logs. The sandbox's config dir starts
  // with no `node_modules`, so the machine's first instance waits on
  // OpenCode's install of `@opencode-ai/plugin` there; each account's server
  // starts on an empty data dir of its own and shares that config dir.
  const machineBoots = await bootGaps(
    join(home, ".local", "share", "opencode", "log")
  );
  const installed = await Bun.file(
    join(
      home,
      ".config",
      "opencode",
      "node_modules",
      "@opencode-ai",
      "plugin",
      "package.json"
    )
  ).exists();
  check(
    "the machine's first start installed OpenCode's plugin dependency into the config dir every server shares",
    installed,
    { longestMachineBootMs: Math.max(...machineBoots) }
  );
  const accountBoots = Object.fromEntries(
    await Promise.all(
      ["acct-a", "acct-b", "acct-limited", "acct-m"].map(
        async (id) =>
          [
            id,
            {
              longestBootMs: Math.max(
                ...(await bootGaps(
                  join(accounts.opencodeAccountHome(id), "opencode", "log")
                ))
              ),
              installedInDataDir: (
                await Array.fromAsync(
                  new Bun.Glob("**/node_modules").scan({
                    cwd: accounts.opencodeAccountHome(id),
                    onlyFiles: false,
                  })
                )
              ).length,
            },
          ] as const
      )
    )
  );
  check(
    "no account server's first start on an empty data dir installed anything or waited on an install",
    Object.values(accountBoots).every(
      (boot) => boot.installedInDataDir === 0 && boot.longestBootMs < 5000
    ),
    accountBoots
  );

  // 6. Idle stop.
  const running = await servers();
  // Nothing changed an account's config or credential in this run, so no
  // account's server was replaced: one generation each.
  const generations = (account: string) =>
    running.filter((id) => id.startsWith(`opencode-server-account-${account}-`))
      .length;
  check(
    "each account's server was started once and never replaced",
    ["acct-a", "acct-b", "acct-limited", "acct-m"].every(
      (account) => generations(account) === 1
    ),
    running
  );
  for (const handle of [one, limited, plain]) {
    // biome-ignore lint/performance/noAwaitInLoops: each session leaves its server in turn
    await handle.session.dispose();
  }
  started = performance.now();
  const accountServers = (ids: string[]) =>
    ids.filter((id) => id.startsWith("opencode-server-account-"));
  const deadline = Date.now() + 8 * 60_000;
  let left = accountServers(await servers());
  while (left.length > 0 && Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: the probe watches the keeper until the idle servers are gone
    await Bun.sleep(5000);
    left = accountServers(await servers());
  }
  const after = await servers();
  check(
    "accounts' servers stopped once idle; the machine's kept running",
    left.length === 0 &&
      after.some((id) => !id.startsWith("opencode-server-account-")),
    {
      runningBefore: running,
      runningAfter: after,
      minutesToStop: Math.round((performance.now() - started) / 6000) / 10,
    }
  );
  console.log(
    JSON.stringify(
      {
        firstOpenWithMachineAndAccountServerStartMs: Math.round(firstStart),
        moveOntoAnAccountServerStartedForItMs: Math.round(moveToNewServer),
        memoryAfterFirstStart: memAfterStart,
        memoryAfterTurns: memAfterTurns,
      },
      null,
      2
    )
  );
} finally {
  await harness.dispose();
  await sessiond.drain(5000);
  keeper.close();
  await sessiond.close();
  await mock.stop(true);
  await hub.stop(true);
}
const failed = checks.filter((one) => !one.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
