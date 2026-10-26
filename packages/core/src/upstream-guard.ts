import { z } from "zod";
/**
 * The upstream guard: whether a session may write to a repository that is
 * not its project's own (owner, 2026-10-15: "Don't submit on my behalf",
 * after agents had filed issues and pull requests on other people's
 * repositories under his account). The person picks it once for the fleet
 * (onboarding) and may pick it again per project, one of three answers
 * ({@link UPSTREAM_POSTS}): while it keeps sessions off, a write to another
 * repository does not go out, and the refusal tells the session to put its
 * draft in its report; while it asks first, the post is held for the
 * person, and CawCo makes it once they approve (upstream-post.ts).
 *
 * It is held where the credential is, on any host, never by reading what a
 * program was asked to do. A workspace holds no credential of any forge: its
 * boundary hides every store under the home dir, reaches no key agent, and
 * a guarded workspace's commands carry no forge's token (agent boundary.ts
 * `FORGE_TOKEN_ENV`). What it writes with a credential goes through one of
 * CawCo's doors, on the host, which judges the write by its own shape:
 * - git, on any host and over any transport, through the git door (agent
 *   hub-git.ts): the clone's own origin goes out with the host's own
 *   credential; under `ask` a push to any other repository is held;
 * - GitHub's API, through the GitHub door (agent github-door.ts): a write
 *   against `/repos/<owner>/<repo>`, or a GraphQL mutation, by the
 *   repository it names or its node ids resolve to
 *   ({@link upstreamHttpWrite});
 * - an issue, a pull or merge request or a comment on GitHub, GitLab or
 *   Gitea, through `forge_post` and that forge's adapter on the machine
 *   (agent forges/), with the host's sign-in where the forge's CLI keeps it;
 * - a forge connection's write tool, called by the hub (hub
 *   connection-writes.ts).
 * Each of them decides by {@link decideWrite} alone. Anything else has
 * nothing to sign in with, so it posts nowhere.
 */

/**
 * The choice's words, the same wherever it is asked: the onboarding step on
 * the dashboard, the setup page's card, and a project's settings.
 */
export const UPSTREAM_WORDS = {
  title: "Other people's repositories",
  risk: "Agents can open issues and pull requests on other people's repositories under your git account.",
  keepOff: "Keep agents off other repositories",
  /** Each post waits in Needs you for the person's Approve (owner: "why is there no option for them to ask me first"). */
  ask: "Ask me first",
  allow: "Let agents post upstream",
  /** A project's settings: the fleet's answer stands until the project picks its own. */
  inherit: "Same as the fleet",
} as const;

/**
 * The choice's three answers: `off`, a write to another repository does not
 * run; `ask`, each one waits for the person's answer and CawCo makes it once
 * approved (hub upstream-asks.ts); `on`, sessions post as they like.
 */
export const UPSTREAM_POSTS = ["off", "ask", "on"] as const;
export type UpstreamPosts = (typeof UPSTREAM_POSTS)[number];

/** An answer's words, as every surface names it. */
export const upstreamPostsWords = (posts: UpstreamPosts): string => {
  if (posts === "off") {
    return UPSTREAM_WORDS.keepOff;
  }
  return posts === "ask" ? UPSTREAM_WORDS.ask : UPSTREAM_WORDS.allow;
};

/** One project's rule, or the fleet's: whether its sessions may post to other repositories, and the repositories that are its own. */
export interface UpstreamRule {
  /** Whether a write to a repository not in {@link remotes} goes (`on`), waits for the person (`ask`) or does not run (`off`), as {@link decideWrite} decides it; whatever it is, no forge's token is inside a workspace. */
  readonly posts: UpstreamPosts;
  /** Its own repositories, each `host/owner/repo` ({@link normaliseRemote}). */
  readonly remotes: readonly string[];
}

