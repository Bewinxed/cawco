/**
 * The hub's /mcp/fleet relay (packages/hub/src/fleet-mcp-relay.ts) and the
 * MCP methods newer clients send: Claude Code 2.1.302 opens each connection
 * with `server/discover` and carries `subscriptions/listen`. A client that
 * hears -32601 for `server/discover` falls back to `initialize`, so the relay
 * must answer -32601 and never hang or 500.
 *
 * The real relay, in process, against a stand-in upstream on loopback that
 * speaks the `initialize` protocol and refuses every other method with
 * -32601: as a JSON body, or on the event stream it opens (the MCP SDK's
 * default answer). No fleet, no sign-in: the relay is handed the upstream as
 * `FleetMcp.forward` hands it the signed-in one.
 *
 * (a) `server/discover` before any session: -32601, answered by the hub
 *     itself, so no upstream session opens for a probe.
 * (b) `initialize` then works: a result and a session of the hub's.
 * (c) `subscriptions/listen` on that session: the upstream's -32601 reaches
 *     the client as -32601 (on its event stream), status 200.
 * (d) A method the upstream refuses in a JSON body: -32601, status 200.
 * (e) The listing still answers after the refusals.
 *
 *   bun scripts/probe-kit/run.ts fleet-mcp-methods
 */
import { FleetMcpRelay } from "../../../packages/hub/src/fleet-mcp-relay";
import type { Spec } from "../kit";

/** No answer in this long reads as a hang. */
const HANG_MS = 10_000;
const NAME = "probe-methods";

