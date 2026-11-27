import {
  AGENT_RESTARTING,
  RESUMABLE_CAWCO_TOOLS,
  TOOL_CALL_KEY_HEADER,
} from "@cawco/core/binary-updates";
import { portHolder } from "@cawco/core/live-processes";
import { watchFromItsOwnThread } from "@cawco/core/loop-watch";
import { mcpGatewayPort } from "@cawco/core/ports";
import { HOP_BY_HOP_HEADERS } from "@cawco/core/preview/hop-headers";
import { shortId } from "@cawco/core/short-id";
import { mcpGateWords } from "@cawco/core/words/mcp-gate";
import { Effect, Layer } from "effect";
import type { BrowserPorts } from "./browser/browsers";
import { DaemonLinks } from "./daemon-links";
import { harnessMcpUrl } from "./delegation";
import { HUB_AWAY_BOUND_MS, throughHubAway } from "./hub-away";
import { PROOF_HEADER, proofHeaders } from "./hub-proof";
import { fieldOf } from "./json-field";
import { GATE_PATH, GATE_TOKEN_HEADER } from "./mcp-gate";
import { type GateTarget, HOSTED_PATH, mcpHost, serve } from "./mcp-host";
import { freshen as freshenAccount } from "./provider-accounts";
import { fromPromise } from "./rejected";
import {
  fenced,
  holdRestart,
  lowerFence,
  raiseFence,
  renewFence,
  restartReadiness,
  type SupervisorHolds,
} from "./restart";

/** The fence `cawco service restart agent` holds on this agent ({@link restartRoute}). */
const RESTART_FENCE = "service-restart";

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
  first: Response,
  firstBody: ReadableStream<Uint8Array>,
  again: () => Promise<Response | { away: string }>,
  stopped: AbortSignal,
  what: string
): ReadableStream<Uint8Array> {
  const kind = first.headers.get("content-type");
  let reader = firstBody.getReader();
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
  const outgoing = answerHeaders(response);
  return new Response(
    keyed && response.body
      ? throughDrops(
          response,
          response.body,
          () => throughHubAway(tryOnce, request.signal),
          request.signal,
          `${request.method} ${incoming.pathname}`
        )
      : response.body,
    { status: response.status, headers: outgoing }
  );
}

/** An answer's headers as the gateway hands them on: fetch hands the body on decoded, so its encoding and length go, with the connection's own headers. */
const answerHeaders = (response: Response): Headers => {
  const outgoing = new Headers(response.headers);
  for (const name of [
    "Content-Encoding",
    "Content-Length",
    ...HOP_BY_HOP_HEADERS,
  ]) {
    outgoing.delete(name);
  }
  return outgoing;
};

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
    (one) => fieldOf(one, "method") === "tools/call"
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
  const name = fieldOf(parsed(body), "name");
  if (typeof name !== "string") {
    return "unnamed";
  }
  return RESUMABLE_CAWCO_TOOLS.has(name) ? undefined : name;
}

