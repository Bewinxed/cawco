/**
 * The hub as Eden's typed client (elysiajs.com/eden/treaty/overview) for every
 * caller that is not a browser: the agent, the CLI and the scripts. Every
 * route by its path, what it takes and what it answers come from the hub's
 * own routes (`HubApp`, a type-only import: none of the server's code comes
 * with it), never written here.
 *
 * Each caller keeps its own transport (`send`): the agent's `provenFetch`, a
 * machine's `machineFetch`, a probe's deadline and credential. It is named at
 * every client, never defaulted: it is what carries the caller's credential,
 * and a default would send without one in silence, as the agent's update loop
 * did when this seam took `fetch` by default (the nightly from 886030601,
 * refused as anonymous). Dates stay the strings the hub sent
 * (`parseDate: false`): Eden would otherwise make every ISO string a `Date`
 * its route doesn't type.
 */

import { problemWords } from "@cawco/core/hub-refusal";
import type { HubApp } from "@cawco/hub/app";
import { type Treaty, treaty } from "@elysia/eden";

/** What sends a hub request: `fetch` itself, or one that carries the caller's credential or deadline. */
export type HubSender = (url: string, init: RequestInit) => Promise<Response>;

/** `fetch`'s type around a sender: Eden always hands it the URL as a string, and it only needs `preconnect` to be `typeof fetch`. */
const fetcherOf = (send: HubSender): typeof fetch =>
  Object.assign(
    (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      send(String(input), init ?? {}),
    { preconnect: fetch.preconnect }
  );

/** Eden's client of the hub. */
export type HubClient = Treaty.Create<HubApp>;

/** The hub at `base` (its origin), asked through `send`. */
export const hubClient = (base: string, send: HubSender): HubClient =>
  treaty<HubApp>(base, {
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

/** Paths alone (`hubPath.health["~path"]`), for a caller that hands a hub path on rather than asking it. */
export const hubPath: HubClient = hubClient("", fetch);

/** `answer`, unless the request got no answer: that fails as itself, what Eden hands back as a 503 with no response. */
export const reached = <A extends HubAnswer>(answer: A): A => {
  if (answer.response === undefined && answer.error !== null) {
    throw answer.error.value;
  }
  return answer;
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
    return answer.data;
  }
  throw refused({ status: answer.status, value: answer.error?.value });
}

/** `answer`'s data: for one already known to have no error (`reached` first, then `answer.error` checked). */
export function dataOf<A extends HubAnswer>(answer: A): HubData<A>;
export function dataOf(answer: HubAnswer): unknown {
  return answer.data;
}

/**
 * A refusal as words: its problem's `detail`, as every hub refusal says it
 * (core hub-refusal.ts `problemWords`), the hub not answering with the status
 * that came for any other body, and what `fetch` rejected with for a request
 * that got no answer.
 */
export const refusalText = ({ status, value }: HubRefusal): string =>
  value instanceof Error ? value.message : problemWords(value, status);
