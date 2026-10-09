/**
 * Real isolated probe of the file-tool gate on hosts that outlive a build:
 * a pi host and an OpenCode server started on an older gate form are
 * relaunched onto the current one the first moment they are idle, never
 * mid-turn, and then refuse what the workspace's policy denies; a
 * workspace session's chrome-devtools-mcp writes captures to the workspace's
 * scratch and refuses a path outside the clone and the scratch; two
 * workspaces' sessions on one OpenCode server each read back the output it
 * was told it saved and are refused the other's; and neither clone (each a
 * `git clone --shared` of this repository) shows anything CawCo wrote.
 *
 *   bun scripts/probe-gate-hosts.ts
 *
 * Runs on a private HOME, a private sessiond, a local mock model and fake
 * keys only; it never reaches fleet services or a real provider. The real
 * pi host, the real `opencode` binary and the real chrome-devtools-mcp run
 * here, driven through the agent's own harness code. The hub's part of a pi
 * relaunch — stop the session at its turn boundary, spawn it again on its
 * conversation — is played here as the hub's `relaunchOntoHook` plays it.
 */
import { chmod, copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dir, "..");

// ── The private machine ────────────────────────────────────────────────
// On disk under ~/.cache, not /tmp: chrome-devtools-mcp always lets a capture
// into its own temp dir, so the "outside" path must not lie under /tmp.
const sandbox =
  process.env.GATE_PROBE_SANDBOX ??
  join(
    homedir(),
    ".cache",
    `gate-hosts-probe-${crypto.randomUUID().slice(0, 8)}`
  );
if (!process.env.GATE_PROBE_SANDBOX) {
  // What the private HOME cannot find for itself: the fleet's pinned
  // chrome-devtools-mcp and the Chromium it drives, from the real caches.
  const npx = join(homedir(), ".npm", "_npx");
  const devtools = (
    await Array.fromAsync(
      new Bun.Glob("*/node_modules/chrome-devtools-mcp/package.json").scan({
        cwd: npx,
      })
    )
  ).map((file) => join(npx, file, ".."));
  const browsers = join(homedir(), ".cache", "ms-playwright");
  const chrome = (
    await Array.fromAsync(
      new Bun.Glob("chromium-*/chrome-linux*/chrome").scan({ cwd: browsers })
    )
  )
    .sort()
    .map((file) => join(browsers, file))
    .at(-1);
  if (!(devtools[0] && chrome)) {
    throw new Error(
      `chrome-devtools-mcp (${devtools[0] ?? "not in ~/.npm/_npx"}) and Playwright's Chromium (${chrome ?? "not in ~/.cache/ms-playwright"}) are required.`
    );
  }
  await mkdir(sandbox, { recursive: true });
  const home = join(sandbox, "home");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GATE_PROBE_SANDBOX: sandbox,
    GATE_PROBE_DEVTOOLS: devtools[0],
    GATE_PROBE_CHROME: chrome,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    CAWCO_SESSIOND_ENDPOINT: join(sandbox, "sessiond.sock"),
  };
  env.INVOCATION_ID = undefined;
  env.CAWCO_SERVICE_MODE = undefined;
  env.XPC_SERVICE_NAME = undefined;
  const child = Bun.spawn(
    [process.execPath, import.meta.path, ...process.argv.slice(2)],
    { env, stdout: "inherit", stderr: "inherit" }
  );
  const code = await child.exited;
  if (code === 0 && !process.env.GATE_PROBE_KEEP) {
    await rm(sandbox, { recursive: true, force: true });
  } else {
    console.log(`The sandbox is kept for reading: ${sandbox}`);
  }
  process.exit(code);
}
const home = join(sandbox, "home");
if (homedir() !== home) {
  throw new Error("Probe HOME isolation did not take effect.");
}
const endpoint = process.env.CAWCO_SESSIOND_ENDPOINT as string;
const devtoolsDir = process.env.GATE_PROBE_DEVTOOLS as string;
const chrome = process.env.GATE_PROBE_CHROME as string;

// ── What the agent says, kept for the checks ───────────────────────────
const said: string[] = [];
for (const level of ["log", "info", "warn"] as const) {
  const write = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    said.push(args.map(String).join(" "));
    write(...args);
  };
}

