/**
 * A sign-in reaches every running session with the server's whole tool list,
 * and the burst of sessions redialling never trips the upstream's rate limit.
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), with a stub OAuth MCP server (`/oauth-mcp`) that lists
 * {@link TOOLS} tools, holds a session per `initialize`, and answers 429
 * (`Retry-After: 1`) to any request past {@link LIMIT} within
 * {@link WINDOW_MS} — every request it was sent counts, refused or not:
 *
 * 1. Twelve Claude sessions run while `probeburst` is signed out. Signed in
 *    through the hub's flow: every session's line reads it connected with
 *    {@link TOOLS} tools, and the stub never saw more than {@link LIMIT}
 *    requests within any {@link WINDOW_MS}.
 * 2. Twelve concurrent `tools/call`s straight at the hub's relay, past the
 *    stub's limit: every one is answered with the tool's result, none 429.
 * 3. Sessions left without the tools: with the stub's `tools/list` failing,
 *    the server is disabled and enabled again at the hub, and every session
 *    takes it back connected with 0 tools. The stub lists again, the agent
 *    restarts, and every session heals to {@link TOOLS} tools with no new
 *    sign-in or change at the hub; the stub again never saw more than
 *    {@link LIMIT} within any window.
 *
 *   bun scripts/probe-kit/run.ts mcp-fleet-burst
 */
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const SERVER = "probeburst";
const TOKEN = "probe-burst-token";
const SESSIONS = 12;
const TOOLS = 7;
const LIMIT = 5;
const WINDOW_MS = 3000;

const words = (text: string): Reply => ({ everyMs: 5, words: [text] });

const respond = (request: Seen): Reply =>
  request.tools ? words("ok") : words("Probe title");

interface Rpc {
  id?: number | string;
  method: string;
}

/** The stub upstream: its rate limit, what it saw, and a switch that fails its listing. */
const stub = () => {
  const seen: number[] = [];
  const stats = {
    maxInWindow: 0,
    refused: 0,
    requests: 0,
    calls: 0,
    methods: {} as Record<string, number>,
  };
  const sessions = new Set<string>();
  let broken = false;
  const tools = Array.from({ length: TOOLS }, (_, i) => ({
    name: `tool${i + 1}`,
    description: `Stub tool ${i + 1}.`,
    inputSchema: { type: "object", properties: {} },
  }));
  const rpc = (id: Rpc["id"] | null, reply: object, init?: ResponseInit) =>
    Response.json({ jsonrpc: "2.0", id, ...reply }, init);

  /** Counts the request in the window: true when it is past the limit. */
  const over = (label: string): boolean => {
    const now = Date.now();
    seen.push(now);
    while (seen.length > 0 && (seen[0] as number) <= now - WINDOW_MS) {
      seen.shift();
    }
    stats.requests += 1;
    stats.methods[label] = (stats.methods[label] ?? 0) + 1;
    stats.maxInWindow = Math.max(stats.maxInWindow, seen.length);
    if (seen.length > LIMIT) {
      stats.refused += 1;
      return true;
    }
    return false;
  };

  const answer = (message: Rpc, session: string | null): Response => {
    if (message.method === "initialize") {
      const id = crypto.randomUUID();
      sessions.add(id);
      return rpc(
        message.id,
        {
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: "probe-burst", version: "1" },
          },
        },
        { headers: { "Mcp-Session-Id": id } }
      );
    }
    if (!(session && sessions.has(session))) {
      return rpc(
        message.id ?? null,
        { error: { code: -32_001, message: "Session not found" } },
        { status: 404 }
      );
    }
    if (message.id === undefined) {
      return new Response(null, { status: 202 });
    }
    if (message.method === "tools/list") {
      return rpc(
        message.id,
        broken
          ? { error: { code: -32_603, message: "listing is broken" } }
          : { result: { tools } }
      );
    }
    if (message.method === "tools/call") {
      stats.calls += 1;
      return rpc(message.id, {
        result: { content: [{ type: "text", text: "stub-called" }] },
      });
    }
    return rpc(message.id, {
      error: { code: -32_601, message: `Method not found: ${message.method}` },
    });
  };

  const mcp = async (request: Request): Promise<Response> => {
    const message =
      request.method === "POST" ? ((await request.json()) as Rpc) : undefined;
    if (over(message?.method ?? request.method)) {
      return Response.json(
        { error: { code: "rate_limited", message: "Too many requests" } },
        { status: 429, headers: { "Retry-After": "1" } }
      );
    }
    if (!message) {
      return new Response(null, {
        status: request.method === "DELETE" ? 200 : 405,
      });
    }
    return answer(message, request.headers.get("mcp-session-id"));
  };

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const { origin } = url;
      switch (url.pathname) {
        case "/oauth-mcp":
          if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) {
            await request.body?.cancel();
            return new Response("unauthorized", {
              status: 401,
              headers: {
                "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
              },
            });
          }
          return await mcp(request);
        case "/.well-known/oauth-protected-resource":
          return Response.json({
            resource: `${origin}/oauth-mcp`,
            authorization_servers: [origin],
          });
        case "/.well-known/oauth-authorization-server":
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
        case "/register": {
          const asked = (await request.json()) as Record<string, unknown>;
          return Response.json(
            { ...asked, client_id: "probe-client" },
            { status: 201 }
          );
        }
        case "/token":
          return Response.json({
            access_token: TOKEN,
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "probe-refresh-token",
          });
        default:
          return new Response("not found", { status: 404 });
      }
    },
  });
  return {
    server,
    origin: `http://127.0.0.1:${server.port}`,
    stats,
    /** A new phase: counts start over, and the window empties first. */
    reset: async () => {
      await Bun.sleep(WINDOW_MS);
      seen.length = 0;
      Object.assign(stats, {
        maxInWindow: 0,
        refused: 0,
        requests: 0,
        calls: 0,
        methods: {},
      });
    },
    setBroken: (value: boolean) => {
      broken = value;
    },
  };
};

