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
 * it ({@link readable}), a file's as its Blob ({@link fileOf}). Dates stay the
 * strings the hub sent
 * (`parseDate: false`): Eden would otherwise make every ISO string a `Date`
 * its route doesn't type.
 */
import type { HubApp } from "@cawco/hub/app";
import { treaty } from "@elysia/eden";
import { fileOf, readable } from "./hub-read";

export const hubThrough = (through?: typeof fetch) =>
  treaty<HubApp>("", {
    keepDomain: true,
    parseDate: false,
    // A file answer is its Blob (hub-read.ts `fileOf`), not what Eden reads
    // by its type.
    onResponse: fileOf,
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
