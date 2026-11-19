/**
 * The hub as Eden's typed client (elysiajs.com/eden/treaty/overview), for
 * every TypeScript caller of the hub: the dashboard (its platform/hub.ts),
 * the agent, the CLI, the OpenCode plugin and the scripts. Every route by
 * its path, what it takes and what it answers come from the hub's own
 * routes (`HubApp`, a type-only import: none of the server's code comes with
 * it), never written here. Its value imports are Eden and core's refusal
 * words; of the hub, none (scripts/lint/hub-types-only.grit holds it), so a
 * browser's bundle and the agent's binary carry no hub code.
 *
 * Each caller keeps its own transport (`send`): the dashboard's page `fetch`,
 * the agent's `provenFetch`, a machine's `machineFetch`, a probe's deadline
 * and credential. It is named at every client, never defaulted: it is what
 * carries the caller's credential, and a default would send without one in
 * silence, as the agent's update loop did when this seam took `fetch` by
 * default (the nightly from 886030601, refused as anonymous). Dates stay the
 * strings the hub sent (`parseDate: false`): Eden would otherwise make every
 * ISO string a `Date` its route doesn't type.
 *
 * A route marked as a byte route (hub byte-routes.ts) gains two calls of
 * this client's own, through Eden's plugin API
 * (next.elysiajs.com/eden/treaty/plugin): `putBytes(stream)` on a `bytesIn`
 * PUT and `getBytes()` on a `bytesOut` GET, a stream sent and read as it
 * goes. Eden's own verbs send a stream as the JSON text `{}` and read an
 * `application/octet-stream` answer whole (elysiajs/eden#35); these keep the
 * route's address, parameters and refusals typed from the hub's route and
 * go through the same `send`, `headers` and `onRequest` as every call.
 */

import { problemWords } from "@cawco/core/hub-refusal";
import { hubFailureWords } from "@cawco/core/words/hub-failure";
import {
  EdenFetchError,
  type PluginTypeFn,
  type PluginVerbContext,
  type Treaty,
  type TreatyPlugin,
  treaty,
} from "@elysia/eden";
import type { HubApp } from "./app";

/** What sends a hub request: `fetch` itself, or one that carries the caller's credential or deadline. */
export type HubSender = (url: string, init: RequestInit) => Promise<Response>;

/**
 * `fetch`'s type around a sender: a proxy of `fetch`, so it keeps whatever
 * else the runtime's `fetch` carries (Bun's `preconnect`) without naming it,
 * and a browser's build needs no Bun type. Eden always hands it the URL as a
 * string.
 */
const fetcherOf = (send: HubSender): typeof fetch =>
  new Proxy(fetch, {
    apply: (_fetch, _this, [input, init]: Parameters<typeof fetch>) =>
      send(String(input), init ?? {}),
  });

/** No headers bound on the client's type: each caller adds its own at run time ({@link HubConfig}). */
type NoHead = Record<string, never>;

/** No call a route gains: the type fn's answer for a route that is no byte route. */
type NoCalls = Record<never, never>;

/** The calls a byte route gains (hub byte-routes.ts): on a `bytesIn` PUT, `putBytes`; on a `bytesOut` GET, `getBytes`. */
export interface ByteCallsFn extends PluginTypeFn {
  output: (this["node"] extends {
    put: {
      meta: { bytesIn: true };
      response: infer Res extends Record<number, unknown>;
    };
  }
    ? {
        /** `body` sent as it is read, answered as the route answers. */
        putBytes: (
          body: ReadableStream<Uint8Array>,
          options?: { signal?: AbortSignal }
        ) => Promise<Treaty.TreatyResponse<Res>>;
      }
    : NoCalls) &
    (this["node"] extends {
      get: {
        meta: { bytesOut: true };
        response: infer Res extends Record<number, unknown>;
      };
    }
      ? {
          /** The answer's bytes as a stream, unread; a refusal as the route answers it. */
          getBytes: (options?: {
            signal?: AbortSignal;
          }) => Promise<Treaty.TreatyResponse<Res>>;
        }
      : NoCalls);
}

/** The names of the calls {@link ByteCallsFn} adds, for a reader of the client's chains (hub scripts/agent-calls.ts). */
export const BYTE_CALLS = ["putBytes", "getBytes"] as const;

/** Eden's client of the hub. */
export type HubClient = Treaty.Create<HubApp, NoHead, [ByteCallsFn]>;