// ── The mock model ──────────────────────────────────────────────────────
// Chat Completions, which both pi (`openai-completions`) and OpenCode
// (`@ai-sdk/openai-compatible`) speak. What a turn does is named in its
// last user message:
//   HOLD <tag>        answer only once the probe releases <tag>
//   READ <path>       call the harness's `read` on <path>
//   SHOT <path>       call chrome-devtools' take_screenshot with filePath <path>
//   LONG              call `bash` on a command whose output OpenCode cuts
// A request whose last message is a tool result is answered in text.
interface Item {
  content?: unknown;
  role?: string;
}
interface Tool {
  function?: {
    description?: string;
    name?: string;
    parameters?: { properties?: object; required?: string[] };
  };
}
const textOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content)
    ? content.map((part: { text?: string }) => part.text ?? "").join(" ")
    : "";
};
const held = new Map<string, () => void>();
const holds = new Map<string, Promise<void>>();
const hold = (tag: string) => {
  let open = holds.get(tag);
  if (!open) {
    const { promise, resolve } = Promise.withResolvers<void>();
    held.set(tag, resolve);
    open = promise;
    holds.set(tag, open);
  }
  return open;
};
const release = (tag: string) => {
  hold(tag);
  held.get(tag)?.();
};
const requests: { text: string; tools: string[]; toolTurn: boolean }[] = [];
const chunk = (delta: object, finish: string | null) => ({
  id: "c",
  object: "chat.completion.chunk",
  created: 0,
  model: "mock",
  choices: [{ index: 0, delta, finish_reason: finish }],
});
const answer = (
  text: string,
  call?: { name: string; args: object },
  wait?: Promise<void>
) => {
  const events = [
    chunk(
      call
        ? {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: `call_${requests.length}`,
                type: "function",
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.args),
                },
              },
            ],
          }
        : { role: "assistant", content: text },
      null
    ),
    chunk({}, call ? "tool_calls" : "stop"),
    {
      ...chunk({}, null),
      choices: [],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    },
  ];
  const body = new ReadableStream({
    async start(controller) {
      await wait;
      for (const event of events) {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      }
      controller.enqueue("data: [DONE]\n\n");
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "content-type": "text/event-stream" },
  });
};
const PAGE_ID = /(\d+): /;
// A tool's path as the description writes its namespace: callable whether or
// not the bounded catalog shows that tool.
const SCREENSHOT_PATH = /(tools\["chrome-devtools"\])\./;
const HOLD = /HOLD (\S+)/;
const PI_LINE = /\[pi\] .* relaunched between turns/;
const GATE_LINE = /\[opencode\] gate: .* relaunched from gate form/;
const READ = /READ (\S+)/;
const SHOT = /SHOT (\S+)/;
const LONG = /\bLONG\b/;
/** OpenCode's hint naming the file it saved a cut output to (tool/truncate.ts at 1.18.34), as a tool result's JSON text carries it. */
const SAVED = /Full output saved to: ([^\s"\\]+)/;
/** 5000 lines: past OpenCode's 2000-line cut (tool/truncate.ts MAX_LINES), under the bash tool's own 30000 characters. */
const LONG_COMMAND = "seq 1 5000";
const mock = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    const body = (await request.json().catch(() => ({}))) as {
      messages?: Item[];
      model?: string;
      tools?: Tool[];
    };
    const items = body.messages ?? [];
    const text = textOf(
      items.filter((one) => one.role === "user").at(-1)?.content
    );
    const tools = (body.tools ?? []).map((tool) => tool.function?.name ?? "");
    const toolTurn = items.at(-1)?.role === "tool";
    requests.push({ text: text.slice(0, 120), tools, toolTurn });
    if (body.model === "title-mock") {
      return answer("A title");
    }
    if (toolTurn) {
      return answer(
        `tool said: ${textOf(items.at(-1)?.content).slice(0, 400)}`
      );
    }
    const holding = text.match(HOLD)?.[1];
    if (holding) {
      return answer(`released ${holding}`, undefined, hold(holding));
    }
    if (LONG.test(text)) {
      return answer("", {
        name: "bash",
        args: { command: LONG_COMMAND, description: "Count to five thousand" },
      });
    }
    const read = text.match(READ)?.[1];
    if (read) {
      const pi = tools.includes("ls");
      return answer("", {
        name: "read",
        args: pi ? { path: read } : { filePath: read },
      });
    }
    const shot = text.match(SHOT)?.[1];
    if (shot) {
      // OpenCode's code mode: MCP tools are reached through one `execute`
      // tool running a program, its description listing each tool's path
      // (`tools.<namespace>.<tool>(input)`). The fleet runs chrome-devtools
      // with page-id routing (its default): a fresh isolated browser's one
      // page is page 1.
      const execute = (body.tools ?? []).find(
        (one) => one.function?.name === "execute"
      )?.function;
      const path = execute?.description?.match(SCREENSHOT_PATH)?.[1];
      const key =
        execute?.parameters?.required?.[0] ??
        Object.keys(execute?.parameters?.properties ?? {})[0];
      return path && key
        ? answer("", {
            name: "execute",
            args: {
              [key]: `return await ${path}.take_screenshot(${JSON.stringify({ filePath: shot, pageId: 1 })})`,
            },
          })
        : answer(
            `no take_screenshot among: ${execute?.description?.slice(0, 2000) ?? tools.join(", ")}`
          );
    }
    return answer("ok");
  },
});
const baseURL = `${mock.url.origin}/v1`;

