/**
 * Connections (Projects spec §3, §5.5): outside services the hub signs in to
 * and calls. A connection is one named row (`github-petra`, `x-brand`); two
 * accounts of one service are two rows, never merged.
 *
 * THE INVARIANT: a connection's credential lives only in the hub. Its key, or
 * its OAuth tokens, are sealed beside the row (`connection_secrets`, each
 * secret alone, secret-box.ts) and opened only here, to build the one request or the one stdio process that carries them.
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
 * An `app` connection is an app acting as itself. A GitHub App is
 * registered by the hub from a manifest ("they only need to follow a URL and
 * name the app", docs.github.com, registering a GitHub App from a manifest):
 * the person's browser posts the manifest to GitHub, GitHub's redirect brings
 * a code the hub exchanges for the app's ID and private key, and the person
 * installs it, GitHub's setup redirect naming the installation, which the
 * app's own JWT is asked about before it is kept. Its private key mints the
 * installation's token, an hour long, which Octokit's app auth caches and
 * renews ("The SDK will take care of generating an installation access token
 * for you and will regenerate the token once it expires", docs.github.com);
 * GitHub's MCP server takes it as a bearer (github/github-mcp-server#696:
 * "You can now use `ghs_` tokens to authorize against remote MCP server"). A
 * Linear app signs in through Linear's own OAuth with `actor=app`, its
 * 24-hour access token refreshed here and its rotated refresh token kept;
 * Linear's MCP server takes the token as a bearer ("You can use this to
 * interact with the MCP server as an `app` user", linear.app/docs/mcp).
 *
 * A `gh` connection acts as the person with the token a fleet machine's gh
 * holds, which the hub asks that machine for (core `CONTROL_GH_TOKEN`) when
 * the last read is a minute old or GitHub refused it, and seals here; while
 * the machine is away the sealed one is sent. A `device` connection acts as
 * the person through CawCo's own OAuth app, signed in with a code at
 * github.com/login/device, the hub polling GitHub at the interval it names
 * and keeping the token and its refresh token ("The access token expires
 * after eight hours, and the refresh token expires after six months without
 * use", docs.github.com, authorizing OAuth apps).
 */

import { createHash, createPrivateKey } from "node:crypto";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import {
  APP_SERVICES,
  type AppService,
  CONNECTION_AUTHS,
  CONNECTION_TRANSPORTS,
  type ConnectionApp,
  type ConnectionAuth,
  type ConnectionTransport,
  type ConnectionView,
  type GhSignIn,
  pushOnlyProvider,
} from "@cawco/core/connections";
import {
  CONNECTION_NAME,
  CONNECTION_NAME_LENGTH,
  connectionToolName,
  parseConnectionTool,
} from "@cawco/core/delegate-types";
import { boundedRead, Unanswered } from "@cawco/core/effect/bounded";
import { makeJoin } from "@cawco/core/effect/join";
import type { InstanceRow } from "@cawco/core/protocol";
import { HOUR_MS, secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { areaWords } from "@cawco/core/words/areas";
import { connectionReasons } from "@cawco/core/words/connection-reasons";
import { connectionsWords } from "@cawco/core/words/connections";
import { cutShort } from "@cawco/core/words/helpers";
import type { GiteaClient } from "@cawco/providers/gitea/client";
import {
  type GitHubAppAuth,
  type GitHubClient,
  githubAnonymousClient,
  githubAppClient,
  githubAppJwtClient,
  githubTokenClient,
} from "@cawco/providers/github/client";
import {
  type GitLabClient,
  gitlabClient as gitlabTokenClient,
} from "@cawco/providers/gitlab/client";
import {
  type LinearClientFor,
  linearClientFor,
} from "@cawco/providers/linear/client";
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
  CallToolResultSchema,
  ErrorCode,
  McpError,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Effect, type Fiber, Schema } from "effect";
import { Elysia, problem, t } from "elysia";
import type { Static } from "typebox";
import {
  type GenericSchema,
  type InferOutput,
  number,
  object,
  optional,
  parse,
  string,
  union,
} from "valibot";
import { readsOnly } from "./connection-writes";
import {
  type AppFacts,
  type ConnectionFacts,
  type ConnectionHeld,
  type ConnectionRow,
  type ConnectionsDb,
  factsOf,
  type HeldApp,
} from "./db/connections";
import { undoable } from "./db/trash";
import { forgeOf } from "./forge-hosts";
import { hidden } from "./hidden";
import type { HubLifetimeShape } from "./lifetime";

import { connectionToolsFor, roleOf } from "./roles";
import {
  GITHUB_API,
  GITHUB_DEVICE_CLIENT_ID,
  GITHUB_MCP,
  GITHUB_WEB,
  LINEAR_API,
} from "./upstreams";

/** Where an OAuth sign-in's redirect lands: on the hub, never a session. */
const CONNECTION_CALLBACK_PATH = "/api/connections/oauth/callback";

/** Sign in to GitHub's own routes: a machine's gh, and a GitHub App's manifest, creation and installation. */
const GITHUB_SIGN_IN = "/api/github-sign-in";
/** The page that posts a GitHub App's manifest to GitHub, in the person's browser. */
const GITHUB_MANIFEST_PATH = `${GITHUB_SIGN_IN}/app`;
/** GitHub's `redirect_url` once the app is made: the code to exchange. */
const GITHUB_CREATED_PATH = `${GITHUB_SIGN_IN}/app/created`;
/** GitHub's `setup_url` once the app is installed: the installation. */
const GITHUB_INSTALLED_PATH = `${GITHUB_SIGN_IN}/app/installed`;

/**
 * What a GitHub App the hub registers may read: what a project's poller reads
 * (issues, pull requests, discussions) and the metadata every app has
 * ("Permissions required for GitHub Apps", docs.github.com).
 */
const GITHUB_APP_PERMISSIONS = {
  issues: "read",
  pull_requests: "read",
  discussions: "read",
  metadata: "read",
} as const;

/**
 * What a code sign-in asks of the person's account: the repositories its
 * projects poll, private ones included, and the organizations they sit in
 * ("Scopes for OAuth apps", docs.github.com). Our choice of the least that
 * reads them.
 */
const DEVICE_SCOPE = "repo read:org";
/** "You must complete all three steps in the GitHub App Manifest flow within one hour" (docs.github.com). */
const MANIFEST_MS = HOUR_MS;
/** A gh token read this long ago is read from its machine again. Our choice: a re-login there is found within it. */
const GH_FRESH_MS = 60_000;
/** A GitHub organization's login: letters, digits and single hyphens, up to 39 characters. */
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
/** A GitHub App's name, as GitHub caps it. */
// @limit external: GitHub: an App's name "cannot be longer than 34 characters" (https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
const APP_NAME_MAX = 34;
const DIGITS = /^\d{1,20}$/u;
const NOT_NAME = /[^a-z0-9]+/gu;
const TRAILING_HYPHENS = /-+$/u;

/**
 * What a Linear app asks for: "`read` … This scope will always be present";
 * "`write` - Write access", which a task's stage, title and labels moving
 * on Linear need (`issues:create` "Allows creating new issues" and no more),
 * and which takes in `issues:create` and `comments:create`
 * (linear.app/developers/oauth-2-0-authentication).
 */
const LINEAR_APP_SCOPE = "read,write";

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
  /-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/u;
const BASE64 = /^[A-Za-z0-9+/=]+$/u;
const WHITESPACE = /\s+/gu;
const PEM_LINE = /.{1,64}/gu;

/**
 * A private key as PKCS#8 PEM, its body on 64-character lines. GitHub hands
 * a manifest's app PKCS#1 (`BEGIN RSA PRIVATE KEY`), which the app JWT's
 * WebCrypto signer refuses ("only PKCS#8 is supported",
 * universal-github-app-jwt), so it is kept as PKCS#8. Undefined when it is
 * no private key that reads.
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

/** How long a sign-in waits for its redirect. Our choice, as fleet MCP's. */
const SIGN_IN_MS = 10 * 60_000;
/** A connect and a listing. Our choice. */
const CONNECT_MS = 30_000;
/** One tool call, from when it is sent. Our choice. */
const CALL_MS = 5 * 60_000;
/**
 * The MCP SDK times every request out itself (60 s when not given,
 * `DEFAULT_REQUEST_TIMEOUT_MSEC`), with an McpError that reads as the
 * server's answer. Each request here is given its bounded read's signal and
 * this, the longest timer a JavaScript clock holds, so the bounded read
 * alone decides.
 */
const SDK_CLOCK_OFF = 2 ** 31 - 1;

const HEADER_NAME = /^[A-Za-z0-9-]+$/u;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
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
  /** Areas whose every project's sessions may use it (core areas.ts). */
  areas?: string[];
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
  /** Whether the hub keeps an area of that id. */
  readonly areaExists: (id: string) => boolean;
  /** Something a session's tool list depends on moved. */
  readonly changed: () => void;
  readonly db: ConnectionsDb;
  /** The fleet machines' gh (agent host-gh.ts), for `gh` connections. */
  readonly gh: {
    /**
     * Every account each connected machine's gh is signed in to; `unread`,
     * the machines that did not answer, as a sentence names them.
     */
    readonly accounts: () => Promise<{
      signIns: GhSignIn[];
      unread: string[];
    }>;
    /** A machine as a sentence names it. */
    readonly machineName: (machineId: string) => string;
    /**
     * One account's token, read on its machine now: `away` while the
     * machine is not connected or did not answer, `refused` when its gh has
     * no sign-in for the account.
     */
    readonly token: (
      machineId: string,
      host: string,
      login: string
    ) => Promise<
      | { kind: "token"; token: string }
      | { kind: "refused" | "away"; why: string }
    >;
  };
  /** The origin a sign-in's redirect uses when its caller names none. */
  readonly hubOrigin: () => string;
  readonly lifetime: HubLifetimeShape;
  readonly projectExists: (id: string) => boolean;
  /**
   * A connection's projects were written, `dropped` the ones it no longer
   * names: the GitHub poller of each project follows it (clock.ts
   * `followConnection`).
   */
  readonly projectsWritten: (connection: string, dropped: string[]) => void;
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
   * A session's call of a tool its server does not mark read-only answered:
   * what the answer names is recorded as the session's write (writes.ts
   * `recordAnswer`), so it is CawCo's own when it comes back.
   */
  readonly wrote: (actor: InstanceRow, answer: string) => void;
}

