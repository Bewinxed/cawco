/**
 * An MCP server behind OAuth, as a scratch fleet's hub signs in to one
 * (hub fleet-mcp.ts, on @modelcontextprotocol/sdk's client auth): one
 * origin that is the resource and its authorization server alike.
 *
 *  - `POST /mcp` without a token answers 401 naming its resource metadata
 *    (`WWW-Authenticate: Bearer resource_metadata=…`), which is how the hub
 *    learns the server wants OAuth; with one, it answers `initialize` and
 *    lists no tools.
 *  - `GET /.well-known/oauth-protected-resource/mcp`: the resource, and this
 *    origin as its authorization server.
 *  - `GET /.well-known/oauth-authorization-server`: authorize, token and
 *    registration endpoints, PKCE by S256.
 *  - `POST /register`: Dynamic Client Registration, the client given an id.
 *  - `POST /token`: an authorization code's exchange; every code is good,
 *    since the sign-in is the scene's own ({@link signIn}).
 *  - `POST /feed`: an open MCP server of its own, a service connection's
 *    (hub connections.ts), listing one tool, `post_update`.
 *
 * The hub never sends a person to `/authorize` here: the scene takes the
 * state the hub put in its authorization URL and completes the sign-in as
 * the dashboard's return page does (`/api/fleet/mcp/oauth/complete`).
 */

export interface McpOauthMock {
  /** The open MCP server's URL, the one a service connection names (`post_update`, no sign-in). */
  feedUrl: string;
  stop: () => void;
  /** The MCP server's URL, the one a fleet MCP server row names. */
  url: string;
}

const JSON_TYPE = { "content-type": "application/json" };

/** The MCP server's own path, and where its resource metadata is (RFC 9728, under the resource's path). */
const MCP_PATH = "/mcp";
const RESOURCE_METADATA = `/.well-known/oauth-protected-resource${MCP_PATH}`;

/** The open MCP server's path: a service connection's (hub connections.ts), its one tool. */
const FEED_PATH = "/feed";
const FEED_TOOL = {
  name: "post_update",
  description: "Post an update to the tray's feed.",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
};

/** One JSON-RPC call answered as an MCP server named `server` with `tools`: `initialize`, the tool list, a call's text. */
async function answer(
  request: Request,
  server: string,
  tools: object[]
): Promise<Response> {
  const call = (await request.json()) as { id?: number; method: string };
  if (call.id === undefined) {
    return new Response(null, { status: 202 });
  }
  const results: Record<string, object> = {
    initialize: {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: server, version: "1" },
    },
    "tools/call": { content: [{ type: "text", text: "Posted." }] },
  };
  return Response.json({
    jsonrpc: "2.0",
    id: call.id,
    result: results[call.method] ?? { tools },
  });
}

/** The MCP endpoint: 401 naming the resource metadata without a token; `initialize` and an empty tool list with one. */
function mcp(request: Request, origin: string): Promise<Response> | Response {
  if (!request.headers.get("authorization")) {
    return new Response(null, {
      status: 401,
      headers: {
        "www-authenticate": `Bearer resource_metadata="${origin}${RESOURCE_METADATA}"`,
      },
    });
  }
  return answer(request, "tray-docs", []);
}

/** Each route by method and path: what it answers. */
const ROUTES: Record<
  string,
  (request: Request, origin: string) => Response | Promise<Response>
> = {
  [`POST ${MCP_PATH}`]: mcp,
  [`POST ${FEED_PATH}`]: (request) => answer(request, "tray-feed", [FEED_TOOL]),
  [`GET ${RESOURCE_METADATA}`]: (_, origin) =>
    Response.json({
      resource: `${origin}${MCP_PATH}`,
      authorization_servers: [origin],
      scopes_supported: ["docs.read"],
    }),
  "GET /.well-known/oauth-authorization-server": (_, origin) =>
    Response.json({
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    }),
  "POST /register": async (request) =>
    new Response(
      JSON.stringify({
        ...((await request.json()) as Record<string, unknown>),
        client_id: "tray-docs-client",
        client_id_issued_at: Math.floor(Date.now() / 1000),
      }),
      { status: 201, headers: JSON_TYPE }
    ),
  "POST /token": () =>
    Response.json({
      access_token: "tray-docs-access",
      token_type: "Bearer",
      expires_in: 365 * 24 * 60 * 60,
      refresh_token: "tray-docs-refresh",
      scope: "docs.read",
    }),
};

export function mcpOauthMock(): McpOauthMock {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const { origin, pathname } = new URL(request.url);
      const route = ROUTES[`${request.method} ${pathname}`];
      return route
        ? route(request, origin)
        : new Response("not found", { status: 404 });
    },
  });
  return {
    feedUrl: `http://127.0.0.1:${server.port}${FEED_PATH}`,
    url: `http://127.0.0.1:${server.port}${MCP_PATH}`,
    stop: () => server.stop(true),
  };
}

/**
 * Signs the hub in to its fleet MCP server `name` (its row naming
 * {@link mcpOauthMock}'s url): sign-in started as Configure's Sign in
 * starts it, then completed with the state the hub's authorization URL
 * carries, as the dashboard's return page completes it.
 */
export async function signIn(base: string, name: string): Promise<void> {
  const post = async (path: string, body?: object) => {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: JSON_TYPE,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`POST ${path}: ${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<{ authorizationUrl?: string }>;
  };
  const { authorizationUrl } = await post(
    `/api/fleet/mcp/${encodeURIComponent(name)}/sign-in`
  );
  const state = authorizationUrl
    ? new URL(authorizationUrl).searchParams.get("state")
    : null;
  if (!state) {
    throw new Error(`the hub's sign-in for ${name} named no state: ${authorizationUrl}`);
  }
  await post("/api/fleet/mcp/oauth/complete", { code: "tray-docs-code", state });
}
