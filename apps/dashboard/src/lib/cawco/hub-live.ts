/**
 * The live client's hub seam (hub-seam.ts): its connection, as `connectionStore.hub`
 * says it, and the network. A reader of the live store takes it where
 * nothing above provides a stand-in.
 */
import { hub } from "#lib/platform/hub.js";
import { connectionStore } from "./hub/socket.svelte";

import { type HubSeam, hubAbove } from "./hub-seam";

const live: HubSeam = {
  get state() {
    return connectionStore.hub;
  },
  client: hub,
};

/** The hub as this component reads it: a stand-in provided above it, else the live client. */
export const hubSeam = (): HubSeam => hubAbove() ?? live;
