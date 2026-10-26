import {
  CAWCO_OAUTH_URL,
  type ConnectAccess,
  type ConnectAccessSet,
  configurePage,
  type FleetMcpServer,
  type MachineFleetConfig,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { mcpWords } from "@cawco/core/words/mcp";
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  exchangeAuthorization,
  extractWWWAuthenticateParams,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { OAuthError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
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
  /** When the provider's page stops taking this sign-in's answer, epoch ms. */
  expiresAt: number;
}

/** How long a started sign-in's answer is taken: the provider's page is good for minutes. */
const SIGN_IN_TTL_MS = 10 * 60_000;

/**
 * A scope that reads and does no more: one ending in a read word (`read`,
 * `readonly`, `read_only`, `ro`, `view`) after a separator, or that word
 * alone (`docs.read`, `files:read`, `repo_readonly`). CawCo's own call: no
 * standard names an OAuth scope's reach, so the name is all there is.
 */
const READ_SCOPE = /(?:^|[.:_/-])(?:read(?:[._-]?only)?|ro|view)$/iu;

/**
 * The access a server's scopes offer (core `ConnectAccessSet`): read-only
 * (its read scopes) and read and write (all of them) when it names both
 * kinds; else the one set it has, or none when it names no scopes.
 */
export const accessOffers = (scopes: readonly string[]): ConnectAccessSet[] => {
  const all = [...new Set(scopes)];
  const read = all.filter((scope) => READ_SCOPE.test(scope));
  if (all.length === 0) {
    return [];
  }
  if (read.length > 0 && read.length < all.length) {
    return [
      { access: "read", scopes: read },
      { access: "write", scopes: all },
    ];
  }
  return [{ access: read.length > 0 ? "read" : "write", scopes: all }];
};

/** What a connect ask for a server says before anything opens (connect-asks.ts). */
export interface AskFacts {
  /** As whom the hub is signed in there, while it is. */
  as: string | null;
  /** Its sign-in ended without the person: a reconnect. */
  ended: boolean;
  /** The access the last sign-in asked for, kept past its end. */
  held: ConnectAccess | null;
  offers: ConnectAccessSet[];
  signedIn: boolean;
  /** The provider's authorization page. */
  url: string;
}

/** Where an ID token's claims are: its middle part, base64url JSON. */
const claimsOf = (idToken: unknown): Record<string, unknown> => {
  if (typeof idToken !== "string") {
    return {};
  }
  const [, body] = idToken.split(".");
  try {
    return JSON.parse(
      Buffer.from(body ?? "", "base64url").toString("utf8")
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/**
 * As whom the provider signed the hub in: its ID token's email, else its
 * preferred username, else its name (OpenID Connect Core §5.1). Read for
 * the person's eyes only, never to decide anything, so it is not verified.
 * None when the provider sent no ID token.
 */
const identityOf = (tokens: { id_token?: unknown }): string | null => {
  const claims = claimsOf(tokens.id_token);
  const said = [claims.email, claims.preferred_username, claims.name].find(
    (one): one is string => typeof one === "string" && one.trim() !== ""
  );
  return said?.trim() ?? null;
};
const DISCOVERY_TIMEOUT_MS = 15_000;
/** Re-probes of a server the hub could not reach: 30 s, 1 m, 2 m, 4 m, 8 m, then every 15 m. */
const REPROBE_FIRST_MS = 30_000;
const REPROBE_MAX_MS = 15 * 60_000;
/**
 * A token request's own deadline, far past what a request waiting on it
 * waits ({@link REFRESH_WAIT_MS}). A public client's refresh token is
 * rotated by the provider the moment it answers (MCP authorization spec:
 * "For public clients, authorization servers MUST rotate refresh tokens"),
 * so an answer let go at a short deadline loses the only refresh token
 * that still works, and the next refresh spends the old one and is refused.
 */
const TOKEN_DEADLINE_MS = 120_000;
/** How long a request waits on a refresh before it is answered 502 to retry; the refresh itself goes on. */
const REFRESH_WAIT_MS = 20_000;
/** The waits between token requests that did not land: 0.5 s, 1 s, 2 s, 4 s, 8 s (CawCo's own call). */
const REFRESH_RETRIES_MS = [500, 1000, 2000, 4000, 8000];
/** After a refresh that landed on none of its tries, the next waits 30 s, doubling to 15 m. */
const REFRESH_COOL_FIRST_MS = 30_000;
const REFRESH_COOL_MAX_MS = 15 * 60_000;
/** A refresh starts this long before its access token expires, behind requests still using it. */
const REFRESH_AHEAD_MS = 60_000;
/** An access token with less than this left is not sent: the request waits for the refresh. */
const EXPIRY_MARGIN_MS = 5000;
/**
 * An access token the upstream refuses this soon after it was issued is not
 * refreshed again: the refusal is the upstream's, not the token's age, and
 * a refresh per request would spend refresh tokens as fast as calls come.
 */
const FRESH_TOKEN_MS = 10_000;
/** The token endpoint's errors that end a sign-in (RFC 6749 §5.2, RFC 6750 §3.1). */
const ENDING = new Set(["invalid_grant", "invalid_token"]);
/** How much of a provider's error words a log line and Show details carry. */
const WORDS_MAX = 400;
type OAuthRow = NonNullable<ReturnType<DbShape["getMcpOauth"]>>;
type McpServerRow = NonNullable<ReturnType<DbShape["getMcpServer"]>>;

/**
 * No answer from the server: the network, DNS, none within the deadline, or
 * a 5xx. Thrown, not returned: {@link reach} is the MCP SDK's `fetchFn`, whose
 * callers take a Response or an error.
 */
class Unreachable extends Error {}

const unreachable = (error: unknown): boolean => error instanceof Unreachable;

/** The hub holds no sign-in for the server: answered as {@link signedOut}. */
class SignedOut extends Error {}

/** A request the sign-in could not serve now, the sign-in kept: answered 502, to retry. */
class NotNow extends Error {}

/** A sign-in that ended without the person: when, which server, and why. */
export interface SignInEnded {
  at: Date;
  name: string;
  why: string;
}

/** What the hub tells the person about its sign-ins (push.ts): one ended, or one signed in again. */
export interface SignInPorts {
  ended: (ended: SignInEnded) => void;
  signedIn: (name: string) => void;
}

const TRAILING_STOP = /\.$/u;

/** A provider's words, cut to what a log line and a Show details carry. */
const cut = (words: string): string =>
  words.length > WORDS_MAX ? `${words.slice(0, WORDS_MAX)}…` : words;

/**
 * A token endpoint's refusal in its own words: the OAuth error code and its
 * description, with the HTTP status. Only an {@link OAuthError} is read:
 * anything else the SDK throws (a token response it could not parse) may
 * carry the tokens themselves, and is named by its kind alone.
 */
const refusalWords = (error: unknown, status: number | null): string => {
  const at = status ? ` (HTTP ${status})` : "";
  if (error instanceof OAuthError) {
    return cut(
      `${error.errorCode}${error.message ? `: ${error.message}` : ""}${at}`
    );
  }
  if (error instanceof Unreachable) {
    return `no answer (${error.message.replace(TRAILING_STOP, "")})`;
  }
  return `an answer the hub could not read${at}`;
};

/**
 * Why a sign-in ended at the token endpoint: its refusal, and the tries of
 * the same renewal that got no answer before it.
 */
const endedWords = (refusal: string, unanswered: number): string => {
  const earlier =
    unanswered > 0
      ? ` ${unanswered} earlier ${unanswered === 1 ? "try" : "tries"} of this renewal got no answer, so the provider may have rotated the refresh token then.`
      : "";
  return `The token endpoint refused to renew it: ${refusal}.${earlier}`;
};

const BEARER_ERROR = /\berror="([^"]*)"/u;
const BEARER_DESCRIPTION = /\berror_description="([^"]*)"/u;

