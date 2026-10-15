/**
 * The upstream guard: whether a session may write to a repository that is
 * not its project's own (owner, 2026-10-15: "Don't submit on my behalf",
 * after agents had filed issues and pull requests on other people's
 * repositories under his account). The person picks it once for the fleet
 * (onboarding) and may pick it again per project; while it keeps sessions
 * off, a call that writes to another repository does not run, and the
 * refusal tells the session to put its draft in its report.
 *
 * What it judges is one program's argv as it starts, never a shell line:
 * every workspace's commands run with a shim for `gh`, `hub`, `glab` and
 * `curl` first on their PATH (agent `upstream-shim.ts`), so the call is read
 * whatever wrote it (a script, `sh -c`, `xargs`). Caw's gate reads his shell
 * lines with the same words before they reach a card (hub lead-gate.ts).
 *
 * A write is:
 * - `gh issue|pr|release …` and `gh repo fork`, by {@link GH_WRITES};
 * - `gh api`, `hub api` and `glab api` with a write method (`-X/--method`
 *   POST, PATCH, PUT or DELETE, or fields without an explicit GET) against
 *   `repos/<owner>/<repo>` (GitLab: `projects/<path>`);
 * - `hub` and `glab` subcommands that post ({@link HUB_WRITES},
 *   {@link GLAB_WRITES});
 * - `curl` to api.github.com or uploads.github.com with a write method
 *   against `/repos/<owner>/<repo>`.
 *
 * The target is resolved the way gh resolves its base repository
 * (github.com/cli/cli context/context.go, remote.go): `-R/--repo`, else
 * `GH_REPO`, else the cwd's git remotes, a `gh-resolved` one first, then
 * sorted `upstream`, `github`, `origin`, the rest, and, with no prompt, "just
 * resort to the 1st remote". A call whose target names no repository writes
 * nowhere this guard can name, and runs: gh itself refuses it.
 *
 * It imports nothing: each workspace's shim runs its copy as a plain Bun
 * script inside the boundary.
 */

/**
 * The choice's words, the same wherever it is asked: the onboarding step on
 * the dashboard, the setup page's card, and a project's settings.
 */
export const UPSTREAM_WORDS = {
  title: "Other people's repositories",
  risk: "Agents can open issues and pull requests on other people's repositories under your GitHub account.",
  keepOff: "Keep agents off other repositories",
  allow: "Let agents post upstream",
  /** A project's settings: the fleet's answer stands until the project picks its own. */
  inherit: "Same as the fleet",
} as const;

/** One project's rule, or the fleet's: whether its sessions are kept off other repositories, and the repositories that are its own. */
export interface UpstreamRule {
  /** On: a write to a repository not in {@link remotes} does not run. */
  readonly guarded: boolean;
  /** Its own repositories, each `host/owner/repo` ({@link normaliseRemote}). */
  readonly remotes: readonly string[];
}

/** Every rule the hub hands a machine: the fleet's, for a workspace in no project, and each project's. */
export interface UpstreamRules {
  readonly fleet: UpstreamRule;
  readonly projects: Readonly<Record<string, UpstreamRule>>;
}

/** A git remote of the cwd's repository, as `git config` names it. */
export interface GitRemote {
  /** `remote.<name>.gh-resolved`: `base`, or the `owner/repo` it resolves to. */
  readonly ghResolved?: string;
  readonly name: string;
  readonly pushUrl?: string;
  readonly url?: string;
}

