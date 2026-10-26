/**
 * An MCP server behind OAuth, as a scratch fleet's hub signs in to one
 * (hub fleet-mcp.ts, on @modelcontextprotocol/sdk's client auth): one
 * origin that is the resource and its authorization server alike.
 *
 *  - `POST /mcp` without a token answers 401 naming its resource metadata
 *    (`WWW-Authenticate: Bearer resource_metadata=…`), which is how the hub
 *    learns the server wants OAuth; with one, it answers `initialize` and
 *    lists the tools it was made with (none unless asked).
 *  - `GET /.well-known/oauth-protected-resource/mcp`: the resource, and this
 *    origin as its authorization server.
 *  - `GET /.well-known/oauth-authorization-server`: authorize, token and
 *    registration endpoints, PKCE by S256.
 *  - `POST /register`: Dynamic Client Registration, the client given an id.
 *  - `GET /authorize`: the provider's consent page a person signs in on,
 *    "Allow" and "Deny" with the scope asked; Allow sends the browser on to
 *    the hub's redirect with a code, Deny with `access_denied`.
 *  - `POST /token`: an authorization code's exchange (every code is good,
 *    since the sign-in is the scene's own, {@link signIn}), with the scope
 *    its authorize asked for and, given an `identity`, an ID token naming
 *    it; a refresh, refused `invalid_grant` once {@link McpOauthMock.expire}
 *    ended what was issued.
 *  - `POST /feed`: an open MCP server of its own, a service connection's
 *    (hub connections.ts), listing one tool, `post_update`.
 *
 * A scene signs the hub in either as a person does, through `/authorize` in
 * a browser, or by taking the state the hub put in its authorization URL
 * and completing the sign-in as the dashboard's return page does
 * (`/api/fleet/mcp/oauth/complete`, {@link signIn}).
 */

export interface McpOauthMock {
  /** The scope each `/authorize` asked for, in order. */
  asked: string[];
  /**
   * Ends every sign-in issued so far, as a provider revoking it does: its
   * access tokens are refused (401) and its refresh tokens `invalid_grant`.
   */
  expire: () => void;
  /** The open MCP server's URL, the one a service connection names (`post_update`, no sign-in). */
  feedUrl: string;
  stop: () => void;
  /** The MCP server's URL, the one a fleet MCP server row names. */
  url: string;
}

/** How the mock signs in. */
export interface McpOauthOptions {
  /** As whom it signs the hub in: its ID token's email. None: no ID token. */
  identity?: string;
  /** The scopes its resource names (`scopes_supported`). */
  scopes?: string[];
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

/** An Authorization header's scheme, before its token. */
const BEARER = /^Bearer /iu;

/** What the mock has issued and ended. */
interface Issued {
  /** Each code `/authorize` handed out, and the scope it was asked with. */
  codes: Map<string, string>;
  /** Tokens {@link McpOauthMock.expire} ended. */
  ended: Set<string>;
  n: number;
  /** Tokens issued so far. */
  tokens: string[];
}

/** The MCP endpoint: 401 naming the resource metadata without a token, or with one ended; `initialize` and `tools` with one. */
const mcp =
  (tools: object[], issued: Issued) =>
  (request: Request, origin: string): Promise<Response> | Response => {
    const bearer = request.headers.get("authorization");
    if (!bearer || issued.ended.has(bearer.replace(BEARER, ""))) {
      return new Response(null, {
        status: 401,
        headers: {
          "www-authenticate": `Bearer resource_metadata="${origin}${RESOURCE_METADATA}"`,
        },
      });
    }
    return answer(request, "tray-docs", tools);
  };

/** The consent page a person signs in on: the scope asked, Allow and Deny. */
const consent = (url: URL, issued: Issued, asked: string[]): Response => {
  const redirect = url.searchParams.get("redirect_uri") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const scope = url.searchParams.get("scope") ?? "";
  if (url.searchParams.has("answer")) {
    const back = new URL(redirect);
    back.searchParams.set("state", state);
    if (url.searchParams.get("answer") === "allow") {
      issued.n += 1;
      const code = `tray-docs-code-${issued.n}`;
      issued.codes.set(code, scope);
      back.searchParams.set("code", code);
    } else {
      back.searchParams.set("error", "access_denied");
    }
    // Sent on by the page, not a 302: a probe browser's routes (oauth-hop.ts)
    // hear a navigation, never the redirect a response answers with.
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Returning</title><script>location.replace(${JSON.stringify(back.toString())});</script>`,
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  asked.push(scope);
  const hidden = [...url.searchParams]
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${key}" value="${value.replaceAll('"', "&quot;")}">`
    )
    .join("");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sign in to Tray Docs</title></head><body><main><h1>Sign in to Tray Docs</h1><p>CawCo fleet asks for <code>${scope || "no scope"}</code>.</p><form method="get" action="/authorize">${hidden}<button name="answer" value="allow">Allow</button> <button name="answer" value="deny">Deny</button></form></main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
};

/** An ID token naming `email`, unsigned: the hub reads its claims for the person's eyes alone. */
const idToken = (email: string): string =>
  [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url"
    ),
    Buffer.from(JSON.stringify({ sub: "probe", email })).toString("base64url"),
    "",
  ].join(".");

