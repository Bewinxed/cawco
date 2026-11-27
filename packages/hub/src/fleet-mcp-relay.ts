import { backoffWait } from "@cawco/core/backoff";
import { heardStream } from "@cawco/core/bounded";
import { boundedWhileLive, Unanswered } from "@cawco/core/effect/bounded";
import { type Join, makeJoin } from "@cawco/core/effect/join";
import {
  type JsonRpcMessage,
  JsonRpcMessageSchema,
} from "@cawco/core/json-rpc";
import { HOP_BY_HOP_HEADERS } from "@cawco/core/preview/hop-headers";
import { DAY_MS, HOUR_MS, secondsOf } from "@cawco/core/time";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { Effect, Schema, Semaphore } from "effect";
import { object, record, safeParse, string, unknown } from "valibot";
import { z } from "zod";
import type { HubLifetimeShape } from "./lifetime";

/**
 * The fleet's sessions on one signed-in MCP server, as the upstream sees
 * them: one client. Every session on every machine dials `/mcp/fleet/<name>`
 * and the hub answers with its single upstream identity, so the hub owns that
 * identity's rate. A sign-in fans out to every live session at once
 * (`sendMcpChanges` in server.ts), and each one's handshake used to be
 * forwarded as is: on 2026-10-15, 14 sessions redialling Mobbin within a
 * second drew `429 rate_limited`, relayed straight to the CLI, which left
 * some `failed` and the rest connected with no tools.
 *
 * So the hub ends each session's MCP handshake itself:
 * - `initialize`, `notifications/initialized` and `ping` are answered here,
 *   from one upstream session per server (the lister), opened once;
 * - the list methods are answered from one upstream listing per server,
 *   fetched once however many sessions ask at once, and fetched again when
 *   the upstream says its list changed, at a sign-in, or when older than
 *   {@link LISTING_TTL_MS};
 * - a session's standalone stream (GET) is the hub's, which carries the
 *   list changes the hub hears to every session;
 * - everything else (`tools/call`, `resources/read`, …) goes upstream on the
 *   session's own upstream session, opened at its first such request, so no
 *   session shares another's state; a stateless upstream (its `initialize`
 *   names no session) has none to open.
 *
 * Every upstream request passes one gate per server: a 429 is never answered
 * to a session. The gate holds that request and every later one until the
 * upstream's `Retry-After` (else `RateLimit-Reset`, else a doubling backoff
 * from 1 s, capped at 60 s: CawCo's own call, as the upstream named none),
 * then sends it again.
 */

/** A list kept for sessions is fetched again when a session asks after this long. */
const LISTING_TTL_MS = 5 * 60_000;
/** A session the hub has not heard from in this long, with no stream open, is forgotten. */
const IDLE_MS = 30 * 60_000;
/** A kept session's use is written at most this often. */
const TOUCH_MS = HOUR_MS;
/** A kept session unused this long is dropped from the store (CawCo's own bound: rows are small, sessions can rest for days). */
const SESSION_TTL_MS = 30 * DAY_MS;
/**
 * How long an upstream that answered 429 with no wait of its own holds its
 * requests: from 1 s, doubling to a minute while it keeps refusing. Each
 * request's own deadline ends its wait.
 */
const LIMITED_HOLDS = { firstMs: 1000, mostMs: 60_000 };

/** Each list method, and the key its result carries the items under. */
const LIST_METHODS = {
  "tools/list": "tools",
  "prompts/list": "prompts",
  "resources/list": "resources",
  "resources/templates/list": "resourceTemplates",
} satisfies Record<string, string>;
type ListMethod = keyof typeof LIST_METHODS;

/** Whether `method` is one of the lists the relay keeps. */
const isListMethod = (method: string): method is ListMethod =>
  Object.hasOwn(LIST_METHODS, method);

/** What an upstream's `initialize` result offers, by area (tools, prompts, resources). */
const Offers = object({ capabilities: record(string(), unknown()) });
/** Each list-changed notification, and the lists it makes stale. */
const CHANGED: Record<string, string[]> = {
  "notifications/tools/list_changed": ["tools/list"],
  "notifications/prompts/list_changed": ["prompts/list"],
  "notifications/resources/list_changed": [
    "resources/list",
    "resources/templates/list",
  ],
};
/** The list-changed notification a list method's change is told by. */
const changedBy = (method: string): string =>
  Object.entries(CHANGED).find(([, lists]) => lists.includes(method))?.[0] ??
  "notifications/tools/list_changed";

/** The downstream request headers an upstream request carries. */
const PASSED = [
  "Accept",
  "Content-Type",
  "MCP-Protocol-Version",
  "Last-Event-ID",
];
/** Response headers that are the hub's own connection's, or the upstream's to keep. */
const DROPPED = [
  "WWW-Authenticate",
  "Content-Encoding",
  "Content-Length",
  "Mcp-Session-Id",
  ...HOP_BY_HOP_HEADERS,
];

