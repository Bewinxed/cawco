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
import { isSecretFileName, workspacesDir } from "@cawco/core/paths";
import {
  repositoryConfigProblem,
  SAFE_GIT,
  SAFE_GIT_SHELL,
} from "@cawco/core/safe-git";
import { closeBoundary, ensureBoundary, shellQuote } from "./boundary";
import { prepareClone } from "./clone";
import { expandHome } from "./fs";
import { runWorkflowCommand } from "./workflow-command";
import { workspaceHolding } from "./workspace-records";

/**
 * {@link CONTROL_WORKSPACE_CREATE}: a shared clone on `ws/<id8>` from the
 * remote's default branch as it stands now, and its boundary. A boundary that
 * cannot start takes the clone with it.
 */
export const createWorkspace = async (
  cwd: unknown,
  workspaceId: unknown
): Promise<WorkspaceCheckout> => {
  const dir = expandHome(String(cwd));
  const deadline = Date.now() + WORKSPACE_GIT_TIMEOUT_MS;
  const git = async (root: string, ...args: string[]): Promise<string> => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(
        `workspace git exceeded ${WORKSPACE_GIT_TIMEOUT_MS / 1000}s`
      );
    }
    const result = await runWorkflowCommand(
      root,
      `${SAFE_GIT} ${args.map(shellQuote).join(" ")}`,
      remaining
    );
    if (result.exitCode !== 0) {
      throw new Error(
        result.exitCode === 124
          ? `workspace git exceeded ${WORKSPACE_GIT_TIMEOUT_MS / 1000}s`
          : `git ${args[0]} failed: ${result.stderr.trim()}`
      );
    }
    return result.stdout.trim();
  };
  const repoRoot = await git(dir, "rev-parse", "--show-toplevel").catch(
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
  const id = String(workspaceId);
  const id8 = id.slice(0, 8);
  const path = expandHome(`~/.worktrees/${basename(repoRoot)}-${id8}`);
  const branch = `ws/${id8}`;
  const state = join(workspacesDir(), id);
  try {
    await mkdir(state, { recursive: true });
    // Written before the clone: archive-by-id survives a lost reply or an agent restart.
    await writeFile(join(state, "create.json"), JSON.stringify({ path }));
    const base = await prepareClone(repoRoot, path, git);
    await git(path, "checkout", "--quiet", "-b", branch, `origin/${base}`);
    await copyOwnSecrets(repoRoot, path, git);
    const boundary = await ensureBoundary({ id, path });
    return { repoRoot, path, branch, base, boundaryPid: boundary.pid };
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
    await rm(join(workspacesDir(), request.id), {
      recursive: true,
      force: true,
    });
    return;
  }
  const workspace: WorkspaceRef = { id: request.id, path };
  await closeBoundary(workspace);
  await rm(workspace.path, { recursive: true, force: true });
};
