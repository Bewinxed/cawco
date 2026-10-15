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
import { type Exchange, FleetMcpRelay } from "./fleet-mcp-relay";
import type { HubLifetimeShape, HubTimer } from "./lifetime";

const SHARED_CLIENT_ID = `${CAWCO_OAUTH_URL}/client.json`;
/**
 * Every provider redirects to CawCo's hand-back page, which forwards the code
 * to the hub origin the starting browser recorded on CawCo's start page. One
 * https redirect is accepted by providers that refuse plain http off loopback,
 * and it is the same whichever address a browser reached the dashboard by.
 */
const SHARED_REDIRECT = `${CAWCO_OAUTH_URL}/callback`;
export interface SignInStart {
  authorizationUrl: string;
}
const DISCOVERY_TIMEOUT_MS = 15_000;
/** Re-probes of a server the hub could not reach: 30 s, 1 m, 2 m, 4 m, 8 m, then every 15 m. */
const REPROBE_FIRST_MS = 30_000;
const REPROBE_MAX_MS = 15 * 60_000;
type OAuthRow = NonNullable<ReturnType<DbShape["getMcpOauth"]>>;
type McpServerRow = NonNullable<ReturnType<DbShape["getMcpServer"]>>;

/** No answer from the server: the network, DNS, a timeout, an abort, or a 5xx. */
class Unreachable extends Error {}

/** A body cut off by the deadline is as unanswered as a connection that never opened. */
const unreachable = (error: unknown): boolean =>
  error instanceof Unreachable ||
  (error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError"));

/**
 * A fetch whose failure to get the server's own answer is told apart from what
 * that answer said. A 5xx is no answer either: it is what an edge or a proxy in
 * front of the server says while the server cannot be reached, and taking it
 * for "direct" would delete a signed-in server's OAuth row.
 */
const reach = async (
  input: string | URL,
  init?: RequestInit
): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Unreachable("No response.", { cause: error });
  }
  if (response.status >= 500) {
    await response.body?.cancel();
    throw new Unreachable(`HTTP ${response.status}.`);
  }
  return response;
};

/**
 * The hub's sign-in is missing: 503, never 401. The proxy is the upstream's
 * OAuth client and asks its own callers for no authorization, so a harness is
 * never told to authorize. A 401 sends every harness's MCP client into
 * discovery and Dynamic Client Registration against the proxy's origin (the
 * machine's gateway or the hub), where no `/register` exists; Claude Code then
 * reports "Dynamic Client Registration rejected (HTTP 404)" and keeps the
 * server in its needs-auth cache for 15 minutes, past the hub's sign-in.
 *
 * Its words are what a session reads in its harness's notice of a server that
 * failed to connect, so they say the sign-in reaches it where it runs: the
 * hub hands every live session the change (`sendMcpChanges` in server.ts).
 */
const signedOut = () =>
  new Response(
    "Sign in to this server from Configure → MCP servers. Its tools then arrive in sessions already running, within seconds; no new session is needed.",
    { status: 503 }
  );

export class FleetMcp {
  readonly #db: DbShape;
  readonly #changed: () => void;
  readonly #lifetime: HubLifetimeShape;
  readonly #probing = new Map<string, Promise<void>>();
  /** One per server the hub could not reach: the config it tried, how many times, and the next try. */
  readonly #reprobes = new Map<
    string,
    { config: string; attempt: number; timer?: HubTimer }
  >();
  readonly #refreshing = new Map<string, Promise<OAuthRow>>();
  readonly #signingIn = new Map<string, Promise<SignInStart>>();
  /** Every session's requests to a signed-in server, through the hub's one identity there. */
  readonly #relay: FleetMcpRelay;

