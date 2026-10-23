/**
 * A delegation workspace's checkout, on the machine that holds it. The hub
 * owns the workspace record; the machine cuts the clone (`./clone`), runs its
 * boundary while something holds it (a session attached, a live work item, a
 * preview, a command: boundary.ts `liveWhy`) and starts it again on its next
 * command once a quiet one has closed, and deletes it all on archive.
 */
import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  CommandResult,
  WorkspaceArchive,
  WorkspaceArchived,
  WorkspaceCheckout,
  WorkspaceCommit,
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
import {
  forgetWorkspaceTmp,
  isSecretFileName,
  workspaceCacheDir,
  workspaceCarriesDir,
  workspaceScratchDir,
  workspacesDir,
} from "@cawco/core/paths";
import {
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  SAFE_GIT_FLAGS,
  SAFE_GIT_SHELL,
  safeGitArgv,
} from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import {
  isDamagedRecord,
  readRecord,
  writeStateFile,
} from "@cawco/core/state-file";
import {
  excludedPaths,
  IGNORED_STATUS,
  isPlace,
} from "@cawco/core/workspace-policy";
import {
  addAccount,
  closeBoundary,
  ensureBoundary,
  heldBy,
  ownInodes,
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
import { hostGit, prepareClone } from "./clone";
import { placedAsMade } from "./fleet";
import { expandHome } from "./fs";
import { useHubCredentialHelper } from "./git-credential";
import {
  declaredLfs,
  hostSigns,
  noteRefused,
  undeclaredEndpoint,
} from "./host-lfs";
import {
  createdAt,
  cutMade,
  cutMark,
  entriesAt,
  entryWords,
  markCut,
  ownCutProblem,
} from "./interrupted-cut";
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
import { noRepositoryAt, straysIn } from "./stand-ins";
import {
  ownConfigChanges,
  ownConfigWords,
  runWorkflowCommand,
} from "./workflow-command";
import { refuseShortOfWorkspace } from "./workspace-needs";
import { cloneHolding } from "./workspace-records";

type Git = (root: string, ...args: string[]) => Promise<string>;

/**
 * git on this host as `safe-git.ts` says, its stdout trimmed, within the
 * create's one `deadline`; `env` in place of the host's (the hub's
 * credential, env-only). git's stderr, credential taken out, is the error.
 */
export const gitUntil =
  (deadline: number, env: Record<string, string> = hostEnvironment()): Git =>
  async (root, ...args) => {
    const late = `workspace git exceeded ${WORKSPACE_GIT_TIMEOUT_MS / 1000}s`;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(late);
    }
    const ran = await readWithin(remaining, async (signal) => {
      const child = Bun.spawn(safeGitArgv(args), {
        cwd: root,
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
 * Readies source repository `repoRoot` for a workspace cut from it, inside
 * {@link inSource}: its `origin` (the hub's remote of `projectId` when it has
 * none), the hub's credential helper in its config when that is the hub and
 * `source` (another workspace's clone, whose config is that workspace's) is
 * none, and the branch the workspace starts from ({@link hubBase}). `hub` is
 * that origin's URL when it is the hub's, which every git that reaches it
 * runs under ({@link hubGitEnv}), git-lfs held to the project's `declared`
 * endpoint when it has one.
 */
const readySource = (
  repoRoot: string,
  projectId: unknown,
  fromClone: boolean,
  deadline: number,
  declared: DeclaredLfs | undefined
): Promise<{ hub: string | undefined; known: string | undefined }> =>
  inSource(repoRoot, deadline, async () => {
    const plain = gitUntil(deadline);
    // A workspace starts from origin's default branch and lands there.
    let origin = await plain(repoRoot, "remote", "get-url", "origin").catch(
      () => undefined
    );
    if (!origin) {
      if (typeof projectId !== "string" || !projectId) {
        throw new Error(
          `${repoRoot} has no origin remote and belongs to no project, so it has no hub remote to cut a workspace from. Delegate from a session in a project, or add a remote with \`git remote add origin <url>\`, and delegate again.`
        );
      }
      origin = hubRepo(projectId);
      await plain(repoRoot, "remote", "add", "origin", origin);
      console.info(
        `[workspace] ${repoRoot} had no origin: the hub's remote of project ${projectId} is its origin now`
      );
    }
    // A clone of a workspace's clone reaches the hub as that workspace does.
    const hub = isHubRemote(origin) ? origin : undefined;
    if (hub && !fromClone) {
      useHubCredentialHelper(repoRoot);
    }
    const known = hub
      ? await hubBase(
          gitUntil(deadline, hubGitEnv(hub, [], declared)),
          repoRoot
        )
      : undefined;
    return { hub, known };
  });

/** This agent's start-up pass over the cuts its last process left under way ({@link clearInterruptedCuts}): every cut waits for it. */
let interruptedCleared: Promise<void> = Promise.resolve();

/**
 * At this agent's start, before any cut: each cut its last process left
 * marked under way (interrupted-cut.ts `cut.json`; an install's restart, a
 * crash or a full disk ended it) whose path holds nothing but what that cut
 * writes ({@link ownCutProblem}) is cleared as a failed cut is (an `unmade`
 * archive: the path, the state and scratch dirs), so its husk never waits
 * for the next ask; the hub, told the create was not run again
 * (request-record.ts), cuts it whole at the next. One whose path holds
 * anything else is left as it is and said, and its next cut is refused
 * naming what is there.
 */
export const clearInterruptedCuts = (): Promise<void> => {
  interruptedCleared = sweepInterrupted();
  return interruptedCleared;
};

/** {@link clearInterruptedCuts}'s pass; never throws. */
const sweepInterrupted = async (): Promise<void> => {
  try {
    const ids = await readdir(workspacesDir()).catch(() => [] as string[]);
    for (const id of ids) {
      // biome-ignore lint/performance/noAwaitInLoops: one workspace at a time, each its own folder to read and clear
      await clearInterrupted(id);
    }
  } catch (error) {
    console.warn(
      `[workspace] the cuts this agent's last process left under way could not all be looked at: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/** Workspace `id`'s cut, when its mark says this agent's last process left it under way: cleared when its path holds only what it writes. */
const clearInterrupted = async (id: string): Promise<void> => {
  let mark: Awaited<ReturnType<typeof cutMark>>;
  try {
    mark = await cutMark(id);
  } catch (error) {
    console.warn(
      `[workspace] ${id}: its cut mark could not be read, so its cut is left as it is: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }
  if (!mark) {
    return;
  }
  const there = await lstat(mark.path).catch(() => undefined);
  const problem = there ? await ownCutProblem(mark) : undefined;
  if (problem) {
    console.warn(
      `[workspace] ${id}: its cut at ${mark.path} was cut short when this agent's last process ended, and is left as it is: ${problem}`
    );
    return;
  }
  await archiveWorkspace({
    id,
    path: mark.path,
    unlanded: "unmade",
  } satisfies WorkspaceArchive);
  console.info(
    `[workspace] ${id}: its cut at ${mark.path}, cut short when this agent's last process ended, is cleared; its next cut is made whole`
  );
};

/** Whether {@link clearUnmarkedHusks}' one pass has begun. */
let unmarkedSwept = false;

/**
 * Once per agent, at the hub's first answer to a beat that names its live
 * workspaces (`liveWorkspaces`, so they are known, boundary.ts `heldBy`):
 * each clone a cut of a build before the cut mark (bada22d43) left behind, `create.json` naming its path and no
 * `cut.json`, cleared as a failed cut is (an `unmade` archive), when all of
 * these hold: its path is where a delegate's cut goes
 * (`~/.worktrees/<repo>-<id8>`, never a stage clone's); its HEAD is not on
 * `ws/<id8>`, the branch every whole cut checks out last, so it never got
 * that far; nothing holds it (no live work item, boundary, session process
 * or command: `heldBy`); and it holds nothing that is not on its remote
 * ({@link ownCutProblem} with its own `origin` as the source and a first
 * cut's start: no commit on a branch or stash past origin, and beside `.git`
 * only files of `origin/HEAD` as checkout writes them, or CawCo's). Such a
 * husk links the source's object files (git-clone(1) `--local`), and the
 * source's place denied each one: 4,342 of them stopped cockpit's Caw on
 * 2026-10-23. Anything else is kept, and said with why. Never throws.
 */
export const clearUnmarkedHusks = (liveWorkspaces: unknown): void => {
  // Only once the hub's answer names the live workspaces (`heldBy`).
  if (Array.isArray(liveWorkspaces) && !unmarkedSwept) {
    unmarkedSwept = true;
    sweepUnmarked();
  }
};

/** {@link clearUnmarkedHusks}' pass; never throws. */
const sweepUnmarked = async (): Promise<void> => {
  try {
    await interruptedCleared;
    const ids = await readdir(workspacesDir()).catch(() => [] as string[]);
    for (const id of ids) {
      // biome-ignore lint/performance/noAwaitInLoops: one workspace at a time, each its own folder to read and clear
      await clearUnmarked(id);
    }
  } catch (error) {
    console.warn(
      `[workspace] the clones that cuts of an earlier build left behind could not all be looked at: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/** Workspace `id`'s clone, when a cut of a build before the mark left it ({@link clearUnmarkedHusks}). */
const clearUnmarked = async (id: string): Promise<void> => {
  if (isPlace(id) || (await cutMark(id).catch(() => undefined))) {
    return;
  }
  const path = await createdAt(id);
  const id8 = id.slice(0, 8);
  const name = path ? basename(path) : "";
  if (
    !path ||
    dirname(path) !== expandHome("~/.worktrees") ||
    !name.endsWith(`-${id8}`) ||
    name.endsWith(`-stage-${id8}`) ||
    !(await lstat(path).catch(() => undefined))?.isDirectory()
  ) {
    return;
  }
  const head = await hostGit(path, ["symbolic-ref", "-q", "HEAD"]).catch(
    () => undefined
  );
  if (head?.exitCode === 0 && head.text().trim() === `refs/heads/ws/${id8}`) {
    return;
  }
  const keep = (why: string): void =>
    console.warn(
      `[workspace] ${id}: ${path} was left by a cut of an earlier build, and is kept: ${why}`
    );
  const held = await heldBy({ id, path });
  if (held) {
    keep(held);
    return;
  }
  const origin = await hostGit(path, [
    "config",
    "--get",
    "remote.origin.url",
  ]).catch(() => undefined);
  const source = origin?.exitCode === 0 ? origin.text().trim() : "";
  if (!source) {
    keep("its .git names no origin to hold its work");
    return;
  }
  const problem = await ownCutProblem({ path, source, at: null });
  if (problem) {
    keep(problem);
    return;
  }
  await archiveWorkspace({
    id,
    path,
    unlanded: "unmade",
  } satisfies WorkspaceArchive);
  console.info(
    `[workspace] ${id}: ${path}, left by a cut of an earlier build and holding nothing that is not on its remote, is cleared`
  );
};

/** What the folder at `path` holds, in words. */
const heldAt = async (path: string): Promise<string> => {
  try {
    const names = await entriesAt(path);
    return names.length > 0 ? entryWords(names) : "nothing";
  } catch {
    return "what cannot be read";
  }
};

/**
 * Something already at `path`, where workspace `id`'s cut (again, `at`)
 * makes its clone. A cut that fails takes its path with it unread (its
 * `unmade` archive), so a cut over someone's files would delete them
 * (9a220f37b's refusal). Cleared and cut again only when this agent's
 * records say a cut of this workspace's was made there (its mark, or the
 * `create.json` every cut writes first, all a build before the mark wrote)
 * and the folder holds nothing but what that cut writes
 * ({@link ownCutProblem}): one cut short, or one whole whose answer never
 * reached the hub. Anything else refuses the cut, naming what is there and
 * how to clear it, and is left as it is.
 */
const clearOwnCut = async (
  id: string,
  path: string,
  source: string,
  at: WorkspaceCut | null
): Promise<void> => {
  if (!(await lstat(path).catch(() => undefined))) {
    return;
  }
  const again = at ? " again" : "";
  const mark = await cutMark(id).catch(() => undefined);
  const refusal =
    mark?.path === path || (await createdAt(id)) === path
      ? await ownCutProblem(mark?.path === path ? mark : { path, source, at })
      : `this machine's agent has no record of cutting workspace ${id} there, and it holds ${await heldAt(path)}`;
  if (refusal) {
    throw new Error(
      `workspace ${id} cannot be cut${again} at ${path}: ${refusal}, so it is left as it is. Move it away or delete it (rm -rf ${shellQuote(path)}), then ask again.`
    );
  }
  await archiveWorkspace({
    id,
    path,
    unlanded: "unmade",
  } satisfies WorkspaceArchive);
  console.info(
    `[workspace] ${id}: ${path} held only its own cut${again}, never finished; it is cleared and cut${again} now`
  );
};

/**
 * {@link CONTROL_WORKSPACE_CREATE}: a clone of its own on `ws/<id8>` from the
 * remote's default branch as it stands now, and its boundary. A boundary that
 * cannot start takes the clone with it. A repository with no `origin` gets
 * the hub's remote of `projectId` as its `origin` (Projects spec §5.1: "A
 * project with no outside remote gets the hub as its remote"), and a
 * repository whose `origin` is the hub reaches it with this machine's
 * credential, env-only; the owner's own pulls and pushes there go through
 * `cawco git-credential`, named in its config. `account` is the Claude
 * account the workspace's first session launches on, placed by the hub
 * before the clone is cut: the boundary starts reading that account's user
 * layer, so the session's spawn finds its form unchanged and hands nothing
 * over (`boundaryFor`). `at` ({@link WorkspaceCut}) cuts a retired workspace
 * again at its own path (a function of its id): `ws/<id8>` at the commit its
 * clone's HEAD was on when it retired, fetched from `origin`'s branch that
 * held it then, tracking the default branch as a first cut does. A commit
 * that branch no longer holds refuses it, since a cut anywhere else would
 * leave it behind. Something already at the path refuses any cut, and is
 * left as it is, unless it is this workspace's own cut cut short
 * ({@link clearOwnCut}). The cut is marked under way before it writes
 * anything at the path, and unmarked once it is whole (interrupted-cut.ts).
 */
export const createWorkspace = async (
  cwd: unknown,
  workspaceId: unknown,
  projectId?: unknown,
  account?: unknown,
  at?: unknown
): Promise<WorkspaceCheckout> => {
  // What this machine lacks first, before the folder is read at all.
  refuseShortOfWorkspace();
  // A MachinePath from the hub (work-items `openWorkspace`): absolute.
  const dir = String(cwd);
  const deadline = Date.now() + WORKSPACE_GIT_TIMEOUT_MS;
  const plain = gitUntil(deadline);
  const repoRoot = await plain(dir, "rev-parse", "--show-toplevel").catch(
    (error: Error) => {
      throw new Error(
        `${dir} is not in a git repository, so it cannot have a workspace: ${error.message}`,
        { cause: error }
      );
    }
  );
  // A workspace cut from another workspace's clone: that clone's config is
  // the other workspace's to write. A place is a person's own repo,
  // whose config is theirs.
  const source = await cloneHolding(repoRoot);
  const problem = source
    ? await repositoryConfigProblem(join(source.path, ".git"))
    : undefined;
  if (problem) {
    throw new Error(`${repoRoot} cannot have a workspace: ${problem}`);
  }
  const declared = await declaredLfs(projectId);
  const { hub, known } = await readySource(
    repoRoot,
    projectId,
    Boolean(source),
    deadline,
    declared
  );
  const authed = hub ? gitUntil(deadline, hubGitEnv(hub)) : plain;
  const id = String(workspaceId);
  const id8 = id.slice(0, 8);
  const path = expandHome(`~/.worktrees/${basename(repoRoot)}-${id8}`);
  const branch = `ws/${id8}`;
  const state = join(workspacesDir(), id);
  const cut = (at ?? undefined) as WorkspaceCut | undefined;
  if (cut && !COMMIT.test(cut.commit)) {
    throw new Error(`"${cut.commit}" is not a commit id`);
  }
  await interruptedCleared;
  await clearOwnCut(id, path, repoRoot, cut ?? null);
  try {
    await mkdir(state, { recursive: true });
    // Before anything at the path: a cut this agent's end cuts short is
    // found its own and cleared, at its start or the next cut.
    await markCut(id, { path, source: repoRoot, at: cut ?? null });
    // Written before the clone: archive-by-id survives a lost reply or an agent restart.
    await writeStateFile(join(state, "create.json"), JSON.stringify({ path }));
    const base = await prepareClone(repoRoot, path, authed, known);
    // git linked the source's object files into the clone (`--local`); each
    // gets its own inode now, before the long fetch and checkout, so a cut
    // cut short there (an agent's restart) leaves nothing linked to the
    // source, whose place's boundary would deny every linked file.
    if (process.platform === "linux") {
      await ownInodes(path);
    }
    if (cut) {
      await fetchCut(path, id, base, cut, authed);
    }
    const start = cut ? cut.commit : `origin/${base}`;
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
    await checkout(path, "checkout", "--quiet", "-b", branch, start);
    if (cut) {
      await plain(
        path,
        "branch",
        "--quiet",
        `--set-upstream-to=origin/${base}`,
        branch
      );
    }
    await copyOwnSecrets(repoRoot, path, plain);
    if (typeof account === "string" && account) {
      await addAccount(id, account);
    }
    if (typeof projectId === "string" && projectId) {
      await setProject(id, projectId);
    }
    const boundary = await ensureBoundary({ id, path });
    await cutMade(id);
    return {
      repoRoot,
      path,
      branch,
      base,
      boundaryPid: boundary.pid,
      tmp: workspaceScratchDir(id),
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
    const result: CommandResult = await runWorkflowCommand(
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
 * project config (workflow-command.ts `ownConfigChanges`) is never checked
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
    const host = await closedCloneGit(workspace);
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
      await readRecord<{ path?: string }>(
        join(workspacesDir(), id, "create.json")
      )
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

/** What {@link holding} reads: a {@link WorkspaceHolding} but its size. */
type Held = Omit<WorkspaceHolding, "bytes">;

const NOTHING_HELD: Held = { ahead: 0, dirty: 0, stashes: 0 };

/**
 * git on this host in workspace `workspace`'s clone, once its boundary is
 * closed ({@link closeClone}, {@link workspaceAt}): nothing can write the
 * clone meanwhile, so its config cannot change between the look below and
 * the run (safe-git.ts).
 * Refused, nothing run, when its `.git` is no folder of its own (a link is
 * never followed: a delegate can point one at any folder it can name) or
 * when its git directory names another or its config holds a key past the
 * allowlist (`repositoryConfigProblem`). Answers git's stdout, trimmed, for
 * an argv, `input` on its stdin, `env` over the host's; an exit past
 * `exits` throws its stderr.
 */
const closedCloneGit = async (
  workspace: WorkspaceRef
): Promise<
  (
    args: readonly string[],
    given?: {
      env?: Readonly<Record<string, string>>;
      exits?: readonly number[];
      input?: string;
    }
  ) => Promise<string>
> => {
  const dotGit = join(workspace.path, ".git");
  const found = await lstat(dotGit);
  if (!found.isDirectory()) {
    throw new Error(
      `Workspace ${workspace.id} was not archived: ${dotGit} is ${found.isSymbolicLink() ? "a link" : "no folder"}, which CawCo does not run git through, so nothing was deleted.`
    );
  }
  const problem = await repositoryConfigProblem(dotGit);
  if (problem) {
    throw new Error(
      `Workspace ${workspace.id} was not archived: ${problem}, so nothing was deleted.`
    );
  }
  return async (args, { env = {}, exits = [0], input } = {}) => {
    const command =
      input === undefined
        ? Bun.$`git ${SAFE_GIT_FLAGS} -C ${workspace.path} ${args}`
        : Bun.$`git ${SAFE_GIT_FLAGS} -C ${workspace.path} ${args} < ${Buffer.from(input)}`;
    const ran = await command
      .env({ ...hostEnvironment(), ...env, ...SAFE_GIT_ENV })
      .quiet()
      .nothrow();
    if (!exits.includes(ran.exitCode)) {
      throw new Error(
        `git ${args[0]} failed in workspace ${workspace.id}: ${ran.stderr.toString().trim() || `exit ${ran.exitCode}`}`
      );
    }
    return ran.text().trim();
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
const ownObjects = async (workspace: WorkspaceRef): Promise<void> => {
  const alternates = join(
    workspace.path,
    ".git",
    "objects",
    "info",
    "alternates"
  );
  if (!(await lstat(alternates).catch(() => undefined))) {
    return;
  }
  const git = await closedCloneGit(workspace);
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
 * What the workspace holds that is nowhere else ({@link WorkspaceHolding}),
 * read by git on this host once its boundary is closed
 * ({@link closedCloneGit}); `skip` are paths `git status` passes over, and
 * the commits `landed` reaches are not its own (their work is on the base
 * branch through the workspace cut from it that landed them). Files a
 * tracked `.gitignore` covers are not read: they go with the clone.
 */
const holding = async (
  workspace: WorkspaceRef,
  skip: readonly string[],
  landed: readonly string[] | undefined
): Promise<Held> => {
  // A clone already deleted (an archive that died after its `rm`) holds nothing.
  const gone = await stat(workspace.path).then(
    () => false,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return true;
      }
      throw error;
    }
  );
  if (gone) {
    return NOTHING_HELD;
  }
  // No git clone any more: what is there besides what CawCo wrote is
  // counted. A husk has nothing besides, holds nothing, and goes.
  if (await noRepositoryAt(workspace.path)) {
    return {
      ...NOTHING_HELD,
      strays: (await strayEntries(workspace.path)).length,
    };
  }
  const git = await closedCloneGit(workspace);
  const pathspec =
    skip.length > 0
      ? ["--", ".", ...skip.map((path) => `:(exclude,literal)${path}`)]
      : [];
  const lines = (out: string): number => out.split("\n").filter(Boolean).length;
  const [ahead, status, stashes, excluded] = await Promise.all([
    git([
      "rev-list",
      "--count",
      "HEAD",
      "--branches",
      "--not",
      "--remotes=origin",
      ...notLanded(landed),
    ]),
    git(["status", "--porcelain", ...pathspec]),
    git(["stash", "list"]),
    excludedIn(workspace.path, git, pathspec),
  ]);
  return {
    ahead: Number(ahead),
    dirty: lines(status),
    stashes: lines(stashes),
    ...(excluded.length > 0 ? { excluded } : {}),
  };
};

/**
 * Where a clone that holds nothing of its own ({@link holding}) is cut again
 * once it is deleted ({@link WorkspaceCut}): its HEAD, on `origin`'s branch
 * `base` when that holds it, else the one most recently committed to among
 * those that do. Git on this host once its boundary is closed
 * ({@link closedCloneGit}). Nothing for a folder whose `.git` is gone, nor
 * for a HEAD `landed` reaches: its work went on in the workspace cut from it,
 * which landed it, and is cut again from nowhere here. Any other HEAD no
 * branch of `origin` holds throws, and nothing is deleted: such a clone
 * holds commits of its own, and {@link holding} said none.
 */
const headOnOrigin = async (
  workspace: WorkspaceRef,
  base: string | undefined,
  landed: readonly string[] | undefined
): Promise<WorkspaceCut | undefined> => {
  if (!(await lstat(join(workspace.path, ".git")).catch(() => undefined))) {
    return;
  }
  const git = await closedCloneGit(workspace);
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
  if (!branch) {
    throw new Error(
      `Workspace ${workspace.id} was not archived: its HEAD ${commit.slice(0, 9)} is on no branch of origin, so its clone could not be cut again there, and nothing was deleted.`
    );
  }
  return { branch, commit };
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
  const owned = [join(apple, name), join(apple, ".locks", name)];
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
  held: Held,
  skip: readonly string[]
): Promise<{ carry: string; left: string[] }> => {
  await closedCloneGit(workspace);
  const carry = carryFolder(workspace.id);
  await mkdir(workspaceCarriesDir(), { recursive: true, mode: 0o700 });
  const ran =
    await Bun.$`sh -c ${`${SAFE_GIT_SHELL}${carrySteps(shellQuote(carry), held, skip, "clone")}`}`
      .cwd(workspace.path)
      .env({ ...hostEnvironment(), ...SAFE_GIT_ENV })
      .quiet()
      .nothrow();
  try {
    if (ran.exitCode !== 0) {
      throw new Error(ran.stderr.toString().trim() || `exit ${ran.exitCode}`);
    }
    // A folder's entry without its slash: a link named as one is never followed.
    const left = held.excluded?.length
      ? await copyStrays(
          workspace.path,
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

const closeClone = async (
  request: WorkspaceArchive,
  carryHeld: boolean
): Promise<WorkspaceArchived> => {
  // Read unless it names a clone with nothing of anyone's own: a request
  // naming no mode is a `keep`.
  const unread: WorkspaceUnlanded[] = ["check", "unmade"];
  const read = !unread.includes(request.unlanded);
  const path = request.path ?? (await createdPath(request.id));
  if (!path) {
    await Promise.all(
      [join(workspacesDir(), request.id), workspaceScratchDir(request.id)].map(
        (dir) => rm(dir, { recursive: true, force: true })
      )
    );
    forgetWorkspaceTmp(request.id);
    return { carry: null };
  }
  const workspace: WorkspaceRef = { id: request.id, path };
  const skip = request.skip ?? [];
  // Nothing writes the clone from here on, and no boundary is started to
  // read it: git reads it on this host.
  await stopWorkspaceBoundary(workspace);
  const held = read
    ? await holding(workspace, skip, request.landed)
    : NOTHING_HELD;
  const holds = !holdsNothing({ ...held, bytes: 0 });
  if (holds && !carryHeld) {
    if (held.strays === undefined) {
      await ownObjects(workspace);
    }
    const kept: WorkspaceHolding = { ...held, bytes: await sizeOf(path) };
    console.info(
      `[workspace] ${request.id}: not archived: its clone ${path} holds ${holdingWords(kept)}; its boundary is closed and nothing was deleted`
    );
    return { carry: null, held: kept };
  }
  // Read before the clone goes: where it is cut again.
  const head =
    read && !holds && held.strays === undefined
      ? await headOnOrigin(workspace, request.base, request.landed)
      : undefined;
  let carry: string | null = null;
  if (holds) {
    const words = holdingWords({ ...held, bytes: 0 });
    // `strays` is read only in a folder that is no git clone: no git writes
    // its carry; its own entries are copied.
    const folder = held.strays !== undefined;
    let left: string[] = [];
    ({ carry, left } = folder
      ? await carryStrays(request.id, path)
      : await writeCarry(workspace, held, skip));
    await writeFile(
      join(carry, "README.md"),
      await carryReadme({
        title: `Workspace ${request.id}, saved before it was archived`,
        checkout: folder ? "folder" : "clone",
        path,
        words,
        folder: carry,
        left,
      })
    );
    console.info(
      `[workspace] ${request.id}: ${words} in ${path} saved to the carry ${carry}`
    );
  }
  const cached = await cacheOfClone(path);
  await closeBoundary(workspace);
  await rm(workspace.path, { recursive: true, force: true });
  await Promise.all(
    cached.map((dir) => rm(dir, { recursive: true, force: true }))
  );
  console.info(
    `[workspace] ${request.id}: archived; its ${goneFolder(path, held.strays)}, state, scratch dir and ${cached.length} cache folders of its own are gone${head ? `; it is cut again at ${head.commit.slice(0, 9)} on origin's ${head.branch}` : ""}`
  );
  return head ? { carry, head } : { carry };
};

/**
 * What an archive deleted, in its log line: a clone, or a folder that was no
 * git clone any more (`strays` read): a husk when none of its entries was
 * anyone's (stand-ins.ts `straysIn`).
 */
const goneFolder = (path: string, strays: number | undefined): string => {
  if (strays === undefined) {
    return `clone ${path}`;
  }
  return strays === 0
    ? `husk ${path} (a deleted clone holding only what CawCo wrote there)`
    : `folder ${path} (a deleted clone, its own entries saved to the carry)`;
};
