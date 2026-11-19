/**
 * The host's `gh`, and any program the host runs with its own sign-ins, as
 * CawCo runs them outside every workspace's boundary: the GitHub door signs
 * a workspace's gh requests with gh's token (github-door.ts), and the forge
 * adapters sign in with it, or start gitea-mcp (forges/). No workspace is ever handed
 * a token; the hub is, for a `gh` connection made from this machine's gh
 * (core `CONTROL_GH_TOKEN`), and seals it as it seals every connection's.
 */
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import type {
  GhAccount,
  GhRepo,
  GhRepoList,
  GhRepoLookup,
} from "@cawco/core/connections";
import { workspaceScratchRoot } from "@cawco/core/paths/roots";
import { workspaceCacheDir, workspacesDir } from "@cawco/core/paths/workspace";
import { repoIdentity } from "@cawco/core/protocol";
import { hostEnvironment } from "@cawco/core/session-env";
import { GhRepoSchema } from "@cawco/core/stored-shapes";
import { z } from "zod";

/** Where a workspace writes, so nothing run on the host is found there. */
const writableInside = (): string[] => [
  workspaceCacheDir(),
  workspacesDir(),
  workspaceScratchRoot(),
  join(homedir(), ".worktrees"),
  "/tmp",
  "/private/tmp",
  "/var/folders",
  "/private/var/folders",
];

/**
 * The program `name` as the host runs it, by its real path; none when the
 * agent finds none on its PATH, or finds it where a workspace writes, since
 * the host runs it with its own sign-ins (gh, a forge's gitea-mcp).
 */
export const hostProgram = async (
  name: string
): Promise<string | undefined> => {
  // The PATH as it is now: Bun.which alone reads the one the process began with.
  const found = Bun.which(name, { PATH: process.env.PATH ?? "" });
  const real = found ? await realpath(found).catch(() => undefined) : undefined;
  if (
    !real ||
    writableInside().some((dir) => real === dir || real.startsWith(`${dir}/`))
  ) {
    return;
  }
  return real;
};

/** `gh` as the host runs it ({@link hostProgram}). */
export const hostGh = (): Promise<string | undefined> => hostProgram("gh");

