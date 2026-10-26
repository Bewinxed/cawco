import { z } from "zod";
/**
 * A post to another person's repository held for the person's answer, under
 * the upstream choice's `ask` (upstream-guard.ts): exactly what CawCo makes
 * once it is approved, and what the ask in Needs you says it is.
 *
 * Each way a session posts is held where its credential is, and made,
 * approved, by CawCo with a credential the session never holds:
 * - `http`: a request to GitHub's API through the workspace's GitHub door
 *   (gh, curl, a request by hand); the door sends it again with the host's
 *   token.
 * - `git`: a push to a repository that is not the project's, on any host,
 *   through the workspace's git door; the host pushes the same commits with
 *   its own credential.
 * - `mcp`: a write tool of a forge's connection (hub connections.ts); the
 *   hub calls it once.
 * - `forge`: an issue, a pull or merge request, or a comment an agent asked
 *   for (`forge_post`), on GitHub, GitLab or Gitea; the machine makes it
 *   through that forge's adapter with its own sign-in there (agent
 *   forges/forge.ts, docs/forge-adapters.md).
 */

/** The forges CawCo posts to through an adapter. */
const FORGES = ["github", "gitlab", "gitea"] as const;
export type Forge = (typeof FORGES)[number];

/** Each forge as a person names it. */
export const FORGE_NAMES: Readonly<Record<Forge, string>> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
};

/** What a pull request is called on each forge: GitLab's is a merge request. */
export const changeRequestWords = (forge: Forge): string =>
  forge === "gitlab" ? "merge request" : "pull request";

/**
 * One write to a repository on a forge: an issue, a pull or merge request
 * from `head` into `base`, or a comment on an issue's or a pull request's
 * `number` (GitLab numbers its issues and merge requests apart).
 */
export type ForgeWrite =
  | { readonly body: string; readonly op: "issue"; readonly title: string }
  | {
      readonly base: string;
      readonly body: string;
      readonly head: string;
      readonly op: "pull_request";
      readonly title: string;
    }
  | {
      readonly body: string;
      readonly number: number;
      readonly on: "issue" | "pull_request";
      readonly op: "comment";
    };

/** A forge write to the repository `repo` (`host/path`), on the forge its machine found for that host. */
export interface ForgePost {
  readonly forge: Forge;
  readonly repo: string;
  readonly via: "forge";
  readonly write: ForgeWrite;
}

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

/** A push from the workspace's clone to a repository by URL, on any host. */
export interface GitPost {
  readonly refs: readonly PushedRef[];
  readonly url: string;
  readonly via: "git";
}

/** A GitHub connection's write tool, called by the hub. */
interface McpPost {
  readonly args: Readonly<Record<string, unknown>>;
  readonly connection: string;
  readonly tool: string;
  readonly via: "mcp";
}

export type UpstreamPost = HttpPost | GitPost | McpPost | ForgePost;

/** The tool name an upstream post's ask is parked under: the permission card draws it (permission-presentation.ts). */
export const UPSTREAM_POST_TOOL = "mcp__cawco__upstream_post";

/**
 * The machine control that makes a post once, with no decision, on the
 * machine that holds its sign-in: an approved held post, or a landing's pull
 * request. Args `[workspaceId | null, UpstreamPost]` (a forge post needs no
 * workspace), answers {@link PostMade}.
 */
export const CONTROL_UPSTREAM_POST = "upstreamPost";

/**
 * The machine control a session's `forge_post` reaches (agent forges/forge.ts
 * `forgePost`): args `[UpstreamRule | null, ForgeAsk]`, the project's rule as
 * the hub holds it; answers what the write came to there.
 */
export const CONTROL_FORGE_POST = "forgePost";

/** A session's forge write as the hub sends it: the repository by URL or `host/path`, and the write. */
export interface ForgeAsk {
  readonly repo: string;
  readonly write: ForgeWrite;
}

/** A forge ask read off the wire; undefined when it is none. */
export const readForgeAsk = (value: unknown): ForgeAsk | undefined => {
  const ask = value as { repo?: unknown; write?: unknown } | null;
  return ask &&
    typeof ask === "object" &&
    typeof ask.repo === "string" &&
    isForgeWrite(ask.write)
    ? { repo: ask.repo, write: ask.write }
    : undefined;
};

/**
 * What a session's forge write came to on the machine: made (or the
 * making failed, in its words), held with the post and the account it would
 * post as for the person's ask, or refused in the guard's words.
 */
export type ForgeVerdict =
  | { readonly kind: "made"; readonly made: PostMade }
  | {
      readonly account: string;
      readonly kind: "held";
      readonly post: ForgePost;
      readonly what: string;
    }
  | { readonly kind: "refused"; readonly why: string };

/** What making a post said: whether it went, and what the host's program or the forge answered; a forge write's page when it made or found one. */
export interface PostMade {
  /** A pull or merge request that was open already for the same branches. */
  readonly existing?: boolean;
  readonly ok: boolean;
  readonly said: string;
  readonly url?: string;
}

/** What the person reads on the ask: where it posts, what, as whom, and the post itself. */
export interface UpstreamAskInput {
  /** The account it posts as: the host's GitHub login, the host's git sign-in for another host, or the connection's account. */
  readonly account: string;
  readonly body?: string;
  /** The post itself in one line: the request, the push, the tool call. */
  readonly command: string;
  /** What it is: "issue", "comment", "pull request", "push", … */
  readonly kind: string;
  /** `host/owner/repo`. */
  readonly repo: string;
  /**
   * Where it goes as Needs you names it: `owner/repo` (the host too, off
   * GitHub), with `#n` for the issue or pull request a comment, a review or
   * an edit is on.
   */
  readonly target: string;
  readonly title?: string;
}