/** A rule as a file holds it, read back; undefined when it is none. */
export const readUpstreamRule = (value: unknown): UpstreamRule | undefined => {
  const rule = value as Partial<UpstreamRule> | null;
  return rule &&
    typeof rule === "object" &&
    (UPSTREAM_POSTS as readonly unknown[]).includes(rule.posts) &&
    Array.isArray(rule.remotes)
    ? (rule as UpstreamRule)
    : undefined;
};

/** Every rule the hub hands a machine: the fleet's, for a workspace in no project, and each project's. */
export interface UpstreamRules {
  readonly fleet: UpstreamRule;
  readonly projects: Readonly<Record<string, UpstreamRule>>;
}

/**
 * What a request writes to: the repository, `host/owner/repo`, and the
 * request in a few words. A GraphQL mutation that names no repository has none: it acts
 * on node ids, which name none the guard can check. One whose query the
 * guard could not read is `unread`.
 */
export interface UpstreamWrite {
  readonly repo?: string;
  readonly unread?: boolean;
  readonly what: string;
}

/** A project's identity when the hub is its remote: the same from every machine, whatever address it reaches the hub by. */
export const hubRemoteIdentity = (projectId: string): string =>
  `cawco/${projectId.toLowerCase()}`;

/** A scheme URL: `https://`, `ssh://`, `git://`, `file://`. */
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//iu;
/** git's scp-like form, `[user@]host:path`. */
const SCP = /^(?:[^@/]+@)?([^:/]+):(.+)$/u;
const EDGE_SLASHES = /^\/+|\/+$/gu;
const DOT_GIT = /\.git$/iu;
const TRAILING_SLASHES = /\/+$/u;
/** The hub's own git remote for a project (git-remote.ts): `/git/<project uuid>.git`. */
const HUB_REMOTE_PATH =
  /^\/git\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.git)?\/?$/iu;

/**
 * A remote URL as `host/owner/repo`: the host lowercased, credentials, port
 * and a trailing `.git` dropped, so `git@github.com:Owner/repo.git` and
 * `https://github.com/Owner/repo` are one remote. The hub's own remote of a
 * project is {@link hubRemoteIdentity}, by its path alone: machines reach the
 * hub by different addresses. Null for what names no host (a path on the
 * same disk, `file://`), which no other machine shares.
 */
export const normaliseRemote = (url: string): string | null => {
  const raw = url.trim();
  if (!raw) {
    return null;
  }
  let host: string;
  let path: string;
  if (SCHEME.test(raw)) {
    try {
      const parsed = new URL(raw);
      host = parsed.hostname;
      path = parsed.pathname;
    } catch {
      return null;
    }
    const hub = HUB_REMOTE_PATH.exec(path);
    if (hub) {
      return hubRemoteIdentity(hub[1] as string);
    }
  } else {
    const scp = SCP.exec(raw);
    if (!scp) {
      return null;
    }
    [, host = "", path = ""] = scp;
  }
  const repo = path
    .replace(EDGE_SLASHES, "")
    .replace(DOT_GIT, "")
    .replace(TRAILING_SLASHES, "");
  return host && repo ? `${host.toLowerCase()}/${repo}` : null;
};

const GITHUB = "github.com";
/** GitHub's API hosts, the ones the GitHub door signs in to. */
const GITHUB_API_HOSTS: ReadonlySet<string> = new Set([
  "api.github.com",
  "uploads.github.com",
]);
/** The HTTP methods that write: what a guarded host is asked before, and what the hub's own write routes take. */
const WRITE_METHODS = ["POST", "PATCH", "PUT", "DELETE"] as const;
export type WriteMethod = (typeof WRITE_METHODS)[number];

/** Whether `method`, upper case, is one of {@link WRITE_METHODS}. */
export const isWriteMethod = (method: string): method is WriteMethod =>
  WRITE_METHODS.some((write) => write === method);

