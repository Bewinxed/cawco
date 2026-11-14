/**
 * The hub as Eden's typed client, from this page (`@cawco/hub/client`, the
 * one client every caller of the hub builds from).
 *
 * Relative to this page (its domain kept as `""`): the dashboard's `/api`
 * proxy reaches the hub. Sent through `through` when given (a load's own
 * `fetch`), else the page's `fetch` as it stands at each call, so the leaving
 * gate on it (leaving.ts) holds; each answer handed to Eden as it may read
 * it ({@link readable}), a file's as its Blob ({@link fileOf}).
 */
import { type HubClient, hubClient } from "@cawco/hub/client";
import { fileOf, readable } from "./hub-read";

export const hubThrough = (through?: typeof fetch): HubClient =>
  hubClient(
    "",
    (url, init) => (through ?? globalThis.fetch)(url, init).then(readable),
    // A file answer is its Blob (hub-read.ts `fileOf`), not what Eden reads
    // by its type.
    { onResponse: fileOf }
  );

/** The hub, from this page. */
export const hub = hubThrough();
