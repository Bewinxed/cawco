/**
 * A delegation workspace's checkout, on the machine that holds it. The hub
 * owns the workspace record; the machine cuts the clone (`./clone`) and
 * starts its boundary once, keeps the boundary running while the workspace's
 * sessions can be continued, and deletes it all on archive.
 */
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { WorkspaceCheckout, WorkspaceRef } from "@cawco/core";
import { WORKSPACE_GIT_TIMEOUT_MS } from "@cawco/core";
import { isSecretFileName } from "@cawco/core/paths";
import { repositoryConfigProblem, SAFE_GIT } from "@cawco/core/safe-git";
import {
  closeBoundary,
  ensureBoundary,
  shellQuote,
  workspacesDir,
} from "./boundary";
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