const REPOS_PATH = /^repos\/([^/?#]+)\/([^/?#]+)/u;
/** GitHub Enterprise's API prefix, `api/v3/`, before an API path. */
const GHE_API_PREFIX = /^api\/v3\//u;

/** The repository a GitHub API path names, as `github.com/owner/repo`: its `repos/<owner>/<repo>`, GitHub Enterprise's `api/v3/` dropped. */
const githubApiRepo = (path: string): string | undefined => {
  const match = REPOS_PATH.exec(
    path.replace(EDGE_SLASHES, "").replace(GHE_API_PREFIX, "")
  );
  return match ? `${GITHUB}/${match[1]}/${match[2]}` : undefined;
};

/** A GraphQL document that changes something: an operation of type `mutation` (the GraphQL spec's OperationType). */
const MUTATION = /(^|[^A-Za-z0-9_])mutation\b/u;
/** `repository(owner: "O", name: "R")`, in either order, with a literal or a `$variable` for each. */
const REPOSITORY_ARGS =
  /repository\s*\(\s*(owner|name)\s*:\s*("[^"]*"|\$[A-Za-z_][A-Za-z0-9_]*)\s*,?\s*(owner|name)\s*:\s*("[^"]*"|\$[A-Za-z_][A-Za-z0-9_]*)/u;

/** A GraphQL request as an API call sends it: its query, and its variables; `unread` when part of it came from where the guard reads nothing. */
interface GraphqlBody {
  query?: string;
  /** The variables as sent, nested inputs and all: where a mutation's node ids are. */
  raw?: unknown;
  unread: boolean;
  variables: Partial<Record<string, string>>;
}

/** A GraphQL request's JSON body into `body`: its `query` and string `variables`. */
const takeJson = (body: GraphqlBody, text: string | undefined): void => {
  if (text === undefined) {
    body.unread = true;
    return;
  }
  try {
    const parsed = z
      .object({
        query: z.unknown().optional(),
        variables: z.record(z.string(), z.unknown()).optional(),
      })
      .catch({ query: undefined })
      .parse(JSON.parse(text));
    if (typeof parsed.query === "string") {
      body.query = parsed.query;
    }
    body.raw = parsed.variables;
    for (const [key, value] of Object.entries(parsed.variables ?? {})) {
      if (typeof value === "string") {
        body.variables[key] = value;
      }
    }
  } catch {
    // Not JSON: what it says is searched as it is.
    body.query = text;
  }
};

/** A literal (`"x"`) or a variable (`$x`) of a GraphQL argument, as its value. */
const argumentValue = (
  raw: string,
  variables: Partial<Record<string, string>>
): string | undefined =>
  raw.startsWith("$") ? variables[raw.slice(1)] : raw.slice(1, -1);

/**
 * What a GraphQL request writes: nothing unless its query is a mutation (or
 * could not be read); then the repository its `repository(owner:, name:)`
 * names, or none.
 */
const graphqlWrite = (
  body: GraphqlBody,
  host: string,
  what: string
): UpstreamWrite | undefined => {
  if (body.query === undefined || !MUTATION.test(body.query)) {
    return body.unread ? { what, unread: true } : undefined;
  }
  const named = REPOSITORY_ARGS.exec(body.query);
  if (named) {
    const values: Record<string, string | undefined> = {
      [named[1] as string]: argumentValue(named[2] as string, body.variables),
      [named[3] as string]: argumentValue(named[4] as string, body.variables),
    };
    if (values.owner && values.name) {
      return { repo: `${host}/${values.owner}/${values.name}`, what };
    }
  }
  const { owner } = body.variables;
  const repoWord = body.variables.name ?? body.variables.repo;
  return owner && repoWord
    ? { repo: `${host}/${owner}/${repoWord}`, what }
    : { what };
};

/** Whether `repo` is one of `remotes`: hosts and owners compare without case, as GitHub's do. */
export const owns = (remotes: readonly string[], repo: string): boolean =>
  remotes.some((remote) => remote.toLowerCase() === repo.toLowerCase());

/**
 * Why a post under `ask` cannot wait for the person as it stands, in the
 * words the session reads: `why`, and what to do instead. Nothing was posted.
 */
export const askRefusal = (what: string, why: string): string =>
  `cawco: \`${what}\` did not run: ${why}. Posts to other people's repositories wait here for the owner's answer (their choice: Ask me first), and CawCo makes each one exactly as the owner approved it, so it must say everything it posts in the command itself.`;

/**
 * What the session reads once a post is held: CawCo asked the person, and
 * the session hears the answer in a message of its own.
 */
export const heldWords = (
  what: string,
  repo: string,
  again: boolean
): string =>
  again
    ? `cawco: \`${what}\` to ${repo} is already waiting for the owner's answer; nothing more was asked. Don't run it again: you will be told here when they answer.`
    : `cawco: \`${what}\` to ${repo} was not posted yet: it waits in the owner's Needs you (their choice: Ask me first). If they approve, CawCo posts it exactly as written, once, under their account; if they deny, nothing is posted. You will be told here either way. Don't run it again, and carry on with the rest of your work.`;

/**
 * Why `write` does not go ahead under a guarded `rule`, in the words the
 * session reads; none when there is no write, or it is to the project's
 * own repository.
 */
const writeRefusal = (
  rule: UpstreamRule,
  write: UpstreamWrite | undefined
): string | undefined => {
  if (!write || (write.repo !== undefined && owns(rule.remotes, write.repo))) {
    return;
  }
  const own =
    rule.remotes.length > 0
      ? `this project's repository is ${rule.remotes.join(", ")}`
      : "this session has no repository of its own";
  return `cawco: \`${write.what}\` did not run: ${targetWords(write, rule)}, and ${own}. Sessions here are kept off other people's repositories (the owner's choice), so nothing is posted under their account. Put what you would have posted (the title and body, or the comment) in your report as a draft instead; the owner decides whether to post it.`;
};

/**
 * What a write to a repository comes to under the project's rule: it goes
 * (`go`), it waits for the person (`hold`, under "Ask me first"), or it does
 * not run (`refuse`, in the words the session reads).
 */
export type WriteDecision =
  | { readonly kind: "go" }
  | { readonly kind: "hold"; readonly repo: string }
  | { readonly kind: "refuse"; readonly why: string };

/**
 * The one decision on a write, whatever forge or door it reaches by: no rule,
 * "Let agents post upstream", or the project's own repository goes; under
 * "Ask me first" a write to another repository is held, and one whose
 * repository cannot be named is refused, since the person could not be shown
 * where it lands; under "Keep agents off" it is refused. The git door, the
 * GitHub door, forge posts and a connection's write tools all decide here
 * (docs/forge-adapters.md §3.3).
 */
export const decideWrite = (
  rule: UpstreamRule | undefined,
  write: UpstreamWrite
): WriteDecision => {
  if (!rule || rule.posts === "on") {
    return { kind: "go" };
  }
  const refusal = writeRefusal(rule, write);
  if (!refusal) {
    return { kind: "go" };
  }
  if (rule.posts === "off") {
    return { kind: "refuse", why: refusal };
  }
  return write.repo !== undefined && !write.unread
    ? { kind: "hold", repo: write.repo }
    : {
        kind: "refuse",
        why: askRefusal(
          write.what,
          write.unread
            ? "the guard could not read where it writes"
            : "it names no repository the owner could be shown"
        ),
      };
};

/** Where a refused call writes, in the refusal's words. */
const targetWords = (write: UpstreamWrite, rule: UpstreamRule): string => {
  if (write.unread) {
    return "the guard could not read its query (it comes from stdin or a file it cannot open), so where it writes is unknown";
  }
  if (write.repo === undefined) {
    return `it names no repository the guard can check (a mutation acts on node ids), so it is taken as writing to another one. To change ${rule.remotes[0] ?? "this project's repository"}, name it in the query as repository(owner: "…", name: "…"), or use gh's own commands`;
  }
  return `it writes to ${write.repo}`;
};

/** One HTTP request a guarded workspace's gh sends, as its GitHub door reads it (agent github-door.ts). */
export interface HttpCall {
  /** The request's body as text, for GraphQL; none for any other. */
  readonly body?: string;
  readonly host: string;
  readonly method: string;
  /** Its path, the query string left off. */
  readonly path: string;
}

/** A write an HTTP request makes, and, for a GraphQL mutation that names no repository, the node ids it acts on, for the door to resolve. */
export interface HttpWrite extends UpstreamWrite {
  readonly nodeIds?: readonly string[];
}

/** GitHub's API hosts, whose requests the door signs in to. */
export const GITHUB_API: ReadonlySet<string> = GITHUB_API_HOSTS;

/** A GitHub node id in its current form: a type prefix, `_`, then the encoded id (`R_kgDOQx0ZnQ`, `I_kwDO…`, `PR_kwDO…`). */
const NEXT_ID = /^[A-Z][A-Za-z]{0,7}_[A-Za-z0-9_-]{6,}$/u;
/** A legacy node id: base64 of `NN:Type…` (`MDU6SXNzdWU1MDM1OTgxOTI=`, "05:Issue503598192"). */
const LEGACY_ID = /^[A-Za-z0-9+/]{8,}={0,2}$/u;
const LEGACY_DECODED = /^\d{2}:[A-Za-z]+/u;
const QUOTED = /"((?:[^"\\]|\\.)*)"/gu;
/** The most ids one `nodes(ids:)` read takes. */
const MOST_IDS = 100;

