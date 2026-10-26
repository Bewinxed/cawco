import { mcpGatewayPort } from "@cawco/core";
import {
  AGENT_RESTARTING,
  RESUMABLE_CAWCO_TOOLS,
  TOOL_CALL_KEY_HEADER,
} from "@cawco/core/binary-updates";
import { portHolder } from "@cawco/core/live-processes";
import { HUB_AWAY_BOUND_MS, throughHubAway } from "./hub-away";
import { PROOF_HEADER, proofHeaders } from "./hub-proof";
import { GATE_PATH } from "./mcp-gate";
import { HOSTED_PATH, mcpHost } from "./mcp-host";
import {
  fenced,
  holdRestart,
  lowerFence,
  raiseFence,
  restartReadiness,
} from "./restart";

const MCP_RELAY_PATH = /^\/mcp\/(?:cawco|fleet\/[^/]+)$/u;
const TOOL_READ_PATH = /^\/api\/(?:instances|delegation\/tools)$/u;
const TOOL_WRITE_PATH = /^\/api\/delegation\/call\/[^/]+$/u;

/** A shared fleet server's route on the hub, whose 502, 503 and 504 are the hub's own answers about that server. */
const FLEET_PATH = /^\/mcp\/fleet\//u;

/**
 * A keyed call's answer, carried through its link dropping partway: the
 * call goes again under its key, the hub answers it again from its first
 * byte without running it again (hub tool-call-keys.ts), and the bytes
 * already passed on are skipped, so the caller reads one answer whole. A
 * caller that went away is not resent for.
 */
function throughDrops(
  first: Response & { body: ReadableStream<Uint8Array> },
  again: () => Promise<Response | { away: string }>,
  stopped: AbortSignal,
  what: string
): ReadableStream<Uint8Array> {
  const kind = first.headers.get("content-type");
  let reader = first.body.getReader();
  let passed = 0;
  let skip = 0;
  /**
   * The call sent again after its answer broke off with `broke`: the
   * reader of the hub's answer from its first byte, or undefined when that
   * answer has no body.
   */
  const fromTheTop = async (broke: unknown) => {
    console.warn(
      `[gateway] ${what}: its answer broke off after ${passed} bytes (${broke instanceof Error ? broke.message : String(broke)}); sent again under its key`
    );
    const answer = await again();
    if ("away" in answer) {
      throw new Error(
        `The CawCo hub could not be reached within ${HUB_AWAY_BOUND_MS / 1000} s to finish this answer (last: ${answer.away}).`,
        { cause: broke }
      );
    }
    // Another answer than the first (a hub that restarted while it ran says
    // so in its own shape): no part of it follows the first.
    if (answer.headers.get("content-type") !== kind) {
      throw new Error(await answer.text(), { cause: broke });
    }
    skip = passed;
    return answer.body?.getReader();
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        let next: Awaited<ReturnType<typeof reader.read>>;
        try {
          // biome-ignore lint/performance/noAwaitInLoops: one read at a time, past the bytes already passed on.
          next = await reader.read();
        } catch (error) {
          if (stopped.aborted) {
            throw error;
          }
          const resumed = await fromTheTop(error);
          if (!resumed) {
            controller.close();
            return;
          }
          reader = resumed;
          continue;
        }
        if (next.done) {
          controller.close();
          return;
        }
        const cut = Math.min(skip, next.value.byteLength);
        skip -= cut;
        if (cut < next.value.byteLength) {
          const chunk = next.value.subarray(cut);
          passed += chunk.byteLength;
          controller.enqueue(chunk);
          return;
        }
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
}

/**
 * Relay only MCP and the generated tools' exact API routes; never arbitrary
 * hub paths. A request to the hub's own tools waits through the hub being
 * away (hub-away.ts {@link throughHubAway}): the hub answers none of them
 * 502, 503 or 504 itself, so such an answer, or none, means the request
 * never reached it, and it goes again. A tool call goes under one key, the
 * same every time it goes ({@link TOOL_CALL_KEY_HEADER}), so the hub answers
 * one it already took with its first answer and never runs it twice, and
 * an answer that breaks off partway is had again the same way
 * ({@link throughDrops}). A fleet server's route does not wait: there the
 * hub says 502 to 504 about the server (fleet-mcp.ts `forward`).
 */
async function relayMcp(
  request: Request,
  body: ArrayBuffer | undefined,
  hubUrl: () => string
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
  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.delete("Connection");
  headers.delete("Content-Length");
  // This machine vouches for what its loopback gateway relays: its key's
  // proof rides each call (hub hub-auth.ts `tool` routes), and a caller's
  // own copy of the header never passes.
  headers.delete(PROOF_HEADER);
  headers.delete(TOOL_CALL_KEY_HEADER);
  const keyed = toolCall(incoming.pathname, request.method, body);
  if (keyed) {
    headers.set(TOOL_CALL_KEY_HEADER, crypto.randomUUID());
  }
  const tryOnce = async (): Promise<Response> => {
    const hub = new URL(hubUrl());
    hub.protocol = hub.protocol === "wss:" ? "https:" : "http:";
    hub.pathname = incoming.pathname;
    hub.search = incoming.search;
    const proof = await proofHeaders(request.method, hub.toString());
    for (const [name, value] of Object.entries(proof)) {
      headers.set(name, value);
    }
    return fetch(hub, {
      method: request.method,
      headers,
      body,
      signal: request.signal,
      redirect: "error",
      timeout: false,
    });
  };
  let response: Response;
  if (FLEET_PATH.test(incoming.pathname)) {
    try {
      response = await tryOnce();
    } catch {
      return new Response("The CawCo hub could not be reached.", {
        status: 502,
      });
    }
  } else {
    const answer = await throughHubAway(tryOnce, request.signal);
    if ("away" in answer) {
      return new Response(
        `The CawCo hub could not be reached within ${HUB_AWAY_BOUND_MS / 1000} s (last: ${answer.away}).`,
        { status: 502 }
      );
    }
    response = answer;
  }
  const outgoing = new Headers(response.headers);
  for (const name of [
    "Content-Encoding",
    "Content-Length",
    "Connection",
    "Transfer-Encoding",
  ]) {
    outgoing.delete(name);
  }
  return new Response(
    keyed && response.body
      ? throughDrops(
          response as Response & { body: ReadableStream<Uint8Array> },
          () => throughHubAway(tryOnce, request.signal),
          request.signal,
          `${request.method} ${incoming.pathname}`
        )
      : response.body,
    { status: response.status, headers: outgoing }
  );
}

const parsed = (body: ArrayBuffer): unknown => {
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return undefined;
  }
};