// ── The hub: its CawCo MCP and an empty delegation tool list ────────────
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
        serverInfo: { name: "gate-probe", version: "1" },
      },
      "tools/list": { tools: [] },
    };
    return Response.json({
      jsonrpc: "2.0",
      id: rpc.id,
      result: results[rpc.method] ?? {},
    });
  },
});
process.env.CAWCO_HUB_URL = `${hub.url.origin}/ws`;
await Bun.write(
  join(home, ".config", "cawco", "config.json"),
  JSON.stringify({ hubUrl: `${hub.url.origin}/ws` })
);
process.env.OPENCODE_DISABLE_MODELS_FETCH = "1";

// The machine's harness config: one fake-keyed provider at the mock, and the
// fleet's chrome-devtools-mcp as the agent's sync writes it for OpenCode.
const devtoolsCommand = [
  Bun.which("node") ?? "node",
  join(devtoolsDir, "build", "src", "bin", "chrome-devtools-mcp.js"),
  "--headless",
  "--isolated",
  `--executablePath=${chrome}`,
  "--chromeArg=--no-sandbox",
  "--no-usage-statistics",
  "--no-performance-crux",
];
await Bun.write(
  join(home, ".config", "opencode", "opencode.json"),
  JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    autoupdate: false,
    share: "disabled",
    model: "mock/mock-model",
    small_model: "mock/title-mock",
    provider: {
      mock: {
        name: "Mock",
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL, apiKey: "fake-key" },
        models: {
          "mock-model": { name: "Mock", tool_call: true },
          "title-mock": { name: "Title" },
        },
      },
    },
    mcp: {
      "chrome-devtools": {
        type: "local",
        enabled: true,
        command: devtoolsCommand,
      },
    },
  })
);
await Bun.write(
  join(home, ".pi", "agent", "models.json"),
  JSON.stringify({
    providers: {
      mock: {
        baseUrl: baseURL,
        api: "openai-completions",
        apiKey: "fake-key",
        models: [{ id: "mock-model" }],
      },
    },
  })
);

// ── The workspaces: each a clone, its policy, judge and boundary record ─
// Each clone is a `git clone --shared` of this repository, as a delegate's
// workspace is cut.
const paths = await import("../packages/core/src/paths");
const { workspacePolicy } = await import(
  "../packages/core/src/workspace-policy"
);
const { JUDGE_SCRIPT } = await import("../packages/agent/src/boundary");
await mkdir(paths.workspaceCacheDir(), { recursive: true });
const workspaceAt = async (id: string, dir: string) => {
  await Bun.$`git clone -q --shared ${ROOT} ${dir}`.quiet();
  const state = paths.workspaceStateDir(id);
  const tmp = paths.workspaceScratchDir(id);
  await mkdir(tmp, { recursive: true });
  const policy = paths.workspacePolicyFile(id);
  await Bun.write(
    policy,
    JSON.stringify(await workspacePolicy({ id, path: dir }), null, 2)
  );
  await copyFile(
    join(ROOT, "packages", "core", "src", "workspace-judge.ts"),
    join(state, JUDGE_SCRIPT)
  );
  const exec = join(state, "exec");
  await Bun.write(exec, '#!/bin/sh\nexec /bin/sh -c "$1"\n');
  await chmod(exec, 0o755);
  const record = {
    exec,
    hook: join(state, "hook"),
    pid: process.pid,
    policy,
    scratch: tmp,
  };
  await Bun.write(
    join(state, "boundary.json"),
    JSON.stringify({
      ...record,
      path: dir,
      identity: "probe",
      form: "probe",
    })
  );
  return { id, clone: dir, scratch: tmp, policyFile: policy, boundary: record };
};
const WS = "gate-probe-ws";
const other = await workspaceAt("gate-probe-ws-b", join(sandbox, "clone-b"));
const { clone, scratch, policyFile, boundary } = await workspaceAt(
  WS,
  join(sandbox, "clone")
);
// A file the policy denies: in the home dir, outside every path it reads back.
const secret = join(home, "secret.txt");
await Bun.write(secret, "not for the workspace\n");

