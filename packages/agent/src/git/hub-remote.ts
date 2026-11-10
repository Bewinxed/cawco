import { CAWCO_ENV } from "@cawco/core/cawco-env";
import { type HubRepoKey, hubRepoSegment } from "@cawco/core/hub-repo";
import { GIT_LOCALE } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { configEnv, hubOriginOf } from "../git-credential";
import { basicOf } from "./hub-credential";
import {
  type DeclaredLfs,
  declaredPins,
  lfsEndpointOf,
  lfsPins,
  urlOrigin,
} from "./lfs";
import { gitUntil } from "./run";

/**
 * The hub's git remote as this machine reaches it: a project's repositories'
 * addresses, git's environment for a command that reaches one, and which of
 * them a source repository is.
 */

/** The hub's HTTP origin, from the socket address this daemon is connected on. */
const hubOrigin = (): string => {
  const ws = process.env[CAWCO_ENV.hubUrl];
  if (!ws) {
    throw new Error("This machine is not connected to a hub.");
  }
  const url = new URL(ws);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return url.origin;
};

/** One of a project's repositories on the hub (core hub-repo.ts), at the address this machine reaches it by. */
export const hubRepo = (key: HubRepoKey): string =>
  `${hubOrigin()}/git/${hubRepoSegment(key)}`;

/**
 * Whether `url` names one of the hub's repositories, under any address the
 * hub answers at (git-credential.ts {@link hubOriginOf}), not only the one
 * this machine reaches it by.
 */
export const isHubRemote = (url: string): boolean =>
  hubOriginOf(url) !== undefined;

/**
 * git's environment for a command that reaches the hub's repository `repo`
 * with this machine's credential, env-only: a workspace's clone and
 * fetches, a workspace's own fetch and push run on the host (`hub-git.ts`),
 * a place's push and a move's steps. The credential is `repo`'s alone
 * (`http.<repo>.extraHeader`, matched on whole path segments), so nothing
 * run in a clone reaches another project's repository with it.
 *
 * git-lfs talks to `repo`'s own LFS alone, whatever the repository's
 * committed `.lfsconfig` names ("Settings from Git configuration files
 * override the `.lfsconfig` file", git-lfs-config(5)): `lfs.url` and
 * `lfs.pushurl` are its endpoint, which comes before every other source of
 * one (lfsapi/endpoint_finder.go `getEndpoint`). At that endpoint, lock
 * checks off (the hub has none) and the access mode given as `basic`, the
 * hub's realm, both at its own URL so no more specific key in `.lfsconfig`
 * outranks them. Otherwise a 401 or a missing locks API has git-lfs persist
 * what it learned into the clone's own config by lock-and-rename
 * (`SetAccess` is `gitConfig.SetLocal`; lockverifier.go `disableFor`). The
 * rename drops a workspace sandbox's read-only bind on `.git/config`, which
 * stops the sandbox, and the key is one `repositoryConfigProblem` refuses.
 * A project that declared where its large files live (`declared`) has
 * git-lfs held there instead, with its connection's credential
 * ({@link declaredPins}).
 */
export const hubGitEnv = (
  repo: string,
  extra: [string, string][] = [],
  declared?: DeclaredLfs
): Record<string, string> => ({
  ...hostEnvironment(),
  ...GIT_LOCALE,
  GIT_TERMINAL_PROMPT: "0",
  ...configEnv([
    [`http.${repo}.extraHeader`, `Authorization: Basic ${basicOf()}`],
    ...(declared
      ? declaredPins(declared, urlOrigin(repo))
      : lfsPins(lfsEndpointOf(repo), true)),
    ...extra,
  ]),
});

/**
 * The ref of a project's main hub repository naming the repository that took
 * it before it had a branch: a blob holding that one's root commit. Pushed
 * create-only, so of two repositories that ask at once, git's receive-pack
 * gives it to one ({@link hubRepoOf}).
 */
const MAIN_CLAIM = "refs/cawco/main-root";

/** `git ls-remote`'s lines as each ref's object. */
const remoteRefs = (listed: string): Map<string, string> =>
  new Map(
    listed
      .split("\n")
      .map((line) => line.split("\t"))
      .filter((pair): pair is [string, string] => pair.length === 2)
      .map(([oid, ref]) => [ref, oid])
  );

/**
 * Which of project `projectId`'s hub repositories (core hub-repo.ts) the
 * source repository `repoRoot`, which has no hub remote yet, is: the main
 * one when `repoRoot` has no commit to key by, when it holds the commit at
 * the main one's HEAD (a checkout of it), or when the main one has no
 * default branch yet and `repoRoot` is the repository that claimed it
 * ({@link MAIN_CLAIM}, by its root commit: the first to ask); otherwise one
 * of its own, keyed by its root commit, so an unrelated repository never
 * cuts from, lands on, or moves through the main one's branches.
 */
export const hubRepoOf = async (
  repoRoot: string,
  projectId: string,
  deadline: number
): Promise<HubRepoKey> => {
  const plain = gitUntil(deadline);
  const main: HubRepoKey = { projectId };
  const root = await plain(
    repoRoot,
    "rev-list",
    "--max-parents=0",
    "--first-parent",
    "HEAD"
  ).catch(() => "");
  if (!root) {
    return main;
  }
  const own: HubRepoKey = { projectId, root };
  const url = hubRepo(main);
  const hubGit = gitUntil(deadline, hubGitEnv(url));
  const listed = remoteRefs(
    await hubGit(repoRoot, "ls-remote", url, "HEAD", MAIN_CLAIM)
  );
  const head = listed.get("HEAD");
  if (head) {
    const holds = await plain(
      repoRoot,
      "cat-file",
      "-e",
      `${head}^{commit}`
    ).then(
      () => true,
      () => false
    );
    return holds ? main : own;
  }
  const mine = await gitUntil(
    deadline,
    hostEnvironment(),
    undefined,
    `${root}\n`
  )(repoRoot, "hash-object", "-w", "--stdin");
  let claimed = listed.get(MAIN_CLAIM);
  if (!claimed) {
    // `--no-verify`: the repository's own pre-push hooks are for its own pushes.
    const refused = await hubGit(
      repoRoot,
      "push",
      "--quiet",
      "--no-verify",
      `--force-with-lease=${MAIN_CLAIM}:`,
      url,
      `${mine}:${MAIN_CLAIM}`
    ).then(
      () => undefined,
      (error: Error) => error
    );
    claimed = remoteRefs(
      await hubGit(repoRoot, "ls-remote", url, MAIN_CLAIM)
    ).get(MAIN_CLAIM);
    if (!claimed) {
      throw (
        refused ??
        new Error(`The hub's ${url} holds no ${MAIN_CLAIM} after its push.`)
      );
    }
  }
  return claimed === mine ? main : own;
};