/** One upstream request, as the hub's sign-in sends it (`FleetMcp.#upstream`). */
export interface Exchange {
  body?: ArrayBuffer | string;
  headers: Headers;
  method: string;
  /** The downstream request's query, for a forwarded request. */
  search?: string;
  signal?: AbortSignal;
}
export type Upstream = (exchange: Exchange) => Promise<Response>;

/** Where each session's `initialize` params are kept across hub restarts (the hub's `fleet_mcp_sessions`). */
export interface KeptSessions {
  delete: (id: string) => void;
  get: (id: string, server: string) => Record<string, unknown> | undefined;
  prune: (before: Date) => number;
  put: (id: string, server: string, init: Record<string, unknown>) => void;
  touch: (id: string) => void;
}

/** The upstream's own answer to a request the hub made for every session: relayed to whoever asked. */
class Refused extends Schema.TaggedError<Refused>()("Refused", {
  contentType: Schema.NullOr(Schema.String),
  message: Schema.String,
  status: Schema.Number,
  text: Schema.String,
}) {}
/** The upstream's JSON-RPC error to a request the hub made for every session. */
class RpcError extends Schema.TaggedError<RpcError>()("RpcError", {
  error: Schema.Unknown,
  message: Schema.String,
}) {}

/** {@link RpcError} with the upstream's `error`. */
const rpcError = (error: unknown): RpcError =>
  new RpcError({ error, message: "The upstream answered with an error." });

interface Lister {
  protocol: string;
  /** The upstream's `initialize` result, every session's own. */
  result: Record<string, unknown>;
  /** Its upstream session, or null for a stateless upstream. */
  session: string | null;
}

type Listed = { items: unknown[] } | { error: unknown };

interface Downstream {
  /** Its own `initialize` params, sent upstream when its upstream session opens; none for one adopted. */
  init?: Record<string, unknown>;
  streams: number;
  /** When its use was last written to the store. */
  touched: number;
  /** Its own upstream session (null for a stateless upstream), once a request needed it. */
  upstream?: Promise<string | null>;
  used: number;
}

interface ServerState {
  /** The gate's one turn: while the upstream is limiting, its requests go through it one at a time, in the order they came. */
  gate: Semaphore.Semaphore;
  generation: string;
  /** The last items each list method came to, to tell sessions when a fetch found them changed. */
  known: Map<string, unknown[]>;
  /** The upstream answered 429 and the requests since go one at a time, until none is held. */
  limited: boolean;
  listening?: AbortController;
  lister?: Promise<Lister>;
  /** How many times each list method's kept items went: a fetch begun before is no longer this method's to keep or join. */
  listGens: Map<string, number>;
  /** Each list method's fetch under way, shared by every session that asks meanwhile, by method and {@link listGens}. */
  listing: Join<string, Listed, unknown>;
  /** Each list method's kept items, and when the fetch that found them began ({@link LISTING_TTL_MS}). */
  lists: Map<string, { at: number; items: unknown[] }>;
  /** 429s in a row that named no wait. */
  misses: number;
  /** Requests waiting at the gate or holding its turn. */
  queued: number;
  sessions: Map<string, Downstream>;
  streams: Set<ReadableStreamDefaultController<Uint8Array>>;
  swept: number;
  /** The gate: no held request goes before this. */
  until: number;
}

/**
 * The upstream did not answer, within its time, a request the hub made for
 * every session: said to whoever asked as its own answer (504), never as the
 * upstream's refusal.
 */
class NoAnswer extends Schema.TaggedError<NoAnswer>()("NoAnswer", {
  message: Schema.String,
}) {}

/** {@link NoAnswer} after `after` ms. */
const noAnswer = (after: number): NoAnswer =>
  new NoAnswer({
    message: `The upstream MCP server did not answer within ${secondsOf(after)} s. Retry the request.`,
  });

/** A held request the upstream answered 429 again: its turn goes once more, after the gate's wait. */
class Limited extends Schema.TaggedError<Limited>()("Limited", {}) {}

/** An answer the gate let through, or the 429 that held it. */
type Attempted<T> = { taken: T } | { limited: Headers };

/** A promise step of the relay as an Effect, failing with whatever it threw. */
const step = <A>(run: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (error: unknown) => error });

/** Fails with the asker's abort once it let go. */
const stillAsked = (signal: AbortSignal | undefined) =>
  Effect.try({
    try: () => signal?.throwIfAborted(),
    catch: (error: unknown) => error,
  });

/** How many times `method`'s kept items went ({@link ServerState.listGens}). */
const listGen = (state: ServerState, method: string): number =>
  state.listGens.get(method) ?? 0;

/** `method`'s kept items go, and a fetch of it begun before is neither joined nor kept. */
const forgetList = (state: ServerState, method: string): void => {
  state.lists.delete(method);
  state.listGens.set(method, listGen(state, method) + 1);
};

