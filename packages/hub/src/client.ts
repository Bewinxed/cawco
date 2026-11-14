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
 */

import { problemWords } from "@cawco/core/hub-refusal";
import { hubFailureWords } from "@cawco/core/words/hub-failure";
import { type Treaty, treaty } from "@elysia/eden";
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

/** Eden's client of the hub. */
export type HubClient = Treaty.Create<HubApp>;

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
  });

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
