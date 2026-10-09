import {
  CAWCO_OAUTH_URL,
  type FleetConfig,
  type FleetMcpServer,
} from "@cawco/core";
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  exchangeAuthorization,
  extractWWWAuthenticateParams,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import type { DbShape } from "./db";

const SHARED_CLIENT_ID = `${CAWCO_OAUTH_URL}/client.json`;
const SHARED_REDIRECT = `${CAWCO_OAUTH_URL}/callback`;
/** `via` says where the browser goes first: straight to the provider, or through CawCo's start page. */
export interface SignInStart {
  authorizationUrl: string;
  via: "install" | "cawco";
}
const MCP_HEADERS = [
  "Mcp-Session-Id",
  "MCP-Protocol-Version",
  "Accept",
  "Content-Type",
  "Last-Event-ID",
];
const DISCOVERY_TIMEOUT_MS = 15_000;
type OAuthRow = NonNullable<ReturnType<DbShape["getMcpOauth"]>>;

/** The proxy owns credentials, so a harness never sees an OAuth discovery challenge. */
const signedOut = () =>
  new Response("Sign in to this server from Configure → MCP servers.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Bearer realm="CawCo fleet"' },
  });

export class FleetMcp {
  readonly #db: DbShape;
  readonly #changed: () => void;
  readonly #probing = new Map<string, Promise<void>>();
  readonly #refreshing = new Map<string, Promise<OAuthRow>>();
  readonly #signingIn = new Map<string, Promise<SignInStart>>();

  constructor(db: DbShape, changed: () => void) {
    this.#db = db;
    this.#changed = changed;
  }

  async ready(): Promise<void> {
    await Promise.all(this.#probing.values());
  }

  #server(name: string) {
    const server = this.#db.getMcpServer(name);
    if (!server) {
      throw new Error("This MCP server no longer exists.");
    }
    return server;
  }