/** Every list's kept items go ({@link forgetList}). */
const forgetLists = (state: ServerState): void => {
  for (const method of Object.keys(LIST_METHODS)) {
    forgetList(state, method);
  }
};

const encoder = new TextEncoder();

/** Statuses whose Response carries no body (Fetch: "null body status"). */
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/** A response with its body read whole, so it can be read again later. */
export const wholeResponse = async (response: Response): Promise<Response> =>
  new Response(
    NULL_BODY.has(response.status) ? null : await response.arrayBuffer(),
    {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }
  );

/** The wait a 429 names: `Retry-After` (seconds or a date), else `RateLimit-Reset` (seconds). */
const namedWait = (headers: Headers): number | undefined => {
  const after = headers.get("Retry-After");
  if (after !== null) {
    const seconds = Number(after);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const at = Date.parse(after);
    if (Number.isFinite(at)) {
      return Math.max(0, at - Date.now());
    }
  }
  const reset = Number(headers.get("RateLimit-Reset") ?? Number.NaN);
  return Number.isFinite(reset) && reset >= 0 ? reset * 1000 : undefined;
};

const parse = (text: string): JsonRpcMessage | JsonRpcMessage[] | undefined => {
  try {
    return z
      .union([JsonRpcMessageSchema, z.array(JsonRpcMessageSchema)])
      .parse(JSON.parse(text));
  } catch {
    return undefined;
  }
};

const CARRIAGE_RETURN = /\r$/u;

/** An upstream answer that is not a JSON-RPC message: relayed as it came. */
const refused = async (response: Response) =>
  new Refused({
    status: response.status,
    text: await response.text(),
    contentType: response.headers.get("Content-Type"),
    message: `The upstream answered HTTP ${response.status}.`,
  });

/** The `initialize` result of an answer, or the upstream's refusal of it. */
const initialized = async (
  response: Response,
  reply: JsonRpcMessage | undefined
): Promise<Record<string, unknown>> => {
  if (!response.ok) {
    throw await refused(response);
  }
  if (reply?.error !== undefined || !reply?.result) {
    throw rpcError(
      reply?.error ?? { code: -32_603, message: "No initialize result." }
    );
  }
  return reply.result;
};

const rpcAnswer = (
  id: JsonRpcMessage["id"],
  answer: { result: unknown } | { error: unknown },
  headers?: Record<string, string>
) => Response.json({ jsonrpc: "2.0", id, ...answer }, { status: 200, headers });

export class FleetMcpRelay {
  readonly #servers = new Map<string, ServerState>();
  readonly #kept: KeptSessions;
  readonly #lifetime: HubLifetimeShape;
  #ids = 0;
  #pruned = 0;

  constructor(kept: KeptSessions, lifetime: HubLifetimeShape) {
    this.#kept = kept;
    this.#lifetime = lifetime;
    this.#prune();
  }

