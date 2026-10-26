/**
 * The composer's suggestions, as the dashboard sends them and the hub ranks
 * them (hub suggest.ts, usage-count.ts): what a session has that Jev can be
 * asked about. A leaf: the dashboard reads it too.
 */

/** The kinds of thing a session has: a skill, a tool, an MCP server. */
export const CAPABILITY_KINDS = ["skill", "tool", "mcp"] as const;
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

/**
 * One thing Jev can be asked about: a skill, a tool or an MCP server the
 * session has. The hub ranks them by the operator's usage and asks about the
 * top ones, so the composer sends them all.
 */
export interface SuggestCandidate {
  description: string;
  id: string;
  kind: CapabilityKind;
  name: string;
}
