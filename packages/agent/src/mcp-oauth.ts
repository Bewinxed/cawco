import { CAWCO_MCP_CALLBACK_PORT } from "@cawco/core";

const MCP_RELAY_PATH = /^\/mcp\/(?:cawco|fleet\/[^/]+)$/;
const TOOL_READ_PATH =
  /^\/api\/(?:instances|delegation\/tools|workflow-runs\/[^/]+\/state\/[^/]+)$/;
const TOOL_WRITE_PATH =
  /^\/api\/(?:delegation\/call\/[^/]+|workflow-steps\/[^/]+\/result|workflow-runs\/[^/]+\/state\/[^/]+)$/;

/** Relay only MCP and the generated tools' exact API routes; never arbitrary hub paths. */
async function relayMcp(request: Request, hubUrl: string): Promise<Response> {
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
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
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

/** One stable loopback endpoint for every harness and the browser's OAuth callback. */
export const startMcpGateway = (hubUrl: () => string) => {
  try {
    return Bun.serve({
      hostname: "127.0.0.1",
      port: Number(
        process.env.CAWCO_MCP_CALLBACK_PORT ?? CAWCO_MCP_CALLBACK_PORT
      ),
      idleTimeout: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (
          MCP_RELAY_PATH.test(url.pathname) ||
          (request.method === "GET" && TOOL_READ_PATH.test(url.pathname)) ||
          (request.method === "POST" && TOOL_WRITE_PATH.test(url.pathname))
        ) {
          return await relayMcp(request, hubUrl());
        }
        return new Response("Not found.", { status: 404 });
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      throw new Error(
        `MCP gateway port ${CAWCO_MCP_CALLBACK_PORT} is already held by another agent.`,
        { cause: error }
      );
    }
    throw error;
  }
};
