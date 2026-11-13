/**
 * Strings that name a path on something other than the hub, by file and
 * pattern: none of them is a hub route. agent-calls.ts leaves them out of
 * what a hub must keep answering, and the ban on hub paths built outside
 * the ban on hand-built hub paths (scripts/lint/hub-path-by-hand.ts) lets them stand.
 * A pattern is the path as written, each piece that is no known string a
 * `*`, and a trailing `/**` any rest.
 */
export const NOT_HUB: { file: string; pattern: string; why: string }[] = [
  {
    file: "packages/agent/src/harnesses/opencode-server.ts",
    pattern: "/api/session/active",
    why: "the OpenCode server's own route, asked of the server the agent runs",
  },
  {
    file: "packages/agent/src/harnesses/opencode.ts",
    pattern: "/api/model",
    why: "the OpenCode server's own model list, read from the server the agent runs (opencode.ts `catalogRows`)",
  },
  {
    file: "packages/agent/src/harnesses/opencode.ts",
    pattern: "/api/model/default",
    why: "the OpenCode server's own default model, read from the server the agent runs",
  },
  {
    file: "packages/agent/src/harnesses/opencode.ts",
    pattern: "/api/integration",
    why: "the OpenCode server's own list of integrations, read from the server the agent runs",
  },
  {
    file: "packages/agent/src/harnesses/opencode-session.ts",
    pattern: "/mcp",
    why: "an MCP server's own endpoint as OpenCode's config names it",
  },
  {
    file: "packages/agent/src/mcp-host.ts",
    pattern: "/mcp/local/<name>",
    why: "words in an error, naming the agent's own local MCP route",
  },
  {
    file: "packages/agent/src/session.ts",
    pattern: "/mcp/local/*",
    why: "the agent's own local MCP route (mcp-host.ts), served on this machine",
  },
  {
    file: "packages/agent/src/mcp-gate.ts",
    pattern: "/mcp/gate/**",
    why: "a workspace session's MCP gate, on the agent's own gateway port (mcp-gate.ts `GATE_PREFIX`)",
  },
  {
    file: "packages/agent/src/mcp-gate.ts",
    pattern: "/mcp/gate/*/**",
    why: "a gate's server path, on the agent's own gateway port (mcp-gate.ts `gatePath`)",
  },
  {
    file: "packages/agent/src/browser/shield.ts",
    pattern: "/*",
    why: "neko's REST, on the browser container's loopback port",
  },
  {
    file: "packages/agent/src/browser/container-host.ts",
    pattern: "/health",
    why: "neko's health, on the browser container's loopback port",
  },
  {
    file: "packages/agent/src/browser/container-host.ts",
    pattern: "/api/login",
    why: "neko's sign-in, on the browser container's loopback port",
  },
  {
    file: "packages/agent/src/forges/github.ts",
    pattern: "/api/v3",
    why: "a GitHub Enterprise host's API base",
  },
  {
    file: "packages/core/src/words/connections.ts",
    pattern: "/api/v4/mcp",
    why: "GitLab's MCP server, on gitlab.com or a self-managed host",
  },
];
