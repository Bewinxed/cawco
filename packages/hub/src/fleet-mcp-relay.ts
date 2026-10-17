import { readWithin } from "@cawco/core/bounded";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

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
/** How long one of the lister's own upstream requests may take. */
const LISTER_TIMEOUT_MS = 30_000;
/** A session the hub has not heard from in this long, with no stream open, is forgotten. */
const IDLE_MS = 30 * 60_000;
/** A kept session's use is written at most this often. */
const TOUCH_MS = 60 * 60_000;
/** A kept session unused this long is dropped from the store (CawCo's own bound: rows are small, sessions can rest for days). */
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
const BACKOFF_FIRST_MS = 1000;
const BACKOFF_MAX_MS = 60_000;

/** Each list method, and the key its result carries the items under. */
const LIST_METHODS: Record<string, string> = {
  "tools/list": "tools",
  "prompts/list": "prompts",
  "resources/list": "resources",
  "resources/templates/list": "resourceTemplates",
};
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
  "Connection",
  "Transfer-Encoding",
  "Keep-Alive",
  "TE",
  "Trailer",
  "Upgrade",
  "Proxy-Authenticate",
  "Proxy-Authorization",
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

interface Message {
  error?: unknown;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

/** The upstream's own answer to a request the hub made for every session: relayed to whoever asked. */
class Refused extends Error {
  readonly status: number;
  readonly text: string;
  readonly contentType: string | null;
  constructor(status: number, text: string, contentType: string | null) {
    super(`The upstream answered HTTP ${status}.`);
    this.status = status;
    this.text = text;
    this.contentType = contentType;
  }
}
/** The upstream's JSON-RPC error to a request the hub made for every session. */
class RpcError extends Error {
  readonly error: unknown;
  constructor(error: unknown) {
    super("The upstream answered with an error.");
    this.error = error;
  }
}

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
  generation: string;
  /** The last items each list method came to, to tell sessions when a fetch found them changed. */
  known: Map<string, string>;
  /** The upstream answered 429 and the requests since go one at a time, until none is held. */
  limited: boolean;
  listening?: AbortController;
  lister?: Promise<Lister>;
  lists: Map<string, { at: number; listed: Promise<Listed> }>;
  /** 429s in a row that named no wait. */
  misses: number;
  queue: Promise<void>;
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
class NoAnswer extends Error {
  constructor(after: number) {
    super(
      `The upstream MCP server did not answer within ${Math.round(after / 1000)} s. Retry the request.`
    );
  }
}

/** An answer the gate let through, or the 429 that held it. */
type Attempted<T> = { taken: T } | { limited: Headers };

const encoder = new TextEncoder();

/** Statuses whose Response carries no body (Fetch: "null body status"). */
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/** A response with its body read whole, so it can be read again later. */
const whole = async (response: Response): Promise<Response> =>
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

const parse = (text: string): Message | Message[] | undefined => {
  try {
    return JSON.parse(text) as Message | Message[];
  } catch {
    return undefined;
  }
};

const CARRIAGE_RETURN = /\r$/;

/** An upstream answer that is not a JSON-RPC message: relayed as it came. */
const refused = async (response: Response) =>
  new Refused(
    response.status,
    await response.text(),
    response.headers.get("Content-Type")
  );

/** The `initialize` result of an answer, or the upstream's refusal of it. */
const initialized = async (
  response: Response,
  reply: Message | undefined
): Promise<Record<string, unknown>> => {
  if (!response.ok) {
    throw await refused(response);
  }
  if (reply?.error !== undefined || !reply?.result) {
    throw new RpcError(
      reply?.error ?? { code: -32_603, message: "No initialize result." }
    );
  }
  return reply.result;
};

const rpcAnswer = (
  id: Message["id"],
  answer: { result: unknown } | { error: unknown },
  headers?: Record<string, string>
) => Response.json({ jsonrpc: "2.0", id, ...answer }, { status: 200, headers });

export class FleetMcpRelay {
  readonly #servers = new Map<string, ServerState>();
  readonly #kept: KeptSessions;
  #ids = 0;
  #pruned = 0;

