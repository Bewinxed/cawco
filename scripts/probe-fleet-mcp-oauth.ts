/**
 * A fleet OAuth MCP server the hub signed in is reached signed in by every
 * harness, and no harness ever registers an OAuth client of its own.
 *
 * A scratch hub, agent and sessiond (scripts/scratch-fleet.ts) with the real
 * `claude` CLI, and a stand-in OAuth MCP server on loopback: protected
 * resource and authorization server metadata, Dynamic Client Registration,
 * an authorize endpoint that hands back a code, a token endpoint with PKCE
 * and rotating refresh tokens, and an MCP endpoint that answers only a token
 * it issued, with one tool, `probe_echo`.
 *
 * 1. The server is saved before the hub signs in. The hub marks it OAuth and
 *    syncs it proxied. A Claude Code session on the machine connects to the
 *    proxy: it is not asked to authorize, attempts no registration, and
 *    Claude Code keeps no needs-auth entry for it.
 * 2. The hub signs in, through its own routes, as the dashboard does.
 * 3. A fresh Claude Code session at once (inside Claude Code's 15-minute
 *    needs-auth window) lists `probe_echo`; the agent reports the server
 *    applied; a spawned session offers the tool to its model.
 * 4. The token endpoint stops answering (503) while the access token is due
 *    for refresh: the harness gets no answer for that request, and the hub
 *    stays signed in. Once it answers again, a fresh session lists the tool.
 *
 * Only the hub registers a client at the stand-in, once.
 *
 * The machine's row is each harness's: Claude Code's and the OpenCode 2.0
 * server's, so `opencode2` (2.0.28, `npm install @opencode/cli@2.0.28`) must
 * be on the PATH the probe runs with.
 *
 *   bun scripts/probe-fleet-mcp-oauth.ts
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../packages/core/src/claude-dirs";
import { ensureDeps } from "./lib/deps";

// The dependencies first (lib/deps.ts): what needs them loads after.
await ensureDeps();
const { claudeExecutableOptions, idle } =
  await import("../packages/agent/src/auth");
const { scratchFleet, until } = await import("./scratch-fleet");

/** The Agent SDK the agent itself runs Claude Code through: its dependency, not the root's. */
const { query } = (await import(
  createRequire(
    join(import.meta.dir, "..", "packages", "agent", "package.json")
  ).resolve("@anthropic-ai/claude-agent-sdk")
)) as typeof import("../packages/agent/node_modules/@anthropic-ai/claude-agent-sdk");

const NAME = "probe-oauth";
const TOOL = "probe_echo";

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`
  );
  if (!ok) {
    failures.push(label);
  }
};

// ── The stand-in OAuth MCP server ───────────────────────────────────────
const hits: string[] = [];
const registrations: unknown[] = [];
const codes = new Map<string, string>();
const access = new Set<string>();
const refresh = new Set<string>();
let tokenDown = false;
const b64url = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("base64url");
const issue = () => {
  const tokens = {
    access_token: crypto.randomUUID(),
    refresh_token: crypto.randomUUID(),
    token_type: "Bearer",
    // Inside the hub's 60 s margin: every forwarded request refreshes first.
    expires_in: 30,
  };
  access.add(tokens.access_token);
  refresh.add(tokens.refresh_token);
  return Response.json(tokens);
};
const BEARER = /^Bearer /;

/** The token endpoint: a code for the PKCE verifier it was issued under, or a refresh token, once. */
const tokenEndpoint = async (request: Request): Promise<Response> => {
  const form = new URLSearchParams(await request.text());
  if (form.get("grant_type") === "authorization_code") {
    const challenge = codes.get(form.get("code") ?? "");
    codes.delete(form.get("code") ?? "");
    const digest = b64url(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(form.get("code_verifier") ?? "")
      )
    );
    if (!challenge || digest !== challenge) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    return issue();
  }
  if (form.get("grant_type") === "refresh_token") {
    if (tokenDown) {
      return new Response("upstream down", { status: 503 });
    }
    if (!refresh.delete(form.get("refresh_token") ?? "")) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    return issue();
  }
  return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
};

/** A JSON-RPC request's result, or undefined for a method the stand-in has not. */
const rpcResult = (method: string, protocolVersion?: string) => {
  switch (method) {
    case "initialize":
      return {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "stand-in", version: "1" },
      };
    case "tools/list":
      return {
        tools: [
          {
            name: TOOL,
            description: "Echoes the probe's words.",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      };
    case "tools/call":
      return { content: [{ type: "text", text: "echo" }] };
    default:
      return;
  }
};

/** The MCP endpoint: only a token the stand-in issued, else the OAuth challenge. */
const mcpEndpoint = async (
  request: Request,
  origin: string
): Promise<Response> => {
  const token = request.headers.get("Authorization")?.replace(BEARER, "");
  if (!(token && access.has(token))) {
    return new Response("unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
      },
    });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  const message = (await request.json()) as {
    id?: number | string;
    method: string;
    params?: { protocolVersion?: string };
  };
  if (message.id === undefined) {
    return new Response(null, { status: 202 });
  }
  const result = rpcResult(message.method, message.params?.protocolVersion);
  return Response.json(
    result === undefined
      ? {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32_601, message: "Method not found" },
        }
      : { jsonrpc: "2.0", id: message.id, result }
  );
};

const standIn = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const { origin } = url;
    hits.push(`${request.method} ${url.pathname}`);
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      return Response.json({
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        scopes_supported: ["probe"],
      });
    }
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return Response.json({
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      });
    }
    if (url.pathname === "/register" && request.method === "POST") {
      const body = (await request.json()) as object;
      registrations.push(body);
      return Response.json(
        { ...body, client_id: crypto.randomUUID() },
        { status: 201 }
      );
    }
    if (url.pathname === "/authorize") {
      const code = crypto.randomUUID();
      codes.set(code, url.searchParams.get("code_challenge") ?? "");
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      return Response.redirect(back.toString(), 302);
    }
    if (url.pathname === "/token" && request.method === "POST") {
      return tokenEndpoint(request);
    }
    if (url.pathname === "/mcp") {
      return mcpEndpoint(request, origin);
    }
    return new Response("stand-in: no such path", { status: 404 });
  },
});
const upstream = `http://127.0.0.1:${standIn.port}/mcp`;

