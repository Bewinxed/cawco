/**
 * Real isolated probe of the file-tool gate on hosts that outlive a build:
 * a pi host and an OpenCode server started on an older gate form are
 * relaunched onto the current one the first moment they are idle, never
 * mid-turn, and then refuse what the workspace's policy denies; a
 * workspace session's chrome-devtools-mcp, reached through the workspace's
 * MCP gate on the agent's gateway, which runs it on the host through the
 * workspace's door and the DevTools gate (a local Chromium: the runtime is
 * hidden), writes captures to the workspace's scratch and refuses a path
 * outside the clone and the scratch; two
 * workspaces' sessions on one OpenCode server each read back the output it
 * was told it saved and are refused the other's; a session in a directory
 * inside a clone is judged and bounded as that clone's; the opencode.jsonc
 * CawCo once wrote into clones is removed at the agent's start and nothing
 * else is; and neither clone (each a `git clone --shared` of this
 * repository) shows anything CawCo wrote.
 *
 *   bun scripts/probe-gate-hosts.ts
 *
 * Runs on a private HOME, a private sessiond, a local mock model and fake
 * keys only; it never reaches fleet services or a real provider. The real
 * pi host, the real `opencode` binary, the real chrome-devtools-mcp and the
 * agent's own browser registry and gate run here, driven through the
 * agent's own harness code. The hub's part of a pi
 * relaunch — stop the session at its turn boundary, spawn it again on its
 * conversation — is played here as the hub's `relaunchAtRest` plays it.
 */