  #current(row: OAuthRow): boolean {
    const config = this.#db.getMcpServer(row.name)?.config;
    return Boolean(
      config &&
        "url" in config &&
        config.url === row.upstream &&
        this.#db.getMcpOauth(row.name)?.generation === row.generation
    );
  }

  probe(name: string): Promise<void> {
    const running = this.#probing.get(name);
    if (running !== undefined) {
      return running.then(() => this.probe(name));
    }
    const probing = this.#probe(name).finally(() => this.#probing.delete(name));
    this.#probing.set(name, probing);
    return probing;
  }

  async #probe(name: string): Promise<void> {
    const { config } = this.#server(name);
    if (!("url" in config)) {
      return;
    }
    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          ...config.headers,
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "CawCo fleet", version: "1" },
          },
        }),
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
        redirect: "error",
      });
      const { resourceMetadataUrl } = extractWWWAuthenticateParams(response);
      await response.body?.cancel();
      const latest = this.#db.getMcpServer(name);
      if (!latest || JSON.stringify(latest.config) !== JSON.stringify(config)) {
        return;
      }
      if (response.status !== 401 || !resourceMetadataUrl) {
        this.#db.setMcpAuth(name, "direct");
        this.#db.deleteMcpOauth(name);
        return;
      }
      // Mark OAuth before discovery: a metadata failure must never sync the upstream to a harness.
      this.#db.setMcpAuth(name, "oauth");
      const resource = await discoverOAuthProtectedResourceMetadata(
        config.url,
        { resourceMetadataUrl },
        (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
          })
      );
      const [issuer] = resource.authorization_servers ?? [];
      if (!issuer) {
        throw new Error("No authorization server in resource metadata.");
      }
      const metadata = await discoverAuthorizationServerMetadata(issuer, {
        fetchFn: (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
          }),
      });
      if (!metadata) {
        throw new Error("Authorization server metadata is unavailable.");
      }
      const current = this.#server(name).config;
      if (JSON.stringify(current) !== JSON.stringify(config)) {
        return;
      }
      const previous = this.#db.getMcpOauth(name);
      const same =
        previous?.upstream === config.url &&
        previous.issuer === issuer &&
        previous.resource.resource === resource.resource;
      this.#db.putMcpOauth({
        ...(same ? previous : {}),
        name,
        generation: same ? previous.generation : crypto.randomUUID(),
        upstream: config.url,
        resource,
        issuer,
        metadata,
      });
      this.#db.setMcpAuth(name, "oauth");
    } catch {
      const latest = this.#db.getMcpServer(name);
      if (!latest || JSON.stringify(latest.config) !== JSON.stringify(config)) {
        return;
      }
      this.#db.setMcpAuth(
        name,
        latest.authMode,
        "The hub could not discover this server’s authorization. Check its URL and retry saving the server."
      );
    }
  }

  /**
   * All outbound syncs pass here, including targeted memory and hook pushes:
   * the fleet's servers and a project's placed copies alike.
   */
  syncConfig(config: FleetConfig, hub: string): FleetConfig {
    const outbound = (server: FleetMcpServer): FleetMcpServer => {
      if (server.auth?.state === "failed") {
        return { ...server, enabled: false };
      }
      if (server.auth?.mode !== "oauth") {
        return server;
      }
      return {
        ...server,
        proxied: true,
        config: {
          type: "http",
          url: `${hub}/mcp/fleet/${encodeURIComponent(server.name)}`,
          ...("timeout" in server.config
            ? { timeout: server.config.timeout }
            : {}),
        },
      };
    };
    return {
      ...config,
      mcp: config.mcp.map(outbound),
      ...(config.placedMcp
        ? { placedMcp: config.placedMcp.map(outbound) }
        : {}),
    };
  }

  start(name: string, redirectUri: string): Promise<SignInStart> {
    const running = this.#signingIn.get(name);
    if (running !== undefined) {
      return running;
    }
    const starting = this.#start(name, redirectUri).finally(() =>
      this.#signingIn.delete(name)
    );
    this.#signingIn.set(name, starting);
    return starting;
  }

  async #start(name: string, installRedirect: string): Promise<SignInStart> {
    await this.#probing.get(name);
    const server = this.#server(name);
    if (!server.enabled) {
      throw new Error("Enable this server before signing in.");
    }
    const row = this.#db.getMcpOauth(name);
    if (!row || server.authMode !== "oauth") {
      throw new Error(
        "This server has no discovered OAuth authorization server. Check its URL and save it again."
      );
    }
    // A provider that names clients by a published document and has no
    // registration is signed in to as CawCo's shared client, whose one redirect
    // is CawCo's hand-back page; any other provider redirects to this install.
    const shared =
      !row.metadata.registration_endpoint &&
      row.metadata.client_id_metadata_document_supported === true;
    const redirectUri = shared ? SHARED_REDIRECT : installRedirect;
    let { client } = row;
    if (shared) {
      client = {
        client_id: SHARED_CLIENT_ID,
        redirect_uris: [SHARED_REDIRECT],
      };
      // A client registered for another origin cannot be redirected to this one.
    } else if (!client?.redirect_uris.includes(redirectUri)) {
      try {
        client = await registerClient(row.issuer, {
          metadata: row.metadata,
          clientMetadata: {
            client_name: "CawCo fleet",
            redirect_uris: [redirectUri],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
          },
        });
      } catch {
        // biome-ignore lint/style/useErrorCause: upstream OAuth exceptions may contain token responses; they must stay out of logs
        throw new Error(
          "This server refused client registration. Check its authorization settings, then sign in again."
        );
      }
    }
    const state = crypto.randomUUID();
    const { authorizationUrl, codeVerifier } = await startAuthorization(
      row.issuer,
      {
        metadata: row.metadata,
        clientInformation: client,
        redirectUrl: redirectUri,
        state,
        scope: row.resource.scopes_supported?.join(" "),
        resource: new URL(row.resource.resource),
      }
    );
    console.info(
      `[fleet-mcp] ${name} authorize parameter names: ${[...authorizationUrl.searchParams.keys()].join(", ")}`
    );
    if (!this.#current(row)) {
      throw new Error(
        "This server changed during sign-in. Start sign-in again."
      );
    }
    this.#db.putMcpOauth({
      ...row,
      client,
      lastOpenedAt: new Date(),
      pending: {
        client,
        redirectUri,
        state,
        verifier: codeVerifier,
        expiresAt: Date.now() + 10 * 60_000,
      },
    });
    return {
      authorizationUrl: authorizationUrl.toString(),
      via: shared ? "cawco" : "install",
    };
  }

  async complete(
    code: string,
    state: string,
    iss?: string
  ): Promise<{ name: string }> {
    // Consumed synchronously before the exchange, so concurrent callbacks cannot spend a code twice.
    const row = this.#db.takeMcpAuthorization(state);
    if (!row?.pending) {
      throw new Error(
        "This sign-in expired or was already completed. Start sign-in again."
      );
    }
    // RFC 9207: a server that says it names itself on the redirect must be heard
    // doing so, and as the one this sign-in started with.
    if (
      (
        row.metadata as {
          authorization_response_iss_parameter_supported?: boolean;
        }
      ).authorization_response_iss_parameter_supported === true &&
      iss !== row.metadata.issuer
    ) {
      throw new Error(
        "This sign-in came back from a different authorization server than it started with. Start sign-in again."
      );
    }
    let tokens: OAuthRow["tokens"];
    try {
      tokens = await exchangeAuthorization(row.issuer, {
        metadata: row.metadata,
        clientInformation: row.pending.client,
        authorizationCode: code,
        codeVerifier: row.pending.verifier,
        redirectUri: row.pending.redirectUri,
        resource: new URL(row.resource.resource),
      });
    } catch {
      // biome-ignore lint/style/useErrorCause: upstream OAuth exceptions may contain token responses; they must stay out of logs
      throw new Error(
        "The authorization server refused this sign-in. Start sign-in again."
      );
    }
    if (!this.#current(row)) {
      throw new Error(
        "This server changed during sign-in. Start sign-in again."
      );
    }
    this.#db.putMcpOauth({
      ...row,
      tokens,
      tokenClient: row.pending.client,
      expiresAt:
        tokens.expires_in === undefined
          ? null
          : new Date(Date.now() + tokens.expires_in * 1000),
      pending: null,
    });
    this.#db.setMcpAuth(row.name, "oauth");
    this.#changed();
    return { name: row.name };
  }

  #refresh(row: OAuthRow): Promise<OAuthRow> {
    const running = this.#refreshing.get(row.name);
    if (running) {
      return running;
    }
    const refreshing = this.#refreshToken(row).finally(() =>
      this.#refreshing.delete(row.name)
    );
    this.#refreshing.set(row.name, refreshing);
    return refreshing;
  }

  async #refreshToken(row: OAuthRow): Promise<OAuthRow> {
    try {
      if (!(row.tokens?.refresh_token && row.tokenClient)) {
        throw new Error("No refresh token.");
      }
      const tokens = await refreshAuthorization(row.issuer, {
        metadata: row.metadata,
        clientInformation: row.tokenClient,
        refreshToken: row.tokens.refresh_token,
        resource: new URL(row.resource.resource),
      });
      if (!this.#current(row)) {
        throw new Error("Server changed.");
      }
      const current = this.#db.getMcpOauth(row.name);
      if (
        current?.tokens &&
        current.tokens.access_token !== row.tokens.access_token
      ) {
        return current;
      }
      const updated = {
        ...row,
        ...current,
        tokens,
        expiresAt:
          tokens.expires_in === undefined
            ? null
            : new Date(Date.now() + tokens.expires_in * 1000),
      };
      this.#db.putMcpOauth(updated);
      return updated;
    } catch {
      const current = this.#db.getMcpOauth(row.name);
      if (
        this.#current(row) &&
        current?.tokens?.access_token === row.tokens?.access_token
      ) {
        this.#db.putMcpOauth({
          ...row,
          ...current,
          tokens: null,
          expiresAt: null,
        });
        this.#changed();
      }
      // biome-ignore lint/style/useErrorCause: upstream OAuth exceptions may contain token responses; they must stay out of logs
      throw new Error(
        "This server is signed out. Sign in again from Configure → MCP servers."
      );
    }
  }

  async forward(name: string, request: Request): Promise<Response> {
    await this.#probing.get(name);
    const server = this.#server(name);
    if (!server.enabled) {
      return new Response("This server is disabled.", { status: 403 });
    }
    let row = this.#db.getMcpOauth(name);
    if (!(row?.tokens && server.authMode === "oauth")) {
      return signedOut();
    }
    try {
      if (row.expiresAt && row.expiresAt.getTime() <= Date.now() + 60_000) {
        row = await this.#refresh(row);
      }
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer();
      const upstream = new URL(row.upstream);
      upstream.search = new URL(request.url).search || upstream.search;
      const call = (token: string) => {
        const headers = new Headers(
          "url" in server.config ? server.config.headers : undefined
        );
        for (const header of MCP_HEADERS) {
          const value = request.headers.get(header);
          if (value !== null) {
            headers.set(header, value);
          }
        }
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(upstream, {
          method: request.method,
          body,
          headers,
          signal: request.signal,
          redirect: "error",
        });
      };
      let response = await call(row.tokens?.access_token ?? "");
      if (response.status === 401) {
        await response.body?.cancel();
        // A concurrent request may already have refreshed the token rejected here.
        const latest = this.#db.getMcpOauth(name);
        row =
          latest?.tokens?.access_token &&
          latest.tokens.access_token !== row.tokens?.access_token
            ? latest
            : await this.#refresh(row);
        response = await call(row.tokens?.access_token ?? "");
        if (response.status === 401) {
          await response.body?.cancel();
          this.#db.putMcpOauth({ ...row, tokens: null, expiresAt: null });
          this.#changed();
          return signedOut();
        }
      }
      const headers = new Headers(response.headers);
      headers.delete("WWW-Authenticate");
      // Fetch decoded any content encoding; a streamed response describes those decoded bytes.
      headers.delete("Content-Encoding");
      headers.delete("Content-Length");
      // Hop-by-hop framing belongs to the hub's outgoing connection.
      for (const header of [
        "Connection",
        "Transfer-Encoding",
        "Keep-Alive",
        "TE",
        "Trailer",
        "Upgrade",
        "Proxy-Authenticate",
        "Proxy-Authorization",
      ]) {
        headers.delete(header);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return this.#db.getMcpOauth(name)?.tokens
        ? new Response(
            "The upstream MCP server could not be reached. Retry the request.",
            { status: 502 }
          )
        : signedOut();
    }
  }
}
