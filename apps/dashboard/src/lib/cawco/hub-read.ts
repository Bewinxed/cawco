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
 * heard from moments ago). Any other answer names none.
 */
export function machineAway(response: Response): {
  away: string | null;
  reconnecting: boolean;
} {
  const away =
    response.status === 503 ? response.headers.get("x-cawco-machine") : null;
  return {
    away,
    reconnecting:
      away !== null &&
      response.headers.get("x-cawco-machine-state") === "reconnecting",
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
