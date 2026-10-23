/**
 * Connections (Projects spec §3, §5.5): outside services the hub signs in to
 * and calls. A connection is one named row (`github-petra`, `x-brand`); two
 * accounts of one service are two rows, never merged.
 *
 * THE INVARIANT: a connection's credential lives only in the hub. Its key, or
 * its OAuth tokens, are sealed in the row (secret-box.ts) and opened only
 * here, to build the one request or the one stdio process that carries them.
 * Nothing a session reads holds them: a session whose delegate type or
 * project lists a connection is listed its tools as `conn__<name>__<tool>` on
 * CawCo's own MCP server, and every call to one runs here, as the hub. A key
 * the upstream echoes back is cut out of what the session is answered.
 *
 * One call path for every caller: sessions ({@link Connections.callAs}),
 * and hub code (the connector poller) through
 * {@link Connections.callConnection} and {@link Connections.listConnectionTools};
 * an approved action's one call through {@link Connections.callOnce}.
 * The GitHub poller, the relay's webhooks, `create_repo` and the tracker
 * sync speak each service's own API through its official SDK, and are
 * handed a client signed in here ({@link Connections.githubClient},
 * {@link Connections.linearClient}), never the key.
 *
 * OAuth is the MCP authorization flow the SDK runs (`auth()`: discovery,
 * registration, PKCE, exchange, refresh) over a provider whose storage is the
 * row: the redirect lands on the hub (`/api/connections/oauth/callback`), and
 * a 401 on a call refreshes the tokens here before the call is retried.
 *
 * An `app` connection is an app the owner registered, acting as itself. A
 * GitHub App's private key mints its installation's token, an hour long,
 * which Octokit's app auth caches and renews ("The SDK will take care of
 * generating an installation access token for you and will regenerate the
 * token once it expires", docs.github.com); GitHub's MCP server takes it as
 * a bearer (github/github-mcp-server#696: "You can now use `ghs_` tokens to
 * authorize against remote MCP server"). A Linear app signs in through
 * Linear's own OAuth with `actor=app`, its 24-hour access token refreshed
 * here and its rotated refresh token kept; Linear's MCP server takes the
 * token as a bearer ("You can use this to interact with the MCP server as an
 * `app` user", linear.app/docs/mcp).
 */
import { createHash, createPrivateKey } from "node:crypto";
import {
  APP_SERVICES,
  type AppService,
  CONNECTION_AUTHS,
  CONNECTION_NAME,
  CONNECTION_TRANSPORTS,
  type ConnectionApp,
  type ConnectionAuth,
  type ConnectionTransport,
  type ConnectionView,
  connectionsWords,
  connectionToolName,
  type InstanceRow,
  parseConnectionTool,
  pushOnlyProvider,
} from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import { LinearClient } from "@linear/sdk";
import {
  auth,
  exchangeAuthorization,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  refreshAuthorization,
  startAuthorization,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  SSEClientTransport,
  SseError,
} from "@modelcontextprotocol/sdk/client/sse.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  type CallToolResult,
  ErrorCode,
  McpError,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { Elysia, status, t } from "elysia";
import { readsOnly } from "./connection-writes";
import type { ConnectionRow, ConnectionsDb } from "./db/connections";
import type { ConnectionAppSecret, ConnectionSecret } from "./db/schema";
import { undoable } from "./db/trash";
import { hidden } from "./hidden";
import type { HubLifetimeShape } from "./lifetime";
import { connectionToolsFor, roleOf } from "./roles";
import { GITHUB_API, LINEAR_API } from "./upstreams";

/** Where an OAuth sign-in's redirect lands: on the hub, never a session. */
export const CONNECTION_CALLBACK_PATH = "/api/connections/oauth/callback";

/**
 * What a Linear app asks for: "`read` … This scope will always be present";
 * "`write` - Write access", which a task's stage, title and labels moving
 * on Linear need (`issues:create` "Allows creating new issues" and no more),
 * and which takes in `issues:create` and `comments:create`
 * (linear.app/developers/oauth-2-0-authentication).
 */
export const LINEAR_APP_SCOPE = "read,write";

/**
 * Linear's OAuth server, as the MCP SDK's token helpers read one: the
 * authorize page, the token endpoint, PKCE ("Linear supports the PKCE
 * flow"), and the client's id and secret in the form body ("Pass parameters
 * in body … `client_id`, `client_secret`"), as Linear's docs write them.
 */
const linearOAuth = () => ({
  issuer: "https://linear.app",
  authorization_endpoint: "https://linear.app/oauth/authorize",
  token_endpoint: `${LINEAR_API}/oauth/token`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["client_secret_post"],
});

/** A Linear access token is refreshed this long before it runs out. Our choice. */
const LINEAR_REFRESH_EARLY_MS = 5 * 60_000;
/** An app connection's MCP client is let go this long before its token runs out. Our choice. */
const APP_TOKEN_EARLY_MS = 60_000;
const PEM_BLOCK =
  /-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/;
const BASE64 = /^[A-Za-z0-9+/=]+$/;
const WHITESPACE = /\s+/g;
const PEM_LINE = /.{1,64}/g;
const DIGITS = /^\d{1,20}$/;

/**
 * A private key as PKCS#8 PEM, however it was pasted: a password field
 * takes it on one line, its line breaks spaces, and a copy from an env file
 * carries literal `\n`s; its body goes back on 64-character lines. GitHub
 * hands out PKCS#1 (`BEGIN RSA PRIVATE KEY`), which the app JWT's WebCrypto
 * signer refuses ("only PKCS#8 is supported", universal-github-app-jwt), so
 * it is kept as PKCS#8. Undefined when it is no private key that reads.
 */
const pemOf = (text: string): string | undefined => {
  const [, kind, raw] = PEM_BLOCK.exec(text.replaceAll("\\n", "\n")) ?? [];
  const body = raw?.replace(WHITESPACE, "") ?? "";
  if (!(kind && BASE64.test(body))) {
    return;
  }
  const pem = `-----BEGIN ${kind}-----\n${(body.match(PEM_LINE) ?? []).join("\n")}\n-----END ${kind}-----\n`;
  try {
    return createPrivateKey(pem)
      .export({ type: "pkcs8", format: "pem" })
      .toString();
  } catch {
    // Not a key that reads: no private key.
  }
};
/** A GitHub App's id: its number, or its client id (`Iv23li…`), which "may also be used and is recommended" (octokit/auth-app.js). */
const GITHUB_APP_ID = /^(?:\d{1,20}|Iv[0-9A-Za-z.]{4,40})$/;

/** How long a sign-in waits for its redirect. Our choice, as fleet MCP's. */
const SIGN_IN_MS = 10 * 60_000;
/** A connect and a listing. Our choice. */
const CONNECT_MS = 30_000;
/** One tool call, from when it is sent. Our choice. */
const CALL_MS = 5 * 60_000;
/**
 * The MCP SDK times every request out itself (60 s when not given,
 * `DEFAULT_REQUEST_TIMEOUT_MSEC`), with an McpError that reads as the
 * server's answer. Each request here is given readWithin's signal and this,
 * the longest timer a JavaScript clock holds, so readWithin alone decides.
 */
const SDK_CLOCK_OFF = 2 ** 31 - 1;

const HEADER_NAME = /^[A-Za-z0-9-]+$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Headers the transport owns, which a key may not take the place of. */
const RESERVED_HEADERS = new Set([
  "accept",
  "content-type",
  "content-length",
  "host",
  "mcp-session-id",
  "mcp-protocol-version",
  "last-event-id",
]);

/** What a connection is made from, and what an update may change (never its name). */
export interface ConnectionInput {
  account: string;
  args?: string[];
  auth: ConnectionAuth;
  command?: string;
  header?: string;
  name: string;
  /** Projects whose every session may use it. */
  projects?: string[];
  service: string;
  transport: ConnectionTransport;
  url?: string;
}

/** A connection's tool as a session's `tools/list` carries it. */
export interface SessionTool {
  annotations?: Tool["annotations"];
  description: string;
  inputSchema: Tool["inputSchema"];
  name: string;
}