  /** Drops kept sessions unused for {@link SESSION_TTL_MS}, at most once an hour. */
  #prune(): void {
    const now = Date.now();
    if (now - this.#pruned < TOUCH_MS) {
      return;
    }
    this.#pruned = now;
    const dropped = this.#kept.prune(new Date(now - SESSION_TTL_MS));
    if (dropped > 0) {
      console.info(
        `[fleet-mcp] dropped ${dropped} relay session(s) unused for ${SESSION_TTL_MS / DAY_MS} days`
      );
    }
  }

  #nextId(): number {
    this.#ids += 1;
    return this.#ids;
  }

  /**
   * Its sign-in changed or it left: no list or upstream session kept under
   * the old one serves the new. Sessions and their streams stay, and open
   * their upstream sessions again as they need them.
   */
  reset(name: string): void {
    const state = this.#servers.get(name);
    if (!state) {
      return;
    }
    state.listening?.abort();
    state.listening = undefined;
    state.lister = undefined;
    forgetLists(state);
    state.known.clear();
    state.until = 0;
    state.misses = 0;
    for (const downstream of state.sessions.values()) {
      downstream.upstream = undefined;
    }
  }

  #state(name: string, generation: string): ServerState {
    let state = this.#servers.get(name);
    if (state && state.generation !== generation) {
      this.reset(name);
      state.generation = generation;
    }
    if (!state) {
      state = {
        generation,
        until: 0,
        limited: false,
        gate: Semaphore.makeUnsafe(1),
        queued: 0,
        misses: 0,
        listing: makeJoin<string, Listed, unknown>(),
        lists: new Map(),
        listGens: new Map(),
        known: new Map(),
        sessions: new Map(),
        streams: new Set(),
        swept: Date.now(),
      };
      this.#servers.set(name, state);
    }
    return state;
  }

  /** Forgets sessions gone quiet; their next request (if any) adopts them again, from the store. */
  #sweep(state: ServerState): void {
    this.#prune();
    const now = Date.now();
    if (now - state.swept < 60_000) {
      return;
    }
    state.swept = now;
    for (const [id, downstream] of state.sessions) {
      if (downstream.streams === 0 && now - downstream.used > IDLE_MS) {
        state.sessions.delete(id);
      }
    }
  }

  /** The server's one upstream session for every session's handshake and lists. */
  #lister(
    name: string,
    state: ServerState,
    upstream: Upstream
  ): Promise<Lister> {
    if (state.lister !== undefined) {
      return state.lister;
    }
    const opening = (async (): Promise<Lister> => {
      const { response, reply } = await upstreamRpc(
        this.#lifetime,
        name,
        state,
        upstream,
        { session: null },
        {
          jsonrpc: "2.0",
          id: this.#nextId(),
          method: "initialize",
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "CawCo fleet", version: "1" },
          },
        }
      );
      const result = await initialized(response, reply);
      const session = response.headers.get("Mcp-Session-Id");
      const protocol =
        typeof result.protocolVersion === "string"
          ? result.protocolVersion
          : LATEST_PROTOCOL_VERSION;
      const told = await upstreamRpc(
        this.#lifetime,
        name,
        state,
        upstream,
        { session, protocol },
        { jsonrpc: "2.0", method: "notifications/initialized" }
      );
      await told.response.body?.cancel();
      const lister = { session, protocol, result };
      listenForChanges(this.#lifetime, name, state, upstream, lister);
      return lister;
    })();
    state.lister = opening;
    opening.catch(() => {
      if (state.lister === opening) {
        state.lister = undefined;
      }
    });
    return opening;
  }

  /**
   * One list for every session: fetched once however many ask, every page
   * of it, and its items kept for {@link LISTING_TTL_MS} from the fetch's
   * start. An answer that is the upstream's error is that ask's alone, and
   * nothing is kept.
   */
  #list(
    name: string,
    state: ServerState,
    upstream: Upstream,
    method: ListMethod
  ): Promise<Listed> {
    const kept = state.lists.get(method);
    if (kept && Date.now() - kept.at < LISTING_TTL_MS) {
      return Promise.resolve({ items: kept.items });
    }
    const key = LIST_METHODS[method];
    const gen = listGen(state, method);
    const at = Date.now();
    const fetched = step(() =>
      this.#fetchList(name, state, upstream, method).then((answer) => {
        if ("items" in answer) {
          const now = answer.items;
          const before = state.known.get(method);
          state.known.set(method, now);
          console.info(
            `[fleet-mcp] ${name}: ${method} upstream: ${answer.items.length} ${key}`
          );
          if (before !== undefined && !Bun.deepEquals(before, now)) {
            broadcast(state, changedBy(method));
          }
          if (listGen(state, method) === gen) {
            state.lists.set(method, { at, items: now });
          }
        }
        return answer;
      })
    );
    // The promise edge of the list's one fetch, joined by every session asking while it runs.
    return this.#lifetime.run(
      state.listing.run(`${method}\u0000${gen}`, fetched)
    );
  }

  /** Every page of one list, on the lister's session; one whose session ended upstream opens a new one, once. */
  async #fetchList(
    name: string,
    state: ServerState,
    upstream: Upstream,
    method: ListMethod,
    again = false
  ): Promise<Listed> {
    const key = LIST_METHODS[method];
    const lister = await this.#lister(name, state, upstream);
    const items: unknown[] = [];
    let cursor: unknown;
    do {
      const { response, reply } = await upstreamRpc(
        this.#lifetime,
        name,
        state,
        upstream,
        lister,
        {
          jsonrpc: "2.0",
          id: this.#nextId(),
          method,
          params: cursor === undefined ? {} : { cursor },
        }
      );
      if (response.status === 404 && lister.session && !again) {
        await response.body?.cancel();
        if (await isLister(state, lister)) {
          state.lister = undefined;
        }
        return await this.#fetchList(name, state, upstream, method, true);
      }
      if (!response.ok) {
        throw await refused(response);
      }
      if (reply?.error !== undefined) {
        return { error: reply.error };
      }
      const page = reply?.result?.[key];
      if (!Array.isArray(page)) {
        return {
          error: {
            code: -32_603,
            message: `No ${key} in the upstream's answer.`,
          },
        };
      }
      items.push(...page);
      cursor = reply?.result?.nextCursor;
    } while (typeof cursor === "string" && cursor !== "");
    return { items };
  }

  /** A session's own upstream session, opened with its own `initialize` at its first request that needs one. */
  #session(
    name: string,
    state: ServerState,
    upstream: Upstream,
    downstream: Downstream,
    protocol: string | null
  ): Promise<string | null> {
    if (downstream.upstream !== undefined) {
      return downstream.upstream;
    }
    const opening = (async () => {
      const lister = await this.#lister(name, state, upstream);
      if (lister.session === null) {
        return null;
      }
      const { response, reply } = await upstreamRpc(
        this.#lifetime,
        name,
        state,
        upstream,
        { session: null },
        {
          jsonrpc: "2.0",
          id: this.#nextId(),
          method: "initialize",
          params: downstream.init ?? {
            protocolVersion: protocol ?? lister.protocol,
            capabilities: {},
            clientInfo: { name: "CawCo fleet", version: "1" },
          },
        }
      );
      const result = await initialized(response, reply);
      const session = response.headers.get("Mcp-Session-Id");
      const told = await upstreamRpc(
        this.#lifetime,
        name,
        state,
        upstream,
        {
          session,
          protocol:
            typeof result.protocolVersion === "string"
              ? result.protocolVersion
              : undefined,
        },
        { jsonrpc: "2.0", method: "notifications/initialized" }
      );
      await told.response.body?.cancel();
      return session;
    })();
    downstream.upstream = opening;
    opening.catch(() => {
      if (downstream.upstream === opening) {
        downstream.upstream = undefined;
      }
    });
    return opening;
  }

  /** A session's request, on its own upstream session; one whose upstream session ended opens another, once. */
  async #forward(
    name: string,
    state: ServerState,
    upstream: Upstream,
    downstream: Downstream,
    request: Request,
    body: ArrayBuffer | undefined,
    again = false
  ): Promise<Response> {
    const session = await this.#session(
      name,
      state,
      upstream,
      downstream,
      request.headers.get("MCP-Protocol-Version")
    );
    const headers = new Headers();
    for (const header of PASSED) {
      const value = request.headers.get(header);
      if (value !== null) {
        headers.set(header, value);
      }
    }
    if (session) {
      headers.set("Mcp-Session-Id", session);
    }
    const response = await sendUpstream(this.#lifetime, name, state, upstream, {
      method: request.method,
      headers,
      body,
      signal: request.signal,
      search: new URL(request.url).search,
    });
    if (response.status === 404 && session && !again) {
      await response.body?.cancel();
      downstream.upstream = undefined;
      return await this.#forward(
        name,
        state,
        upstream,
        downstream,
        request,
        body,
        true
      );
    }
    const outgoing = new Headers(response.headers);
    for (const header of DROPPED) {
      outgoing.delete(header);
    }
    const stream =
      response.body &&
      response.headers.get("Content-Type")?.includes("text/event-stream")
        ? tapListChanges(name, state, response.body)
        : response.body;
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: outgoing,
    });
  }

  /** A session's `initialize`, answered from the lister's: the session is the hub's from here. */
  async #open(
    name: string,
    state: ServerState,
    upstream: Upstream,
    single: JsonRpcMessage
  ): Promise<Response> {
    let lister: Lister;
    try {
      lister = await this.#lister(name, state, upstream);
    } catch (error) {
      return refusalFor(error, single.id);
    }
    const asked = single.params?.protocolVersion;
    const protocol =
      typeof asked === "string" && asked <= lister.protocol
        ? asked
        : lister.protocol;
    const id = crypto.randomUUID();
    this.#kept.put(id, name, single.params ?? {});
    state.sessions.set(id, {
      touched: Date.now(),
      init: single.params,
      used: Date.now(),
      streams: 0,
    });
    return rpcAnswer(
      single.id,
      { result: { ...lister.result, protocolVersion: protocol } },
      { "Mcp-Session-Id": id }
    );
  }

  /**
   * What the hub answers a session itself, or undefined to send it upstream:
   * `ping`; the list methods, from the one listing; `server/discover`, which
   * this relay does not offer (it speaks the `initialize` protocol, so a
   * client takes it as such: Claude Code's `server/discover` probe, sent on
   * each connect, otherwise opened an upstream session per session); and a
   * notification, which is the hub's own (`notifications/initialized`) or
   * has nobody to tell before the session's upstream session opens.
   */
  async #local(
    name: string,
    state: ServerState,
    upstream: Upstream,
    downstream: Downstream,
    single: JsonRpcMessage
  ): Promise<Response | undefined> {
    const { method, id } = single;
    if (method && id === undefined) {
      return method === "notifications/initialized" ||
        downstream.upstream === undefined
        ? new Response(null, { status: 202 })
        : undefined;
    }
    if (method === "ping") {
      return rpcAnswer(id, { result: {} });
    }
    if (method === "server/discover") {
      return rpcAnswer(id, {
        error: { code: -32_601, message: "Method not found: server/discover" },
      });
    }
    if (method && isListMethod(method) && single.params?.cursor === undefined) {
      return await this.#answerList(name, state, upstream, method, id);
    }
    return undefined;
  }

  /** A list method, from the one listing; one the upstream does not offer is not found. */
  async #answerList(
    name: string,
    state: ServerState,
    upstream: Upstream,
    method: ListMethod,
    id: JsonRpcMessage["id"]
  ): Promise<Response> {
    let listed: Listed;
    try {
      const lister = await this.#lister(name, state, upstream);
      const offers = safeParse(Offers, lister.result);
      const offered =
        offers.success && offers.output.capabilities[method.split("/")[0]];
      if (!offered) {
        return rpcAnswer(id, {
          error: { code: -32_601, message: `Method not found: ${method}` },
        });
      }
      listed = await this.#list(name, state, upstream, method);
    } catch (error) {
      return refusalFor(error, id);
    }
    return "error" in listed
      ? rpcAnswer(id, { error: listed.error })
      : rpcAnswer(id, {
          result: { [LIST_METHODS[method]]: listed.items },
        });
  }

  /**
   * The session a request names. One not in memory (from before a hub
   * restart, or forgotten while idle) is adopted with the `initialize` params
   * it was opened with, read back from the store, so its upstream session
   * opens as it first announced itself. Its use is written at most once an
   * hour.
   */
  #downstream(name: string, state: ServerState, id: string): Downstream {
    const now = Date.now();
    let downstream = state.sessions.get(id);
    if (!downstream) {
      downstream = {
        ...(id ? { init: this.#kept.get(id, name) } : {}),
        used: now,
        touched: now,
        streams: 0,
      };
      state.sessions.set(id, downstream);
    }
    downstream.used = now;
    if (id && now - downstream.touched > TOUCH_MS) {
      downstream.touched = now;
      this.#kept.touch(id);
    }
    return downstream;
  }

  async handle(
    name: string,
    generation: string,
    request: Request,
    upstream: Upstream
  ): Promise<Response> {
    const state = this.#state(name, generation);
    this.#sweep(state);
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer();
    const message = body ? parse(new TextDecoder().decode(body)) : undefined;
    const single = message && !Array.isArray(message) ? message : undefined;

    if (request.method === "POST" && single?.method === "initialize") {
      return await this.#open(name, state, upstream, single);
    }

    const id = request.headers.get("Mcp-Session-Id") ?? "";
    const downstream = this.#downstream(name, state, id);

    if (request.method === "GET") {
      return standaloneStream(state, downstream, request);
    }
    if (request.method === "DELETE") {
      state.sessions.delete(id);
      if (id) {
        this.#kept.delete(id);
      }
      closeUpstream(this.#lifetime, name, state, upstream, downstream);
      return new Response(null, { status: 200 });
    }
    const local = single
      ? await this.#local(name, state, upstream, downstream, single)
      : undefined;
    if (local) {
      return local;
    }
    try {
      return await this.#forward(
        name,
        state,
        upstream,
        downstream,
        request,
        body
      );
    } catch (error) {
      return refusalFor(error, single?.id ?? null);
    }
  }
}

