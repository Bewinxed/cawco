/**
 * Probe: connections (Projects spec §5.5, P3) on a scratch fleet (real hub,
 * agent and sessiond on loopback, real Claude Code against a mock model).
 * The invariant: a connection's credential lives only in the hub. A session
 * that may use a connection calls its tools through the hub, and nothing a
 * session can read (its env, its harness config, its files) holds the key.
 *
 * A tiny MCP server runs in this process: `/mcp/key` answers only
 * `Authorization: Bearer <key>` for two keys (accounts alpha and beta),
 * `/mcp/oauth` only an access token its own minimal OAuth server issued
 * (RFC 9728 resource metadata, RFC 8414 server metadata, dynamic
 * registration, PKCE S256, refresh). Its one tool, `echo`, answers
 * `ECHO[<account>]: <args>`.
 *
 * 1. Connections made: a bearer row with its key; its tools listed.
 * 2. A delegate whose type lists the connections calls
 *    `conn__echo-alpha__echo` through the hub and gets the answer.
 * 3. No trace of any key or token in the delegate's environment, its Claude
 *    MCP config file, its workspace, or anywhere under the scratch HOME and
 *    sandbox (the hub's database and logs included: sealed at rest).
 * 4. A delegate whose type does not list it is not listed the tool, and its
 *    direct call, with its own credential, is refused.
 * 5. Two rows for two accounts of one service, each with its own key, each
 *    answering as itself.
 * 6. OAuth: the hub runs discovery, registration, PKCE and the exchange, the
 *    redirect landing on the hub; a call works; with the access token
 *    revoked, the next call refreshes in the hub and works.
 * 7. admin_connections_read never returns the key; admin_connections_write
 *    takes no key, and a session asking to set one is answered with the
 *    command the owner runs (`cawco connections set-key`), which this probe
 *    then runs, piped, to give beta its key.
 *
 * The typed sessions are started two ways, both the parent's own tool call.
 * By default `delegate`, as the brief means it: each in its own workspace
 * and boundary. A boundary cannot start inside a CawCo workspace, so a probe
 * run from one passes `--start-session`: the parent's `start_session` with
 * the same `type`, which puts the type on the row the same way
 * (delegation-actions `namedTypeSettings`) and runs in the repo with no
 * workspace. The hub's grant, listing and call paths read only the row, so
 * they are the same either way; the workspace check reads the repo instead.
 *
 * Run from the repo root:
 *   bun scripts/probe-connections.ts [--keep] [--start-session]
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sessionToolName } from "../packages/hub/src/connections";
import {
  MODEL,
  type Reply,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const keep = process.argv.includes("--keep");
/** `start_session` instead of `delegate`: for a run inside a workspace, where no boundary can start. */
const startSession = process.argv.includes("--start-session");
const KEYS: Record<string, string> = {
  [`kA-${crypto.randomUUID()}`]: "alpha",
  [`kB-${crypto.randomUUID()}`]: "beta",
};
const [KEY_ALPHA, KEY_BETA] = Object.keys(KEYS) as [string, string];
const TOOL = (connection: string) => `mcp__cawco__conn__${connection}__echo`;
/** The parent's tool that starts a typed session. */
const DELEGATE = startSession
  ? "mcp__cawco__start_session"
  : "mcp__cawco__delegate";

