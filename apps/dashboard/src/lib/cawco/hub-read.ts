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
 * The hub's own words on a refused read: the problem's `detail` or `title`,
 * the api proxy's `error`, or the text it answered. Read from the body alone —
 * a universal load may not read response headers SvelteKit does not
 * serialise.
 */
export async function hubFailure(response: Response): Promise<HubFailure> {
  const text = (await response.text()).trim();
  const body = text.startsWith("{")
    ? (JSON.parse(text) as { detail?: string; error?: string; title?: string })
    : null;
  const said =
    body?.detail ||
    body?.error ||
    body?.title ||
    text ||
    `the hub answered ${response.status}`;
  return { status: response.status, detail: said.replace(FINAL_STOP, "") };
}

/** A sentence's closing stop, dropped so the hub's words sit inside ours. */
const FINAL_STOP = /\.$/;

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