/**
 * A config's or a call's headers as Eden reads them, lower-cased: an object,
 * `Headers`, a name and value pair, a function of the path and the request
 * so far that answers any of these, or a list of them.
 */
const headersOf = async (
  given: unknown,
  path: string,
  init: RequestInit
): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  const pending: unknown[] = [given];
  while (pending.length > 0) {
    const one = pending.shift();
    if (typeof one === "function") {
      pending.unshift(await one(path, init));
    } else if (one instanceof Headers) {
      one.forEach((value, name) => {
        out[name.toLowerCase()] = value;
      });
    } else if (Array.isArray(one)) {
      if (typeof one[0] === "string") {
        out[one[0].toLowerCase()] = String(one[1]);
      } else {
        pending.unshift(...one);
      }
    } else if (one && typeof one === "object") {
      for (const [name, value] of Object.entries(one)) {
        out[name.toLowerCase()] = String(value);
      }
    }
  }
  return out;
};

/** An answer's body as Eden reads a refusal's: its JSON, else its text. */
const bodyOf = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/** The byte calls, sent through `send` with the client's `headers` and `onRequest`, answered in Eden's shape. */
const byteCalls = (
  send: HubSender,
  config: HubConfig
): TreatyPlugin<ByteCallsFn> => {
  const ask = async (
    context: PluginVerbContext,
    asked: RequestInit,
    read: (response: Response) => unknown
  ) => {
    const path = `/${context.paths.map(encodeURIComponent).join("/")}`;
    let named = {
      ...(await headersOf(config.headers, path, asked)),
      ...(await headersOf(asked.headers, path, asked)),
    };
    let init: RequestInit = { ...asked, headers: named };
    for (const hook of [config.onRequest ?? []].flat()) {
      const more = await hook(path, init);
      if (more) {
        named = {
          ...named,
          ...(await headersOf(more.headers, path, init)),
        };
        init = { ...init, ...more, headers: named };
      }
    }
    let response: Response;
    try {
      response = await send(`${context.domain}${path}`, init);
    } catch (error) {
      return {
        data: null,
        error: new EdenFetchError(503, error),
        response: undefined,
        status: 503,
        headers: undefined,
      };
    }
    const { status, headers } = response;
    if (status < 200 || status >= 300) {
      return {
        data: null,
        error: new EdenFetchError(status, await bodyOf(response)),
        response,
        status,
        headers,
      };
    }
    return {
      data: await read(response),
      error: null,
      response,
      status,
      headers,
    };
  };
  return {
    name: "byte-calls",
    verbs: {
      putBytes: (
        context: PluginVerbContext,
        body: ReadableStream<Uint8Array>,
        options?: { signal?: AbortSignal }
      ) => {
        // A stream as a request's body is sent as it is read (fetch's half duplex).
        const put: RequestInit & { duplex: "half" } = {
          method: "PUT",
          body,
          duplex: "half",
          headers: { "content-type": "application/octet-stream" },
          ...(options?.signal ? { signal: options.signal } : {}),
        };
        return ask(context, put, bodyOf);
      },
      getBytes: (
        context: PluginVerbContext,
        options?: { signal?: AbortSignal }
      ) =>
        ask(
          context,
          {
            method: "GET",
            ...(options?.signal ? { signal: options.signal } : {}),
          },
          (response) => response.body
        ),
    },
  };
};

/**
 * What a caller adds to every request of its client: fixed `headers`, or an
 * `onRequest` that sets a request's headers from its path and method
 * (next.elysiajs.com/eden/treaty/config: "shallow merge it into the current
 * RequestInit, merging its headers"), and an `onResponse` that reads an
 * answer before Eden does (the dashboard's file answers, hub-read.ts
 * `fileOf`).
 */
export type HubConfig = Pick<
  Treaty.Config,
  "headers" | "onRequest" | "onResponse"
>;

/** The hub at `base` (its origin), asked through `send`. */
export const hubClient = (
  base: string,
  send: HubSender,
  config: HubConfig = {}
): HubClient =>
  treaty<HubApp>(base, {
    ...config,
    keepDomain: true,
    parseDate: false,
    fetcher: fetcherOf(send),
  }).use(byteCalls(send, config));

/** What the hub refused a request with. */
export interface HubRefusal {
  status: number;
  /** The refusal's body, as Eden read it: its JSON, else its text. */
  value: unknown;
}