const results: Record<string, string> = {};
let failed = false;
const check = (name: string, ok: boolean, detail: string) => {
  failed ||= !ok;
  results[name] = `${ok ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};
const section = async (name: string, body: () => Promise<void> | void) => {
  try {
    await body();
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
};

// ── The test MCP server and its OAuth server ───────────────────────────────
const issued = { access: new Set<string>(), refresh: new Set<string>() };
const codes = new Map<string, { challenge: string; redirect: string }>();
const calls: { path: string; as: string; tool: string; args: unknown }[] = [];
/**
 * A real tool name no harness takes as it is: a `/` and a `.`, and too long
 * once `mcp__cawco__conn__echo-alpha__` is put before it. Sessions are listed
 * it by its alias (connections.ts `sessionToolName`).
 */
const LONG_TOOL = "files/read.pull_request_review_comments_for_a_probe";
const ALIAS = `mcp__cawco__${sessionToolName("echo-alpha", LONG_TOOL)}`;
/** Anthropic's tool-name rule: a request with a tool outside it fails whole (connections.ts). */
const API_TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;
/** Tool names Claude Code sent the model that the real API would refuse. */
const refusedNames = new Set<string>();
let refreshes = 0;
const b64url = (bytes: Buffer) => bytes.toString("base64url");
const token = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const rpc = (id: unknown, result: unknown) =>
  Response.json({ jsonrpc: "2.0", id, result });

/** One JSON-RPC message to the MCP server, answered as `as`. */
const mcp = (
  path: string,
  as: string,
  message: {
    id?: unknown;
    method?: string;
    params?: { arguments?: unknown; name?: string };
  }
) => {
  if (message.id === undefined) {
    return new Response(null, { status: 202 });
  }
  if (message.method === "initialize") {
    return rpc(message.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "probe-echo", version: "1" },
    });
  }
  if (message.method === "tools/list") {
    return rpc(message.id, {
      tools: [
        {
          name: "echo",
          description: "Answers its arguments back.",
          inputSchema: {
            type: "object",
            properties: { said: { type: "string" } },
          },
          annotations: { readOnlyHint: true },
        },
        {
          name: LONG_TOOL,
          description: "Answers its arguments back, under a long name.",
          inputSchema: {
            type: "object",
            properties: { said: { type: "string" } },
          },
          annotations: { readOnlyHint: true },
        },
      ],
    });
  }
  if (message.method === "tools/call") {
    calls.push({
      path,
      as,
      tool: message.params?.name ?? "",
      args: message.params?.arguments,
    });
    return rpc(message.id, {
      content: [
        {
          type: "text",
          text: `ECHO[${as}]: ${JSON.stringify(message.params?.arguments ?? {})}`,
        },
      ],
    });
  }
  return Response.json({
    jsonrpc: "2.0",
    id: message.id,
    error: { code: -32_601, message: "no such method" },
  });
};

const BEARER = /^Bearer /;
const CREDENTIAL = /Bearer ([A-Za-z0-9_-]{43})/;
const LOGGED = /connections|delegation|work-items|error/i;
const invalid = (error: string) => Response.json({ error }, { status: 400 });

/** Whether a token request's grant holds: a code with its PKCE proof, or an issued refresh token. */
const grantHolds = (form: URLSearchParams): Response | undefined => {
  const grant = form.get("grant_type");
  if (grant === "authorization_code") {
    const held = codes.get(form.get("code") ?? "");
    codes.delete(form.get("code") ?? "");
    const proof = b64url(
      createHash("sha256")
        .update(form.get("code_verifier") ?? "")
        .digest()
    );
    return held?.challenge === proof ? undefined : invalid("invalid_grant");
  }
  if (grant === "refresh_token") {
    if (!issued.refresh.has(form.get("refresh_token") ?? "")) {
      return invalid("invalid_grant");
    }
    refreshes += 1;
    return undefined;
  }
  return invalid("unsupported_grant_type");
};

/** The token endpoint: a fresh access and refresh token for a grant that holds. */
const tokenRoute = (form: URLSearchParams): Response => {
  const refused = grantHolds(form);
  if (refused) {
    return refused;
  }
  const access = token("at");
  const refresh = token("rt");
  issued.access.add(access);
  issued.refresh.add(refresh);
  return Response.json({
    access_token: access,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refresh,
  });
};

/** The two MCP endpoints: one by key, one by an issued access token. */
const mcpRoute = async (
  request: Request,
  url: URL,
  bearer: string
): Promise<Response> => {
  const byToken = issued.access.has(bearer) ? "oauth-user" : undefined;
  const as = url.pathname === "/mcp/key" ? KEYS[bearer] : byToken;
  if (!as) {
    return new Response("sign in", {
      status: 401,
      headers:
        url.pathname === "/mcp/oauth"
          ? {
              "WWW-Authenticate": `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource/mcp/oauth"`,
            }
          : {},
    });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  return mcp(url.pathname, as, await request.json());
};

