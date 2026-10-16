/**
 * A post to another person's repository held for the person's answer, under
 * the upstream choice's `ask` (upstream-guard.ts): exactly what CawCo makes
 * once it is approved, and what the ask in Needs you says it is.
 *
 * Each way a session posts is held where the guard already sees it, and
 * made, approved, by CawCo with a credential the session never holds:
 * - `gh`: the workspace's gh shim (agent upstream-shim.ts), its argv whole
 *   with every file it read in it; the host's gh runs it.
 * - `http`: a request to GitHub's API through the workspace's GitHub door
 *   (gh by its path, curl, a request by hand); the door sends it again with
 *   the host's token.
 * - `git`: a push to a GitHub repository that is not the project's, through
 *   the workspace's git door; the host pushes the same commits.
 * - `mcp`: a write tool of a GitHub connection (hub connections.ts); the hub
 *   calls it once.
 */
import { type GhPost, ghWords } from "./upstream-guard";

/** A request to GitHub's API, as the door read it. */
export interface HttpPost {
  readonly body?: string;
  readonly contentType?: string;
  readonly host: string;
  readonly method: string;
  readonly path: string;
  /** The query string, `?…`, or empty. */
  readonly search: string;
  readonly via: "http";
}

/** One ref a push sends: the commit it was at when asked, and where it goes. */
export interface PushedRef {
  readonly dst: string;
  readonly force: boolean;
  readonly sha: string;
}

/** A push from the workspace's clone to a GitHub repository by URL. */
export interface GitPost {
  readonly refs: readonly PushedRef[];
  readonly url: string;
  readonly via: "git";
}

/** A GitHub connection's write tool, called by the hub. */
export interface McpPost {
  readonly args: Readonly<Record<string, unknown>>;
  readonly connection: string;
  readonly tool: string;
  readonly via: "mcp";
}

export type UpstreamPost = GhPost | HttpPost | GitPost | McpPost;

/** The tool name an upstream post's ask is parked under: the permission card draws it (permission-presentation.ts). */
export const UPSTREAM_POST_TOOL = "mcp__cawco__upstream_post";

/** The machine control that makes an approved post on the machine whose workspace held it; args `[workspaceId, UpstreamPost]`, answers {@link PostMade}. */
export const CONTROL_UPSTREAM_POST = "upstreamPost";

/** What making a post said: whether it went, and what the host's program or GitHub answered. */
export interface PostMade {
  readonly ok: boolean;
  readonly said: string;
}

/** What the person reads on the ask: where it posts, what, as whom, and the post itself. */
export interface UpstreamAskInput {
  /** The account it posts as: the host's GitHub login, or the connection's account. */
  readonly account: string;
  readonly body?: string;
  /** The post itself in one line: the gh command, the request, the push, the tool call. */
  readonly command: string;
  /** What it is: "issue", "comment", "pull request", "push", … */
  readonly kind: string;
  /** `host/owner/repo`. */
  readonly repo: string;
  readonly title?: string;
}

/** A word as a shell would take it back: bare when it is plain, else single-quoted. */
const PLAIN = /^[A-Za-z0-9_./:=@%+,-]+$/;
const shellWord = (word: string): string =>
  PLAIN.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;

/** The value of the last `-x VALUE`, `-xVALUE`, `--long VALUE` or `--long=VALUE`. */
const flagValue = (
  args: readonly string[],
  short: string,
  long: string
): string | undefined => {
  let found: string | undefined;
  for (const [index, arg] of args.entries()) {
    if (arg === short || arg === long) {
      found = args[index + 1];
    } else if (arg.startsWith(`${long}=`)) {
      found = arg.slice(long.length + 1);
    } else if (arg.startsWith(short) && !arg.startsWith("--")) {
      found = arg.slice(short.length);
    }
  }
  return found;
};

