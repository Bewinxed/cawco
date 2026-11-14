/**
 * A file an element shows and the dashboard also reads: its address for the
 * element (`href`) and the request that reads it (`ask`), its answer read by
 * hub-read's readers (`hubData`, `hubAsk`): an output's words, a captions
 * file's text, the hub's refusal when a picture or a clip doesn't load.
 */
import { hubPath } from "@cawco/hub/client";
import type { HubAnswer } from "./hub-read";

export interface ServedFile<T = unknown> {
  /** The request for the file `href` names, as Eden's client hands its answer back. */
  ask: () => Promise<HubAnswer<T>>;
  /** Its address, for an element's `src` or a link. */
  href: string;
}

/** A file a hub route serves: the route answers its bytes as a Blob (hub-read `fileOf`). */
export type HubFile = ServedFile<Blob>;

/**
 * The file `route` serves for `query`: its address and its read, both made
 * from the one route, so the element and the read never name two files.
 */
export function hubFile<Q extends Record<string, string>>(
  route: {
    "~path": string;
    get: (options: { query: Q }) => Promise<HubAnswer<Blob>>;
  },
  query: Q
): HubFile {
  return { href: hubPath(route, query), ask: () => route.get({ query }) };
}