const echo = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const base = url.origin;
    const bearer = (request.headers.get("authorization") ?? "").replace(
      BEARER,
      ""
    );
    switch (url.pathname) {
      case "/.well-known/oauth-protected-resource/mcp/oauth":
      case "/.well-known/oauth-protected-resource":
        return Response.json({
          resource: `${base}/mcp/oauth`,
          authorization_servers: [base],
        });
      case "/.well-known/oauth-authorization-server":
        return Response.json({
          issuer: base,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/token`,
          registration_endpoint: `${base}/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        });
      case "/register": {
        const body = (await request.json()) as Record<string, unknown>;
        return Response.json(
          { ...body, client_id: crypto.randomUUID() },
          { status: 201 }
        );
      }
      case "/authorize": {
        const code = token("code");
        const redirect = url.searchParams.get("redirect_uri") ?? "";
        codes.set(code, {
          challenge: url.searchParams.get("code_challenge") ?? "",
          redirect,
        });
        const back = new URL(redirect);
        back.searchParams.set("code", code);
        back.searchParams.set("state", url.searchParams.get("state") ?? "");
        return Response.redirect(back.toString(), 302);
      }
      case "/token":
        return tokenRoute(new URLSearchParams(await request.text()));
      case "/mcp/key":
      case "/mcp/oauth":
        return mcpRoute(request, url, bearer);
      default:
        return new Response("not found", { status: 404 });
    }
  },
});
const ECHO = `http://127.0.0.1:${echo.port}`;
/** Every secret the probe's services know: none may appear anywhere a session reads. */
const secrets = () => [
  KEY_ALPHA,
  KEY_BETA,
  ...issued.access,
  ...issued.refresh,
];

// ── The mock model's answers ───────────────────────────────────────────────
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
/** Calls `name`, loading it with ToolSearch first when it is deferred. */
const call = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return tool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

const delegated = new Set<string>();
/** What the parent's `delegate` call answered, by tag: a refusal shows here. */
const delegateAnswers = new Map<string, string>();
/** When the no-connection delegate searched for the tool; 0 before it did. */
const noneSearched: { at: number } = { at: 0 };
/** What the no-connection delegate was offered, request by request. */
const noneOffered: string[][] = [];

const PARENT_TAG = /PROBE-PARENT-(USER|NONE)/g;

/** The parent: one typed session per message it is sent, by its own tool call. */
const parentTurn = (request: Seen, tag: string): Reply => {
  if (delegated.has(tag)) {
    // The request after the call carries what the call answered.
    delegateAnswers.set(tag, request.last);
    return text("delegated");
  }
  const reply = call(request, DELEGATE, {
    prompt: `PROBE-CONN-${tag}: call the echo connection tools you have.`,
    title: `Echo ${tag.toLowerCase()}`,
    type: tag === "USER" ? "conn-user" : "conn-none",
    ...(startSession
      ? { cwd: fleet.repo }
      : // A work item needs one acceptance check; this one always passes.
        { checks: [{ name: "Always passes", command: "true" }] }),
  });
  if (reply.tool?.name === DELEGATE) {
    delegated.add(tag);
  }
  return reply;
};

/** The granted session: each account's echo, then the long-named tool by its alias. */
const userTurn = (request: Seen): Reply => {
  for (const [connection, as] of [
    ["echo-alpha", "alpha"],
    ["echo-beta", "beta"],
    ["echo-oauth", "oauth-user"],
  ] as const) {
    if (!request.all.includes(`ECHO[${as}]`)) {
      return call(request, TOOL(connection), { said: `hello ${as}` });
    }
  }
  if (!request.all.includes('{"said":"by alias"}')) {
    return call(request, ALIAS, { said: "by alias" });
  }
  return holdUntilRead(request, "USER") ?? text("PROBE-USER-DONE");
};

/** The session no type grants anything: it searches for the tool once. */
const noneTurn = (request: Seen): Reply => {
  noneOffered.push(request.toolNames);
  if (!noneSearched.at) {
    noneSearched.at = Date.now();
    return tool("ToolSearch", {
      query: `select:${TOOL("echo-alpha")}`,
      max_results: 1,
    });
  }
  return holdUntilRead(request, "NONE") ?? text("PROBE-NONE-DONE");
};

/** Sessions held mid-turn for the probe to read them, by tag, and since when. */
const held: Map<string, number> = new Map();
/** The file a held session waits for, in its working directory: one per session, which may share it. */
const goFile = (tag: string) => `.probe-go-${tag}`;
/** Where a held session writes its commands' own environment, in its working directory. */
const envFile = (tag: string) => `.probe-env-${tag}`;

/**
 * A session's last step, once: a command that writes the environment its
 * commands run with (inside its workspace boundary, for a delegate) to
 * {@link envFile}, then waits for {@link goFile}. While it waits the
 * session is mid-turn, so its process and MCP config file are surely there
 * to read; the probe writes the go file when it has read them. Undefined once
 * the command has answered.
 */