/** What the host's gh said and how it exited. */
interface GhRun {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/**
 * The host's gh run with `args`, with the host's environment as it is now
 * (core `hostEnvironment`); none when gh is not here.
 */
const ghRun = async (args: string[]): Promise<GhRun | undefined> => {
  const gh = await hostGh();
  if (!gh) {
    return;
  }
  // Not spawnSync: gh reads its token from the login keychain, and a
  // spawnSync would wait on the keychain on the agent's JS thread.
  const run = Bun.spawn([gh, ...args], {
    env: hostEnvironment(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
    run.exited,
  ]);
  return { exitCode: run.exitCode ?? 1, stdout, stderr };
};

/**
 * What the host's gh prints for `args`, when it exits 0; none when gh is not
 * here or refuses ({@link ghRun}).
 */
export const ghSays = async (args: string[]): Promise<string | undefined> => {
  const run = await ghRun(args);
  return run?.exitCode === 0 ? run.stdout : undefined;
};

/** The host's GitHub token (`gh auth token`, from its keyring); none when gh has none or is not here. */
export const hostGhToken = async (): Promise<string | undefined> =>
  (await ghSays(["auth", "token"]))?.trim() || undefined;

/**
 * One account's token, as `gh auth token --hostname <host> --user <login>`
 * reads it (cli.github.com/manual/gh_auth_token): what a hub's `gh`
 * connection signs in with, read each time it is asked so a new `gh auth
 * login` here is what the next read finds. Refused when gh has none.
 */
export const ghAccountToken = async (
  host: string,
  login: string
): Promise<{ token: string }> => {
  const token = (
    await ghSays(["auth", "token", "--hostname", host, "--user", login])
  )?.trim();
  if (!token) {
    throw new Error(`gh here has no sign-in for ${login} on ${host}`);
  }
  return { token };
};

const SCOPE_SEPARATOR = /\s*,\s*/u;

const GH_ACCOUNT = z.object({
  active: z.boolean().optional(),
  host: z.string().optional(),
  login: z.string().optional(),
  scopes: z.string().optional(),
  state: z.string().optional(),
});

/**
 * The accounts the host's gh is signed in to, as `gh auth status --json
 * hosts` lists them, each one gh checked with GitHub (`state` "success"),
 * its scopes as GitHub's `X-OAuth-Scopes` header gave them ("repo, read:org",
 * cli/cli pkg/cmd/auth/status). The JSON form "will always exit with zero
 * regardless of any authentication issues" (`gh auth status --help`). None
 * when gh is not here, signed in to nothing, or too old to answer JSON.
 */
export const ghAccounts = async (): Promise<GhAccount[]> => {
  const out = await ghSays(["auth", "status", "--json", "hosts"]);
  let read: { hosts?: Record<string, unknown> };
  try {
    read = z
      .object({ hosts: z.record(z.string(), z.unknown()).optional() })
      .parse(JSON.parse(out ?? "{}"));
  } catch {
    return [];
  }
  return Object.values(read.hosts ?? {}).flatMap((entries) =>
    (Array.isArray(entries) ? entries : []).flatMap((entry) => {
      const parsed = GH_ACCOUNT.safeParse(entry);
      if (!parsed.success) {
        return [];
      }
      const one = parsed.data;
      return one.state === "success" && one.host && one.login
        ? [
            {
              host: one.host,
              login: one.login,
              active: one.active === true,
              scopes: (one.scopes ?? "")
                .split(SCOPE_SEPARATOR)
                .map((scope) => scope.trim())
                .filter(Boolean),
            },
          ]
        : [];
    })
  );
};

/** GitHub's most per page (docs.github.com/rest/repos/repos#list-repositories-for-the-authenticated-user). */
const REPOS_PER_PAGE = 100;
/** How many of the pages after the first {@link ghRepos} reads at once. */
const PAGES_AT_ONCE = 6;
/** gh's exit code for a command that needs a sign-in it has none of (`gh help exit-codes`). */
const GH_EXIT_AUTH = 4;
/** What gh prints of a token GitHub refused: one it had, since revoked or expired ("gh: Bad credentials (HTTP 401)"). */
const BAD_CREDENTIALS = /HTTP 401/u;
/** Where `gh api --include`'s headers end and the answer begins. */
const HEADERS_END = /\r?\n\r?\n/u;
/** The last page's number in GitHub's `Link` header, which names one only when there are more pages than the first. */
const LAST_PAGE = /[?&]page=(\d+)[^>]*>;\s*rel="last"/u;

/** Each repository as one line of JSON, in {@link GhRepo}'s names. */
const REPO_LINE =
  '.[] | {nameWithOwner: .full_name, owner: {login: .owner.login, avatarUrl: .owner.avatar_url, kind: (if .owner.type == "Organization" then "org" else "user" end)}, url: .clone_url, sshUrl: .ssh_url, updatedAt: .updated_at, description: .description, isPrivate: .private}';

/** One page of `GET /user/repos`, with the last page's number when it was asked with its headers; or why gh could not list it. */
type RepoPage =
  | { kind: "page"; last: number; repos: GhRepo[] }
  | Exclude<GhRepoList, { kind: "listed" }>;

/**
 * Page `page` of the repositories the host's gh sees, latest updated first
 * (`affiliation=owner,collaborator,organization_member`, `sort=updated`,
 * which GitHub orders newest first). The first is asked with its headers
 * (`--include`), whose `Link` names the last page.
 */
const repoPage = async (page: number): Promise<RepoPage> => {
  const first = page === 1;
  const run = await ghRun([
    "api",
    ...(first ? ["--include"] : []),
    `user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=${REPOS_PER_PAGE}&page=${page}`,
    "--jq",
    REPO_LINE,
  ]);
  if (!run) {
    return { kind: "no-gh" };
  }
  if (run.exitCode === GH_EXIT_AUTH || BAD_CREDENTIALS.test(run.stderr)) {
    return { kind: "signed-out" };
  }
  if (run.exitCode !== 0) {
    throw new Error(
      `gh api user/repos failed: ${run.stderr.trim() || `exit ${run.exitCode}`}`
    );
  }
  const end = first ? HEADERS_END.exec(run.stdout) : null;
  const head = end ? run.stdout.slice(0, end.index) : "";
  const body = end ? run.stdout.slice(end.index + end[0].length) : run.stdout;
  const repos = body
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => GhRepoSchema.parse(JSON.parse(line)));
  const last = Number(LAST_PAGE.exec(head)?.[1] ?? page);
  return { kind: "page", last, repos };
};

/**
 * Every GitHub repository the host's gh sees, latest updated first, as
 * `GET /user/repos` lists them: the person's own, the ones they collaborate
 * on and their organizations'. The first page says how many there are; the
 * rest are read {@link PAGES_AT_ONCE} at a time and kept in page order.
 * `no-gh` when gh is not here; `signed-out` when gh has no sign-in (exit 4)
 * or GitHub refused the one it has (401). Any other failure is thrown in
 * gh's words.
 */
export const ghRepos = async (): Promise<GhRepoList> => {
  const first = await repoPage(1);
  if (first.kind !== "page") {
    return first;
  }
  const pages: GhRepo[][] = [first.repos];
  let next = 2;
  const reader = async (): Promise<void> => {
    while (next <= first.last) {
      const page = next;
      next += 1;
      const read = await repoPage(page);
      // A sign-in lost between pages: the pages read stand.
      pages[page - 1] = read.kind === "page" ? read.repos : [];
    }
  };
  await Promise.all(Array.from({ length: PAGES_AT_ONCE }, reader));
  return { kind: "listed", repos: pages.flat() };
};

/** The host whose repositories {@link ghRepo} asks gh of. */
const GITHUB_HOST = "github.com";

/**
 * One repository, in the fields {@link GhRepo} carries and its social image
 * (docs.github.com/graphql/reference/objects#repository: `openGraphImageUrl`,
 * `usesCustomOpenGraphImage`; the owner's `__typename` is `User` or
 * `Organization`).
 */
const REPO_QUERY = `query ($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    owner { login avatarUrl __typename }
    description
    isPrivate
    updatedAt
    url
    sshUrl
    openGraphImageUrl
    usesCustomOpenGraphImage
  }
}`;

/** What `gh api graphql` prints for {@link REPO_QUERY}, on its way out with 0 or, with `errors`, 1. */
const REPO_ANSWER = z.object({
  data: z
    .object({
      repository: z
        .object({
          nameWithOwner: z.string(),
          owner: z.object({
            login: z.string(),
            avatarUrl: z.string(),
            __typename: z.string(),
          }),
          description: z.string().nullable(),
          isPrivate: z.boolean(),
          updatedAt: z.string(),
          url: z.string(),
          sshUrl: z.string(),
          openGraphImageUrl: z.string(),
          usesCustomOpenGraphImage: z.boolean(),
        })
        .nullable(),
    })
    .nullish(),
  errors: z.array(z.object({ type: z.string().optional() })).optional(),
});

/** GraphQL's error types for a repository gh's account cannot see: none there, or one it may not read. */
const UNSEEN = new Set(["NOT_FOUND", "FORBIDDEN"]);

/**
 * Repository `owner/name` on GitHub as the host's gh reads it, one GraphQL
 * call ({@link REPO_QUERY}). `-f`, not `-F`: gh reads a `-F` value as a
 * number, a boolean or a file (`@path`), and a repository may be named `42`.
 */
const githubRepo = async (
  owner: string,
  name: string
): Promise<GhRepoLookup> => {
  const run = await ghRun([
    "api",
    "graphql",
    "-f",
    `query=${REPO_QUERY}`,
    "-f",
    `owner=${owner}`,
    "-f",
    `name=${name}`,
  ]);
  if (!run) {
    return { kind: "no-gh" };
  }
  if (run.exitCode === GH_EXIT_AUTH || BAD_CREDENTIALS.test(run.stderr)) {
    return { kind: "signed-out" };
  }
  let answer: z.output<typeof REPO_ANSWER> | undefined;
  try {
    answer = REPO_ANSWER.parse(JSON.parse(run.stdout));
  } catch {
    answer = undefined;
  }
  const found = answer?.data?.repository;
  if (found) {
    return {
      kind: "found",
      repo: {
        nameWithOwner: found.nameWithOwner,
        owner: {
          login: found.owner.login,
          avatarUrl: found.owner.avatarUrl,
          kind: found.owner.__typename === "Organization" ? "org" : "user",
        },
        // GitHub's `url` is the page; the clone takes the `.git` URL `user/repos` lists as `clone_url`.
        url: `${found.url}.git`,
        sshUrl: found.sshUrl,
        updatedAt: found.updatedAt,
        description: found.description || null,
        isPrivate: found.isPrivate,
      },
      socialImageUrl: found.usesCustomOpenGraphImage
        ? found.openGraphImageUrl
        : null,
    };
  }
  if (answer?.errors?.some((error) => UNSEEN.has(error.type ?? ""))) {
    return { kind: "not-found" };
  }
  throw new Error(
    `gh api graphql failed: ${run.stderr.trim() || `exit ${run.exitCode}`}`
  );
};

/** How long a repository's web page has to answer {@link pageSays}. */
const PAGE_TIMEOUT_MS = 4000;
const OG_FIELD = /^og:(?:description|image)$/u;
const WEB_URL = /^https?:$/u;
const DOT_GIT_END = /\.git\/?$/u;

/** What a repository's web page says of itself; none of either where it says nothing. */
interface PageSays {
  description: string | null;
  socialImageUrl: string | null;
}

/**
 * The `og:description` and `og:image` of the web page an `https://` git URL
 * names (the URL without its `.git`, its login dropped), read with Bun's
 * HTMLRewriter as the page streams, waiting {@link PAGE_TIMEOUT_MS} at most.
 * None of either for any other URL, or a page that fails, is not HTML or
 * says neither; an image only at an `http(s)` address.
 */
const pageSays = async (url: string): Promise<PageSays> => {
  const none: PageSays = { description: null, socialImageUrl: null };
  const page = URL.parse(url.trim().replace(DOT_GIT_END, ""));
  if (page?.protocol !== "https:") {
    return none;
  }
  page.username = "";
  page.password = "";
  const read = await readWithin(PAGE_TIMEOUT_MS, (signal) =>
    readPage(page, signal)
  ).catch((cause: unknown) => {
    // A page that fails says nothing: the row stands on what its URL holds.
    console.warn(
      `[gh-repo] ${page.host}'s page didn't answer: ${String(cause)}`
    );
    return { kind: "answered" as const, value: none };
  });
  return read.kind === "answered" ? read.value : none;
};

/** {@link pageSays}'s read of `page`, its fetch stopped by `signal`. */
const readPage = async (page: URL, signal: AbortSignal): Promise<PageSays> => {
  const answer = await fetch(page, {
    headers: { accept: "text/html" },
    signal,
  });
  if (!(
    answer.ok && answer.headers.get("content-type")?.includes("text/html")
  )) {
    return { description: null, socialImageUrl: null };
  }
  const said = new Map<string, string>();
  await new HTMLRewriter()
    .on("meta", {
      element(meta) {
        const field =
          meta.getAttribute("property") ?? meta.getAttribute("name") ?? "";
        const content = meta.getAttribute("content")?.trim();
        if (OG_FIELD.test(field) && content && !said.has(field)) {
          said.set(field, content);
        }
      },
    })
    .transform(answer)
    .text();
  const image = said.get("og:image");
  const at = image ? URL.parse(image, answer.url) : null;
  return {
    description: said.get("og:description") ?? null,
    socialImageUrl: at && WEB_URL.test(at.protocol) ? at.href : null,
  };
};

/**
 * The repository at git URL `url` (core `CONTROL_GH_REPO`): on GitHub, as
 * the host's gh reads it ({@link githubRepo}), `not-found` where the URL
 * names no `owner/name`; on any other host, what its web page says of
 * itself ({@link pageSays}).
 */
export const ghRepo = async (url: string): Promise<GhRepoLookup> => {
  const [host = "", ...path] = repoIdentity(url).split("/");
  if (host === GITHUB_HOST || host === `www.${GITHUB_HOST}`) {
    const [owner, name] = path;
    return path.length === 2 && owner && name
      ? githubRepo(owner, name)
      : { kind: "not-found" };
  }
  return { kind: "other-host", ...(await pageSays(url)) };
};
