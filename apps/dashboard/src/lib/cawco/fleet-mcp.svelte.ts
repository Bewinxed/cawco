/**
 * The fleet's MCP servers, read once per hub a page reads. A transcript
 * names the server each call went to but not its URL, and a stored session
 * has no live list to ask — the fleet's config is what says which site
 * answers `firecrawl`.
 *
 * Read through the hub its reader is under (hub-seam): the live client's
 * network in the app, a states file's stand-in on a canvas. A canvas is
 * served by a stage, which serves components and no `/api`: a read of its
 * own origin there was a 502 in every embed's console.
 */
import { browser } from "$app/env";
import type { FleetSnapshot } from "./fleet";
import type { HubSeam } from "./hub-seam";
import type { ConfiguredServer } from "./mcp";

interface Read {
  servers: ConfiguredServer[] | null;
}

const reads = new WeakMap<HubSeam, Read>();

/** The fleet's servers as `hub` answers them; null until it has, and for good where it has no fleet to say. */
export function fleetMcpServers(hub: HubSeam): ConfiguredServer[] | null {
  // The server render has no origin to ask; the page reads it once it runs.
  if (!browser) {
    return null;
  }
  let read = reads.get(hub);
  if (!read) {
    const held = $state<Read>({ servers: null });
    read = held;
    reads.set(hub, held);
    hub.read<FleetSnapshot>("/api/fleet").then(
      (snapshot) => {
        held.servers = snapshot.config.mcp;
      },
      () => {
        // A hub without a fleet, or a stand-in that keeps none, leaves
        // rows on their glyphs.
      }
    );
  }
  return read.servers;
}