/** The first `tools/call` in a JSON-RPC message (or batch) that holds, by its tool's name. */
function heldMcpCall(pathname: string, message: unknown): string | undefined {
  const cawco = pathname === "/mcp/cawco";
  for (const one of Array.isArray(message) ? message : [message]) {
    const called = fieldOf(fieldOf(one, "params"), "name");
    const name = typeof called === "string" ? called : "unnamed";
    if (fieldOf(one, "method") !== "tools/call") {
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
  const id = fieldOf(message, "id");
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
 * would cut, and holds its own fence for the moment between its last look
 * and the restart: `raise` puts it up, `renew` raises it again on each of
 * the verb's beats (only while it still stands, so a beat that reaches the
 * agent that restarted puts up nothing), `lower` takes it down. Unrenewed,
 * it falls one quiet spell after its last raise (restart.ts). Never from a
 * page: a browser sends `Origin`.
 */
async function restartRoute(
  request: Request,
  supervisorHolds: SupervisorHolds
): Promise<Response> {
  if (request.headers.has("Origin")) {
    return new Response("Not from a browser.", { status: 403 });
  }
  if (request.method === "POST") {
    const fence = fieldOf(await request.json().catch(() => undefined), "fence");
    if (fence === "raise") {
      raiseFence(RESTART_FENCE);
    } else if (fence === "renew") {
      renewFence(RESTART_FENCE);
    } else {
      lowerFence(RESTART_FENCE);
    }
  }
  return Response.json({
    ...restartReadiness(supervisorHolds),
    fenced: fenced(),
  });
}

/** One stable loopback endpoint every harness reaches the hub's tools through. */
/**
 * `POST /accounts/<id>/fresh`: a pi session found the account's sign-in near
 * its expiry and asks the agent, its only writer, to refresh it. Answers once
 * it has, with nothing secret: the asker reads the store again.
 */
const ACCOUNT_FRESH_PATH = /^\/accounts\/([^/]+)\/fresh$/u;

const freshRoute = async (
  accountId: string,
  freshen: Gateway["freshen"]
): Promise<Response> => {
  try {
    await freshen(decodeURIComponent(accountId));
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
  request: Request,
  freshen: Gateway["freshen"]
): Promise<Response> | undefined => {
  if (request.method !== "POST") {
    return undefined;
  }
  const fresh = url.pathname.match(ACCOUNT_FRESH_PATH);
  return fresh?.[1] ? freshRoute(fresh[1], freshen) : undefined;
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
    `${call}#${shortId(crypto.randomUUID())}`
  );
  try {
    return holdingUntilEnd(await answer(forward), release);
  } catch (error) {
    release();
    throw error;
  }
}

/** The headers a gate's relayed request goes on with: the caller's own, less its gate token and the connection's, with the server's over them. */
const relayedHeaders = (
  request: Request,
  own: Readonly<Record<string, string>>
): Headers => {
  const headers = new Headers(request.headers);
  for (const name of [
    "Host",
    "Content-Length",
    "Accept-Encoding",
    "Authorization",
    GATE_TOKEN_HEADER,
    ...HOP_BY_HOP_HEADERS,
  ]) {
    headers.delete(name);
  }
  for (const [name, value] of Object.entries(own)) {
    headers.set(name, value);
  }
  return headers;
};

type Remote = Extract<GateTarget, { remote: unknown }>["remote"];

/** The query key a gate's SSE endpoint carries the server's own endpoint under. */
const SSE_ENDPOINT = "endpoint";

/**
 * Where a gate's request to `remote` goes: the server's URL; for an SSE
 * server's post, the endpoint its stream named ({@link endpointsOnGate}),
 * on the server's own origin alone, so the server's key goes nowhere else.
 * None for a post to an SSE server that names no endpoint, which is a
 * streamable HTTP client's first try: refused 405, it opens the stream
 * (https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#backwards-compatibility).
 */
const upstreamOf = (request: Request, remote: Remote): URL | Response => {
  const server = new URL(remote.url);
  if (!remote.sse || request.method === "GET") {
    return server;
  }
  const named = new URL(request.url).searchParams.get(SSE_ENDPOINT);
  if (named === null) {
    return new Response(null, { status: 405, headers: { Allow: "GET" } });
  }
  const endpoint = new URL(named, server);
  return endpoint.origin === server.origin
    ? endpoint
    : new Response(mcpGateWords.sseOffOrigin, {
        status: 400,
      });
};

/**
 * An SSE server's stream with each `endpoint` event moved onto the gate
 * (`<gate path>?endpoint=<the server's endpoint>`), so the harness posts to
 * the gate, which adds the server's headers ({@link upstreamOf}). Every
 * other line passes as it came.
 */
const endpointsOnGate = (
  body: ReadableStream<Uint8Array>,
  server: URL,
  gatePath: string
): ReadableStream<Uint8Array> => {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let held = "";
  let event = "message";
  const moved = (line: string): string => {
    if (line === "") {
      event = "message";
    } else if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (event === "endpoint" && line.startsWith("data:")) {
      const named = new URL(line.slice("data:".length).trim(), server);
      return `data: ${gatePath}?${SSE_ENDPOINT}=${encodeURIComponent(named.href)}`;
    }
    return line;
  };
  /** Lines as they go on, each with its ending (`\n`, its `\r` kept), the last with none when `ended` is false. */
  const passed = (lines: string[], ended: boolean): Uint8Array =>
    encoder.encode(
      lines
        .map((line, at) => {
          const out = line.endsWith("\r")
            ? `${moved(line.slice(0, -1))}\r`
            : moved(line);
          return ended || at < lines.length - 1 ? `${out}\n` : out;
        })
        .join("")
    );
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const lines = (held + decoder.decode(chunk, { stream: true })).split(
          "\n"
        );
        held = lines.pop() ?? "";
        if (lines.length > 0) {
          controller.enqueue(passed(lines, true));
        }
      },
      flush(controller) {
        held += decoder.decode();
        if (held) {
          controller.enqueue(passed([held], false));
        }
      },
    })
  );
};

/**
 * A gate's request to a remote server, sent on with the server's own
 * headers, its answer streamed back as it comes: an SSE server's stream
 * with its endpoint on the gate. A redirect is refused: followed, it would
 * carry the server's key to wherever it points.
 */
async function passOn(
  name: string,
  request: Request,
  remote: Remote
): Promise<Response> {
  const upstream = upstreamOf(request, remote);
  if (upstream instanceof Response) {
    return upstream;
  }
  let response: Response;
  try {
    response = await fetch(upstream, {
      method: request.method,
      headers: relayedHeaders(request, remote.headers),
      body: await bodyOf(request),
      signal: request.signal,
      redirect: "error",
      timeout: false,
    });
  } catch (error) {
    return new Response(
      mcpGateWords.unreachable(
        decodeURIComponent(name),
        error instanceof Error ? error.message : String(error)
      ),
      { status: 502 }
    );
  }
  const sseStream =
    remote.sse &&
    request.method === "GET" &&
    response.ok &&
    response.body !== null;
  return new Response(
    sseStream && response.body
      ? endpointsOnGate(response.body, upstream, new URL(request.url).pathname)
      : response.body,
    { status: response.status, headers: answerHeaders(response) }
  );
}

