/**
 * What a connection's tool writes, for the upstream guard (core
 * `decideWrite`, docs/forge-adapters.md §3.3 and §3.6): sessions call a
 * connection's MCP tools as the hub (connections.ts `callAs`), so a write to
 * another person's repository is judged here, before the call, as the doors
 * judge theirs on a machine.
 *
 * Whether a tool writes at all is what its server says of it, in the
 * annotations its `tools/list` sends ({@link readsOnly}), never a list of
 * tool names kept here. A tool reads only when it says `readOnlyHint: true`
 * and does not say `destructiveHint: true`; anything else, no annotation
 * included, writes. That is GitLab's own reading of its server's tools: "Each
 * tool is sorted into an action category based on the annotations it
 * declares … `destructiveHint: true` Delete, `readOnlyHint: true` Read,
 * `readOnlyHint: false` Write, Neither annotation Delete … the most
 * restrictive declaration wins" (docs.gitlab.com/user/ai-governance/tool-governance).
 *
 * Where a forge's write lands:
 * - GitHub's MCP server names a repository by `owner` and `repo`
 *   (github/github-mcp-server pkg/github).
 * - GitLab's names a project by `project_id` or `id` ("ID or full path of
 *   the project"), `target_project_id` (`save_merge_request`: the project a
 *   merge request goes into), `project_full_path` (`save_vulnerability`),
 *   `project_ids` (`attach_scan_profile`), or `url`, a GitLab page of the
 *   project or of something in it (`add_commit`, `save_note`,
 *   `accept_merge_request`, `save_work_item` and others), each in
 *   docs.gitlab.com/user/model_context_protocol/mcp_server_tools. Every one a
 *   call gives is read: a write lands in another person's repository when any
 *   of them is another's, and one that names a project only by a number or
 *   a group names none the guard can check.
 * - Gitea's gitea-mcp names one by `owner` and `repo`, but a Gitea
 *   connection's address is the person's own gitea-mcp, not the Gitea host,
 *   so no write names a repository the guard can check: under Off or Ask it
 *   does not run, and `forge_post` (tea's sign-in) writes there instead.
 * Any other service's connection is no forge's, and is not judged here.
 */
import { owns, type UpstreamWrite } from "@cawco/core/upstream-guard";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Whether a connection's tool only reads, as its server's annotations say:
 * `readOnlyHint: true` and no `destructiveHint: true`. The one reading every
 * check of a connection tool goes by (the guard, read-only sessions, polls).
 */
export const readsOnly = (tool: Pick<Tool, "annotations">): boolean =>
  tool.annotations?.readOnlyHint === true &&
  tool.annotations.destructiveHint !== true;

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

/** The arguments GitLab's tools name a project by, one project each. */
const GITLAB_PROJECT_ARGS = [
  "project_id",
  "id",
  "target_project_id",
  "project_full_path",
] as const;

const EDGE_SLASHES = /^\/+|\/+$/gu;

/**
 * The project a GitLab page names, `host/group/project`: its path up to
 * GitLab's `/-/` (`…/group/project/-/merge_requests/3`); a page with no
 * `/-/` is the project's own. Undefined for a page on another host, or none.
 */
const projectOfPage = (page: string, host: string): string | undefined => {
  try {
    const url = new URL(page);
    if (url.hostname.toLowerCase() !== host) {
      return;
    }
    const path = url.pathname.split("/-/")[0]?.replace(EDGE_SLASHES, "");
    return path?.includes("/") ? `${host}/${path}` : undefined;
  } catch {
    // Not a page: no project it names.
  }
};

/**
 * Every project a GitLab call names, `host/path`, with `unnamed` when one of
 * them is given only as a number, a group or a page the guard cannot read.
 */
const gitlabProjects = (
  args: Readonly<Record<string, unknown>>,
  host: string | undefined
): { repos: string[]; unnamed: boolean } => {
  const given: unknown[] = [
    ...GITLAB_PROJECT_ARGS.map((name) => args[name]),
    ...(Array.isArray(args.project_ids) ? args.project_ids : []),
  ].filter((value) => value !== undefined && value !== null && value !== "");
  const repos: string[] = [];
  let unnamed = !host;
  for (const value of given) {
    const project = text(value);
    if (host && project?.includes("/")) {
      repos.push(`${host}/${project.replace(EDGE_SLASHES, "")}`);
    } else {
      unnamed = true;
    }
  }
  const page = text(args.url);
  if (page) {
    const project = host ? projectOfPage(page, host) : undefined;
    if (project) {
      repos.push(project);
    } else {
      unnamed = true;
    }
  }
  if (repos.length === 0) {
    unnamed = true;
  }
  return { repos, unnamed };
};

/**
 * The write a connection's tool call makes, `host/path` named where its
 * arguments name it; undefined for a read ({@link readsOnly}), or a
 * connection that is no forge's. `remotes` are the project's own
 * repositories: a GitLab call that names several projects writes to the
 * first that is another person's.
 */
export const connectionWrite = (
  connection: { name: string; service: string; url?: string | null },
  tool: Pick<Tool, "annotations" | "name">,
  args: Readonly<Record<string, unknown>>,
  remotes: readonly string[]
): UpstreamWrite | undefined => {
  const forge = forgeOf(connection.service);
  if (!forge || readsOnly(tool)) {
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
  const { repos, unnamed } = gitlabProjects(args, hostOf(connection.url));
  const other = repos.find((repo) => !owns(remotes, repo));
  if (other) {
    return { what, repo: other };
  }
  return unnamed || !repos[0] ? { what } : { what, repo: repos[0] };
};
