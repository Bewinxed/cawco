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
 * and hub code (the GitHub and connector pollers, approved actions) through
 * {@link Connections.callConnection} and {@link Connections.listConnectionTools}.
 *
 * OAuth is the MCP authorization flow the SDK runs (`auth()`: discovery,
 * registration, PKCE, exchange, refresh) over a provider whose storage is the
 * row: the redirect lands on the hub (`/api/connections/oauth/callback`), and
 * a 401 on a call refreshes the tokens here before the call is retried.
 */
import { createHash } from "node:crypto";
import {
  CONNECTION_AUTHS,
  CONNECTION_NAME,
  CONNECTION_TRANSPORTS,
  type ConnectionAuth,
  type ConnectionTransport,
  type ConnectionView,
  connectionToolName,
  type InstanceRow,
  parseConnectionTool,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import {
  auth,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
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
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  type CallToolResult,
  McpError,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Elysia, status, t } from "elysia";
import type { ConnectionRow, ConnectionsDb } from "./db/connections";
import type { ConnectionSecret } from "./db/schema";
import { hidden } from "./hidden";
import type { HubLifetimeShape } from "./lifetime";
import { connectionToolsFor, roleOf } from "./roles";

/** Where an OAuth sign-in's redirect lands: on the hub, never a session. */
export const CONNECTION_CALLBACK_PATH = "/api/connections/oauth/callback";

/** How long a sign-in waits for its redirect. Our choice, as fleet MCP's. */
const SIGN_IN_MS = 10 * 60_000;
/** A connect and a listing. Our choice. */
const CONNECT_MS = 30_000;
/** One tool call, its progress resetting the clock. Our choice. */
const CALL_MS = 5 * 60_000;

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
  /** The connections the delegate type a session runs as lists. */
  readonly typeConnections: (row: InstanceRow) => readonly string[];
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
  return input.transport === "stdio" ? stdioProblem(input) : httpProblem(input);
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

/** What a row lets go of when it moves: its secret, discovery and any sign-in. */
const LET_GO = {
  secret: null,
  discovery: null,
  signInState: null,
  signInRedirect: null,
  signInExpiresAt: null,
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
  const clients = new Map<string, Promise<Client>>();
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
    ].filter((one): one is string => typeof one === "string" && one.length > 0);
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
      ...(r.header ? { header: r.header } : {}),
      state: r.state,
      ...(r.reason ? { reason: r.reason } : {}),
      hasSecret: Boolean(sealed.key || sealed.tokens),
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
        client.then((one) => one.close()).catch(() => undefined),
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
      saveTokens: (tokens) => {
        reseal(id, (sealed) => ({ ...sealed, tokens }));
        db.update(id, {
          tokensExpireAt:
            tokens.expires_in === undefined
              ? null
              : new Date(Date.now() + tokens.expires_in * 1000),
        });
      },
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

  /** The transport that reaches a row's server, carrying its key. */
  const transportOf = (r: ConnectionRow): Transport => {
    const sealed = opened(r);
    if ((r.auth === "bearer" || r.auth === "header") && !sealed.key) {
      setState(r, "needs-sign-in", "Set its key.");
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
        headers: keyHeaders(r, sealed.key),
        redirect: "error" as const,
      },
      ...(r.auth === "oauth" ? { authProvider: provider(r.id) } : {}),
    };
    const url = new URL(r.url ?? "");
    return r.transport === "sse"
      ? new SSEClientTransport(url, options)
      : new StreamableHTTPClientTransport(url, options);
  };

  const connect = async (r: ConnectionRow): Promise<Client> => {
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
    await client.connect(transportOf(r), { timeout: CONNECT_MS });
    return client;
  };

  /** A connection's client, connected once and shared; forgotten when its transport closes. */
  const clientOf = (r: ConnectionRow): Promise<Client> => {
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
    connecting.then((client) => {
      // A stdio process that exits, or a stream the server ends: the next
      // call connects again instead of finding a dead client.
      client.onclose = release;
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
   * arguments) is the caller's, and leaves the connection as it is.
   */
  const using = async <T>(
    r: ConnectionRow,
    use: (client: Client) => Promise<T>
  ): Promise<T> => {
    if (r.state === "needs-sign-in") {
      problem(`${r.name} is not signed in: ${r.reason ?? NO_SECRET}.`);
    }
    const reused = clients.has(r.id);
    try {
      const answer = await use(await clientOf(r));
      setState(r, "signed-in", null);
      return answer;
    } catch (error) {
      // A kept client whose server session ended (404 on its session id):
      // the server ran nothing, so the use goes once more on a new session.
      if (reused && sessionGone(error)) {
        drop(r.id);
        try {
          const answer = await use(await clientOf(r));
          setState(r, "signed-in", null);
          return answer;
        } catch (again) {
          throw failure(r, again);
        }
      }
      throw failure(r, error);
    }
  };

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
      const again =
        r.auth === "oauth" ? "Sign in again." : "Set its key again.";
      setState(r, "needs-sign-in", `The service refused the sign-in. ${again}`);
      return new ConnectionProblem(
        `${r.name} refused the hub's sign-in. ${again}`
      );
    }
    setState(r, "error", said);
    return new ConnectionProblem(`${r.name} could not be reached: ${said}`);
  };

  const listAll = async (client: Client): Promise<Tool[]> => {
    const tools: Tool[] = [];
    let cursor: string | undefined;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: each page names the next
      const page = await client.listTools(cursor ? { cursor } : {}, {
        timeout: CONNECT_MS,
      });
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  };

  /** The tools a connection's server lists now, kept for sessions' lists. */
  const listConnectionTools = async (name: string): Promise<Tool[]> => {
    const r = row(name);
    const tools = await using(r, listAll);
    keepListing(r.id, tools);
    return tools;
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
    const result = (await using(r, (client) =>
      client.callTool({ name: tool, arguments: args }, undefined, {
        timeout: CALL_MS,
        resetTimeoutOnProgress: true,
      })
    )) as CallToolResult;
    const text = JSON.stringify(result);
    const clean = scrub(r, text);
    return clean === text ? result : (JSON.parse(clean) as CallToolResult);
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
          .filter(
            (tool) => !readOnly || tool.annotations?.readOnlyHint === true
          )
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
    if (
      connectionToolsFor(roleOf(actor)) === "read-only" &&
      tool.annotations?.readOnlyHint !== true
    ) {
      problem(
        `${name} isn't available here: this session reads the outside world, so it gets only a connection's read-only tools.`
      );
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

  /** Where a row stands with no secret yet: signed in only once it is looked at. */
  const startState = (
    authKind: ConnectionAuth
  ): Pick<ConnectionRow, "state" | "reason"> => {
    if (authKind === "none") {
      return { state: "error", reason: "Not looked at yet." };
    }
    return {
      state: "needs-sign-in",
      reason: authKind === "oauth" ? "Sign in." : "Set its key.",
    };
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
    deps.changed();
    return view(row(name));
  };

  /** Holds a key for a `bearer` or `header` connection, then looks at it. */
  const setKey = async (name: string, key: string): Promise<ConnectionView> => {
    const r = row(name);
    if (r.auth !== "bearer" && r.auth !== "header") {
      problem(
        `${name} signs in with ${r.auth}, not a key: ${r.auth === "oauth" ? "start its sign-in instead." : "it takes none."}`
      );
    }
    if (!key.trim() || key.length > 8192) {
      problem("A key is between 1 and 8192 characters.");
    }
    reseal(r.id, () => ({ key: key.trim() }));
    drop(r.id);
    db.update(r.id, { state: "error", reason: "Not looked at yet." });
    console.info(`[connections] ${name}: key set`);
    await probe(name);
    return view(row(name));
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
    if (r.auth !== "oauth") {
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
    setState(r, "needs-sign-in", "A sign-in is under way.");
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
    db.update(r.id, { signInState: null, signInExpiresAt: null });
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
    reseal(r.id, (sealed) => ({ ...sealed, verifier: undefined }));
    db.update(r.id, { state: "error", reason: "Not looked at yet." });
    drop(r.id);
    console.info(`[connections] ${r.name}: signed in`);
    await probe(r.name);
    return view(row(r.name));
  };

  const remove = (name: string) => {
    const r = row(name);
    drop(r.id);
    listed.delete(r.id);
    db.remove(r.id);
    console.info(`[connections] removed ${name}`);
    deps.changed();
  };

  deps.lifetime.onClose(() => {
    for (const id of [...clients.keys()]) {
      drop(id);
    }
  });

  return {
    callConnection,
    listConnectionTools,
    sessionTools,
    callAs,
    list: () => db.list().map(view),
    get: (name: string) => view(row(name)),
    create,
    update,
    setKey,
    startSignIn,
    completeSignIn,
    remove,
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
            readOnly: tool.annotations?.readOnlyHint === true,
          })),
        };
      } catch (error) {
        return refused(error);
      }
    })
    .delete("/api/connections/:name", ({ params }) => {
      try {
        connections.remove(params.name);
        return { ok: true };
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