  constructor(db: DbShape, changed: () => void, lifetime: HubLifetimeShape) {
    this.#db = db;
    this.#changed = changed;
    this.#lifetime = lifetime;
    this.#relay = new FleetMcpRelay({
      get: (id, server) => db.getMcpSession(id, server),
      put: (id, server, init) => db.putMcpSession({ id, server, init }),
      touch: (id) => db.touchMcpSession(id),
      delete: (id) => db.deleteMcpSession(id),
      prune: (before) => db.pruneMcpSessions(before),
    });
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
    // This probe stands in for a scheduled one; an unreachable answer schedules the next.
    this.#lifetime.cancel(this.#reprobes.get(name)?.timer);
    // A put (its config, or its switch) starts the relay over: sessions that
    // take the server again read it as it is now, not a list kept before.
    this.#relay.reset(name);
    const probing = this.#probe(name).finally(() => this.#probing.delete(name));
    this.#probing.set(name, probing);
    return probing;
  }

  /** A removed server is probed no more. */
  forget(name: string): void {
    this.#relay.reset(name);
    this.#lifetime.cancel(this.#reprobes.get(name)?.timer);
    this.#reprobes.delete(name);
  }

  /** What a probe can change, to tell the fleet only when a re-probe changed it. */
  #auth(name: string): string {
    const server = this.#db.getMcpServer(name);
    return JSON.stringify([
      server?.authMode,
      server?.authError,
      this.#db.getMcpOauth(name)?.generation,
    ]);
  }

  /** Backs off per server while the same config stays unreachable; another config starts over. */
  #reprobe(name: string, config: string): void {
    const previous = this.#reprobes.get(name);
    const attempt = previous?.config === config ? previous.attempt + 1 : 0;
    const delay = Math.min(REPROBE_FIRST_MS * 2 ** attempt, REPROBE_MAX_MS);
    const timer = this.#lifetime.after(delay, () => {
      if (!this.#db.getMcpServer(name)) {
        this.forget(name);
        return;
      }
      const before = this.#auth(name);
      this.probe(name).then(
        () => {
          if (this.#auth(name) !== before) {
            this.#changed();
          }
        },
        (error: unknown) => {
          console.warn(`[fleet-mcp] ${name} re-probe failed:`, error);
        }
      );
    });
    this.#reprobes.set(name, { config, attempt, timer });
    console.info(
      `[fleet-mcp] ${name} did not answer; probing again in ${delay / 1000} s`
    );
  }

  /**
   * Silence is no answer: a server the hub had settled stays as it was, synced
   * and usable. Its detail is untouched, since any detail reads as failed and
   * takes it off every machine. Only one never settled (no answer since this
   * config was saved, or OAuth without discovered metadata) says why it is
   * still off. Either way the hub asks again.
   */
  #unanswered(server: McpServerRow, config: string): void {
    const settled =
      server.authError === null &&
      (server.authMode === "direct" ||
        this.#db.getMcpOauth(server.name) !== undefined);
    if (!settled) {
      this.#db.setMcpAuth(
        server.name,
        server.authMode,
        "The hub could not reach this server. It keeps trying on its own; check the URL if this stays."
      );
    }
    this.#reprobe(server.name, config);
  }

  async #probe(name: string): Promise<void> {
    const { config } = this.#server(name);
    // A stdio server runs on each machine and has nothing for the hub to
    // reach: settled at once, or the "not reached yet" a put leaves on it
    // (db `putMcpServer`) keeps it off every machine.
    if (!("url" in config)) {
      this.#db.setMcpAuth(name, "direct");
      return;
    }
    const key = JSON.stringify(config);
    const fresh = () => {
      const latest = this.#db.getMcpServer(name);
      return latest && JSON.stringify(latest.config) === key
        ? latest
        : undefined;
    };
    try {
      const response = await reach(config.url, {
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
        // A redirect is an answer: it fails discovery below, as it always has.
        redirect: "manual",
      });
      const { resourceMetadataUrl } = extractWWWAuthenticateParams(response);
      await response.body?.cancel();
      if (!fresh()) {
        return;
      }
      if (response.status >= 300 && response.status < 400) {
        throw new Error("The server redirected the initialize request.");
      }
      if (response.status !== 401 || !resourceMetadataUrl) {
        this.#db.setMcpAuth(name, "direct");
        this.#db.deleteMcpOauth(name);
        this.#reprobes.delete(name);
        return;
      }
      // Mark OAuth before discovery: a metadata failure must never sync the upstream to a harness.
      this.#db.setMcpAuth(name, "oauth");
      const resource = await discoverOAuthProtectedResourceMetadata(
        config.url,
        { resourceMetadataUrl },
        reach
      );
      const [issuer] = resource.authorization_servers ?? [];
      if (!issuer) {
        throw new Error("No authorization server in resource metadata.");
      }
      const metadata = await discoverAuthorizationServerMetadata(issuer, {
        fetchFn: reach,
      });
      if (!metadata) {
        throw new Error("Authorization server metadata is unavailable.");
      }
      if (!fresh()) {
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
      this.#reprobes.delete(name);
    } catch (error) {
      const latest = fresh();
      if (!latest) {
        return;
      }
      if (unreachable(error)) {
        this.#unanswered(latest, key);
        return;
      }
      this.#reprobes.delete(name);
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

  start(name: string): Promise<SignInStart> {
    const running = this.#signingIn.get(name);
    if (running !== undefined) {
      return running;
    }
    const starting = this.#start(name).finally(() =>
      this.#signingIn.delete(name)
    );
    this.#signingIn.set(name, starting);
    return starting;
  }

  async #start(name: string): Promise<SignInStart> {
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
    // registration is signed in to as CawCo's shared client; any other
    // registers this install's own client once, kept for every later sign-in.
    const shared =
      !row.metadata.registration_endpoint &&
      row.metadata.client_id_metadata_document_supported === true;
    let { client } = row;
    if (shared) {
      client = {
        client_id: SHARED_CLIENT_ID,
        redirect_uris: [SHARED_REDIRECT],
      };
      // A client registered for another redirect cannot be sent to this one.
    } else if (!client?.redirect_uris.includes(SHARED_REDIRECT)) {
      try {
        client = await registerClient(row.issuer, {
          metadata: row.metadata,
          clientMetadata: {
            client_name: "CawCo fleet",
            redirect_uris: [SHARED_REDIRECT],
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
        redirectUrl: SHARED_REDIRECT,
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
        redirectUri: SHARED_REDIRECT,
        state,
        verifier: codeVerifier,
        expiresAt: Date.now() + 10 * 60_000,
      },
    });
    return { authorizationUrl: authorizationUrl.toString() };
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
    this.#relay.reset(row.name);
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
        fetchFn: reach,
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
    } catch (error) {
      // A token endpoint that did not answer refused nothing: the sign-in
      // stays, and the request that needed it is answered 502 to retry.
      if (unreachable(error)) {
        throw error;
      }
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
        this.#relay.reset(row.name);
        this.#changed();
      }
      // biome-ignore lint/style/useErrorCause: upstream OAuth exceptions may contain token responses; they must stay out of logs
      throw new Error(
        "This server is signed out. Sign in again from Configure → MCP servers."
      );
    }
  }

  /**
   * One request to the upstream as the hub's sign-in: its bearer, refreshed
   * when near expiry or refused once. A second refusal signs the server out
   * and throws. The relay's gate stands in front of every call here.
   */
  async #upstream(name: string, exchange: Exchange): Promise<Response> {
    const server = this.#server(name);
    let row = this.#db.getMcpOauth(name);
    if (!row?.tokens) {
      throw new Error("Signed out.");
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now() + 60_000) {
      row = await this.#refresh(row);
    }
    const upstream = new URL(row.upstream);
    upstream.search = exchange.search || upstream.search;
    const call = (token: string) => {
      const headers = new Headers(
        "url" in server.config ? server.config.headers : undefined
      );
      for (const [header, value] of exchange.headers) {
        headers.set(header, value);
      }
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(upstream, {
        method: exchange.method,
        body: exchange.body,
        headers,
        signal: exchange.signal,
        redirect: "error",
      });
    };
    let response = await call(row.tokens?.access_token ?? "");
    if (response.status !== 401) {
      return response;
    }
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
      this.#relay.reset(name);
      this.#changed();
      throw new Error("Signed out.");
    }
    return response;
  }

  async forward(name: string, request: Request): Promise<Response> {
    await this.#probing.get(name);
    const server = this.#server(name);
    if (!server.enabled) {
      return new Response("This server is disabled.", { status: 403 });
    }
    const row = this.#db.getMcpOauth(name);
    if (!(row?.tokens && server.authMode === "oauth")) {
      return signedOut();
    }
    try {
      return await this.#relay.handle(
        name,
        row.generation,
        request,
        (exchange) => this.#upstream(name, exchange)
      );
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