/** One program's start, as its shim sees it. */
export interface UpstreamCall {
  readonly args: readonly string[];
  /** The cwd's git remotes; read only when the call needs them. */
  readonly cwdRemotes: () => readonly GitRemote[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly program: string;
  /**
   * A file the call names for its body (`-F query=@file`, `--input file`,
   * curl's `-d @file`), read as the program would read it, relative to the
   * cwd; undefined when it cannot be read, or by a caller that reads no
   * files (Caw's gate, on the hub). `-` is the call's stdin, which no caller
   * reads.
   */
  readonly readFile?: (path: string) => string | undefined;
}

/**
 * What a call writes to: the repository, `host/owner/repo`, and the call in
 * a few words. A GraphQL mutation that names no repository has none: it acts
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
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/** git's scp-like form, `[user@]host:path`. */
const SCP = /^(?:[^@/]+@)?([^:/]+):(.+)$/;
const EDGE_SLASHES = /^\/+|\/+$/g;
const DOT_GIT = /\.git$/i;
const TRAILING_SLASHES = /\/+$/;
/** The hub's own git remote for a project (git-remote.ts): `/git/<project uuid>.git`. */
const HUB_REMOTE_PATH =
  /^\/git\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.git)?\/?$/i;

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
const GITLAB = "gitlab.com";
/** The API hosts a `curl` to GitHub writes through. */
const GITHUB_API_HOSTS: ReadonlySet<string> = new Set([
  "api.github.com",
  "uploads.github.com",
]);
const WRITE_METHODS: ReadonlySet<string> = new Set([
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
]);

/** gh's subcommands that post to a repository, by command. */
const GH_WRITES: Readonly<Record<string, ReadonlySet<string>>> = {
  issue: new Set([
    "create",
    "comment",
    "edit",
    "close",
    "reopen",
    "delete",
    "lock",
    "unlock",
    "pin",
    "unpin",
    "transfer",
  ]),
  pr: new Set([
    "create",
    "comment",
    "review",
    "merge",
    "close",
    "edit",
    "reopen",
    "ready",
    "lock",
    "unlock",
  ]),
  release: new Set(["create", "edit", "delete", "upload", "delete-asset"]),
  repo: new Set(["fork"]),
};

/** hub's subcommands that post: a word, or a command and its subcommand. */
const HUB_WRITES: ReadonlySet<string> = new Set([
  "pull-request",
  "fork",
  "issue create",
  "issue update",
  "issue transfer",
  "release create",
  "release edit",
  "release delete",
]);

/** glab's subcommands that post, by command. */
const GLAB_WRITES: Readonly<Record<string, ReadonlySet<string>>> = {
  issue: new Set(["create", "note", "close", "reopen", "update", "delete"]),
  mr: new Set([
    "create",
    "note",
    "merge",
    "close",
    "reopen",
    "update",
    "approve",
    "delete",
  ]),
  release: new Set(["create", "update", "delete", "upload"]),
  repo: new Set(["fork"]),
};

/** The value of the last `-x VALUE`, `-xVALUE`, `--long VALUE` or `--long=VALUE` among `args`. */
const lastValue = (
  args: readonly string[],
  short: string | undefined,
  long: string
): string | undefined => {
  let found: string | undefined;
  for (const [index, arg] of args.entries()) {
    if (arg === "--") {
      break;
    }
    if (arg === long || (short !== undefined && arg === short)) {
      found = args[index + 1];
    } else if (arg.startsWith(`${long}=`)) {
      found = arg.slice(long.length + 1);
    } else if (
      short !== undefined &&
      arg.startsWith(short) &&
      !arg.startsWith("--") &&
      arg.length > short.length
    ) {
      found = arg.slice(short.length);
    }
  }
  return found;
};

/** A `[HOST/]OWNER/REPO` or URL naming a repository, as `host/owner/repo`; `host` when it names none. */
const repoName = (raw: string, host: string): string | undefined => {
  if (SCHEME.test(raw) || raw.includes("@")) {
    return normaliseRemote(raw) ?? undefined;
  }
  const parts = raw
    .replace(DOT_GIT, "")
    .split("/")
    .filter((part) => part !== "");
  if (parts.length === 2) {
    return `${host}/${parts.join("/")}`;
  }
  if (parts.length >= 3 && (parts[0] as string).includes(".")) {
    return `${(parts[0] as string).toLowerCase()}/${parts.slice(1).join("/")}`;
  }
  // GitLab names nested groups: GROUP/SUBGROUP/REPO on its host.
  return parts.length >= 3 ? `${host}/${parts.join("/")}` : undefined;
};