type Line = { status: string; tools: number } | undefined;

/** Each session's last line matching `pattern` in `log`: its status and tool count. */
const lines = (
  log: string,
  sessions: string[],
  pattern: (session: string) => RegExp
): Map<string, Line> =>
  new Map(
    sessions.map((session) => {
      const last = [...log.matchAll(pattern(session))].at(-1);
      return [
        session,
        last
          ? { status: last[1] as string, tools: Number(last[2] ?? 0) }
          : undefined,
      ] as const;
    })
  );

/** The agent's line for `kind` of the server in one session (claude.ts `#takeFleetMcp`). */
const takenAs = (kind: string) => (session: string) =>
  new RegExp(
    `\\[claude\\] ${session}: fleet MCP [^\\n]*?${SERVER} ${kind}: (\\w+)(?: \\((\\d+) tools\\))?`,
    "g"
  );
/** The agent's heal line for the server in one session (claude.ts `#healFleetMcp`). */
const healed = (session: string) =>
  new RegExp(
    `\\[claude\\] ${session}: healed fleet MCP ${SERVER} was [^,]+, now (\\w+)(?: \\((\\d+) tools\\))?`,
    "g"
  );

const counted = (read: Map<string, Line>, tools: number) =>
  [...read.values()].filter(
    (one) => one?.status === "connected" && one.tools === tools
  ).length;