/** Whether `text` has the shape of a GitHub node id, in either form. */
const isNodeId = (text: string): boolean => {
  if (NEXT_ID.test(text)) {
    return true;
  }
  if (!LEGACY_ID.test(text)) {
    return false;
  }
  try {
    return LEGACY_DECODED.test(atob(text));
  } catch {
    return false;
  }
};

/** Every string a value holds, at any depth. */
const stringsIn = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringsIn);
  }
  return value && typeof value === "object"
    ? Object.values(value).flatMap(stringsIn)
    : [];
};

/**
 * Every node id a GraphQL request carries, by its shape, wherever it is: any
 * string of its variables, whatever the variable is called, and any string
 * literal of its query. A mutation acts on what its ids name, so every one
 * is read; at most {@link MOST_IDS}, past which it names more than the door
 * reads, and none are given (it is refused).
 */
const nodeIdsOf = (body: GraphqlBody): string[] => {
  const inQuery = [...(body.query ?? "").matchAll(QUOTED)].map(
    (quoted) => quoted[1] as string
  );
  const ids = [
    ...new Set([
      ...stringsIn(body.raw),
      ...stringsIn(body.variables),
      ...inQuery,
    ]),
  ].filter(isNodeId);
  return ids.length > MOST_IDS ? [] : ids;
};

/**
 * What one HTTP request writes: a write method against
 * `/repos/<owner>/<repo>` on GitHub's API, or a GraphQL mutation, with the
 * repository it names, or else the node ids it acts on. A write to any other
 * GitHub host the door does not forward at all.
 */
export const upstreamHttpWrite = (call: HttpCall): HttpWrite | undefined => {
  const method = call.method.toUpperCase();
  const path = call.path.replace(EDGE_SLASHES, "");
  if (!GITHUB_API_HOSTS.has(call.host)) {
    return isWriteMethod(method)
      ? { what: `${method} ${call.host}/${path}` }
      : undefined;
  }
  if (path === "graphql") {
    const body: GraphqlBody = { unread: false, variables: {} };
    takeJson(body, call.body);
    const write = graphqlWrite(body, GITHUB, "a GraphQL mutation");
    return write && write.repo === undefined && !write.unread
      ? { ...write, nodeIds: nodeIdsOf(body) }
      : write;
  }
  if (!isWriteMethod(method)) {
    return;
  }
  const repo = githubApiRepo(path);
  return repo ? { repo, what: `${method} ${call.host}/${path}` } : undefined;
};