const REMOTE_RANK: Readonly<Record<string, number>> = {
  upstream: 3,
  github: 2,
  origin: 1,
};

/**
 * The cwd's base repository as gh resolves it (context.go `BaseRepo`): a
 * remote marked `gh-resolved` first; else, sorted `upstream`, `github`,
 * `origin`, the rest (remote.go `remoteNameSortScore`, a stable sort), the
 * first that names a repository. None when no remote does.
 */
const cwdBase = (remotes: readonly GitRemote[]): string | undefined => {
  const named = remotes
    .map((remote) => ({
      remote,
      repo: normaliseRemote(remote.url ?? remote.pushUrl ?? "") ?? undefined,
    }))
    .filter(
      (each): each is { remote: GitRemote; repo: string } =>
        each.repo !== undefined
    );
  for (const { remote, repo } of named) {
    const resolved = remote.ghResolved;
    if (resolved === "base") {
      return repo;
    }
    if (resolved) {
      return repoName(resolved, repo.slice(0, repo.indexOf("/")));
    }
  }
  return [...named].sort(
    (a, b) =>
      (REMOTE_RANK[b.remote.name.toLowerCase()] ?? 0) -
      (REMOTE_RANK[a.remote.name.toLowerCase()] ?? 0)
  )[0]?.repo;
};

/** The base repository a gh call acts on: `-R/--repo`, else `GH_REPO`, else the cwd's. */
const ghBase = (call: UpstreamCall, host: string): string | undefined => {
  const named =
    lastValue(call.args, "-R", "--repo") ?? call.env.GH_REPO ?? undefined;
  return named ? repoName(named, host) : cwdBase(call.cwdRemotes());
};

/** An issue's or pull request's URL, which gh acts on whatever the base repository. */
const ISSUE_URL =
  /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/(?:issues|pull)\/\d+/i;
/** gh's flags whose value is words to post, never the issue a call acts on. */
const TEXT_FLAGS: ReadonlySet<string> = new Set([
  "-b",
  "--body",
  "-t",
  "--title",
  "-F",
  "--body-file",
]);

/** An issue or pull request URL a gh call names as its subject, as `host/owner/repo`. */
const subjectUrl = (args: readonly string[]): string | undefined => {
  for (const [index, arg] of args.entries()) {
    const match = ISSUE_URL.exec(arg);
    if (match && !TEXT_FLAGS.has(args[index - 1] ?? "")) {
      return `${(match[1] as string).toLowerCase()}/${match[2]}/${match[3]}`;
    }
  }
};

/** The first argument that is not an option, after the words `skip` names. */
const firstOperand = (
  args: readonly string[],
  skip: number
): string | undefined => args.slice(skip).find((arg) => !arg.startsWith("-"));

/** An API call's method: `-X/--method`, else POST when it sends fields or a body, else GET. */
const apiMethod = (
  args: readonly string[],
  fields: readonly string[],
  methodFlags: { long: string; short: string }
): string => {
  const named = lastValue(args, methodFlags.short, methodFlags.long);
  if (named) {
    return named.toUpperCase();
  }
  return args.some((arg) =>
    fields.some(
      (field) =>
        arg === field ||
        arg.startsWith(`${field}=`) ||
        (!(field.startsWith("--") || arg.startsWith("--")) &&
          arg.startsWith(field) &&
          arg.length > field.length)
    )
  )
    ? "POST"
    : "GET";
};

/** `gh api`'s options that take a value, so the endpoint is the first word that is none of theirs. */
const GH_API_VALUED: ReadonlySet<string> = new Set([
  "-X",
  "--method",
  "-f",
  "--raw-field",
  "-F",
  "--field",
  "-H",
  "--header",
  "--input",
  "-q",
  "--jq",
  "-t",
  "--template",
  "--hostname",
  "--cache",
  "-p",
  "--preview",
]);

