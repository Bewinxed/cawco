/**
 * A delegation workspace on the machine that holds it. The hub owns the
 * workspace record; the machine makes its private copy of the folder it was
 * made from (`./layer`: a live view with private writes on Linux, an APFS
 * clone on macOS), starts a repository's copy on its own branch from
 * `origin`'s default branch, runs its boundary while something holds it (a
 * session attached, a live work item, a preview, a command: boundary.ts
 * `liveWhy`) and starts it again on its next command once a quiet one has
 * closed, lands a folder's change set, and removes its layer on archive.
 * Every read of the copy from here runs in it as its layer holds it
 * ({@link accessOf}): never the person's folder beneath a Linux view.
 */
import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import type {
  CarryRestored,
  CommandResult,
  WorkspaceArchive,
  WorkspaceArchived,
  WorkspaceChanges,
  WorkspaceCheckout,
  WorkspaceCommit,
  WorkspaceConflict,
  WorkspaceCut,
  WorkspaceHolding,
  WorkspaceRef,
  WorkspaceUnlanded,
} from "@cawco/core";
import {
  holdingWords,
  holdsNothing,
  WORKSPACE_GIT_TIMEOUT_MS,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { lockBy, openDirLock, unlock } from "@cawco/core/flock";
import { processesWithin } from "@cawco/core/live-processes";
import { ownCommitsShell } from "@cawco/core/own-commits";
import {
  forgetWorkspaceTmp,
  isSecretFileName,
  workspaceCacheDir,
  workspaceCarriesDir,
  workspaceScratchDir,
  workspacesDir,
  workspaceTmpDir,
} from "@cawco/core/paths";
import { commandLine, processLineage } from "@cawco/core/process-identity";
import {
  allowedConfigKey,
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  SAFE_GIT_FLAGS,
  SAFE_GIT_SHELL,
  safeGitArgv,
} from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { listedPid, signal as signalPid } from "@cawco/core/signal";
import {
  isDamagedRecord,
  readRecord,
  writeStateFile,
} from "@cawco/core/state-file";
import {
  cloneDenies,
  excludedPaths,
  IGNORED_STATUS,
  PERSON_UNTRACKED_END,
  PERSON_UNTRACKED_START,
  personUntrackedIn,
} from "@cawco/core/workspace-policy";
import {
  addAccount,
  addSpill,
  closeBoundary,
  ensureBoundary,
  setProject,
  shellQuote,
  stopWorkspaceBoundary,
  whileBoundaryClosed,
} from "./boundary";
import {
  carryFolder,
  carryReadme,
  carrySteps,
  copyStrays,
  ownFilesOnly,
} from "./carry";
import { BLOCK_END, BLOCK_START } from "./checkout-exclude";
import { firstSessionOf, firstSpill } from "./first-session";
import { placedAsMade } from "./fleet";
import { expandHome } from "./fs";
import { fetchDefaultBranch } from "./host-git";
import {
  declaredLfs,
  hostSigns,
  noteRefused,
  undeclaredEndpoint,
} from "./host-lfs";
import { ownConfigChanges, ownConfigWords, runHubCommand } from "./hub-command";
import {
  applyChanges,
  changesOf,
  endView,
  ensureView,
  type Layer,
  layerDir,
  layerOf,
  makeLayer,
  markMade,
  readChanges,
  readLayer,
  removeLayer,
  viewArgv,
  viewPath,
} from "./layer";
import {
  configEnv,
  type DeclaredLfs,
  declaredPins,
  hubGitEnv,
  hubRepo,
  isHubRemote,
  LFS_FILTERS,
  lfsPins,
  originEndpoint,
  urlOrigin,
  withoutCredential,
} from "./move";
import { removeTree } from "./remove-tree";
import { keeperChildren } from "./sessiond-client";
import { noRepositoryAt, straysIn } from "./stand-ins";
import { workspaceModulesRoot } from "./workspace-modules";
import { refuseShortOfWorkspace } from "./workspace-needs";

type Git = (root: string, ...args: string[]) => Promise<string>;

/**
 * git on this host as `safe-git.ts` says, its stdout trimmed, within the
 * create's one `deadline`; `env` in place of the host's (the hub's
 * credential, env-only); in a workspace's copy as `access` reaches it
 * ({@link accessOf}) when given. git's stderr, credential taken out, is the
 * error.
 */
export const gitUntil =
  (
    deadline: number,
    env: Record<string, string> = hostEnvironment(),
    access?: CopyAccess
  ): Git =>
  async (root, ...args) => {
    const late = `workspace git exceeded ${WORKSPACE_GIT_TIMEOUT_MS / 1000}s`;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(late);
    }
    const run = access
      ? access.run(root, safeGitArgv(args))
      : { argv: safeGitArgv(args), cwd: root };
    const ran = await readWithin(remaining, async (signal) => {
      const child = Bun.spawn(run.argv, {
        cwd: run.cwd,
        env: { ...env, ...SAFE_GIT_ENV },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        signal,
        killSignal: "SIGKILL",
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (code !== 0) {
        throw new Error(
          child.signalCode
            ? `git ${args[0]} was ended by ${child.signalCode}`
            : `git ${args[0]} failed: ${withoutCredential(stderr.trim())}`
        );
      }
      return stdout.trim();
    });
    switch (ran.kind) {
      case "answered":
        return ran.value;
      case "unanswered":
        throw new Error(late);
      default: {
        const unhandled: never = ran;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  };

const SYMREF = /^ref: refs\/heads\/(\S+)\tHEAD$/m;

/** Whether `treeish` marks any file for LFS (`filter=lfs` in a `.gitattributes`). */
const marksLfs = (git: Git, repo: string, treeish: string): Promise<boolean> =>
  git(
    repo,
    "grep",
    "-q",
    "filter=lfs",
    treeish,
    "--",
    ":(glob)**/.gitattributes"
  ).then(
    () => true,
    () => false
  );

/**
 * The git a new clone at `path` checks out `start` with when its tree marks
 * files for LFS, git-lfs held to one endpoint whatever the branch's
 * `.lfsconfig` says (host-lfs.ts): the project's `declared` one with its
 * connection's credential, else the origin's own. A hub origin's comes
 * from its repository's LFS on the hub with this machine's credential, and
 * git-lfs's filters named here, whatever this machine's own config names;
 * an outside origin's runs with this machine's own filters and credential
 * helpers, its access `basic` only when those hold one for the endpoint
 * (host-lfs.ts `hostSigns`). An ssh origin's endpoint is not pinned: git-lfs
 * derives it, and authenticates over ssh. Outside the hub, a `.lfsconfig`
 * at `start` that names any other endpoint leaves every large file a
 * pointer (`GIT_LFS_SKIP_SMUDGE=1`), and the project's thread is told. A
 * hub origin's checkout is never so refused: its `lfs.url` and
 * `lfs.pushurl` are pinned in git's own environment config (move.ts
 * `hubGitEnv`), and "Settings from Git configuration files override the
 * `.lfsconfig` file" (git-lfs-config(5)), so no `.lfsconfig` moves it; its
 * large files come from the project's own repository on the hub (probe-kit
 * landing-cutoff E, where a landed `.lfsconfig` naming another project's
 * repository left a workspace cut after it with pointers).
 */
export const lfsCheckout = async ({
  deadline,
  declared,
  hub,
  path,
  plain,
  projectId,
  start,
}: {
  deadline: number;
  declared: DeclaredLfs | undefined;
  hub: string | undefined;
  path: string;
  plain: Git;
  projectId: unknown;
  start: string;
}): Promise<Git> => {
  const origin = hub ?? (await plain(path, "remote", "get-url", "origin"));
  const own = originEndpoint(origin);
  const refused = hub
    ? undefined
    : await undeclaredEndpoint(path, [start], [own, declared?.endpoint]);
  const project =
    typeof projectId === "string" && projectId ? projectId : undefined;
  if (refused) {
    await noteRefused(project, path, refused);
  }
  const skip: Record<string, string> = refused
    ? { GIT_LFS_SKIP_SMUDGE: "1" }
    : {};
  if (hub) {
    return gitUntil(deadline, {
      ...hubGitEnv(hub, LFS_FILTERS, declared),
      ...skip,
    });
  }
  let pins: [string, string][] = [];
  if (declared) {
    pins = declaredPins(declared, urlOrigin(origin));
  } else if (urlOrigin(origin)?.startsWith("http")) {
    pins = lfsPins(own, await hostSigns(own));
  }
  return gitUntil(deadline, {
    ...hostEnvironment(),
    ...configEnv(pins),
    ...skip,
  } as Record<string, string>);
};

/**
 * The branch a workspace of `repo`, whose `origin` is the hub, is cut from
 * and lands on: the one the hub's repository names as its HEAD, when the hub
 * has it; otherwise the branch `repo` is on, pushed to the hub now with its
 * large files (as a move's snapshot goes: `git lfs push`, then `git push`),
 * which the hub then names as its HEAD (git-remote.ts). A project that never
 * had a remote, or one a move brought only `cawco/move/*` branches of, has
 * no default branch on the hub until this.
 */
const hubBase = async (git: Git, repo: string): Promise<string> => {
  const listed = await git(repo, "ls-remote", "--symref", "origin");
  const named = SYMREF.exec(listed)?.[1];
  const refs = new Set(listed.split("\n").map((line) => line.split("\t")[1]));
  if (named && refs.has(`refs/heads/${named}`)) {
    return named;
  }
  const branch = await git(repo, "symbolic-ref", "--short", "HEAD").catch(
    (error: Error) => {
      throw new Error(
        `${repo} is on no branch, and the hub's remote of its project has no default branch yet to cut a workspace from: check out its main branch and delegate again.`,
        { cause: error }
      );
    }
  );
  if (await marksLfs(git, repo, `refs/heads/${branch}`)) {
    await git(repo, "lfs", "push", "origin", `refs/heads/${branch}`);
  }
  // `--no-verify`: the repository's own pre-push hooks are for its own pushes.
  await git(
    repo,
    "push",
    "--no-verify",
    "-q",
    "origin",
    `refs/heads/${branch}:refs/heads/${branch}`
  );
  // The branch tracks the hub's: a plain `git pull` there brings landed work in.
  const tracked = await git(repo, "config", "--get", `branch.${branch}.remote`)
    .then(Boolean)
    .catch(() => false);
  if (!tracked) {
    await git(repo, "config", `branch.${branch}.remote`, "origin");
    await git(repo, "config", `branch.${branch}.merge`, `refs/heads/${branch}`);
  }
  console.info(
    `[workspace] ${repo}: ${branch} pushed to the hub's remote, its default branch${tracked ? "" : ", and tracks it"}`
  );
  return branch;
};

/** Each source repository's {@link inSource} work in flight: the last of its queue. */
const sourcing = new Map<string, Promise<unknown>>();

/**
 * `work` on source repository `repo`, one at a time per repository, by
 * every process on this computer. A workspace's create may write the
 * source's own `.git/config` (its `origin`, the hub's credential helper, a
 * pushed branch's tracking) and push its branch as the hub's first;
 * workspaces cut at once from one repository (a group of delegates, a
 * routine's runs) each did so side by side, and git refused all but one:
 * "could not lock config file .git/config: File exists" (scratch fleet, 20
 * delegates at once, 2026-10-15), or "reference already exists" for the
 * push. Queued, each later one finds what the first wrote. Within this agent
 * they queue here; another process readying the same repository (a second
 * agent whose place is the same checkout, as two machines of a scratch fleet
 * on one computer are: link-under-load lane 2, 2026-10-20) is waited for on
 * the lock of the repository's git directory ({@link holdingSource}).
 */
const inSource = <T>(
  repo: string,
  deadline: number,
  work: () => Promise<T>
): Promise<T> => {
  const mine = (sourcing.get(repo) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => holdingSource(repo, deadline, work));
  sourcing.set(repo, mine);
  const forget = () => {
    if (sourcing.get(repo) === mine) {
      sourcing.delete(repo);
    }
  };
  mine.then(forget, forget);
  return mine;
};

/**
 * `work` holding the lock of source repository `repo`'s git directory
 * (`flock(2)` on the directory itself, so nothing is written into it), once
 * any other process holding it lets it go, by the create's `deadline`.
 */
const holdingSource = async <T>(
  repo: string,
  deadline: number,
  work: () => Promise<T>
): Promise<T> => {
  const gitDir = await gitUntil(deadline)(
    repo,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir"
  );
  const fd = openDirLock(gitDir);
  try {
    if (!(await lockBy(fd, deadline))) {
      throw new Error(
        `${repo} was still being readied for a workspace by another process on this computer when this create's ${WORKSPACE_GIT_TIMEOUT_MS / 1000} s ran out.`
      );
    }
    return await work();
  } finally {
    unlock(fd);
  }
};

/**
 * Readies workspace `path`'s copy of the repository at `folder` for its
 * branch, inside {@link inSource} (keyed by the person's checkout, whose git
 * directory is only ever locked, never written): its `origin` (the hub's
 * remote of `projectId` when it has none), and the branch the workspace
 * starts from ({@link hubBase}), each written in the copy alone. `hub` is
 * that origin's URL when it is the hub's, which every git that reaches it
 * runs under ({@link hubGitEnv}), git-lfs held to the project's `declared`
 * endpoint when it has one.
 */
const readySource = (
  folder: string,
  path: string,
  projectId: unknown,
  deadline: number,
  declared: DeclaredLfs | undefined,
  access: CopyAccess
): Promise<{ hub: string | undefined; known: string | undefined }> =>
  inSource(folder, deadline, async () => {
    const plain = gitUntil(deadline, hostEnvironment(), access);
    // A workspace starts from origin's default branch and lands there.
    let origin = await plain(path, "remote", "get-url", "origin").catch(
      () => undefined
    );
    if (!origin) {
      if (typeof projectId !== "string" || !projectId) {
        throw new Error(
          `${folder} has no origin remote and belongs to no project, so it has no hub remote to start a workspace's branch from. Delegate from a session in a project, or add a remote with \`git remote add origin <url>\`, and delegate again.`
        );
      }
      origin = hubRepo(projectId);
      await plain(path, "remote", "add", "origin", origin);
      console.info(
        `[workspace] ${folder} has no origin: the hub's remote of project ${projectId} is its workspace's origin`
      );
    }
    const hub = isHubRemote(origin) ? origin : undefined;
    const known = hub
      ? await hubBase(
          gitUntil(deadline, hubGitEnv(hub, [], declared), access),
          path
        )
      : undefined;
    return { hub, known };
  });

/**
 * How this process reaches a workspace's copy ({@link accessOf}): its
 * layer, a path of the copy as this process reads and writes it, and an
 * argv run in the copy, in a directory there, with the directory its spawn
 * starts in.
 */
export interface CopyAccess {
  at: (path: string) => string;
  layer: Layer;
  run: (
    cwd: string,
    argv: readonly string[]
  ) => { argv: string[]; cwd: string };
}

/**
 * `workspace`'s copy as this process reaches it: through its view's
 * namespace on Linux (layer.ts `viewArgv`, `viewPath`), started for this
 * when nothing holds it; its own folder on macOS and for a clone cut before
 * layers. Nothing when it has no layer there.
 */
export const accessOf = async (
  workspace: WorkspaceRef
): Promise<CopyAccess | undefined> => {
  const layer = await layerOf(workspace.id, workspace.path);
  if (!layer) {
    return;
  }
  if (layer.form !== "overlay") {
    return {
      layer,
      at: (path) => path,
      run: (cwd, argv) => ({ argv: [...argv], cwd }),
    };
  }
  const pid = await ensureView(workspace.id, layer);
  return {
    layer,
    at: (path) => viewPath(pid, path),
    run: (cwd, argv) => ({ argv: viewArgv(pid, cwd, argv), cwd: "/" }),
  };
};

/**
 * The copy's own `.git/config`: the keys of the person's that git may run
 * under (core safe-git.ts `allowedConfigKey`), and no other, so the copy's
 * git runs where the person's config would refuse it (a credential helper,
 * a hooks path), and nothing the person's config names runs for the
 * workspace. The person's config is read, never written; a
 * `config.worktree` the copy holds goes.
 */
const ownGitConfig = async (
  folder: string,
  path: string,
  access: CopyAccess
): Promise<void> => {
  const listed = Bun.spawnSync(
    [
      "git",
      ...SAFE_GIT_FLAGS,
      "config",
      "--file",
      join(folder, ".git", "config"),
      "--no-includes",
      "--list",
      "-z",
    ],
    { env: { ...hostEnvironment(), ...SAFE_GIT_ENV }, stderr: "pipe" }
  );
  if (listed.exitCode !== 0) {
    throw new Error(
      `${folder}'s git config could not be read: ${listed.stderr.toString().trim()}`
    );
  }
  const kept = listed.stdout
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const at = entry.indexOf("\n");
      return at < 0
        ? { key: entry, value: "true" }
        : { key: entry.slice(0, at), value: entry.slice(at + 1) };
    })
    .filter(({ key }) => allowedConfigKey(key));
  const config = access.at(join(path, ".git", "config"));
  await rm(access.at(join(path, ".git", "config.worktree")), { force: true });
  await writeStateFile(config, "");
  for (const { key, value } of kept) {
    const set = Bun.spawnSync(
      [
        "git",
        ...SAFE_GIT_FLAGS,
        "config",
        "--file",
        config,
        "--add",
        key,
        value,
      ],
      { env: { ...hostEnvironment(), ...SAFE_GIT_ENV }, stderr: "pipe" }
    );
    if (set.exitCode !== 0) {
      throw new Error(
        `the copy's git config could not take ${key}: ${set.stderr.toString().trim()}`
      );
    }
  }
};

/**
 * What the copy's status must never read as the workspace's, kept out of
 * it by CawCo's blocks in its `info/exclude`, written once its branch is
 * checked out: the person's untracked files the copy started with (each
 * path `git ls-files --others --exclude-standard` names: they came along
 * with the folder, layer.ts, and are the person's), and each of the copy's
 * deny paths with a stand-in that git does not track (core
 * workspace-policy.ts `cloneDenies`), which the boundary's host makes in a
 * Linux view as each sandbox starts, where no host-side pass lists them
 * (stand-ins.ts `listStandIns`, which a copy of its own runs at each start).
 * Neither the landing's check for uncommitted changes nor an archive then
 * reads them as held (core `excludedPaths`, `personUntrackedIn`).
 */
const excludeStart = async (
  path: string,
  git: Git,
  access: CopyAccess
): Promise<void> => {
  const untracked = (
    await git(path, "ls-files", "-z", "--others", "--exclude-standard")
  )
    .split("\0")
    .filter(Boolean);
  const denies = cloneDenies(path)
    .filter(({ empty }) => empty.kind !== "none")
    .map((deny) => relative(path, deny.path))
    .filter((name) => !name.startsWith(".git/"));
  const tracked = new Set(
    (await git(path, "ls-files", "-z", "--", ...denies))
      .split("\0")
      .filter(Boolean)
  );
  const standIns = denies.filter(
    (name) =>
      !(
        tracked.has(name) ||
        [...tracked].some((file) => file.startsWith(`${name}/`))
      )
  );
  const exclude = access.at(join(path, ".git", "info", "exclude"));
  const before = await readFile(exclude, "utf8").catch(() => "");
  const blocks = [
    ...(standIns.length > 0
      ? [BLOCK_START, ...standIns.map((name) => `/${name}`), BLOCK_END]
      : []),
    ...(untracked.length > 0
      ? [
          PERSON_UNTRACKED_START,
          ...untracked.map((file) => `/${file}`),
          PERSON_UNTRACKED_END,
        ]
      : []),
  ];
  if (blocks.length === 0) {
    return;
  }
  await writeStateFile(
    exclude,
    `${before}${before && !before.endsWith("\n") ? "\n" : ""}${blocks.join("\n")}\n`
  );
};

/** The person's untracked files a copy's `info/exclude` names in CawCo's block ({@link excludeStart}). */
const ownUntracked = async (
  path: string,
  access: CopyAccess
): Promise<Set<string>> =>
  new Set(
    personUntrackedIn(
      await readFile(
        access.at(join(path, ".git", "info", "exclude")),
        "utf8"
      ).catch(() => "")
    )
  );

/**
 * A repository copy's branch, checked out: the copy's own config
 * ({@link ownGitConfig}) and origin ({@link readySource}), `origin`'s
 * default branch fetched into the copy as it stands now (with `origin/HEAD`
 * naming it), and `ws/<id8>` checked out there with `--force`, so every
 * tracked file the person's checkout holds otherwise is written in the copy
 * at origin's version (a Linux view copies up just those files) and the
 * person's own uncommitted work stays theirs. `at` ({@link WorkspaceCut})
 * cuts it at the commit a retired workspace's copy was on, fetched from
 * `origin`'s branch that held it then, tracking the default branch; a carry's
 * commits are fetched and checked out instead when it holds any. The
 * person's untracked files are kept out of its status
 * ({@link excludeStart}).
 */
const startBranch = async (
  workspace: WorkspaceRef,
  folder: string,
  {
    access,
    carried,
    cut,
    deadline,
    projectId,
  }: {
    access: CopyAccess;
    carried: Carried | undefined;
    cut: WorkspaceCut | undefined;
    deadline: number;
    projectId: unknown;
  }
): Promise<{ base: string; branch: string }> => {
  const { id, path } = workspace;
  const branch = `ws/${id.slice(0, 8)}`;
  const plain = gitUntil(deadline, hostEnvironment(), access);
  await ownGitConfig(folder, path, access);
  const declared = await declaredLfs(projectId);
  const { hub, known } = await readySource(
    folder,
    path,
    projectId,
    deadline,
    declared,
    access
  );
  const authed = hub ? gitUntil(deadline, hubGitEnv(hub), access) : plain;
  const base = await fetchDefaultBranch(path, authed, known);
  // The origin it was cut from, as the copy names it: the one URL an
  // archive refreshes the base from ({@link refreshBase}).
  await writeStateFile(
    join(workspacesDir(), id, "create.json"),
    JSON.stringify({
      path,
      origin: await plain(path, "remote", "get-url", "origin"),
    } satisfies CreateRecord)
  );
  if (cut) {
    await fetchCut(path, id, base, cut, authed);
  }
  if (carried?.commits) {
    await carryOnto(path, carried.commits, plain);
  }
  const start = startOf(cut, carried, base);
  const checkout = (await marksLfs(authed, path, start))
    ? await lfsCheckout({
        deadline,
        declared,
        hub,
        path,
        plain,
        projectId,
        start,
      })
    : authed;
  await checkout(path, "checkout", "--quiet", "--force", "-B", branch, start);
  await plain(
    path,
    "branch",
    "--quiet",
    `--set-upstream-to=origin/${base}`,
    branch
  );
  await excludeStart(path, plain, access);
  return { base, branch };
};

/**
 * What workspace `id`'s boundary reads from its first start, cut at `path`:
 * the user layer of `account`, the Claude account its first session launches
 * on, the folder of project `projectId`, and the spill folder of that session
 * `first` (first-session.ts), each as the hub named it, so the session's spawn
 * finds the boundary's form unchanged.
 */
const placeFirst = async (
  id: string,
  path: string,
  {
    account,
    first,
    projectId,
  }: { account: unknown; first: unknown; projectId: unknown }
): Promise<void> => {
  const named = typeof account === "string" && account ? account : null;
  if (named) {
    await addAccount(id, named);
  }
  if (typeof projectId === "string" && projectId) {
    await setProject(id, projectId);
  }
  const spill = await firstSpill(id, path, named, firstSessionOf(first));
  if (spill) {
    await addSpill(id, spill);
  }
};

/** The cut mark of a build before layers (`cut.json`): a clone it began at `path` and never finished. */
const oldCutPath = async (id: string): Promise<string | undefined> =>
  (
    await readRecord<{ path?: unknown }>(
      join(workspacesDir(), id, "cut.json")
    ).catch(() => undefined)
  )?.path as string | undefined;

/** Whether `path` is where a build before layers cut workspace `id`'s clone: `~/.worktrees/<repo>-<id8>`. */
const isOldCutPath = (id: string, path: string): boolean =>
  dirname(path) === expandHome("~/.worktrees") &&
  basename(path).endsWith(`-${id.slice(0, 8)}`);

/**
 * At this agent's start, before any create: each layer its last process
 * left unmade (layer.json `made` false: an install's restart, a crash or a
 * full disk cut its making short) is removed, with its state and scratch
 * dirs, as a failed create is (an `unmade` archive); and so is each clone a
 * build before layers began and never finished (its `cut.json`), at the
 * path such a build cut it. The hub, told the create was not run again
 * (request-record.ts), makes it whole at the next. Never throws.
 */
export const clearUnmadeLayers = (): Promise<void> => {
  unmadeCleared = sweepUnmade();
  return unmadeCleared;
};

let unmadeCleared: Promise<void> = Promise.resolve();

const sweepUnmade = async (): Promise<void> => {
  const ids = await readdir(workspacesDir()).catch(() => [] as string[]);
  for (const id of ids) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one workspace at a time, each its own folder
      const layer = await readLayer(id).catch(() => undefined);
      const old = await oldCutPath(id);
      if (layer && !layer.made) {
        await archiveWorkspace({
          id,
          path: layer.path,
          unlanded: "unmade",
        } satisfies WorkspaceArchive);
        console.info(
          `[workspace] ${id}: its layer of ${layer.folder}, cut short when this agent's last process ended, is cleared; its next create makes it whole`
        );
      } else if (old && isOldCutPath(id, old)) {
        await clearOldCut(id, old);
      }
    } catch (error) {
      console.warn(
        `[workspace] ${id}: what its unfinished create left could not be cleared: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

/** A clone a build before layers began at `path` and never finished: removed with its mark. */
const clearOldCut = async (id: string, path: string): Promise<void> => {
  await removeTree(path);
  await rm(join(workspacesDir(), id, "cut.json"), { force: true });
  console.info(
    `[workspace] ${id}: the clone a build before layers began at ${path} and never finished is cleared`
  );
};

/**
 * What workspace `id` already has where its create makes its copy (again,
 * `again`): a layer this agent began and never finished, or an old build's
 * unfinished clone, is cleared; a whole layer that holds nothing of the
 * delegate's is archived and made again (a create whose answer never
 * reached the hub). A whole layer that holds work, or a folder at the Mac
 * path that no record of this workspace names, refuses the create, and is
 * left as it is.
 */
const clearStale = async (
  id: string,
  path: string,
  again: boolean
): Promise<void> => {
  const layer = await readLayer(id).catch(() => undefined);
  const old = await oldCutPath(id);
  if (old && isOldCutPath(id, old)) {
    await clearOldCut(id, old);
  }
  if (layer) {
    const archived = await archiveWorkspace({
      id,
      path: layer.path,
      unlanded: layer.made ? "keep" : "unmade",
    } satisfies WorkspaceArchive);
    if (archived.held) {
      throw new Error(
        `workspace ${id} cannot be made${again ? " again" : ""}: its copy at ${layer.path} holds ${holdingWords(archived.held)}, so it is left as it is`
      );
    }
    return;
  }
  if (
    process.platform !== "linux" &&
    (await lstat(path).catch(() => undefined))
  ) {
    throw new Error(
      `workspace ${id} cannot be made${again ? " again" : ""} at ${path}: this machine's agent has no record of making it there, so it is left as it is. Move it away or delete it (rm -rf ${shellQuote(path)}), then ask again.`
    );
  }
};

/** `path` at its real path, links followed; as given when it does not exist. */
const realFolder = (path: string): Promise<string> =>
  realpath(path).catch(() => path);

/**
 * The folder a workspace is made of for a session at `dir`: the repository's
 * root when `dir` is in one, else `dir` itself, at its real path.
 */
const folderOf = async (dir: string, git: Git): Promise<string> => {
  const real = await realFolder(dir);
  const info = await stat(real).catch(() => undefined);
  if (!info?.isDirectory()) {
    throw new Error(`${dir} is not a folder, so it cannot have a workspace`);
  }
  const top = await git(real, "rev-parse", "--show-toplevel").catch(
    () => undefined
  );
  return top ? await realFolder(top) : real;
};

/**
 * {@link CONTROL_WORKSPACE_CREATE}: a private copy of the folder `cwd` is in
 * (its repository's root, or the folder itself: {@link folderOf}), made by
 * its layer (layer.ts `makeLayer`: on Linux the folder itself, seen through
 * the workspace's own view; on macOS an APFS clone at
 * `~/.worktrees/<name>-<id8>`), a repository's copy on its own branch
 * ({@link startBranch}), and its boundary. Nothing of the person's folder is
 * written. A boundary that cannot start takes the layer with it. `account`
 * is the Claude account the workspace's first session launches on, placed by
 * the hub before the copy is made: the boundary starts reading that
 * account's user layer, so the session's spawn finds its form unchanged and
 * hands nothing over (`boundaryFor`); `first` is that session
 * ({@link WorkspaceFirstSession}), whose spill folder the boundary starts
 * reading too (first-session.ts), so its spawn finds the form unchanged and
 * the boundary starts once. `placeRows` puts the rows of `projectId` this
 * agent holds into a copy of its own (session.ts `placeClone`) before the
 * boundary starts; a Linux view takes none, since its path is the person's
 * folder, which shows through it with the rows its own place has. `at` ({@link WorkspaceCut}) makes a retired
 * workspace again, a repository's at the commit its copy's HEAD was on when
 * it retired. What the workspace already has is cleared first, or refuses
 * it ({@link clearStale}). The layer is recorded unmade before anything of it
 * is made, and made once it is whole.
 */
export const createWorkspace = async (
  placeRows: (cwd: string, projectId: string) => Promise<void>,
  cwd: unknown,
  workspaceId: unknown,
  projectId?: unknown,
  account?: unknown,
  at?: unknown,
  first?: unknown
): Promise<WorkspaceCheckout> => {
  // What this machine lacks first, before the folder is read at all.
  refuseShortOfWorkspace();
  // A MachinePath from the hub (work-items `openWorkspace`): absolute.
  const dir = String(cwd);
  const deadline = Date.now() + WORKSPACE_GIT_TIMEOUT_MS;
  const folder = await folderOf(dir, gitUntil(deadline));
  const id = String(workspaceId);
  const id8 = id.slice(0, 8);
  const path =
    process.platform === "linux"
      ? folder
      : expandHome(`~/.worktrees/${basename(folder)}-${id8}`);
  const state = join(workspacesDir(), id);
  const cut = (at ?? undefined) as WorkspaceCut | undefined;
  if (cut && !COMMIT.test(cut.commit)) {
    throw new Error(`"${cut.commit}" is not a commit id`);
  }
  const carried = cut?.carry ? await carryOf(id, cut.carry) : undefined;
  await unmadeCleared;
  await clearStale(id, path, Boolean(cut));
  try {
    await mkdir(state, { recursive: true });
    // Written before the layer: archive-by-id survives a lost reply or an agent restart.
    await writeStateFile(
      join(state, "create.json"),
      JSON.stringify({ path } satisfies CreateRecord)
    );
    const layer = await makeLayer(id, folder, path);
    const workspace: WorkspaceRef = { id, path };
    const access = await accessOf(workspace);
    if (!access) {
      throw new Error(`workspace ${id}'s copy of ${folder} is not there`);
    }
    const repo =
      layer.kind === "repo"
        ? await startBranch(workspace, folder, {
            access,
            carried,
            cut,
            deadline,
            projectId,
          })
        : undefined;
    await placeFirst(id, path, { account, first, projectId });
    // The project's rows this agent holds, in a copy of its own before its
    // boundary and first session start: nothing is asked of the hub, and the
    // boundary's form has them from its start. A view writes nothing into
    // the person's folder.
    if (typeof projectId === "string" && projectId && layer.form === "copy") {
      await placeRows(path, projectId).catch((error: unknown) =>
        console.warn(
          `[workspace] ${id}: its project's rows were not placed in ${path}, so its sessions start without them: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
    const boundary = await ensureBoundary(workspace);
    const restored = repo ? await applyCarried(workspace, carried) : undefined;
    await markMade(id);
    console.info(
      `[workspace] ${id}: made of ${folder} (${layer.kind}, ${layer.form}) at ${path} in ${Date.now() - layer.started} ms`
    );
    return {
      kind: layer.kind,
      repoRoot: folder,
      path,
      branch: repo?.branch ?? "",
      base: repo?.base ?? "",
      boundaryPid: boundary.pid,
      tmp: workspaceScratchDir(id),
      ...(restored ? { restored } : {}),
    };
  } catch (error) {
    await archiveWorkspace({
      id,
      path,
      unlanded: "unmade",
    } satisfies WorkspaceArchive);
    throw error;
  }
};

/**
 * A carry a workspace is cut again with ({@link WorkspaceCut} `carry`): its
 * commits (its bundle and the HEAD it was saved at), when it holds any, and
 * its uncommitted diff, when it holds one.
 */
interface Carried {
  commits?: CarriedCommits;
  patch?: string;
}

/** A carry's commits: its bundle and the HEAD it was saved at. */
interface CarriedCommits {
  bundle: string;
  head: string;
}

/** Whether `path` is a regular file. */
const isFile = async (path: string): Promise<boolean> =>
  (await lstat(path).catch(() => undefined))?.isFile() ?? false;

/**
 * The carry `folder` names for workspace `id`'s cut again: one of this
 * machine's carries (`~/.cawco/carries/<id>-<time>`, carry.ts
 * `carryFolder`). Its commits are the HEAD its `head` file says and its
 * `commits.bundle`; one with none (only its uncommitted diff, or commits
 * whose changes all landed) is cut at the commit its HEAD built on. Its
 * `uncommitted.patch` is laid on top once the clone's boundary runs
 * ({@link applyCarried}). Refused, nothing cut, for a folder outside the
 * carries or of another workspace's.
 */
const carryOf = async (id: string, folder: string): Promise<Carried> => {
  const named = resolve(folder);
  if (
    dirname(named) !== resolve(workspaceCarriesDir()) ||
    !basename(named).startsWith(`${id}-`)
  ) {
    throw new Error(
      `workspace ${id} is not cut again: ${folder} is not one of its carries in ${workspaceCarriesDir()}`
    );
  }
  const bundle = join(named, "commits.bundle");
  const patch = join(named, "uncommitted.patch");
  const head = (
    await readFile(join(named, "head"), "utf8").catch(() => "")
  ).trim();
  return {
    ...(COMMIT.test(head) && (await isFile(bundle))
      ? { commits: { bundle, head } }
      : {}),
    ...((await isFile(patch)) ? { patch } : {}),
  };
};

/**
 * The carry's commits fetched into the new clone at `path` from its bundle
 * (git on this host, the carry being this agent's own folder), and its HEAD
 * there as a commit: what the clone checks out ({@link createWorkspace}).
 */
const carryOnto = async (
  path: string,
  carried: CarriedCommits,
  git: Git
): Promise<void> => {
  await git(path, "fetch", "--quiet", "--no-tags", carried.bundle, "HEAD");
  await git(path, "cat-file", "-e", `${carried.head}^{commit}`);
};

/** Where a cut checks its branch out: the carry's HEAD, the commit it is cut again at, or origin's `base`. */
const startOf = (
  cut: WorkspaceCut | undefined,
  carried: Carried | undefined,
  base: string
): string => carried?.commits?.head ?? cut?.commit ?? `origin/${base}`;

/** How many of `git apply`'s lines a refusal names. */
const APPLY_LINES = 12;

/**
 * A carry's uncommitted diff (`patch`, carry.ts: every changed, deleted and
 * untracked file against its HEAD) laid on the clone cut again at that HEAD:
 * copied into its scratch dir as a file of its own, then `git apply` inside
 * its boundary, which refuses any path the workspace may not write (a deny
 * path), as the workspace's own commands are refused. Its changes come back
 * unstaged and its new files untracked, as `git apply` writes them; all of
 * it or none (`git apply` is atomic). One that does not apply says why in
 * git's words, which name each file, and stays in the carry.
 */
const applyCarried = async (
  workspace: WorkspaceRef,
  carried: Carried | undefined
): Promise<CarryRestored | undefined> => {
  const patch = carried?.patch;
  if (!patch) {
    return;
  }
  const { scratch } = await ensureBoundary(workspace);
  const name = `.cawco-carry-${crypto.randomUUID()}.patch`;
  const copy = join(scratch, name);
  try {
    await writeStateFile(copy, await readFile(patch), {
      exclusive: true,
      mode: 0o600,
    });
    const applied = await runHubCommand(
      workspace.path,
      `${SAFE_GIT_SHELL}git apply --whitespace=nowarn "$TMPDIR"/${name}`,
      WORKSPACE_GIT_TIMEOUT_MS,
      workspace
    );
    if (applied.exitCode === 0) {
      console.info(
        `[workspace] ${workspace.id}: cut again with its carry's uncommitted diff ${patch} applied`
      );
      return { applied: patch };
    }
    const why =
      (applied.stderr || applied.stdout)
        .trim()
        .split("\n")
        .slice(0, APPLY_LINES)
        .join("; ") || `git apply exited ${applied.exitCode}`;
    console.warn(
      `[workspace] ${workspace.id}: its carry's uncommitted diff ${patch} did not apply, and stays in the carry: ${why}`
    );
    return { refused: patch, why };
  } finally {
    await rm(copy, { force: true });
  }
};

/**
 * A cut again's commit in the new clone at `path` ({@link WorkspaceCut}):
 * `origin`'s branch that held it fetched, unless it is `base`, which the
 * clone has; refused when that branch no longer holds it, since a cut
 * anywhere else would leave the workspace's commits behind.
 */
const fetchCut = async (
  path: string,
  id: string,
  base: string,
  cut: WorkspaceCut,
  git: Git
): Promise<void> => {
  if (cut.branch !== base) {
    await git(
      path,
      "fetch",
      "--quiet",
      "--no-tags",
      "origin",
      `+refs/heads/${cut.branch}:refs/remotes/origin/${cut.branch}`
    );
  }
  await git(
    path,
    "merge-base",
    "--is-ancestor",
    cut.commit,
    `origin/${cut.branch}`
  ).catch((error: Error) => {
    throw new Error(
      `workspace ${id} is not cut again: origin's ${cut.branch} no longer holds ${cut.commit.slice(0, 9)}, the commit its clone was on when it retired, and a cut anywhere else would leave its commits behind`,
      { cause: error }
    );
  });
};

/**
 * The source checkout's own secret files (`SECRET_FILE_NAME`: `.env`,
 * `apps/web/.env.local`), copied into the new clone at the same paths with
 * the same modes. git ignores them, so a clone has none, and the boundary
 * withholds every one outside the workspace's own clone: a workspace runs
 * its repository with that repository's keys, and reads no other's. One in
 * a package or build tree is not the repository's own.
 */
export const copyOwnSecrets = async (
  repoRoot: string,
  path: string,
  git: (root: string, ...args: string[]) => Promise<string>
): Promise<void> => {
  const listed = await git(
    repoRoot,
    "ls-files",
    "-z",
    "--others",
    "--ignored",
    "--exclude-standard",
    "--",
    ":(glob)**/.env*",
    ":(glob)**/*.env",
    ":(glob)**/*.env.*"
  );
  const files = listed
    .split("\0")
    .filter(
      (file) =>
        file &&
        isSecretFileName(basename(file)) &&
        !file.split("/").some((part) => PACKAGE_TREES.has(part))
    );
  for (const file of files) {
    const from = join(repoRoot, file);
    const to = join(path, file);
    // biome-ignore lint/performance/noAwaitInLoops: a repository keeps a handful of these
    const info = await stat(from).catch(() => undefined);
    if (!info?.isFile()) {
      continue;
    }
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
    // chmod(2) takes the permission bits of a whole st_mode.
    await chmod(to, info.mode);
  }
};

/** Trees that hold packages and builds: their secret-named files are not the repository's own. */
export const PACKAGE_TREES = new Set([
  "node_modules",
  ".venv",
  "site-packages",
  ".next",
  ".svelte-kit",
  "dist",
  "build",
  "target",
]);

/** The largest bundle of a workspace's commits another machine takes. */
const BUNDLE_LIMIT = 256 * 1024 * 1024;
const COMMIT = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/** Runs git commands in a workspace's clone, inside its boundary, as `safe-git.ts` says; throws git's words. */
const insideGit =
  (workspace: WorkspaceRef) =>
  async (cmd: string): Promise<string> => {
    const result: CommandResult = await runHubCommand(
      workspace.path,
      `${SAFE_GIT_SHELL}${cmd}`,
      WORKSPACE_GIT_TIMEOUT_MS,
      workspace
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `${cmd.split(" ").slice(0, 3).join(" ")} failed in workspace ${workspace.id}: ${(result.stderr || result.stdout).trim() || `exit ${result.exitCode}`}`
      );
    }
    return result.stdout.trim();
  };

/** A bundle's name in a workspace's scratch dir, which is `$TMPDIR` inside its boundary. */
const bundleName = (): string => `.cawco-bundle-${crypto.randomUUID()}`;

/**
 * {@link CONTROL_WORKSPACE_BUNDLE}: the clone's HEAD and a bundle of its
 * commits past `origin/<base>`, made inside the boundary in its scratch dir
 * and read from there here. The file is opened without following a link and
 * taken only as a regular file of one link: the workspace writes that dir.
 */
export const workspaceBundle = async (
  ref: unknown,
  base: unknown
): Promise<WorkspaceCommit> => {
  const workspace = ref as WorkspaceRef;
  const upstream = shellQuote(`origin/${String(base)}`);
  const git = insideGit(workspace);
  const head = await git("git rev-parse --verify 'HEAD^{commit}'");
  const ahead = Number(
    await git(`git rev-list --count HEAD --not ${upstream}`)
  );
  if (ahead === 0) {
    return { head, bundle: null };
  }
  const { scratch } = await ensureBoundary(workspace);
  const name = bundleName();
  const path = join(scratch, name);
  try {
    await git(
      `git bundle create --quiet "$TMPDIR"/${name} HEAD --not ${upstream}`
    );
    const file = await open(
      path,
      // biome-ignore lint/suspicious/noBitwiseOperators: open(2) takes its flags as one bit set
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    try {
      const info = await file.stat();
      if (!info.isFile() || info.nlink !== 1) {
        throw new Error(
          `the bundle of workspace ${workspace.id} is not a file of its own`
        );
      }
      if (info.size > BUNDLE_LIMIT) {
        throw new Error(
          `the commits of workspace ${workspace.id} past ${String(base)} come to ${(info.size / 1024 / 1024).toFixed(1)} MiB, past the ${BUNDLE_LIMIT / 1024 / 1024} MiB another machine takes`
        );
      }
      return { head, bundle: (await file.readFile()).toString("base64") };
    } finally {
      await file.close();
    }
  } finally {
    await rm(path, { force: true });
  }
};

/**
 * {@link CONTROL_WORKSPACE_AT}: a gate workspace at another workspace's
 * commit. The bundle is written into its scratch dir as a new file (never
 * through one already there), then inside its boundary git fetches its base
 * and the bundle. The commit is checked out, detached, with every untracked
 * file gone, by git on this host with the boundary closed
 * ({@link whileBoundaryClosed}, {@link closedCloneGit}'s checks first), as a
 * first cut checks out before its boundary exists: the policy denies the
 * workspace every clone-side deny path (workspace-policy.ts `cloneDenies`),
 * so a commit that tracks one the clone lacks, or holds another text of, is
 * refused inside it ("unable to create file .mcp.json: Operation not
 * permitted", Seatbelt's `(deny file-write* (subpath …))` on macOS; srt's
 * read-only bind on Linux). The boundary the next command starts denies them
 * again. git-lfs smudges nothing on the host, where a `.lfsconfig` of the
 * commit could point it anywhere with the owner's credentials: a commit that
 * marks files for LFS has them pulled inside the boundary, where its
 * checkout smudged them before. A commit whose own commits change harness
 * project config (hub-command.ts `ownConfigChanges`) is never checked
 * out: the host would write it into a worktree a session's harness loads
 * outside any boundary.
 */
export const workspaceAt = async (
  ref: unknown,
  base: unknown,
  commit: unknown,
  source: unknown
): Promise<void> => {
  const workspace = ref as WorkspaceRef;
  const { head, bundle } = commit as WorkspaceCommit;
  if (!COMMIT.test(head)) {
    throw new Error(`"${head}" is not a commit id`);
  }
  const git = insideGit(workspace);
  const { scratch } = await ensureBoundary(workspace);
  const name = bundleName();
  const path = join(scratch, name);
  try {
    await git(`git fetch --quiet origin ${shellQuote(String(base))}`);
    if (bundle) {
      await writeStateFile(path, Buffer.from(bundle, "base64"), {
        exclusive: true,
        mode: 0o600,
      });
      await git(`git fetch --quiet "$TMPDIR"/${name} HEAD`);
    }
  } finally {
    await rm(path, { force: true });
  }
  const own = await ownConfigChanges(workspace, [head]);
  if (own.length > 0) {
    throw new Error(
      `workspace ${workspace.id} was not moved to ${head.slice(0, 9)}, the commit of workspace ${String(source)}: ${ownConfigWords(own)}`
    );
  }
  const large =
    (await git(
      `if git grep -q filter=lfs ${head} -- ':(glob)**/.gitattributes'; then echo lfs; fi`
    )) === "lfs";
  await whileBoundaryClosed(workspace, async () => {
    const access = await accessOf(workspace);
    if (!access) {
      throw new Error(
        `workspace ${workspace.id} has no copy at ${workspace.path}`
      );
    }
    const host = await closedCloneGit(workspace, access);
    const env = { GIT_LFS_SKIP_SMUDGE: "1" };
    await host(["checkout", "--quiet", "--force", "--detach", head], { env });
    await host(["clean", "-ffdq"], { env });
  });
  // Running again, as the hub found it, for the gate's first command.
  await ensureBoundary(workspace);
  if (large) {
    await git("git lfs pull");
  }
  console.info(
    `[workspace] ${workspace.id}: at ${head.slice(0, 9)}, the commit of workspace ${String(source)}`
  );
};

/** {@link CONTROL_WORKSPACE_BOUNDARY}: the boundary, running; answers its pid. */
export const workspaceBoundary = async (ref: unknown): Promise<number> =>
  (await ensureBoundary(ref as WorkspaceRef)).pid;

/**
 * The clone's path as `create.json` names it, for an archive the hub sends
 * with no path (a create it never filed). A damaged one names none: the
 * workspace's state and scratch dirs still go with it, and the log says the
 * clone at an unread path is left.
 */
const createdPath = async (id: string): Promise<string | undefined> => {
  try {
    return (
      await readRecord<CreateRecord>(join(workspacesDir(), id, "create.json"))
    )?.path;
  } catch (error) {
    if (!isDamagedRecord(error)) {
      throw error;
    }
    console.warn(
      `[workspace] ${id}: archived with no path, and ${error.message}: its state and scratch dirs go, and its clone, whose path that record held, is left where it is`
    );
  }
};

/**
 * The entries of a workspace's folder that is no git clone that are not
 * CawCo's (stand-ins.ts `straysIn`), the project's skills and memory documents it placed there as
 * they were placed among CawCo's (fleet.ts `placedAsMade`).
 */
const strayEntries = async (path: string): Promise<string[]> =>
  straysIn(path, await placedAsMade(path));

/**
 * A cut's record in its state dir, `create.json`: the clone's path, written
 * before anything is at it, and once the clone is made the URL of `origin` it
 * was cut from, as this host read it from the source (a clone a build before
 * this cut has none).
 */
interface CreateRecord {
  origin?: string;
  path?: string;
}

/** A branch name taken into a refspec: no option, no second refspec, no `:`. */
const BRANCH_NAME = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/;

/**
 * `origin`'s `base` fetched into the clone's `origin/<base>` before what it
 * holds is read ({@link holding}): a commit whose change landed on the base
 * under another hash, by another workspace, after this clone last fetched,
 * is matched by its patch only once the clone has that base (core
 * own-commits.ts). Git on this host once its boundary is closed
 * ({@link closedCloneGit}'s checks first), from the URL the cut recorded
 * ({@link CreateRecord}), never one the clone's config names now, with the
 * credential the cut fetched with ({@link hubGitEnv} for the hub's remote).
 * No boundary is started for it. A clone with no such record, or a fetch
 * that fails, is read with the base it has: a stale base only ever keeps
 * more, and the log says why.
 */
const refreshBase = async (
  workspace: WorkspaceRef,
  access: CopyAccess,
  base: string | undefined
): Promise<void> => {
  if (!(base && BRANCH_NAME.test(base))) {
    return;
  }
  const record = await readRecord<CreateRecord>(
    join(workspacesDir(), workspace.id, "create.json")
  ).catch(() => undefined);
  const origin = record?.origin;
  const clone = await lstat(access.at(join(workspace.path, ".git"))).catch(
    () => undefined
  );
  if (
    !(origin && clone?.isDirectory()) ||
    (await noRepositoryAt(access.at(workspace.path)))
  ) {
    return;
  }
  await closedCloneGit(workspace, access);
  const git = gitUntil(
    Date.now() + WORKSPACE_GIT_TIMEOUT_MS,
    isHubRemote(origin) ? hubGitEnv(origin) : hostEnvironment(),
    access
  );
  await git(
    workspace.path,
    "fetch",
    "--quiet",
    "--no-tags",
    "--no-write-fetch-head",
    origin,
    `+refs/heads/${base}:refs/remotes/origin/${base}`
  ).catch((error: Error) =>
    console.warn(
      `[workspace] ${workspace.id}: origin's ${base} was not fetched before its clone was read, so it is read against the ${base} it last fetched: ${error.message}`
    )
  );
};

/** What {@link holding} reads: a {@link WorkspaceHolding} but its size. */
type Held = Omit<WorkspaceHolding, "bytes">;

const NOTHING_HELD: Held = { ahead: 0, dirty: 0, stashes: 0 };

/**
 * What a {@link closedCloneGit} run is given besides its argv. Its
 * destructuring names this type itself: TypeScript 7.1 no longer types a
 * defaulted binding pattern from the return type it stands in (TS7031,
 * microsoft/TypeScript#64431).
 */
interface GitGiven {
  env?: Readonly<Record<string, string>>;
  exits?: readonly number[];
  input?: string;
}

/**
 * `argv` run in a workspace's copy as `access` reaches it, in `cwd` there:
 * its exit, stdout and stderr; `input` on its stdin, `env` over the host's.
 */
const runInCopy = async (
  access: CopyAccess,
  cwd: string,
  argv: readonly string[],
  { env = {}, input }: GitGiven = {}
): Promise<{ exitCode: number; stderr: string; stdout: string }> => {
  const run = access.run(cwd, argv);
  const child = Bun.spawn(run.argv, {
    cwd: run.cwd,
    env: { ...hostEnvironment(), ...env, ...SAFE_GIT_ENV },
    stdin: input === undefined ? "ignore" : Buffer.from(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stderr, stdout };
};

/**
 * git in workspace `workspace`'s copy, as `access` reaches it
 * ({@link accessOf}), once its boundary is closed ({@link closeClone},
 * {@link workspaceAt}): nothing can write the copy meanwhile, so its config
 * cannot change between the look below and the run (safe-git.ts).
 * Refused, nothing run, when its `.git` is no folder of its own (a link is
 * never followed: a delegate can point one at any folder it can name) or
 * when its git directory names another or its config holds a key past the
 * allowlist (`repositoryConfigProblem`). Answers git's stdout, trimmed, for
 * an argv, `input` on its stdin, `env` over the host's; an exit past
 * `exits` throws its stderr.
 */
const closedCloneGit = async (
  workspace: WorkspaceRef,
  access: CopyAccess
): Promise<(args: readonly string[], given?: GitGiven) => Promise<string>> => {
  const dotGit = access.at(join(workspace.path, ".git"));
  const found = await lstat(dotGit);
  if (!found.isDirectory()) {
    throw new Error(
      `Workspace ${workspace.id} was not archived: ${join(workspace.path, ".git")} is ${found.isSymbolicLink() ? "a link" : "no folder"}, which CawCo does not run git through, so nothing was deleted.`
    );
  }
  const problem = await repositoryConfigProblem(dotGit);
  if (problem) {
    throw new Error(
      `Workspace ${workspace.id} was not archived: ${problem}, so nothing was deleted.`
    );
  }
  return async (args, { env = {}, exits = [0], input }: GitGiven = {}) => {
    const ran = await runInCopy(
      access,
      workspace.path,
      ["git", ...SAFE_GIT_FLAGS, "-C", workspace.path, ...args],
      { env, ...(input === undefined ? {} : { input }) }
    );
    if (!exits.includes(ran.exitCode)) {
      throw new Error(
        `git ${args[0]} failed in workspace ${workspace.id}: ${ran.stderr.trim() || `exit ${ran.exitCode}`}`
      );
    }
    return ran.stdout.trim();
  };
};

/**
 * A held clone made to depend on nothing in the repository it was cut from:
 * one cut as a shared clone, before clones had stores of their own, still
 * borrows that repository's objects (`objects/info/alternates`), and a gc
 * there could take them from under its unlanded work. `git repack -a -d`
 * packs every object its refs, reflogs and index reach into its own store,
 * borrowed ones included (no `-l`), then the alternates file goes: what `git
 * clone --dissociate` does (git-clone(1): "this option can be used to stop
 * the borrowing"). Git on this host once its boundary is closed
 * ({@link closedCloneGit}). One that borrows nothing is left as it is.
 */
const ownObjects = async (
  workspace: WorkspaceRef,
  access: CopyAccess
): Promise<void> => {
  const alternates = access.at(
    join(workspace.path, ".git", "objects", "info", "alternates")
  );
  if (!(await lstat(alternates).catch(() => undefined))) {
    return;
  }
  const git = await closedCloneGit(workspace, access);
  await git(["repack", "-a", "-d", "-q"]);
  await rm(alternates, { force: true });
  console.info(
    `[workspace] ${workspace.id}: held, its clone ${workspace.path} holds every object of its own now, borrowing none from the repository it was cut from`
  );
};

type ClosedGit = Awaited<ReturnType<typeof closedCloneGit>>;

const TRAILING_SLASH = /\/$/;

/**
 * The untracked paths in the clone kept out of git by no `.gitignore` the
 * repository tracks ({@link WorkspaceHolding} `excluded`; core
 * workspace-policy.ts `excludedPaths`): each path `git status
 * --ignored=matching` names, the source of its rule read by `git
 * check-ignore -v`.
 */
const excludedIn = async (
  clone: string,
  git: ClosedGit,
  pathspec: readonly string[]
): Promise<string[]> => {
  const ignored = (await git([...IGNORED_STATUS, ...pathspec]))
    .split("\0")
    .filter((entry) => entry.startsWith("!! "))
    .map((entry) => entry.slice("!! ".length));
  if (ignored.length === 0) {
    return [];
  }
  const [tracked, rules] = await Promise.all([
    git(["ls-files", "-z", "--", ":(glob)**/.gitignore"]),
    // Exit 1: none of them ignored, which a path listed a moment ago and
    // gone since can be.
    git(["check-ignore", "-v", "-z", "--stdin"], {
      input: `${ignored.join("\0")}\0`,
      exits: [0, 1],
    }),
  ]);
  return excludedPaths(clone, tracked, rules);
};

/**
 * The rev-list arguments that leave out what `landed` names: commits the hub
 * knows are on the base branch through another workspace's landing
 * ({@link WorkspaceArchive} `landed`), each a full commit id, never an option.
 */
const notLanded = (landed: readonly string[] | undefined): string[] => {
  const shas = landed ?? [];
  const bad = shas.find((sha) => !COMMIT.test(sha));
  if (bad !== undefined) {
    throw new Error(`"${bad}" is not a commit id`);
  }
  return [...shas];
};

/**
 * How many commits the clone holds that are nowhere else (core
 * own-commits.ts: none of `origin`'s refs has them, `landed` does not reach
 * them, and no commit on `origin/<base>` carries the same change), by git on
 * this host once its boundary is closed, as {@link writeCarry} runs it.
 */
const ownCommits = async (
  workspace: WorkspaceRef,
  access: CopyAccess,
  base: string | undefined,
  landed: readonly string[] | undefined
): Promise<number> => {
  const ran = await runInCopy(access, workspace.path, [
    "sh",
    "-c",
    `${SAFE_GIT_SHELL}${ownCommitsShell(base, notLanded(landed))}`,
  ]);
  const count = Number(ran.stdout.trim());
  if (ran.exitCode !== 0 || !Number.isInteger(count)) {
    throw new Error(
      `Workspace ${workspace.id} was not archived: its own commits could not be counted, so nothing was deleted. ${ran.stderr.trim() || `exit ${ran.exitCode}`}`
    );
  }
  return count;
};

/**
 * What the workspace holds that is nowhere else ({@link WorkspaceHolding}),
 * read in its copy once its boundary is closed ({@link closedCloneGit}). A
 * folder's is its change set (layer.ts `changesOf`), each path one change. A
 * repository's: `skip` are paths `git status` passes over, its commits are
 * counted by {@link ownCommits} against `base`, and files a tracked
 * `.gitignore` covers are not read: they go with the copy. The person's own
 * untracked files the copy started with are theirs, never held
 * ({@link ownUntracked}).
 */
const holding = async (
  workspace: WorkspaceRef,
  access: CopyAccess,
  skip: readonly string[],
  base: string | undefined,
  landed: readonly string[] | undefined
): Promise<Held> => {
  if (access.layer.kind === "folder") {
    return {
      ...NOTHING_HELD,
      dirty: (await changesOf(access.layer)).length,
    };
  }
  // A copy already deleted (an archive that died after its removal) holds nothing.
  const there = await lstat(access.at(workspace.path)).catch(() => undefined);
  if (!there) {
    return NOTHING_HELD;
  }
  // No git clone any more: what is there besides what CawCo wrote is
  // counted. A husk has nothing besides, holds nothing, and goes.
  if (await noRepositoryAt(access.at(workspace.path))) {
    return {
      ...NOTHING_HELD,
      strays: (await strayEntries(workspace.path)).length,
    };
  }
  const git = await closedCloneGit(workspace, access);
  const pathspec =
    skip.length > 0
      ? ["--", ".", ...skip.map((path) => `:(exclude,literal)${path}`)]
      : [];
  const lines = (out: string): number => out.split("\n").filter(Boolean).length;
  const [ahead, status, stashes, excluded, own] = await Promise.all([
    ownCommits(workspace, access, base, landed),
    git(["status", "--porcelain", ...pathspec]),
    git(["stash", "list"]),
    excludedIn(workspace.path, git, pathspec),
    ownUntracked(workspace.path, access),
  ]);
  const delegates = excluded.filter(
    (path) => !own.has(path.replace(TRAILING_SLASH, ""))
  );
  return {
    ahead,
    dirty: lines(status),
    stashes: lines(stashes),
    ...(delegates.length > 0 ? { excluded: delegates } : {}),
  };
};

/**
 * Where a clone that holds nothing of its own ({@link holding}) is cut again
 * once it is deleted ({@link WorkspaceCut}): its HEAD, on `origin`'s branch
 * `base` when that holds it, else the one most recently committed to among
 * those that do. Git on this host once its boundary is closed
 * ({@link closedCloneGit}). Nothing for a folder whose `.git` is gone, nor
 * for a HEAD `landed` reaches: its work went on in the workspace cut from it,
 * which landed it, and is cut again from nowhere here. A HEAD no branch of
 * `origin` holds whose every change is on `origin/<base>` under other
 * commits ({@link ownCommits} counted none) is cut again at that base's
 * commit: it holds all of that work. Without a `base` it reads, such a HEAD
 * throws, and nothing is deleted.
 */
const headOnOrigin = async (
  workspace: WorkspaceRef,
  access: CopyAccess,
  base: string | undefined,
  landed: readonly string[] | undefined
): Promise<WorkspaceCut | undefined> => {
  if (
    access.layer.kind !== "repo" ||
    !(await lstat(access.at(join(workspace.path, ".git"))).catch(
      () => undefined
    ))
  ) {
    return;
  }
  const git = await closedCloneGit(workspace, access);
  const commit = await git(["rev-parse", "--verify", "HEAD^{commit}"]);
  const holders = (
    await git([
      "for-each-ref",
      "--sort=-committerdate",
      "--contains",
      commit,
      "--format=%(refname:lstrip=3)",
      "refs/remotes/origin/",
    ])
  )
    .split("\n")
    .filter((name) => name && name !== "HEAD");
  const branch = base && holders.includes(base) ? base : holders[0];
  if (
    !branch &&
    landed?.length &&
    Number(
      await git(["rev-list", "--count", commit, "--not", ...notLanded(landed)])
    ) === 0
  ) {
    return;
  }
  if (branch) {
    return { branch, commit };
  }
  const tip =
    base &&
    (await git(
      ["rev-parse", "-q", "--verify", `refs/remotes/origin/${base}^{commit}`],
      { exits: [0, 1] }
    ));
  if (!(base && tip)) {
    throw new Error(
      `Workspace ${workspace.id} was not archived: its HEAD ${commit.slice(0, 9)} is on no branch of origin, so its clone could not be cut again there, and nothing was deleted.`
    );
  }
  return { branch: base, commit: tip };
};

/**
 * Where a clone whose commits went to a carry is cut again
 * ({@link WorkspaceCut}): the commit on `origin/<base>` its HEAD builds on
 * (`git merge-base`), with the carry's commits fetched on top as it is cut
 * ({@link carryOnto}). Nothing without a base it reads or a commit both
 * share. Git on this host once its boundary is closed ({@link closedCloneGit}).
 */
const carriedFrom = async (
  workspace: WorkspaceRef,
  access: CopyAccess,
  base: string | undefined
): Promise<WorkspaceCut | undefined> => {
  if (!base) {
    return;
  }
  const git = await closedCloneGit(workspace, access);
  // Exit 1: no commit in common; 128: no such base here. Neither is cut again.
  const commit = await git(
    ["merge-base", "HEAD", `refs/remotes/origin/${base}`],
    { exits: [0, 1, 128] }
  );
  return COMMIT.test(commit) ? { branch: base, commit } : undefined;
};

/** A folder's size on disk in bytes (`du -sk`), 0 when it cannot be read. */
const sizeOf = async (path: string): Promise<number> => {
  const du = Bun.spawn(["du", "-sk", path], {
    env: hostEnvironment(),
    stdout: "pipe",
    stderr: "ignore",
  });
  const [out] = await Promise.all([new Response(du.stdout).text(), du.exited]);
  return Number(out.split("\t")[0]) * 1024 || 0;
};

/** Trees a search for a clone's Swift packages passes over: never a package of the clone's own. */
const NOT_PACKAGES = new Set([
  ...PACKAGE_TREES,
  ".git",
  ".build",
  ".swiftpm",
  "DerivedData",
]);

/** The folders of the clone that hold a `Package.swift`, down to `depth` levels. */
const swiftPackages = async (dir: string, depth = 6): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const found = entries.some(
    (entry) => entry.isFile() && entry.name === "Package.swift"
  )
    ? [dir]
    : [];
  if (depth === 0) {
    return found;
  }
  const below = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !NOT_PACKAGES.has(entry.name))
      .map((entry) => swiftPackages(join(dir, entry.name), depth - 1))
  );
  return [...found, ...below.flat()];
};

/**
 * The folders in the workspaces' cache (paths.ts `workspaceCacheDir`) that
 * belong to the clone at `clone` alone, each built from it and read by
 * nothing else:
 * - its Apple build root, `xdg/cawco-apple.noindex/<clone's folder name>`,
 *   where build-both.sh syncs, builds (DerivedData) and logs (~5 GB), and
 *   its lock;
 * - on Linux, the folder its `node_modules` links to,
 *   `modules/<clone's folder name>` (workspace-modules.ts);
 * - on macOS, Xcode's DerivedData folders whose `info.plist` names a project
 *   inside the clone (the boundary's xcodebuild puts every build's in
 *   `DerivedData.noindex/`), and SwiftPM's build dirs for each of the clone's
 *   packages, `swiftpm/build/<md5 of the package dir>` (boundary.ts's swift
 *   shim names them so).
 * Read before the clone goes: its packages are found in it.
 */
const cacheOfClone = async (clone: string): Promise<string[]> => {
  const cache = workspaceCacheDir();
  const apple = join(cache, "xdg", "cawco-apple.noindex");
  const name = basename(clone);
  const owned = [
    join(apple, name),
    join(apple, ".locks", name),
    workspaceModulesRoot(clone),
  ];
  if (process.platform !== "darwin") {
    return owned;
  }
  const derived = join(cache, "DerivedData.noindex");
  const builds = await readdir(derived).catch(() => [] as string[]);
  const ofClone = await Promise.all(
    builds.map(async (build) => {
      const plutil = Bun.spawn(
        [
          "/usr/bin/plutil",
          "-extract",
          "WorkspacePath",
          "raw",
          "-o",
          "-",
          join(derived, build, "info.plist"),
        ],
        { env: hostEnvironment(), stdout: "pipe", stderr: "ignore" }
      );
      const [named] = await Promise.all([
        new Response(plutil.stdout).text(),
        plutil.exited,
      ]);
      const project = named.trim();
      return project.startsWith(`${clone}/`) ? [join(derived, build)] : [];
    })
  );
  const packages = (await swiftPackages(clone)).map((dir) =>
    join(
      cache,
      "swiftpm",
      "build",
      new Bun.CryptoHasher("md5").update(dir).digest("hex")
    )
  );
  return [...owned, ...ofClone.flat(), ...packages];
};

/**
 * Writes what a workspace holds that is nowhere else into a new carry folder
 * in `~/.cawco/carries` (carry.ts), git running on this host once its
 * boundary is closed ({@link closedCloneGit}'s checks first), its excluded
 * files copied as they are into its `excluded/` (carry.ts `copyStrays`),
 * and answers that folder and the excluded entries not copied; `skip`, its
 * items' handed-over outputs, left out of the uncommitted diff. A carry
 * that cannot be written whole, or that holds anything but folders and
 * files of its own, is taken away again and nothing is deleted.
 */
const writeCarry = async (
  workspace: WorkspaceRef,
  access: CopyAccess,
  held: Held,
  skip: readonly string[]
): Promise<{ carry: string; left: string[] }> => {
  await closedCloneGit(workspace, access);
  const carry = carryFolder(workspace.id);
  await mkdir(workspaceCarriesDir(), { recursive: true, mode: 0o700 });
  const ran = await runInCopy(access, workspace.path, [
    "sh",
    "-c",
    `${SAFE_GIT_SHELL}${carrySteps(shellQuote(carry), held, skip, "clone")}`,
  ]);
  try {
    if (ran.exitCode !== 0) {
      throw new Error(ran.stderr.trim() || `exit ${ran.exitCode}`);
    }
    // A folder's entry without its slash: a link named as one is never followed.
    const left = held.excluded?.length
      ? await copyStrays(
          access.at(workspace.path),
          held.excluded.map((path) => path.replace(TRAILING_SLASH, "")),
          join(carry, "excluded")
        )
      : [];
    await ownFilesOnly(carry);
    return { carry, left };
  } catch (error) {
    await rm(carry, { recursive: true, force: true });
    throw new Error(
      `Workspace ${workspace.id} was not archived: its carry could not be written, so nothing was deleted. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
};

/**
 * The carry of workspace `id`'s folder at `path`, which is no git clone: its
 * own entries ({@link strayEntries}) copied into a new carry folder on this
 * host (carry.ts `copyStrays`), and those not copied. One that could not be
 * written whole is taken away again, and nothing is deleted.
 */
const carryStrays = async (
  id: string,
  path: string
): Promise<{ carry: string; left: string[] }> => {
  const carry = carryFolder(id);
  await mkdir(workspaceCarriesDir(), { recursive: true, mode: 0o700 });
  try {
    return {
      carry,
      left: await copyStrays(path, await strayEntries(path), carry),
    };
  } catch (error) {
    await rm(carry, { recursive: true, force: true });
    throw new Error(
      `Workspace ${id} was not archived: its carry could not be written, so nothing was deleted. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
};

/**
 * The carry of a folder workspace's change set (layer.ts `changesOf`): each
 * written path copied as the delegate left it into the carry's `changes/`,
 * at its path in the folder, and each deleted one named in `deleted.txt`.
 * One that could not be written whole is taken away again, and nothing is
 * deleted.
 */
const carryChanged = async (
  id: string,
  layer: Layer
): Promise<{ carry: string; left: string[] }> => {
  const carry = carryFolder(id);
  await mkdir(workspaceCarriesDir(), { recursive: true, mode: 0o700 });
  try {
    const changed = await changesOf(layer);
    const written = changed
      .filter((each) => each.change === "write")
      .map((each) => each.path);
    const from =
      layer.form === "copy"
        ? layer.path
        : (layer.mounts?.[0]?.upper ?? layerDir(id));
    const left = await copyStrays(from, written, join(carry, "changes"));
    await writeFile(
      join(carry, "deleted.txt"),
      changed
        .filter((each) => each.change === "delete")
        .map((each) => `${each.path}\n`)
        .join("")
    );
    return { carry, left };
  } catch (error) {
    await rm(carry, { recursive: true, force: true });
    throw new Error(
      `Workspace ${id} was not archived: its carry could not be written, so nothing was deleted. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
};

/**
 * {@link CONTROL_WORKSPACE_ARCHIVE}: the boundary killed first with
 * everything in it, never started ({@link stopWorkspaceBoundary}); then what
 * the clone holds that is nowhere else is read on this host
 * ({@link holding}, {@link WorkspaceUnlanded}). Anything there keeps the
 * clone, its state and scratch dirs, and answers `held`: nothing is
 * deleted. Holding nothing, the clone is deleted with what it owns in the
 * workspaces' cache ({@link cacheOfClone}), the files a tracked
 * `.gitignore` covers with it;
 * `closeBoundary` takes its state and scratch dirs.
 */
export const archiveWorkspace = (ref: unknown): Promise<WorkspaceArchived> =>
  closeClone(ref as WorkspaceArchive, false);

/**
 * {@link CONTROL_WORKSPACE_DISCARD}: as {@link archiveWorkspace}, but what
 * the clone holds that is nowhere else (its unlanded commits, changes,
 * stashes and excluded files) is written to a carry in `~/.cawco/carries` (carry.ts), git on
 * this host, which must be whole before anything is deleted. A folder that
 * is no git clone any more has its own entries copied there as they are
 * (carry.ts `copyStrays`).
 */
export const discardWorkspace = (ref: unknown): Promise<WorkspaceArchived> =>
  closeClone({ ...(ref as WorkspaceArchive), unlanded: "keep" }, true);

/** How many times {@link endLeftInside} reads and kills: enough for a process forked between a reading and its kill. */
const LEFT_INSIDE_PASSES = 5;

/** How long a SIGKILLed process has to leave the table before {@link endLeftInside} reads it as still running. */
const LEFT_INSIDE_SETTLE_MS = 500;

/** The user's service manager, which adopts what a process of the user's session left (Linux `systemd --user`, macOS `launchd`). */
const SERVICE_MANAGER = /(^|\/)(systemd --user|launchd)( |$)/;

/** A process left running from a clone, and whose it is ({@link whoseLeft}). */
interface LeftInside {
  command: string;
  /** Set for one of someone else's: the live process outside the clone it hangs from. */
  owner?: { command: string; pid: number };
  pid: number;
}

/**
 * Whose each process in `found` is (all of them running from a clone or its
 * scratch dir): CawCo's when it, or a process up its tree, is this agent,
 * its keeper or one of the keeper's children (a session, a boundary); or
 * when the first process up its tree that runs from outside the clone is
 * init or the user's service manager: an orphan whose starter is gone,
 * which nothing of the person's holds (the Mac's 9-day `vite preview`,
 * launchd its parent). Anyone else's (`owner` set) hangs from a live
 * process outside the clone that is none of CawCo's: the person's terminal
 * shell, an editor.
 */
const whoseLeft = async (
  found: readonly { command: string; pid: number }[]
): Promise<LeftInside[]> => {
  const lineage = await processLineage();
  const parent = new Map(lineage.map((one) => [one.pid, one.ppid]));
  const held = (await keeperChildren()).map((child) => child.pid);
  const cawco = new Set([
    process.pid,
    ...held,
    ...held.flatMap((pid) => {
      const keeper = parent.get(pid);
      return keeper === undefined ? [] : [keeper];
    }),
  ]);
  const inside = new Set(found.map((one) => one.pid));
  const upFrom = (pid: number): number[] => {
    const chain: number[] = [];
    for (let at = parent.get(pid); at !== undefined && at > 1;) {
      if (chain.includes(at)) {
        break;
      }
      chain.push(at);
      at = parent.get(at);
    }
    return chain;
  };
  return await Promise.all(
    found.map(async (one): Promise<LeftInside> => {
      const chain = upFrom(one.pid);
      if (cawco.has(one.pid) || chain.some((pid) => cawco.has(pid))) {
        return one;
      }
      const outside = chain.find((pid) => !inside.has(pid));
      if (outside === undefined) {
        return one;
      }
      const command = (await commandLine(outside)) ?? "";
      return SERVICE_MANAGER.test(command)
        ? one
        : { ...one, owner: { pid: outside, command } };
    })
  );
};

/** Processes in words: `pid 12 (vite preview)`, each command cut short. */
const processWords = (left: readonly LeftInside[]): string =>
  left.map((one) => `pid ${one.pid} (${one.command.slice(0, 200)})`).join("; ");

/**
 * Every process left running from workspace `workspace`'s clone or scratch
 * dir once its boundary is stopped (live-processes.ts `processesWithin`: its
 * working directory or executable there, or its command line naming a path
 * there) that is CawCo's ({@link whoseLeft}), SIGKILLed, reading again
 * after each round. The boundary's own stop ends what runs inside it, each
 * process it started by name on macOS (boundary.ts `killAnswering`); a
 * process that left it before its profile carried that name, or that a
 * session's host shell left, is ended here. On the Mac on 2026-10-24 a
 * `vite preview` from workspace bcaa39e4's clone, its parent launchd,
 * still held port 55978 nine days after that workspace was archived and its
 * folder gone. One of the person's own (their shell or editor there) is
 * never ended: the archive throws naming it and what it hangs from, nothing
 * is deleted, and the next sweep tries again. So does one of CawCo's still
 * there after the rounds.
 */
/**
 * A Linux view's processes, every process in its namespace, ended whole
 * (layer.ts `endView`): its path is the person's folder, whose own processes
 * are never the workspace's. Answers whether `workspace` is such a view.
 */
const endViewProcesses = async (workspace: WorkspaceRef): Promise<boolean> => {
  const layer = await readLayer(workspace.id).catch(() => undefined);
  if (layer?.form !== "overlay") {
    return false;
  }
  const stayed = await endView(workspace.id);
  if (stayed.length > 0) {
    throw new Error(
      `Workspace ${workspace.id} was not archived: pid ${stayed.join(", ")} of its view still ${stayed.length === 1 ? "runs" : "run"} after SIGKILL, so nothing was deleted.`
    );
  }
  return true;
};

const endLeftInside = async (workspace: WorkspaceRef): Promise<void> => {
  const overlay = await endViewProcesses(workspace);
  const roots = [
    ...(overlay ? [] : [workspace.path]),
    workspaceScratchDir(workspace.id),
    workspaceTmpDir(workspace.id),
  ];
  const read = async () =>
    await whoseLeft(
      (await processesWithin(roots)).filter((one) => one.pid !== process.pid)
    );
  const killed = new Map<number, string>();
  for (let pass = 0; pass < LEFT_INSIDE_PASSES; pass += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each round reads the process table the round before left
    const fresh = (await read()).filter(
      (one) => !(one.owner || killed.has(one.pid))
    );
    if (fresh.length === 0) {
      break;
    }
    for (const one of fresh) {
      signalPid(listedPid(one.pid), "SIGKILL");
      killed.set(one.pid, one.command);
    }
    await Bun.sleep(LEFT_INSIDE_SETTLE_MS);
  }
  if (killed.size > 0) {
    console.info(
      `[workspace] ${workspace.id}: ended ${killed.size} process(es) left running from its clone or scratch dir once its boundary was stopped: ${[...killed].map(([pid, command]) => `pid ${pid} (${command.slice(0, 200)})`).join("; ")}`
    );
  }
  const left = await read();
  const owned = left.filter((one) => one.owner);
  if (owned.length > 0) {
    throw new Error(
      `Workspace ${workspace.id} was not archived: ${owned.map((one) => `pid ${one.pid} (${one.command.slice(0, 200)}), under pid ${one.owner?.pid} (${one.owner?.command.slice(0, 200)})`).join("; ")} ${owned.length === 1 ? "runs" : "run"} from its clone or scratch dir, started from outside CawCo, so ${owned.length === 1 ? "it is" : "they are"} left running and nothing was deleted; the archive is tried again at the next sweep.`
    );
  }
  if (left.length > 0) {
    throw new Error(
      `Workspace ${workspace.id} was not archived: ${processWords(left)} still ${left.length === 1 ? "runs" : "run"} from its clone or scratch dir after SIGKILL, so nothing was deleted.`
    );
  }
};

/**
 * What a clone being archived holds that is nowhere else ({@link holding}),
 * written to a new carry before anything is deleted ({@link writeCarry}; a
 * folder that is no git clone has its own entries copied, {@link
 * carryStrays}), with its README; and where a git clone's HEAD built on its
 * base ({@link carriedFrom}), for a cut again that restores the carry.
 */
const carryAway = async (
  workspace: WorkspaceRef,
  access: CopyAccess,
  request: WorkspaceArchive,
  held: Held,
  skip: readonly string[]
): Promise<{ carry: string; head: WorkspaceCut | undefined }> => {
  const words = holdingWords({ ...held, bytes: 0 });
  // A folder's carry is its change set; `strays` is read only in a copy that
  // is no git clone any more: no git writes either, their entries are copied.
  const folder = access.layer.kind === "folder" || held.strays !== undefined;
  let written: { carry: string; left: string[] };
  if (access.layer.kind === "folder") {
    written = await carryChanged(request.id, access.layer);
  } else if (held.strays === undefined) {
    written = await writeCarry(workspace, access, held, skip);
  } else {
    written = await carryStrays(request.id, workspace.path);
  }
  const { carry, left } = written;
  const head = folder
    ? undefined
    : await carriedFrom(workspace, access, request.base);
  await writeFile(
    join(carry, "README.md"),
    await carryReadme({
      title: `Workspace ${request.id}, saved before it was archived`,
      checkout: folder ? "folder" : "clone",
      path: workspace.path,
      words,
      folder: carry,
      left,
    })
  );
  console.info(
    `[workspace] ${request.id}: ${words} in ${workspace.path} saved to the carry ${carry}`
  );
  return { carry, head };
};

/**
 * A copy that holds work and is kept: one cut before clones had stores of
 * their own takes what it borrows into its own ({@link ownObjects}), and
 * what it holds is answered with its size on disk (a Linux view's: its
 * upper and work dirs).
 */
const keepHeld = async (
  workspace: WorkspaceRef,
  access: CopyAccess,
  held: Held
): Promise<WorkspaceHolding> => {
  if (access.layer.kind === "repo" && held.strays === undefined) {
    await ownObjects(workspace, access);
  }
  const kept: WorkspaceHolding = {
    ...held,
    bytes: await sizeOf(
      access.layer.form === "overlay" ? layerDir(workspace.id) : workspace.path
    ),
  };
  console.info(
    `[workspace] ${workspace.id}: not archived: its copy ${workspace.path} holds ${holdingWords(kept)}; its boundary is closed and nothing was deleted`
  );
  return kept;
};

const closeClone = async (
  request: WorkspaceArchive,
  carryHeld: boolean
): Promise<WorkspaceArchived> => {
  // Read unless it names a copy with nothing of anyone's own: a request
  // naming no mode is a `keep`.
  const unread: WorkspaceUnlanded[] = ["check", "unmade"];
  const read = !unread.includes(request.unlanded);
  const path = request.path ?? (await createdPath(request.id));
  const forget = async () => {
    await Promise.all(
      [join(workspacesDir(), request.id), workspaceScratchDir(request.id)].map(
        removeTree
      )
    );
    forgetWorkspaceTmp(request.id);
  };
  if (!path) {
    await forget();
    return { carry: null };
  }
  const workspace: WorkspaceRef = { id: request.id, path };
  const skip = request.skip ?? [];
  // Nothing writes the copy from here on: its boundary and every process of
  // its view end, and what reads it below runs in it alone.
  await stopWorkspaceBoundary(workspace);
  await endLeftInside(workspace);
  const access = await accessOf(workspace);
  if (!access) {
    // No layer there (a create cut short before it made one): nothing of the
    // folder is the workspace's.
    await closeBoundary(workspace);
    await forget();
    console.info(
      `[workspace] ${request.id}: archived; it had no copy at ${path}, and its state and scratch dir are gone`
    );
    return { carry: null };
  }
  if (read && access.layer.kind === "repo") {
    await refreshBase(workspace, access, request.base);
  }
  const held = read
    ? await holding(workspace, access, skip, request.base, request.landed)
    : NOTHING_HELD;
  const holds = !holdsNothing({ ...held, bytes: 0 });
  if (holds && !carryHeld) {
    return { carry: null, held: await keepHeld(workspace, access, held) };
  }
  // Read before the copy goes: where it is made again, and what it carries.
  const { carry, head } = holds
    ? await carryAway(workspace, access, request, held, skip)
    : {
        carry: null,
        head:
          read && held.strays === undefined
            ? await headOnOrigin(
                workspace,
                access,
                request.base,
                request.landed
              )
            : undefined,
      };
  const cached = access.layer.form === "copy" ? await cacheOfClone(path) : [];
  await removeLayer(request.id, access.layer);
  await closeBoundary(workspace);
  await Promise.all(cached.map(removeTree));
  console.info(
    `[workspace] ${request.id}: archived; its ${goneFolder(access.layer, held.strays)}, state, scratch dir and ${cached.length} cache folders of its own are gone${head ? `; it is made again at ${head.commit.slice(0, 9)} on origin's ${head.branch}${carry ? ", its carry's commits on top" : ""}` : ""}`
  );
  return head ? { carry, head } : { carry };
};

/**
 * What an archive deleted, in its log line: a Linux view's own dirs, a copy,
 * or a copy that was no git clone any more (`strays` read): a husk when none
 * of its entries was anyone's (stand-ins.ts `straysIn`).
 */
const goneFolder = (layer: Layer, strays: number | undefined): string => {
  if (layer.form === "overlay") {
    return `view of ${layer.folder} (its upper and work dirs; the folder untouched)`;
  }
  if (strays === undefined) {
    return `copy ${layer.path}`;
  }
  return strays === 0
    ? `husk ${layer.path} (a deleted clone holding only what CawCo wrote there)`
    : `folder ${layer.path} (a deleted clone, its own entries saved to the carry)`;
};

/** A folder workspace's layer, or the refusal for one that lands by git or has none. */
const folderLayer = async (workspace: WorkspaceRef): Promise<Layer> => {
  const layer = await layerOf(workspace.id, workspace.path);
  if (!layer) {
    throw new Error(
      `workspace ${workspace.id} has no copy at ${workspace.path} to land`
    );
  }
  if (layer.kind !== "folder") {
    throw new Error(
      `workspace ${workspace.id} holds a repository, which lands by git, not by its change set`
    );
  }
  return layer;
};

/**
 * {@link CONTROL_WORKSPACE_CHANGES}: a folder workspace's change set and its
 * conflicts with the folder as it is now (layer.ts `readChanges`).
 */
export const workspaceChanges = async (
  ref: unknown
): Promise<WorkspaceChanges> =>
  await readChanges(
    (ref as WorkspaceRef).id,
    await folderLayer(ref as WorkspaceRef)
  );

/**
 * {@link CONTROL_WORKSPACE_APPLY}: a folder workspace's change set landed in
 * its folder by this agent, outside every wall (layer.ts `applyChanges`:
 * the conflict scan first, then each path whole). Its boundary and its
 * session run on, as a repository's do while the hub pushes its commits:
 * the item has finished, and its delegate waits on this landing's answer.
 */
export const workspaceApply = async (
  ref: unknown
): Promise<{ applied: number; conflicts: WorkspaceConflict[] }> => {
  const workspace = ref as WorkspaceRef;
  const layer = await folderLayer(workspace);
  const result = await applyChanges(workspace.id, layer);
  console.info(
    result.conflicts.length > 0
      ? `[workspace] ${workspace.id}: its change set was not landed in ${layer.folder}: ${result.conflicts.length} path(s) changed there too since it started (${result.conflicts.map((each) => each.path).join(", ")})`
      : `[workspace] ${workspace.id}: its change set of ${result.applied} path(s) landed in ${layer.folder}`
  );
  return result;
};
