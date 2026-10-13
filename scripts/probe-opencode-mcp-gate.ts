#!/usr/bin/env bun
/**
 * OpenCode's MCP gate: a session refuses work only when CawCo's own MCP
 * server does not connect. Any other server that failed, needs sign-in or is
 * still connecting at the deadline is said to the session and its transcript,
 * and the session runs without it.
 *
 * A scratch hub, agent and sessiond (scripts/scratch-fleet.ts) with the
 * OpenCode 2.0 server (`opencode2`, 2.0.28, on the PATH), and two fleet MCP
 * servers on a loopback stand-in:
 *
 * - `probe-oauth`: an OAuth server the hub is not signed in to, so the hub
 *   answers every harness 503 "Sign in to this server from Configure → MCP
 *   servers." (the live failure: ElevenLabs on nightly 2877).
 * - `probe-slow`: a plain server whose `initialize` answers after
 *   {@link SLOW_MS}, inside the gate's deadline, with one tool, `slow_echo`.
 *
 * The agent reaches the hub through a loopback proxy that passes everything,
 * and answers CawCo's MCP (`/mcp/cawco`) 503 while `cawcoDown` is set.
 *
 * (a) An OpenCode session starts, runs a turn, and its transcript carries
 *     "probe-oauth didn't connect: …" (live, and read back after a hub
 *     restart, once); the model is told it too.
 * (b) The same first turn offers `slow_echo`: the pending server was waited for.
 * (c) With CawCo's MCP down, a session in a fresh location refuses with
 *     "This OpenCode session takes no work: CawCo's MCP server … ".
 *
 *   bun scripts/probe-opencode-mcp-gate.ts
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { scratchFleet, until } from "./scratch-fleet";

const OAUTH = "probe-oauth";
const SLOW = "probe-slow";
const TOOL = "slow_echo";
const SLOW_MS = 8000;
const TAG = "GATE-PROBE";

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`
  );
  if (!ok) {
    failures.push(label);
  }
};

// ── The stand-in MCP servers ────────────────────────────────────────────
let slowInitializes = 0;
const rpc = (id: number | string, result: unknown) =>
  Response.json({ jsonrpc: "2.0", id, result });
const slowEndpoint = async (request: Request): Promise<Response> => {
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
  switch (message.method) {
    case "initialize":
      slowInitializes += 1;
      await Bun.sleep(SLOW_MS);
      return rpc(message.id, {
        protocolVersion: message.params?.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "slow stand-in", version: "1" },
      });
    case "tools/list":
      return rpc(message.id, {
        tools: [
          {
            name: TOOL,
            description: "Echoes the probe's words.",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      });
    default:
      return Response.json({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32_601, message: "Method not found" },
      });
  }
};
const standIn = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  fetch(request) {
    const url = new URL(request.url);
    const { origin } = url;
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      return Response.json({
        resource: `${origin}/oauth/mcp`,
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
    if (url.pathname === "/oauth/mcp") {
      return new Response("unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/oauth/mcp"`,
        },
      });
    }
    if (url.pathname === "/slow/mcp") {
      return slowEndpoint(request);
    }
    return new Response("stand-in: no such path", { status: 404 });
  },
});
const standInBase = `http://127.0.0.1:${standIn.port}`;

const fleet = await scratchFleet({
  name: "probe-opencode-mcp-gate",
  respond: () => ({ everyMs: 10, words: ["ok"] }),
});

// ── The agent's way to the hub ──────────────────────────────────────────
let cawcoDown = false;
const hubOrigin = fleet.base;
const hubWs = hubOrigin.replace("http", "ws");
const proxy = Bun.serve<{ upstream: WebSocket; queue: (string | Buffer)[] }>({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  fetch(request, server) {
    const url = new URL(request.url);
    if (cawcoDown && url.pathname.startsWith("/mcp/cawco")) {
      return new Response("stand-in: CawCo's MCP is down", { status: 503 });
    }
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const upstream = new WebSocket(`${hubWs}${url.pathname}${url.search}`);
      upstream.binaryType = "nodebuffer";
      if (server.upgrade(request, { data: { upstream, queue: [] } })) {
        return;
      }
      upstream.close();
      return new Response("upgrade failed", { status: 400 });
    }
    const headers = new Headers(request.headers);
    headers.delete("host");
    return fetch(`${hubOrigin}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });
  },
  websocket: {
    open(socket) {
      const { upstream, queue } = socket.data;
      upstream.onmessage = (event) =>
        socket.send(event.data as string | Buffer);
      upstream.onclose = () => socket.close();
      const flush = () => {
        for (const message of queue.splice(0)) {
          upstream.send(message);
        }
      };
      if (upstream.readyState === WebSocket.OPEN) {
        flush();
      } else {
        upstream.onopen = flush;
      }
    },
    message(socket, message) {
      const { upstream, queue } = socket.data;
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(message);
      } else {
        queue.push(message);
      }
    },
    close(socket) {
      socket.data.upstream.close();
    },
  },
});

const reported = async (name: string) =>
  (
    await fleet.api<
      {
        fleet?: { mcp?: Record<string, { state: string; detail?: string }> };
        machineId: string;
      }[]
    >("/api/agents")
  ).find((row) => row.machineId === fleet.env.CAWCO_MACHINE_ID)?.fleet?.mcp?.[
    name
  ];
const put = async (name: string, config: object) => {
  const response = await fetch(`${fleet.base}/api/fleet/mcp/${name}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config, enabled: true }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`PUT ${name}: ${response.status} ${await response.text()}`);
  }
};
interface Block {
  content?: string;
  id: string;
  metadata?: { noteTitle?: string; subtype?: string };
  type?: string;
}
const notes = async (instanceId: string) =>
  (
    await fleet.api<{ blocks: Block[] }>(
      `/api/instances/${instanceId}/transcript`
    )
  ).blocks.filter((block) => block.metadata?.subtype === "mcp_not_connected");

let passed = false;
try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  // The agent, and every harness it starts, reaches the hub through the proxy.
  fleet.env.CAWCO_HUB_URL = `ws://127.0.0.1:${proxy.port}/ws`;
  fleet.launch("agent");
  await fleet.agentUp();

  await put(OAUTH, { type: "http", url: `${standInBase}/oauth/mcp` });
  await put(SLOW, { type: "http", url: `${standInBase}/slow/mcp` });
  for (const name of [OAUTH, SLOW]) {
    // biome-ignore lint/performance/noAwaitInLoops: each server's report in turn
    const row = await until(
      `the agent's report of ${name}`,
      () => reported(name),
      (one) =>
        one !== undefined &&
        (one.detail ?? "").includes("opencode: ") &&
        one.state !== "pending",
      180_000
    );
    console.log(`  ${name}: ${row.state} — ${row.detail}`);
  }

  // ── (a) and (b) ───────────────────────────────────────────────────────
  const before = slowInitializes;
  const instanceId = await fleet.spawn("opencode", "mcp gate probe");
  const sent = Date.now();
  await fleet.send(instanceId, `${TAG} hello`);
  const first = await until(
    "the session's first turn at the model",
    () => fleet.seen.find((one) => one.tools && one.last.includes(TAG)),
    Boolean,
    180_000
  );
  console.log(
    `  first turn at the model ${((first.at - sent) / 1000).toFixed(1)} s after the send; the slow server initialized ${slowInitializes - before} time(s) since the spawn; tools offered: ${first.toolNames.join(", ")}`
  );
  check(
    "(a) the session takes the send and runs its turn",
    true,
    `the mock answered a request carrying "${TAG} hello"`
  );
  check(
    "(b) the first turn offers the pending server's tool",
    first.body.includes(TOOL),
    first.body.includes(TOOL)
      ? `"${TOOL}" is in the first request`
      : "not in the first request"
  );
  check(
    "(a) the model is told the OAuth server did not connect",
    first.all.includes(`${OAUTH} didn't connect`),
    first.all.split("\n").find((line) => line.includes("didn't connect")) ??
      "(no such line)"
  );
  const live = await until(
    "the transcript's note",
    () => notes(instanceId),
    (found) => found.length > 0,
    60_000
  );
  check(
    "(a) the transcript carries the note, once",
    live.length === 1 &&
      live[0]?.metadata?.noteTitle === `${OAUTH} didn't connect` &&
      (live[0]?.content ?? "").includes("Sign in to this server") &&
      (live[0]?.content ?? "").endsWith("This session runs without its tools."),
    JSON.stringify(
      live.map((one) => ({
        title: one.metadata?.noteTitle,
        content: one.content,
      }))
    )
  );
  check(
    "(a) only the server that did not connect is noted",
    !live.some((one) => one.metadata?.noteTitle?.startsWith(SLOW)),
    live.map((one) => one.metadata?.noteTitle).join(", ")
  );
  // Read back from the session's store: a hub restarted reads it again.
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  let answered = "";
  const page = await until(
    "the transcript read again after a hub restart",
    async () => {
      const response = await fetch(
        `${fleet.base}/api/instances/${instanceId}/transcript`
      );
      const text = await response.text();
      answered = `${response.status} ${text.slice(0, 600)}`;
      return response.ok ? JSON.parse(text) : undefined;
    },
    (read: { blocks: Block[] }) => read.blocks.length > 0,
    60_000
  ).catch((error: unknown) => {
    throw new Error(`${String(error)}; the hub last answered: ${answered}`);
  });
  const reread = page.blocks.filter(
    (block) => block.metadata?.subtype === "mcp_not_connected"
  );
  check(
    "(a) read back after a hub restart, the note is there once",
    reread.length === 1 && reread[0]?.content === live[0]?.content,
    `${JSON.stringify(reread.map((one) => one.content))}; blocks: ${page.blocks.map((block) => block.type).join(", ")}`
  );

  // ── (c) ───────────────────────────────────────────────────────────────
  cawcoDown = true;
  const fresh = join(fleet.sandbox, "work-cawco-down");
  await mkdir(fresh, { recursive: true });
  const refused = await fleet.spawn("opencode", "cawco down probe", fresh);
  await fleet.send(refused, `${TAG} refused`);
  const row = await until(
    "the session refused",
    () => fleet.instance(refused),
    (one) => (one?.last_error ?? "").includes("takes no work"),
    150_000
  );
  check(
    "(c) with CawCo's MCP down, the session refuses with the sentence",
    (row.last_error ?? "").includes(
      "This OpenCode session takes no work: CawCo's MCP server"
    ),
    `${row.status}: ${row.last_error}`
  );
  check(
    "(c) the refused session's send never reached the model",
    !fleet.seen.some((one) => one.last.includes(`${TAG} refused`)),
    ""
  );
  passed = failures.length === 0;
} catch (error) {
  console.error(error);
  console.error((await fleet.logs("agent")).split("\n").slice(-60).join("\n"));
} finally {
  await fleet.close();
  await proxy.stop(true);
  await standIn.stop(true);
  await fleet.clean(!passed);
}
console.log(
  passed
    ? "mcp gate probe: passed"
    : `mcp gate probe: FAILED (${failures.join("; ") || "error"})`
);
process.exit(passed ? 0 : 1);
