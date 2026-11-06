/**
 * An OAuth-protected MCP server for a spec's fleet to sign in to, with no
 * network: what the hub reads of it to start a sign-in, and nothing past
 * that (no token is ever granted). bodiless-post posts to its sign-in;
 * browser-ask-tree has a delegate ask the person to connect it.
 */

/**
 * An OAuth-protected MCP server and its authorization server on one origin,
 * as the MCP authorization spec has a client discover them: the endpoint's
 * 401 names its resource metadata (RFC 9728), which names the issuer, whose
 * metadata (RFC 8414) names authorize, token and registration (RFC 7591).
 */
export const oauthProvider = () =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const { origin, pathname } = new URL(request.url);
      switch (pathname) {
        case "/mcp":
          return new Response(null, {
            status: 401,
            headers: {
              "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
            },
          });
        case "/.well-known/oauth-protected-resource/mcp":
          return Response.json({
            resource: `${origin}/mcp`,
            authorization_servers: [origin],
            scopes_supported: ["read"],
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
        case "/register":
          return Response.json(
            { ...((await request.json()) as object), client_id: "probe" },
            { status: 201 }
          );
        default:
          return new Response("Not found", { status: 404 });
      }
    },
  });