const holdUntilRead = (request: Seen, tag: string): Reply | undefined => {
  if (request.all.includes(`GO-SEEN-${tag}`)) {
    return undefined;
  }
  if (!held.has(tag)) {
    held.set(tag, Date.now());
  }
  return tool("Bash", {
    command: `env > ${envFile(tag)}; while [ ! -e ${goFile(tag)} ]; do sleep 0.2; done; echo GO-SEEN-${tag}`,
    description: "Wait for the probe to read this session",
    timeout: 600_000,
  });
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  // What the real API would answer with a 400 for the whole request.
  for (const name of request.toolNames) {
    if (!API_TOOL_NAME.test(name)) {
      refusedNames.add(name);
    }
  }
  // Only the parent is sent PROBE-PARENT; a started session's brief stands alone.
  const tag = [...request.all.matchAll(PARENT_TAG)].at(-1)?.[1];
  if (tag) {
    return parentTurn(request, tag);
  }
  if (request.all.includes("PROBE-CONN-USER")) {
    return userTurn(request);
  }
  if (request.all.includes("PROBE-CONN-NONE")) {
    return noneTurn(request);
  }
  return text("ok");
};

const fleet = await scratchFleet({ name: "probe-connections", respond });

interface View {
  hasSecret: boolean;
  name: string;
  reason?: string;
  state: string;
  tools?: string[];
}
const send = async <T>(method: string, path: string, body?: unknown) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
    redirect: "manual",
    signal: AbortSignal.timeout(60_000),
  });
  const said = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${said}`);
  }
  return JSON.parse(said) as T;
};
const views = async () =>
  (await send<{ connections: View[] }>("GET", "/api/connections")).connections;
const viewOf = async (name: string) =>
  (await views()).find((one) => one.name === name);

/**
 * What a running session can read of its own, taken while it runs: every
 * process in its tree (the Claude Code process sessiond holds for it, and
 * whatever that started), each one's environment and command line, and the
 * MCP config files those command lines name (`--mcp-config <file>`, where
 * the agent writes them for a plain session and a workspace delegate alike:
 * claude-mcp-config.ts). The files go when the process does, so this is read
 * the moment the session is known to be at work.
 */
interface Trace {
  configs: { path: string; text: string }[];
  /** The session credential its CawCo MCP entry carries. */
  credential: string;
  environs: Buffer[];
  pids: number[];
}

const readProc = (pid: number, what: string) =>
  readFile(`/proc/${pid}/${what}`).catch(() => Buffer.from(""));

/**
 * The process a session runs as, by the agent's own records: of everything
 * sessiond holds (each session's process, each workspace's boundary host)
 * and everything under it, the topmost process whose command line names the
 * session's instance id (its `--mcp-config <id>.<launch>.json`), however the
 * agent launched it. Throws, naming what sessiond holds, when none does.
 */
const processOf = async (instanceId: string): Promise<number> => {
  const roots = await fleet.heldProcs();
  for (const root of roots) {
    // biome-ignore lint/performance/noAwaitInLoops: one held process's tree at a time
    const pids = await tree(root.pid);
    const cmdlines = await Promise.all(
      pids.map((pid) => readProc(pid, "cmdline"))
    );
    const at = cmdlines.findIndex((cmdline) => cmdline.includes(instanceId));
    if (at >= 0) {
      return pids[at] as number;
    }
  }
  throw new Error(
    `no process names ${instanceId}; sessiond holds ${roots.map((one) => `${one.procId} (${one.pid})`).join(", ") || "nothing"}`
  );
};

const traceOf = async (instanceId: string): Promise<Trace> => {
  const pids = await tree(await processOf(instanceId));
  const environs = await Promise.all(
    pids.map((one) => readProc(one, "environ"))
  );
  const cmdlines = await Promise.all(
    pids.map((one) => readProc(one, "cmdline"))
  );
  const paths = new Set<string>();
  for (const cmdline of cmdlines) {
    const args = cmdline.toString("utf8").split("\0");
    args.forEach((arg, at) => {
      if (arg === "--mcp-config" && args[at + 1]) {
        paths.add(args[at + 1] as string);
      } else if (arg.startsWith("--mcp-config=")) {
        paths.add(arg.slice("--mcp-config=".length));
      }
    });
  }
  const configs = await Promise.all(
    [...paths].map(async (path) => ({
      path,
      text: await readFile(path, "utf8").catch(() => ""),
    }))
  );
  const credential = configs
    .map((config) => CREDENTIAL.exec(config.text)?.[1])
    .find(Boolean);
  if (!credential) {
    throw new Error(
      `${instanceId}: no MCP config with its credential among ${pids.length} processes (${[...paths].join(", ") || "no --mcp-config"})`
    );
  }
  return { pids, environs, configs, credential };
};
/**
 * A session's trace, read while it is held mid-turn ({@link holdUntilRead}):
 * once its waiting command has written its environment (so it is running),
 * the trace is taken, and then the go file lets it finish its turn.
 */
const readWhileHeld = async (
  session: { cwd: string; id: string },
  tag: string
): Promise<Trace> => {
  const written = join(session.cwd, envFile(tag));
  await until(
    `the ${tag} session holding mid-turn`,
    () => held.has(tag) && existsSync(written),
    Boolean,
    300_000
  );
  try {
    return await traceOf(session.id);
  } finally {
    await writeFile(join(session.cwd, goFile(tag)), "go\n");
    await until(
      `the ${tag} session let go`,
      () => fleet.seen.some((one) => one.all.includes(`GO-SEEN-${tag}`)),
      Boolean,
      120_000
    );
  }
};

/** A tool call through the hub's REST door, as the session the credential is. */
const door = (
  instanceId: string,
  credential: string,
  name: string,
  args: object
) =>
  fetch(`${fleet.base}/api/delegation/call/${instanceId}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name, arguments: args }),
    signal: AbortSignal.timeout(120_000),
  }).then(async (response) => ({
    status: response.status,
    text: await response.text(),
  }));