import { chmod, copyFile, mkdir, readdir, rm, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { GATE_PATH } from "../packages/agent/src/mcp-gate";
import { readWithin } from "../packages/core/src/bounded";

const ROOT = join(import.meta.dir, "..");

/**
 * The chrome-devtools-mcp the door launches: 1.11.0 reads `--config`
 * (browser/door.ts), as the browser-gate and browser-cutover specs pin it.
 */
const DEVTOOLS_MCP = "chrome-devtools-mcp@1.11.0";

/**
 * It, with `args`, as the fleet's sync resolves a fleet MCP's `npx -y`
 * (mcp-launcher.ts): installed once under the private HOME's data dir and
 * launched from there with node.
 */
const devtoolsLaunch = async (args: string[]) => {
  const { resolveMcpLauncher } =
    await import("../packages/agent/src/mcp-launcher");
  const launcher = await resolveMcpLauncher({
    command: "npx",
    args: ["-y", DEVTOOLS_MCP, ...args],
  });
  if (!("config" in launcher)) {
    throw new Error(
      `${DEVTOOLS_MCP}: ${"failed" in launcher ? launcher.failed : launcher.unavailable}`
    );
  }
  if (!("command" in launcher.config)) {
    throw new Error(`${DEVTOOLS_MCP}: not a command`);
  }
  return {
    command: launcher.config.command,
    args: launcher.config.args ?? [],
    env: launcher.config.env ?? {},
  };
};

// ── The private machine ────────────────────────────────────────────────
// On disk under ~/.cache, not /tmp: chrome-devtools-mcp always lets a capture
// into its own temp dir, so the "outside" path must not lie under /tmp.
// `GATE_PROBE_ROOT` names another dir to hold it, for a run whose ~/.cache
// is not writable; never one under the temp dir.
const sandboxRoot = process.env.GATE_PROBE_ROOT ?? join(homedir(), ".cache");
if (!process.env.GATE_PROBE_SANDBOX && sandboxRoot.startsWith(tmpdir())) {
  throw new Error(
    `GATE_PROBE_ROOT ${sandboxRoot} is under the temp dir (${tmpdir()}), which chrome-devtools-mcp always writes.`
  );
}
const sandbox =
  process.env.GATE_PROBE_SANDBOX ??
  join(sandboxRoot, `gate-hosts-probe-${crypto.randomUUID().slice(0, 8)}`);
if (!process.env.GATE_PROBE_SANDBOX) {
  // What the private HOME cannot find for itself: npm's cache, from which the
  // run installs the pinned chrome-devtools-mcp as the fleet's sync does
  // (`devtoolsLaunch`), and Playwright's Chromium, which the agent's local
  // browser runs.
  const { resolveBin } = await import("../packages/agent/src/tools");
  const npm = resolveBin("npm");
  if (!npm) {
    throw new Error(
      "npm is required: the fleet installs chrome-devtools-mcp with it."
    );
  }
  const npmCache = (await Bun.$`${npm} config get cache`.text()).trim();
  const browsers = join(homedir(), ".cache", "ms-playwright");
  // The machine's own agent holds the default gate port: this one is free.
  const probe = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: () => undefined },
  });
  const gatePort = probe.port;
  probe.stop(true);
  await mkdir(sandbox, { recursive: true });
  const home = join(sandbox, "home");
  const runtimeDir = join(sandbox, "run");
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GATE_PROBE_SANDBOX: sandbox,
    npm_config_cache: npmCache,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? browsers,
    CAWCO_BROWSER_GATE_PORT: String(gatePort),
    // The local host: a Chromium of the agent's, behind the gate.
    DOCKER_HOST: "unix:///nonexistent",
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    CAWCO_SESSIOND_ENDPOINT: join(sandbox, "sessiond.sock"),
    // Its own runtime dir: the live agent keeps its sockets in the real one
    // (core paths.ts `hubCredentialSocket`).
    XDG_RUNTIME_DIR: runtimeDir,
  };
  env.INVOCATION_ID = undefined;
  env.CAWCO_SERVICE_MODE = undefined;
  env.XPC_SERVICE_NAME = undefined;
  // git's own template, as a delegate's workspace is cut with: a caller's
  // (a boundary names one of its own) can leave a clone without
  // `.git/info/exclude`, which the probe reads back.
  env.GIT_TEMPLATE_DIR = undefined;
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
//   BOUNDED           call `bash` on a command that names its boundary
// A request whose last message is a tool result is answered in text.
interface Item {
  content?: unknown;
  role?: string;
  tool_calls?: { function?: { arguments?: string; name?: string } }[];
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
/** The page new_page selected, in its answer as JSON (a line ends at a JSON-escaped newline). */
const SELECTED_PAGE = /(\d+): [^\\"]*\[selected\]/;
/** take_screenshot's namespace path as code mode writes it: `tools["x"]` or `tools.x`, nested or not, then the tool. */
const SCREENSHOT_PATH =
  /(tools(?:\["[^"]+"\]|\.[A-Za-z_$][\w$]*)*?)(?:\.take_screenshot|\["take_screenshot"\])/;
const SCREENSHOT_NAME = "take_screenshot";
/** The page new_page selected, in its answer as text. */
const SELECTED_LINE = /(\d+):[^\n]*\[selected\]/;
/** Where 2.0.29's Code Mode catalog (`Xl`/`Yi`) starts listing. */
const CATALOG = "## Available tools";
/** A Code Mode `search` call, as 2.0.29 names its input (`search({ query })`, synchronous). */
const SEARCH_CALL = "search({ query: ";
const HOLD = /HOLD (\S+)/;
const PI_LINE = /\[pi\] .* relaunched between turns/;
const GATE_LINE = /\[opencode\] gate: .* relaunched from gate form/;
const READ = /READ (\S+)/;
const SHOT = /SHOT (\S+)/;
const LONG = /\bLONG\b/;
/**
 * OpenCode's hint naming the file it saved a cut output to, as a tool
 * result's JSON text carries it. 2.0.29 (the installed binary's ToolOutput:
 * `maxLines:2000, maxBytes:51200`) writes `[showing lines 1-N of M; full
 * output saved to <path>]`; 1.18.34 wrote `Full output saved to: <path>`.
 */
const SAVED = /full output saved to:? ([^\s"\\\]]+)/i;
/** 5000 lines: past OpenCode's 2000-line cut, under CawCo's shell's own 30000 characters. */
const LONG_COMMAND = "seq 1 5000";
const BOUNDED = /\bBOUNDED\b/;
/** What the probe's boundary runner sets; OpenCode's own bash never has it. */
const BOUNDED_COMMAND = 'echo "boundary=$CAWCO_PROBE_BOUNDARY pwd=$PWD"';
const PATH_PARAM = /path/i;
/** A tool's parameter names: required first, then the rest. */
const paramsOf = (tool: Tool): string[] => {
  const required = tool.function?.parameters?.required ?? [];
  const all = Object.keys(tool.function?.parameters?.properties ?? {});
  return [...required, ...all.filter((name) => !required.includes(name))];
};
/** The parameter a file tool takes its path by, as its schema names it (OpenCode's `read` took `filePath`, now `path`). */
const pathKeyOf = (tool: Tool): string | undefined =>
  paramsOf(tool).find((name) => PATH_PARAM.test(name));
/** The tool that runs a shell command, by what it offers: a `command` parameter. */
const shellOf = (offered: Tool[]): { name: string; tool: Tool } | undefined => {
  const tool = offered.find((one) => paramsOf(one).includes("command"));
  const name = tool?.function?.name;
  return tool && name ? { name, tool } : undefined;
};
/** Of `values`, those `tool`'s schema names. */
const argsFor = (tool: Tool, values: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(values).filter(([name]) => paramsOf(tool).includes(name))
  );
/**
 * The namespace path whose tools hold `take_screenshot`, as the text a
 * model reads names it: a catalog line's signature, or a `search` result
 * (its JSON's escaped quotes read back as quotes). 2.0.29's `execute`
 * says "Call tools through `tools` using only exact paths and signatures
 * from the catalog … preserve bracket notation".
 */
const screenshotPathOf = (text: string): string | undefined =>
  text.replaceAll('\\"', '"').match(SCREENSHOT_PATH)?.[1];
/** Parsed while it is JSON text: a Code Mode program's value comes back as JSON inside the tool's text. */
const unwrapped = (text: string): unknown => {
  let value: unknown = text;
  while (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};
/** The namespace path a `search` program's result names for take_screenshot: the item whose `path` ends in it. */
const searchedPathOf = (text: string): string | undefined =>
  (
    (unwrapped(text) as { found?: { items?: { path?: string }[] } } | null)
      ?.found?.items ?? []
  )
    .map((one) => one.path ?? "")
    .find((path) => path.endsWith(`.${SCREENSHOT_NAME}`))
    ?.slice(0, -(SCREENSHOT_NAME.length + 1));
/**
 * The Code Mode catalog the request carries, wherever 2.0.29 put it (the
 * newest message holding `## Available tools`, of any role); none when the
 * request has none.
 */
const catalogOf = (items: Item[]): string | undefined =>
  items
    .map((one) => textOf(one.content))
    .findLast((one) => one.includes(CATALOG))
    ?.split(CATALOG)
    .at(-1);
/** `execute`'s one input, as its schema names it. */
const programKeyOf = (execute: Tool["function"]) =>
  execute?.parameters?.required?.[0] ??
  Object.keys(execute?.parameters?.properties ?? {})[0];
/**
 * The capture, through the namespace at `path`: through the gate the
 * workspace sees its own pages alone, so it opens one and captures it by
 * the id new_page selected.
 */
const captureCall = (key: string, path: string, shot: string) =>
  answer("", {
    name: "execute",
    args: {
      [key]: [
        `const opened = await ${path}.new_page({ url: "about:blank" });`,
        String.raw`const pageId = Number(JSON.stringify(opened).match(/(\d+): [^\\"]*\[selected\]/)?.[1]);`,
        `return await ${path}.take_screenshot({ filePath: ${JSON.stringify(shot)}, pageId });`,
      ].join("\n"),
    },
  });
/** Whether the last assistant turn ran `search` (its program, as the request echoes it). */
const searched = (items: Item[]) =>
  items
    .findLast((one) => one.role === "assistant")
    ?.tool_calls?.some((call) =>
      call.function?.arguments?.includes(SEARCH_CALL)
    ) ?? false;
/**
 * A `SHOT` turn under OpenCode's code mode, as a model takes it: MCP tools
 * are reached only through `execute`, by the path the catalog lists, else
 * by the path a `search` program returns (2.0.29: "The catalog is partial.
 * Inside `execute`, use `search(...)` to find a tool, then call it by the
 * `path` in the result").
 */
const shotCall = (
  body: { messages?: Item[]; tools?: Tool[] },
  shot: string
) => {
  const items = body.messages ?? [];
  const offered = body.tools ?? [];
  const names = offered.map((one) => one.function?.name ?? "");
  if (!loggedCatalog) {
    loggedCatalog = true;
    const codeMode = items
      .map((one) => `${one.role}: ${textOf(one.content)}`)
      .filter((one) => one.includes("Code Mode") || one.includes("chrome"))
      .map((one) => one.slice(0, 1500));
    console.log(
      `[gate-probe] code-mode request: keys ${Object.keys(body).join(", ")}; roles ${items.map((one) => one.role).join(", ")}; tools ${names.join(", ")}; messages naming Code Mode or chrome:\n${codeMode.join("\n---\n") || "(none)"}`
    );
  }
  // Offered directly (a server outside Code Mode): its own tools, by name.
  const direct = names.find((name) => name.endsWith(SCREENSHOT_NAME));
  if (direct) {
    return directShot(items, direct.slice(0, -SCREENSHOT_NAME.length), shot);
  }
  const execute = offered.find(
    (one) => one.function?.name === "execute"
  )?.function;
  const key = programKeyOf(execute);
  if (!key) {
    return answer(`no execute tool among: ${names.join(", ")}`);
  }
  if (items.at(-1)?.role === "tool") {
    const found = textOf(items.at(-1)?.content);
    const path = searched(items) ? searchedPathOf(found) : undefined;
    return path
      ? captureCall(key, path, shot)
      : answer(`tool said: ${found.slice(0, 2000)}`);
  }
  const path = screenshotPathOf(catalogOf(items) ?? "");
  // Beside the search, the runtime's namespaces and their tools: OpenCode's
  // own pointer for names ("Use Object.keys(tools) for names").
  return path
    ? captureCall(key, path, shot)
    : answer("", {
        name: "execute",
        args: {
          [key]: [
            `const found = ${SEARCH_CALL}"take_screenshot" });`,
            "const spaces = Object.keys(tools);",
            "return { found, spaces: Object.fromEntries(spaces.map((space) => [space, Object.keys(tools[space])])) };",
          ].join("\n"),
        },
      });
};
/** The tool the last assistant turn called, by name. */
const lastCalled = (items: Item[]) =>
  items.findLast((one) => one.role === "assistant")?.tool_calls?.at(-1)
    ?.function?.name;
/** A `SHOT` turn through a server's own tools, `prefix` naming them: new_page, then take_screenshot of the page it selected. */
const directShot = (items: Item[], prefix: string, shot: string) => {
  if (items.at(-1)?.role !== "tool") {
    return answer("", {
      name: `${prefix}new_page`,
      args: { url: "about:blank" },
    });
  }
  const result = textOf(items.at(-1)?.content);
  if (lastCalled(items) !== `${prefix}new_page`) {
    return answer(`tool said: ${result.slice(0, 2000)}`);
  }
  const pageId = Number(result.match(SELECTED_LINE)?.[1]);
  return answer("", {
    name: `${prefix}${SCREENSHOT_NAME}`,
    args: { filePath: shot, pageId },
  });
};
let loggedCatalog = false;
/** A turn's `BOUNDED`, `LONG` or `READ`, as the tools it offers take it; none for any other. */
const shellOrReadCall = (
  text: string,
  offered: Tool[]
): Response | undefined => {
  const names = offered.map((one) => one.function?.name ?? "").join(", ");
  if (BOUNDED.test(text) || LONG.test(text)) {
    const command = BOUNDED.test(text) ? BOUNDED_COMMAND : LONG_COMMAND;
    const shell = shellOf(offered);
    return shell
      ? answer("", {
          name: shell.name,
          args: argsFor(shell.tool, {
            command,
            description: "Run the probe's command",
          }),
        })
      : answer(`no shell tool among: ${names}`);
  }
  const read = text.match(READ)?.[1];
  if (!read) {
    return;
  }
  const tool = offered.find((one) => one.function?.name === "read");
  const key = tool ? pathKeyOf(tool) : undefined;
  return key
    ? answer("", { name: "read", args: { [key]: read } })
    : answer(`no read tool with a path among: ${names}`);
};
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
    const shot = text.match(SHOT)?.[1];
    if (shot) {
      return shotCall(body, shot);
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
    const shellOrRead = shellOrReadCall(text, body.tools ?? []);
    if (shellOrRead) {
      return shellOrRead;
    }
    return answer("ok");
  },
});
const baseURL = `${mock.url.origin}/v1`;

// ── The hub: its CawCo MCP and an empty delegation tool list ────────────
const hub = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  // It is the harnesses' MCP gateway here too, and a gate's tool call (a
  // browser's cold start) outlasts Bun's 10 s idle cut, as the agent's own
  // gateway is served with none (mcp-oauth.ts).
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/delegation/tools") {
      return Response.json({ tools: [] });
    }
    // A workspace's MCP gate, as the agent's gateway serves it (mcp-oauth.ts):
    // this server is the harnesses' gateway here.
    const [, gate, gated] = url.pathname.match(GATE_PATH) ?? [];
    if (gate && gated) {
      const { mcpHost } = await import("../packages/agent/src/mcp-host");
      return await mcpHost.fetchGate(gate, gated, request);
    }
    // A session's credential, acknowledged as the hub holds it
    // (session-identity.ts `acknowledgeSessionCredential`).
    if (url.pathname === "/api/session-identities/ack") {
      return Response.json({ installed: true });
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
// Its own MCP gateway: the harnesses' CawCo tools (`harnessMcpUrl`) are this
// server's, never the live agent's on the default port. Read once per
// process (core `CAWCO_ENV.mcpPort`), so named before anything reads it.
process.env.CAWCO_MCP_PORT = String(hub.port);
// The machine's agent is the process holding the machine's hub link
// (machine-agent.ts): the daemon says so once its connection is proven, and
// OpenCode's server waits on it to start. This probe plays the agent, its
// hub the stand-in above.
const { holdHubLink } = await import("../packages/agent/src/machine-agent");
holdHubLink();
await Bun.write(
  join(home, ".config", "cawco", "config.json"),
  JSON.stringify({ hubUrl: `${hub.url.origin}/ws` })
);
process.env.OPENCODE_DISABLE_MODELS_FETCH = "1";

// The machine's harness config: one fake-keyed provider at the mock, and the
// fleet's chrome-devtools-mcp as the agent's sync writes it for OpenCode.
const devtools = await devtoolsLaunch([
  "--no-usage-statistics",
  "--no-performance-crux",
]);
const devtoolsCommand = [devtools.command, ...devtools.args];
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
        environment: devtools.env,
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

// ── The machine's first fleet sync ──────────────────────────────────────
// A fleet with nothing in it, converged by the agent's own sync before any
// spawn: its denials written first, as a sync's are as it arrives
// (denied-tools.ts `applyFleetDenials`), into the sidecar a spawn reads them
// from (`resolvedFleetDenials`), so no spawn waits for a hub this probe does
// not run.
const { applyFleetDenials } =
  await import("../packages/agent/src/denied-tools");
await applyFleetDenials([]);
const { syncFleetConfig } = await import("../packages/agent/src/fleet");
await syncFleetConfig({
  deniedTools: [],
  harnessConfig: [],
  hooks: [],
  hubOnlyMarketplaces: [],
  marketplaces: [],
  mcp: [],
  memory: null,
  placedMcp: [],
  placedMemory: [],
  placedSkills: [],
  pluginPayloads: [],
  plugins: [],
  skills: [],
});

// ── The workspaces: each a clone, its policy, judge and boundary record ─
// Each clone is a `git clone --shared` of this repository, as a delegate's
// workspace is cut.
const paths = await import("../packages/core/src/paths");
const { workspacePolicy } =
  await import("../packages/core/src/workspace-policy");
const { JUDGE_SCRIPT, addSpill } =
  await import("../packages/agent/src/boundary");
await mkdir(paths.workspaceCacheDir(), { recursive: true });
/** Workspace `id`'s policy, as its boundary writes it from its records. */
const writePolicy = async (id: string, dir: string) => {
  const policy = paths.workspacePolicyFile(id);
  await Bun.write(
    policy,
    JSON.stringify(await workspacePolicy({ id, path: dir }), null, 2)
  );
  return policy;
};
/**
 * A workspace session's launch, as session.ts plays it before the
 * harness's spawn: its harness names the folder it saves cut outputs in
 * (`Harness.spill`), the boundary adds it (boundary.ts `boundaryFor` →
 * `addSpill`), and the policy reads it from then on.
 */
const launched = async <S extends { cwd: string; instanceId: string }>(
  adapter: {
    spill?: (
      spec: S,
      cwd: string,
      workspace: string
    ) => Promise<{ dir: string; spec: S }>;
  },
  spec: S,
  at: { id: string; clone: string }
): Promise<S> => {
  const spill = await adapter.spill?.(spec, spec.cwd, at.id);
  if (!spill) {
    return spec;
  }
  await addSpill(at.id, spill.dir);
  await writePolicy(at.id, at.clone);
  return spill.spec;
};
const workspaceAt = async (id: string, dir: string) => {
  await Bun.$`git clone -q --shared ${ROOT} ${dir}`.quiet();
  const state = paths.workspaceStateDir(id);
  const tmp = paths.workspaceScratchDir(id);
  await mkdir(tmp, { recursive: true });
  const policy = await writePolicy(id, dir);
  await copyFile(
    join(ROOT, "packages", "core", "src", "workspace-judge.ts"),
    join(state, JUDGE_SCRIPT)
  );
  const exec = join(state, "exec");
  // The probe's boundary runner, on the real one's contract for OpenCode and
  // pi (boundary.ts `execScript`: `exec [--session] COMMAND`): it tags the
  // command's environment with its workspace, so a command's output says
  // which boundary ran it.
  await Bun.write(
    exec,
    [
      "#!/bin/sh",
      'if [ "$1" = --session ]; then shift; fi',
      `CAWCO_PROBE_BOUNDARY=${id} exec /bin/sh -c "$1"`,
      "",
    ].join("\n")
  );
  await chmod(exec, 0o755);
  const record = {
    claudeTmp: paths.workspaceClaudeTmpDir(id),
    exec,
    hook: join(state, "hook"),
    pid: process.pid,
    policy,
    prefix: join(state, "claude-prefix"),
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
// UUIDs, as the agent mints a workspace's id: its scratch dir is named by
// the first 8 characters (core paths.ts `workspaceScratchDir`), so two ids
// sharing those would share one scratch.
const WS = "0a7e0c41-6a1d-4c2e-9f3b-5d8e7a6b4c01";
const other = await workspaceAt(
  "0b7e0c42-6a1d-4c2e-9f3b-5d8e7a6b4c02",
  join(sandbox, "clone-b")
);
const { clone, scratch, policyFile, boundary } = await workspaceAt(
  WS,
  join(sandbox, "clone")
);
// A file the policy denies: in the home dir, outside every path it reads back.
const secret = join(home, "secret.txt");
await Bun.write(secret, "not for the workspace\n");

const { SessiondServer } = await import("../packages/sessiond/src/server");
const { SessiondClient } =
  await import("../packages/agent/src/sessiond-client");
const { welcomed } = await import("./lib/keeper-dial");
const { BOUNDARY_RELAUNCH, mcpGatewayPort, CAWCO_ENV } =
  await import("../packages/core/src/index");
const { gateForm } = await import("../packages/agent/src/gate-form");
const { parseProcId, procIdFor } =
  await import("../packages/agent/src/proc-id");
const { PiRemoteSession } =
  await import("../packages/agent/src/harnesses/pi-sessiond");
const { PiHarness } = await import("../packages/agent/src/harnesses/pi");
const { OpencodeHarness } =
  await import("../packages/agent/src/harnesses/opencode");
type Neutral = import("../packages/core/src/index").NeutralMessage;
type Context = import("../packages/agent/src/harness").HarnessContext;
type Session = import("../packages/agent/src/harness").HarnessSession;
const { INSTALL_SESSION_CREDENTIAL } =
  await import("../packages/core/src/harness");
/**
 * The hub's part of a spawn after the session opens: it hands the session
 * the credential it minted for it (`INSTALL_SESSION_CREDENTIAL`), which the
 * harness records by its OpenCode session id, the record CawCo's plugin
 * finds a session's instance by. A made-up one: this hub is the probe's.
 */
const credentialed = async (session: Session, instanceId: string) => {
  await session.control?.(INSTALL_SESSION_CREDENTIAL, [
    `gate-probe-credential-${instanceId}`,
  ]);
};

// The agent's browser registry and its gate, as the daemon runs them: each
// workspace session's chrome-devtools reaches the machine's browser through
// its workspace's door alone.
const browsers = await import("../packages/agent/src/browser/browsers");
await browsers.watchBrowsers();
// The fleet's chrome-devtools as the agent's sync writes it, and the host
// key its gateway's hosted servers answer to: a workspace's sessions reach
// it through the workspace's MCP gate (mcp-gate.ts, served by this probe's
// hub stand-in, the harnesses' gateway here), which runs it on the host
// through the workspace's door, for OpenCode (its plugin points the
// location's entry at the gate) and Claude Code alike.
const { hostKey, mcpGateOf, mcpHost } =
  await import("../packages/agent/src/mcp-host");
const { writeFleetMcpSet } =
  await import("../packages/agent/src/fleet-mcp-set");
hostKey();
await writeFleetMcpSet({
  servers: {
    "chrome-devtools": {
      command: devtools.command,
      args: devtools.args,
      env: devtools.env,
    },
  },
  placed: {},
  signedOut: [],
});

const sessiond = new SessiondServer();
await sessiond.listen(endpoint);
const keeper = welcomed(endpoint, await SessiondClient.connect(endpoint));

// ── Helpers ─────────────────────────────────────────────────────────────
const waiters = new Set<() => void>();
const wake = () => {
  for (const waiter of waiters) {
    waiter();
  }
};
setInterval(wake, 250).unref();
const until = async <T>(
  read: () => T | undefined,
  ms: number,
  what: string
): Promise<T> => {
  const found = Promise.withResolvers<T>();
  const check = () => {
    const value = read();
    if (value !== undefined && value !== false) {
      found.resolve(value);
    }
  };
  waiters.add(check);
  check();
  const seen = await readWithin(ms, () => found.promise);
  waiters.delete(check);
  switch (seen.kind) {
    case "answered":
      return seen.value;
    case "unanswered":
      throw new Error(`${what} did not come within ${seen.after} ms`);
    default: {
      const unhandled: never = seen;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

interface Watch {
  busy: boolean;
  ctx: Context;
  frames: Neutral[];
}
const watch = (
  instanceId: string,
  at: { boundary: typeof boundary; clone: string; id: string } = {
    boundary,
    clone,
    id: WS,
  }
): Watch => {
  const seen: Watch = {
    busy: false,
    frames: [],
    ctx: {
      instanceId,
      cwd: at.clone,
      boundary: at.boundary,
      // As session.ts gives a workspace's session: its workspace, and the
      // MCP gate its fleet servers go through.
      workspace: at.id,
      mcpGate: mcpGateOf(at.id),
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
  const earlierAgent = welcomed(
    endpoint,
    await SessiondClient.connect(endpoint)
  );
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
  const piSession = await pi.adopt(spec, adopted.ctx, { head });
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
  // on its conversation, as `relaunchAtRest` → `resumeSpawn` does.
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
  const ocFirst = await earlier.spawn(
    await launched(earlier, ocSpec, { id: WS, clone }),
    first.ctx
  );
  ocFirst.attached?.();
  await credentialed(ocFirst, OC);
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
  // The record as the previous agent left it, once nothing of it writes it
  // any more: a write of its in-memory record landing after the old form is
  // planted would put the current form back, and this build's agent would
  // then find a server on its own form (its `#verifyApply` passes), and
  // relaunch nothing.
  const recordFile = join(cawco, recordName);
  const settled = async () => {
    let last = "";
    let quietSince = Date.now();
    const deadline = Date.now() + 30_000;
    while (Date.now() - quietSince < 3000 && Date.now() < deadline) {
      // biome-ignore lint/performance/noAwaitInLoops: polling the file until it stops changing
      const read = await Bun.file(recordFile).text();
      if (read !== last) {
        last = read;
        quietSince = Date.now();
      }
      await Bun.sleep(250);
    }
  };
  await settled();
  const record = JSON.parse(await Bun.file(recordFile).text()) as {
    active: { launch?: string; pid: number; procId: string };
  };
  const launch = JSON.parse(record.active.launch ?? "[]") as [string, string][];
  record.active.launch = JSON.stringify(
    launch.map(([name, value]) =>
      name === "CAWCO_GATE_FORM" ? [name, OLD_FORM] : [name, value]
    )
  );
  await Bun.write(recordFile, JSON.stringify(record));
  await settled();
  // What this build's agent reads: the old form, or this probe says what
  // took its place instead of waiting out a relaunch that cannot come.
  const planted = (
    JSON.parse(await Bun.file(recordFile).text()) as {
      active: { launch?: string };
    }
  ).active.launch;
  const plantedForm = (JSON.parse(planted ?? "[]") as [string, string][]).find(
    ([name]) => name === "CAWCO_GATE_FORM"
  )?.[1];
  if (plantedForm !== OLD_FORM) {
    throw new Error(
      `The server record's gate form is ${plantedForm ?? "none"} after the probe planted ${OLD_FORM}: something wrote the record over it.`
    );
  }
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
  // The daemon's own start step on every connection (daemon.ts reannounce:
  // each harness's report, `readHarness` → `adapter.detect()`): OpenCode's
  // `detect` runs `#ensure`, which verifies the server's gate form and
  // schedules its relaunch. A busy reattach does not (`#reattachOnce` ensures
  // only for a session at rest), so the probe takes the step the daemon does.
  await opencode.detect();
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
      codeMode: said.find((line) => line.includes("code-mode request")),
      lastAnswers: back.frames
        .filter((frame) => frame.type === "assistant")
        .slice(-2)
        .map((frame) => JSON.stringify(frame).slice(0, 600)),
    }
  );

  // Claude: chrome-devtools-mcp as a workspace session's CLI reaches it,
  // through the workspace's MCP gate on the agent's gateway.
  const claudeShot = await claudeCaptures(
    join(scratch, "claude-shot.png"),
    join(paths.workspaceCacheDir(), "claude-outside.png")
  );
  // Its boundary hook judges the call before chrome-devtools sees it, by the
  // judge and policy this probe's OpenCode server used.
  const { judgeCall, readPolicy } =
    await import("../packages/core/src/workspace-judge");
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
    "claude: chrome-devtools, through the workspace's MCP gate, lists its tools, writes a capture to the scratch and refuses one outside the clone and scratch",
    claudeShot.listed &&
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
    await launched(
      opencode,
      {
        ...ocSpec,
        instanceId: B,
        cwd: other.clone,
        workspace: { id: other.id, path: other.clone },
      },
      other
    ),
    seenB.ctx
  );
  sessionB.attached?.();
  await credentialed(sessionB, B);
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

  // ── 5. A session in a directory inside a clone is that clone's ─────────
  // Its spawn names no workspace: the clone that holds its directory does.
  // Beside it, the agent's own lookup on that directory, a link into it,
  // and the clone whose path extends this one's (`clone` and `clone-b`).
  const inside = join(clone, "packages", "agent");
  const SUB = "gate-probe-opencode-sub";
  const seenSub = watch(SUB, { boundary, clone: inside, id: WS });
  const { workspace: _named, ...unnamed } = ocSpec;
  const sub = await opencode.spawn(
    { ...unnamed, instanceId: SUB, cwd: inside },
    seenSub.ctx
  );
  sub.attached?.();
  const subRead = await turn(sub, seenSub, `READ ${secret}`);
  const subBash = await turn(sub, seenSub, "BOUNDED");
  const siblingBash = await turn(sessionB, seenB, "BOUNDED");
  await sub.dispose();
  const { workspaceHolding } =
    await import("../packages/agent/src/workspace-records");
  const link = join(sandbox, "into-clone");
  await symlink(inside, link);
  const holding = {
    inside: (await workspaceHolding(inside))?.id,
    link: (await workspaceHolding(link))?.id,
    sibling: (await workspaceHolding(join(other.clone, "packages")))?.id,
    outside: (await workspaceHolding(sandbox))?.id ?? null,
  };
  check(
    "opencode: a session in a directory inside a clone is judged and its bash runs in that clone's boundary; the agent finds the clone the same way",
    refusedRead(subRead) &&
      subBash.some(
        (one) =>
          one.text.includes(`boundary=${WS} `) &&
          one.text.includes(`pwd=${inside}`)
      ) &&
      siblingBash.some((one) => one.text.includes(`boundary=${other.id} `)) &&
      holding.inside === WS &&
      holding.link === WS &&
      holding.sibling === other.id &&
      holding.outside === null,
    { subRead, subBash, siblingBash, holding }
  );

  // ── 6. The opencode.jsonc CawCo once wrote goes at the agent's start ───
  // As e1ab8f11 wrote it (capturesToScratch through mergeSessionConfig and
  // writeJson): `{ ...stored, mcp: { ...others, [CHROME_DEVTOOLS]: { ...entry,
  // command: [...entry.command, `--filesystem-root=${boundary.scratch}`] } } }`,
  // `JSON.stringify(value, null, 2)`, `entry` the fleet's chrome-devtools,
  // `stored` `{}` or what disablePlanAgentFor wrote first. Beside them, two
  // that are not byte for byte what the writer made for their workspace.
  const { excludeFromCheckout } =
    await import("../packages/agent/src/checkout-exclude");
  const { removeCawcoSessionConfigs } =
    await import("../packages/agent/src/harnesses/opencode");
  const fleetEntry = (
    JSON.parse(
      await Bun.file(join(home, ".config", "opencode", "opencode.json")).text()
    ) as { mcp: Record<string, { command: string[] }> }
  ).mcp["chrome-devtools"] as { command: string[] };
  const e1ab8f11 = (stored: object, root: string) =>
    JSON.stringify(
      {
        ...stored,
        mcp: {
          "chrome-devtools": {
            ...fleetEntry,
            command: [...fleetEntry.command, `--filesystem-root=${root}`],
          },
        },
      },
      null,
      2
    );
  const excludeOf = (dir: string) => join(dir, ".git", "info", "exclude");
  const pristine = {
    a: await Bun.file(excludeOf(clone)).text(),
    b: await Bun.file(excludeOf(other.clone)).text(),
  };
  // Clone A's lines outside CawCo's stand-ins block: the block is the
  // agent's own (`listStandIns` writes it on Linux, as a boundary's host
  // does before its first sandbox), and these clones never ran one.
  const { readExclude } =
    await import("../packages/agent/src/checkout-exclude");
  const othersOf = async (dir: string) =>
    (await readExclude(excludeOf(dir))).rest.join("\n");
  const pristineOthersA = await othersOf(clone);
  const written = [
    {
      file: join(clone, "opencode.jsonc"),
      text: e1ab8f11({}, paths.workspaceScratchDir(WS)),
      ours: true,
    },
    {
      file: join(inside, "opencode.jsonc"),
      text: e1ab8f11(
        { agent: { plan: { disable: true } } },
        paths.workspaceScratchDir(WS)
      ),
      ours: true,
    },
    // Another workspace's scratch: not what the writer made for this one.
    {
      file: join(other.clone, "opencode.jsonc"),
      text: e1ab8f11({}, paths.workspaceScratchDir(WS)),
      ours: false,
    },
    // One byte past what the writer made.
    {
      file: join(other.clone, "packages", "core", "opencode.jsonc"),
      text: `${e1ab8f11({}, paths.workspaceScratchDir(other.id))}\n`,
      ours: false,
    },
  ];
  for (const one of written) {
    // biome-ignore lint/performance/noAwaitInLoops: each exclude line is appended to its clone's file in turn
    await Bun.write(one.file, one.text);
    await excludeFromCheckout(one.file);
  }
  const startedAt = said.length;
  await removeCawcoSessionConfigs();
  const left = await Promise.all(
    written.map(async (one) => ({
      file: one.file,
      ours: one.ours,
      present: await Bun.file(one.file).exists(),
    }))
  );
  const excludeB = await Bun.file(excludeOf(other.clone)).text();
  const excludeA = await Bun.file(excludeOf(clone)).text();
  const startLine = said
    .slice(startedAt)
    .find((line) => line.includes("[opencode] start: removed"));
  check(
    "agent start: the opencode.jsonc CawCo wrote is removed with its exclude line; any other is left",
    left.every((one) => one.present === !one.ours) &&
      (await othersOf(clone)) === pristineOthersA &&
      excludeB.includes("\n/opencode.jsonc\n") &&
      excludeB.includes("\n/packages/core/opencode.jsonc\n") &&
      startLine?.includes("removed 2 ") === true,
    { left, excludeA, excludeB, startLine }
  );
  // What the probe itself left in the other clone goes before git status.
  await Promise.all(
    written
      .filter((each) => !each.ours)
      .map((one) => rm(one.file, { force: true }))
  );
  await Bun.write(excludeOf(other.clone), pristine.b);

  // ── 7. Nothing CawCo wrote shows in either clone ───────────────────────
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
  // The gates' chrome-devtools this process ran for the workspaces, each
  // holding its browser through the DevTools gate: ended before the browsers
  // are removed, as the agent ends them with a gate's last session.
  mcpHost.stopAll();
  for (const row of await browsers.browserRows()) {
    // biome-ignore lint/performance/noAwaitInLoops: one browser at a time, each under its own lock.
    await browsers.removeBrowser(row.key);
  }
  await sessiond.drain(5000);
  keeper.close();
  await sessiond.close();
  await mock.stop(true);
  await hub.stop(true);
}

/**
 * chrome-devtools-mcp as a workspace's Claude Code dials it (claude.ts
 * `fleetMcpFor`): the workspace's MCP gate on the agent's gateway, over
 * streamable HTTP with the machine's host key (mcp-host.ts `fetchGate`),
 * which runs it on the host through the workspace's door, its scratch and
 * clone its roots. Takes a capture into each path; says which were written.
 */
async function claudeCaptures(
  inScratch: string,
  outside: string
): Promise<{
  inScratch: boolean;
  listed: boolean;
  outsideRefused: boolean;
  outsideAnswer: string;
  opened: string;
}> {
  const gate = mcpGateOf(WS);
  let id = 0;
  const call = async (method: string, params: object) => {
    id += 1;
    const answered = await fetch(`${gate.base}chrome-devtools`, {
      method: "POST",
      headers: {
        ...gate.headers,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const body = (await answered.json()) as {
      result?: unknown;
      error?: unknown;
    };
    return body.result ?? body.error;
  };
  await call("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "claude-code", version: "probe" },
  });
  const listed = JSON.stringify(await call("tools/list", {})).includes(
    '"take_screenshot"'
  );
  // Page-id routing is on (the fleet's launch keeps its default), and
  // through the gate the workspace sees its own pages alone: it opens one,
  // and the screenshot names the page new_page selected.
  const opened = JSON.stringify(
    await call("tools/call", {
      name: "new_page",
      arguments: { url: "about:blank" },
    })
  );
  const pageId = Number(opened.match(SELECTED_PAGE)?.[1]);
  const shoot = (filePath: string) =>
    call("tools/call", {
      name: "take_screenshot",
      arguments: { filePath, pageId },
    });
  await shoot(inScratch);
  const refused = JSON.stringify(await shoot(outside));
  return {
    inScratch: await Bun.file(inScratch).exists(),
    listed,
    outsideRefused:
      !(await Bun.file(outside).exists()) &&
      refused.includes("is not within any of the configured workspace roots"),
    outsideAnswer: refused.slice(0, 300),
    opened: opened.slice(0, 600),
  };
}

const failed = checks.filter((one) => !one.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length === 0) {
  console.log(
    "gate hosts probe: pi relaunched idle, opencode relaunched idle, capture to scratch ok, outside refused, saved outputs read only by their session, clones clean"
  );
}
process.exit(failed.length ? 1 : 0);