/** The token endpoint: a code's exchange, or a refresh refused once its sign-in ended. */
const token =
  (issued: Issued, options: McpOauthOptions) =>
  async (request: Request): Promise<Response> => {
    const form = new URLSearchParams(await request.text());
    if (form.get("grant_type") === "refresh_token") {
      const spent = form.get("refresh_token") ?? "";
      if (issued.ended.has(spent)) {
        return Response.json(
          {
            error: "invalid_grant",
            error_description: "The sign-in was revoked.",
          },
          { status: 400 }
        );
      }
    }
    issued.n += 1;
    const access = `tray-docs-access-${issued.n}`;
    const refresh = `tray-docs-refresh-${issued.n}`;
    issued.tokens.push(access, refresh);
    const code = form.get("code") ?? "";
    return Response.json({
      access_token: access,
      token_type: "Bearer",
      expires_in: 365 * 24 * 60 * 60,
      refresh_token: refresh,
      scope:
        issued.codes.get(code) ?? (options.scopes ?? ["docs.read"]).join(" "),
      ...(options.identity ? { id_token: idToken(options.identity) } : {}),
    });
  };

/** Each route by method and path, the MCP endpoint listing `tools`: what it answers. */
const routes = (
  tools: object[],
  issued: Issued,
  options: McpOauthOptions,
  asked: string[]
): Record<
  string,
  (request: Request, origin: string) => Response | Promise<Response>
> => ({
  [`POST ${MCP_PATH}`]: mcp(tools, issued),
  "GET /authorize": (request) => consent(new URL(request.url), issued, asked),
  [`POST ${FEED_PATH}`]: (request) => answer(request, "tray-feed", [FEED_TOOL]),
  [`GET ${RESOURCE_METADATA}`]: (_, origin) =>
    Response.json({
      resource: `${origin}${MCP_PATH}`,
      authorization_servers: [origin],
      scopes_supported: options.scopes ?? ["docs.read"],
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
  "POST /token": token(issued, options),
});

/** The mock, its MCP endpoint listing `tools` once signed in to. */
export function mcpOauthMock(
  tools: object[] = [],
  options: McpOauthOptions = {}
): McpOauthMock {
  const issued: Issued = {
    codes: new Map(),
    ended: new Set(),
    n: 0,
    tokens: [],
  };
  const asked: string[] = [];
  const table = routes(tools, issued, options, asked);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const { origin, pathname } = new URL(request.url);
      const route = table[`${request.method} ${pathname}`];
      return route
        ? route(request, origin)
        : new Response("not found", { status: 404 });
    },
  });
  return {
    asked,
    expire: () => {
      for (const one of issued.tokens) {
        issued.ended.add(one);
      }
    },
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
      // A JSON type names a body: a sign-in started with none sends none,
      // as Configure's Sign in does.
      ...(body === undefined
        ? {}
        : { headers: JSON_TYPE, body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new Error(
        `POST ${path}: ${response.status} ${await response.text()}`
      );
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
    throw new Error(
      `the hub's sign-in for ${name} named no state: ${authorizationUrl}`
    );
  }
  await post("/api/fleet/mcp/oauth/complete", {
    code: "tray-docs-code",
    state,
  });
}