/** An API call's endpoint: its first argument that is no option's value. */
const endpointOf = (
  args: readonly string[],
  valued: ReadonlySet<string>
): string | undefined => {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;
    if (valued.has(arg)) {
      index += 1;
    } else if (!arg.startsWith("-")) {
      return arg;
    }
  }
};

const REPOS_PATH = /^repos\/([^/?#]+)\/([^/?#]+)/;
/** GitHub Enterprise's API prefix, `api/v3/`, before an API path. */
const GHE_API_PREFIX = /^api\/v3\//;
/** A `host/owner/` prefix: the owner a `hub pull-request -b OWNER:BRANCH` replaces. */
const HOST_OWNER = /^([^/]+)\/[^/]+\//;
const HTTP_SCHEME = /^https?:\/\//;
/** A long option's inline value, after its first `=`. */
const INLINE_VALUE = /[=](.*)/s;
const PROJECTS_PATH = /^projects\/([^/?#]+)/;

/**
 * The repository a GitHub API path names, as `host/owner/repo`: its
 * `repos/<owner>/<repo>`, with `{owner}` and `{repo}` the base's. A full URL
 * is read at its path, GitHub Enterprise's `api/v3/` dropped.
 */
const githubApiRepo = (
  endpoint: string,
  host: string,
  base: () => string | undefined
): string | undefined => {
  let path = endpoint;
  let at = host;
  if (SCHEME.test(endpoint)) {
    try {
      const url = new URL(endpoint);
      path = url.pathname;
      at = GITHUB_API_HOSTS.has(url.hostname) ? GITHUB : url.hostname;
    } catch {
      return;
    }
  }
  path = path.replace(EDGE_SLASHES, "").replace(GHE_API_PREFIX, "");
  const match = REPOS_PATH.exec(path);
  if (!match) {
    return;
  }
  let [, owner = "", repo = ""] = match;
  if (owner.includes("{") || repo.includes("{")) {
    const [, baseOwner, baseRepo] = (base() ?? "").split("/");
    if (!(baseOwner && baseRepo)) {
      return;
    }
    owner = owner.replace("{owner}", baseOwner);
    repo = repo.replace("{repo}", baseRepo);
  }
  return `${at}/${owner}/${repo}`;
};

/**
 * A call's command and subcommand: its first two words that are neither an
 * option nor `-R/--repo`'s value, which a command's own flags may put
 * between them (`gh issue -R owner/repo create`), and the arguments after
 * the subcommand.
 */
const commandWords = (
  args: readonly string[]
): { command: string; rest: readonly string[]; sub: string } => {
  const words: number[] = [];
  for (let index = 0; index < args.length && words.length < 2; index += 1) {
    const arg = args[index] as string;
    if (arg === "-R" || arg === "--repo") {
      index += 1;
    } else if (!arg.startsWith("-")) {
      words.push(index);
    }
  }
  const [first, second] = words;
  return {
    command: first === undefined ? "" : (args[first] as string),
    sub: second === undefined ? "" : (args[second] as string),
    rest:
      second === undefined
        ? args.slice((first ?? -1) + 1)
        : [...args.slice(0, second), ...args.slice(second + 1)].slice(
            (first ?? -1) + 1
          ),
  };
};

/** A GraphQL document that changes something: an operation of type `mutation` (the GraphQL spec's OperationType). */
const MUTATION = /(^|[^A-Za-z0-9_])mutation\b/;
/** `repository(owner: "O", name: "R")`, in either order, with a literal or a `$variable` for each. */
const REPOSITORY_ARGS =
  /repository\s*\(\s*(owner|name)\s*:\s*("[^"]*"|\$[A-Za-z_][A-Za-z0-9_]*)\s*,?\s*(owner|name)\s*:\s*("[^"]*"|\$[A-Za-z_][A-Za-z0-9_]*)/;

/** A GraphQL request as an API call sends it: its query, and its variables; `unread` when part of it came from where the guard reads nothing. */
interface GraphqlBody {
  query?: string;
  unread: boolean;
  variables: Partial<Record<string, string>>;
}

/** The text a `@file` (or `@-`) value names, read through the call; undefined when it cannot be read. */
const fileText = (call: UpstreamCall, at: string): string | undefined =>
  at === "-" ? undefined : call.readFile?.(at);

/** One `key=value` field of `gh api`/`hub api` into `body`; `-F`'s `@file` value is that file's text. */
const takeField = (
  call: UpstreamCall,
  body: GraphqlBody,
  field: string,
  typed: boolean
): void => {
  const at = field.indexOf("=");
  if (at < 0) {
    return;
  }
  const key = field.slice(0, at);
  let value: string | undefined = field.slice(at + 1);
  if (typed && value.startsWith("@")) {
    value = fileText(call, value.slice(1));
  }
  if (value === undefined) {
    body.unread ||= key === "query";
    return;
  }
  if (key === "query") {
    body.query = value;
  } else {
    body.variables[key] = value;
  }
};

/** A JSON request body (`--input`, curl's data) into `body`: its `query` and string `variables`. */
const takeJson = (body: GraphqlBody, text: string | undefined): void => {
  if (text === undefined) {
    body.unread = true;
    return;
  }
  try {
    const parsed = JSON.parse(text) as {
      query?: unknown;
      variables?: Record<string, unknown>;
    };
    if (typeof parsed.query === "string") {
      body.query = parsed.query;
    }
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

/** The short and long options of `gh api`/`hub api` that carry a field, raw or typed. */
const API_FIELDS: readonly { long: string; short: string; typed: boolean }[] = [
  { short: "-f", long: "--raw-field", typed: false },
  { short: "-F", long: "--field", typed: true },
];

/** `gh api graphql`'s or `hub api graphql`'s request, from its fields and its `--input`. */
const apiGraphqlBody = (
  call: UpstreamCall,
  rest: readonly string[]
): GraphqlBody => {
  const body: GraphqlBody = { unread: false, variables: {} };
  for (let index = 0; index < rest.length; index += 1) {
    index += takeApiArg(call, body, rest[index] as string, rest[index + 1]);
  }
  return body;
};

/** One argument of `gh api graphql` into `body`: how many more words it took. */
const takeApiArg = (
  call: UpstreamCall,
  body: GraphqlBody,
  arg: string,
  next: string | undefined
): number => {
  if (arg === "--input" || arg.startsWith("--input=")) {
    const file = arg === "--input" ? next : arg.slice("--input=".length);
    takeJson(body, file === undefined ? undefined : fileText(call, file));
    return arg === "--input" ? 1 : 0;
  }
  for (const { short, long, typed } of API_FIELDS) {
    if (arg === short || arg === long) {
      takeField(call, body, next ?? "", typed);
      return 1;
    }
    if (arg.startsWith(`${long}=`)) {
      takeField(call, body, arg.slice(long.length + 1), typed);
      return 0;
    }
    if (arg.startsWith(short) && !arg.startsWith("--")) {
      takeField(call, body, arg.slice(short.length), typed);
      return 0;
    }
  }
  return 0;
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

/** Whether an API endpoint is GitHub's GraphQL one: `graphql`, or a URL whose path is `/graphql` (`/api/graphql` on Enterprise). */
const isGraphql = (endpoint: string): boolean => {
  if (!SCHEME.test(endpoint)) {
    return endpoint.replace(EDGE_SLASHES, "") === "graphql";
  }
  try {
    return new URL(endpoint).pathname
      .replace(EDGE_SLASHES, "")
      .endsWith("graphql");
  } catch {
    return false;
  }
};

const gh = (call: UpstreamCall): UpstreamWrite | undefined => {
  const host = (call.env.GH_HOST || GITHUB).toLowerCase();
  const { command, sub, rest: after } = commandWords(call.args);
  if (command === "api") {
    const rest = call.args.slice(call.args.indexOf("api") + 1);
    const method = apiMethod(
      rest,
      ["-f", "--raw-field", "-F", "--field", "--input"],
      {
        short: "-X",
        long: "--method",
      }
    );
    const endpoint = endpointOf(rest, GH_API_VALUED);
    if (endpoint && isGraphql(endpoint)) {
      return graphqlWrite(
        apiGraphqlBody(call, rest),
        host,
        "gh api graphql mutation"
      );
    }
    if (!(WRITE_METHODS.has(method) && endpoint)) {
      return;
    }
    const repo = githubApiRepo(endpoint, host, () => ghBase(call, host));
    return repo ? { repo, what: `gh api ${method} ${endpoint}` } : undefined;
  }
  if (!GH_WRITES[command]?.has(sub)) {
    return;
  }
  const what = `gh ${command} ${sub}`;
  if (command === "repo") {
    const named = firstOperand(after, 0);
    const repo = named ? repoName(named, host) : ghBase(call, host);
    return repo ? { repo, what } : undefined;
  }
  const repo = subjectUrl(after) ?? ghBase(call, host);
  return repo ? { repo, what } : undefined;
};

const hub = (call: UpstreamCall): UpstreamWrite | undefined => {
  const { command, sub } = commandWords(call.args);
  const base = () => cwdBase(call.cwdRemotes());
  if (command === "api") {
    const rest = call.args.slice(call.args.indexOf("api") + 1);
    const method = apiMethod(
      rest,
      ["-F", "--field", "-f", "--raw-field", "--input"],
      {
        short: "-X",
        long: "--method",
      }
    );
    const endpoint = endpointOf(rest, GH_API_VALUED);
    if (endpoint && isGraphql(endpoint)) {
      return graphqlWrite(
        apiGraphqlBody(call, rest),
        GITHUB,
        "hub api graphql mutation"
      );
    }
    if (!(WRITE_METHODS.has(method) && endpoint)) {
      return;
    }
    const repo = githubApiRepo(endpoint, GITHUB, base);
    return repo ? { repo, what: `hub api ${method} ${endpoint}` } : undefined;
  }
  const words = [command, `${command} ${sub}`].find((each) =>
    HUB_WRITES.has(each)
  );
  if (!words) {
    return;
  }
  const what = `hub ${words}`;
  const cwd = base();
  // `hub pull-request -b OWNER:BRANCH` opens it on OWNER's repository of the same name.
  const owner =
    command === "pull-request"
      ? lastValue(call.args, "-b", "--base")?.split(":")[0]
      : undefined;
  const repo =
    owner && cwd && lastValue(call.args, "-b", "--base")?.includes(":")
      ? cwd.replace(HOST_OWNER, `$1/${owner}/`)
      : cwd;
  return repo ? { repo, what } : undefined;
};

/** `glab api`'s options that take a value. */
const GLAB_API_VALUED: ReadonlySet<string> = new Set([
  "-X",
  "--method",
  "-f",
  "--raw-field",
  "-F",
  "--field",
  "-H",
  "--header",
  "--input",
  "--hostname",
]);

const glab = (call: UpstreamCall): UpstreamWrite | undefined => {
  const { command, sub, rest: after } = commandWords(call.args);
  const host = (call.env.GITLAB_HOST || GITLAB)
    .replace(HTTP_SCHEME, "")
    .replace(TRAILING_SLASHES, "")
    .toLowerCase();
  const named = lastValue(call.args, "-R", "--repo");
  const base = () =>
    named ? repoName(named, host) : cwdBase(call.cwdRemotes());
  if (command === "api") {
    const rest = call.args.slice(call.args.indexOf("api") + 1);
    const method = apiMethod(
      rest,
      ["-f", "--raw-field", "-F", "--field", "--input"],
      {
        short: "-X",
        long: "--method",
      }
    );
    const endpoint = endpointOf(rest, GLAB_API_VALUED);
    if (!(WRITE_METHODS.has(method) && endpoint)) {
      return;
    }
    const match = PROJECTS_PATH.exec(endpoint.replace(EDGE_SLASHES, ""));
    if (!match) {
      return;
    }
    const id = decodeURIComponent(match[1] as string);
    const repo = id.startsWith(":") ? base() : repoName(id, host);
    return repo ? { repo, what: `glab api ${method} ${endpoint}` } : undefined;
  }
  if (!GLAB_WRITES[command]?.has(sub)) {
    return;
  }
  const what = `glab ${command} ${sub}`;
  if (command === "repo") {
    const operand = firstOperand(after, 0);
    const repo = operand ? repoName(operand, host) : base();
    return repo ? { repo, what } : undefined;
  }
  const repo = base();
  return repo ? { repo, what } : undefined;
};

/** curl's short options that take a value: the rest of their word, or the next. */
const CURL_SHORT_VALUED = new Set("AbcCdDeEFHKmoPQrtTuUwxXyYz".split(""));
/** curl's long options that take a value. */
const CURL_LONG_VALUED: ReadonlySet<string> = new Set([
  "--request",
  "--data",
  "--data-raw",
  "--data-binary",
  "--data-urlencode",
  "--data-ascii",
  "--json",
  "--form",
  "--form-string",
  "--upload-file",
  "--header",
  "--user",
  "--output",
  "--url",
  "--user-agent",
  "--referer",
  "--cookie",
  "--cookie-jar",
  "--config",
  "--max-time",
  "--write-out",
  "--proxy",
  "--connect-timeout",
  "--retry",
  "--retry-delay",
  "--retry-max-time",
  "--oauth2-bearer",
  "--resolve",
  "--connect-to",
  "--cacert",
  "--cert",
  "--key",
  "--range",
]);
const CURL_DATA_LONG: ReadonlySet<string> = new Set([
  "--data",
  "--data-raw",
  "--data-binary",
  "--data-urlencode",
  "--data-ascii",
  "--json",
  "--form",
  "--form-string",
]);

/** What a curl command line asks, as it is read: its URLs, its named method, and whether it sends data, uploads, asks for a head or a GET. */
interface CurlLine {
  data: boolean;
  /** Each data value as written (`-d`, `--data*`, `--json`): a GraphQL body is read from them. */
  datas: string[];
  get: boolean;
  head: boolean;
  method: string | undefined;
  upload: boolean;
  urls: string[];
}

/** One option of curl's and its value, into `line`. */
const curlTake = (
  line: CurlLine,
  option: string,
  value: string | undefined
): void => {
  if (option === "X" || option === "--request") {
    line.method = value?.toUpperCase();
  } else if (option === "d" || option === "F" || CURL_DATA_LONG.has(option)) {
    line.data = true;
    if (value !== undefined && option !== "F" && !option.startsWith("--form")) {
      line.datas.push(value);
    }
  } else if (option === "T" || option === "--upload-file") {
    line.upload = true;
  } else if (option === "--url" && value) {
    line.urls.push(value);
  } else if (option === "I" || option === "--head") {
    line.head = true;
  } else if (option === "G" || option === "--get") {
    line.get = true;
  }
};

/** A long option, into `line`: how many more words it took (its value's). */
const curlLong = (
  line: CurlLine,
  arg: string,
  next: string | undefined
): number => {
  const [name = "", inline] = arg.split(INLINE_VALUE, 2);
  if (!CURL_LONG_VALUED.has(name)) {
    curlTake(line, name, undefined);
    return 0;
  }
  curlTake(line, name, inline ?? next);
  return inline === undefined ? 1 : 0;
};

/** A cluster of short options (`-sSX POST`, `-XPOST`), into `line`: how many more words it took. */
const curlShort = (
  line: CurlLine,
  arg: string,
  next: string | undefined
): number => {
  for (let at = 1; at < arg.length; at += 1) {
    const option = arg[at] as string;
    if (CURL_SHORT_VALUED.has(option)) {
      const rest = arg.slice(at + 1);
      curlTake(line, option, rest === "" ? next : rest);
      return rest === "" ? 1 : 0;
    }
    curlTake(line, option, undefined);
  }
  return 0;
};

const curlLine = (args: readonly string[]): CurlLine => {
  const line: CurlLine = {
    urls: [],
    method: undefined,
    data: false,
    datas: [],
    upload: false,
    head: false,
    get: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;
    const next = args[index + 1];
    if (arg.startsWith("--")) {
      index += curlLong(line, arg, next);
    } else if (arg.startsWith("-") && arg.length > 1) {
      index += curlShort(line, arg, next);
    } else {
      line.urls.push(arg);
    }
  }
  return line;
};

/** A curl's method: the one it names, else HEAD, PUT for an upload, POST for data without `-G`, else GET. */
const curlMethod = ({ method, head, upload, data, get }: CurlLine): string => {
  if (method) {
    return method;
  }
  if (head) {
    return "HEAD";
  }
  if (upload) {
    return "PUT";
  }
  return data && !get ? "POST" : "GET";
};

const curl = (call: UpstreamCall): UpstreamWrite | undefined => {
  const line = curlLine(call.args);
  const method = curlMethod(line);
  if (!WRITE_METHODS.has(method)) {
    return;
  }
  for (const raw of line.urls) {
    const url = SCHEME.test(raw) ? raw : `https://${raw}`;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (!GITHUB_API_HOSTS.has(parsed.hostname)) {
      continue;
    }
    if (isGraphql(url)) {
      const body: GraphqlBody = { unread: false, variables: {} };
      for (const data of line.datas) {
        takeJson(
          body,
          data.startsWith("@") ? fileText(call, data.slice(1)) : data
        );
      }
      return graphqlWrite(
        body,
        GITHUB,
        "curl POST api.github.com/graphql mutation"
      );
    }
    const repo = githubApiRepo(url, GITHUB, () => undefined);
    if (repo) {
      return {
        repo,
        what: `curl ${method} ${parsed.hostname}${parsed.pathname}`,
      };
    }
  }
};

const PROGRAMS: Readonly<
  Record<string, (call: UpstreamCall) => UpstreamWrite | undefined>
> = { gh, hub, glab, curl };

/** The programs whose calls the guard reads, each a shim on a workspace's PATH. */
export const GUARDED_PROGRAMS: readonly string[] = Object.keys(PROGRAMS);

/** The base name of a program as a shell names it: `/usr/bin/gh` is `gh`. */
const programName = (program: string): string =>
  program.slice(program.lastIndexOf("/") + 1);

/** The repository a call writes to, and the call in a few words; none when it writes to none this guard can name. */
export const upstreamWrite = (call: UpstreamCall): UpstreamWrite | undefined =>
  PROGRAMS[programName(call.program)]?.(call);

/** Whether `repo` is one of `remotes`: hosts and owners compare without case, as GitHub's do. */
const owns = (remotes: readonly string[], repo: string): boolean =>
  remotes.some((remote) => remote.toLowerCase() === repo.toLowerCase());

/**
 * Why `call` does not run under `rule`, in the words the session reads; none
 * when it runs: the rule lets sessions post upstream, the call writes to no
 * repository, or the one it writes to is the project's own.
 */
export const upstreamRefusal = (
  rule: UpstreamRule,
  call: UpstreamCall
): string | undefined => {
  if (!rule.guarded) {
    return;
  }
  const write = upstreamWrite(call);
  if (!write || (write.repo !== undefined && owns(rule.remotes, write.repo))) {
    return;
  }
  const own =
    rule.remotes.length > 0
      ? `this project's repository is ${rule.remotes.join(", ")}`
      : "this session has no repository of its own";
  return `cawco: \`${write.what}\` did not run: ${targetWords(write, rule)}, and ${own}. Sessions here are kept off other people's repositories (the owner's choice), so nothing is posted under their account. Put what you would have posted (the title and body, or the comment) in your report as a draft instead; the owner decides whether to post it.`;
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