/**
 * The upstream's own stream on the lister's session, where it says its
 * lists changed. One it does not offer (405) is simply not heard; one that
 * ends takes the lister with it, so the next list opens both again.
 */
function listenForChanges(
  lifetime: HubLifetimeShape,
  name: string,
  state: ServerState,
  upstream: Upstream,
  lister: Lister
): void {
  state.listening?.abort();
  const control = new AbortController();
  state.listening = control;
  const headers = new Headers({ Accept: "text/event-stream" });
  if (lister.session) {
    headers.set("Mcp-Session-Id", lister.session);
  }
  headers.set("MCP-Protocol-Version", lister.protocol);
  let opened = false;
  (async () => {
    const response = await sendUpstream(lifetime, name, state, upstream, {
      method: "GET",
      headers,
      signal: control.signal,
    });
    if (!(
      response.ok &&
      response.body &&
      response.headers.get("Content-Type")?.includes("text/event-stream")
    )) {
      await response.body?.cancel();
      return;
    }
    opened = true;
    await tapListChanges(name, state, response.body).pipeTo(
      new WritableStream()
    );
  })()
    .catch(() => undefined)
    .finally(() => {
      if (state.listening !== control) {
        return;
      }
      state.listening = undefined;
      if (opened && !control.signal.aborted) {
        state.lister = undefined;
        forgetLists(state);
      }
    });
}

