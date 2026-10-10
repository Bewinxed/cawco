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
  mkdir,
  open,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  CommandResult,
  WorkspaceCheckout,
  WorkspaceCommit,
  WorkspaceRef,
} from "@cawco/core";
import { WORKSPACE_GIT_TIMEOUT_MS } from "@cawco/core";
import {
  isSecretFileName,
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
const gitUntil =
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
  const known = hub ? await hubBase(authed, repoRoot) : undefined;
  const id = String(workspaceId);
  const id8 = id.slice(0, 8);
  const path = expandHome(`~/.worktrees/${basename(repoRoot)}-${id8}`);
  const branch = `ws/${id8}`;
  const state = join(workspacesDir(), id);
  try {
    await mkdir(state, { recursive: true });
    // Written before the clone: archive-by-id survives a lost reply or an agent restart.
    await writeFile(join(state, "create.json"), JSON.stringify({ path }));
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
    await archiveWorkspace({ id, path });
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

/** Trees that hold packages and builds, whose secret-named files are not the repository's own. */
const PACKAGE_TREES = new Set([
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
      await writeFile(path, Buffer.from(bundle, "base64"), {
        flag: "wx",
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

/** {@link CONTROL_WORKSPACE_ARCHIVE}: the boundary killed with everything in it, then the clone deleted. */
export const archiveWorkspace = async (ref: unknown): Promise<void> => {
  const request = ref as { id: string; path?: string };
  const saved = request.path
    ? undefined
    : await readFile(
        join(workspacesDir(), request.id, "create.json"),
        "utf8"
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return;
        }
        throw error;
      });
  const path =
    request.path ??
    (saved ? (JSON.parse(saved) as { path: string }).path : undefined);
  if (!path) {
    await Promise.all(
      [join(workspacesDir(), request.id), workspaceScratchDir(request.id)].map(
        (dir) => rm(dir, { recursive: true, force: true })
      )
    );
    return;
  }
  const workspace: WorkspaceRef = { id: request.id, path };
  await closeBoundary(workspace);
  await rm(workspace.path, { recursive: true, force: true });
};