const listedTo = async (instanceId: string) =>
  (
    await send<{ tools: { name: string }[] }>(
      "GET",
      `/api/delegation/tools?instanceId=${instanceId}`
    )
  ).tools.map((one) => one.name);

/** Every file under `dir` holding any of `needles`, read as bytes. */
const holding = async (dir: string, needles: string[]): Promise<string[]> => {
  const found: string[] = [];
  const walk = async (at: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        // biome-ignore lint/performance/noAwaitInLoops: one folder at a time
        await walk(path);
      } else if (entry.isFile()) {
        const bytes = await readFile(path).catch(() => undefined);
        if (bytes && needles.some((needle) => bytes.includes(needle))) {
          found.push(path);
        }
      }
    }
  };
  await walk(dir);
  return found;
};
/**
 * The typed session the parent's call (tagged `tag`) started, as its row:
 * the one session of `type`, which only this probe's types name. The call
 * answers once its session is in place, so a row missing 30 s after the
 * answer means the call was refused: that answer is the failure.
 */
const startedOf = async (
  tag: string,
  type: string
): Promise<{ cwd: string; id: string }> => {
  const deadline = Date.now() + 300_000;
  let answeredAt = 0;
  for (;;) {
    const [row] = fleet.query<{ id: string; cwd: string }>(
      "SELECT id, cwd FROM instances WHERE delegate_type = ?",
      type
    );
    if (row) {
      return row;
    }
    const answer = delegateAnswers.get(tag);
    answeredAt ||= answer === undefined ? 0 : Date.now();
    if (answer !== undefined && Date.now() - answeredAt > 30_000) {
      throw new Error(
        `the ${type} delegate never started; delegate answered: ${answer.slice(0, 600)}`
      );
    }
    if (Date.now() > deadline) {
      throw new Error(`the ${type} delegate: not within 300s, and no answer`);
    }
    // biome-ignore lint/performance/noAwaitInLoops: each look follows the fleet's last state
    await Bun.sleep(500);
  }
};

/**
 * A session of type `type` told to run `PROBE-CONN-<tag>`, started by the
 * parent's own tool call (`delegate`, or `start_session` with
 * `--start-session`).
 */
const startDelegate = async (
  parent: string,
  tag: "USER" | "NONE",
  type: string
): Promise<{ cwd: string; id: string }> => {
  await fleet.send(parent, `PROBE-PARENT-${tag}: start it.`);
  return await startedOf(tag, type);
};

