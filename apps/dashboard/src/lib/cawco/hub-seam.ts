/**
 * What a component reads of the hub, through its own tree: the connection's
 * state, as `connectionStore.hub` says it, and Eden's client of the hub's
 * REST. A states file provides a stand-in for the hub state it names
 * (HubStandIn, by a story's decorator): context, not a store, because the
 * canvas draws every frame in one page, and two frames naming two hub
 * states each read their own. The live client's seam is hub-live.ts, which
 * a reader of the live store takes where nothing above provides one; this
 * module imports no store, so a stand-in loads none.
 */

import type { HubClient } from "@cawco/hub/client";
import { getContext, setContext } from "svelte";
import type { HubState } from "./hub/socket.svelte";

export interface HubSeam {
  /** The hub's REST, as Eden's client asks it. */
  readonly client: HubClient;
  /**
   * Whether a session's machine is offline, said by a states file's
   * stand-in; the live client leaves it out, and a reader takes the
   * session's own row (`isStale`).
   */
  readonly machineOffline?: boolean;
  /** The connection to the hub. */
  readonly state: HubState;
}

const KEY = Symbol("hub-seam");

/** What the components under this one read of the hub (a states file's stand-in). */
export function provideHub(seam: HubSeam): void {
  setContext(KEY, seam);
}

/** The hub a component above provides, or none. */
export const hubAbove = (): HubSeam | undefined =>
  getContext<HubSeam | undefined>(KEY);
