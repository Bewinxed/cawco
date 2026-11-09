/**
 * The hub as Eden's typed client (elysiajs.com/eden/treaty/overview): every
 * route by its path, what it takes and what it answers read from the hub's
 * own routes (`HubApp`, a type-only import: no server code comes with it),
 * never written here.
 *
 * Relative to this page (its domain kept as `""`): the dashboard's `/api`
 * proxy reaches the hub. Sent through `through` when given (a load's own
 * `fetch`), else the page's `fetch` as it stands at each call, so the leaving
 * gate on it (leaving.ts) holds. Dates stay the strings the hub sent
 * (`parseDate: false`): Eden would otherwise make every ISO string a `Date`
 * its route doesn't type.
 */
import type { HubApp } from "@cawco/hub/app";
import { treaty } from "@elysia/eden";

export const hubThrough = (through?: typeof fetch) =>
  treaty<HubApp>("", {
    keepDomain: true,
    parseDate: false,
    ...(through ? { fetcher: through } : {}),
  });

/** The hub, from this page. */
export const hub = hubThrough();

/** Eden's client of the hub: the live one, or a states file's stand-in (hub-stand-in.ts). */
export type HubClient = ReturnType<typeof hubThrough>;