/** The JSON-RPC message in a body: a JSON one, or the first data event of a stream. */
const messageOf = (text: string): Record<string, unknown> | undefined => {
  const data = text
    .split("\n")
    .find((line) => line.startsWith("data:"))
    ?.slice(5);
  try {
    return JSON.parse(data ?? text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

const spec: Spec = {
  name: "fleet-mcp-methods",
  run: async (kit) => {
    /** Every method the stand-in was sent, in order. */
    const seen: string[] = [];
    let sessions = 0;
    const upstreamServer = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: async (request) => {
        if (request.method !== "POST") {
          return new Response(null, { status: 405 });
        }
        const message = (await request.json()) as {
          id?: number | string;
          method: string;
        };
        seen.push(message.method);
        if (message.id === undefined) {
          return new Response(null, { status: 202 });
        }
        if (message.method === "initialize") {
          sessions += 1;
          return Response.json(
            {
              jsonrpc: "2.0",
              id: message.id,
              result: {
                protocolVersion: "2025-06-18",
                capabilities: { tools: {} },
                serverInfo: { name: "stand-in", version: "1" },
              },
            },
            { headers: { "Mcp-Session-Id": `upstream-${sessions}` } }
          );
        }
        if (message.method === "tools/list") {
          return Response.json({
            jsonrpc: "2.0",
            id: message.id,
            result: { tools: [{ name: "probe_echo", inputSchema: {} }] },
          });
        }
        const refusal = {
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32_601,
            message: `Method not found: ${message.method}`,
          },
        };
        // `subscriptions/listen` is refused on an event stream, as the SDK's
        // server answers by default; anything else in a JSON body.
        return message.method === "subscriptions/listen"
          ? new Response(
              `event: message\ndata: ${JSON.stringify(refusal)}\n\n`,
              { headers: { "Content-Type": "text/event-stream" } }
            )
          : Response.json(refusal);
      },
    });
    const url = `http://127.0.0.1:${upstreamServer.port}/mcp`;
    const kept = new Map<string, Record<string, unknown>>();
    const relay = new FleetMcpRelay({
      delete: (id) => kept.delete(id),
      get: (id) => kept.get(id),
      prune: () => 0,
      put: (id, _server, init) => kept.set(id, init),
      touch: () => undefined,
    });
    const upstream = (exchange: {
      body?: ArrayBuffer | string;
      headers: Headers;
      method: string;
      search?: string;
      signal?: AbortSignal;
    }) =>
      fetch(`${url}${exchange.search ?? ""}`, {
        method: exchange.method,
        headers: exchange.headers,
        body: exchange.body,
        signal: exchange.signal,
      });

    /** One client request through the relay, timed out as a hang. */
    const ask = async (
      body: Record<string, unknown>,
      session?: string
    ): Promise<{
      status: number | "hung";
      message?: Record<string, unknown>;
      session: string | null;
      type: string | null;
    }> => {
      const headers = new Headers({
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      });
      if (session) {
        headers.set("Mcp-Session-Id", session);
      }
      const request = new Request(`http://hub/mcp/fleet/${NAME}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", ...body }),
      });
      const answered = relay
        .handle(NAME, "generation-1", request, upstream)
        .then(async (response) => ({
          status: response.status,
          message: messageOf(await response.text()),
          session: response.headers.get("Mcp-Session-Id"),
          type: response.headers.get("Content-Type"),
        }));
      const hung = Bun.sleep(HANG_MS).then(() => ({
        status: "hung" as const,
        session: null,
        type: null,
      }));
      return await Promise.race([answered, hung]);
    };
    const code = (answer: { message?: Record<string, unknown> }) =>
      (answer.message?.error as { code?: number } | undefined)?.code;

    try {
      const discover = await ask({ id: 1, method: "server/discover" });
      kit.check(
        "(a) server/discover before any session answers -32601, status 200, and opens nothing upstream",
        discover.status === 200 &&
          code(discover) === -32_601 &&
          !seen.includes("server/discover"),
        `status ${discover.status}; ${JSON.stringify(discover.message)}; upstream saw [${seen.join(", ")}]`
      );

      const init = await ask({
        id: 2,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "probe", version: "1" },
        },
      });
      const result = init.message?.result as
        { protocolVersion?: string } | undefined;
      kit.check(
        "(b) initialize then answers a result and a session of the hub's",
        init.status === 200 &&
          result?.protocolVersion === "2025-06-18" &&
          typeof init.session === "string",
        `status ${init.status}; session ${init.session}; ${JSON.stringify(init.message)}`
      );
      const session = init.session ?? undefined;
      const told = await ask({ method: "notifications/initialized" }, session);
      kit.check(
        "(b) notifications/initialized is taken (202)",
        told.status === 202,
        `status ${told.status}`
      );

      const listen = await ask(
        { id: 3, method: "subscriptions/listen", params: {} },
        session
      );
      kit.check(
        "(c) subscriptions/listen: the upstream's -32601 reaches the client as -32601, status 200, on its event stream",
        listen.status === 200 &&
          code(listen) === -32_601 &&
          listen.message?.id === 3 &&
          (listen.type ?? "").includes("text/event-stream") &&
          seen.includes("subscriptions/listen"),
        `status ${listen.status}; ${listen.type}; ${JSON.stringify(listen.message)}`
      );

      const other = await ask({ id: 4, method: "zz/unknown" }, session);
      kit.check(
        "(d) a method the upstream refuses in a JSON body: -32601, status 200",
        other.status === 200 &&
          code(other) === -32_601 &&
          other.message?.id === 4,
        `status ${other.status}; ${JSON.stringify(other.message)}`
      );

      const listed = await ask({ id: 5, method: "tools/list" }, session);
      const tools = (
        listed.message?.result as { tools?: { name: string }[] } | undefined
      )?.tools;
      kit.check(
        "(e) tools/list still answers after the refusals",
        listed.status === 200 && tools?.[0]?.name === "probe_echo",
        `status ${listed.status}; ${JSON.stringify(listed.message)}`
      );
      kit.note(`the stand-in was sent: ${seen.join(", ")}`);
    } finally {
      upstreamServer.stop(true);
    }
  },
};

export default spec;