const { SessiondServer } = await import("../packages/sessiond/src/server");
const { SessiondClient } = await import(
  "../packages/agent/src/sessiond-client"
);
const { BOUNDARY_RELAUNCH, mcpGatewayPort, CAWCO_ENV } = await import(
  "../packages/core/src/index"
);
const { gateForm } = await import("../packages/agent/src/gate-form");
const { parseProcId, procIdFor } = await import(
  "../packages/agent/src/proc-id"
);
const { PiRemoteSession } = await import(
  "../packages/agent/src/harnesses/pi-sessiond"
);
const { PiHarness } = await import("../packages/agent/src/harnesses/pi");
const { OpencodeHarness } = await import(
  "../packages/agent/src/harnesses/opencode"
);
type Neutral = import("../packages/core/src/index").NeutralMessage;
type Context = import("../packages/agent/src/harness").HarnessContext;
type Session = import("../packages/agent/src/harness").HarnessSession;

const sessiond = new SessiondServer();
await sessiond.listen(endpoint);
const keeper = await SessiondClient.connect(endpoint);

// ── Helpers ─────────────────────────────────────────────────────────────
const waiters = new Set<() => void>();
const wake = () => {
  for (const waiter of waiters) {
    waiter();
  }
};
setInterval(wake, 250).unref();
const until = <T>(read: () => T | undefined, ms: number, what: string) =>
  new Promise<T>((resolve, reject) => {
    const check = () => {
      const value = read();
      if (value !== undefined && value !== false) {
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

interface Watch {
  busy: boolean;
  ctx: Context;
  frames: Neutral[];
}
const watch = (
  instanceId: string,
  at: { boundary: typeof boundary; clone: string } = { boundary, clone }
): Watch => {
  const seen: Watch = {
    busy: false,
    frames: [],
    ctx: {
      instanceId,
      cwd: at.clone,
      boundary: at.boundary,
      busy: (active) => {
        seen.busy = active;
        wake();
      },
      session: () => undefined,
      frame: (frame) => {
        seen.frames.push(frame);
        wake();
      },
      permission: (request) =>
        console.warn(`unexpected permission ${request.toolName}`),
      failed: (error) => console.warn(`failed: ${String(error)}`),
      rejected: (_uuid, error) => console.warn(`rejected: ${String(error)}`),
      emit: () => undefined,
      keeperRefused: (error) => console.warn(`keeper refused: ${error}`),
      recordSessionAddress: async () => undefined,
    },
  };
  return seen;
};
const relaunchAsked = (seen: Watch) =>
  seen.frames.findIndex(
    (frame) => frame.type === "system" && frame.subtype === BOUNDARY_RELAUNCH
  );
const resultAfter = (seen: Watch, from: number) =>
  seen.frames.slice(from).find((frame) => frame.type === "result");
const message = (text: string) => ({
  message: { role: "user" as const, content: text },
  origin: { kind: "human" as const },
  uuid: crypto.randomUUID(),
});
/** Sends a turn and returns every tool result it produced, as text, once it ends. */
const turn = async (session: Session, seen: Watch, text: string) => {
  const from = seen.frames.length;
  session.send(message(text) as never, {});
  await until(() => resultAfter(seen, from), 120_000, `the end of "${text}"`);
  return seen.frames.slice(from).flatMap((frame) => {
    const content = (frame as { message?: { content?: unknown } }).message
      ?.content;
    return Array.isArray(content)
      ? content
          .filter((block) => block?.type === "tool_result")
          .map((block) => ({
            error: block.is_error === true,
            text: JSON.stringify(block.content ?? ""),
          }))
      : [];
  });
};
const sawRequest = (marker: string) =>
  requests.some(
    (request) => request.text.includes(marker) && !request.toolTurn
  );
const saidLine = (pattern: RegExp) => said.find((line) => pattern.test(line));

const checks: { name: string; ok: boolean; detail: unknown }[] = [];
const check = (name: string, ok: boolean, detail: unknown) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(detail)}`);
};
const OLD_FORM = "0123456789abcdef";
const NOT_BEFORE_MS = 5000;

const pi = new PiHarness();
const opencode = new OpencodeHarness();
opencode.setCustodyReadiness(() => true);
let earlier: InstanceType<typeof OpencodeHarness> | undefined;

try {
  // ── 1. pi ─────────────────────────────────────────────────────────────
  // An earlier build's agent starts the host, as spawnPi does, on its form,
  // and a turn; then that agent is gone.
  const PI = "gate-probe-pi";
  const spec = {
    instanceId: PI,
    cwd: clone,
    harness: "pi" as const,
    model: "mock/mock-model",
    permissionMode: "bypassPermissions" as const,
  };
  const earlierAgent = await SessiondClient.connect(endpoint);
  await earlierAgent.spawnProc(procIdFor("pi", PI), {
    command: process.execPath,
    args: [join(ROOT, "packages", "agent", "src", "harnesses", "pi-host.ts")],
    cwd: clone,
    env: { [CAWCO_ENV.mcpPort]: String(mcpGatewayPort()) },
  });
  const started = (await earlierAgent.list()).procs.find(
    (proc) => proc.procId === procIdFor("pi", PI)
  );
  const before = watch(PI);
  const host = new PiRemoteSession(
    earlierAgent,
    before.ctx,
    started?.pid ?? 0,
    0
  );
  await host.write({ type: "start", spec, boundary, gateForm: OLD_FORM });
  await host.request({ type: "snapshot" });
  host.send(message("HOLD pi-turn") as never, {});
  await until(() => sawRequest("HOLD pi-turn"), 60_000, "pi's held turn");
  earlierAgent.close();

  // This build's agent attaches to it mid-turn.
  const adopted = watch(PI);
  const head =
    (await keeper.list()).procs.find(
      (proc) => proc.procId === procIdFor("pi", PI)
    )?.head ?? 0;
  const piSession = await pi.adopt(PI, adopted.ctx, { head });
  piSession.attached?.();
  // Through the session's own subscription: `piSnapshot` is for a host no
  // session is attached to, and ends the subscription it reads on.
  const stateOf = async (session: Session) =>
    (await (session as InstanceType<typeof PiRemoteSession>).request({
      type: "snapshot",
    })) as { busy: boolean; gateForm?: string };
  const recorded = await stateOf(piSession);
  await Bun.sleep(NOT_BEFORE_MS);
  const askedMidTurn = relaunchAsked(adopted);
  release("pi-turn");
  await until(() => resultAfter(adopted, 0), 60_000, "pi's turn end");
  const resultAt = adopted.frames.findIndex((frame) => frame.type === "result");
  await until(() => relaunchAsked(adopted) >= 0, 10_000, "pi's relaunch ask");
  const askedAt = relaunchAsked(adopted);
  // The hub at that turn boundary: the session is idle, so it is relaunched
  // on its conversation, as `relaunchOntoHook` → `resumeSpawn` does.
  const sessionKey = piSession.sessionId as string;
  await piSession.stop();
  const relaunched = watch(PI);
  const piNew = await pi.spawn(
    { ...spec, resume: { sessionKey }, relaunch: true },
    relaunched.ctx
  );
  piNew.attached?.();
  const now = await stateOf(piNew);
  await Bun.sleep(1000);
  check(
    "pi: a host started on an older gate is relaunched once idle, not before",
    recorded.gateForm === OLD_FORM &&
      recorded.busy &&
      askedMidTurn === -1 &&
      askedAt > resultAt &&
      now.gateForm === gateForm("pi") &&
      relaunchAsked(relaunched) === -1,
    {
      recordedForm: recorded.gateForm,
      busyAtAttach: recorded.busy,
      askedWhileTurnRan: askedMidTurn !== -1,
      askedAfterTurnEnd: askedAt > resultAt,
      relaunchedForm: now.gateForm,
      currentForm: gateForm("pi"),
      line: saidLine(PI_LINE),
    }
  );
  const piRead = await turn(piNew, relaunched, `READ ${secret}`);
  check(
    "pi: the relaunched host refuses a read the policy denies",
    piRead.some((one) => one.error && one.text.includes("does not read")),
    piRead
  );
  await piNew.dispose();

  // ── 2. OpenCode ───────────────────────────────────────────────────────
  // An earlier agent's server, with a session mid-turn on it; its record
  // names the form that earlier build launched it on.
  const OC = "gate-probe-opencode";
  const ocSpec = {
    instanceId: OC,
    cwd: clone,
    harness: "opencode" as const,
    model: "mock/mock-model",
    permissionMode: "bypassPermissions" as const,
    workspace: { id: WS, path: clone },
  };
  earlier = new OpencodeHarness();
  earlier.setCustodyReadiness(() => true);
  const first = watch(OC);
  const ocFirst = await earlier.spawn(ocSpec, first.ctx);
  ocFirst.attached?.();
  ocFirst.send(message("HOLD oc-turn") as never, {});
  await until(
    () => sawRequest("HOLD oc-turn"),
    120_000,
    "OpenCode's held turn"
  );
  const ocKey = ocFirst.sessionId as string;
  await earlier.dispose();
  earlier = undefined;
  const cawco = join(home, ".cawco");
  const recordName = (await readdir(cawco)).find(
    (file) =>
      file.startsWith("opencode-server-") &&
      file.endsWith(".json") &&
      !file.includes("-account-")
  );
  if (!recordName) {
    throw new Error("The machine's OpenCode server record was not written.");
  }
  const record = JSON.parse(await Bun.file(join(cawco, recordName)).text()) as {
    active: { launch?: string; pid: number; procId: string };
  };
  const launch = JSON.parse(record.active.launch ?? "[]") as [string, string][];
  record.active.launch = JSON.stringify(
    launch.map(([name, value]) =>
      name === "CAWCO_GATE_FORM" ? [name, OLD_FORM] : [name, value]
    )
  );
  await Bun.write(join(cawco, recordName), JSON.stringify(record));
  const oldServer = record.active;

  // This build's agent takes the session back mid-turn.
  const back = watch(OC);
  const ocSession = await opencode.reattach(
    { ...ocSpec, resume: { sessionKey: ocKey }, reattachOnly: "busy" },
    back.ctx
  );
  if (!ocSession) {
    throw new Error("OpenCode found no session to reattach.");
  }
  ocSession.attached?.();
  const gateLine = await until(
    () => saidLine(GATE_LINE),
    180_000,
    "OpenCode's server replacement"
  );
  const handoff = new RegExp(`\\[opencode\\] handoff ${OC}:`);
  await Bun.sleep(NOT_BEFORE_MS);
  const movedMidTurn = saidLine(handoff);
  const oldAliveMidTurn = (await keeper.list()).procs.some(
    (proc) => proc.procId === oldServer.procId && proc.alive
  );
  const releasedAt = said.length;
  release("oc-turn");
  await until(() => resultAfter(back, 0), 60_000, "OpenCode's turn end");
  await until(() => saidLine(handoff), 60_000, "the session's handoff");
  const movedAt = said.findIndex((line) => handoff.test(line));
  let oldGone = false;
  const deadline = Date.now() + 90_000;
  while (!oldGone && Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: the keeper is watched until the old server is retired
    oldGone = !(await keeper.list()).procs.some(
      (proc) => proc.procId === oldServer.procId && proc.alive
    );
    if (!oldGone) {
      await Bun.sleep(1000);
    }
  }
  check(
    "opencode: a server started on an older gate is relaunched; its session moves once idle, not before",
    gateLine.includes(`from gate form ${OLD_FORM} onto`) &&
      movedMidTurn === undefined &&
      oldAliveMidTurn &&
      movedAt >= releasedAt &&
      oldGone,
    {
      line: gateLine,
      movedWhileTurnRan: movedMidTurn !== undefined,
      oldServerAliveWhileTurnRan: oldAliveMidTurn,
      movedAfterTurnEnd: movedAt >= releasedAt,
      handoff: said[movedAt],
      oldServerRetired: oldGone,
    }
  );
  const ocRead = await turn(ocSession, back, `READ ${secret}`);
  check(
    "opencode: the relaunched server refuses a read the policy denies",
    ocRead.some((one) => one.text.includes("does not read")),
    ocRead
  );

  // ── 3. chrome-devtools-mcp captures ───────────────────────────────────
  // OpenCode: the workspace session's own server, through its MCP client.
  // Outside: the workspace caches, which the policy writes but are not one
  // of chrome-devtools' roots; and the machine's temp dir, chrome-devtools'
  // own root, which the policy does not write.
  const inScratch = join(scratch, "opencode-shot.png");
  const outside = join(paths.workspaceCacheDir(), "opencode-outside.png");
  const inTmp = join("/tmp", `gate-probe-${crypto.randomUUID()}.png`);
  const ocShot = await turn(ocSession, back, `SHOT ${inScratch}`);
  const ocOutside = await turn(ocSession, back, `SHOT ${outside}`);
  const ocTmp = await turn(ocSession, back, `SHOT ${inTmp}`);
  check(
    "opencode: chrome-devtools writes a capture to the scratch and refuses one outside the clone and scratch",
    (await Bun.file(inScratch).exists()) &&
      !(await Bun.file(outside).exists()) &&
      ocOutside.some((one) =>
        one.text.includes("is not within any of the configured workspace roots")
      ) &&
      !(await Bun.file(inTmp).exists()) &&
      ocTmp.some((one) =>
        one.text.includes("outside what this workspace writes")
      ),
    {
      inScratch: ocShot,
      outside: ocOutside,
      inTmp: ocTmp,
      lastAnswers: back.frames
        .filter((frame) => frame.type === "assistant")
        .slice(-2)
        .map((frame) => JSON.stringify(frame).slice(0, 600)),
    }
  );

  // Claude: chrome-devtools-mcp as a workspace session's CLI runs it, its
  // client answering `roots/list` with the launch directory and the
  // additional working directory the session is given (its scratch).
  const claudeShot = await claudeCaptures(
    join(scratch, "claude-shot.png"),
    join(paths.workspaceCacheDir(), "claude-outside.png")
  );
  // Its boundary hook judges the call before chrome-devtools sees it, by the
  // judge and policy this probe's OpenCode server used.
  const { judgeCall, readPolicy } = await import(
    "../packages/core/src/workspace-judge"
  );
  const hookSays = (filePath: string) =>
    judgeCall(readPolicy(policyFile), {
      harness: "claude",
      tool: "mcp__chrome-devtools__take_screenshot",
      input: { filePath, pageId: 1 },
      cwd: clone,
    });
  const hookScratch = hookSays(join(scratch, "claude-shot.png"));
  const hookTmp = hookSays(inTmp);
  check(
    "claude: chrome-devtools writes a capture to the scratch and refuses one outside the clone and scratch",
    claudeShot.inScratch &&
      claudeShot.outsideRefused &&
      hookScratch.ok &&
      !hookTmp.ok,
    { ...claudeShot, hookOnScratch: hookScratch, hookOnTmp: hookTmp }
  );

  // ── 4. Saved outputs: two workspaces' sessions on one OpenCode server ─
  // Each runs a command whose output OpenCode cuts and saves, then reads
  // back its own saved output and the other session's.
  const B = "gate-probe-opencode-b";
  const seenB = watch(B, other);
  const sessionB = await opencode.spawn(
    {
      ...ocSpec,
      instanceId: B,
      cwd: other.clone,
      workspace: { id: other.id, path: other.clone },
    },
    seenB.ctx
  );
  sessionB.attached?.();
  const longA = await turn(ocSession, back, "LONG");
  const longB = await turn(sessionB, seenB, "LONG");
  const savedIn = (results: { text: string }[]) =>
    results.map((one) => one.text.match(SAVED)?.[1]).find(Boolean);
  const savedA = savedIn(longA);
  const savedB = savedIn(longB);
  if (!(savedA && savedB)) {
    throw new Error(
      `OpenCode named no saved output: ${JSON.stringify({ longA, longB })}`
    );
  }
  const servers = (await keeper.list()).procs.filter(
    (proc) => proc.alive && parseProcId(proc.procId).kind === "opencode-server"
  );
  const ownA = await turn(ocSession, back, `READ ${savedA}`);
  const ownB = await turn(sessionB, seenB, `READ ${savedB}`);
  const crossA = await turn(ocSession, back, `READ ${savedB}`);
  const crossB = await turn(sessionB, seenB, `READ ${savedA}`);
  const readBack = (results: { error: boolean; text: string }[]) =>
    results.length > 0 &&
    results.every((one) => !(one.error || one.text.includes("was refused"))) &&
    results.some((one) => one.text.includes("1999"));
  const refusedRead = (results: { text: string }[]) =>
    results.some(
      (one) =>
        one.text.includes("was refused") && one.text.includes("does not read")
    );
  check(
    "opencode: on one server, each workspace session reads its own saved output and is refused the other's",
    servers.length === 1 &&
      savedA !== savedB &&
      readBack(ownA) &&
      readBack(ownB) &&
      refusedRead(crossA) &&
      refusedRead(crossB),
    {
      servers: servers.map((proc) => proc.procId),
      savedA,
      savedB,
      ownA: ownA.map((one) => one.text.slice(0, 160)),
      ownB: ownB.map((one) => one.text.slice(0, 160)),
      crossA,
      crossB,
    }
  );

  // ── 5. Nothing CawCo wrote shows in either clone ───────────────────────
  const statusOf = async (dir: string) => ({
    status: (await Bun.$`git -C ${dir} status --porcelain`.text()).trim(),
    ignored: (
      await Bun.$`git -C ${dir} status --porcelain --ignored`.text()
    ).trim(),
  });
  const statusA = await statusOf(clone);
  const statusB = await statusOf(other.clone);
  check(
    "git: neither workspace clone shows anything CawCo wrote, ignored files included",
    [statusA, statusB].every((one) => one.status === "" && one.ignored === ""),
    { [clone]: statusA, [other.clone]: statusB }
  );
  await sessionB.dispose();
} finally {
  await earlier?.dispose();
  await opencode.dispose();
  await sessiond.drain(5000);
  keeper.close();
  await sessiond.close();
  await mock.stop(true);
  await hub.stop(true);
}

/**
 * chrome-devtools-mcp under a minimal MCP client that declares `roots` and
 * answers `roots/list` as Claude Code does for a workspace session: its
 * launch directory (the clone) and its additional working directory (the
 * scratch). Takes a capture into each path; says which were written.
 */
async function claudeCaptures(
  inScratch: string,
  outside: string
): Promise<{
  inScratch: boolean;
  outsideRefused: boolean;
  outsideAnswer: string;
}> {
  const [command, ...args] = devtoolsCommand;
  const server = Bun.spawn([command as string, ...args], {
    cwd: clone,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  });
  const pending = new Map<number, (value: unknown) => void>();
  let id = 0;
  const send = (body: object) =>
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...body })}\n`);
  const call = (method: string, params: object) => {
    id += 1;
    const { promise, resolve } = Promise.withResolvers<unknown>();
    pending.set(id, resolve);
    send({ id, method, params });
    return promise;
  };
  (async () => {
    let buffer = "";
    for await (const bytes of server.stdout) {
      buffer += new TextDecoder().decode(bytes);
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line.trim()) {
          continue;
        }
        const rpc = JSON.parse(line) as {
          id?: number;
          method?: string;
          result?: unknown;
          error?: unknown;
        };
        if (rpc.method === "roots/list" && rpc.id !== undefined) {
          send({
            id: rpc.id,
            result: {
              roots: [clone, scratch].map((dir) => ({
                uri: pathToFileURL(dir).href,
              })),
            },
          });
        } else if (rpc.id !== undefined && !rpc.method) {
          pending.get(rpc.id)?.(rpc.result ?? rpc.error);
          pending.delete(rpc.id);
        }
      }
    }
  })().catch(() => undefined);
  try {
    await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: "claude-code", version: "probe" },
    });
    send({ method: "notifications/initialized" });
    // Page-id routing is on (the fleet's launch keeps its default): the
    // screenshot names the page `list_pages` reports.
    const pages = JSON.stringify(
      await call("tools/call", { name: "list_pages", arguments: {} })
    );
    const pageId = Number(pages.match(PAGE_ID)?.[1] ?? 1);
    const shoot = (filePath: string) =>
      call("tools/call", {
        name: "take_screenshot",
        arguments: { filePath, pageId },
      });
    await shoot(inScratch);
    const refused = JSON.stringify(await shoot(outside));
    return {
      inScratch: await Bun.file(inScratch).exists(),
      outsideRefused:
        !(await Bun.file(outside).exists()) &&
        refused.includes("is not within any of the configured workspace roots"),
      outsideAnswer: refused.slice(0, 300),
    };
  } finally {
    server.kill();
    await server.exited;
  }
}

const failed = checks.filter((one) => !one.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length === 0) {
  console.log(
    "gate hosts probe: pi relaunched idle, opencode relaunched idle, capture to scratch ok, outside refused, saved outputs read only by their session, clones clean"
  );
}
process.exit(failed.length ? 1 : 0);
