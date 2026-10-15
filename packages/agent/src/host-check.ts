/**
 * A host check's checkout, on the machine the check runs on (core
 * `CONTROL_HOST_CHECKOUT`). A check its parent marked `host` runs outside
 * every boundary, as this agent's user, in a fresh clone of the item's
 * commit under `~/.cawco/host-checks/<run>`: what no workspace may do (user
 * namespaces, podman, a probe whose scratch fleet cuts workspaces) runs
 * there. It executes the delegate's committed code unsandboxed, as running
 * it by hand would; the owner chose that ("Parent-declared host checks",
 * 2026-10-16), and only a parent's declaration makes a check one.
 *
 * Each checkout lives for one check run: the hub removes it when the run
 * ends, and every one goes when the hub's connection does (the hub runs its
 * checks again from the first when it is back, workflow-command.ts
 * `abandonCommands`) and when this agent starts.
 */
import { mkdir, readdir, rm, statfs } from "node:fs/promises";
import { join } from "node:path";
import {
  HOST_CHECK_MIN_FREE_ENV,
  HOST_CHECK_MIN_FREE_GB,
  WORKSPACE_GIT_TIMEOUT_MS,
} from "@cawco/core";
import { hostChecksDir } from "@cawco/core/paths";
import { repositoryConfigProblem } from "@cawco/core/safe-git";
import { isWorkspaceRef } from "./workflow-command";
import { gitUntil } from "./workspace";

/** A check run's id, as the hub mints it: a UUID. */
const RUN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COMMIT = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const WHOLE = /^\d+$/;

/** A run's checkout folder, refused for anything but a run id. */
const checkoutOf = (run: unknown): string => {
  if (typeof run !== "string" || !RUN.test(run)) {
    throw new Error(`"${String(run)}" is not a check run's id`);
  }
  return join(hostChecksDir(), run);
};

/**
 * Why a host check must not start for want of disk space where its checkout
 * goes, in disk-room.sh's terms (the heavy-run gate, scripts/lib): at least
 * {@link HOST_CHECK_MIN_FREE_ENV} GB free, {@link HOST_CHECK_MIN_FREE_GB}
 * unless set. A checkout takes a clone and a dependency install, and what
 * it runs (a scratch fleet, a build) writes more. Nothing when it may.
 */
const roomProblem = async (dir: string): Promise<string | undefined> => {
  const raw = process.env[HOST_CHECK_MIN_FREE_ENV] ?? "";
  if (raw !== "" && !WHOLE.test(raw)) {
    return `${HOST_CHECK_MIN_FREE_ENV} is the free space in GB a heavy run needs to start, a whole number; on this machine it is "${raw}"`;
  }
  const min = raw === "" ? HOST_CHECK_MIN_FREE_GB : Number(raw);
  const { bavail, bsize } = await statfs(dir);
  const free = bavail * bsize;
  return free >= min * 1e9
    ? undefined
    : `${dir} has ${(free / 1e9).toFixed(1)} GB free, under the ${min} GB a heavy run needs to start (${HOST_CHECK_MIN_FREE_ENV}), so no checkout was made`;
};

/**
 * {@link CONTROL_HOST_CHECKOUT}: `source`'s `head` in a fresh clone of its
 * own, checked out detached, its git config git's default. Git runs as
 * `safe-git.ts` says, and not at all from a source whose own config holds a
 * key past the allowlist (clone.ts `hostGit`'s rule). A clone of a local
 * repository takes every object it has, so a commit its check workspace
 * holds detached is there too. Refused before anything is written when the
 * disk has too little room ({@link roomProblem}).
 */
export const hostCheckout = async (
  source: unknown,
  head: unknown,
  run: unknown
): Promise<string> => {
  const path = checkoutOf(run);
  if (!isWorkspaceRef(source)) {
    throw new Error("a host checkout's source must be { id, path }");
  }
  const from = source;
  if (typeof head !== "string" || !COMMIT.test(head)) {
    throw new Error(`"${String(head)}" is not a commit id`);
  }
  const root = hostChecksDir();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const room = await roomProblem(root);
  if (room) {
    throw new Error(room);
  }
  const config = await repositoryConfigProblem(join(from.path, ".git"));
  if (config) {
    throw new Error(`git did not run in ${from.path}: ${config}`);
  }
  const git = gitUntil(Date.now() + WORKSPACE_GIT_TIMEOUT_MS);
  try {
    await git(root, "clone", "--quiet", "--no-checkout", from.path, path);
    await git(path, "checkout", "--quiet", "--detach", head);
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
  console.info(
    `[host-check] ${String(run)}: ${head.slice(0, 9)} of workspace ${from.id} checked out at ${path}, outside every boundary`
  );
  return path;
};

/** {@link CONTROL_HOST_CHECKOUT_REMOVE}: a run's checkout gone, with its dependencies and all it wrote. */
export const removeHostCheckout = async (run: unknown): Promise<void> => {
  await rm(checkoutOf(run), { recursive: true, force: true });
};

/**
 * Every host checkout gone: those of check runs that ended with the hub's
 * connection, or before this agent started. Answers how many.
 */
export const abandonHostCheckouts = async (): Promise<number> => {
  const root = hostChecksDir();
  const runs = (await readdir(root).catch(() => [] as string[])).filter(
    (name) => RUN.test(name)
  );
  await Promise.all(
    runs.map((name) => rm(join(root, name), { recursive: true, force: true }))
  );
  if (runs.length > 0) {
    console.info(
      `[host-check] removed ${runs.length} checkout(s) of check runs that ended with the hub's connection or the agent`
    );
  }
  return runs.length;
};
