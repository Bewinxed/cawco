/**
 * What a forge connection's tool writes, for the upstream guard (core
 * `decideWrite`, docs/forge-adapters.md §3.3): sessions call a connection's
 * MCP tools as the hub (connections.ts `callAs`), so a write to another
 * person's repository is judged here, before the call, as the doors judge
 * theirs on a machine.
 *
 * - GitHub's MCP server names a repository by `owner` and `repo`, and marks
 *   each read `ReadOnlyHint: true` (github/github-mcp-server pkg/github).
 * - GitLab's names a project by `project_id` or `id`, "ID or full path of the
 *   project" (docs.gitlab.com/user/model_context_protocol/mcp_server_tools);
 *   a numeric id names no repository the guard can check, so under Off or Ask
 *   it does not run.
 * - Gitea's gitea-mcp names one by `owner` and `repo`, but a Gitea
 *   connection's address is the person's own gitea-mcp, not the Gitea host,
 *   so no write names a repository the guard can check: under Off or Ask it
 *   does not run, and `forge_post` (tea's sign-in) writes there instead.
 * A tool the server marks read-only writes nothing. Any other service's
 * connection is no forge's, and is not judged here.
 */
import type { UpstreamWrite } from "@cawco/core/upstream-guard";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/** The forge a connection's service is, as its row names it. */
const forgeOf = (
  service: string
): "github" | "gitlab" | "gitea" | undefined => {
  const named = service.trim().toLowerCase();
  return named === "github" || named === "gitlab" || named === "gitea"
    ? named
    : undefined;
};

/** The host a connection's MCP server serves: GitLab's is at `<host>/api/v4/mcp`. */
const hostOf = (url: string | null | undefined): string | undefined => {
  try {
    return url ? new URL(url).hostname.toLowerCase() : undefined;
  } catch {
    // No URL that reads: no host to name.
  }
};

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/**
 * The write a connection's tool call makes, `host/path` named where its
 * arguments name it; undefined for a read, or a connection that is no
 * forge's.
 */
export const connectionWrite = (
  connection: { name: string; service: string; url?: string | null },
  tool: Pick<Tool, "annotations" | "name">,
  args: Readonly<Record<string, unknown>>
): UpstreamWrite | undefined => {
  const forge = forgeOf(connection.service);
  if (!forge || tool.annotations?.readOnlyHint === true) {
    return;
  }
  const what = `${connection.name} ${tool.name}`;
  if (forge === "github") {
    const owner = text(args.owner);
    const repo = text(args.repo);
    // A GitHub tool that names no repository acts on none (a gist, a user).
    return owner && repo
      ? { what, repo: `github.com/${owner}/${repo}` }
      : undefined;
  }
  if (forge === "gitea") {
    return { what };
  }
  const project = text(args.project_id) ?? text(args.id);
  const host = hostOf(connection.url);
  return project?.includes("/") && host
    ? { what, repo: `${host}/${project}` }
    : { what };
};