const spec: Spec = {
  name: "mcp-fleet-burst",
  run: async (kit) => {
    const upstream = stub();
    const fleet = await kit.fleet(respond);
    try {
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.fileAccount();
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.accountSignedIn();

      const hub = async <T>(
        method: string,
        path: string,
        body?: unknown
      ): Promise<T> => {
        const response = await fetch(`${fleet.base}${path}`, {
          method,
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
          throw new Error(`${method} ${path}: ${response.status} ${text}`);
        }
        return (text ? JSON.parse(text) : undefined) as T;
      };
      const putServer = (enabled: boolean) =>
        hub<{ auth?: { mode: string; state: string } }>(
          "PUT",
          `/api/fleet/mcp/${SERVER}`,
          {
            config: { type: "http", url: `${upstream.origin}/oauth-mcp` },
            enabled,
          }
        );
      const signIn = async () => {
        const started = await hub<{ authorizationUrl: string }>(
          "POST",
          `/api/fleet/mcp/${SERVER}/sign-in`
        );
        const state = new URL(started.authorizationUrl).searchParams.get(
          "state"
        );
        await hub("POST", "/api/fleet/mcp/oauth/complete", {
          code: "probe-code",
          state,
        });
      };
      const logLength = async () => (await fleet.logs("agent")).length;
      /** Every session's line after `since` in the agent's log, once `done` holds of them all (or the wait ends). */
      const awaitLines = async (
        what: string,
        since: number,
        pattern: (one: string) => RegExp,
        done: (read: Map<string, Line>) => boolean,
        ms = 120_000
      ) => {
        const read = async () =>
          lines((await fleet.logs("agent")).slice(since), sessions, pattern);
        return await until(what, read, done, ms).catch(read);
      };
      const stubSaw = () =>
        `max ${upstream.stats.maxInWindow} in a window, ${upstream.stats.refused} refused, ${upstream.stats.requests} requests ${JSON.stringify(upstream.stats.methods)}`;

      const put = await putServer(true);
      kit.check(
        "the stub server is put at the hub signed out",
        put.auth?.mode === "oauth" && put.auth.state === "needs-auth",
        JSON.stringify(put.auth)
      );

      // Twelve sessions, each through one turn, while it is signed out.
      const sessions = await Promise.all(
        Array.from({ length: SESSIONS }, (_, i) =>
          fleet.spawn("claude", `Burst ${i + 1}`)
        )
      );
      await Promise.all(
        sessions.map(async (session, i) => {
          const mark = `BURST-${i + 1} first turn`;
          await fleet.send(session, mark);
          await until(
            `session ${i + 1}'s first turn at the model`,
            () => fleet.seen.some((one) => one.all.includes(mark)),
            Boolean,
            180_000
          );
        })
      );

      // 1. The sign-in burst.
      await upstream.reset();
      let from = await logLength();
      await signIn();
      const signedIn = await awaitLines(
        `every session's ${SERVER} signed-in line`,
        from,
        takenAs("signed-in"),
        (read) => [...read.values()].every(Boolean)
      );
      kit.check(
        `1: after the sign-in, all ${SESSIONS} sessions read ${SERVER} connected with ${TOOLS} tools`,
        counted(signedIn, TOOLS) === SESSIONS,
        `${counted(signedIn, TOOLS)}/${SESSIONS}: ${JSON.stringify([...signedIn.values()])}`
      );
      kit.check(
        `1: the stub never saw more than ${LIMIT} requests within ${WINDOW_MS / 1000} s, and refused none`,
        upstream.stats.maxInWindow <= LIMIT && upstream.stats.refused === 0,
        stubSaw()
      );

      // 2. Past the limit on purpose: every call answered, none 429.
      await upstream.reset();
      const relay = `${fleet.base}/mcp/fleet/${SERVER}`;
      const opened = await fetch(relay, {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "probe", version: "1" },
          },
        }),
      });
      const relaySession = opened.headers.get("Mcp-Session-Id") ?? "";
      await opened.body?.cancel();
      const answers = await Promise.all(
        Array.from({ length: SESSIONS }, async (_, i) => {
          const response = await fetch(relay, {
            method: "POST",
            headers: {
              Accept: "application/json, text/event-stream",
              "Content-Type": "application/json",
              "Mcp-Session-Id": relaySession,
              "MCP-Protocol-Version": "2025-06-18",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 10 + i,
              method: "tools/call",
              params: { name: "tool1", arguments: {} },
            }),
            signal: AbortSignal.timeout(60_000),
          });
          return { status: response.status, text: await response.text() };
        })
      );
      const answered = answers.filter(
        (one) => one.status === 200 && one.text.includes("stub-called")
      ).length;
      kit.check(
        `2: ${SESSIONS} concurrent calls past the stub's limit: every one answered with its result, none 429`,
        answered === SESSIONS && answers.every((one) => one.status !== 429),
        `${answered}/${SESSIONS} answered; statuses ${answers.map((one) => one.status).join(",")}; the stub refused ${upstream.stats.refused} and ran ${upstream.stats.calls} calls`
      );
      kit.check(
        "2: the stub did refuse some of them, so the hub held and sent them again",
        upstream.stats.refused > 0,
        `${upstream.stats.refused} refused`
      );

      // 3. Sessions left without the tools, then an agent restart.
      upstream.setBroken(true);
      from = await logLength();
      await putServer(false);
      await awaitLines(
        `every session's ${SERVER} disabled line`,
        from,
        takenAs("disabled"),
        (read) => [...read.values()].every(Boolean)
      );
      from = await logLength();
      await putServer(true);
      const emptied = await awaitLines(
        `every session's ${SERVER} line reading 0 tools`,
        from,
        takenAs("enabled"),
        (read) => counted(read, 0) === SESSIONS
      );
      kit.check(
        `3: with the stub's listing failing, the server taken back leaves all ${SESSIONS} sessions connected with 0 tools`,
        counted(emptied, 0) === SESSIONS,
        `${counted(emptied, 0)}/${SESSIONS}: ${JSON.stringify([...emptied.values()])}`
      );
      upstream.setBroken(false);
      await upstream.reset();
      from = await logLength();
      await fleet.stop("agent");
      fleet.launch("agent");
      await fleet.agentUp();
      const heals = await awaitLines(
        "every session's heal line",
        from,
        healed,
        (read) => [...read.values()].every(Boolean),
        180_000
      );
      kit.check(
        `3: after an agent restart, with no new sign-in, all ${SESSIONS} sessions heal to ${TOOLS} tools`,
        counted(heals, TOOLS) === SESSIONS,
        `${counted(heals, TOOLS)}/${SESSIONS}: ${JSON.stringify([...heals.values()])}`
      );
      kit.check(
        `3: through the heal, the stub never saw more than ${LIMIT} requests within ${WINDOW_MS / 1000} s, and refused none`,
        upstream.stats.maxInWindow <= LIMIT && upstream.stats.refused === 0,
        stubSaw()
      );
      kit.note(
        (await fleet.logs("agent"))
          .split("\n")
          .filter(
            (line) =>
              line.includes(`healed fleet MCP ${SERVER}`) ||
              line.includes("fleet MCP heal")
          )
          .join("\n")
      );
      kit.note(
        (await fleet.logs("hub"))
          .split("\n")
          .filter((line) => line.includes(`[fleet-mcp] ${SERVER}:`))
          .slice(-12)
          .join("\n")
      );
    } finally {
      await upstream.server.stop(true);
    }
  },
};

export default spec;
