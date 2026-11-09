/**
 * The hub as a probe asks it: anonymous, with the request init a spec hands
 * (its deadline, its credential headers) beside what Eden sends, and an
 * answer's body as text.
 */
import {
  type HubAnswer,
  type HubClient,
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

/** A request of the hub as a spec's helper takes it. */
export type HubAsk = (hub: HubClient) => Promise<HubAnswer>;

/** A hub this process runs (`hub.handle`), asked through Eden, every request carrying `headers`. */
export const handled = (
  handle: (request: Request) => Response | Promise<Response>,
  headers: Record<string, string> = {}
): HubClient =>
  hubClient("http://127.0.0.1", async (url, init) =>
    handle(
      new Request(url, { ...init, headers: { ...init.headers, ...headers } })
    )
  );

/** What an answer said, however the hub said it. */
export interface Said {
  json: unknown;
  status: number;
  text: string;
}

/** `answer` as a spec reads it. */
export const said = (answer: HubAnswer): Said => ({
  json: answer.error ? answer.error.value : answer.data,
  status: answer.status,
  text: answerText(answer),
});

/** A request as a browser's page sends it itself (`page.evaluate`): its path and fetch init. */
export interface RequestForPage {
  body?: string;
  headers?: Record<string, string>;
  method: string;
  path: string;
}

/** The request `ask` sends, without sending it: for a page that sends it from the browser, where no client runs. */
export const requestOf = async (ask: HubAsk): Promise<RequestForPage> => {
  let sent: RequestForPage | undefined;
  await ask(
    hubClient("", (url, init) => {
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((value, name) => {
        headers[name] = value;
      });
      sent = {
        path: url,
        method: init.method ?? "GET",
        headers,
        ...(typeof init.body === "string" ? { body: init.body } : {}),
      };
      return Promise.resolve(Response.json({}));
    })
  );
  if (!sent) {
    throw new Error("the request was never made");
  }
  return sent;
};

/** What a held question's `payload` carries, for a spec that reads a field of it: the hub's route types it `unknown`. */
export const payloadOf = (held: {
  payload?: unknown;
}): Record<string, unknown> =>
  typeof held.payload === "object" && held.payload !== null
    ? Object.fromEntries(Object.entries(held.payload))
    : {};

/** The `Request` `ask` sends, for a hub this process runs (`hub.handle`) that a spec reads as a `Response`. */
export const hubRequested = async (
  ask: HubAsk,
  headers: Record<string, string> = {}
): Promise<Request> => {
  const { path, method, headers: sent, body } = await requestOf(ask);
  return new Request(`http://127.0.0.1${path}`, {
    method,
    headers: { ...sent, ...headers },
    ...(body === undefined ? {} : { body }),
  });
};
