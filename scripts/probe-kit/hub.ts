/**
 * The hub as a probe asks it: anonymous, with the request init a spec hands
 * (its deadline, its credential headers) beside what Eden sends, and an
 * answer's body as text.
 */
import type { Page } from "playwright-core";
import {
  type HubAnswer,
  type HubClient,
  type HubConfig,
  type HubData,
  hubClient,
  refusalText,
} from "../../packages/agent/src/hub-client";

/** The hub at `base`, asked with `init`'s fields beside each request (a `signal`, `headers`). */
export const hubAt = (base: string, init: RequestInit = {}): HubClient =>
  hubClient(base, (url, sent) =>
    fetch(url, {
      ...sent,
      ...init,
      headers: { ...sent.headers, ...init.headers },
    })
  );

/**
 * What a spec shows of `answer` however the hub said it: a refusal's problem
 * detail (`refusalText`, as every reader outside the dashboard says one), an
 * answer's body as its text or its JSON as written.
 */
export const answerText = (answer: HubAnswer): string => {
  if (answer.error) {
    return refusalText({ status: answer.status, value: answer.error.value });
  }
  return typeof answer.data === "string"
    ? answer.data
    : JSON.stringify(answer.data);
};

/** A request of the hub as a spec's helper takes it, by the answer its route types. */
export type HubAsk<A extends HubAnswer = HubAnswer> = (
  hub: HubClient
) => Promise<A>;

/** A hub this process runs (`hub.handle`), asked through Eden with `config`'s headers on every request. */
export const handled = (
  handle: (request: Request) => Response | Promise<Response>,
  config: HubConfig = {}
): HubClient =>
  hubClient(
    "http://127.0.0.1",
    async (url, init) => handle(new Request(url, init)),
    config
  );

/** What the hub refused `A` with: the refusal bodies its route types, none for a route that cannot refuse. */
type RefusalOf<A> = A extends { error: { value: infer V } } ? V : never;

/**
 * What an answer said, however the hub said it: `refused` tells its success
 * body (`HubData<A>`, what the route answers) from its refusal's (what the
 * route types for its error), and `status`/`text` hold either.
 */
export type Said<A extends HubAnswer> = {
  status: number;
  text: string;
} & (
  { json: HubData<A>; refused: false } | { json: RefusalOf<A>; refused: true }
);

/** `answer` as a spec reads it, its route's type kept. */
export function said<A extends HubAnswer>(answer: A): Said<A>;
export function said(answer: HubAnswer): {
  json: unknown;
  refused: boolean;
  status: number;
  text: string;
} {
  return {
    json: answer.error ? answer.error.value : answer.data,
    refused: answer.error !== null,
    status: answer.status,
    text: answerText(answer),
  };
}

/**
 * The hub as this browser page asks it: Eden from the probe's process, at the
 * page's own origin, over the page's own credentials. `page.request` "uses
 * the same cookie jar as its BrowserContext"
 * (playwright.dev/docs/api/class-apirequestcontext, Cookie management), so a
 * cookie the page holds is sent and one the answer sets or clears lands on
 * the page; a write carries the `Origin` the page's own would.
 */
export const pageHub = (page: Page): HubClient => {
  const { origin } = new URL(page.url());
  return hubClient(origin, async (url, init) => {
    const method = init.method ?? "GET";
    const answer = await page.request.fetch(url, {
      method,
      headers: {
        ...Object.fromEntries(new Headers(init.headers)),
        ...(method === "GET" ? {} : { origin }),
      },
      ...(typeof init.body === "string" ? { data: init.body } : {}),
    });
    const body = await answer.body();
    return new Response(body.length > 0 ? Uint8Array.from(body) : null, {
      status: answer.status(),
      headers: answer.headers(),
    });
  });
};

/** What a held question's `payload` carries, for a spec that reads a field of it: the hub's route types it `unknown`. */
export const payloadOf = (held: {
  payload?: unknown;
}): Record<string, unknown> =>
  typeof held.payload === "object" && held.payload !== null
    ? Object.fromEntries(Object.entries(held.payload))
    : {};