/**
 * Whether a relayed request is a tool call, to be run once however often it
 * goes: a POST to a tool write route, or an MCP POST holding a `tools/call`.
 */
function toolCall(
  pathname: string,
  method: string,
  body: ArrayBuffer | undefined
): boolean {
  if (!(method === "POST" && body)) {
    return false;
  }
  if (TOOL_WRITE_PATH.test(pathname)) {
    return true;
  }
  if (pathname !== "/mcp/cawco") {
    return false;
  }
  const message = parsed(body);
  return (Array.isArray(message) ? message : [message]).some(
    (one) => (one as { method?: unknown } | null)?.method === "tools/call"
  );
}

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
      { method?: unknown; params?: { name?: unknown } } | undefined;
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
 * `POST /accounts/<id>/fresh`: a pi session found the account's sign-in near
 * its expiry and asks the agent, its only writer, to refresh it. Answers once
 * it has, with nothing secret: the asker reads the store again.
 */
const ACCOUNT_FRESH_PATH = /^\/accounts\/([^/]+)\/fresh$/u;

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

/** The account route the machine's harnesses call: a refresh. Undefined for any other path. */
const accountRoute = (
  url: URL,
  request: Request
): Promise<Response> | undefined => {
  if (request.method !== "POST") {
    return undefined;
  }
  const fresh = url.pathname.match(ACCOUNT_FRESH_PATH);
  return fresh?.[1] ? freshRoute(fresh[1]) : undefined;
};

/**
 * A hosted fleet server's request (mcp-host.ts), a shared one's or a
 * workspace gate's (`answer`), from loopback only and never from a page. A
 * tool call on it holds a restart as a call on any fleet server does: the
 * restart would end the process answering it.
 */
async function hostedRoute(
  name: string,
  request: Request,
  answer: (forward: Request) => Promise<Response>
): Promise<Response> {
  const incoming = new URL(request.url);
  if (incoming.hostname !== "127.0.0.1" || request.headers.has("Origin")) {
    return new Response("A hosted MCP server answers its harnesses only.", {
      status: 403,
    });
  }
  const body =
    request.method === "POST" ? await request.arrayBuffer() : undefined;
  const forward = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal,
  });
  const call = body
    ? heldMcpCall(`/mcp/fleet/${name}`, parsed(body))
    : undefined;
  if (call === undefined) {
    return answer(forward);
  }
  if (fenced()) {
    return notStarted(body);
  }
  const release = holdRestart(
    "tool-call",
    `${call}#${crypto.randomUUID().slice(0, 8)}`
  );
  try {
    return holdingUntilEnd(await answer(forward), release);
  } catch (error) {
    release();
    throw error;
  }
}

/** A hosted server's request, a shared one's or a workspace gate's; none for any other path. */
const hostedRoutes = (
  url: URL,
  request: Request
): Promise<Response> | undefined => {
  const shared = url.pathname.match(HOSTED_PATH)?.[1];
  if (shared) {
    return hostedRoute(shared, request, (forward) =>
      mcpHost.fetch(shared, forward)
    );
  }
  const [, gate, gated] = url.pathname.match(GATE_PATH) ?? [];
  return gate && gated
    ? hostedRoute(gated, request, (forward) =>
        mcpHost.fetchGate(gate, gated, forward)
      )
    : undefined;
};

export const startMcpGateway = async (hubUrl: () => string) => {
  // Shared servers an agent before this one left running are ended first,
  // and the set it served is served from now, before the first sync.
  await mcpHost.sweep();
  mcpHost.restore();
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
        const accounts = accountRoute(url, request);
        if (accounts) {
          return await accounts;
        }
        const hosted = hostedRoutes(url, request);
        if (hosted) {
          return await hosted;
        }
        if (!(
          MCP_RELAY_PATH.test(url.pathname) ||
          (request.method === "GET" && TOOL_READ_PATH.test(url.pathname)) ||
          (request.method === "POST" && TOOL_WRITE_PATH.test(url.pathname))
        )) {
          return new Response("Not found.", { status: 404 });
        }
        const body = ["GET", "HEAD"].includes(request.method)
          ? undefined
          : await request.arrayBuffer();
        const call = heldCall(url.pathname, body);
        if (call === undefined) {
          return await relayMcp(request, body, hubUrl);
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
            await relayMcp(request, body, hubUrl),
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