export interface ConnectionsDeps {
  /** Something a session's tool list depends on moved. */
  readonly changed: () => void;
  readonly db: ConnectionsDb;
  /** The origin a sign-in's redirect uses when its caller names none. */
  readonly hubOrigin: () => string;
  readonly lifetime: HubLifetimeShape;
  readonly projectExists: (id: string) => boolean;
  /**
   * A push-only service's connection (core `pushOnlyProvider`) reached
   * `projects` signed in: it signed in while they had it, or they were
   * granted it while signed in. Each is told once per such moment (server.ts
   * wakes its Caw to offer a relay).
   */
  readonly pushOnlyConnected: (
    connection: ConnectionView,
    projects: string[]
  ) => void;
  /**
   * Moves a connection, its projects with it, into the hub's trash for its
   * Undo (db/trash.ts); the entry's id, or undefined for no such connection.
   */
  readonly trash: (name: string) => number | undefined;
  /** The connections the delegate type a session runs as lists. */
  readonly typeConnections: (row: InstanceRow) => readonly string[];
  /**
   * The upstream guard on a session's call (server.ts, upstream-asks.ts): a
   * forge connection's write tool to another person's repository is refused
   * (off) or held for the person (ask), and this answers the session instead
   * of the call; undefined when the call goes ahead.
   */
  readonly upstream: (
    actor: InstanceRow,
    connection: Pick<ConnectionRow, "account" | "name" | "service" | "url">,
    tool: Tool,
    args: Record<string, unknown>
  ) => CallToolResult | undefined;
}

const problem = (message: string): never => {
  throw new ConnectionProblem(message);
};

/** A refusal in words, for the caller: a route answers it as a 400. */
export class ConnectionProblem extends Error {}

/** Why a stdio connection cannot be made, or nothing when it can. */
const stdioProblem = (input: ConnectionInput): string | undefined => {
  if (!input.command?.trim() || input.url) {
    return "A stdio connection names the command the hub runs, and no url.";
  }
  if (input.auth === "bearer" || input.auth === "oauth") {
    return "A stdio connection takes its key in an environment variable: auth none or header.";
  }
  if (input.auth === "header" && !ENV_NAME.test(input.header ?? "")) {
    return "header names the environment variable the key goes in, like GITHUB_TOKEN.";
  }
  return undefined;
};

/** Why an http or sse connection cannot be made, or nothing when it can. */
const httpProblem = (input: ConnectionInput): string | undefined => {
  if (input.command || input.args?.length) {
    return "An http or sse connection names a url, and no command.";
  }
  let url: URL;
  try {
    url = new URL(input.url ?? "");
  } catch {
    return "An http or sse connection needs the server's URL.";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "The server's URL is http or https.";
  }
  const header = input.header ?? "";
  if (
    input.auth === "header" &&
    !(HEADER_NAME.test(header) && !RESERVED_HEADERS.has(header.toLowerCase()))
  ) {
    return "header names the request header the key goes in, like X-Api-Key.";
  }
  return undefined;
};

/** The service an `app` connection is for, from its row's words; undefined for any other. */
export const appServiceOf = (service: string): AppService | undefined =>
  APP_SERVICES.find((each) => each === service.trim().toLowerCase());

/** Why `input` cannot be a connection, or nothing when it can. */
const inputProblem = (input: ConnectionInput): string | undefined => {
  if (!CONNECTION_NAME.test(input.name)) {
    return "A connection's name is up to 24 lowercase letters, digits and hyphens, like github-petra.";
  }
  if (!(input.service.trim() && input.account.trim())) {
    return "A connection names its service and which account of it it is.";
  }
  if (!CONNECTION_TRANSPORTS.includes(input.transport)) {
    return `transport is one of ${CONNECTION_TRANSPORTS.join(", ")}.`;
  }
  if (!CONNECTION_AUTHS.includes(input.auth)) {
    return `auth is one of ${CONNECTION_AUTHS.join(", ")}.`;
  }
  if (
    input.auth === "app" &&
    !(appServiceOf(input.service) && input.transport === "http")
  ) {
    return "An app connection is a GitHub App or a Linear app: its service is github or linear, reached over http.";
  }
  return input.transport === "stdio" ? stdioProblem(input) : httpProblem(input);
};

/**
 * A Linear client signed in as a connection, made for one request: its
 * signal, when given, goes with each fetch, so a request let go is aborted.
 */
export type LinearClientFor = (signal?: AbortSignal) => LinearClient;

/** An app's registration as the person gives it, for {@link Connections.setApp}. */
export type AppInput =
  | { appId: string; installationId: string; privateKey: string }
  | { clientId: string; clientSecret: string };

/** `input` as `service`'s registration, or why it is not one. */
const appOf = (
  service: AppService,
  input: AppInput
): ConnectionAppSecret | string => {
  if (service === "github") {
    if (!("appId" in input)) {
      return "A GitHub App is set with its app id, its installation id and its private key.";
    }
    const appId = input.appId.trim();
    const installationId = input.installationId.trim();
    const privateKey = pemOf(input.privateKey);
    if (!GITHUB_APP_ID.test(appId)) {
      return "The app id is the number on the GitHub App's settings page, or its client id (Iv…).";
    }
    if (!DIGITS.test(installationId)) {
      return "The installation id is the number at the end of the installation's settings URL (…/installations/12345678).";
    }
    if (!privateKey || privateKey.length > 8192) {
      return "The private key is the .pem file the GitHub App's settings generate, -----BEGIN … PRIVATE KEY----- and all.";
    }
    return { service, appId, installationId, privateKey };
  }
  if (!("clientId" in input)) {
    return "A Linear app is set with its client id and client secret.";
  }
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (
    !(clientId && clientSecret) ||
    `${clientId}${clientSecret}`.length > 512
  ) {
    return "A Linear app is set with the client id and client secret its settings page shows.";
  }
  return { service, clientId, clientSecret };
};

/** What names an app, for a view: never its private key or client secret. */
const appView = (app: ConnectionAppSecret): ConnectionApp =>
  app.service === "github"
    ? {
        service: app.service,
        appId: app.appId,
        installationId: app.installationId,
      }
    : { service: app.service, clientId: app.clientId };

/** An update laid over a row: what the connection would be. */
const merged = (
  r: ConnectionRow,
  patch: Partial<Omit<ConnectionInput, "name">>
): ConnectionInput => ({
  name: r.name,
  service: patch.service ?? r.service,
  account: patch.account ?? r.account,
  transport: patch.transport ?? r.transport,
  url: patch.url ?? r.url ?? undefined,
  command: patch.command ?? r.command ?? undefined,
  args: patch.args ?? r.args ?? undefined,
  auth: patch.auth ?? r.auth,
  header: patch.header ?? r.header ?? undefined,
});

/** Where a connection points and how it signs in: what its secret was given for. */
const whereOf = (one: {
  args?: string[] | null;
  auth: ConnectionAuth;
  command?: string | null;
  header?: string | null;
  transport: ConnectionTransport;
  url?: string | null;
}) => ({
  transport: one.transport,
  url: one.url ?? null,
  command: one.command ?? null,
  args: one.args?.length ? one.args : null,
  auth: one.auth,
  header: one.header ?? null,
});

/** What a row lets go of when it moves: its secret, discovery and any sign-in. */
const LET_GO = {
  secret: null,
  discovery: null,
  signInState: null,
  signInRedirect: null,
  signInExpiresAt: null,
  signInUrl: null,
  tokensExpireAt: null,
} as const;

/**
 * Whether an error says the server no longer knows the client's session:
 * Streamable HTTP's 404 on a request that carries a session id ("the client
 * MUST start a new session"), which the server answered without running it.
 */
const sessionGone = (error: unknown): boolean =>
  error instanceof StreamableHTTPError && error.code === 404;

/**
 * The longest tool name a session's harness may be given, with the prefix
 * Claude Code puts on CawCo's tools counted. Anthropic's tool definitions:
 * the name "Must match the regex `^[a-zA-Z0-9_-]{1,64}$`"
 * (docs.anthropic.com/en/docs/build-with-claude/tool-use/implement-tool-use);
 * one that does not fails the whole request with a 400 ("tools.15.custom.name:
 * String should match pattern", github.com/anthropics/claude-code/issues/985).
 */
const TOOL_NAME_MAX = 64;
const HARNESS_PREFIX = "mcp__cawco__";
const TOOL_NAME_SAFE = /^[A-Za-z0-9_-]+$/;
const TOOL_NAME_UNSAFE = /[^A-Za-z0-9_-]/g;
/** Hex characters of the real name's hash an alias ends with. */
const ALIAS_HASH = 6;

/**
 * The name a session is listed a connection's tool by: `conn__<name>__<tool>`
 * when that fits a harness's rule; else the tool's name made safe, cut to
 * fit, and ended with a hash of the real name, so it stays one name per
 * tool. A session calls only what it was listed, so the hub reads the real
 * name back through its listing.
 */
export const sessionToolName = (connection: string, tool: string): string => {
  const plain = connectionToolName(connection, tool);
  if (
    TOOL_NAME_SAFE.test(tool) &&
    HARNESS_PREFIX.length + plain.length <= TOOL_NAME_MAX
  ) {
    return plain;
  }
  const hash = createHash("sha256")
    .update(tool)
    .digest("hex")
    .slice(0, ALIAS_HASH);
  const room =
    TOOL_NAME_MAX -
    HARNESS_PREFIX.length -
    connectionToolName(connection, "").length -
    ALIAS_HASH -
    1;
  return connectionToolName(
    connection,
    `${tool.replace(TOOL_NAME_UNSAFE, "_").slice(0, room)}_${hash}`
  );
};