/** A closed session's upstream session closes too; nothing waits on it. */
function closeUpstream(
  lifetime: HubLifetimeShape,
  name: string,
  state: ServerState,
  upstream: Upstream,
  downstream: Downstream
): void {
  const open = downstream.upstream;
  if (!open) {
    return;
  }
  (async () => {
    const session = await open;
    if (!session) {
      return;
    }
    const response = await sendUpstream(lifetime, name, state, upstream, {
      method: "DELETE",
      headers: new Headers({ "Mcp-Session-Id": session }),
    });
    await response.body?.cancel();
  })().catch(() => undefined);
}

/**
 * One upstream request through the server's gate: never answered 429.
 * While the upstream is limiting, requests go one after another, each once
 * the wait it named has passed, until one is answered and none is queued:
 * a herd released at once would only be refused again.
 */
function sendUpstream(
  lifetime: HubLifetimeShape,
  name: string,
  state: ServerState,
  upstream: Upstream,
  exchange: Exchange
): Promise<Response> {
  // The promise edge of a request through the gate.
  return lifetime.run(
    sendTaking(name, state, upstream, exchange, (response) =>
      Promise.resolve(response)
    )
  );
}

/**
 * A JSON-RPC request the hub makes for every session, and the upstream's
 * answer to it: read off a JSON body or the event stream it opened, which
 * may also carry list changes. Each attempt, its reply read included, is
 * waited on while its bytes arrive (core bounded.ts `readWhileLive`); one
 * that goes a quiet spell with none is {@link NoAnswer}.
 */
