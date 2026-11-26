/** A server as any config names it: a session's status or a fleet row. */

import { registrableDomain } from "@cawco/core/registrable-domain";
export interface ConfiguredServer {
  config?: unknown;
  name: string;
}

/**
 * The hostname a server's config names: HTTP, SSE and claude.ai proxy configs
 * name a URL; a stdio server runs on the machine itself and has none (null).
 */
function mcpHost(server: ConfiguredServer): string | null {
  const { config } = server;
  if (
    !(config && typeof config === "object" && "url" in config) ||
    typeof config.url !== "string"
  ) {
    return null;
  }
  try {
    return new URL(config.url).hostname;
  } catch {
    return null;
  }
}

/**
 * The host behind the server segment of an `mcp__<server>__<tool>` call, from
 * a list of configured servers — a session's own or the fleet's. Claude Code
 * builds that segment from the configured name with everything outside
 * `[A-Za-z0-9_-]` turned to `_`.
 */
export function mcpServerHost(
  servers: readonly ConfiguredServer[] | null,
  segment: string
): string | undefined {
  const server = servers?.find(
    (item) => item.name.replace(/[^\w-]/gu, "_") === segment
  );
  return (server && mcpHost(server)) ?? undefined;
}

/**
 * The registrable root of a host, by the public suffix list. A bare host
 * (localhost, an IP) is its own root.
 */
export function rootDomain(host: string): string {
  return registrableDomain(host) ?? host;
}