/** Every pid under `pid`, read from /proc. */
const tree = async (pid: number): Promise<number[]> => {
  const children = new Map<number, number[]>();
  for (const entry of await readdir("/proc")) {
    const id = Number(entry);
    if (!Number.isInteger(id)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one /proc entry at a time
    const stat = await readFile(`/proc/${id}/stat`, "utf8").catch(() => "");
    const parent = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    children.set(parent, [...(children.get(parent) ?? []), id]);
  }
  const out = [pid];
  const walk = (at: number) => {
    for (const child of children.get(at) ?? []) {
      out.push(child);
      walk(child);
    }
  };
  walk(pid);
  return out;
};

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  // ── 1, 5: two bearer rows for two accounts of one service ──────────────
  await section("1: a bearer connection signs in with its key", async () => {
    for (const [name, account] of [
      ["echo-alpha", "alpha"],
      ["echo-beta", "beta"],
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one row at a time
      await send("POST", "/api/connections", {
        name,
        service: "echo",
        account,
        transport: "http",
        url: `${ECHO}/mcp/key`,
        auth: "bearer",
      });
    }
    const made = await viewOf("echo-alpha");
    check(
      "1: a bearer connection waits for its key",
      made?.state === "needs-sign-in" && !made.hasSecret,
      JSON.stringify(made)
    );
    const set = await send<View>("PUT", "/api/connections/echo-alpha/key", {
      key: KEY_ALPHA,
    });
    check(
      "1: with its key it is signed in and its tools are listed",
      set.state === "signed-in" &&
        set.hasSecret &&
        set.tools?.join() === `echo,${LONG_TOOL}`,
      JSON.stringify(set)
    );
  });

  // ── 6: an OAuth connection, signed in by the hub ──────────────────────
  await section("6: OAuth sign-in lands on the hub", async () => {
    await send("POST", "/api/connections", {
      name: "echo-oauth",
      service: "echo",
      account: "oauth-user",
      transport: "http",
      url: `${ECHO}/mcp/oauth`,
      auth: "oauth",
    });
    const { authorizationUrl } = await send<{ authorizationUrl: string }>(
      "POST",
      "/api/connections/echo-oauth/sign-in",
      {}
    );
    // The person's browser: the authorization server redirects it to the hub.
    const authorize = await fetch(authorizationUrl, { redirect: "manual" });
    const landing = authorize.headers.get("location") ?? "";
    const landed = await fetch(landing, { redirect: "manual" });
    const said = await landed.text();
    const signed = await viewOf("echo-oauth");
    check(
      "6: the hub ran discovery, registration and PKCE, and the redirect landed on the hub",
      landing.startsWith(`${fleet.base}/api/connections/oauth/callback?`) &&
        landed.status === 200 &&
        signed?.state === "signed-in" &&
        signed.tools?.includes("echo") === true &&
        new URL(authorizationUrl).searchParams.get("code_challenge_method") ===
          "S256",
      `${landed.status} “${said}”; ${JSON.stringify(signed)}`
    );
    const again = await fetch(landing, { redirect: "manual" });
    check(
      "6: the same redirect a second time spends nothing",
      again.status === 400,
      `${again.status} ${await again.text()}`
    );
  });

  // ── The delegate types and the parent ─────────────────────────────────
  for (const [name, connections] of [
    ["conn-user", ["echo-alpha", "echo-beta", "echo-oauth"]],
    ["conn-none", []],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one type at a time
    await send("PUT", `/api/delegate-types/${name}`, {
      description: `Probe type ${name}.`,
      harness: "claude",
      model: MODEL.claude,
      ...(connections.length ? { connections } : {}),
    });
  }
  const parent = await fleet.spawn("claude", "Connections parent", fleet.repo);
  const { credential: parentCredential } = await traceOf(parent);

  // ── 7: a key never goes through a session; admin read ─────────────────
  await section(
    "7: admin_connections_write takes no key, and answers with the CLI command",
    async () => {
      const listed = (await listedTo(parent)).includes(
        "admin_connections_write"
      );
      const schema = JSON.stringify(
        (
          await send<{ tools: { name: string; inputSchema: unknown }[] }>(
            "GET",
            `/api/delegation/tools?instanceId=${parent}`
          )
        ).tools.find((one) => one.name === "admin_connections_write")
          ?.inputSchema
      );
      const asked = await door(
        parent,
        parentCredential,
        "admin_connections_write",
        { action: "set_key", name: "echo-beta" }
      );
      const pending = await send<{ payload: { toolName?: string } }[]>(
        "GET",
        "/api/pending"
      );
      check(
        "7: a session's admin_connections_write has no set_key, and asking for one answers with the command, asking nobody",
        listed &&
          !(schema.includes("set_key") || schema.includes('"key"')) &&
          asked.text.includes(
            "Run on a machine joined to this hub: cawco connections set-key echo-beta"
          ) &&
          !pending.some(
            (one) =>
              one.payload.toolName === "mcp__cawco__admin_connections_write"
          ),
        asked.text.slice(0, 300)
      );
      // The owner runs it, from their own terminal: the key piped in.
      const cli = Bun.spawn(
        [
          process.execPath,
          "packages/cli/src/cli.ts",
          "connections",
          "set-key",
          "echo-beta",
          "--hub",
          fleet.base,
        ],
        {
          env: Object.fromEntries(
            Object.entries(process.env).filter(
              ([name]) =>
                name !== "CAWCO_INSTANCE_ID" &&
                name !== "CAWCO_SESSION_CREDENTIAL"
            )
          ),
          stdin: new Blob([`${KEY_BETA}\n`]),
          stdout: "pipe",
          stderr: "pipe",
        }
      );
      const said = `${await new Response(cli.stdout).text()}${await new Response(cli.stderr).text()}`;
      const beta = await viewOf("echo-beta");
      check(
        "7: the owner's cawco connections set-key, piped, signs beta in",
        (await cli.exited) === 0 &&
          said.includes(
            `Key set for echo-beta (${KEY_BETA.length} characters)`
          ) &&
          !said.includes(KEY_BETA) &&
          beta?.state === "signed-in",
        `${said.trim().replaceAll("\n", " | ")}; ${beta?.state}`
      );
      const read = await door(
        parent,
        parentCredential,
        "admin_connections_read",
        {
          action: "list",
        }
      );
      const raw = await fetch(`${fleet.base}/api/connections`).then((r) =>
        r.text()
      );
      check(
        "7: admin_connections_read and GET /api/connections hold no key or token",
        read.text.includes("echo-alpha") &&
          read.text.includes("echo-oauth") &&
          secrets().every(
            (secret) => !(read.text.includes(secret) || raw.includes(secret))
          ),
        read.text.slice(0, 400)
      );
    }
  );

  // ── 2, 5, 6: the granted delegate calls through the hub ───────────────
  const user = await startDelegate(parent, "USER", "conn-user");
  // Its four answers are in once it is held; it is read while it waits.
  const userTrace = await readWhileHeld(user, "USER");
  await section("2: a granted delegate calls through the hub", () => {
    const answered = fleet.seen
      .filter((one) => one.all.includes("PROBE-CONN-USER"))
      .at(-1);
    check(
      "2: conn__echo-alpha__echo, called by the delegate, answered through the hub",
      Boolean(answered?.all.includes('ECHO[alpha]: {"said":"hello alpha"}')) &&
        calls.some((one) => one.path === "/mcp/key" && one.as === "alpha"),
      JSON.stringify(calls)
    );
    check(
      "5: two accounts of one service, each answering as itself",
      Boolean(
        answered?.all.includes('ECHO[alpha]: {"said":"hello alpha"}') &&
          answered.all.includes('ECHO[beta]: {"said":"hello beta"}')
      ) &&
        calls
          .filter((one) => one.path === "/mcp/key" && one.tool === "echo")
          .map((one) => one.as)
          .join() === "alpha,beta",
      calls.map((one) => `${one.path} ${one.tool} as ${one.as}`).join("; ")
    );
    check(
      "2: a tool whose name no harness takes is listed by an alias that fits, and called by its real name",
      ALIAS.length <= 64 &&
        refusedNames.size === 0 &&
        calls.some(
          (one) =>
            one.tool === LONG_TOOL &&
            JSON.stringify(one.args) === '{"said":"by alias"}'
        ),
      `${ALIAS} (${ALIAS.length}); names the API would refuse: ${[...refusedNames].join(", ") || "none"}`
    );
    check(
      "6: the OAuth connection answered the delegate",
      Boolean(answered?.all.includes("ECHO[oauth-user]")),
      calls
        .filter((one) => one.path === "/mcp/oauth")
        .map((one) => one.as)
        .join()
    );
  });

  await section(
    "6: a revoked access token is refreshed in the hub",
    async () => {
      issued.access.clear();
      const before = refreshes;
      const again = await door(
        user.id,
        userTrace.credential,
        "conn__echo-oauth__echo",
        {
          said: "after revoke",
        }
      );
      check(
        "6: the call after a revoked token refreshed and answered",
        again.text.includes("ECHO[oauth-user]") && refreshes === before + 1,
        `refreshes ${before} → ${refreshes}; ${again.text.slice(0, 300)}`
      );
    }
  );

  // ── 4: the delegate whose type lists none ─────────────────────────────
  const none = await startDelegate(parent, "NONE", "conn-none");
  // It is held once its search has answered; it is read while it waits.
  const noneTrace = await readWhileHeld(none, "NONE");
  await section("4: a delegate whose type lists none", async () => {
    const userTools = await listedTo(user.id);
    const noneTools = await listedTo(none.id);
    check(
      "4: the hub lists the connection's tools to the granted delegate only",
      userTools.includes("conn__echo-alpha__echo") &&
        !noneTools.some((name) => name.startsWith("conn__")),
      `granted: ${userTools.filter((n) => n.startsWith("conn__")).join(", ")}; other: ${noneTools.filter((n) => n.startsWith("conn__")).join(", ") || "none"}`
    );
    check(
      "4: Claude Code never offered the other delegate the tool, even after ToolSearch",
      noneOffered.length >= 2 &&
        noneOffered.every(
          (names) => !names.some((name) => name.includes("conn__"))
        ),
      JSON.stringify(
        noneOffered.map((names) => names.filter((n) => n.includes("cawco")))
      )
    );
    const refused = await door(
      none.id,
      noneTrace.credential,
      "conn__echo-alpha__echo",
      {
        said: "not mine",
      }
    );
    check(
      "4: its direct call, with its own credential, is refused",
      refused.text.includes("isn't available to this session") &&
        !calls.some((one) => JSON.stringify(one.args).includes("not mine")),
      refused.text.slice(0, 300)
    );
  });

  // ── 3: no trace of a key anywhere a session reads ─────────────────────
  await section("3: no session holds a key", async () => {
    // Every secret the probe's services issued, the refreshed tokens too,
    // against what the sessions held while they ran.
    const needles = secrets();
    const holds = (bytes: Buffer | string) =>
      needles.some((needle) => bytes.includes(needle));
    for (const [who, trace] of [
      ["granted", userTrace],
      ["ungranted", noneTrace],
    ] as const) {
      check(
        `3: the ${who} session's process tree environment holds no key or token`,
        trace.pids.length > 0 && !trace.environs.some(holds),
        `${trace.pids.length} processes read, ${trace.environs.filter(holds).length} holding a secret`
      );
      check(
        `3: the ${who} session's Claude MCP config file holds none`,
        trace.configs.length > 0 &&
          !trace.configs.some((config) => holds(config.text)),
        trace.configs
          .map(
            (config) =>
              `${config.path}: ${holds(config.text) ? "HOLDS ONE" : "none"}`
          )
          .join("; ")
      );
    }
    const inWorkspace = await holding(user.cwd, needles);
    const inHome = await holding(fleet.home, needles);
    const inSandbox = await holding(fleet.sandbox, needles);
    for (const [tag, session] of [
      ["USER", user],
      ["NONE", none],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one session's file at a time
      const dumped = await readFile(
        join(session.cwd, envFile(tag)),
        "utf8"
      ).catch(() => "");
      check(
        `3: the ${tag === "USER" ? "granted" : "ungranted"} session's own commands run with no key or token`,
        dumped.includes("PATH=") && !holds(dumped),
        `${session.cwd}/${envFile(tag)}: ${dumped.split("\n").length} lines, ${holds(dumped) ? "HOLDS ONE" : "none"}`
      );
    }
    check(
      "3: its workspace holds none",
      inWorkspace.length === 0,
      `${user.cwd}: ${inWorkspace.join(", ") || "none"}`
    );
    check(
      "3: nothing under the scratch HOME or sandbox (hub database, logs, transcripts) holds one: sealed at rest",
      inHome.length === 0 && inSandbox.length === 0,
      `${needles.length} secrets; holding: ${[...inHome, ...inSandbox].join(", ") || "none"}`
    );
  });
} catch (error) {
  failed = true;
  console.error(
    `probe failed: ${error instanceof Error ? error.stack : String(error)}`
  );
  results.error = String(error);
} finally {
  if (failed) {
    const logs = (await readdir(fleet.sandbox))
      .filter((name) => name.endsWith(".log") || name.endsWith(".err"))
      .sort();
    for (const name of logs) {
      // biome-ignore lint/performance/noAwaitInLoops: one log at a time, in order
      const lines = (await Bun.file(join(fleet.sandbox, name)).text())
        .split("\n")
        .filter((line) => LOGGED.test(line))
        .slice(-40);
      console.log(`── ${name}\n${lines.join("\n").slice(0, 8000)}`);
    }
  }
  await fleet.close();
  await echo.stop(true);
  console.log(JSON.stringify(results, null, 2));
  await fleet.clean(keep || failed);
}
process.exit(failed ? 1 : 0);