/**
 * `read` given `ms` to answer (the house's bounded read), its outcome as
 * `Bounded`: a connection's calls answer "not answered in time" as a value,
 * which leaves the connection's state as it was.
 */
const boundedOf = <A>(
  ms: number,
  read: Effect.Effect<A, unknown>
): Effect.Effect<Bounded<A>, unknown> =>
  boundedRead(ms, read).pipe(
    Effect.map((value): Bounded<A> => ({ kind: "answered", value })),
    Effect.catchIf(
      (error): error is Unanswered => error instanceof Unanswered,
      ({ after, reason }) =>
        Effect.succeed<Bounded<A>>({ kind: "unanswered", after, reason })
    )
  );

const misfit = (message: string): never => {
  throw new ConnectionProblem({ message });
};

/** A refusal in words, for the caller: a route answers it as a 400. */
export class ConnectionProblem extends Schema.TaggedError<ConnectionProblem>()(
  "ConnectionProblem",
  { message: Schema.String }
) {}

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
  if (
    (input.auth === "gh" || input.auth === "device") &&
    !(appServiceOf(input.service) === "github" && input.transport === "http")
  ) {
    return `A ${input.auth} connection signs in to GitHub: its service is github, reached over http.`;
  }
  return input.transport === "stdio" ? stdioProblem(input) : httpProblem(input);
};

/** A tool's answer as one text: its text parts and its structured content. */
const answerText = (result: CallToolResult): string =>
  [
    ...result.content.map((part) => (part.type === "text" ? part.text : "")),
    result.structuredContent === undefined
      ? ""
      : JSON.stringify(result.structuredContent),
  ].join("\n");

/** A Linear app's registration as the person gives it, for {@link Connections.setApp}. */
export interface AppInput {
  clientId: string;
  clientSecret: string;
}

/** `input` as a Linear app's registration, or why it is not one. */
const linearAppOf = (input: AppInput): HeldApp | string => {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!(clientId && clientSecret)) {
    return "A Linear app is set with the client id and client secret its settings page shows.";
  }
  return { service: "linear", clientId, clientSecret };
};

/**
 * What names an app, for a view: never its private key or client secret. A
 * GitHub App is named once it is installed: before, it reads nothing.
 */
const appView = (app: AppFacts): ConnectionApp | undefined => {
  if (app.service === "linear") {
    return { service: app.service, clientId: app.clientId };
  }
  return app.installationId
    ? {
        service: app.service,
        appId: app.appId,
        installationId: app.installationId,
        ...(app.slug ? { slug: app.slug } : {}),
      }
    : undefined;
};

/** Text as HTML text or an attribute's value: nothing in it is read as markup. */
const htmlText = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** The address a sign-in's browser reaches the hub at, as a URL; refused when it is no http(s) address. */
const originOf = (origin: string): URL => {
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return misfit("origin is the address the browser reaches the hub at.");
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    misfit("origin is an http or https address.");
  }
  return base;
};

/** GitHub's words when a token or code endpoint refuses: its code, and the interval a `slow_down` names. */
const GitHubRefusal = object({
  error: string(),
  error_description: optional(string()),
  interval: optional(number()),
});

/** A GitHub token endpoint's JSON answer: a token, or the error its device and refresh flows name. */
const GitHubTokenAnswer = union([
  object({
    access_token: string(),
    expires_in: optional(number()),
    refresh_token: optional(string()),
    scope: optional(string()),
    token_type: string(),
  }),
  GitHubRefusal,
]);
type GitHubTokenAnswer = InferOutput<typeof GitHubTokenAnswer>;

/** GitHub's device code answer ("POST https://github.com/login/device/code"), or its refusal. */
const GitHubDeviceCodes = union([
  object({
    device_code: string(),
    expires_in: optional(number()),
    interval: optional(number()),
    user_code: string(),
    verification_uri: string(),
  }),
  GitHubRefusal,
]);

