import { mcpGatewayPort } from "@cawco/core";
import {
  AGENT_RESTARTING,
  RESUMABLE_CAWCO_TOOLS,
} from "@cawco/core/binary-updates";
import { portHolder } from "@cawco/core/live-processes";
import {
  fenced,
  holdRestart,
  lowerFence,
  raiseFence,
  restartReadiness,
} from "./restart";

const MCP_RELAY_PATH = /^\/mcp\/(?:cawco|fleet\/[^/]+)$/;
const TOOL_READ_PATH =
  /^\/api\/(?:instances|delegation\/tools|workflow-runs\/[^/]+\/state\/[^/]+)$/;
const TOOL_WRITE_PATH =
  /^\/api\/(?:delegation\/call\/[^/]+|workflow-steps\/[^/]+\/result|workflow-runs\/[^/]+\/state\/[^/]+)$/;
const DELEGATION_CALL_PATH = /^\/api\/delegation\/call\//;
const STEP_RESULT_PATH = /^\/api\/workflow-steps\//;

/** Relay only MCP and the generated tools' exact API routes; never arbitrary hub paths. */
async function relayMcp(
  request: Request,
  body: ArrayBuffer | undefined,
  hubUrl: string
): Promise<Response> {
  const incoming = new URL(request.url);
  if (incoming.hostname !== "127.0.0.1") {
    return new Response("MCP relay requires a loopback host.", { status: 403 });
  }
  if (request.headers.has("Origin")) {
    const origin = request.headers.get("Origin");
    if (origin !== incoming.origin) {
      return new Response("Cross-origin MCP access is not allowed.", {
        status: 403,
      });
    }
  }
  const hub = new URL(hubUrl);
  hub.protocol = hub.protocol === "wss:" ? "https:" : "http:";
  hub.pathname = incoming.pathname;
  hub.search = incoming.search;
  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.delete("Connection");
  headers.delete("Content-Length");
  try {
    const response = await fetch(hub, {
      method: request.method,
      headers,
      body,
      signal: request.signal,
      redirect: "error",
      timeout: false,
    });
    const outgoing = new Headers(response.headers);
    for (const name of [
      "Content-Encoding",
      "Content-Length",
      "Connection",
      "Transfer-Encoding",
    ]) {
      outgoing.delete(name);
    }
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return new Response("The CawCo hub could not be reached.", { status: 502 });
  }
}

const parsed = (body: ArrayBuffer): unknown => {
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return undefined;
  }
};

/**
 * The tool a relayed request calls, when a restart cutting it would lose
 * work: undefined for a read, for MCP's own handshake and listing, and for a
 * CawCo tool the hub finishes by itself ({@link RESUMABLE_CAWCO_TOOLS}). A
 * fleet server's tools are not CawCo's, so every call to one counts.
 */
function heldCall(
  pathname: string,
  body: ArrayBuffer | undefined
): string | undefined {
  if (!body) {
    return undefined;
  }
  if (MCP_RELAY_PATH.test(pathname)) {
    return heldMcpCall(pathname, parsed(body));
  }
  if (!DELEGATION_CALL_PATH.test(pathname)) {
    return STEP_RESULT_PATH.test(pathname)
      ? "submit_result"
      : "workflow_state_write";
  }
  const name = (parsed(body) as { name?: unknown } | undefined)?.name;
  if (typeof name !== "string") {
    return "unnamed";
  }
  return RESUMABLE_CAWCO_TOOLS.has(name) ? undefined : name;
}

/** The first `tools/call` in a JSON-RPC message (or batch) that holds, by its tool's name. */
function heldMcpCall(pathname: string, message: unknown): string | undefined {
  const cawco = pathname === "/mcp/cawco";
  for (const one of Array.isArray(message) ? message : [message]) {
    const call = one as
      | { method?: unknown; params?: { name?: unknown } }
      | undefined;
    const name =
      typeof call?.params?.name === "string" ? call.params.name : "unnamed";
    if (call?.method !== "tools/call") {
      continue;
    }
    if (!cawco) {
      return `${pathname.slice("/mcp/fleet/".length)}/${name}`;
    }
    if (!RESUMABLE_CAWCO_TOOLS.has(name)) {
      return name;
    }
  }
  return undefined;
}

/** A relayed call's response, holding the restart until its body has ended either way. */
function holdingUntilEnd(response: Response, release: () => void): Response {
  if (!response.body) {
    release();
    return response;
  }
  const reader = response.body.getReader();
  return new Response(
    new ReadableStream({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) {
            release();
            controller.close();
          } else {
            controller.enqueue(next.value);
          }
        } catch (error) {
          release();
          controller.error(error);
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          release();
        }
      },
    }),
    { status: response.status, headers: response.headers }
  );
}

