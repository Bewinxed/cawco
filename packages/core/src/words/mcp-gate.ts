/**
 * What a session's MCP gate (agent mcp-host.ts `gateTarget`, mcp-oauth.ts
 * `gateRoute` and its relay) says of a request it refuses or can't relay:
 * the body of its HTTP error, read by the session's agent as its MCP
 * server's error, or in a log. The app draws none of it.
 * Decided by Gemini 4 Neon (the project's `assets/9a2f4c11/neon-answer.md`).
 */
export const mcpGateWords = {
  /** A token that opens no gate of a running session here (401). */
  notOpened: "Token doesn't match a running session.",
  /** CawCo's own server asked for by the host key, not a session's token (403). */
  needsSessionToken: "Session token required.",
  /** The session's credential for CawCo's server hasn't reached this machine yet (503). */
  notProved: (id: string) => `Credential for ${id} isn't ready yet.`,
  /** A request from off this machine, or from a page (403). */
  harnessOnly: "Request isn't from the local agent.",
  /** The relay to the server `name` failed, in the network's words (502). */
  unreachable: (name: string, error: string) =>
    `Couldn't reach the ${name} MCP server: ${error}`,
  /** An SSE server's message endpoint named on another origin (400). */
  sseOffOrigin: "SSE endpoint isn't on the server's origin.",
} as const;
