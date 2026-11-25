/**
 * Gitea's client, and Forgejo's: gitea-mcp, "Gitea's official MCP Server"
 * (gitea.com/gitea/gitea-mcp), built on Gitea's official Go SDK, which
 * TypeScript cannot call; the one TypeScript client, gitea-js, stops at
 * Gitea 1.23 (docs/forge-adapters.md §2). The client is one tool caller
 * (provider spec §2.3, `Credential` kind `mcp`): a machine's starts the
 * host's `gitea-mcp` signed in as tea's login (agent forges/gitea-sign-in.ts).
 */

/** What one gitea-mcp tool answered: its text parts, and whether it is an error. */
export interface GiteaAnswer {
  content: readonly ({ text: string; type: "text" } | { type: string })[];
  isError?: boolean;
}

/** One gitea-mcp tool called with its arguments. */
export type McpToolCaller = (
  tool: string,
  args: Record<string, unknown>
) => Promise<GiteaAnswer>;

/** A client signed in to one Gitea host. */
export interface GiteaClient {
  call: McpToolCaller;
}

/** The gitea-mcp tools the writes call, and no others are listed to it. */
export const GITEA_TOOLS = [
  "get_me",
  "issue_read",
  "issue_write",
  "pull_request_write",
  "pull_request_read",
] as const;