/** An Eden answer, whatever its route. */
export interface HubAnswer {
  data: unknown;
  error: { status: unknown; value: unknown } | null;
  response: Response;
  status: number;
}

/**
 * What a successful `answer` holds: what its route answers, Eden's reading of
 * the body. A route that answers a `Response` for some paths types that
 * member too, but Eden hands back the body it read, never the `Response`, so
 * the member is dropped.
 */
export type HubData<A> = A extends { data: infer D; error: null }
  ? Exclude<D, Response>
  : never;

/**
 * The routes alone, for a caller that has no client to take one from and
 * hands its address on rather than asking it ({@link hubPath}). It sends
 * nothing: its `send` is `fetch` only for the type.
 */
export const hubRoutes: HubClient = hubClient("", fetch);

/**
 * A route's address, for a request Eden's client cannot send itself (a
 * beacon, an upload that says how far it has gone, a download read as it
 * comes, an element's `src`) or one handed on: each segment of Eden's path
 * (`~path`) encoded, as Eden encodes a path parameter's value when it sends,
 * and `query` after it. Relative to the client's base; a caller with an
 * origin puts it before.
 */
export function hubPath(
  route: { "~path": string },
  query: Record<string, string> = {}
): string {
  const path = route["~path"].split("/").map(encodeURIComponent).join("/");
  const search = new URLSearchParams(query).toString();
  return search ? `${path}?${search}` : path;
}

/** `answer`, unless the request got no answer: that fails as itself, what Eden hands back as a 503 with no response. */
export const reached = <A extends HubAnswer>(answer: A): A => {
  if (answer.response === undefined && answer.error !== null) {
    throw answer.error.value;
  }
  return answer;
};

/** A 2xx whose body is no JSON at all: a proxy's page, or an empty answer. */
export class HubNotAnswering extends Error {}

/**
 * A successful answer's body, or {@link HubNotAnswering}: Eden hands a body
 * that is no JSON back as text in `data`, which is the hub not having
 * answered, by the rule the dashboard's `answerOf` (hub-read.ts) reads a body
 * by. A 204 has no body to read.
 */
const successBody = (answer: HubAnswer): unknown => {
  const { data, response, status } = answer;
  if (
    typeof data === "string" &&
    status !== 204 &&
    !response.headers.get("content-type")?.includes("json")
  ) {
    try {
      JSON.parse(data);
    } catch (error) {
      throw new HubNotAnswering(`${hubFailureWords.noAnswer(status)}.`, {
        cause: error,
      });
    }
  }
  return data;
};

/**
 * What the hub answered, or the refusal thrown in the caller's words
 * (`refused`). A request that got no answer (the connection refused, a
 * deadline) fails as itself: Eden hands it back as a 503 with no response,
 * which is the hub's refusal to no caller.
 */
export function unwrap<A extends HubAnswer>(
  answer: A,
  refused: (refusal: HubRefusal) => Error
): HubData<A>;
export function unwrap(
  answer: HubAnswer,
  refused: (refusal: HubRefusal) => Error
): unknown {
  if (reached(answer).error === null) {
    return successBody(answer);
  }
  throw refused({ status: answer.status, value: answer.error?.value });
}

/**
 * Whether `answer` has no error: a guard, so a caller generic over its answer
 * (`A extends HubAnswer`) narrows to one {@link dataOf} takes.
 */
export const succeeded = <A extends HubAnswer>(
  answer: A
): answer is A & { error: null } => answer.error === null;

/**
 * `answer`'s data, read by the rule {@link unwrap} reads it, for an answer its
 * caller has narrowed to no error (`answer.error` checked first, or
 * {@link succeeded}). The type takes no other: an answer with an error has no
 * data (`null`), and Eden hands a request that got no answer back as such an
 * answer rather than rejecting, so reading one as data read `null` as the
 * route's body (the binary rig's install watcher read `null.machines` while
 * its hub restarted, and died without the line its rig waits for).
 */
export function dataOf<A extends HubAnswer>(
  answer: A & { error: null }
): HubData<A>;
export function dataOf(answer: HubAnswer & { error: null }): unknown {
  return successBody(answer);
}

/**
 * A refusal as words: its problem's `detail`, as every hub refusal says it
 * (core hub-refusal.ts `problemWords`), the hub not answering with the status
 * that came for any other body, and what `fetch` rejected with for a request
 * that got no answer.
 */
export const refusalText = ({ status, value }: HubRefusal): string =>
  value instanceof Error ? value.message : problemWords(value, status);