/** A REST path's kind, by what it posts to. */
const REST_KINDS: readonly [RegExp, string][] = [
  [/\/issues\/\d+\/comments$/u, "comment"],
  [/\/issues$/u, "issue"],
  [/\/pulls\/\d+\/reviews/u, "review"],
  [/\/pulls\/\d+\/comments/u, "review comment"],
  [/\/pulls$/u, "pull request"],
  [/\/forks$/u, "fork"],
  [/\/git\/refs/u, "branch"],
  [/\/contents\//u, "file"],
  [/\/releases/u, "release"],
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

/** A JSON object, by its keys. */
const RECORD = z.record(z.string(), z.unknown());
const MUTATION_FIELD = /mutation\b[^{]*\{\s*(?:\w+\s*:\s*)?(\w+)/u;
const TRAILING_SLASHES = /\/+$/u;
/** A branch's ref prefix, left off where a push names its branches. */
const HEADS = /^refs\/heads\//u;

/** A forge write's kind and its one line, as the card says them. */
const forgeDescribed = (
  post: ForgePost
): Omit<UpstreamAskInput, "account" | "repo" | "target"> => {
  const forge = FORGE_NAMES[post.forge];
  const { write } = post;
  switch (write.op) {
    case "issue":
      return {
        kind: `${forge} issue`,
        title: write.title,
        body: write.body,
        command: `open an issue on ${post.repo}`,
      };
    case "pull_request":
      return {
        kind: `${forge} ${changeRequestWords(post.forge)}`,
        title: write.title,
        body: write.body,
        command: `open a ${changeRequestWords(post.forge)} on ${post.repo} from ${write.head} into ${write.base}`,
      };
    case "comment":
      return {
        kind: `${forge} comment`,
        body: write.body,
        command: `comment on ${write.on === "issue" ? "issue" : changeRequestWords(post.forge)} ${write.number} of ${post.repo}`,
      };
    default: {
      const unhandled: never = write;
      throw new Error(`unhandled forge write: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** Whether a value read off the wire is a forge write the adapters make. */
const isForgeWrite = (value: unknown): value is ForgeWrite => {
  const write = value as Record<string, unknown> | null;
  if (!write || typeof write !== "object") {
    return false;
  }
  switch (write.op) {
    case "issue":
      return typeof write.title === "string" && typeof write.body === "string";
    case "pull_request":
      return (
        typeof write.title === "string" &&
        typeof write.body === "string" &&
        typeof write.base === "string" &&
        typeof write.head === "string"
      );
    case "comment":
      return (
        typeof write.body === "string" &&
        Number.isInteger(write.number) &&
        (write.on === "issue" || write.on === "pull_request")
      );
    default:
      return false;
  }
};

/** A JSON text's `title` and `body`, at its top or in a GraphQL request's variables (`input` too). */
const titled = (
  text: string | undefined
): { body?: string; title?: string } => {
  if (!text) {
    return {};
  }
  try {
    const parsed = RECORD.catch({}).parse(JSON.parse(text));
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
    const { query } = z
      .object({ query: z.unknown() })
      .catch({ query: undefined })
      .parse(JSON.parse(text ?? "{}"));
    return typeof query === "string"
      ? MUTATION_FIELD.exec(query)?.[1]
      : undefined;
  } catch {
    return undefined;
  }
};

const httpDescribed = (
  post: HttpPost
): Omit<UpstreamAskInput, "account" | "repo" | "target"> => {
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
): Omit<UpstreamAskInput, "account" | "repo" | "target"> => {
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
  let described: Omit<UpstreamAskInput, "account" | "repo" | "target">;
  switch (post.via) {
    case "http":
      described = httpDescribed(post);
      break;
    case "forge":
      described = forgeDescribed(post);
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
    case "mcp":
      described = mcpDescribed(post);
  }
  const number = numberOf(post);
  const path = repo.startsWith(GITHUB_HOST)
    ? repo.slice(GITHUB_HOST.length)
    : repo;
  return {
    repo,
    account,
    target: number === undefined ? path : `${path}#${number}`,
    ...described,
  };
};

/** A repository on GitHub is named without its host. */
const GITHUB_HOST = "github.com/";
/** A REST path's issue or pull request: `/issues/12`, `/pulls/12/reviews`. */
const REST_NUMBER = /\/(?:issues|pulls)\/(\d+)(?:\/|$)/u;
/** A GitHub connection tool's issue or pull request, by the argument it names it with. */
const MCP_NUMBER_ARGS = ["issue_number", "pullNumber", "pull_number"] as const;

/** The issue or pull request a post is on; undefined for a post that makes one, or a push. */
const numberOf = (post: UpstreamPost): number | undefined => {
  switch (post.via) {
    case "forge":
      return post.write.op === "comment" ? post.write.number : undefined;
    case "http": {
      const found = REST_NUMBER.exec(post.path)?.[1];
      return found === undefined ? undefined : Number(found);
    }
    case "mcp":
      return MCP_NUMBER_ARGS.map((key) => post.args[key]).find(
        (value): value is number => Number.isInteger(value)
      );
    case "git":
      return undefined;
  }
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
    case "forge":
      return (
        (FORGES as readonly unknown[]).includes(one.forge) &&
        typeof one.repo === "string" &&
        isForgeWrite(one.write)
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