/** A form posted to GitHub's site (device codes, tokens), answered as JSON ("Accept: application/json") that `schema` takes; any other answer throws. */
const postToGitHub = async <S extends GenericSchema>(
  path: string,
  form: Record<string, string>,
  schema: S
): Promise<InferOutput<S>> => {
  const read = await readWithin(CONNECT_MS, async (signal) => {
    const answer = await fetch(`${GITHUB_WEB}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form),
      signal,
    });
    if (!answer.ok) {
      throw new Error(`GitHub answered ${answer.status}`);
    }
    return parse(schema, await answer.json());
  });
  if (read.kind === "unanswered") {
    throw new Error(`GitHub did not answer within ${secondsOf(read.after)} s`);
  }
  return read.value;
};

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

/**
 * What a row lets go of when it moves, beside what it holds
 * ({@link ConnectionsDb.hold} with nothing): its discovery and any sign-in.
 */
const LET_GO = {
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
// @limit external: the model API's tool name matches ^[a-zA-Z0-9_-]{1,64}$ (https://docs.anthropic.com/en/docs/build-with-claude/tool-use/implement-tool-use)
const TOOL_NAME_MAX = 64;
const HARNESS_PREFIX = "mcp__cawco__";
const TOOL_NAME_SAFE = /^[A-Za-z0-9_-]+$/u;
const TOOL_NAME_UNSAFE = /[^A-Za-z0-9_-]/gu;
/** Hex characters of the real name's hash an alias ends with. */
const ALIAS_HASH = 6;

/**
 * The name a session is listed a connection's tool by: `conn__<name>__<tool>`
 * when that fits a harness's rule; else the tool's name made safe, cut to
 * fit, and ended with a hash of the real name, so it stays one name per
 * tool. A session calls only what it was listed, so the hub reads the real
 * name back through its listing.
 */
const sessionToolName = (connection: string, tool: string): string => {
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
    // @limit measured: 6 hex characters are 24 bits of a hash; one connection's tool aliases share the namespace, so two collide after about 2^12 names
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
  /** Each connection's client once connected, by row id: kept until its transport closes or it is let go. */
  const clients = new Map<string, Client>();
  /** Each connection's connect under way, shared by every call meanwhile, by row id and {@link clientGens}. */
  const connecting = makeJoin<string, Bounded<Client>, unknown>();
  /** How many times each connection's client was let go: a connect begun before is closed once it lands, never kept. */
  const clientGens = new Map<string, number>();
  /** Each connection's tools as it last listed them, by row id. */
  const listed = new Map<string, Tool[]>();

  const row = (name: string): ConnectionRow =>
    db.byName(name) ?? misfit(`There is no connection ${name}.`);

  /**
   * What a row holds, its secrets opened. A secret the hub's key cannot open
   * reads as none (db/schema.ts `sealedText`), so the connection asks for
   * its key or sign-in again rather than every listing failing. What only
   * needs its plain facts reads them off the row ({@link factsOf}).
   */
  const opened = (r: ConnectionRow): ConnectionHeld => db.held(r);

  /** Changes what a row holds, read fresh: an OAuth step and a refresh may interleave. */
  const reseal = (
    id: string,
    change: (held: ConnectionHeld) => ConnectionHeld
  ) => {
    const fresh = db.byId(id);
    if (!fresh) {
      return;
    }
    db.hold(id, change(opened(fresh)));
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
      sealed.app?.service === "github" ? sealed.app.clientSecret : undefined,
      sealed.app?.service === "github" ? sealed.app.webhookSecret : undefined,
      sealed.app?.service === "linear" ? sealed.app.clientSecret : undefined,
      sealed.device?.deviceCode,
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
  const githubApps = new Map<
    string,
    { auth: GitHubAppAuth; made: string; octokit: GitHubClient }
  >();

  /** A GitHub App connection's Octokit and the app auth that signs its requests, as {@link githubApps} holds them. */
  const githubApp = (
    r: ConnectionRow,
    app: Extract<HeldApp, { service: "github" }>
  ) => {
    if (!app.installationId) {
      return misfit(
        `${r.name}'s GitHub App isn't installed yet: install it on the repositories it reads.`
      );
    }
    const made = createHash("sha256")
      .update(JSON.stringify([app, GITHUB_API]))
      .digest("hex");
    const held = githubApps.get(r.id);
    if (held?.made === made) {
      return held;
    }
    // Its requests and `auth({ type: "installation" })` share the app
    // auth's one installation-token cache (providers github/client.ts).
    const signer = githubAppClient({
      api: GITHUB_API,
      appId: app.appId,
      installationId: Number(app.installationId),
      privateKey: app.privateKey,
      userAgent: "CawCo-hub",
    });
    const { octokit } = signer;
    const appAuth =
      signer.auth ?? misfit(`${r.name}'s GitHub App auth wasn't made.`);
    const kept = { auth: appAuth, made, octokit };
    githubApps.set(r.id, kept);
    return kept;
  };

  const githubAppOctokit = (
    r: ConnectionRow,
    app: Extract<HeldApp, { service: "github" }>
  ): GitHubClient => githubApp(r, app).octokit;

  /** A token's refresh under way (a Linear app's, a code sign-in's), by row id: two callers share one. */
  const refreshing = makeJoin<string, string, unknown>();

  /** Each `gh` connection's last token read from its machine, by row id, and when. */
  const ghRead = new Map<string, { at: number; token: string }>();

  /**
   * A `gh` connection's token: read on its machine when the last read is
   * {@link GH_FRESH_MS} old (or was let go on GitHub's refusal), so a new
   * `gh auth login` there is what the next read finds; sealed here when it
   * moved. While the machine is away, the sealed token goes; a machine whose
   * gh has no sign-in for the account puts its words on the row.
   */
  const ghToken = async (r: ConnectionRow): Promise<string> => {
    const { gh, key } = opened(r);
    if (!gh) {
      return misfit(`${r.name} names no machine's gh: connect it again.`);
    }
    const held = ghRead.get(r.id);
    if (held && held.at > Date.now() - GH_FRESH_MS) {
      return held.token;
    }
    const read = await deps.gh.token(gh.machineId, gh.host, gh.login);
    if (read.kind === "token") {
      ghRead.set(r.id, { token: read.token, at: Date.now() });
      if (read.token !== key) {
        reseal(r.id, (sealed) => ({ ...sealed, key: read.token }));
      }
      return read.token;
    }
    if (read.kind === "away" && key) {
      return key;
    }
    const machine = deps.gh.machineName(gh.machineId);
    const said =
      read.kind === "refused"
        ? connectionsWords.ghSignInAgain(gh.login, machine)
        : `${read.why} The hub holds no token from its gh yet.`;
    setState(r, "error", said);
    return misfit(`${r.name}: ${said}`);
  };

  /**
   * `r`'s access token, or, near its end, the one `refresh` gets with its
   * refresh token: one refresh at a time per connection, shared by every
   * caller meanwhile.
   */
  const accessRefreshed = (
    r: ConnectionRow,
    tokens: ConnectionHeld["tokens"],
    refresh: (refreshToken: string | undefined) => Promise<string>
  ): Promise<string> => {
    if (!tokens) {
      return Promise.reject(
        new ConnectionProblem({
          message: `${r.name} is not signed in: ${r.reason ?? connectionsWords.saidSignIn}`,
        })
      );
    }
    if (
      !r.tokensExpireAt ||
      r.tokensExpireAt.getTime() > Date.now() + LINEAR_REFRESH_EARLY_MS
    ) {
      return Promise.resolve(tokens.access_token);
    }
    // The promise edge of the connection's one refresh, joined by every call meanwhile.
    return deps.lifetime.run(
      refreshing.run(
        r.id,
        Effect.tryPromise({
          try: () => refresh(tokens.refresh_token),
          catch: (error) => error,
        })
      )
    );
  };

  /**
   * A `device` connection's access token, refreshed with its refresh token
   * when near its end ("`client_secret` … Required unless the token was
   * generated using the device flow", docs.github.com): the new pair is kept
   * at once, since "Once you use a refresh token, that refresh token and the
   * old access token will no longer work". A token without an end (expiring
   * tokens off on the app) is sent as it is.
   */
  const deviceAccess = (r: ConnectionRow): Promise<string> =>
    accessRefreshed(r, opened(r).tokens, async (refreshToken) => {
      const answer = refreshToken
        ? await postToGitHub(
            "/login/oauth/access_token",
            {
              client_id: GITHUB_DEVICE_CLIENT_ID,
              grant_type: "refresh_token",
              refresh_token: refreshToken,
            },
            GitHubTokenAnswer
          ).catch((error: unknown): GitHubTokenAnswer => ({
            error: error instanceof Error ? error.message : String(error),
          }))
        : { error: "no refresh token" };
      if ("error" in answer) {
        const said = `GitHub refused to refresh its sign-in (${answer.error_description ?? answer.error}). Sign in again.`;
        setState(r, "needs-sign-in", said);
        return misfit(`${r.name}: ${said}`);
      }
      keepTokens(r.id, answer);
      drop(r.id);
      return answer.access_token;
    });

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
        new ConnectionProblem({
          message: `${r.name} needs its Linear app: set its client id and client secret.`,
        })
      );
    }
    return accessRefreshed(r, tokens, async (refreshToken) => {
      if (!refreshToken) {
        setState(r, "needs-sign-in", "Its sign-in ran out. Sign in again.");
        return misfit(`${r.name}'s sign-in ran out. Sign in again.`);
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
        const said = cutShort(
          scrub(r, error instanceof Error ? error.message : String(error)),
          300
        );
        setState(
          r,
          "needs-sign-in",
          `Linear refused to refresh its sign-in (${said}). Sign in again.`
        );
        // biome-ignore lint/style/useErrorCause: the token response may carry tokens; only scrubbed words go on
        throw new ConnectionProblem({
          message: `${r.name}: Linear refused to refresh its sign-in (${said}). Sign in again.`,
        });
      }
    });
  };

  /** Each app, gh or code connection's MCP client's token, when it runs out, ms: the client is let go before. */
  const appExpiry = new Map<string, number>();

  /**
   * The bearer an `app`, `gh` or `device` connection's MCP client is made
   * with, and when the client is let go for a new one: a gh token's after a
   * read's freshness, so the next client carries whatever gh holds then.
   */
  const bearerOf = async (
    r: ConnectionRow
  ): Promise<{ expiresAt: number; token: string } | undefined> => {
    if (r.auth === "app") {
      return await appToken(r);
    }
    if (r.auth === "gh") {
      return {
        token: await ghToken(r),
        expiresAt: Date.now() + GH_FRESH_MS + APP_TOKEN_EARLY_MS,
      };
    }
    if (r.auth === "device") {
      const token = await deviceAccess(r);
      return {
        token,
        expiresAt:
          db.byId(r.id)?.tokensExpireAt?.getTime() ?? Number.POSITIVE_INFINITY,
      };
    }
    return undefined;
  };

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
      return misfit(`${r.name} needs its app: ${NO_SECRET}.`);
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
      const minted = await githubApp(r, app).auth({ type: "installation" });
      return { token: minted.token, expiresAt: Date.parse(minted.expiresAt) };
    } catch (error) {
      const said = cutShort(
        scrub(r, error instanceof Error ? error.message : String(error)),
        300
      );
      setState(
        r,
        "needs-sign-in",
        `GitHub refused the app's token (${said}). Sign in to register it again.`
      );
      // biome-ignore lint/style/useErrorCause: GitHub's error may echo the JWT; only scrubbed words go on
      throw new ConnectionProblem({
        message: `${r.name}: GitHub refused the app's token (${said}). Sign in to register it again.`,
      });
    }
  };

  /** `text` with each of the row's secrets replaced. */
  const scrub = (r: ConnectionRow, text: string): string =>
    secretsOf(r).reduce(
      (out, secret) => out.split(secret).join("[connection key]"),
      text
    );

  /** A `gh` connection's machine and account, and a code sign-in's code while it can finish, for a view. */
  const githubWays = ({
    device,
    gh,
  }: ConnectionFacts): Pick<ConnectionView, "device" | "gh"> => ({
    ...(gh
      ? {
          gh: {
            machineId: gh.machineId,
            machine: deps.gh.machineName(gh.machineId),
            host: gh.host,
            login: gh.login,
          },
        }
      : {}),
    ...(device && device.expiresAt > Date.now()
      ? {
          device: {
            userCode: device.userCode,
            verificationUri: device.verificationUri,
            expiresAt: device.expiresAt,
          },
        }
      : {}),
  });

  const view = (r: ConnectionRow): ConnectionView => {
    const facts = factsOf(r);
    const sealed = opened(r);
    const tools = listed.get(r.id);
    const app = facts.app ? appView(facts.app) : undefined;
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
      ...(app ? { app } : {}),
      ...githubWays(facts),
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
      areas: db.areasOf(r.id),
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

  /**
   * Closes a client let go, whatever its close comes to: on the hub's
   * lifetime, or, once the lifetime has closed (its releases run then, and
   * nothing forks after close), at once.
   */
  const closeClient = (client: Client): void => {
    if (deps.lifetime.closed()) {
      client.close().catch(() => undefined);
      return;
    }
    deps.lifetime.fork(
      "connection client close",
      Effect.tryPromise({
        try: () => client.close(),
        catch: () => "unclosed",
      }).pipe(Effect.ignore)
    );
  };

  /** Closes and forgets a connection's client, and one connecting: its next call connects again. */
  const drop = (id: string) => {
    clientGens.set(id, (clientGens.get(id) ?? 0) + 1);
    const client = clients.get(id);
    clients.delete(id);
    if (client !== undefined) {
      closeClient(client);
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
    const fresh = () => db.byId(id) ?? misfit("This connection was removed.");
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
        misfit("This sign-in has no verifier. Start sign-in again."),
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
      misfit(`${r.name} needs its key: ${NO_SECRET}.`);
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

  /**
   * An `oauth` connection's row once its access token is fresh: one within a
   * minute of its end is refreshed first by the SDK's `auth()`, which keeps
   * the new pair; a refresh that would need the person has marked the row,
   * and nothing is sent.
   */
  const oauthRefreshed = async (r: ConnectionRow): Promise<ConnectionRow> => {
    if (
      r.tokensExpireAt &&
      r.tokensExpireAt.getTime() <= Date.now() + 60_000 &&
      (await auth(provider(r.id), { serverUrl: r.url ?? "" })) !== "AUTHORIZED"
    ) {
      misfit(`${r.name} is not signed in: its sign-in ran out. Sign in again.`);
    }
    return db.byId(r.id) ?? r;
  };

  const connect = (r: ConnectionRow): Effect.Effect<Bounded<Client>, unknown> =>
    Effect.gen(function* () {
      if (r.auth === "oauth") {
        yield* Effect.tryPromise({
          try: () => oauthRefreshed(r),
          catch: (error) => error,
        });
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
      const connected = Effect.tryPromise({
        try: async (signal) => {
          // An app's token is minted, a gh token read or a code sign-in's
          // refreshed, within the same time.
          const bearer = await bearerOf(r);
          if (bearer) {
            appExpiry.set(r.id, bearer.expiresAt);
          }
          const transport = transportOf(r, bearer?.token);
          // The SDK's own clock (60 s unless given) never decides: the bounded read does.
          await client.connect(transport, { signal, timeout: SDK_CLOCK_OFF });
          return client;
        },
        catch: (error) => error,
      });
      return yield* boundedOf(CONNECT_MS, connected);
    });

  /**
   * A connect that landed: its client kept for every later call, unless it
   * was let go while it connected (or the hub closed), when it is closed.
   * A connect not answered in time keeps nothing.
   */
  const landed = (
    id: string,
    gen: number,
    connected: Bounded<Client>
  ): Bounded<Client> => {
    if (connected.kind !== "answered") {
      return connected;
    }
    const client = connected.value;
    if ((clientGens.get(id) ?? 0) !== gen || deps.lifetime.closed()) {
      closeClient(client);
      return connected;
    }
    clients.set(id, client);
    // A stdio process that exits, or a stream the server ends: the next
    // call connects again instead of finding a dead client.
    client.onclose = () => {
      if (clients.get(id) === client) {
        clients.delete(id);
      }
    };
    return connected;
  };

  /**
   * A connection's client, connected once and shared; forgotten when its
   * transport closes, or when it did not connect in time. An app's client
   * is let go before its token runs out, and the next connects with a new.
   */
  const clientOf = (
    r: ConnectionRow
  ): Effect.Effect<Bounded<Client>, unknown> =>
    Effect.suspend(() => {
      if (
        (appExpiry.get(r.id) ?? Number.POSITIVE_INFINITY) <=
        Date.now() + APP_TOKEN_EARLY_MS
      ) {
        appExpiry.delete(r.id);
        drop(r.id);
      }
      const live = clients.get(r.id);
      if (live !== undefined) {
        return Effect.succeed<Bounded<Client>>({
          kind: "answered",
          value: live,
        });
      }
      const gen = clientGens.get(r.id) ?? 0;
      return connecting.run(
        `${r.id}\u0000${gen}`,
        connect(r).pipe(Effect.map((connected) => landed(r.id, gen, connected)))
      );
    });

  /** Keeps a connection's tool list, telling sessions' lists when it moved. */
  const keepListing = (id: string, tools: Tool[]) => {
    const before = listed.get(id);
    listed.set(id, tools);
    if (!Bun.deepEquals(tools, before)) {
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
      misfit(`${r.name} is not signed in: ${r.reason ?? NO_SECRET}.`);
    }
    // The promise edge of one use: its callers are routes and tools.
    const once = (): Promise<Bounded<T>> =>
      deps.lifetime.run(
        Effect.gen(function* () {
          const connected = yield* clientOf(r);
          if (connected.kind === "unanswered") {
            return connected;
          }
          const answer = yield* boundedOf(
            ms,
            Effect.tryPromise({
              try: (signal) => use(connected.value, signal),
              catch: (error) => error,
            })
          );
          if (answer.kind === "answered") {
            setState(r, "signed-in", null);
          }
          return answer;
        })
      );
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
        : "Sign in to register its app again.";
    }
    if (r.auth === "gh") {
      const { gh } = factsOf(r);
      return gh
        ? `Run gh auth login on ${deps.gh.machineName(gh.machineId)}; the next read picks it up.`
        : "Connect it again.";
    }
    if (r.auth === "device") {
      return "Sign in again with a code.";
    }
    return "Set its key again.";
  };

  /** "<name> did not answer within N s": a use of a connection that was not answered. */
  const unanswered = (r: ConnectionRow, after: number): ConnectionProblem =>
    new ConnectionProblem({
      message: `${r.name} did not answer within ${secondsOf(after)} s.`,
    });

  /**
   * What a failed use of a row's client becomes, the row's state moved with
   * it. The upstream error itself goes no further: it may carry the key, so
   * only its words, scrubbed, do.
   */
  const failure = (r: ConnectionRow, error: unknown): ConnectionProblem => {
    if (error instanceof ConnectionProblem) {
      return error;
    }
    const said = cutShort(
      scrub(r, error instanceof Error ? error.message : String(error)),
      300
    );
    if (error instanceof McpError) {
      return new ConnectionProblem({ message: `${r.name} answered: ${said}` });
    }
    drop(r.id);
    if (refusedSignIn(error)) {
      const again = againOf(r);
      // A gh token is read again on the next use: a new gh login there is
      // what signs it back in, so the row stays one the hub tries.
      ghRead.delete(r.id);
      setState(
        r,
        r.auth === "gh" ? "error" : "needs-sign-in",
        `The service refused the sign-in. ${again}`
      );
      return new ConnectionProblem({
        message: `${r.name} refused the hub's sign-in. ${again}`,
      });
    }
    setState(r, "error", said);
    return new ConnectionProblem({
      message: `${r.name} could not be reached: ${said}`,
    });
  };

  const listAll = async (
    client: Client,
    signal: AbortSignal
  ): Promise<Tool[]> => {
    const tools: Tool[] = [];
    let cursor: string | undefined;
    do {
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
      default:
        unhandled("read", listing);
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
        // The SDK's callTool is typed with the compatibility shape beside it; the answer is read as the current one.
        result = CallToolResultSchema.parse(called.value);
        break;
      case "unanswered":
        throw unanswered(r, called.after);
      default:
        unhandled("read", called);
    }
    const text = JSON.stringify(result);
    const clean = scrub(r, text);
    return clean === text
      ? result
      : CallToolResultSchema.parse(JSON.parse(clean));
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
          // The SDK's callTool is typed with the compatibility shape beside it; the answer is read as the current one.
          result = CallToolResultSchema.parse(called.value);
          break;
        case "unanswered":
          // It went, or its connection was being made: it may have run.
          return {
            kind: "unknown",
            error: unanswered(r, called.after).message,
          };
        default:
          unhandled("read", called);
      }
      const text = JSON.stringify(result);
      const clean = scrub(r, text);
      return {
        kind: "answered",
        result:
          clean === text
            ? result
            : CallToolResultSchema.parse(JSON.parse(clean)),
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
      misfit(why);
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
    return proposable(actor);
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

  /**
   * What decides `actor`'s connection tools ({@link sessionTools}), as a
   * key: the granted connections that list now, and whether it takes their
   * reads alone. A connection's own listing moving tells `changed`, which
   * makes every session's listing again (delegation-mcp.ts `toolInputsChanged`).
   */
  const sessionToolsKey = (actor: InstanceRow): string => {
    const names = new Set(granted(actor));
    const listing = db
      .list()
      .filter((r) => r.state !== "needs-sign-in" && names.has(r.name))
      .map((r) => r.name)
      .sort();
    return `${connectionToolsFor(roleOf(actor))}:${listing.join(",")}`;
  };

  /** A session's `conn__<name>__<tool>` call: run as the hub when its type or project grants it. */
  const callAs = async (
    actor: InstanceRow,
    name: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult> => {
    const parsed =
      parseConnectionTool(name) ?? misfit(`${name} is not a connection tool.`);
    if (!granted(actor).includes(parsed.connection)) {
      misfit(
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
      misfit(
        `${name} is not one of ${parsed.connection}'s tools as the hub last listed them.`
      );
    if (connectionToolsFor(roleOf(actor)) === "read-only" && !readsOnly(tool)) {
      misfit(
        `${name} isn't available here: this session reads the outside world, so it gets only a connection's read-only tools.`
      );
    }
    console.info(
      `[connections] ${actor.id} calls ${parsed.connection}/${tool.name}`
    );
    const result = await callConnection(parsed.connection, tool.name, args);
    if (!(readsOnly(tool) || result.isError)) {
      deps.wrote(actor, answerText(result));
    }
    return result;
  };

  /** Refuses an area the hub keeps none of. */
  const areasProblem = (areas: string[] | undefined) => {
    const unknown = (areas ?? []).find((id) => !deps.areaExists(id));
    if (unknown) {
      misfit(areaWords.scopeNoArea(unknown));
    }
  };

  const projectsProblem = (projects: string[] | undefined) => {
    const unknown = (projects ?? []).filter((id) => !deps.projectExists(id));
    if (unknown.length > 0) {
      misfit(`There is no project ${unknown.join(", ")}.`);
    }
  };

  /**
   * THE write of a connection's projects, for every way one is made or
   * changed: the projects it drops and the ones it names go on to their
   * GitHub pollers ({@link ConnectionsDeps.projectsWritten}).
   */
  const writeProjects = (
    r: Pick<ConnectionRow, "id" | "name">,
    projects: readonly string[]
  ): void => {
    const had = db.projectsOf(r.id);
    db.setProjects(r.id, [...projects]);
    const now = new Set(db.projectsOf(r.id));
    deps.projectsWritten(
      r.name,
      had.filter((project) => !now.has(project))
    );
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
    authKind: ConnectionAuth,
    service: string
  ): Pick<ConnectionRow, "state" | "reason"> => {
    if (authKind === "none" || authKind === "gh") {
      return { state: "error", reason: connectionReasons.notLookedAt };
    }
    const reasons: Record<Exclude<ConnectionAuth, "none" | "gh">, string> = {
      oauth: connectionsWords.saidSignIn,
      // A GitHub App is registered and installed through its sign-in.
      app:
        appServiceOf(service) === "github"
          ? connectionsWords.saidSignIn
          : connectionsWords.saidSetApp,
      device: connectionsWords.saidSignIn,
      bearer: connectionsWords.saidSetKey,
      header: connectionsWords.saidSetKey,
    };
    return { state: "needs-sign-in", reason: reasons[authKind] };
  };

  const create = async (input: ConnectionInput): Promise<ConnectionView> => {
    const said = inputProblem(input);
    if (said) {
      misfit(said);
    }
    if (input.auth === "gh") {
      misfit(
        "A gh connection is made from a machine's gh: pick it in Sign in to GitHub."
      );
    }
    if (db.byName(input.name)) {
      misfit(`There is a connection ${input.name} already.`);
    }
    projectsProblem(input.projects);
    areasProblem(input.areas);
    const now = new Date();
    const id = crypto.randomUUID();
    db.insert({
      id,
      name: input.name,
      service: input.service.trim(),
      account: input.account.trim(),
      ...whereOf(input),
      ...startState(input.auth, input.service),
      ...LET_GO,
      createdAt: now,
      updatedAt: now,
    });
    writeProjects({ id, name: input.name }, input.projects ?? []);
    db.setAreas(id, input.areas ?? []);
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
      misfit(said);
    }
    projectsProblem(patch.projects);
    areasProblem(patch.areas);
    const where = whereOf(next);
    const moved = !Bun.deepEquals(where, whereOf(r));
    if (moved && (next.auth === "gh" || r.auth === "gh")) {
      misfit(
        `${name} reads a machine's gh: remove it and connect another way instead.`
      );
    }
    const had = new Set(db.projectsOf(r.id));
    db.update(r.id, {
      service: next.service.trim(),
      account: next.account.trim(),
      ...where,
      ...(moved ? { ...startState(next.auth, next.service), ...LET_GO } : {}),
    });
    // Written even when only its service or sign-in changed: its pollers
    // follow what it is now.
    writeProjects(r, patch.projects ?? [...had]);
    if (patch.areas) {
      db.setAreas(r.id, patch.areas);
    }
    if (moved) {
      db.hold(r.id, {});
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
      const instead: Record<
        Exclude<ConnectionAuth, "bearer" | "header">,
        string
      > = {
        none: "it takes none.",
        oauth: "start its sign-in instead.",
        app: "sign in instead.",
        gh: "it reads its machine's gh.",
        device: "sign in with a code instead.",
      };
      misfit(`${name} signs in with ${r.auth}, not a key: ${instead[r.auth]}`);
    }
    if (!key.trim()) {
      misfit("A key is at least 1 character.");
    }
    reseal(r.id, () => ({ key: key.trim() }));
    drop(r.id);
    db.update(r.id, { state: "error", reason: connectionReasons.notLookedAt });
    console.info(`[connections] ${name}: key set`);
    await probe(name);
    reached(name, db.projectsOf(r.id));
    return view(row(name));
  };

  /**
   * Holds a Linear app's client id and secret, which then signs in. What it
   * held before is let go. A GitHub App is registered by its sign-in instead
   * ({@link startManifest}).
   */
  const setApp = (name: string, input: AppInput): ConnectionView => {
    const r = row(name);
    const service = appServiceOf(r.service);
    if (r.auth !== "app" || !service) {
      return misfit(`${name} signs in with ${r.auth}, not as an app.`);
    }
    if (service === "github") {
      return misfit(connectionsWords.githubAppRegisters(name));
    }
    const app = linearAppOf(input);
    if (typeof app === "string") {
      return misfit(app);
    }
    reseal(r.id, () => ({ app }));
    drop(r.id);
    appExpiry.delete(r.id);
    db.update(r.id, {
      tokensExpireAt: null,
      state: "needs-sign-in",
      reason: connectionsWords.saidSignIn,
    });
    console.info(`[connections] ${name}: app set`);
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
      return misfit(
        `${r.name} needs its Linear app first: set its client id and client secret.`
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
      return misfit(
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

  // --- GitHub App from a manifest ------------------------------------------

  /**
   * A GitHub App's sign-in: the hub's own page that posts the app's manifest
   * to GitHub from the person's browser ("a `POST` request to
   * `https://github.com/settings/apps/new` for a personal account or
   * `https://github.com/organizations/ORGANIZATION/settings/apps/new` for an
   * organization account", docs.github.com). Whatever app it held is let go:
   * this registers a new one, under the organization named, else the one
   * its last sign-in named (a press on the row names none). The steps run
   * within the hour GitHub gives.
   */
  const startManifest = (
    r: ConnectionRow,
    base: URL,
    organization: string | undefined
  ): { authorizationUrl: string } => {
    const org = (organization ?? factsOf(r).org ?? "").trim();
    if (org && !GITHUB_LOGIN.test(org)) {
      return misfit(
        "The organization is its login on GitHub, like the name in github.com/your-org."
      );
    }
    const state = crypto.randomUUID();
    const page = new URL(`${base.origin}${GITHUB_MANIFEST_PATH}`);
    page.searchParams.set("state", state);
    if (org) {
      page.searchParams.set("org", org);
    }
    reseal(r.id, () => (org ? { org } : {}));
    db.update(r.id, {
      signInState: state,
      signInRedirect: base.origin,
      signInExpiresAt: new Date(Date.now() + MANIFEST_MS),
      signInUrl: page.toString(),
      tokensExpireAt: null,
    });
    drop(r.id);
    appExpiry.delete(r.id);
    githubApps.delete(r.id);
    setState(r, "needs-sign-in", connectionsWords.saidUnderWay);
    console.info(`[connections] ${r.name}: GitHub App registration started`);
    return { authorizationUrl: page.toString() };
  };

  /** The row a GitHub App sign-in's `state` names, while it can still finish. */
  const manifestRow = (state: string | undefined): ConnectionRow => {
    const r = state ? db.bySignInState(state) : undefined;
    if (!(
      r?.signInExpiresAt &&
      r.signInExpiresAt.getTime() > Date.now() &&
      r.auth === "app" &&
      appServiceOf(r.service) === "github"
    )) {
      return misfit(
        "This GitHub App sign-in expired or was already completed. Sign in again from Connections."
      );
    }
    return r;
  };

  /**
   * The page that posts the manifest: a form to GitHub's, sent as it loads,
   * its button for a browser that runs no script. The manifest asks for what
   * polling reads and no webhook ("`hook_attributes` … `active` … Deliver
   * event details when this hook is triggered"); GitHub's redirect and the
   * installation's setup come back to the hub at the address the browser
   * reached it by.
   */
  const manifestPage = (state: string | undefined): string => {
    const r = manifestRow(state);
    const page = new URL(r.signInUrl ?? "");
    const org = page.searchParams.get("org") ?? "";
    const origin = r.signInRedirect ?? deps.hubOrigin();
    const manifest = {
      name: `CawCo ${r.account}`.slice(0, APP_NAME_MAX).trim(),
      url: origin,
      description:
        "Reads issues, pull requests and discussions for a CawCo hub.",
      public: false,
      redirect_url: `${origin}${GITHUB_CREATED_PATH}`,
      setup_url: `${origin}${GITHUB_INSTALLED_PATH}`,
      hook_attributes: { url: `${origin}/`, active: false },
      default_permissions: GITHUB_APP_PERMISSIONS,
      default_events: [],
    };
    const action = new URL(
      org
        ? `${GITHUB_WEB}/organizations/${org}/settings/apps/new`
        : `${GITHUB_WEB}/settings/apps/new`
    );
    action.searchParams.set("state", r.signInState ?? "");
    return [
      "<!doctype html>",
      '<html lang="en"><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      "<title>Register CawCo's GitHub App</title>",
      `<form id="manifest" method="post" action="${htmlText(action.toString())}">`,
      `<input type="hidden" name="manifest" value="${htmlText(JSON.stringify(manifest))}">`,
      "<p>Taking you to GitHub to name the app.</p>",
      '<button type="submit">Continue to GitHub</button>',
      "</form>",
      '<script>document.getElementById("manifest").submit()</script>',
      "</html>",
    ].join("\n");
  };

  /**
   * GitHub's redirect once the app is made: its code exchanged for the app's
   * ID, private key, client and webhook secrets ("POST
   * /app-manifests/{code}/conversions"), kept sealed, and the installation
   * page the person goes on to, carrying the sign-in's `state` back ("you can
   * include a `state` query parameter in the installation URL").
   */
  const appCreated = async (
    code: string,
    state: string | undefined
  ): Promise<string> => {
    const r = manifestRow(state);
    let made: {
      client_id: string;
      client_secret: string;
      id: number;
      pem: string;
      slug?: string;
      webhook_secret: string | null;
    };
    try {
      made = (
        await githubAnonymousClient(
          GITHUB_API,
          "CawCo-hub"
        ).rest.apps.createFromManifest({ code })
      ).data;
    } catch (error) {
      setState(r, "needs-sign-in", connectionsWords.saidSignIn);
      return misfit(
        `GitHub did not hand over the app (${error instanceof Error ? cutShort(error.message, 200) : String(error)}). Sign in again from Connections.`
      );
    }
    const privateKey = pemOf(made.pem);
    if (!(privateKey && made.slug)) {
      return misfit(
        "GitHub handed over an app without a private key or a name. Sign in again from Connections."
      );
    }
    reseal(r.id, (sealed) => ({
      ...(sealed.org ? { org: sealed.org } : {}),
      app: {
        service: "github",
        appId: String(made.id),
        slug: made.slug,
        privateKey,
        clientId: made.client_id,
        clientSecret: made.client_secret,
        ...(made.webhook_secret ? { webhookSecret: made.webhook_secret } : {}),
      },
    }));
    const install = new URL(
      `${GITHUB_WEB}/apps/${encodeURIComponent(made.slug)}/installations/new`
    );
    install.searchParams.set("state", r.signInState ?? "");
    db.update(r.id, { signInUrl: install.toString() });
    console.info(
      `[connections] ${r.name}: GitHub App ${made.slug} registered, to be installed`
    );
    deps.changed();
    return install.toString();
  };

  /**
   * GitHub's setup redirect once the app is installed. Its `installation_id`
   * is asked of GitHub with the app's own JWT before it is kept ("Bad actors
   * can hit this URL with a spoofed `installation_id`", docs.github.com,
   * about the setup URL): only the app's own installation answers. Then the
   * connection is looked at. An organization's owner asked to approve it
   * (`setup_action` request) leaves the sign-in waiting.
   */
  const appInstalled = async (
    installationId: string | undefined,
    setupAction: string | undefined,
    state: string | undefined
  ): Promise<ConnectionView | "requested"> => {
    const r = manifestRow(state);
    const { app } = opened(r);
    if (app?.service !== "github") {
      return misfit(
        "This app was never handed over by GitHub. Sign in again from Connections."
      );
    }
    if (setupAction === "request" && !installationId) {
      return "requested";
    }
    if (!(installationId && DIGITS.test(installationId))) {
      return misfit(
        "GitHub's redirect named no installation. Install the app again from its page on GitHub."
      );
    }
    try {
      await githubAppJwtClient({
        api: GITHUB_API,
        appId: app.appId,
        privateKey: app.privateKey,
        userAgent: "CawCo-hub",
      }).rest.apps.getInstallation({ installation_id: Number(installationId) });
    } catch {
      return misfit(
        `GitHub doesn't know installation ${installationId} of ${app.slug ?? "this app"}. Install it again from its page on GitHub.`
      );
    }
    reseal(r.id, (sealed) => ({
      ...sealed,
      app: { ...app, installationId },
    }));
    db.update(r.id, {
      signInState: null,
      signInExpiresAt: null,
      signInUrl: null,
      state: "error",
      reason: connectionReasons.notLookedAt,
    });
    githubApps.delete(r.id);
    appExpiry.delete(r.id);
    drop(r.id);
    console.info(
      `[connections] ${r.name}: GitHub App installed (${installationId})`
    );
    await probe(r.name);
    reached(r.name, db.projectsOf(r.id));
    deps.changed();
    return view(row(r.name));
  };

  // --- GitHub with a code (device flow) -------------------------------------

  /** Each code sign-in's next poll while it waits for its time, by row id; its poll, once begun, is its own. */
  const devicePolls = new Map<string, Fiber.Fiber<void>>();

  /** Stops `id`'s next poll, if it has not begun. */
  const stopDevicePoll = (id: string) => {
    devicePolls.get(id)?.interruptUnsafe();
    devicePolls.delete(id);
  };

  /** Polls `id`'s code sign-in after `seconds`, the least GitHub's `interval` allows. */
  const pollDeviceIn = (id: string, seconds: number) => {
    stopDevicePoll(id);
    const next: Fiber.Fiber<void> = deps.lifetime.fork(
      "connection device sign-in poll",
      Effect.sleep(seconds * 1000).pipe(
        Effect.andThen(
          Effect.sync(() => {
            if (devicePolls.get(id) === next) {
              devicePolls.delete(id);
            }
          })
        ),
        Effect.andThen(Effect.promise(() => devicePoll(id)))
      )
    );
    devicePolls.set(id, next);
  };

  /** Lets go of a code sign-in under way: its code, and the row's sign-in. */
  const endDevice = (id: string) => {
    stopDevicePoll(id);
    reseal(id, (sealed) => ({ ...sealed, device: undefined }));
    db.update(id, {
      signInState: null,
      signInExpiresAt: null,
      signInUrl: null,
    });
  };

  /**
   * A code sign-in: GitHub's device and user codes for CawCo's OAuth app
   * ("POST https://github.com/login/device/code"), the user code shown on
   * the row until the person enters it at github.com/login/device, the hub
   * polling meanwhile. Any token held is let go: this is a new sign-in.
   */
  const startDevice = async (
    r: ConnectionRow
  ): Promise<{ authorizationUrl: string }> => {
    if (!GITHUB_DEVICE_CLIENT_ID) {
      return misfit(
        "Sign-in with a code needs CawCo's GitHub app, which isn't registered yet. Connect with gh on a machine, or as a GitHub App."
      );
    }
    let codes: InferOutput<typeof GitHubDeviceCodes>;
    try {
      codes = await postToGitHub(
        "/login/device/code",
        { client_id: GITHUB_DEVICE_CLIENT_ID, scope: DEVICE_SCOPE },
        GitHubDeviceCodes
      );
    } catch (error) {
      return misfit(
        `GitHub did not hand out a code: ${error instanceof Error ? error.message : String(error)}.`
      );
    }
    if ("error" in codes) {
      return misfit(
        `GitHub did not hand out a code (${codes.error_description ?? codes.error}).`
      );
    }
    const expiresAt = Date.now() + (codes.expires_in ?? 900) * 1000;
    const interval = codes.interval ?? 5;
    reseal(r.id, () => ({
      device: {
        deviceCode: codes.device_code,
        userCode: codes.user_code,
        verificationUri: codes.verification_uri,
        expiresAt,
        interval,
      },
    }));
    db.update(r.id, {
      signInState: crypto.randomUUID(),
      signInRedirect: null,
      signInExpiresAt: new Date(expiresAt),
      signInUrl: codes.verification_uri,
      tokensExpireAt: null,
    });
    drop(r.id);
    appExpiry.delete(r.id);
    setState(r, "needs-sign-in", connectionsWords.saidUnderWay);
    pollDeviceIn(r.id, interval);
    console.info(`[connections] ${r.name}: code sign-in started`);
    return { authorizationUrl: codes.verification_uri };
  };

  /**
   * One poll of a code sign-in ("POST https://github.com/login/oauth/access_token"
   * with the device code): `authorization_pending` polls again after the
   * interval, `slow_down` after the interval it names; a token is kept, its
   * refresh token with it, and the connection looked at; anything else
   * (`expired_token`, `access_denied`) ends the sign-in in GitHub's words.
   */
  const devicePoll = async (id: string): Promise<void> => {
    const r = db.byId(id);
    const pending = r ? opened(r).device : undefined;
    if (!(r && pending)) {
      return;
    }
    if (pending.expiresAt <= Date.now()) {
      endDevice(id);
      setState(r, "needs-sign-in", connectionsWords.signInLapsed);
      return;
    }
    let answer: GitHubTokenAnswer;
    try {
      answer = await postToGitHub(
        "/login/oauth/access_token",
        {
          client_id: GITHUB_DEVICE_CLIENT_ID,
          device_code: pending.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        },
        GitHubTokenAnswer
      );
    } catch (error) {
      console.warn(
        `[connections] ${r.name}: GitHub did not answer a code sign-in's poll (${error instanceof Error ? error.message : String(error)}); polling on`
      );
      pollDeviceIn(id, pending.interval);
      return;
    }
    if (!("error" in answer)) {
      endDevice(id);
      keepTokens(id, answer);
      db.update(id, { state: "error", reason: connectionReasons.notLookedAt });
      drop(id);
      console.info(`[connections] ${r.name}: signed in with a code`);
      await probe(r.name);
      reached(r.name, db.projectsOf(id));
      deps.changed();
      return;
    }
    if (answer.error === "authorization_pending") {
      pollDeviceIn(id, pending.interval);
      return;
    }
    if (answer.error === "slow_down") {
      const interval = answer.interval ?? pending.interval + 5;
      reseal(id, (sealed) => ({
        ...sealed,
        ...(sealed.device ? { device: { ...sealed.device, interval } } : {}),
      }));
      pollDeviceIn(id, interval);
      return;
    }
    endDevice(id);
    setState(
      r,
      "needs-sign-in",
      `GitHub ended the code sign-in (${answer.error_description ?? answer.error}). Sign in again.`
    );
  };

  // --- GitHub with a machine's gh -------------------------------------------

  /**
   * Every account a connected machine's gh is signed in to, each with the
   * connection already made from it, so Sign in to GitHub lists what one
   * press would make and what it already has.
   */
  const ghSignIns = async (): Promise<{
    signIns: (GhSignIn & { connection?: string })[];
    unread: string[];
  }> => {
    const { signIns, unread } = await deps.gh.accounts();
    const made = db.list().flatMap((r) => {
      const { gh } = r.auth === "gh" ? factsOf(r) : {};
      return gh ? [{ name: r.name, ...gh }] : [];
    });
    return {
      unread,
      signIns: signIns.map((one) => {
        const connection = made.find(
          (each) =>
            each.machineId === one.machineId &&
            each.host === one.host &&
            each.login === one.login
        )?.name;
        return connection ? { ...one, connection } : one;
      }),
    };
  };

  /**
   * One press of a machine's gh account: a `github` connection that reads
   * that account's token on that machine each time, named for the account,
   * acting as it. Its token is read at once, sealed, and the connection
   * looked at.
   */
  const connectGh = async (input: {
    host: string;
    login: string;
    machineId: string;
    projects?: string[];
  }): Promise<ConnectionView> => {
    const name = `github-${input.login.toLowerCase().replace(NOT_NAME, "-")}`
      // @limit measured: room under the 64-character tool name
      .slice(0, CONNECTION_NAME_LENGTH)
      .replace(TRAILING_HYPHENS, "");
    if (db.byName(name)) {
      return misfit(`There is a connection ${name} already.`);
    }
    projectsProblem(input.projects);
    const read = await deps.gh.token(input.machineId, input.host, input.login);
    if (read.kind !== "token") {
      return misfit(
        read.kind === "refused"
          ? connectionsWords.ghSignInAgain(
              input.login,
              deps.gh.machineName(input.machineId)
            )
          : read.why
      );
    }
    const now = new Date();
    const id = crypto.randomUUID();
    db.insert({
      id,
      name,
      service: "github",
      account: input.login,
      ...whereOf({ transport: "http", url: GITHUB_MCP, auth: "gh" }),
      state: "error",
      reason: connectionReasons.notLookedAt,
      ...LET_GO,
      createdAt: now,
      updatedAt: now,
    });
    reseal(id, () => ({
      gh: { machineId: input.machineId, host: input.host, login: input.login },
      key: read.token,
    }));
    ghRead.set(id, { token: read.token, at: Date.now() });
    writeProjects({ id, name }, input.projects ?? []);
    console.info(
      `[connections] made ${name} from gh on ${deps.gh.machineName(input.machineId)}`
    );
    await probe(name);
    reached(name, input.projects ?? []);
    deps.changed();
    return view(row(name));
  };

  /**
   * Starts an OAuth sign-in: the URL the person opens. Its redirect lands on
   * the hub at `origin` (where their browser reaches it), else the hub's own
   * address. Any tokens held are let go first: this is a new sign-in.
   */
  const startSignIn = async (
    name: string,
    origin?: string,
    organization?: string
  ): Promise<{ authorizationUrl: string }> => {
    const r = row(name);
    if (r.auth === "device") {
      return startDevice(r);
    }
    if (r.auth !== "oauth" && r.auth !== "app") {
      misfit(`${name} signs in with ${r.auth}, not OAuth.`);
    }
    const base = originOf(origin ?? deps.hubOrigin());
    const redirect = `${base.origin}${CONNECTION_CALLBACK_PATH}`;
    if (r.auth === "app" && appServiceOf(r.service) === "github") {
      return startManifest(r, base, organization);
    }
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
      throw new ConnectionProblem({
        message: `${name}'s sign-in could not start: ${cutShort(scrub(r, error instanceof Error ? error.message : String(error)), 300)}`,
      });
    }
    if (!authorizationUrl) {
      return misfit(`${name}'s server asked for no sign-in.`);
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
      return misfit(
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
    db.update(r.id, { state: "error", reason: connectionReasons.notLookedAt });
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
      return misfit(
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
      const said = cutShort(
        scrub(r, error instanceof Error ? error.message : String(error)),
        300
      );
      setState(r, "needs-sign-in", `Linear refused the sign-in (${said}).`);
      // biome-ignore lint/style/useErrorCause: the token response may carry tokens; only scrubbed words go on
      throw new ConnectionProblem({
        message: `Linear refused this sign-in (${said}). Start sign-in again.`,
      });
    }
  };

  /** An MCP server's code, exchanged through the SDK's flow over the row's discovery. */
  const exchangeMcp = async (
    r: ConnectionRow,
    code: string,
    state: string,
    iss: string | undefined
  ): Promise<void> => {
    const metadata = r.discovery?.authorizationServerMetadata;
    // RFC 9207: a server that names itself on the redirect must name itself.
    if (
      metadata &&
      "authorization_response_iss_parameter_supported" in metadata &&
      metadata.authorization_response_iss_parameter_supported === true &&
      iss !== metadata.issuer
    ) {
      return misfit(
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
      throw new ConnectionProblem({
        message:
          "The authorization server refused this sign-in. Start sign-in again.",
      });
    }
  };

  /**
   * An Octokit signed in as a `github` connection, for the tracker sync, the
   * GitHub poller, the relay's webhooks and `create_repo`: a
   * fine-grained personal access token's, or a GitHub App installation's,
   * whose tokens it mints and renews itself. Refused in words for any other
   * sign-in: an MCP OAuth token is for GitHub's MCP server.
   */
  const githubClient = (name: string): GitHubClient => {
    const r = row(name);
    if (appServiceOf(r.service) !== "github") {
      return misfit(`${name} is a ${r.service} connection, not a GitHub one.`);
    }
    const sealed = opened(r);
    if (r.auth === "app") {
      return sealed.app?.service === "github"
        ? githubAppOctokit(r, sealed.app)
        : misfit(`${name} needs its GitHub App: sign in to register it.`);
    }
    if (r.auth === "gh" || r.auth === "device") {
      // Each request is signed with the token as it is then: a gh token
      // read again once a minute old, a code sign-in's refreshed near its
      // end. GitHub refused the token: a gh connection reads its machine again.
      return githubTokenClient({
        api: GITHUB_API,
        userAgent: "CawCo-hub",
        token: async () => {
          const fresh = db.byId(r.id) ?? r;
          return r.auth === "gh"
            ? await ghToken(fresh)
            : await deviceAccess(fresh);
        },
        refused: () => {
          ghRead.delete(r.id);
        },
      });
    }
    if (r.auth === "bearer") {
      return githubTokenClient({
        api: GITHUB_API,
        userAgent: "CawCo-hub",
        token: sealed.key ?? misfit(`${name} needs its key: ${NO_SECRET}.`),
      });
    }
    return misfit(
      `${name} signs in with ${r.auth}; a tracker reads GitHub through gh on a machine, a code sign-in, a GitHub App or a fine-grained personal access token.`
    );
  };

  /**
   * A `github` connection's token as it is now, for what an Octokit can't
   * carry (`git push` to a repository just made): a machine's gh token, a
   * code sign-in's or an MCP sign-in's access token refreshed near its end, a
   * GitHub App installation's from the one cache its Octokit signs with, or a
   * personal access token. A connection that holds none is refused in words.
   */
  const githubToken = async (name: string): Promise<string> => {
    const r = row(name);
    if (appServiceOf(r.service) !== "github") {
      return misfit(`${name} is a ${r.service} connection, not a GitHub one.`);
    }
    const sealed = opened(r);
    switch (r.auth) {
      case "gh":
        return await ghToken(r);
      case "device":
        return await deviceAccess(r);
      case "oauth":
        return (
          opened(await oauthRefreshed(r)).tokens?.access_token ??
          misfit(
            `${name} is not signed in: ${r.reason ?? connectionsWords.saidSignIn}`
          )
        );
      case "app":
        return sealed.app?.service === "github"
          ? (await appToken(r)).token
          : misfit(`${name} needs its GitHub App: sign in to register it.`);
      case "bearer":
        return sealed.key ?? misfit(`${name} needs its key: ${NO_SECRET}.`);
      case "header":
      case "none":
        return misfit(
          `${name} signs in with ${r.auth}, which holds no GitHub token: connect it through gh on a machine, a code sign-in, a GitHub App or a fine-grained personal access token.`
        );
    }
  };

  /**
   * What a GitHub App connection's installation may do, as GitHub says now
   * (`GET /app/installations/{id}`, its `permissions`), asked with the app's
   * JWT: a tracker that files issues through it needs `issues: write`, which
   * the manifest's read-only registration lacks until the person grants it
   * on GitHub.
   */
  const githubAppPermissions = async (
    name: string
  ): Promise<{ permissions: Record<string, string>; slug: string }> => {
    const r = row(name);
    const { app } = opened(r);
    if (!(
      r.auth === "app" &&
      app?.service === "github" &&
      app.installationId
    )) {
      return misfit(`${name} is no installed GitHub App.`);
    }
    const { data } = await githubAppJwtClient({
      api: GITHUB_API,
      appId: app.appId,
      privateKey: app.privateKey,
      userAgent: "CawCo-hub",
    }).rest.apps.getInstallation({
      installation_id: Number(app.installationId),
    });
    return {
      permissions: data.permissions ?? {},
      slug: app.slug ?? name,
    };
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
      return misfit(`${name} is a ${r.service} connection, not a Linear one.`);
    }
    const apiUrl = `${LINEAR_API}/graphql`;
    let signedIn: { accessToken: string } | { apiKey: string };
    if (r.auth === "bearer") {
      signedIn = {
        apiKey: opened(r).key ?? misfit(`${name} needs its key: ${NO_SECRET}.`),
      };
    } else if (r.auth === "app") {
      signedIn = { accessToken: await linearAccess(r) };
    } else {
      return misfit(
        `${name} signs in with ${r.auth}; a tracker reads Linear through a Linear app or a personal API key.`
      );
    }
    return linearClientFor(signedIn, apiUrl);
  };

  /**
   * A GitLab client signed in as a `gitlab` connection, for the poll, a
   * link's read and the relay's webhooks: its key (a personal, project or
   * group access token) on the GitLab its server names (forge-hosts.ts
   * `forgeOf`). Refused in words for any other sign-in: an MCP OAuth token
   * is for GitLab's MCP server alone.
   */
  const gitlabClient = (name: string): GitLabClient => {
    const r = row(name);
    const forge = forgeOf(view(r));
    if (forge?.provider !== "gitlab") {
      return r.service.trim().toLowerCase() === "gitlab"
        ? misfit(
            `${name} signs in with ${r.auth}; CawCo reads GitLab with an access token (bearer) that has the api or read_api scope.`
          )
        : misfit(`${name} is a ${r.service} connection, not a GitLab one.`);
    }
    return gitlabTokenClient({
      api: forge.origin,
      token: opened(r).key ?? misfit(`${name} needs its key: ${NO_SECRET}.`),
    });
  };

  /**
   * A Gitea client: a `gitea` connection's own gitea-mcp tools, called as
   * the hub ({@link callConnection}), for the poll, a link's read and the
   * relay's webhooks.
   */
  const giteaClient = (name: string): GiteaClient => {
    const r = row(name);
    if (r.service.trim().toLowerCase() !== "gitea") {
      return misfit(`${name} is a ${r.service} connection, not a Gitea one.`);
    }
    return { call: (tool, args) => callConnection(name, tool, args) };
  };

  /**
   * The service refused the connection's sign-in to the hub's own call (the
   * tracker sync's): it needs a key or sign-in again, in the service's words.
   */
  const refusedBy = (name: string, words: string): void => {
    const r = db.byName(name);
    if (r) {
      drop(r.id);
      ghRead.delete(r.id);
      setState(
        r,
        r.auth === "gh" ? "error" : "needs-sign-in",
        `${words} ${againOf(r)}`
      );
    }
  };

  /** Lets it go into the hub's trash (db/trash.ts); answers the entry its Undo names. */
  const remove = (name: string): number => {
    const r = row(name);
    drop(r.id);
    listed.delete(r.id);
    githubApps.delete(r.id);
    appExpiry.delete(r.id);
    ghRead.delete(r.id);
    stopDevicePoll(r.id);
    const restore =
      deps.trash(name) ?? misfit(`There is no connection ${name}.`);
    console.info(`[connections] removed ${name}`);
    deps.changed();
    return restore;
  };

  /**
   * Back from the trash, its key, tokens and pollers with it (db/trash.ts):
   * looked at again, as at hub start, and a project it names that polls
   * with nothing now polls with it.
   */
  const returned = (name: string): ConnectionView => {
    const r = row(name);
    if (r.state !== "needs-sign-in") {
      deps.lifetime.fork(
        "connection back from the trash looked at",
        Effect.promise(() => probe(name))
      );
    }
    deps.projectsWritten(name, []);
    console.info(`[connections] ${name} back from the trash`);
    deps.changed();
    return view(r);
  };

  /**
   * A project folded into another (project-merge.ts): each connection the
   * duplicate was granted is granted to the project it joined, through the
   * one write, so the kept project's GitHub poller follows it.
   */
  const projectFolded = (grants: readonly string[], keepId: string): void => {
    for (const name of grants) {
      const r = row(name);
      writeProjects(r, [...db.projectsOf(r.id), keepId]);
    }
    if (grants.length > 0) {
      deps.changed();
    }
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
    githubToken,
    githubAppPermissions,
    gitlabClient,
    giteaClient,
    linearClient,
    refusedBy,
    lfsBasic,
    lfsProblem,
    sessionTools,
    sessionToolsKey,
    callAs,
    list: () => db.list().map(view),
    get: (name: string) => view(row(name)),
    create,
    update,
    setKey,
    setApp,
    startSignIn,
    completeSignIn,
    ghSignIns,
    connectGh,
    manifestPage,
    appCreated,
    appInstalled,
    remove,
    returned,
    projectFolded,
    /**
     * At hub start: each connection with a secret (or none needed) is looked
     * at once, off the boot path, and each code sign-in under way polled on.
     */
    start: () => {
      for (const r of db.list()) {
        const { device } = factsOf(r);
        if (device) {
          pollDeviceIn(r.id, device.interval);
        }
        if (r.state !== "needs-sign-in") {
          deps.lifetime.fork(
            "connection looked at first",
            Effect.promise(() => probe(r.name))
          );
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
    t.Literal("gh"),
    t.Literal("device"),
  ]),
  header: t.Optional(t.String()),
  projects: t.Optional(t.Array(t.String())),
  areas: t.Optional(t.Array(t.String())),
};

/** A page of plain text for a browser that lands on the hub: nothing it carries is read as markup. */
const plainText = (text: string, code = 200) =>
  new Response(text, {
    status: code,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });

/** A refusal as a 400 in words; anything else is the hub's own failure. */
const refused = (error: unknown) => {
  if (error instanceof ConnectionProblem) {
    return problem(400, { code: "connection-problem", detail: error.message });
  }
  throw error;
};

export const createConnectionBody = t.Object({
  name: t.String({ minLength: 1 }),
  ...INPUT,
});
export const updateConnectionBody = t.Partial(t.Object(INPUT));
export const signInBody = t.Object({
  origin: t.Optional(t.String()),
  organization: t.Optional(t.String()),
});

/**
 * What a connection is listed, created, changed, signed in and removed with:
 * the routes answer them, and the admin tools call them directly. A
 * connection's own refusal is a problem in its words; anything else is the
 * hub's own failure.
 */
export const connectionCalls = (connections: Connections) => ({
  list: () => ({ connections: connections.list() }),
  create: async (body: Static<typeof createConnectionBody>) => {
    try {
      return await connections.create(body);
    } catch (error) {
      return refused(error);
    }
  },
  update: async (name: string, body: Static<typeof updateConnectionBody>) => {
    try {
      return await connections.update(name, body);
    } catch (error) {
      return refused(error);
    }
  },
  /** A sign-in: an MCP server's or a Linear app's OAuth, a GitHub App's registration (under `organization` when named), or a code sign-in. */
  signIn: async (name: string, body: Static<typeof signInBody>) => {
    try {
      return await connections.startSignIn(
        name,
        body.origin,
        body.organization
      );
    } catch (error) {
      return refused(error);
    }
  },
  remove: (name: string) => {
    try {
      return undoable(connections.remove(name));
    } catch (error) {
      return refused(error);
    }
  },
});

/**
 * `/api/connections`: list, create, change, set a key, start a sign-in,
 * remove, and list a connection's tools. No route answers a key, and none
 * calls a tool: tools are called through a session's grant or by hub code.
 */
export const connectionRoutes = (connections: Connections) => {
  const calls = connectionCalls(connections);
  return (
    new Elysia()
      .get("/api/connections", () => calls.list())
      .post("/api/connections", { body: createConnectionBody }, ({ body }) =>
        calls.create(body)
      )
      .patch(
        "/api/connections/:name",
        { body: updateConnectionBody },
        ({ params, body }) => calls.update(params.name, body)
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
      // A Linear app's client id and secret. Answered as the view, which
      // names the app and never holds its secret. A GitHub App is registered
      // by its sign-in instead: the GitHub App body TestFlight ios 20261018
      // sends (installable until 2027-01-16) stays declared so that build
      // reads the refusal in words; it goes once that build expires (bash
      // apps/apple/scripts/testflight.sh --expire 20261018).
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
            if (!("clientId" in body)) {
              return problem(400, {
                code: "github-app-registers",
                detail: connectionsWords.githubAppRegisters(params.name),
              });
            }
            return await connections.setApp(params.name, body);
          } catch (error) {
            return refused(error);
          }
        }
      )
      .post(
        "/api/connections/:name/sign-in",
        { body: signInBody },
        ({ params, body }) => calls.signIn(params.name, body)
      )
      // Sign in to GitHub's first way: every account the fleet machines' gh
      // is signed in to, and the machines that didn't say.
      .get("/api/github-sign-in/gh", () => connections.ghSignIns())
      .post(
        "/api/github-sign-in/gh",
        {
          body: t.Object({
            machineId: t.String({ minLength: 1 }),
            host: t.String({ minLength: 1 }),
            login: t.String({ minLength: 1 }),
            projects: t.Optional(t.Array(t.String())),
          }),
        },
        async ({ body }) => {
          try {
            return await connections.connectGh(body);
          } catch (error) {
            return refused(error);
          }
        }
      )
      // A GitHub App's registration, in the person's browser: the page that
      // posts its manifest to GitHub, GitHub's redirect with the code, and the
      // installation's setup redirect. Each answers a page or plain text,
      // never JSON a script reads.
      .get(
        GITHUB_MANIFEST_PATH,
        {
          ...hidden,
          query: t.Object({
            state: t.Optional(t.String()),
            org: t.Optional(t.String()),
          }),
        },
        ({ query }) => {
          try {
            return new Response(connections.manifestPage(query.state), {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "no-store",
              },
            });
          } catch (error) {
            return plainText(
              error instanceof ConnectionProblem
                ? error.message
                : "The app's registration could not start. Sign in again from Connections.",
              400
            );
          }
        }
      )
      .get(
        GITHUB_CREATED_PATH,
        {
          ...hidden,
          query: t.Object({
            code: t.Optional(t.String()),
            state: t.Optional(t.String()),
          }),
        },
        async ({ query }) => {
          if (!query.code) {
            return plainText(
              "GitHub did not make the app. Sign in again from Connections.",
              400
            );
          }
          try {
            const install = await connections.appCreated(
              query.code,
              query.state
            );
            return new Response(null, {
              status: 302,
              headers: { Location: install, "Cache-Control": "no-store" },
            });
          } catch (error) {
            return plainText(
              error instanceof ConnectionProblem
                ? error.message
                : "The app could not be handed over. Sign in again from Connections.",
              400
            );
          }
        }
      )
      .get(
        GITHUB_INSTALLED_PATH,
        {
          ...hidden,
          query: t.Object({
            installation_id: t.Optional(t.String()),
            setup_action: t.Optional(t.String()),
            state: t.Optional(t.String()),
          }),
        },
        async ({ query }) => {
          try {
            const installed = await connections.appInstalled(
              query.installation_id,
              query.setup_action,
              query.state
            );
            return plainText(
              installed === "requested"
                ? "An owner of the organization was asked to approve the app. Connections signs it in once they do."
                : `Installed ${installed.app?.service === "github" ? (installed.app.slug ?? "the app") : "the app"} for ${installed.name}. You can close this tab.`
            );
          } catch (error) {
            return plainText(
              error instanceof ConnectionProblem
                ? error.message
                : "The installation could not finish. Install the app again from its page on GitHub.",
              400
            );
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
      .delete("/api/connections/:name", ({ params }) =>
        calls.remove(params.name)
      )
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
          if (!(query.code && query.state)) {
            return plainText(
              `The sign-in did not finish${query.error ? ` (${cutShort(query.error, 100)})` : ""}. Start it again.`,
              400
            );
          }
          try {
            const signed = await connections.completeSignIn(
              query.code,
              query.state,
              query.iss
            );
            return plainText(
              `Signed in to ${signed.service} as ${signed.account} (${signed.name}). You can close this tab.`
            );
          } catch (error) {
            return plainText(
              error instanceof ConnectionProblem
                ? error.message
                : "The sign-in could not finish. Start it again.",
              400
            );
          }
        }
      )
  );
};
