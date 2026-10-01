/**
 * The fleet's MCP servers, read once per page. A transcript names the server
 * each call went to but not its URL, and a stored session has no live list to
 * ask — the fleet's config is what says which site answers `firecrawl`.
 */
import { browser } from "$app/environment";
import type { FleetSnapshot } from "./fleet";
import type { ConfiguredServer } from "./mcp";

let servers = $state.raw<ConfiguredServer[] | null>(null);
let asked = false;

async function load() {
  const response = await fetch("/api/fleet");
  if (response.ok) {
    const snapshot = (await response.json()) as FleetSnapshot;
    servers = snapshot.config.mcp;
  }
}

export function fleetMcpServers(): ConfiguredServer[] | null {
  // The server render has no origin to ask; the page reads it once it runs.
  if (browser && !asked) {
    asked = true;
    // biome-ignore lint/complexity/noVoid: one read per page; a hub without a fleet leaves rows on their glyphs
    void load();
  }
  return servers;
}