function upstreamRpc(
  lifetime: HubLifetimeShape,
  name: string,
  state: ServerState,
  upstream: Upstream,
  lister: { session: string | null; protocol?: string },
  message: JsonRpcMessage
): Promise<{ response: Response; reply?: JsonRpcMessage }> {
  const headers = new Headers({
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  });
  if (lister.session) {
    headers.set("Mcp-Session-Id", lister.session);
  }
  if (lister.protocol) {
    headers.set("MCP-Protocol-Version", lister.protocol);
  }
  // The promise edge of a request through the gate.
  return lifetime.run(
    sendTaking(
      name,
      state,
      upstream,
      { method: "POST", headers, body: JSON.stringify(message) },
      async (response) => {
        if (message.id === undefined) {
          await response.body?.cancel();
          return { response };
        }
        if (!response.ok) {
          // Its refusal is read later (`refused`): read whole now, inside the time.
          return { response: await wholeResponse(response) };
        }
        if (!(
          response.headers.get("Content-Type")?.includes("text/event-stream") &&
          response.body
        )) {
          const reply = parse(await response.text());
          return { response, reply: Array.isArray(reply) ? undefined : reply };
        }
        return {
          response,
          reply: await replyOn(name, state, response.body, message.id),
        };
      },
      true
    )
  );
}

/**
 * {@link sendUpstream}, with what is wanted of the answer read by `take` as part
 * of each attempt: inside `ms` when given, so an answer whose reply never
 * comes within it is {@link NoAnswer}. A request that meets the gate shut
 * waits its turn ({@link ServerState.gate}), counted in `queued` from before
 * it waits until its turn ends: the gate opens once none is left.
 */
function sendTaking<T>(
  name: string,
  state: ServerState,
  upstream: Upstream,
  exchange: Exchange,
  take: (response: Response) => Promise<T>,
  live = false
): Effect.Effect<T, unknown> {
  return Effect.gen(function* () {
    if (!state.limited) {
      const taken = yield* attemptUpstream(
        name,
        state,
        upstream,
        exchange,
        take,
        live
      );
      if (taken) {
        return taken.taken;
      }
    }
    state.queued += 1;
    return yield* state.gate
      .withPermit(heldTurn(name, state, upstream, exchange, take, live))
      .pipe(
        Effect.ensuring(
          Effect.sync(() => {
            state.queued -= 1;
            if (state.queued === 0) {
              state.limited = false;
            }
          })
        )
      );
  });
}

/** The message answering `id` on an event stream, read until it comes; the stream's notifications heard on the way. */
async function replyOn(
  name: string,
  state: ServerState,
  body: ReadableStream<Uint8Array>,
  id: JsonRpcMessage["id"]
): Promise<JsonRpcMessage | undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  /** One event's data, ended by its blank line. */
  const event = (line: string): JsonRpcMessage | undefined => {
    if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
      return;
    }
    if (line !== "" || data.length === 0) {
      return;
    }
    const one = parse(data.join("\n"));
    data = [];
    return one && !Array.isArray(one) ? one : undefined;
  };
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) {
        return;
      }
      buffer += decoder.decode(next.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const one = event(raw.replace(CARRIAGE_RETURN, ""));
        if (one?.method) {
          listChanged(name, state, one.method);
        } else if (one && one.id === id) {
          return one;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** An upstream event stream passed on unchanged, its list changes heard on the way. */
function tapListChanges(
  name: string,
  state: ServerState,
  body: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = "";
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data:") && line.includes("list_changed")) {
            const event = parse(line.slice(5));
            if (event && !Array.isArray(event) && event.method) {
              listChanged(name, state, event.method);
            }
          }
        }
        controller.enqueue(chunk);
      },
    })
  );
}

/**
 * A held request's turn: sent once the gate's wait has passed, and again,
 * after the wait the next 429 named, for as long as the upstream answers
 * 429. The asker is looked at before each wait and after it: one that let
 * go is not sent.
 */
