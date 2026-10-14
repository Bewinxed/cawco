/**
 * A delegation workspace's checkout, on the machine that holds it. The hub
 * owns the workspace record; the machine cuts the clone (`./clone`) and
 * starts its boundary once, keeps the boundary running while the workspace's
 * sessions can be continued, and deletes it all on archive.
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
  rename,
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
  WorkspaceHolding,
  WorkspaceRef,
  WorkspaceUnlanded,
} from "@cawco/core";
import {
  holdingWords,
  holdsNothing,
  WORKSPACE_GIT_TIMEOUT_MS,
} from "@cawco/core";
import {
  isSecretFileName,
  workspaceCacheDir,
  workspaceCarriesDir,
  workspaceScratchDir,
  workspacesDir,
} from "@cawco/core/paths";
import {
  repositoryConfigProblem,
  SAFE_GIT_ENV,
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
  addAccount,
  closeBoundary,
  ensureBoundary,
  shellQuote,
} from "./boundary";
import { prepareClone } from "./clone";
import { expandHome } from "./fs";
import { useHubCredentialHelper } from "./git-credential";
import {
  hubGitEnv,
  hubRepo,
  isHubRemote,
  LFS_FILTERS,
  withoutCredential,
} from "./move";
import { runWorkflowCommand } from "./workflow-command";
import { workspaceHolding } from "./workspace-records";

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
    const child = Bun.spawn(safeGitArgv(args), {
      cwd: root,
      env: { ...env, ...SAFE_GIT_ENV },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: remaining,
      killSignal: "SIGKILL",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) {
      throw new Error(
        child.signalCode === "SIGKILL"
          ? late
          : `git ${args[0]} failed: ${withoutCredential(stderr.trim())}`
      );
    }
    return stdout.trim();
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

/** Each repository's {@link hubBase} in flight: the last of its queue. */
const basing = new Map<string, Promise<unknown>>();

/**
 * {@link hubBase}, one at a time per repository. Workspaces cut at once from
 * a project the hub has no default branch for yet (a routine's runs, a
 * group of delegates) would each push its branch as the hub's first, and
 * every push after the first is refused ("reference already exists"); queued,
 * the later ones find the branch the first pushed.
 */
const hubBaseOnce = (git: Git, repo: string): Promise<string> => {
  const mine = (basing.get(repo) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => hubBase(git, repo));
  basing.set(repo, mine);
  const forget = () => {
    if (basing.get(repo) === mine) {
      basing.delete(repo);
    }
  };
  mine.then(forget, forget);
  return mine;
};

/**
 * {@link CONTROL_WORKSPACE_CREATE}: a shared clone on `ws/<id8>` from the
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
 * over (`boundaryFor`).
 */