/** A request's body, read whole; none for a read. */
const bodyOf = async (request: Request): Promise<ArrayBuffer | undefined> =>
  ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.arrayBuffer();

/** Whether `url` is this gateway's own: CawCo's server, a shared one's or a signed-in one's route. */
const onGateway = (url: string): boolean =>
  new URL(url).origin === new URL(harnessMcpUrl("")).origin;

/**
 * A session gate's request (mcp-gate.ts), from loopback only and never from
 * a page. A server with a command is answered by its process here; a route
 * of this gateway's own (CawCo's server, a shared server, a signed-in one)
 * is answered by that route, which holds a restart as its calls need; any
 * other remote server, SSE ones too, is relayed, a tool call on it holding
 * a restart as a call on any fleet server does.
 */
async function gateRoute(
  gateId: string,
  name: string,
  request: Request,
  ports: BrowserPorts,
  route: (request: Request) => Promise<Response>
): Promise<Response> {
  const incoming = new URL(request.url);
  if (incoming.hostname !== "127.0.0.1" || request.headers.has("Origin")) {
    return new Response(mcpGateWords.harnessOnly, {
      status: 403,
    });
  }
  const target = await mcpHost.gateTarget(ports, gateId, name, request);
  if ("refused" in target) {
    return target.refused;
  }
  if ("hosted" in target) {
    return hostedRoute(name, request, (forward) =>
      serve(target.hosted, forward)
    );
  }
  const { remote } = target;
  if (remote.sse || !onGateway(remote.url)) {
    return hostedRoute(name, request, (forward) =>
      passOn(name, forward, remote)
    );
  }
  return route(
    new Request(remote.url, {
      method: request.method,
      headers: relayedHeaders(request, remote.headers),
      body: await bodyOf(request),
      signal: request.signal,
    })
  );
}

/** A hosted server's request, a shared one's or a session gate's; none for any other path. */
const hostedRoutes = (
  url: URL,
  request: Request,
  ports: BrowserPorts,
  route: (request: Request) => Promise<Response>
): Promise<Response> | undefined => {
  const shared = url.pathname.match(HOSTED_PATH)?.[1];
  if (shared) {
    return hostedRoute(shared, request, (forward) =>
      mcpHost.fetch(shared, forward)
    );
  }
  const [, gate, gated] = url.pathname.match(GATE_PATH) ?? [];
  return gate && gated
    ? gateRoute(gate, gated, request, ports, route)
    : undefined;
};

/** What the gateway answers with that is not its own: the agent's refresh of a provider account's sign-in, and what its supervisor holds a restart for. */
interface Gateway {
  /** What a workspace's browser door tells the hub through when it makes a browser's record (browser/door.ts). */
  readonly browsers: BrowserPorts;
  readonly freshen: (accountId: string) => Promise<void>;
  readonly supervisorHolds: SupervisorHolds;
}

const startMcpGateway = async (hubUrl: () => string, gateway: Gateway) => {
  // Shared servers an agent before this one left running are ended first,
  // and the set it served is served from now, before the first sync.
  await mcpHost.sweep();
  mcpHost.restore();
  // The one setting every session's config names too: a different port on a
  // live machine leaves its running sessions dialling the old one.
  const port = mcpGatewayPort();
  try {
    /** One request on the gateway; a gate's relay to the gateway's own routes comes back through it. */
    const route = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      if (url.pathname === "/restart" || url.pathname === "/restart/fence") {
        return await restartRoute(request, gateway.supervisorHolds);
      }
      const accounts = accountRoute(url, request, gateway.freshen);
      if (accounts) {
        return await accounts;
      }
      const hosted = hostedRoutes(url, request, gateway.browsers, route);
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
        `${call}#${shortId(crypto.randomUUID())}`
      );
      try {
        return holdingUntilEnd(await relayMcp(request, body, hubUrl), release);
      } catch (error) {
        release();
        throw error;
      }
    };
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      idleTimeout: 0,
      fetch: route,
    });
    console.info(`[gateway] MCP gateway serving on 127.0.0.1:${port}`);
    return server;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "EADDRINUSE"
    ) {
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

/**
 * The MCP gateway, served from when the agent's layer is built (agent-layer.ts)
 * until its scope closes, which stops it last of the agent's services. Then
 * the loop's watch from its own thread starts: its echo's kernel-picked port
 * could otherwise be the gateway's (core loop-watch.ts).
 */
export const McpGatewayLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const { hubNow, ports, supervising } = yield* DaemonLinks;
    yield* Effect.acquireRelease(
      fromPromise(() =>
        startMcpGateway(hubNow, {
          freshen: (accountId) => freshenAccount(accountId, ports),
          supervisorHolds: () => supervising.current?.restartHolds(),
          browsers: ports,
        })
      ),
      (listener) => Effect.sync(() => listener.stop(true))
    );
    watchFromItsOwnThread();
  })
);
