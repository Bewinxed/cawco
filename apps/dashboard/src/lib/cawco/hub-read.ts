/**
 * A read from the hub that says how it ended: the value, or the status the
 * hub answered and its own words. Loads use it so a failed read is carried to
 * whatever shows the data, or thrown where the page cannot stand without it —
 * never turned into an empty value that looks like a real answer.
 */

/** A refused read: the hub's status and what it said about it, without a closing stop. */
export interface HubFailure {
  detail: string;
  status: number;
}

export type HubRead<T> = { ok: true; value: T } | ({ ok: false } & HubFailure);

/**
 * The machine a transcript read's 503 names as not connected, and whether
 * the hub says it is on its way back (`X-Cawco-Machine-State: reconnecting`:
 * heard from moments ago). Any other answer names none. `readAgainMs`: on
 * its way back, how long until the hub stops reading it so (its
 * `Retry-After`), when a read finds it back or offline; null otherwise.
 */
export function machineAway(response: Response): {
  away: string | null;
  readAgainMs: number | null;
  reconnecting: boolean;
} {
  const away =
    response.status === 503 ? response.headers.get("x-cawco-machine") : null;
  const reconnecting =
    away !== null &&
    response.headers.get("x-cawco-machine-state") === "reconnecting";
  const seconds = Number(response.headers.get("retry-after"));
  return {
    away,
    reconnecting,
    readAgainMs:
      reconnecting && Number.isFinite(seconds) && seconds > 0
        ? seconds * 1000
        : null,
  };
}

/**
 * The hub's own words on a refused read: the problem's `detail` or `title`,
 * the api proxy's `error`, or the text it answered. Read from the body alone —
 * a universal load may not read response headers SvelteKit does not
 * serialise.
 */
export async function hubFailure(response: Response): Promise<HubFailure> {
  const text = (await response.text()).trim();
  const body = text.startsWith("{") ? parsed(text) : null;
  const said =
    body?.detail ||
    body?.error ||
    body?.title ||
    body?.message ||
    text ||
    `the hub answered ${response.status}`;
  return { status: response.status, detail: said.replace(FINAL_STOP, "") };
}

/** A JSON error body, or null when the text only starts like one. */
function parsed(text: string): {
  detail?: string;
  error?: string;
  message?: string;
  title?: string;
} | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A sentence's closing stop, dropped so the hub's words sit inside ours. */
const FINAL_STOP = /\.$/;

/**
 * Longer than this, the hub's words are not a reason a person reads in a
 * line: a stack, a dump, a page of markup. Our choice: two lines of a toast.
 */
const REASON_LIMIT = 160;

/** The first sentence of a text: up to its first stop that ends a word. */
const FIRST_SENTENCE = /^.*?[.!?](?=\s|$)/;

/** Markup or a JSON dump, not prose: a reason never starts so. */
const NOT_PROSE = /^[<{[]/;

/**
 * A thrown error's label ("Error:", "TypeError:"): the runtime's name for the
 * throw, not a word of the reason (WORDS.md, "Error formula": a technical code
 * is never the what-happened).
 */
const ERROR_LABEL = /^[A-Za-z]*(?:[Ee]rror|[Ee]xception):\s*/;

/**
 * Why a read was refused, as one sentence a person reads, without its
 * closing stop: the hub's own words when their first line is a short
 * sentence of prose, its thrown error's label taken off, else what its
 * status says ("The hub answered 502"). Never more than one sentence, never
 * a body as it came.
 */
export function failureReason({ detail, status }: HubFailure): string {
  const line = detail.split("\n", 1)[0].trim().replace(ERROR_LABEL, "");
  const sentence = (line.match(FIRST_SENTENCE)?.[0] ?? line).replace(
    FINAL_STOP,
    ""
  );
  const prose =
    sentence.length > 0 &&
    sentence.length <= REASON_LIMIT &&
    !NOT_PROSE.test(sentence);
  return prose
    ? `${sentence[0].toUpperCase()}${sentence.slice(1)}`
    : `The hub answered ${status}`;
}

/**
 * The browsers' words for a request that got no answer at all: `fetch`
 * rejects with a TypeError saying one of them (Chromium "Failed to fetch",
 * Firefox "NetworkError when attempting to fetch resource.", Safari "Load
 * failed" or "The network connection was lost.").
 */
const NO_ANSWER =
  /^(?:Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed|The network connection was lost\.?)$/;

/**
 * The header the dashboard's `/api` proxy sets on its own 502 when the hub
 * did not answer it (`routes/api/[...path]`): the request reached the
 * dashboard and stopped there, never the hub's refusal.
 */
export const HUB_UNREACHABLE_HEADER = "x-cawco-hub-unreachable";

/** A request the dashboard could not get to the hub, or got no answer for. */
export class HubUnreachable extends Error {}

/** Whether `response` is the dashboard's own word that the hub did not answer it. */
export function unreachedAnswer(response: Response): boolean {
  return (
    response.status === 502 &&
    response.headers.get(HUB_UNREACHABLE_HEADER) === "1"
  );
}

/**
 * A send to Caw that got no answer, in the error formula: what, why, what is
 * kept, the way back. Said over the composer of every place that writes to
 * him (a thread tab, his panel).
 */
export const THREAD_SEND_UNREACHED =
  "Message not sent: the dashboard couldn't reach the hub. Your words are back in the field. Send again once the hub answers.";

/** Whether `error` is a request that never reached the hub, or never heard back from it. */
export function unreachable(error: unknown): boolean {
  return (
    error instanceof HubUnreachable ||
    (error instanceof TypeError && NO_ANSWER.test(error.message))
  );
}

/**
 * A request that got no answer, as a person reads it (WORDS.md, "Error
 * formula"): what happened, why, and the way back. The browser's own words
 * ("Failed to fetch") are never the what-happened.
 */
export const HUB_UNREACHABLE =
  "The dashboard couldn't reach the hub: the request got no answer. Check that the hub's machine is up and this device is online, then try again.";

/**
 * Why something failed, in the one wording every surface shows: a request
 * that never reached the hub says so ({@link HUB_UNREACHABLE}); anything else
 * is the thrower's own words, the hub's refusals already in the formula.
 */
export function failureWords(error: unknown): string {
  if (unreachable(error)) {
    return HUB_UNREACHABLE;
  }
  return error instanceof Error ? error.message : String(error);
}

/** {@link failureWords} without its closing stop, for a sentence of the caller's that carries it. */
export function failureClause(error: unknown): string {
  return failureWords(error).replace(FINAL_STOP, "");
}

/** Reads `path` through the given fetch and parses its JSON, or says why not. */
export async function readHub<T>(
  fetch: typeof globalThis.fetch,
  path: string,
  init?: RequestInit
): Promise<HubRead<T>> {
  const response = await fetch(path, init);
  if (!response.ok) {
    return { ok: false, ...(await hubFailure(response)) };
  }
  return { ok: true, value: (await response.json()) as T };
}