  constructor(kept: KeptSessions) {
    this.#kept = kept;
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
        `[fleet-mcp] dropped ${dropped} relay session(s) unused for ${SESSION_TTL_MS / 86_400_000} days`
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
    state.lists.clear();
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
        queue: Promise.resolve(),
        queued: 0,
        misses: 0,
        lists: new Map(),
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

  /**
   * One upstream request through the server's gate: never answered 429.
   * While the upstream is limiting, requests go one after another, each once
   * the wait it named has passed, until one is answered and none is queued:
   * a herd released at once would only be refused again.
   */
  #send(
    name: string,
    state: ServerState,
    upstream: Upstream,
    exchange: Exchange
  ): Promise<Response> {
    return this.#sendTaking(name, state, upstream, exchange, (response) =>
      Promise.resolve(response)
    );
  }

  /**
   * {@link #send}, with what is wanted of the answer read by `take` as part
   * of each attempt: inside `ms` when given, so an answer whose reply never
   * comes within it is {@link NoAnswer}.
   */
  async #sendTaking<T>(
    name: string,
    state: ServerState,
    upstream: Upstream,
    exchange: Exchange,
    take: (response: Response) => Promise<T>,
    ms?: number
  ): Promise<T> {
    if (!state.limited) {
      const taken = await this.#attempt(
        name,
        state,
        upstream,
        exchange,
        take,
        ms
      );
      if (taken) {
        return taken.taken;
      }
    }
    state.queued += 1;
    const turn = state.queue.then(() =>
      this.#held(name, state, upstream, exchange, take, ms)
    );
    state.queue = turn.then(
      () => undefined,
      () => undefined
    );
    try {
      return await turn;
    } finally {
      state.queued -= 1;
      if (state.queued === 0) {
        state.limited = false;
      }
    }
  }

  /** A held request's turn: sent after the wait, again after each 429. */
  async #held<T>(
    name: string,
    state: ServerState,
    upstream: Upstream,
    exchange: Exchange,
    take: (response: Response) => Promise<T>,
    ms?: number
  ): Promise<T> {
    for (;;) {
      exchange.signal?.throwIfAborted();
      const wait = state.until - Date.now();
      if (wait > 0) {
        // Pacing, not a read: the gate's own wait, then the asker is looked at again.
        // biome-ignore lint/performance/noAwaitInLoops: the gate holds each request until the upstream's own wait has passed
        await Bun.sleep(wait);
        exchange.signal?.throwIfAborted();
      }
      const taken = await this.#attempt(
        name,
        state,
        upstream,
        exchange,
        take,
        ms
      );
      if (taken) {
        return taken.taken;
      }
    }
  }

  /**
   * One send, its answer taken by `take` (inside `ms` when given); undefined
   * when the upstream answered 429, the gate then holding its requests for
   * the wait it named.
   */
  async #attempt<T>(
    name: string,
    state: ServerState,
    upstream: Upstream,
    exchange: Exchange,
    take: (response: Response) => Promise<T>,
    ms?: number
  ): Promise<{ taken: T } | undefined> {
    const once = async (signal?: AbortSignal): Promise<Attempted<T>> => {
      const response = await upstream(
        signal ? { ...exchange, signal } : exchange
      );
      if (response.status === 429) {
        await response.body?.cancel();
        return { limited: response.headers };
      }
      if (response.ok) {
        state.misses = 0;
      }
      return { taken: await take(response) };
    };
    let attempted: Attempted<T>;
    if (ms === undefined) {
      attempted = await once();
    } else {
      const outcome = await readWithin(ms, once, {
        ...(exchange.signal ? { signal: exchange.signal } : {}),
      });
      switch (outcome.kind) {
        case "answered":
          attempted = outcome.value;
          break;
        case "unanswered":
          throw new NoAnswer(outcome.after);
        default: {
          const unhandled: never = outcome;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
    }
    if ("taken" in attempted) {
      return attempted;
    }
    state.limited = true;
    const named = namedWait(attempted.limited);
    const hold =
      named ?? Math.min(BACKOFF_FIRST_MS * 2 ** state.misses, BACKOFF_MAX_MS);
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
    return undefined;
  }

  /**
   * A JSON-RPC request the hub makes for every session, and the upstream's
   * answer to it: read off a JSON body or the event stream it opened, which
   * may also carry list changes. Each attempt, its reply read included, has
   * {@link LISTER_TIMEOUT_MS}; none in that time is {@link NoAnswer}.
   */
  async #rpc(
    name: string,
    state: ServerState,
    upstream: Upstream,
    lister: { session: string | null; protocol?: string },
    message: Message
  ): Promise<{ response: Response; reply?: Message }> {
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
    return await this.#sendTaking(
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
          return { response: await whole(response) };
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
          reply: await this.#replyOn(name, state, response.body, message.id),
        };
      },
      LISTER_TIMEOUT_MS
    );
  }

  /** The message answering `id` on an event stream, read until it comes; the stream's notifications heard on the way. */
  async #replyOn(
    name: string,
    state: ServerState,
    body: ReadableStream<Uint8Array>,
    id: Message["id"]
  ): Promise<Message | undefined> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let data: string[] = [];
    /** One event's data, ended by its blank line. */
    const event = (line: string): Message | undefined => {
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
        // biome-ignore lint/performance/noAwaitInLoops: an event stream is read in order until the answer arrives
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
            this.#heard(name, state, one.method);
          } else if (one && one.id === id) {
            return one;
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
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
      const { response, reply } = await this.#rpc(
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
        } as Message
      );
      const result = await initialized(response, reply);
      const session = response.headers.get("Mcp-Session-Id");
      const protocol =
        typeof result.protocolVersion === "string"
          ? result.protocolVersion
          : LATEST_PROTOCOL_VERSION;
      const told = await this.#rpc(
        name,
        state,
        upstream,
        { session, protocol },
        { jsonrpc: "2.0", method: "notifications/initialized" } as Message
      );
      await told.response.body?.cancel();
      const lister = { session, protocol, result };
      this.#listen(name, state, upstream, lister);
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
   * The upstream's own stream on the lister's session, where it says its
   * lists changed. One it does not offer (405) is simply not heard; one that
   * ends takes the lister with it, so the next list opens both again.
   */
  #listen(
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
      const response = await this.#send(name, state, upstream, {
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
      await this.#tap(name, state, response.body).pipeTo(new WritableStream());
    })()
      .catch(() => undefined)
      .finally(() => {
        if (state.listening !== control) {
          return;
        }
        state.listening = undefined;
        if (opened && !control.signal.aborted) {
          state.lister = undefined;
          state.lists.clear();
        }
      });
  }

  /** An upstream event stream passed on unchanged, its list changes heard on the way. */
  #tap(
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
                this.#heard(name, state, event.method);
              }
            }
          }
          controller.enqueue(chunk);
        },
      })
    );
  }

  /** The upstream said a list changed: the kept one goes, and every session hears it. */
  #heard(name: string, state: ServerState, method: string): void {
    const lists = CHANGED[method];
    if (!lists) {
      return;
    }
    for (const list of lists) {
      state.lists.delete(list);
      state.known.delete(list);
    }
    console.info(`[fleet-mcp] ${name}: the upstream says ${method}`);
    this.#broadcast(state, method);
  }

  #broadcast(state: ServerState, method: string): void {
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

  /** One list for every session: fetched once however many ask, every page of it. */
  #list(
    name: string,
    state: ServerState,
    upstream: Upstream,
    method: string
  ): Promise<Listed> {
    const kept = state.lists.get(method);
    if (kept && Date.now() - kept.at < LISTING_TTL_MS) {
      return kept.listed;
    }
    const key = LIST_METHODS[method] as string;
    const listed = this.#fetchList(name, state, upstream, method).then(
      (answer) => {
        if ("items" in answer) {
          const now = JSON.stringify(answer.items);
          const before = state.known.get(method);
          state.known.set(method, now);
          console.info(
            `[fleet-mcp] ${name}: ${method} upstream: ${answer.items.length} ${key}`
          );
          if (before !== undefined && before !== now) {
            this.#broadcast(state, changedBy(method));
          }
        }
        return answer;
      }
    );
    const entry = { at: Date.now(), listed };
    state.lists.set(method, entry);
    const drop = () => {
      if (state.lists.get(method) === entry) {
        state.lists.delete(method);
      }
    };
    // Only a list is kept: an error is the upstream's answer to this ask alone.
    listed.then((answer) => "error" in answer && drop(), drop);
    return listed;
  }

  /** Every page of one list, on the lister's session; one whose session ended upstream opens a new one, once. */
  async #fetchList(
    name: string,
    state: ServerState,
    upstream: Upstream,
    method: string,
    again = false
  ): Promise<Listed> {
    const key = LIST_METHODS[method] as string;
    const lister = await this.#lister(name, state, upstream);
    const items: unknown[] = [];
    let cursor: unknown;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: each page names the next
      const { response, reply } = await this.#rpc(
        name,
        state,
        upstream,
        lister,
        {
          jsonrpc: "2.0",
          id: this.#nextId(),
          method,
          params: cursor === undefined ? {} : { cursor },
        } as Message
      );
      if (response.status === 404 && lister.session && !again) {
        await response.body?.cancel();
        if (await this.#isLister(state, lister)) {
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

  /** Whether the server's lister is still `lister`. */
  async #isLister(state: ServerState, lister: Lister): Promise<boolean> {
    const current = state.lister;
    return current === undefined
      ? false
      : await current.then(
          (one) => one === lister,
          () => false
        );
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
      const { response, reply } = await this.#rpc(
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
        } as Message
      );
      const result = await initialized(response, reply);
      const session = response.headers.get("Mcp-Session-Id");
      const told = await this.#rpc(
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
        { jsonrpc: "2.0", method: "notifications/initialized" } as Message
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
    const response = await this.#send(name, state, upstream, {
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
        ? this.#tap(name, state, response.body)
        : response.body;
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: outgoing,
    });
  }

  /** A session's standalone stream: the hub's, carrying the list changes it hears. */
  #stream(
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

  /** A session's `initialize`, answered from the lister's: the session is the hub's from here. */
  async #open(
    name: string,
    state: ServerState,
    upstream: Upstream,
    single: Message
  ): Promise<Response> {
    let lister: Lister;
    try {
      lister = await this.#lister(name, state, upstream);
    } catch (error) {
      return this.#refusal(error, single.id);
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

  /** A closed session's upstream session closes too; nothing waits on it. */
  #close(
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
      const response = await this.#send(name, state, upstream, {
        method: "DELETE",
        headers: new Headers({ "Mcp-Session-Id": session }),
      });
      await response.body?.cancel();
    })().catch(() => undefined);
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
    single: Message
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
    if (method && LIST_METHODS[method] && single.params?.cursor === undefined) {
      return await this.#answerList(name, state, upstream, method, id);
    }
    return undefined;
  }

  /** A list method, from the one listing; one the upstream does not offer is not found. */
  async #answerList(
    name: string,
    state: ServerState,
    upstream: Upstream,
    method: string,
    id: Message["id"]
  ): Promise<Response> {
    let listed: Listed;
    try {
      const lister = await this.#lister(name, state, upstream);
      const offered = (
        lister.result.capabilities as Record<string, unknown> | undefined
      )?.[method.split("/")[0] as string];
      if (!offered) {
        return rpcAnswer(id, {
          error: { code: -32_601, message: `Method not found: ${method}` },
        });
      }
      listed = await this.#list(name, state, upstream, method);
    } catch (error) {
      return this.#refusal(error, id);
    }
    return "error" in listed
      ? rpcAnswer(id, { error: listed.error })
      : rpcAnswer(id, {
          result: { [LIST_METHODS[method] as string]: listed.items },
        });
  }

  /** The upstream's own refusal of a request made for every session, or its silence, answered to this one. */
  #refusal(error: unknown, id: Message["id"]): Response {
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
      return this.#stream(state, downstream, request);
    }
    if (request.method === "DELETE") {
      state.sessions.delete(id);
      if (id) {
        this.#kept.delete(id);
      }
      this.#close(name, state, upstream, downstream);
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
      return this.#refusal(error, single?.id ?? null);
    }
  }
}