/** `gh api`'s raw and typed fields, by key. */
const apiFields = (
  args: readonly string[]
): Partial<Record<string, string>> => {
  const fields: Partial<Record<string, string>> = {};
  for (const [index, arg] of args.entries()) {
    let field: string | undefined;
    if (["-f", "-F", "--raw-field", "--field"].includes(arg)) {
      field = args[index + 1];
    } else if (arg.startsWith("--raw-field=") || arg.startsWith("--field=")) {
      field = arg.slice(arg.indexOf("=") + 1);
    } else if (
      (arg.startsWith("-f") || arg.startsWith("-F")) &&
      !arg.startsWith("--") &&
      arg.length > 2
    ) {
      field = arg.slice(2);
    }
    const at = field?.indexOf("=") ?? -1;
    if (field && at > 0) {
      fields[field.slice(0, at)] = field.slice(at + 1);
    }
  }
  return fields;
};

const GH_KINDS: Readonly<Record<string, string>> = {
  "issue create": "issue",
  "issue comment": "comment",
  "pr create": "pull request",
  "pr comment": "comment",
  "pr review": "review",
  "pr merge": "merge",
  "repo fork": "fork",
  "release create": "release",
};

/** A REST path's kind, by what it posts to. */
const REST_KINDS: readonly [RegExp, string][] = [
  [/\/issues\/\d+\/comments$/, "comment"],
  [/\/issues$/, "issue"],
  [/\/pulls\/\d+\/reviews/, "review"],
  [/\/pulls\/\d+\/comments/, "review comment"],
  [/\/pulls$/, "pull request"],
  [/\/forks$/, "fork"],
  [/\/git\/refs/, "branch"],
  [/\/contents\//, "file"],
  [/\/releases/, "release"],
];

/** A GraphQL mutation's kind, by its first field. */
const GRAPHQL_KINDS: Readonly<Record<string, string>> = {
  createIssue: "issue",
  addComment: "comment",
  createPullRequest: "pull request",
  addPullRequestReview: "review",
  submitPullRequestReview: "review",
  mergePullRequest: "merge",
  createRef: "branch",
};

const MUTATION_FIELD = /mutation\b[^{]*\{\s*(?:\w+\s*:\s*)?(\w+)/;
const TRAILING_SLASHES = /\/+$/;
/** A branch's ref prefix, left off where a push names its branches. */
const HEADS = /^refs\/heads\//;

/** A JSON text's `title` and `body`, at its top or in a GraphQL request's variables (`input` too). */
const titled = (
  text: string | undefined
): { body?: string; title?: string } => {
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const variables = (parsed.variables ?? {}) as Record<string, unknown>;
    const input = (variables.input ?? {}) as Record<string, unknown>;
    const pick = (key: string): string | undefined =>
      [parsed[key], variables[key], input[key]].find(
        (one): one is string => typeof one === "string"
      );
    const title = pick("title");
    const body = pick("body");
    return {
      ...(title === undefined ? {} : { title }),
      ...(body === undefined ? {} : { body }),
    };
  } catch {
    return {};
  }
};

/** A GraphQL request's mutation, by its first field's name. */
const mutationOf = (text: string | undefined): string | undefined => {
  try {
    const { query } = JSON.parse(text ?? "{}") as { query?: unknown };
    return typeof query === "string"
      ? MUTATION_FIELD.exec(query)?.[1]
      : undefined;
  } catch {
    return undefined;
  }
};

const ghDescribed = (
  post: GhPost
): Omit<UpstreamAskInput, "account" | "repo"> => {
  const words = ghWords(post.args);
  const pair = `${words.command} ${words.sub}`;
  const api = words.command === "api";
  const fields = api ? apiFields(post.args) : {};
  const fromInput = api ? titled(post.stdin) : {};
  const title = api
    ? (fields.title ?? fromInput.title)
    : flagValue(post.args, "-t", "--title");
  const body = api
    ? (fields.body ?? fromInput.body)
    : (flagValue(post.args, "-b", "--body") ??
      flagValue(post.args, "-n", "--notes"));
  const endpoint = words.endpoint ?? "";
  return {
    kind: api
      ? (REST_KINDS.find(([path]) => path.test(endpoint))?.[1] ?? "API call")
      : (GH_KINDS[pair] ?? pair),
    command: ["gh", ...post.args].map(shellWord).join(" "),
    ...(title === undefined ? {} : { title }),
    ...(body === undefined ? {} : { body }),
  };
};

const httpDescribed = (
  post: HttpPost
): Omit<UpstreamAskInput, "account" | "repo"> => {
  const graphql = post.path.replace(TRAILING_SLASHES, "") === "/graphql";
  const mutation = graphql ? mutationOf(post.body) : undefined;
  const kind = graphql
    ? ((mutation && GRAPHQL_KINDS[mutation]) ?? mutation ?? "GraphQL mutation")
    : (REST_KINDS.find(([path]) => path.test(post.path))?.[1] ?? "API call");
  return {
    kind,
    command: `${post.method} ${post.host}${post.path}${post.search}`,
    ...titled(post.body),
  };
};

const MCP_KINDS: Readonly<Record<string, string>> = {
  add_issue_comment: "comment",
  create_pull_request: "pull request",
  merge_pull_request: "merge",
  pull_request_review_write: "review",
  create_branch: "branch",
  create_or_update_file: "file",
  push_files: "push",
  fork_repository: "fork",
};

const mcpDescribed = (
  post: McpPost
): Omit<UpstreamAskInput, "account" | "repo"> => {
  const { title, body, method } = post.args;
  const issue = method === "update" ? "issue edit" : "issue";
  const kind =
    post.tool === "issue_write" ? issue : (MCP_KINDS[post.tool] ?? post.tool);
  return {
    kind,
    command: `${post.connection} ${post.tool} ${JSON.stringify(post.args)}`,
    ...(typeof title === "string" ? { title } : {}),
    ...(typeof body === "string" ? { body } : {}),
  };
};

/**
 * What the person reads on a held post's ask: its kind, its title and body
 * as it carries them, and the post itself in one line, every word of it
 * from the post CawCo makes once approved. `repo` and `account` are what the
 * holder resolved: the repository it lands in, the login it posts as.
 */
export const describePost = (
  post: UpstreamPost,
  repo: string,
  account: string
): UpstreamAskInput => {
  let described: Omit<UpstreamAskInput, "account" | "repo">;
  switch (post.via) {
    case "gh":
      described = ghDescribed(post);
      break;
    case "http":
      described = httpDescribed(post);
      break;
    case "git":
      described = {
        kind: "push",
        title: post.refs.map((ref) => ref.dst.replace(HEADS, "")).join(", "),
        body: post.refs
          .map((ref) => `${ref.force ? "+" : ""}${ref.sha} → ${ref.dst}`)
          .join("\n"),
        command: `git push ${post.url} ${post.refs.map((ref) => `${ref.force ? "+" : ""}${ref.sha}:${ref.dst}`).join(" ")}`,
      };
      break;
    default:
      described = mcpDescribed(post);
  }
  return { repo, account, ...described };
};

/** One post as it is compared with another: two asks for the same post are one. */
export const postKey = (post: UpstreamPost): string => JSON.stringify(post);

/** Whether a value read off the wire is a post of one of the four kinds. */
export const isUpstreamPost = (value: unknown): value is UpstreamPost => {
  const post = value as { via?: unknown } | null;
  if (!post || typeof post !== "object") {
    return false;
  }
  const one = post as Record<string, unknown>;
  switch (post.via) {
    case "gh":
      return (
        Array.isArray(one.args) &&
        one.args.every((arg) => typeof arg === "string") &&
        typeof one.repo === "string" &&
        typeof one.host === "string" &&
        (one.stdin === undefined || typeof one.stdin === "string")
      );
    case "http":
      return (
        typeof one.method === "string" &&
        typeof one.host === "string" &&
        typeof one.path === "string" &&
        typeof one.search === "string" &&
        (one.body === undefined || typeof one.body === "string")
      );
    case "git":
      return (
        typeof one.url === "string" &&
        Array.isArray(one.refs) &&
        one.refs.every(
          (ref: { dst?: unknown; force?: unknown; sha?: unknown }) =>
            typeof ref.sha === "string" &&
            typeof ref.dst === "string" &&
            typeof ref.force === "boolean"
        )
      );
    case "mcp":
      return (
        typeof one.connection === "string" &&
        typeof one.tool === "string" &&
        typeof one.args === "object" &&
        one.args !== null
      );
    default:
      return false;
  }
};
