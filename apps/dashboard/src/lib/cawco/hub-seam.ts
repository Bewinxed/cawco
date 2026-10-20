/**
 * What a component reads of the hub, through its own tree: the connection's
 * state, as `cawco.hub` says it, and a read of the hub's REST, as `send`
 * answers one. The app provides none, so every reader reads the live client
 * and the network. A states file provides a stand-in for the hub state it
 * names (HubStandIn, by a story's decorator): context, not a store, because
 * the canvas draws every frame in one page, and two frames naming two hub
 * states each read their own.
 */
import { getContext, setContext } from "svelte";
import { cawco, type HubState } from "./client.svelte";
import { send } from "./project-tasks";

export interface HubSeam {
  /** A read of the hub's REST (`GET <path>`), its JSON answer or its refusal. */
  read: <T>(path: string) => Promise<T>;
  /** The connection to the hub. */
  readonly state: HubState;
}

/** The live client's connection and the network. */
const live: HubSeam = {
  get state() {
    return cawco.hub;
  },
  read: (path) => send(path),
};

const KEY = Symbol("hub-seam");

/** What the components under this one read of the hub (a states file's stand-in). */
export function provideHub(seam: HubSeam): void {
  setContext(KEY, seam);
}

/** The hub as this component reads it: a stand-in provided above it, else the live client. */
export const hubSeam = (): HubSeam =>
  getContext<HubSeam | undefined>(KEY) ?? live;