const fleet = await scratchFleet({
  name: "probe-fleet-mcp-oauth",
  respond: () => ({ everyMs: 10, words: ["ok"] }),
});

const send = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    redirect: "manual",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${text}`);
  }
  return JSON.parse(text) as unknown;
};

interface McpRow {
  auth?: { mode: string; state: string; detail?: string };
  name: string;
}
const hubRow = async () =>
  (
    (await send("GET", "/api/fleet")) as { config: { mcp: McpRow[] } }
  ).config.mcp.find((row) => row.name === NAME);
const reported = async () =>
  (
    (await send("GET", "/api/agents")) as {
      fleet?: { mcp?: Record<string, { state: string; detail?: string }> };
      machineId: string;
    }[]
  ).find((row) => row.machineId === fleet.env.CAWCO_MACHINE_ID)?.fleet?.mcp?.[
    NAME
  ];

/** Claude Code's needs-auth cache on the machine, as a fresh session reads it. */
const needsAuthCache = join(
  fleet.home,
  CLAUDE_DIR_NAME,
  "mcp-needs-auth-cache.json"
);

/**
 * A fresh Claude Code session on the scratch machine, as the agent starts its
 * own MCP read (mcp-status.ts): the machine's HOME, its user config. Answers
 * the fleet server's settled status.
 */
const freshSession = async () => {
  const { CLAUDE_CONFIG_DIR: _dir, ...env } = fleet.env;
  const handle = query({
    prompt: idle,
    options: {
      persistSession: false,
      env,
      ...claudeExecutableOptions(),
    },
  });
  try {
    return await until(
      `${NAME} settled in a fresh Claude Code session`,
      async () =>
        (await handle.mcpServerStatus()).find((row) => row.name === NAME),
      (row) => row !== undefined && row.status !== "pending",
      60_000
    );
  } finally {
    handle.close();
  }
};

const oauthHits = (seen: string[]) =>
  seen.filter(
    (hit) =>
      hit.includes("/register") ||
      hit.includes("/.well-known") ||
      hit.includes("/authorize")
  );

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  // ── 1. Saved, not signed in ───────────────────────────────────────────
  await send("PUT", `/api/fleet/mcp/${NAME}`, {
    config: { type: "http", url: upstream },
    enabled: true,
  });
  const saved = await hubRow();
  check(
    "the hub discovers the stand-in as OAuth, not signed in",
    saved?.auth?.mode === "oauth" && saved.auth.state === "needs-auth",
    JSON.stringify(saved?.auth)
  );
  const hubDiscovery = hits.length;
  const before = await until(
    "the agent's report of the server",
    reported,
    (row) => row !== undefined && row.state !== "pending",
    120_000
  );
  const unsigned = await freshSession();
  console.log(
    `  before sign-in: agent report ${JSON.stringify(before)}; fresh session ${unsigned.status} ${unsigned.error ?? ""}`
  );
  check(
    "before sign-in, no harness is asked to authorize",
    unsigned.status !== "needs-auth" &&
      before.state !== "needs-auth" &&
      !/registration|authoriz/i.test(`${unsigned.error} ${before.detail}`),
    `${unsigned.status}: ${unsigned.error ?? ""}`
  );
  const opencodeLine = before.detail
    ?.split("\n")
    .find((line) => line.startsWith("opencode: "));
  check(
    "before sign-in, OpenCode's line is what its server met: the hub's 503",
    opencodeLine?.startsWith("opencode: failed") === true &&
      opencodeLine.includes("Sign in to this server"),
    opencodeLine ?? "(no OpenCode line)"
  );
  check(
    "before sign-in, Claude Code keeps no needs-auth entry",
    !(
      existsSync(needsAuthCache) &&
      (await Bun.file(needsAuthCache).text()).includes(NAME)
    ),
    existsSync(needsAuthCache) ? await Bun.file(needsAuthCache).text() : ""
  );
  const later = oauthHits(hits.slice(hubDiscovery));
  check(
    "after the hub's discovery, nothing reached the stand-in's OAuth endpoints",
    later.length === 0 && registrations.length === 0,
    later.join(", ")
  );

  // ── 2. The hub signs in ───────────────────────────────────────────────
  const { authorizationUrl } = (await send(
    "POST",
    `/api/fleet/mcp/${NAME}/sign-in`
  )) as { authorizationUrl: string };
  const consent = await fetch(authorizationUrl, { redirect: "manual" });
  const back = new URL(consent.headers.get("location") ?? "");
  await send("POST", "/api/fleet/mcp/oauth/complete", {
    code: back.searchParams.get("code"),
    state: back.searchParams.get("state"),
  });
  check(
    "the hub is signed in",
    (await hubRow())?.auth?.state === "signed-in",
    JSON.stringify((await hubRow())?.auth)
  );

  // ── 3. A fresh session, inside Claude Code's 15-minute window ────────
  const signed = await freshSession();
  check(
    "a fresh Claude Code session lists the server's tools",
    signed.status === "connected" &&
      (signed.tools ?? []).some((tool) => tool.name === TOOL),
    `${signed.status} ${signed.error ?? ""} tools=${(signed.tools ?? []).map((tool) => tool.name).join(",")}`
  );
  // The machine's row, each harness's line: what Claude Code and the
  // OpenCode 2.0 server each loaded.
  const after = await until(
    "the agent's report after sign-in",
    reported,
    (row) => row?.state === "applied",
    240_000
  ).catch(async () => (await reported()) ?? { state: "no report" });
  check(
    "the agent reports the server applied by Claude Code and OpenCode",
    after.state === "applied" &&
      after.detail?.includes("claude: applied") === true &&
      after.detail.includes("opencode: applied"),
    JSON.stringify(after)
  );
  const instanceId = await fleet.spawn("claude", "fleet oauth probe");
  await fleet.send(instanceId, "list your tools");
  const turn = await until(
    "the spawned session's turn",
    () =>
      fleet.seen.find(
        (one) => one.tools && one.last.includes("list your tools")
      ),
    Boolean,
    120_000
  ).catch(() => undefined);
  const offered = (turn?.toolNames ?? []).filter((name) =>
    name.startsWith(`mcp__${NAME}__`)
  );
  check(
    "a spawned session offers the server's tool to its model",
    offered.includes(`mcp__${NAME}__${TOOL}`),
    offered.join(", ") || `(${turn?.toolNames.length ?? 0} tools offered)`
  );

  // ── 4. The token endpoint stops answering ─────────────────────────────
  tokenDown = true;
  const blip = await freshSession();
  console.log(`  token endpoint down: ${blip.status} ${blip.error ?? ""}`);
  check(
    "with the token endpoint down, the hub stays signed in",
    (await hubRow())?.auth?.state === "signed-in",
    JSON.stringify((await hubRow())?.auth)
  );
  tokenDown = false;
  const recovered = await freshSession();
  check(
    "once the token endpoint answers, a fresh session lists the tool",
    recovered.status === "connected" &&
      (recovered.tools ?? []).some((tool) => tool.name === TOOL),
    `${recovered.status} ${recovered.error ?? ""}`
  );
  check(
    "only the hub registered a client, once",
    registrations.length === 1 &&
      JSON.stringify(registrations[0]).includes("CawCo fleet"),
    JSON.stringify(registrations)
  );
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.log(`FAIL ${failures.at(-1)}`);
} finally {
  await fleet.close();
  await standIn.stop(true);
  await fleet.clean(failures.length > 0);
}

console.log(
  failures.length === 0
    ? "ALL PASS"
    : `${failures.length} FAILED:\n${failures.join("\n")}`
);
process.exit(failures.length === 0 ? 0 : 1);