/** Whether an error says the service refused the held key or sign-in. */
const refusedSignIn = (error: unknown): boolean =>
  error instanceof UnauthorizedError ||
  ((error instanceof StreamableHTTPError || error instanceof SseError) &&
    (error.code === 401 || error.code === 403));

const NO_SECRET = "the hub holds no key for it";

export const createConnections = (deps: ConnectionsDeps) => {
  const { db } = deps;
  /** Each connection's live client, by row id; a connect shared by concurrent calls. */
  const clients = new Map<string, Promise<Bounded<Client>>>();
  /** Each connection's tools as it last listed them, by row id. */
  const listed = new Map<string, Tool[]>();

  const row = (name: string): ConnectionRow =>
    db.byName(name) ?? problem(`There is no connection ${name}.`);

  /**
   * A row's secret, as its sealed column opened it. One the hub's key cannot
   * open reads as none (db/schema.ts `sealedJson`), so the connection asks
   * for its key or sign-in again rather than every listing failing.
   */
  const opened = (r: ConnectionRow): ConnectionSecret => r.secret ?? {};

  /** Changes a row's secret, read fresh: an OAuth step and a refresh may interleave. */
  const reseal = (
    id: string,
    change: (secret: ConnectionSecret) => ConnectionSecret
  ) => {
    const fresh = db.byId(id);
    if (!fresh) {
      return;
    }
    const kept = Object.fromEntries(
      Object.entries(change(opened(fresh))).filter(
        ([, value]) => value !== undefined
      )
    ) as ConnectionSecret;
    db.update(id, { secret: Object.keys(kept).length > 0 ? kept : null });
  };

  /** Every secret string a row holds: what is cut out of anything a session is answered. */
  const secretsOf = (r: ConnectionRow): string[] => {
    const sealed = opened(r);
    return [
      sealed.key,
      sealed.tokens?.access_token,
      sealed.tokens?.refresh_token,
      sealed.client?.client_secret,
      sealed.app?.service === "github" ? sealed.app.privateKey : undefined,
      sealed.app?.service === "linear" ? sealed.app.clientSecret : undefined,
    ].filter((one): one is string => typeof one === "string" && one.length > 0);
  };

  /** Keeps a sign-in's tokens, and when the access token runs out as their response said. */
  const keepTokens = (id: string, tokens: OAuthTokens) => {
    reseal(id, (sealed) => ({ ...sealed, tokens }));
    db.update(id, {
      tokensExpireAt:
        tokens.expires_in === undefined
          ? null
          : new Date(Date.now() + tokens.expires_in * 1000),
    });
  };

  /**
   * Each GitHub App connection's Octokit, by row id, with the registration
   * it was made from: the installation token it mints lives in it, cached
   * and renewed by its app auth, so it is made again only when that moves.
   */
  const githubApps = new Map<string, { made: string; octokit: Octokit }>();

  const githubAppOctokit = (
    r: ConnectionRow,
    app: Extract<ConnectionAppSecret, { service: "github" }>
  ): Octokit => {
    const made = createHash("sha256")
      .update(JSON.stringify([app, GITHUB_API]))
      .digest("hex");
    const held = githubApps.get(r.id);
    if (held?.made === made) {
      return held.octokit;
    }
    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: app.appId,
        installationId: Number(app.installationId),
        privateKey: app.privateKey,
      },
      baseUrl: GITHUB_API,
      userAgent: "CawCo-hub",
    });
    githubApps.set(r.id, { made, octokit });
    return octokit;
  };

  /** A Linear app's refresh under way, by row id: two callers share one. */
  const refreshing = new Map<string, Promise<string>>();

  /**
   * A Linear app's access token, refreshed when it is near its end. Linear
   * hands back a new refresh token with each ("Requests to consume a refresh
   * token and obtain a new one"), which is kept at once; a refused refresh
   * marks the connection needs-sign-in, in Linear's words.
   */
  const linearAccess = (r: ConnectionRow): Promise<string> => {
    const sealed = opened(r);
    const { app, tokens } = sealed;
    if (app?.service !== "linear") {
      return Promise.reject(
        new ConnectionProblem(
          `${r.name} needs its Linear app: set its client id and client secret.`
        )
      );
    }
    if (!tokens) {
      return Promise.reject(
        new ConnectionProblem(
          `${r.name} is not signed in: ${r.reason ?? connectionsWords.saidSignIn}`
        )
      );
    }
    if (
      !r.tokensExpireAt ||
      r.tokensExpireAt.getTime() > Date.now() + LINEAR_REFRESH_EARLY_MS
    ) {
      return Promise.resolve(tokens.access_token);
    }
    const under = refreshing.get(r.id);
    if (under !== undefined) {
      return under;
    }
    const refreshToken = tokens.refresh_token;
    const refresh = (async () => {
      if (!refreshToken) {
        setState(r, "needs-sign-in", "Its sign-in ran out. Sign in again.");
        return problem(`${r.name}'s sign-in ran out. Sign in again.`);
      }
      try {
        const fresh = await refreshAuthorization(LINEAR_API, {
          metadata: linearOAuth(),
          clientInformation: {
            client_id: app.clientId,
            client_secret: app.clientSecret,
          },
          refreshToken,
        });
        keepTokens(r.id, fresh);
        drop(r.id);
        return fresh.access_token;
      } catch (error) {
        const said = scrub(
          r,
          error instanceof Error ? error.message : String(error)
        ).slice(0, 300);
        setState(
          r,
          "needs-sign-in",
          `Linear refused to refresh its sign-in (${said}). Sign in again.`
        );
        // biome-ignore lint/style/useErrorCause: the token response may carry tokens; only scrubbed words go on
        throw new ConnectionProblem(
          `${r.name}: Linear refused to refresh its sign-in (${said}). Sign in again.`
        );
      }
    })();
    refreshing.set(r.id, refresh);
    const done = () => refreshing.delete(r.id);
    refresh.then(done, done);
    return refresh;
  };

  /** Each app connection's MCP client's token, when it runs out, ms: the client is let go before. */
  const appExpiry = new Map<string, number>();

  /**
   * An app connection's token and when it runs out: a GitHub App's
   * installation token (minted, or the one its Octokit holds), or a Linear
   * app's access token. GitHub's refusal of the app marks the connection
   * needs-sign-in, in GitHub's words.
   */
  const appToken = async (
    r: ConnectionRow
  ): Promise<{ expiresAt: number; token: string }> => {
    const { app } = opened(r);
    if (!app) {
      setState(r, "needs-sign-in", connectionsWords.saidSetApp);
      return problem(`${r.name} needs its app: ${NO_SECRET}.`);
    }
    if (app.service === "linear") {
      const token = await linearAccess(r);
      const fresh = db.byId(r.id);
      return {
        token,
        expiresAt: fresh?.tokensExpireAt?.getTime() ?? Number.POSITIVE_INFINITY,
      };
    }
    try {
      const minted = (await githubAppOctokit(r, app).auth({
        type: "installation",
      })) as { expiresAt: string; token: string };
      return { token: minted.token, expiresAt: Date.parse(minted.expiresAt) };
    } catch (error) {
      const said = scrub(
        r,
        error instanceof Error ? error.message : String(error)
      ).slice(0, 300);
      setState(
        r,
        "needs-sign-in",
        `GitHub refused the app's token (${said}). Set its app again.`
      );
      // biome-ignore lint/style/useErrorCause: GitHub's error may echo the JWT; only scrubbed words go on
      throw new ConnectionProblem(
        `${r.name}: GitHub refused the app's token (${said}). Set its app again.`
      );
    }
  };

  /** `text` with each of the row's secrets replaced. */
  const scrub = (r: ConnectionRow, text: string): string =>
    secretsOf(r).reduce(
      (out, secret) => out.split(secret).join("[connection key]"),
      text
    );

  const view = (r: ConnectionRow): ConnectionView => {
    const sealed = opened(r);
    const tools = listed.get(r.id);
    return {
      id: r.id,
      name: r.name,
      service: r.service,
      account: r.account,
      transport: r.transport,
      ...(r.url ? { url: r.url } : {}),
      ...(r.command ? { command: r.command } : {}),
      ...(r.args?.length ? { args: r.args } : {}),
      auth: r.auth,
      ...(sealed.app ? { app: appView(sealed.app) } : {}),
      ...(r.header ? { header: r.header } : {}),
      state: r.state,
      ...(r.reason ? { reason: r.reason } : {}),
      ...(r.signInUrl &&
      r.signInState &&
      r.signInExpiresAt &&
      r.signInExpiresAt.getTime() > Date.now()
        ? {
            signIn: {
              url: r.signInUrl,
              expiresAt: r.signInExpiresAt.getTime(),
            },
          }
        : {}),
      hasSecret: Boolean(sealed.key || sealed.tokens || sealed.app),
      projects: db.projectsOf(r.id),
      ...(tools ? { tools: tools.map((tool) => tool.name) } : {}),
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
    };
  };

  const setState = (
    r: ConnectionRow,
    state: ConnectionRow["state"],
    reason: string | null
  ) => {
    const fresh = db.byName(r.name);
    if (!fresh || (fresh.state === state && fresh.reason === reason)) {
      return;
    }
    db.update(r.id, { state, reason });
    console.info(
      `[connections] ${r.name}: ${state}${reason ? ` (${reason})` : ""}`
    );
    deps.changed();
  };

  /** Closes and forgets a connection's client: its next call connects again. */
  const drop = (id: string) => {
    const client = clients.get(id);
    clients.delete(id);
    if (client !== undefined) {
      detach(
        client
          .then((connected) => {
            switch (connected.kind) {
              case "answered":
                return connected.value.close();
              case "unanswered":
                // It never connected: the SDK closed it when it was let go.
                return;
              default: {
                const unhandled: never = connected;
                throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
              }
            }
          })
          .catch(() => undefined),
        "connection client close"
      );
    }
  };

  /** The redirect a row's OAuth client uses: its sign-in's, else the hub's own. */
  const redirectOf = (r: ConnectionRow): string =>
    r.signInRedirect ?? `${deps.hubOrigin()}${CONNECTION_CALLBACK_PATH}`;

  /**
   * The SDK's OAuth storage, over the row. `signIn`: the one sign-in under
   * way, whose verifier, state and authorization URL it keeps; without it (a
   * call's refresh), a flow that would need the person instead marks the row
   * needs-sign-in and keeps nothing.
   */
  const provider = (
    id: string,
    signIn?: { state: string; opened: (url: URL) => void }
  ): OAuthClientProvider => {
    const fresh = () => db.byId(id) ?? problem("This connection was removed.");
    return {
      get redirectUrl() {
        return redirectOf(fresh());
      },
      get clientMetadata() {
        return {
          client_name: `CawCo hub (${fresh().name})`,
          redirect_uris: [redirectOf(fresh())],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        };
      },
      state: () => signIn?.state ?? crypto.randomUUID(),
      clientInformation: () => opened(fresh()).client,
      saveClientInformation: (client) =>
        reseal(id, (sealed) => ({ ...sealed, client })),
      tokens: () => opened(fresh()).tokens,
      saveTokens: (tokens) => keepTokens(id, tokens),
      saveCodeVerifier: (verifier) => {
        if (signIn) {
          reseal(id, (sealed) => ({ ...sealed, verifier }));
        }
      },
      codeVerifier: () =>
        opened(fresh()).verifier ??
        problem("This sign-in has no verifier. Start sign-in again."),
      redirectToAuthorization: (url) => {
        if (signIn) {
          signIn.opened(url);
          return;
        }
        setState(
          fresh(),
          "needs-sign-in",
          "Its sign-in ran out. Sign in again."
        );
      },
      discoveryState: () => fresh().discovery ?? undefined,
      saveDiscoveryState: (state: OAuthDiscoveryState) =>
        db.update(id, { discovery: state }),
      invalidateCredentials: (scope) => forget(id, scope),
    };
  };

  /** What the SDK lets go of when the server says a credential is bad. */
  const forget = (
    id: string,
    scope: "all" | "client" | "tokens" | "verifier" | "discovery"
  ) => {
    if (scope === "discovery") {
      db.update(id, { discovery: null });
      return;
    }
    const all = scope === "all";
    reseal(id, (sealed) => ({
      ...sealed,
      ...(all || scope === "client" ? { client: undefined } : {}),
      ...(all || scope === "tokens" ? { tokens: undefined } : {}),
      ...(all || scope === "verifier" ? { verifier: undefined } : {}),
    }));
  };

  /** The request headers that carry a `bearer` or `header` row's key. */
  const keyHeaders = (r: ConnectionRow, key: string | undefined) => {
    if (!key) {
      return {};
    }
    if (r.auth === "bearer") {
      return { Authorization: `Bearer ${key}` };
    }
    return r.auth === "header" && r.header ? { [r.header]: key } : {};
  };

  /** The transport that reaches a row's server, carrying its key, or for an app the token `bearer` names. */
  const transportOf = (r: ConnectionRow, bearer?: string): Transport => {
    const sealed = opened(r);
    if ((r.auth === "bearer" || r.auth === "header") && !sealed.key) {
      setState(r, "needs-sign-in", connectionsWords.saidSetKey);
      problem(`${r.name} needs its key: ${NO_SECRET}.`);
    }
    if (r.transport === "stdio") {
      return new StdioClientTransport({
        command: r.command ?? "",
        args: r.args ?? [],
        // The SDK's short list (HOME, PATH, …), never the hub's own environment.
        env: { ...getDefaultEnvironment(), ...keyHeaders(r, sealed.key) },
        stderr: "ignore",
      });
    }
    const options = {
      requestInit: {
        headers: bearer
          ? { Authorization: `Bearer ${bearer}` }
          : keyHeaders(r, sealed.key),
        redirect: "error" as const,
      },
      ...(r.auth === "oauth" ? { authProvider: provider(r.id) } : {}),
    };
    const url = new URL(r.url ?? "");
    return r.transport === "sse"
      ? new SSEClientTransport(url, options)
      : new StreamableHTTPClientTransport(url, options);
  };

  const connect = async (r: ConnectionRow): Promise<Bounded<Client>> => {
    // An access token past its time is refreshed before it is sent.
    // A refresh that would need the person has marked the row; nothing is sent.
    if (
      r.auth === "oauth" &&
      r.tokensExpireAt &&
      r.tokensExpireAt.getTime() <= Date.now() + 60_000 &&
      (await auth(provider(r.id), { serverUrl: r.url ?? "" })) !== "AUTHORIZED"
    ) {
      problem(
        `${r.name} is not signed in: its sign-in ran out. Sign in again.`
      );
    }
    const client = new Client(
      { name: "CawCo hub", version: "1.0.0" },
      {
        // The server's own word that its tools changed re-lists them here,
        // so sessions' lists follow it.
        listChanged: {
          tools: {
            onChanged: (error, tools) => {
              if (!error && tools) {
                keepListing(r.id, tools);
              }
            },
          },
        },
      }
    );
    return readWithin(CONNECT_MS, async (signal) => {
      // An app's token is minted or refreshed within the same time.
      const bearer = r.auth === "app" ? await appToken(r) : undefined;
      if (bearer) {
        appExpiry.set(r.id, bearer.expiresAt);
      }
      const transport = transportOf(r, bearer?.token);
      // The SDK's own clock (60 s unless given) never decides: readWithin does.
      await client.connect(transport, { signal, timeout: SDK_CLOCK_OFF });
      return client;
    });
  };

  /**
   * A connection's client, connected once and shared; forgotten when its
   * transport closes, or when it did not connect in time. An app's client
   * is let go before its token runs out, and the next connects with a new.
   */
  const clientOf = (r: ConnectionRow): Promise<Bounded<Client>> => {
    if (
      (appExpiry.get(r.id) ?? Number.POSITIVE_INFINITY) <=
      Date.now() + APP_TOKEN_EARLY_MS
    ) {
      appExpiry.delete(r.id);
      drop(r.id);
    }
    const live = clients.get(r.id);
    if (live !== undefined) {
      return live;
    }
    const connecting = connect(r);
    clients.set(r.id, connecting);
    const release = () => {
      if (clients.get(r.id) === connecting) {
        clients.delete(r.id);
      }
    };
    connecting.then((connected) => {
      switch (connected.kind) {
        case "answered":
          // A stdio process that exits, or a stream the server ends: the next
          // call connects again instead of finding a dead client.
          connected.value.onclose = release;
          return;
        case "unanswered":
          release();
          return;
        default: {
          const unhandled: never = connected;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
    }, release);
    return connecting;
  };

  /** Keeps a connection's tool list, telling sessions' lists when it moved. */
  const keepListing = (id: string, tools: Tool[]) => {
    const before = JSON.stringify(listed.get(id) ?? null);
    listed.set(id, tools);
    if (JSON.stringify(tools) !== before) {
      deps.changed();
    }
  };

  /**
   * One use of a row's client. Whatever reached the service says it is
   * signed in; a refusal of its key or sign-in marks it needs-sign-in; any
   * other failure to reach it marks it in error, the reason with its secrets
   * cut out. An error the server answered a request with (a tool's bad
   * arguments) is the caller's, and leaves the connection as it is. No answer
   * within `ms` (or no connection within its own time) is unanswered and
   * leaves the connection's state as it was.
   */
  const using = async <T>(
    r: ConnectionRow,
    ms: number,
    use: (client: Client, signal: AbortSignal) => Promise<T>
  ): Promise<Bounded<T>> => {
    if (r.state === "needs-sign-in") {
      problem(`${r.name} is not signed in: ${r.reason ?? NO_SECRET}.`);
    }
    const once = async (): Promise<Bounded<T>> => {
      const connected = await clientOf(r);
      switch (connected.kind) {
        case "answered":
          break;
        case "unanswered":
          return connected;
        default: {
          const unhandled: never = connected;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
      const answer = await readWithin(ms, (signal) =>
        use(connected.value, signal)
      );
      switch (answer.kind) {
        case "answered":
          setState(r, "signed-in", null);
          return answer;
        case "unanswered":
          return answer;
        default: {
          const unhandled: never = answer;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
    };
    const reused = clients.has(r.id);
    try {
      return await once();
    } catch (error) {
      // A kept client whose server session ended (404 on its session id):
      // the server ran nothing, so the use goes once more on a new session.
      if (reused && sessionGone(error)) {
        drop(r.id);
        try {
          return await once();
        } catch (again) {
          throw failure(r, again);
        }
      }
      throw failure(r, error);
    }
  };

  /** What a refused sign-in asks of the person, by how the row signs in. */
  const againOf = (r: ConnectionRow): string => {
    if (r.auth === "oauth") {
      return "Sign in again.";
    }
    if (r.auth === "app") {
      return appServiceOf(r.service) === "linear"
        ? "Sign in again."
        : "Set its app again.";
    }
    return "Set its key again.";
  };

  /** "<name> did not answer within N s": a use of a connection that was not answered. */
  const unanswered = (r: ConnectionRow, after: number): ConnectionProblem =>
    new ConnectionProblem(
      `${r.name} did not answer within ${Math.round(after / 1000)} s.`
    );

  /**
   * What a failed use of a row's client becomes, the row's state moved with
   * it. The upstream error itself goes no further: it may carry the key, so
   * only its words, scrubbed, do.
   */
  const failure = (r: ConnectionRow, error: unknown): ConnectionProblem => {
    if (error instanceof ConnectionProblem) {
      return error;
    }
    const said = scrub(
      r,
      error instanceof Error ? error.message : String(error)
    ).slice(0, 300);
    if (error instanceof McpError) {
      return new ConnectionProblem(`${r.name} answered: ${said}`);
    }
    drop(r.id);
    if (refusedSignIn(error)) {
      const again = againOf(r);
      setState(r, "needs-sign-in", `The service refused the sign-in. ${again}`);
      return new ConnectionProblem(
        `${r.name} refused the hub's sign-in. ${again}`
      );
    }
    setState(r, "error", said);
    return new ConnectionProblem(`${r.name} could not be reached: ${said}`);
  };

  const listAll = async (
    client: Client,
    signal: AbortSignal
  ): Promise<Tool[]> => {
    const tools: Tool[] = [];
    let cursor: string | undefined;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: each page names the next
      const page = await client.listTools(cursor ? { cursor } : {}, {
        signal,
        timeout: SDK_CLOCK_OFF,
      });
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  };

  /**
   * The tools a connection's server lists now, kept for sessions' lists. A
   * listing not answered in time throws so, and keeps the last list: it is
   * never "no tools".
   */
  const listConnectionTools = async (name: string): Promise<Tool[]> => {
    const r = row(name);
    const listing = await using(r, CONNECT_MS, listAll);
    switch (listing.kind) {
      case "answered":
        keepListing(r.id, listing.value);
        return listing.value;
      case "unanswered":
        console.warn(
          `[connections] ${r.name}: its tools were not listed, the last list stands: ${unanswered(r, listing.after).message}`
        );
        throw unanswered(r, listing.after);
      default: {
        const unhandled: never = listing;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  };

  /**
   * Calls `tool` on a connection as the hub, with its key: what slices that
   * act for the owner (pollers, approved actions) and every session's
   * `conn__` call run through. The answer has the connection's secrets cut
   * out wherever the service echoed them.
   */
  const callConnection = async (
    name: string,
    tool: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult> => {
    const r = row(name);
    const called = await using(r, CALL_MS, (client, signal) =>
      client.callTool({ name: tool, arguments: args }, undefined, {
        signal,
        timeout: SDK_CLOCK_OFF,
      })
    );
    let result: CallToolResult;
    switch (called.kind) {
      case "answered":
        result = called.value as CallToolResult;
        break;
      case "unanswered":
        throw unanswered(r, called.after);
      default: {
        const unhandled: never = called;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    const text = JSON.stringify(result);
    const clean = scrub(r, text);
    return clean === text ? result : (JSON.parse(clean) as CallToolResult);
  };

  /**
   * One call that must run at most once (actions.ts): `meta` rides in the
   * request's `_meta`, and nothing is retried but what the server provably
   * never ran (a 404 on a gone session id, as {@link using} does). Answers
   * how it went, never throws:
   * - `answered`: the server answered the call (its result may say it failed);
   * - `refused`: it never ran: the hub could not connect or sign in, or the
   *   server answered the request with an error;
   * - `unknown`: the request went and no answer came back (none within
   *   its time, a dropped stream, a server error status): it may or may not
   *   have run.
   */
  const callOnce = async (
    name: string,
    tool: string,
    args: Record<string, unknown>,
    meta: Record<string, unknown>
  ): Promise<
    | { kind: "answered"; result: CallToolResult }
    | { kind: "refused" | "unknown"; error: string }
  > => {
    const r = db.byName(name);
    if (!r) {
      return { kind: "refused", error: `There is no connection ${name}.` };
    }
    /** The last error the call itself raised; none: it never left the hub. */
    let raw: unknown;
    try {
      const called = await using(r, CALL_MS, (client, signal) =>
        client
          .callTool({ name: tool, arguments: args, _meta: meta }, undefined, {
            signal,
            timeout: SDK_CLOCK_OFF,
          })
          .catch((error: unknown) => {
            raw = error;
            throw error;
          })
      );
      let result: CallToolResult;
      switch (called.kind) {
        case "answered":
          result = called.value as CallToolResult;
          break;
        case "unanswered":
          // It went, or its connection was being made: it may have run.
          return {
            kind: "unknown",
            error: unanswered(r, called.after).message,
          };
        default: {
          const unhandled: never = called;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
      const text = JSON.stringify(result);
      const clean = scrub(r, text);
      return {
        kind: "answered",
        result: clean === text ? result : (JSON.parse(clean) as CallToolResult),
      };
    } catch (error) {
      const words = error instanceof Error ? error.message : String(error);
      const neverRan =
        raw === undefined ||
        refusedSignIn(raw) ||
        sessionGone(raw) ||
        (raw instanceof McpError &&
          raw.code !== ErrorCode.RequestTimeout &&
          raw.code !== ErrorCode.ConnectionClosed);
      return { kind: neverRan ? "refused" : "unknown", error: words };
    }
  };

  /**
   * The connections a session may propose an approved action on: those its
   * delegate type and its project list, that exist. Unlike {@link granted},
   * whatever its role: a proposal calls nothing; you approve the call.
   */
  const proposable = (actor: InstanceRow): string[] => {
    const names = new Set([
      ...deps.typeConnections(actor),
      ...(actor.projectId ? db.namesForProject(actor.projectId) : []),
    ]);
    return [...names].filter((name) => db.byName(name) !== undefined);
  };

  /** A connection's tool by its own name: as last listed, else listed now. */
  const toolNamed = async (
    name: string,
    tool: string
  ): Promise<Tool | undefined> => {
    const r = row(name);
    const tools = listed.get(r.id) ?? (await listConnectionTools(name));
    return tools.find((one) => one.name === tool);
  };

  /**
   * Why connection `name` cannot sign in to a project's declared LFS
   * endpoint, in words; none when it can: it exists and holds a key
   * (`bearer` or `header`). An OAuth sign-in's tokens are its MCP server's,
   * not a git host's.
   */
  const lfsProblem = (name: string): string | undefined => {
    const r = db.byName(name);
    if (!r) {
      return `There is no connection ${name}.`;
    }
    if (r.auth !== "bearer" && r.auth !== "header") {
      return `${name} signs in with ${r.auth}; large files sign in with a connection's key (bearer or header).`;
    }
    return opened(r).key ? undefined : `${name} needs its key: ${NO_SECRET}.`;
  };

  /**
   * Connection `name`'s key as HTTP Basic for a project's declared LFS
   * endpoint (`x-access-token:<key>`, the user name GitHub's tokens take;
   * the hosts that take any user name take it too), answered to the
   * machine that runs git-lfs for the project (server.ts `GET
   * /api/lfs/projects/:id`) and nothing else: no view or tool answers it,
   * and it is never logged. Refused in {@link lfsProblem}'s words.
   */
  const lfsBasic = (name: string): string => {
    const why = lfsProblem(name);
    if (why) {
      problem(why);
    }
    const key = opened(row(name)).key ?? "";
    return Buffer.from(`x-access-token:${key}`).toString("base64");
  };

  /** Looks at a connection once (its tools), so its state says what is true; a failure is in its state. */
  const probe = (name: string) =>
    listConnectionTools(name).then(
      () => undefined,
      () => undefined
    );

  /** The names a session may use: its delegate type's and its project's, that exist. */
  const granted = (actor: InstanceRow): string[] => {
    if (connectionToolsFor(roleOf(actor)) === "none") {
      return [];
    }
    const names = new Set([
      ...deps.typeConnections(actor),
      ...(actor.projectId ? db.namesForProject(actor.projectId) : []),
    ]);
    return [...names].filter((name) => db.byName(name) !== undefined);
  };

  /**
   * The connection tools a session is listed: each granted connection's, as
   * it last listed them, unless it needs a sign-in. One whose last use
   * failed stays listed: the next call is what finds it back. Without a
   * session (OpenCode's shared discovery), every connection's: the call
   * enforces.
   */
  const sessionTools = (actor: InstanceRow | undefined): SessionTool[] => {
    const rows = db.list().filter((r) => r.state !== "needs-sign-in");
    const names = actor ? new Set(granted(actor)) : undefined;
    const readOnly =
      actor !== undefined && connectionToolsFor(roleOf(actor)) === "read-only";
    return rows
      .filter((r) => names === undefined || names.has(r.name))
      .flatMap((r) =>
        (listed.get(r.id) ?? [])
          .filter((tool) => !readOnly || readsOnly(tool))
          .map((tool) => ({
            name: sessionToolName(r.name, tool.name),
            description:
              `${r.service} as ${r.account}, through the CawCo hub (connection ${r.name}). ${tool.description ?? ""}`.trim(),
            inputSchema: tool.inputSchema,
            ...(tool.annotations ? { annotations: tool.annotations } : {}),
          }))
      );
  };

  /** A session's `conn__<name>__<tool>` call: run as the hub when its type or project grants it. */
  const callAs = async (
    actor: InstanceRow,
    name: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult> => {
    const parsed =
      parseConnectionTool(name) ?? problem(`${name} is not a connection tool.`);
    if (!granted(actor).includes(parsed.connection)) {
      problem(
        `${name} isn't available to this session: neither its delegate type nor its project lists the connection ${parsed.connection}.`
      );
    }
    // The real tool, read back through what sessions are listed: a session
    // calls only a tool it was shown, by the name it was shown.
    const tool =
      listed
        .get(row(parsed.connection).id)
        ?.find(
          (one) => sessionToolName(parsed.connection, one.name) === name
        ) ??
      problem(
        `${name} is not one of ${parsed.connection}'s tools as the hub last listed them.`
      );
    if (connectionToolsFor(roleOf(actor)) === "read-only" && !readsOnly(tool)) {
      problem(
        `${name} isn't available here: this session reads the outside world, so it gets only a connection's read-only tools.`
      );
    }
    const guarded = deps.upstream(actor, row(parsed.connection), tool, args);
    if (guarded) {
      return guarded;
    }
    console.info(
      `[connections] ${actor.id} calls ${parsed.connection}/${tool.name}`
    );
    return await callConnection(parsed.connection, tool.name, args);
  };

  const projectsProblem = (projects: string[] | undefined) => {
    const unknown = (projects ?? []).filter((id) => !deps.projectExists(id));
    if (unknown.length > 0) {
      problem(`There is no project ${unknown.join(", ")}.`);
    }
  };

  /**
   * After a sign-in or a grant: `projects` now have `name` signed in, and a
   * push-only service's say so ({@link ConnectionsDeps.pushOnlyConnected}).
   * Nothing for a connection that is not signed in once looked at.
   */
  const reached = (name: string, projects: readonly string[]): void => {
    const r = db.byName(name);
    if (
      r?.state === "signed-in" &&
      projects.length > 0 &&
      pushOnlyProvider(r.service)
    ) {
      deps.pushOnlyConnected(view(r), [...projects]);
    }
  };

  /** Where a row stands with no secret yet: signed in only once it is looked at. */
  const startState = (
    authKind: ConnectionAuth
  ): Pick<ConnectionRow, "state" | "reason"> => {
    if (authKind === "none") {
      return { state: "error", reason: "Not looked at yet." };
    }
    const reasons: Record<Exclude<ConnectionAuth, "none">, string> = {
      oauth: connectionsWords.saidSignIn,
      app: connectionsWords.saidSetApp,
      bearer: connectionsWords.saidSetKey,
      header: connectionsWords.saidSetKey,
    };
    return { state: "needs-sign-in", reason: reasons[authKind] };
  };

  const create = async (input: ConnectionInput): Promise<ConnectionView> => {
    const said = inputProblem(input);
    if (said) {
      problem(said);
    }
    if (db.byName(input.name)) {
      problem(`There is a connection ${input.name} already.`);
    }
    projectsProblem(input.projects);
    const now = new Date();
    const id = crypto.randomUUID();
    db.insert({
      id,
      name: input.name,
      service: input.service.trim(),
      account: input.account.trim(),
      ...whereOf(input),
      ...startState(input.auth),
      ...LET_GO,
      createdAt: now,
      updatedAt: now,
    });
    db.setProjects(id, input.projects ?? []);
    console.info(`[connections] made ${input.name} (${input.service})`);
    if (input.auth === "none") {
      await probe(input.name);
      reached(input.name, input.projects ?? []);
    }
    deps.changed();
    return view(row(input.name));
  };

  /**
   * Changes a connection. A change to where it points or how it signs in
   * lets go of its key or tokens: a key is never sent somewhere it was not
   * given for.
   */
  const update = async (
    name: string,
    patch: Partial<Omit<ConnectionInput, "name">>
  ): Promise<ConnectionView> => {
    const r = row(name);
    const next = merged(r, patch);
    const said = inputProblem(next);
    if (said) {
      problem(said);
    }
    projectsProblem(patch.projects);
    const where = whereOf(next);
    const moved = JSON.stringify(where) !== JSON.stringify(whereOf(r));
    const had = new Set(db.projectsOf(r.id));
    db.update(r.id, {
      service: next.service.trim(),
      account: next.account.trim(),
      ...where,
      ...(moved ? { ...startState(next.auth), ...LET_GO } : {}),
    });
    if (patch.projects) {
      db.setProjects(r.id, patch.projects);
    }
    if (moved) {
      drop(r.id);
      listed.delete(r.id);
      console.info(`[connections] ${name} moved: its secret was let go`);
      if (next.auth === "none") {
        await probe(name);
      }
    }
    // A move signs in again (all its projects reach it anew); else only the
    // projects this change grants it to.
    reached(
      name,
      moved
        ? db.projectsOf(r.id)
        : (patch.projects ?? []).filter((project) => !had.has(project))
    );
    deps.changed();
    return view(row(name));
  };

  /** Holds a key for a `bearer` or `header` connection, then looks at it. */
  const setKey = async (name: string, key: string): Promise<ConnectionView> => {
    const r = row(name);
    if (r.auth !== "bearer" && r.auth !== "header") {
      const instead: Record<"none" | "oauth" | "app", string> = {
        none: "it takes none.",
        oauth: "start its sign-in instead.",
        app: "set its app instead.",
      };
      problem(`${name} signs in with ${r.auth}, not a key: ${instead[r.auth]}`);
    }
    if (!key.trim() || key.length > 8192) {
      problem("A key is between 1 and 8192 characters.");
    }
    reseal(r.id, () => ({ key: key.trim() }));
    drop(r.id);
    db.update(r.id, { state: "error", reason: "Not looked at yet." });
    console.info(`[connections] ${name}: key set`);
    await probe(name);
    reached(name, db.projectsOf(r.id));
    return view(row(name));
  };

  /**
   * Holds an `app` connection's registration: a GitHub App's id,
   * installation and private key, which is looked at at once (its token
   * minted, its MCP server's tools listed), or a Linear app's client id and
   * secret, which then signs in. What it held before is let go.
   */
  const setApp = async (
    name: string,
    input: AppInput
  ): Promise<ConnectionView> => {
    const r = row(name);
    const service = appServiceOf(r.service);
    if (r.auth !== "app" || !service) {
      return problem(`${name} signs in with ${r.auth}, not as an app.`);
    }
    const app = appOf(service, input);
    if (typeof app === "string") {
      return problem(app);
    }
    reseal(r.id, () => ({ app }));
    drop(r.id);
    appExpiry.delete(r.id);
    githubApps.delete(r.id);
    db.update(r.id, {
      tokensExpireAt: null,
      ...(service === "github"
        ? { state: "error", reason: "Not looked at yet." }
        : { state: "needs-sign-in", reason: connectionsWords.saidSignIn }),
    });
    console.info(`[connections] ${name}: app set`);
    if (service === "github") {
      await probe(name);
      reached(name, db.projectsOf(r.id));
    }
    deps.changed();
    return view(row(name));
  };

  /**
   * A Linear app's sign-in: Linear's own authorize page with `actor=app`
   * ("Resources are created as the application"), PKCE, and `prompt=consent`
   * so the person picks the workspace each time. The redirect must be one
   * the app's settings list.
   */
  const startAppSignIn = async (
    r: ConnectionRow,
    redirect: string
  ): Promise<{ authorizationUrl: string }> => {
    const { app } = opened(r);
    if (app?.service !== "linear") {
      return problem(
        appServiceOf(r.service) === "github"
          ? `${r.name} is a GitHub App, which signs in with its private key: set its app instead.`
          : `${r.name} needs its Linear app first: set its client id and client secret.`
      );
    }
    const state = crypto.randomUUID();
    let started: { authorizationUrl: URL; codeVerifier: string };
    try {
      started = await startAuthorization(LINEAR_API, {
        metadata: linearOAuth(),
        clientInformation: { client_id: app.clientId },
        redirectUrl: redirect,
        scope: LINEAR_APP_SCOPE,
        state,
      });
    } catch (error) {
      return problem(
        `${r.name}'s sign-in could not start: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    started.authorizationUrl.searchParams.set("actor", "app");
    started.authorizationUrl.searchParams.set("prompt", "consent");
    reseal(r.id, (sealed) => ({
      app: sealed.app,
      verifier: started.codeVerifier,
    }));
    db.update(r.id, {
      signInState: state,
      signInRedirect: redirect,
      signInExpiresAt: new Date(Date.now() + SIGN_IN_MS),
      signInUrl: started.authorizationUrl.toString(),
      tokensExpireAt: null,
    });
    drop(r.id);
    appExpiry.delete(r.id);
    setState(r, "needs-sign-in", "A sign-in is under way.");
    console.info(`[connections] ${r.name}: Linear app sign-in started`);
    return { authorizationUrl: started.authorizationUrl.toString() };
  };

  /**
   * Starts an OAuth sign-in: the URL the person opens. Its redirect lands on
   * the hub at `origin` (where their browser reaches it), else the hub's own
   * address. Any tokens held are let go first: this is a new sign-in.
   */
  const startSignIn = async (
    name: string,
    origin?: string
  ): Promise<{ authorizationUrl: string }> => {
    const r = row(name);
    if (r.auth !== "oauth" && r.auth !== "app") {
      problem(`${name} signs in with ${r.auth}, not OAuth.`);
    }
    let base: URL;
    try {
      base = new URL(origin ?? deps.hubOrigin());
    } catch {
      return problem("origin is the address the browser reaches the hub at.");
    }
    if (base.protocol !== "http:" && base.protocol !== "https:") {
      problem("origin is an http or https address.");
    }
    const redirect = `${base.origin}${CONNECTION_CALLBACK_PATH}`;
    if (r.auth === "app") {
      return startAppSignIn(r, redirect);
    }
    const state = crypto.randomUUID();
    reseal(r.id, (sealed) => ({
      // A client registered for another redirect cannot come back to this one.
      client:
        sealed.client &&
        "redirect_uris" in sealed.client &&
        sealed.client.redirect_uris.includes(redirect)
          ? sealed.client
          : undefined,
    }));
    db.update(r.id, {
      signInState: state,
      signInRedirect: redirect,
      signInExpiresAt: new Date(Date.now() + SIGN_IN_MS),
      tokensExpireAt: null,
    });
    drop(r.id);
    let authorizationUrl: URL | undefined;
    const toOpen = (url: URL) => {
      authorizationUrl = url;
    };
    try {
      await auth(provider(r.id, { state, opened: toOpen }), {
        serverUrl: r.url ?? "",
      });
    } catch (error) {
      setState(r, "error", "The hub could not discover its sign-in.");
      // biome-ignore lint/style/useErrorCause: upstream OAuth errors may carry token responses; only scrubbed words go on
      throw new ConnectionProblem(
        `${name}'s sign-in could not start: ${scrub(r, error instanceof Error ? error.message : String(error)).slice(0, 300)}`
      );
    }
    if (!authorizationUrl) {
      return problem(`${name}'s server asked for no sign-in.`);
    }
    db.update(r.id, { signInUrl: authorizationUrl.toString() });
    setState(r, "needs-sign-in", connectionsWords.saidUnderWay);
    console.info(`[connections] ${name}: sign-in started`);
    return { authorizationUrl: authorizationUrl.toString() };
  };

  /** The redirect's half: exchanges the code once, then looks at the connection. */
  const completeSignIn = async (
    code: string,
    state: string,
    iss?: string
  ): Promise<ConnectionView> => {
    const r = db.bySignInState(state);
    if (!(r?.signInExpiresAt && r.signInExpiresAt.getTime() > Date.now())) {
      return problem(
        "This sign-in expired or was already completed. Start sign-in again."
      );
    }
    // Spent before the exchange: a second redirect with the same state finds nothing.
    db.update(r.id, {
      signInState: null,
      signInExpiresAt: null,
      signInUrl: null,
    });
    if (r.auth === "app") {
      await exchangeApp(r, code);
    } else {
      await exchangeMcp(r, code, state, iss);
    }
    reseal(r.id, (sealed) => ({ ...sealed, verifier: undefined }));
    db.update(r.id, { state: "error", reason: "Not looked at yet." });
    drop(r.id);
    console.info(`[connections] ${r.name}: signed in`);
    await probe(r.name);
    reached(r.name, db.projectsOf(r.id));
    return view(row(r.name));
  };

  /** A Linear app's code, exchanged at Linear's token endpoint with its client secret and the sign-in's verifier. */
  const exchangeApp = async (r: ConnectionRow, code: string): Promise<void> => {
    const { app, verifier } = opened(r);
    if (app?.service !== "linear" || !verifier) {
      return problem(
        "This sign-in's app was changed while it was under way. Start sign-in again."
      );
    }
    try {
      keepTokens(
        r.id,
        await exchangeAuthorization(LINEAR_API, {
          metadata: linearOAuth(),
          clientInformation: {
            client_id: app.clientId,
            client_secret: app.clientSecret,
          },
          authorizationCode: code,
          codeVerifier: verifier,
          redirectUri: redirectOf(r),
        })
      );
    } catch (error) {
      const said = scrub(
        r,
        error instanceof Error ? error.message : String(error)
      ).slice(0, 300);
      setState(r, "needs-sign-in", `Linear refused the sign-in (${said}).`);
      // biome-ignore lint/style/useErrorCause: the token response may carry tokens; only scrubbed words go on
      throw new ConnectionProblem(
        `Linear refused this sign-in (${said}). Start sign-in again.`
      );
    }
  };

  /** An MCP server's code, exchanged through the SDK's flow over the row's discovery. */
  const exchangeMcp = async (
    r: ConnectionRow,
    code: string,
    state: string,
    iss: string | undefined
  ): Promise<void> => {
    const metadata = r.discovery?.authorizationServerMetadata as
      | {
          authorization_response_iss_parameter_supported?: boolean;
          issuer?: string;
        }
      | undefined;
    // RFC 9207: a server that names itself on the redirect must name itself.
    if (
      metadata?.authorization_response_iss_parameter_supported === true &&
      iss !== metadata.issuer
    ) {
      return problem(
        "This sign-in came back from a different authorization server than it started with. Start sign-in again."
      );
    }
    try {
      await auth(provider(r.id, { state, opened: () => undefined }), {
        serverUrl: r.url ?? "",
        authorizationCode: code,
      });
    } catch {
      setState(
        r,
        "needs-sign-in",
        "The authorization server refused the sign-in."
      );
      // biome-ignore lint/style/useErrorCause: upstream OAuth errors may carry token responses
      throw new ConnectionProblem(
        "The authorization server refused this sign-in. Start sign-in again."
      );
    }
  };

  /**
   * An Octokit signed in as a `github` connection, for the tracker sync, the
   * GitHub poller, the relay's webhooks and `create_repo`: a
   * fine-grained personal access token's, or a GitHub App installation's,
   * whose tokens it mints and renews itself. Refused in words for any other
   * sign-in: an MCP OAuth token is for GitHub's MCP server.
   */
  const githubClient = (name: string): Octokit => {
    const r = row(name);
    if (appServiceOf(r.service) !== "github") {
      return problem(`${name} is a ${r.service} connection, not a GitHub one.`);
    }
    const sealed = opened(r);
    if (r.auth === "app") {
      return sealed.app?.service === "github"
        ? githubAppOctokit(r, sealed.app)
        : problem(
            `${name} needs its GitHub App: set its app id, installation id and private key.`
          );
    }
    if (r.auth === "bearer") {
      return new Octokit({
        auth: sealed.key ?? problem(`${name} needs its key: ${NO_SECRET}.`),
        baseUrl: GITHUB_API,
        userAgent: "CawCo-hub",
      });
    }
    return problem(
      `${name} signs in with ${r.auth}; a tracker reads GitHub through a GitHub App or a fine-grained personal access token.`
    );
  };

  /**
   * Linear clients signed in as a `linear` connection, one per request, for
   * the tracker sync: a personal API key's ("`Authorization: <API_KEY>`"),
   * or a Linear app's access token, refreshed first when near its end.
   * Refused in words for any other sign-in: an MCP OAuth token is for
   * Linear's MCP server.
   */
  const linearClient = async (name: string): Promise<LinearClientFor> => {
    const r = row(name);
    if (appServiceOf(r.service) !== "linear") {
      return problem(`${name} is a ${r.service} connection, not a Linear one.`);
    }
    const apiUrl = `${LINEAR_API}/graphql`;
    let signedIn: { accessToken: string } | { apiKey: string };
    if (r.auth === "bearer") {
      signedIn = {
        apiKey:
          opened(r).key ?? problem(`${name} needs its key: ${NO_SECRET}.`),
      };
    } else if (r.auth === "app") {
      signedIn = { accessToken: await linearAccess(r) };
    } else {
      return problem(
        `${name} signs in with ${r.auth}; a tracker reads Linear through a Linear app or a personal API key.`
      );
    }
    // The client hands its options to each fetch, a request's signal with them.
    return (signal) =>
      new LinearClient({ ...signedIn, apiUrl, ...(signal ? { signal } : {}) });
  };

  /**
   * The service refused the connection's sign-in to the hub's own call (the
   * tracker sync's): it needs a key or sign-in again, in the service's words.
   */
  const refusedBy = (name: string, words: string): void => {
    const r = db.byName(name);
    if (r) {
      drop(r.id);
      setState(r, "needs-sign-in", `${words} ${againOf(r)}`);
    }
  };

  /** Lets it go into the hub's trash (db/trash.ts); answers the entry its Undo names. */
  const remove = (name: string): number => {
    const r = row(name);
    drop(r.id);
    listed.delete(r.id);
    githubApps.delete(r.id);
    appExpiry.delete(r.id);
    const restore =
      deps.trash(name) ?? problem(`There is no connection ${name}.`);
    console.info(`[connections] removed ${name}`);
    deps.changed();
    return restore;
  };

  /** Back from the trash, its key or tokens with it: looked at again, as at hub start. */
  const returned = (name: string): ConnectionView => {
    const r = row(name);
    if (r.state !== "needs-sign-in") {
      detach(probe(name), `connection ${name} back from the trash`);
    }
    console.info(`[connections] ${name} back from the trash`);
    deps.changed();
    return view(r);
  };

  deps.lifetime.onClose(() => {
    for (const id of [...clients.keys()]) {
      drop(id);
    }
  });

  return {
    callConnection,
    callOnce,
    proposable,
    toolNamed,
    listConnectionTools,
    githubClient,
    linearClient,
    refusedBy,
    lfsBasic,
    lfsProblem,
    sessionTools,
    callAs,
    list: () => db.list().map(view),
    get: (name: string) => view(row(name)),
    create,
    update,
    setKey,
    setApp,
    startSignIn,
    completeSignIn,
    remove,
    returned,
    /** At hub start: each connection with a secret (or none needed) is looked at once, off the boot path. */
    start: () => {
      for (const r of db.list()) {
        if (r.state !== "needs-sign-in") {
          detach(probe(r.name), `connection ${r.name} first look`);
        }
      }
    },
  };
};

export type Connections = ReturnType<typeof createConnections>;

const INPUT = {
  service: t.String({ minLength: 1 }),
  account: t.String({ minLength: 1 }),
  transport: t.Union([t.Literal("http"), t.Literal("sse"), t.Literal("stdio")]),
  url: t.Optional(t.String()),
  command: t.Optional(t.String()),
  args: t.Optional(t.Array(t.String())),
  auth: t.Union([
    t.Literal("none"),
    t.Literal("bearer"),
    t.Literal("header"),
    t.Literal("oauth"),
    t.Literal("app"),
  ]),
  header: t.Optional(t.String()),
  projects: t.Optional(t.Array(t.String())),
};

/** A refusal as a 400 in words; anything else is the hub's own failure. */
const refused = (error: unknown) => {
  if (error instanceof ConnectionProblem) {
    return status(400, error.message);
  }
  throw error;
};

/**
 * `/api/connections`: list, create, change, set a key, start a sign-in,
 * remove, and list a connection's tools. No route answers a key, and none
 * calls a tool: tools are called through a session's grant or by hub code.
 */
export const connectionRoutes = (connections: Connections) =>
  new Elysia()
    .get("/api/connections", () => ({ connections: connections.list() }))
    .post(
      "/api/connections",
      { body: t.Object({ name: t.String({ minLength: 1 }), ...INPUT }) },
      async ({ body }) => {
        try {
          return await connections.create(body);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .patch(
      "/api/connections/:name",
      { body: t.Partial(t.Object(INPUT)) },
      async ({ params, body }) => {
        try {
          return await connections.update(params.name, body);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .put(
      "/api/connections/:name/key",
      { body: t.Object({ key: t.String({ minLength: 1 }) }) },
      async ({ params, body }) => {
        try {
          return await connections.setKey(params.name, body.key);
        } catch (error) {
          return refused(error);
        }
      }
    )
    // An app connection's registration: a GitHub App's id, installation
    // and private key, or a Linear app's client id and secret. Answered as
    // the view, which names the app and never holds its secret.
    .put(
      "/api/connections/:name/app",
      {
        body: t.Union([
          t.Object({
            appId: t.String({ minLength: 1 }),
            installationId: t.String({ minLength: 1 }),
            privateKey: t.String({ minLength: 1 }),
          }),
          t.Object({
            clientId: t.String({ minLength: 1 }),
            clientSecret: t.String({ minLength: 1 }),
          }),
        ]),
      },
      async ({ params, body }) => {
        try {
          return await connections.setApp(params.name, body);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/connections/:name/sign-in",
      { body: t.Object({ origin: t.Optional(t.String()) }) },
      async ({ params, body }) => {
        try {
          return await connections.startSignIn(params.name, body.origin);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get("/api/connections/:name/tools", async ({ params }) => {
      try {
        const tools = await connections.listConnectionTools(params.name);
        return {
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description ?? "",
            readOnly: readsOnly(tool),
          })),
        };
      } catch (error) {
        return refused(error);
      }
    })
    .delete("/api/connections/:name", ({ params }) => {
      try {
        return undoable(connections.remove(params.name));
      } catch (error) {
        return refused(error);
      }
    })
    // The browser that signed in lands here, from the authorization server:
    // plain text, so nothing it carries is ever read as a page.
    .get(
      CONNECTION_CALLBACK_PATH,
      {
        ...hidden,
        query: t.Object({
          code: t.Optional(t.String()),
          state: t.Optional(t.String()),
          iss: t.Optional(t.String()),
          error: t.Optional(t.String()),
        }),
      },
      async ({ query }) => {
        const plain = (text: string, code = 200) =>
          new Response(text, {
            status: code,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "X-Content-Type-Options": "nosniff",
            },
          });
        if (!(query.code && query.state)) {
          return plain(
            `The sign-in did not finish${query.error ? ` (${query.error.slice(0, 100)})` : ""}. Start it again.`,
            400
          );
        }
        try {
          const signed = await connections.completeSignIn(
            query.code,
            query.state,
            query.iss
          );
          return plain(
            `Signed in to ${signed.service} as ${signed.account} (${signed.name}). You can close this tab.`
          );
        } catch (error) {
          return plain(
            error instanceof ConnectionProblem
              ? error.message
              : "The sign-in could not finish. Start it again.",
            400
          );
        }
      }
    );