export const createWorkspace = async (
  cwd: unknown,
  workspaceId: unknown,
  projectId?: unknown,
  account?: unknown
): Promise<WorkspaceCheckout> => {
  const dir = expandHome(String(cwd));
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
  // the other workspace's to write.
  const source = await workspaceHolding(repoRoot);
  const problem = source
    ? await repositoryConfigProblem(join(source.path, ".git"))
    : undefined;
  if (problem) {
    throw new Error(`${repoRoot} cannot have a workspace: ${problem}`);
  }
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
  const hub = isHubRemote(origin);
  if (hub && !source) {
    useHubCredentialHelper(repoRoot);
  }
  const authed = hub ? gitUntil(deadline, hubGitEnv()) : plain;
  const known = hub ? await hubBaseOnce(authed, repoRoot) : undefined;
  const id = String(workspaceId);
  const id8 = id.slice(0, 8);
  const path = expandHome(`~/.worktrees/${basename(repoRoot)}-${id8}`);
  const branch = `ws/${id8}`;
  const state = join(workspacesDir(), id);
  try {
    await mkdir(state, { recursive: true });
    // Written before the clone: archive-by-id survives a lost reply or an agent restart.
    await writeStateFile(join(state, "create.json"), JSON.stringify({ path }));
    const base = await prepareClone(repoRoot, path, authed, known);
    // A hub branch's large files come down with the checkout, from the
    // hub's LFS, whatever filters this machine's own config names.
    const checkout =
      hub && (await marksLfs(authed, path, `origin/${base}`))
        ? gitUntil(deadline, hubGitEnv(LFS_FILTERS))
        : authed;
    await checkout(path, "checkout", "--quiet", "-b", branch, `origin/${base}`);
    await copyOwnSecrets(repoRoot, path, plain);
    if (typeof account === "string" && account) {
      await addAccount(id, account);
    }
    const boundary = await ensureBoundary({ id, path });
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
 * The source checkout's own secret files (`SECRET_FILE_NAME`: `.env`,
 * `apps/web/.env.local`), copied into the new clone at the same paths with
 * the same modes. git ignores them, so a clone has none, and the boundary
 * withholds every one outside the workspace's own clone: a workspace runs
 * its repository with that repository's keys, and reads no other's. One in
 * a package or build tree is not the repository's own.
 */
const copyOwnSecrets = async (
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

/**
 * Trees that hold packages and builds: their secret-named files are not the
 * repository's own, and a place's first commit (place-repo.ts) takes none.
 */
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
 * {@link CONTROL_WORKSPACE_AT}: a check workspace at another workspace's
 * commit. The bundle is written into its scratch dir as a new file (never
 * through one already there), then inside its boundary git fetches its base
 * and the bundle and checks the commit out, detached, with every untracked
 * file gone.
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
    await git(
      `git checkout --quiet --force --detach ${head} && git clean -ffdq`
    );
  } finally {
    await rm(path, { force: true });
  }
  console.info(
    `[workspace] ${workspace.id}: at ${head.slice(0, 9)}, the commit of workspace ${String(source)}, for the checks it names this machine for`
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
 * What the workspace holds that is nowhere else ({@link CONTROL_WORKSPACE_LANDED}),
 * read by git inside its boundary; `skip` are paths `git status` passes over.
 */
const holding = async (
  workspace: WorkspaceRef,
  skip: readonly string[]
): Promise<Omit<WorkspaceHolding, "bytes">> => {
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
    return { ahead: 0, dirty: 0, stashes: 0 };
  }
  const git = insideGit(workspace);
  const excluded = skip
    .map((path) => shellQuote(`:(exclude,literal)${path}`))
    .join(" ");
  const lines = (out: string): number => out.split("\n").filter(Boolean).length;
  const [ahead, status, stashes] = await Promise.all([
    git("git rev-list --count HEAD --branches --not --remotes"),
    git(
      excluded
        ? `git status --porcelain -- . ${excluded}`
        : "git status --porcelain"
    ),
    git("git stash list"),
  ]);
  return {
    ahead: Number(ahead),
    dirty: lines(status),
    stashes: lines(stashes),
  };
};

/** A folder's size on disk in bytes (`du -sk`), 0 when it cannot be read. */
const sizeOf = async (path: string): Promise<number> => {
  const du = Bun.spawn(["du", "-sk", path], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const [out] = await Promise.all([new Response(du.stdout).text(), du.exited]);
  return Number(out.split("\t")[0]) * 1024 || 0;
};

/** {@link CONTROL_WORKSPACE_LANDED}: what the workspace holds that is nowhere else, and its clone's size. */
export const workspaceLanded = async (
  ref: unknown,
  skip: unknown
): Promise<WorkspaceHolding> => {
  const workspace = ref as WorkspaceRef;
  const [held, bytes] = await Promise.all([
    holding(workspace, Array.isArray(skip) ? skip.map(String) : []),
    sizeOf(workspace.path),
  ]);
  return { ...held, bytes };
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
 * - its Apple build root, `xdg/cawco-apple/<clone's folder name>`, where
 *   build-both.sh syncs, builds (DerivedData) and logs (~5 GB), and its lock;
 * - on macOS, Xcode's DerivedData folders whose `info.plist` names a project
 *   inside the clone (the boundary's xcodebuild puts every build's in
 *   `DerivedData/`), and SwiftPM's build dirs for each of the clone's
 *   packages, `swiftpm/build/<md5 of the package dir>` (boundary.ts's swift
 *   shim names them so).
 * Read before the clone goes: its packages are found in it.
 */
const cacheOfClone = async (clone: string): Promise<string[]> => {
  const cache = workspaceCacheDir();
  const apple = join(cache, "xdg", "cawco-apple");
  const name = basename(clone);
  const owned = [join(apple, name), join(apple, ".locks", name)];
  if (process.platform !== "darwin") {
    return owned;
  }
  const derived = join(cache, "DerivedData");
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
        { stdout: "pipe", stderr: "ignore" }
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

/** A carry's folder: every entry in it a folder or a regular file of one link, else it is not the carry's own. */
const ownFilesOnly = async (dir: string): Promise<void> => {
  const info = await lstat(dir);
  if (!info.isDirectory()) {
    throw new Error(`${dir} is not a folder of the carry's own`);
  }
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry);
    // biome-ignore lint/performance/noAwaitInLoops: a carry holds a handful of files
    const one = await lstat(path);
    if (one.isDirectory()) {
      await ownFilesOnly(path);
    } else if (!one.isFile() || one.nlink !== 1) {
      throw new Error(`${path} is not a file of the carry's own`);
    }
  }
};

/** A file the carry's git wrote, trimmed; empty when it wrote none. */
const carried = (dir: string, name: string): Promise<string> =>
  readFile(join(dir, name), "utf8").then(
    (text) => text.trim(),
    () => ""
  );

/**
 * Writes what a workspace holds that is nowhere else into a folder in its
 * scratch dir, git running inside its boundary, and answers that folder's
 * name there. In it, each only when there is something to put there:
 * - `commits.bundle`: every commit on HEAD or a local branch that no
 *   remote-tracking ref has, with those refs (`git fetch`);
 * - `commits/`: HEAD's among them as a patch series (`git am`);
 * - `uncommitted.patch`: every changed, deleted and untracked file against
 *   HEAD (`git apply`), read through a copy of the index so the clone's own
 *   is untouched; `skip`, its items' handed-over outputs, left out;
 * - `stashes/<n>.patch`: each stash entry with its untracked files;
 * - `head` and `branch`: the commit and branch the clone was on.
 */
const writeCarryInside = async (
  workspace: WorkspaceRef,
  held: Omit<WorkspaceHolding, "bytes">,
  skip: readonly string[]
): Promise<string> => {
  const name = `.cawco-carry-${crypto.randomUUID()}`;
  const excluded = skip
    .map((path) => shellQuote(`:(exclude,literal)${path}`))
    .join(" ");
  const steps = [
    "set -e",
    `d="$TMPDIR"/${name}`,
    'mkdir "$d"',
    'git rev-parse HEAD > "$d"/head',
    'git symbolic-ref -q --short HEAD > "$d"/branch || true',
  ];
  if (held.ahead > 0) {
    steps.push(
      'git bundle create --quiet "$d"/commits.bundle HEAD --branches --not --remotes',
      'git format-patch --quiet --binary -o "$d"/commits HEAD --not --remotes'
    );
  }
  if (held.dirty > 0) {
    steps.push(
      'cp "$(git rev-parse --git-path index)" "$d"/index',
      `GIT_INDEX_FILE="$d"/index git add -A -- . ${excluded}`,
      'GIT_INDEX_FILE="$d"/index git diff --cached --binary HEAD > "$d"/uncommitted.patch',
      'rm "$d"/index'
    );
  }
  if (held.stashes > 0) {
    steps.push(
      'mkdir "$d"/stashes',
      'n=0; while git rev-parse -q --verify "stash@{$n}" > /dev/null; do git stash show --include-untracked -p --binary "stash@{$n}" > "$d"/stashes/$n.patch; n=$((n + 1)); done'
    );
  }
  try {
    await insideGit(workspace)(steps.join("\n"));
  } catch (error) {
    throw new Error(
      `Workspace ${workspace.id} was not archived: its carry could not be written, so nothing was deleted. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  return name;
};

/** How a carry's README names what it holds and how each part is taken back. */
const carryReadme = async (
  workspace: WorkspaceRef,
  words: string,
  folder: string
): Promise<string> => {
  const [head, branch] = await Promise.all([
    carried(folder, "head"),
    carried(folder, "branch"),
  ]);
  const has = (name: string): Promise<boolean> =>
    stat(join(folder, name)).then(
      () => true,
      () => false
    );
  const [bundle, commits, uncommitted, stashes] = await Promise.all(
    ["commits.bundle", "commits", "uncommitted.patch", "stashes"].map(has)
  );
  return [
    `# Workspace ${workspace.id}, saved before it was archived`,
    "",
    `Its clone ${workspace.path} held ${words} when a person archived it anyway, on ${new Date().toISOString()}, on ${branch || "no branch"} at ${head || "an unread commit"}. This folder is that work; the clone is gone.`,
    "",
    bundle &&
      `- \`commits.bundle\`: every commit on HEAD or a local branch that no remote had. In a clone of the repository: \`git fetch ${folder}/commits.bundle 'refs/heads/*:refs/heads/carry/*'\`.`,
    commits &&
      `- \`commits/\`: the commits on HEAD among them, as patches: \`git am ${folder}/commits/*.patch\`.`,
    uncommitted &&
      `- \`uncommitted.patch\`: every changed, deleted and untracked file against ${head || "HEAD"}: \`git apply ${folder}/uncommitted.patch\` at that commit.`,
    stashes &&
      "- `stashes/<n>.patch`: stash entry n, untracked files included: `git apply`.",
    "",
  ]
    .filter((line): line is string => line !== false)
    .join("\n");
};

/**
 * {@link CONTROL_WORKSPACE_ARCHIVE}: the boundary killed with everything in
 * it, then the clone deleted with what it owns in the workspaces' cache
 * ({@link cacheOfClone}); `closeBoundary` takes its state and scratch dirs.
 * First, its boundary still up, what it holds that is nowhere else is read
 * again ({@link WorkspaceUnlanded}): with `keep` anything there refuses the
 * archive and nothing goes; with `carry` it is written to a carry in
 * `~/.cawco/carries`, which must be whole before anything is deleted.
 */
export const archiveWorkspace = async (
  ref: unknown
): Promise<WorkspaceArchived> => {
  const request = ref as WorkspaceArchive;
  // Read unless it names a clone with nothing of anyone's own; kept unless
  // a person chose to carry it: a request naming neither is a `keep`.
  const unread: WorkspaceUnlanded[] = ["check", "unmade"];
  const read = !unread.includes(request.unlanded);
  const path = request.path ?? (await createdPath(request.id));
  if (!path) {
    await Promise.all(
      [join(workspacesDir(), request.id), workspaceScratchDir(request.id)].map(
        (dir) => rm(dir, { recursive: true, force: true })
      )
    );
    return { carry: null };
  }
  const workspace: WorkspaceRef = { id: request.id, path };
  const skip = request.skip ?? [];
  const held = read
    ? await holding(workspace, skip)
    : { ahead: 0, dirty: 0, stashes: 0 };
  const words = holdingWords({ ...held, bytes: 0 });
  if (!holdsNothing({ ...held, bytes: 0 }) && request.unlanded !== "carry") {
    throw new Error(
      `Workspace ${request.id} was not archived: its clone ${path} holds ${words}, and nothing was deleted.`
    );
  }
  let carry: string | null = null;
  let inScratch: string | undefined;
  if (!holdsNothing({ ...held, bytes: 0 })) {
    inScratch = join(
      (await ensureBoundary(workspace)).scratch,
      await writeCarryInside(workspace, held, skip)
    );
  }
  const cached = await cacheOfClone(path);
  if (inScratch) {
    // Out of the scratch dir before the boundary takes it with it; checked
    // once no process of the workspace is left to write into it.
    carry = join(
      workspaceCarriesDir(),
      `${request.id}-${new Date().toISOString().replaceAll(":", "")}`
    );
    await mkdir(workspaceCarriesDir(), { recursive: true, mode: 0o700 });
    await rename(inScratch, carry);
  }
  await closeBoundary(workspace);
  if (carry) {
    try {
      await ownFilesOnly(carry);
    } catch (error) {
      await rm(carry, { recursive: true, force: true });
      throw new Error(
        `Workspace ${request.id} was not archived: ${error instanceof Error ? error.message : String(error)}, so its carry was dropped and its clone ${path} was not deleted.`,
        { cause: error }
      );
    }
    await writeFile(
      join(carry, "README.md"),
      await carryReadme(workspace, words, carry)
    );
    console.info(
      `[workspace] ${request.id}: ${words} in ${path} saved to the carry ${carry}`
    );
  }
  await rm(workspace.path, { recursive: true, force: true });
  await Promise.all(
    cached.map((dir) => rm(dir, { recursive: true, force: true }))
  );
  console.info(
    `[workspace] ${request.id}: archived; its clone ${path}, state, scratch dir and ${cached.length} cache folders of its own are gone`
  );
  return { carry };
};
