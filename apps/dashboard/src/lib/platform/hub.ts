/**
 * The hub as Eden's typed client (elysiajs.com/eden/treaty/overview): every
 * route by its path, what it takes and what it answers read from the hub's
 * own routes (`HubApp`, a type-only import: no server code comes with it),
 * never written here.
 *
 * Relative to this page (its domain kept as `""`): the dashboard's `/api`
 * proxy reaches the hub. Sent through `through` when given (a load's own
 * `fetch`), else the page's `fetch` as it stands at each call, so the leaving
 * gate on it (leaving.ts) holds; each answer handed to Eden as it may read
 * it ({@link readable}). Dates stay the strings the hub sent
 * (`parseDate: false`): Eden would otherwise make every ISO string a `Date`
 * its route doesn't type.
 */
import type { HubApp } from "@cawco/hub/app";
import { treaty } from "@elysia/eden";
import { JSON_TYPE } from "./hub-read";

/**
 * `response` as Eden may read it. Eden parses a body that says it is JSON
 * before it looks at the status, and one that doesn't parse rejects the
 * whole call with the parser's `SyntaxError`: the status is lost, and a
 * refused write would read as no refusal. Such a body comes on as the text
 * it is, its status kept, so it is read as every body that is no JSON is:
 * the hub not answering, at its own status (hub-read.ts `bodyOf`,
 * `hubFailure`).
 */
async function readable(response: Response): Promise<Response> {
  if (!JSON_TYPE.test(response.headers.get("content-type") ?? "")) {
    return response;
  }
  const text = await response.clone().text();
  try {
    JSON.parse(text);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set("content-type", "text/plain;charset=utf-8");
    // Eden reads chunked text with no length as a stream.
    headers.delete("transfer-encoding");
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export const hubThrough = (through?: typeof fetch) =>
  treaty<HubApp>("", {
    keepDomain: true,
    parseDate: false,
    // A proxy of fetch, so it keeps what else fetch carries (Bun types its
    // `preconnect`), sending through `through`, else the page's `fetch` as
    // it stands at this call.
    fetcher: new Proxy(fetch, {
      apply: (_fetch, _this, args: Parameters<typeof fetch>) =>
        (through ?? globalThis.fetch)(...args).then(readable),
    }),
  });

/** The hub, from this page. */
export const hub = hubThrough();

/** Eden's client of the hub: the live one, or a states file's stand-in (hub-stand-in.ts). */
export type HubClient = ReturnType<typeof hubThrough>;

/**
 * A route's address from this page, for a request Eden's client cannot
 * send itself (a beacon, an upload that says how far it has gone, a read
 * timed apart from its body): each segment of Eden's path (`~path`)
 * encoded, a path parameter's value among them, and `query` after it.
 */
export function hubPath(
  route: { "~path": string },
  query: Record<string, string> = {}
): string {
  const path = route["~path"].split("/").map(encodeURIComponent).join("/");
  const search = new URLSearchParams(query).toString();
  return search ? `${path}?${search}` : path;
}
