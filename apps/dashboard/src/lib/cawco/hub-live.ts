/**
 * The live client's hub seam (hub-seam.ts): its connection, as `cawco.hub`
 * says it, and the network. A reader of the live store takes it where
 * nothing above provides a stand-in.
 */
import { hubJson, refusedOrUnreached } from "#lib/platform/hub-read.js";
import { cawco } from "./client.svelte";
import { type HubSeam, hubAbove } from "./hub-seam";

const live: HubSeam = {
  get state() {
    return cawco.hub;
  },
  read: (request) => hubJson(request, { failure: refusedOrUnreached }),
};

/** The hub as this component reads it: a stand-in provided above it, else the live client. */
export const hubSeam = (): HubSeam => hubAbove() ?? live;