/**
 * The refusal a raised fence gives a call a restart would cut: 503, with the
 * reason in words, and for an MCP request a JSON-RPC error under its own id so
 * the harness can hand the words to its model.
 */
function notStarted(body: ArrayBuffer | undefined): Response {
  const message = body ? parsed(body) : undefined;
  const id = (message as { id?: unknown } | undefined)?.id;
  return Response.json(
    id === undefined
      ? { error: AGENT_RESTARTING, started: false }
      : {
          jsonrpc: "2.0",
          id,
          error: { code: -32_000, message: AGENT_RESTARTING },
        },
    { status: 503, headers: { "Retry-After": "60" } }
  );
}

/**
 * `cawco service restart agent` asks here, on this machine, what a restart
 * would cut, and raises its own fence for the moment between its last look
 * and the restart. Never from a page: a browser sends `Origin`.
 */
async function restartRoute(request: Request): Promise<Response> {
  if (request.headers.has("Origin")) {
    return new Response("Not from a browser.", { status: 403 });
  }
  if (request.method === "POST") {
    const { ms } = (await request.json().catch(() => ({}))) as {
      ms?: unknown;
    };
    if (typeof ms === "number" && ms > 0) {
      raiseFence("service-restart", Math.min(ms, 5 * 60_000));
    } else {
      lowerFence("service-restart");
    }
  }
  return Response.json({ ...restartReadiness(), fenced: fenced() });
}

/** One stable loopback endpoint every harness reaches the hub's tools through. */
/** What refreshes a provider account's sign-in; set by the daemon. */
let freshener: ((accountId: string) => Promise<void>) | undefined;

export const setAccountFreshener = (
  fresh: (accountId: string) => Promise<void>
): void => {
  freshener = fresh;
};

/**
 * `POST /accounts/<id>/fresh`: a pi session or OpenCode's CawCo plugin found
 * the account's sign-in near its expiry and asks the agent, its only writer,
 * to refresh it. Answers once it has, with nothing secret: the asker reads
 * the store again.
 */
const ACCOUNT_FRESH_PATH = /^\/accounts\/([^/]+)\/fresh$/;

const freshRoute = async (accountId: string): Promise<Response> => {
  if (!freshener) {
    return new Response("The agent is not ready to refresh sign-ins yet.", {
      status: 503,
    });
  }
  try {
    await freshener(decodeURIComponent(accountId));
    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : String(error),
      {
        status: 502,
      }
    );
  }
};

export const startMcpGateway = async (hubUrl: () => string) => {
  // The one setting every session's config names too: a different port on a
  // live machine leaves its running sessions dialling the old one.
  const port = mcpGatewayPort();
  try {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      idleTimeout: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/restart" || url.pathname === "/restart/fence") {
          return await restartRoute(request);
        }
        const fresh = url.pathname.match(ACCOUNT_FRESH_PATH);
        if (fresh?.[1] && request.method === "POST") {
          return await freshRoute(fresh[1]);
        }
        if (
          !(
            MCP_RELAY_PATH.test(url.pathname) ||
            (request.method === "GET" && TOOL_READ_PATH.test(url.pathname)) ||
            (request.method === "POST" && TOOL_WRITE_PATH.test(url.pathname))
          )
        ) {
          return new Response("Not found.", { status: 404 });
        }
        const body = ["GET", "HEAD"].includes(request.method)
          ? undefined
          : await request.arrayBuffer();
        const call = heldCall(url.pathname, body);
        if (call === undefined) {
          return await relayMcp(request, body, hubUrl());
        }
        if (fenced()) {
          return notStarted(body);
        }
        const release = holdRestart(
          "tool-call",
          `${call}#${crypto.randomUUID().slice(0, 8)}`
        );
        try {
          return holdingUntilEnd(
            await relayMcp(request, body, hubUrl()),
            release
          );
        } catch (error) {
          release();
          throw error;
        }
      },
    });
    console.info(`[gateway] MCP gateway serving on 127.0.0.1:${port}`);
    return server;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      // Whoever it is, by name: on 2026-10-08 it was a leaf's network namespace
      // forwarding the port, not an agent, and saying "another agent" sent the
      // diagnosis the wrong way for an hour and a half.
      throw new Error(
        `MCP gateway port 127.0.0.1:${port} is held by ${await portHolder(port)}.`,
        { cause: error }
      );
    }
    throw error;
  }
};