/** The upstream's own words on a 401: its `WWW-Authenticate` error and description (RFC 6750 §3). */
const bearerWords = (response: Response): string => {
  const challenge = response.headers.get("WWW-Authenticate") ?? "";
  const error = BEARER_ERROR.exec(challenge)?.[1];
  const description = BEARER_DESCRIPTION.exec(challenge)?.[1];
  return cut(
    [error, description].filter(Boolean).join(": ") || "no reason given"
  );
};

/** Statuses whose Response carries no body (Fetch: "null body status"). */
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/**
 * A fetch whose failure to get the server's own answer is told apart from what
 * that answer said. A 5xx is no answer either: it is what an edge or a proxy in
 * front of the server says while the server cannot be reached, and taking it
 * for "direct" would delete a signed-in server's OAuth row. `take` reads what
 * is wanted of the response inside the same deadline, so a body cut off by
 * it is as unanswered as a connection that never opened.
 */
const reachWithin = async (
  input: string | URL,
  init: RequestInit | undefined,
  take: (response: Response) => Promise<Response>,
  deadline = DISCOVERY_TIMEOUT_MS
): Promise<Response> => {
  const reached = await readWithin(deadline, async (signal) => {
    let response: Response;
    try {
      response = await fetch(input, { ...init, signal });
    } catch (error) {
      throw new Unreachable(
        `No response (${error instanceof Error ? error.message : String(error)}).`,
        { cause: error }
      );
    }
    if (response.status >= 500) {
      await response.body?.cancel();
      throw new Unreachable(`HTTP ${response.status}.`);
    }
    return await take(response);
  });
  switch (reached.kind) {
    case "answered":
      return reached.value;
    case "unanswered":
      throw new Unreachable(
        `No answer within ${Math.round(reached.after / 1000)} s.`
      );
    default: {
      const unhandled: never = reached;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** A response with its whole body read, inside the deadline that read it. */
const readWhole = async (response: Response): Promise<Response> =>
  new Response(
    NULL_BODY.has(response.status) ? null : await response.arrayBuffer(),
    {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }
  );

/** {@link reachWithin} with the whole body read: the SDK's discovery fetches. */
const reach = (input: string | URL, init?: RequestInit): Promise<Response> =>
  reachWithin(input, init, readWhole);

/**
 * {@link reach} for the token endpoint: its own long deadline
 * ({@link TOKEN_DEADLINE_MS}), and a 429 or 408 is no answer either, tried
 * again, never a refusal. `heard` is told the status of each answer taken.
 */
const reachToken =
  (heard: (status: number) => void) =>
  (input: string | URL, init?: RequestInit): Promise<Response> =>
    reachWithin(
      input,
      init,
      async (response) => {
        if (response.status === 429 || response.status === 408) {
          await response.body?.cancel();
          throw new Unreachable(`HTTP ${response.status}.`);
        }
        heard(response.status);
        return await readWhole(response);
      },
      TOKEN_DEADLINE_MS
    );

/** {@link reachWithin} for the status and headers only: the body (perhaps a stream that stays open) is let go. */
const reachHead = (
  input: string | URL,
  init?: RequestInit
): Promise<Response> =>
  reachWithin(input, init, async (response) => {
    await response.body?.cancel();
    return response;
  });

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
    `Sign in to this server from ${configurePage("mcp")}. Its tools then arrive in sessions already running, within seconds; no new session is needed.`,
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
  /** The one refresh under way per server: every request that needs one waits on it. */
  readonly #refreshing = new Map<string, Promise<OAuthRow>>();
  /** A server whose last refresh landed on none of its tries: no refresh before `until`. */
  readonly #cooling = new Map<
    string,
    { round: number; until: number; why: string }
  >();
  /** When each server's access token was issued here, to tell a fresh token's refusal from an old one's. */
  readonly #issued = new Map<string, number>();
  readonly #signingIn = new Map<string, Promise<SignInStart>>();
  /** Every session's requests to a signed-in server, through the hub's one identity there. */
  readonly #relay: FleetMcpRelay;
  readonly #ports: SignInPorts;

  constructor(
    db: DbShape,
    changed: () => void,
    lifetime: HubLifetimeShape,
    ports: SignInPorts
  ) {
    this.#db = db;
    this.#changed = changed;
    this.#lifetime = lifetime;
    this.#ports = ports;
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
    this.#cooling.delete(name);
    this.#issued.delete(name);
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
      const response = await reachHead(config.url, {
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
      if (!fresh()) {
        return;
      }
      if (response.status >= 300 && response.status < 400) {
        throw new Error("The server redirected the initialize request.");
      }
      if (response.status !== 401 || !resourceMetadataUrl) {
        this.#direct(name, response.status);
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
      this.#discovered(name, config.url, resource, issuer, metadata);
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

  /** The server answered without asking for a sign-in: it is called directly, and a sign-in it had goes. */
  #direct(name: string, status: number): void {
    if (this.#db.getMcpOauth(name)?.tokens) {
      console.warn(
        `[fleet-mcp] ${name}: the server answered without asking for a sign-in (HTTP ${status}), so the hub calls it directly now and lets its sign-in go`
      );
    }
    this.#db.setMcpAuth(name, "direct");
    this.#db.deleteMcpOauth(name);
    this.#reprobes.delete(name);
  }

  /**
   * A probe's discovered authorization, kept. The same server, issuer and
   * resource keep their sign-in; another's ends it, and the person is told.
   */
  #discovered(
    name: string,
    url: string,
    resource: OAuthRow["resource"],
    issuer: string,
    metadata: OAuthRow["metadata"]
  ): void {
    const previous = this.#db.getMcpOauth(name);
    const same =
      previous?.upstream === url &&
      previous.issuer === issuer &&
      previous.resource.resource === resource.resource;
    // A sign-in for another authorization server or resource is no
    // sign-in here: it ends, and the person is told why.
    const lost =
      !same && previous?.tokens
        ? {
            at: new Date(),
            why: `The server now names ${previous.issuer === issuer ? `another resource (${resource.resource}, was ${previous.resource.resource})` : `another authorization server (${issuer}, was ${previous.issuer})`}, so the sign-in made with the old one no longer applies.`,
          }
        : undefined;
    this.#db.putMcpOauth({
      ...(same ? previous : {}),
      name,
      generation: same ? previous.generation : crypto.randomUUID(),
      upstream: url,
      resource,
      issuer,
      metadata,
      ...(lost ? { endedAt: lost.at, endedWhy: lost.why } : {}),
    });
    this.#db.setMcpAuth(name, "oauth");
    this.#reprobes.delete(name);
    if (lost) {
      this.#told(name, lost.at, lost.why);
    }
  }

  /**
   * Every machine's sync passes here: the fleet's servers and each
   * project's alike.
   */
  syncConfig(config: MachineFleetConfig, hub: string): MachineFleetConfig {
    const outbound = (server: FleetMcpServer): FleetMcpServer => {
      if (server.auth?.state === "failed") {
        return { ...server, enabled: false };
      }
      if (server.auth?.mode !== "oauth") {
        return server;
      }
      // Why a sign-in ended, and as whom, are the person's to read, on the dashboard.
      const { ended: _ended, as: _as, ...auth } = server.auth;
      return {
        ...server,
        auth,
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
      projects: Object.fromEntries(
        Object.entries(config.projects).map(([projectId, rows]) => [
          projectId,
          { ...rows, mcp: rows.mcp.map(outbound) },
        ])
      ),
    };
  }

  /**
   * What a connect ask for `name` says: the provider's page, the access its
   * scopes offer and the one held from the last sign-in, and whether the
   * hub is signed in there now. Throws the sentence an agent reads when it
   * is no server a person can sign in to.
   */
  askFacts(name: string): AskFacts {
    const server = this.#db.getMcpServer(name);
    const row = this.#db.getMcpOauth(name);
    if (!(server && server.authMode === "oauth" && row)) {
      throw new Error(
        `${name} is no MCP server of the fleet's that signs in with OAuth.`
      );
    }
    if (!server.enabled) {
      throw new Error(
        `${name} is switched off on the MCP page; the person turns it on there before anyone signs in to it.`
      );
    }
    return {
      held: row.access ?? null,
      as: row.tokens ? (row.identity ?? null) : null,
      ended: !row.tokens && row.endedAt !== null && row.endedAt !== undefined,
      offers: accessOffers(this.#scopes(row)),
      signedIn: Boolean(row.tokens),
      url: row.metadata.authorization_endpoint,
    };
  }

  /** The scopes a server names: its resource's, else its authorization server's. */
  #scopes(row: OAuthRow): string[] {
    return (
      row.resource.scopes_supported ??
      (row.metadata as { scopes_supported?: string[] }).scopes_supported ??
      []
    );
  }

  /**
   * Starts a sign-in to `name`, asking for `access` of its scopes; none
   * asks for the access the last sign-in did, else every scope it names.
   */
  start(name: string, access?: ConnectAccess): Promise<SignInStart> {
    const key = `${name}\u0000${access ?? ""}`;
    const running = this.#signingIn.get(key);
    if (running !== undefined) {
      return running;
    }
    const starting = this.#start(name, access).finally(() =>
      this.#signingIn.delete(key)
    );
    this.#signingIn.set(key, starting);
    return starting;
  }

  async #start(name: string, asked?: ConnectAccess): Promise<SignInStart> {
    await this.#probing.get(name);
    const server = this.#server(name);
    if (!server.enabled) {
      throw new Error(mcpWords.enableBeforeSignIn);
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
    const offers = accessOffers(this.#scopes(row));
    const access = asked ?? row.access ?? null;
    const scopes =
      offers.find((offer) => offer.access === access)?.scopes ??
      offers.at(-1)?.scopes;
    const { authorizationUrl, codeVerifier } = await startAuthorization(
      row.issuer,
      {
        metadata: row.metadata,
        clientInformation: client,
        redirectUrl: SHARED_REDIRECT,
        state,
        scope: scopes?.join(" "),
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
    const expiresAt = Date.now() + SIGN_IN_TTL_MS;
    this.#db.putMcpOauth({
      ...row,
      client,
      lastOpenedAt: new Date(),
      pending: {
        client,
        redirectUri: SHARED_REDIRECT,
        state,
        verifier: codeVerifier,
        expiresAt,
        access: offers.some((offer) => offer.access === access)
          ? access
          : (offers.at(-1)?.access ?? null),
      },
    });
    return { authorizationUrl: authorizationUrl.toString(), expiresAt };
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
      endedAt: null,
      endedWhy: null,
      access: row.pending.access ?? null,
      identity: identityOf(tokens),
    });
    this.#issued.set(row.name, Date.now());
    this.#cooling.delete(row.name);
    this.#db.setMcpAuth(row.name, "oauth");
    this.#relay.reset(row.name);
    console.info(
      `[fleet-mcp] ${row.name}: signed in${tokens.refresh_token ? "" : "; the provider issued no refresh token, so the sign-in lasts as long as its access token"}`
    );
    this.#changed();
    this.#ports.signedIn(row.name);
    return { name: row.name };
  }

  /**
   * The one refresh per server: a request that needs one joins the one under
   * way, so two never spend one rotating refresh token. Its outcome is logged
   * by the refresh itself, whoever still waits on it. A server whose last
   * refresh landed on none of its tries waits out its cool-down first.
   */
  #refresh(name: string, because: string): Promise<OAuthRow> {
    const running = this.#refreshing.get(name);
    if (running !== undefined) {
      return running;
    }
    const cooling = this.#cooling.get(name);
    if (cooling && cooling.until > Date.now()) {
      const later = Promise.reject(
        new NotNow(
          `This server's sign-in stands, but renewing it got ${cooling.why}; the hub tries again in ${Math.ceil((cooling.until - Date.now()) / 1000)} s. Retry the request then.`
        )
      );
      later.catch(() => undefined);
      return later;
    }
    const flight = this.#renew(name, because).finally(() =>
      this.#refreshing.delete(name)
    );
    flight.catch(() => undefined);
    this.#refreshing.set(name, flight);
    return flight;
  }

  /**
   * Renews the sign-in with its refresh token. No answer (the network, a 5xx,
   * a 429, the deadline) and any refusal but the two that end a sign-in are
   * tried again after {@link REFRESH_RETRIES_MS}, the sign-in kept whatever
   * comes back. Only `invalid_grant` or `invalid_token` from the token
   * endpoint ends it ({@link #end}), in the provider's words.
   */
  async #renew(name: string, because: string): Promise<OAuthRow> {
    const row = this.#db.getMcpOauth(name);
    const held = row?.tokens;
    if (!(row && held)) {
      throw new SignedOut("Signed out.");
    }
    const spent = held.refresh_token;
    const client = row.tokenClient;
    if (!(spent && client)) {
      this.#end(
        name,
        held,
        `The provider issued no refresh token, and ${because}.`
      );
      throw new SignedOut("Signed out.");
    }
    /** Tries that got no answer: a rotation the provider may have made then. */
    let unanswered = 0;
    let last = "";
    for (const wait of [...REFRESH_RETRIES_MS, null]) {
      const tried = await this.#try(row, client, spent);
      if ("kept" in tried) {
        return tried.kept;
      }
      if ("ended" in tried) {
        this.#end(name, held, endedWords(tried.ended, unanswered));
        throw new SignedOut("Signed out.");
      }
      unanswered += tried.unanswered ? 1 : 0;
      last = tried.failed;
      if (!this.#current(row)) {
        throw new NotNow(
          "This server changed while its sign-in was renewed. Retry the request."
        );
      }
      if (wait === null) {
        break;
      }
      console.warn(
        `[fleet-mcp] ${name}: renewing the sign-in got ${last}; the sign-in stands, and the hub tries again in ${wait / 1000} s`
      );
      await this.#lifetime.sleep(wait);
    }
    this.#coolDown(name, last);
    throw new NotNow(
      `This server's sign-in stands, but renewing it got ${last}. Retry the request.`
    );
  }

  /** A renewal that landed on none of its tries: the next waits, longer each time, the sign-in kept. */
  #coolDown(name: string, why: string): void {
    const round = (this.#cooling.get(name)?.round ?? -1) + 1;
    const pause = Math.min(
      REFRESH_COOL_FIRST_MS * 2 ** round,
      REFRESH_COOL_MAX_MS
    );
    this.#cooling.set(name, { round, until: Date.now() + pause, why });
    console.warn(
      `[fleet-mcp] ${name}: renewing the sign-in got ${why} on all ${REFRESH_RETRIES_MS.length + 1} tries; the sign-in stands, requests that need it are answered 502 to retry, and the hub tries again in ${pause / 1000} s`
    );
  }

  /**
   * One token request: the tokens kept, the refusal that ends the sign-in
   * in the provider's words, or a failure that leaves it standing.
   */
  async #try(
    row: OAuthRow,
    client: NonNullable<OAuthRow["tokenClient"]>,
    spent: string
  ): Promise<
    | { kept: OAuthRow }
    | { ended: string }
    | { failed: string; unanswered: boolean }
  > {
    const heard: { status: number | null } = { status: null };
    let tokens: NonNullable<OAuthRow["tokens"]>;
    try {
      tokens = await refreshAuthorization(row.issuer, {
        metadata: row.metadata,
        clientInformation: client,
        refreshToken: spent,
        resource: new URL(row.resource.resource),
        fetchFn: reachToken((status) => {
          heard.status = status;
        }),
      });
    } catch (error) {
      const words = refusalWords(error, heard.status);
      return error instanceof OAuthError && ENDING.has(error.errorCode)
        ? { ended: words }
        : { failed: words, unanswered: error instanceof Unreachable };
    }
    return { kept: this.#keep(row, spent, tokens) };
  }

  /**
   * A renewal's tokens, kept in one write: the new access token and the
   * refresh token that replaced the one spent, together, before any request
   * is handed either. A sign-in the person made meanwhile is the one kept.
   */
  #keep(
    row: OAuthRow,
    spent: string,
    tokens: NonNullable<OAuthRow["tokens"]>
  ): OAuthRow {
    const latest = this.#db.getMcpOauth(row.name);
    if (!(latest && this.#current(row))) {
      throw new NotNow(
        "This server changed while its sign-in was renewed. Retry the request."
      );
    }
    if (latest.tokens?.refresh_token !== spent) {
      if (latest.tokens) {
        return latest;
      }
      throw new SignedOut("Signed out.");
    }
    const kept: OAuthRow = {
      ...latest,
      tokens,
      expiresAt:
        tokens.expires_in === undefined
          ? null
          : new Date(Date.now() + tokens.expires_in * 1000),
      endedAt: null,
      endedWhy: null,
    };
    this.#db.putMcpOauth(kept);
    this.#issued.set(row.name, Date.now());
    this.#cooling.delete(row.name);
    console.info(
      `[fleet-mcp] ${row.name}: sign-in renewed${tokens.refresh_token === spent ? "" : ", its refresh token rotated"}${tokens.expires_in === undefined ? "" : `; the access token is good for ${tokens.expires_in} s`}`
    );
    return kept;
  }

  /**
   * Ends the sign-in `held` names, never one made since: its tokens go,
   * and why is kept for the person ({@link #told}).
   */
  #end(name: string, held: NonNullable<OAuthRow["tokens"]>, why: string): void {
    const latest = this.#db.getMcpOauth(name);
    if (
      !latest?.tokens ||
      latest.tokens.access_token !== held.access_token ||
      latest.tokens.refresh_token !== held.refresh_token
    ) {
      return;
    }
    const at = new Date();
    this.#db.putMcpOauth({
      ...latest,
      tokens: null,
      expiresAt: null,
      endedAt: at,
      endedWhy: why,
    });
    this.#relay.reset(name);
    this.#told(name, at, why);
  }

  /**
   * A sign-in ended without the person: said in the hub's log with why,
   * every machine's sessions told (the fleet's change), and the person
   * told (a Needs you item from `auth.ended`, and a push).
   */
  #told(name: string, at: Date, why: string): void {
    this.#issued.delete(name);
    this.#cooling.delete(name);
    console.warn(
      `[fleet-mcp] ${name}: the sign-in ended: ${why} Its tools are off in every session until someone signs in again from ${configurePage("mcp")}.`
    );
    this.#changed();
    this.#ports.ended({ name, at, why });
  }

  /**
   * The row whose access token a request sends: as it stands while it has
   * more than {@link REFRESH_AHEAD_MS} left; renewed behind the request
   * while it still has {@link EXPIRY_MARGIN_MS}; else after the renewal.
   */
  async #usable(name: string): Promise<OAuthRow> {
    const row = this.#db.getMcpOauth(name);
    if (!row?.tokens) {
      throw new SignedOut("Signed out.");
    }
    const left = row.expiresAt
      ? row.expiresAt.getTime() - Date.now()
      : Number.POSITIVE_INFINITY;
    if (left > REFRESH_AHEAD_MS) {
      return row;
    }
    const renewed = this.#refresh(name, "its access token expired");
    if (left > EXPIRY_MARGIN_MS) {
      return row;
    }
    return await this.#waited(renewed);
  }

  /**
   * The upstream refused `token` (`words`, its own): the token renewed since
   * is sent instead; else the refresh, one per server. A token issued
   * moments ago is not renewed again ({@link FRESH_TOKEN_MS}).
   */
  async #refused(
    name: string,
    token: string,
    words: string
  ): Promise<OAuthRow> {
    const latest = this.#db.getMcpOauth(name);
    if (!latest?.tokens) {
      throw new SignedOut("Signed out.");
    }
    if (latest.tokens.access_token !== token) {
      return latest;
    }
    const issued = this.#issued.get(name);
    if (
      !this.#refreshing.has(name) &&
      issued !== undefined &&
      Date.now() - issued < FRESH_TOKEN_MS
    ) {
      console.warn(
        `[fleet-mcp] ${name}: the server refused an access token issued ${Math.round((Date.now() - issued) / 1000)} s ago (${words}); the sign-in stands, and the request is answered 502 to retry`
      );
      throw new NotNow(
        `The server refused the sign-in's new access token (${words}). Retry the request.`
      );
    }
    return await this.#waited(
      this.#refresh(name, `the server refused its access token (${words})`)
    );
  }

  /** A refresh, waited on for at most {@link REFRESH_WAIT_MS}; it goes on past that. */
  async #waited(renewal: Promise<OAuthRow>): Promise<OAuthRow> {
    const waited = await readWithin(REFRESH_WAIT_MS, () => renewal);
    if (waited.kind === "answered") {
      return waited.value;
    }
    throw new NotNow(
      "This server's sign-in is being renewed and the provider has not answered yet. Retry the request."
    );
  }

  /**
   * One request to the upstream as the hub's sign-in: its bearer, renewed
   * near expiry or once refused. A second refusal fails the request, never
   * the sign-in. The relay's gate stands in front of every call here.
   */
  async #upstream(name: string, exchange: Exchange): Promise<Response> {
    const server = this.#server(name);
    const call = (using: OAuthRow) => {
      const upstream = new URL(using.upstream);
      upstream.search = exchange.search || upstream.search;
      const headers = new Headers(
        "url" in server.config ? server.config.headers : undefined
      );
      for (const [header, value] of exchange.headers) {
        headers.set(header, value);
      }
      headers.set(
        "Authorization",
        `Bearer ${using.tokens?.access_token ?? ""}`
      );
      return fetch(upstream, {
        method: exchange.method,
        body: exchange.body,
        headers,
        signal: exchange.signal,
        redirect: "error",
      });
    };
    let row = await this.#usable(name);
    let response = await call(row);
    if (response.status !== 401) {
      return response;
    }
    const refusal = bearerWords(response);
    await response.body?.cancel();
    row = await this.#refused(name, row.tokens?.access_token ?? "", refusal);
    response = await call(row);
    if (response.status === 401) {
      const again = bearerWords(response);
      await response.body?.cancel();
      console.warn(
        `[fleet-mcp] ${name}: the server refused the sign-in's renewed access token too (${again}); the sign-in stands, and the request is answered 502 to retry`
      );
      throw new NotNow(
        `The server refused the sign-in's access token (${again}). Retry the request.`
      );
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
    } catch (error) {
      if (!this.#db.getMcpOauth(name)?.tokens) {
        return signedOut();
      }
      return new Response(
        error instanceof NotNow
          ? error.message
          : "The upstream MCP server could not be reached. Retry the request.",
        { status: 502 }
      );
    }
  }
}