function heldTurn<T>(
  name: string,
  state: ServerState,
  upstream: Upstream,
  exchange: Exchange,
  take: (response: Response) => Promise<T>,
  live = false
): Effect.Effect<T, unknown> {
  const turn = Effect.gen(function* () {
    yield* stillAsked(exchange.signal);
    const wait = state.until - Date.now();
    if (wait > 0) {
      // Pacing, not a read: the gate's own wait, then the asker is looked at again.
      yield* Effect.sleep(wait);
      yield* stillAsked(exchange.signal);
    }
    const taken = yield* attemptUpstream(
      name,
      state,
      upstream,
      exchange,
      take,
      live
    );
    if (!taken) {
      return yield* new Limited();
    }
    return taken.taken;
  });
  return Effect.retry(turn, { while: (error) => error instanceof Limited });
}

/** The upstream said a list changed: the kept one goes, and every session hears it. */
function listChanged(name: string, state: ServerState, method: string): void {
  const lists = CHANGED[method];
  if (!lists) {
    return;
  }
  for (const list of lists) {
    forgetList(state, list);
    state.known.delete(list);
  }
  console.info(`[fleet-mcp] ${name}: the upstream says ${method}`);
  broadcast(state, method);
}

/** The upstream's own refusal of a request made for every session, or its silence, answered to this one. */
function refusalFor(error: unknown, id: JsonRpcMessage["id"]): Response {
  if (error instanceof NoAnswer) {
    return new Response(error.message, { status: 504 });
  }
  if (error instanceof Refused) {
    return new Response(error.text, {
      status: error.status,
      headers: error.contentType ? { "Content-Type": error.contentType } : {},
    });
  }
  if (error instanceof RpcError) {
    return rpcAnswer(id, { error: error.error });
  }
  throw error;
}

/** A session's standalone stream: the hub's, carrying the list changes it hears. */
function standaloneStream(
  state: ServerState,
  downstream: Downstream,
  request: Request
): Response {
  let held: ReadableStreamDefaultController<Uint8Array> | undefined;
  const release = () => {
    if (held && state.streams.delete(held)) {
      downstream.streams -= 1;
      downstream.used = Date.now();
    }
  };
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      held = controller;
      state.streams.add(controller);
      downstream.streams += 1;
      controller.enqueue(encoder.encode(": cawco fleet\n\n"));
      request.signal.addEventListener(
        "abort",
        () => {
          release();
          try {
            controller.close();
          } catch {
            // Already closed by its reader.
          }
        },
        { once: true }
      );
    },
    cancel: release,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

/** Whether the server's lister is still `lister`. */
async function isLister(state: ServerState, lister: Lister): Promise<boolean> {
  const current = state.lister;
  return current === undefined
    ? false
    : await current.then(
        (one) => one === lister,
        () => false
      );
}

function broadcast(state: ServerState, method: string): void {
  const event = encoder.encode(
    `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method })}\n\n`
  );
  for (const stream of state.streams) {
    try {
      stream.enqueue(event);
    } catch {
      state.streams.delete(stream);
    }
  }
}

/**
 * One send, its answer taken by `take` (inside `ms` when given, through the
 * house's bounded read); undefined when the upstream answered 429, the gate
 * then holding its requests for the wait it named. The asker letting go
 * aborts the send.
 */
function attemptUpstream<T>(
  name: string,
  state: ServerState,
  upstream: Upstream,
  exchange: Exchange,
  take: (response: Response) => Promise<T>,
  live = false
): Effect.Effect<{ taken: T } | undefined, unknown> {
  const attempt = (alive?: () => void) =>
    step(async (signal): Promise<Attempted<T>> => {
      const sent = await upstream({
        ...exchange,
        signal: exchange.signal
          ? AbortSignal.any([signal, exchange.signal])
          : signal,
      });
      alive?.();
      const response = alive ? heardStream(sent, alive) : sent;
      if (response.status === 429) {
        await response.body?.cancel();
        return { limited: response.headers };
      }
      if (response.ok) {
        state.misses = 0;
      }
      return { taken: await take(response) };
    });
  return Effect.gen(function* () {
    const attempted = live
      ? yield* boundedWhileLive((alive) => attempt(alive)).pipe(
          Effect.mapError((error) =>
            error instanceof Unanswered ? noAnswer(error.after) : error
          )
        )
      : yield* attempt();
    if ("taken" in attempted) {
      return attempted;
    }
    state.limited = true;
    const named = namedWait(attempted.limited);
    const hold = named ?? backoffWait(LIMITED_HOLDS, state.misses + 1);
    if (named === undefined) {
      state.misses += 1;
    }
    const until = Date.now() + hold;
    if (until > state.until) {
      state.until = until;
      console.info(
        `[fleet-mcp] ${name}: the upstream answered 429; its requests wait ${(hold / 1000).toFixed(1)} s (${named === undefined ? "backoff" : "its own wait"}), then go one at a time`
      );
    }
  });
}
