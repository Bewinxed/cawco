/**
 * The agent's part in a Linux clone's deny stand-ins. The boundary's srt host
 * makes each clone-side deny path a clone lacks (`cloneDenies` in
 * workspace-policy.ts) a real, valid, empty one before every sandbox
 * (`standIn` in boundary-host.ts), so srt binds it onto itself and leaves no
 * mount point of its own on the host, where a host harness would read it as
 * broken config (OpenCode: ENOTDIR on `.opencode/opencode.json`). This module
 * handles what a sandbox start does not reach:
 *
 * - A running sandbox started before the stand-ins holds srt's own mount
 *   points, empty read-only files, for its whole life. At the agent's start
 *   each one that is a file's stand-in is written in place, its inode kept,
 *   so the sandbox's bind on it, and its deny, stay ({@link rewriteLeftFiles}).
 *   One where a dir stands in cannot become a dir without an unlink, which
 *   would drop that deny: its boundary is replaced once nothing runs in it
 *   ({@link hasLeftDirs}, `restartStubbed` in boundary.ts), and the new host
 *   makes the dir.
 * - When the workspace closes, each stand-in still exactly as it was made goes
 *   once no mount namespace holds it ({@link removeStandIns}).
 * - The clone's `info/exclude` lists each stand-in that is CawCo's, and only
 *   those ({@link listStandIns}).
 *
 * A path git tracks is the project's own and is never touched.
 */
import type { Stats } from "node:fs";
import {
  chmod,
  lstat,
  readdir,
  readFile,
  realpath,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { relative } from "node:path";
import type { WorkspaceRef } from "@cawco/core";
import { mountedAnywhere } from "@cawco/core/mount-table";
import { projectClaudeDir } from "@cawco/core/paths";
import { type CloneDeny, cloneDenies } from "@cawco/core/workspace-policy";
import { excludedStandIns, excludeStandIns, gitIn } from "./checkout-exclude";

/**
 * A mount point a sandbox left on the host, by srt's own test
 * (`isStaleBwrapMountPoint`, linux-sandbox-utils.ts at 0.0.79), as the host
 * tests it (`leftMountPoint`): an empty regular file with no write bits and
 * one link, as bwrap makes it.
 */
const leftMountPoint = (found: Stats): boolean =>
  found.isFile() &&
  found.size === 0 &&
  // biome-ignore lint/suspicious/noBitwiseOperators: a file mode's write bits, tested as srt tests them
  (found.mode & 0o222) === 0 &&
  found.nlink === 1;

const statOf = (path: string): Promise<Stats | undefined> =>
  lstat(path).catch(() => undefined);

interface Found extends CloneDeny {
  readonly found: Stats;
}

interface Untracked extends CloneDeny {
  readonly found?: Stats;
}

/** The clone's deny paths with a stand-in that are there now and git does not track. */
const presentIn = async (path: string): Promise<Found[]> =>
  (await untrackedIn(path)).entries.filter(
    (one): one is Found => one.found !== undefined
  );

/** The clone's real path, and its deny paths with a stand-in that git does not track, each with what is there now. */
const untrackedIn = async (
  path: string
): Promise<{ readonly clone: string; readonly entries: Untracked[] }> => {
  const clone = await realpath(path);
  const denies = cloneDenies(clone).filter(
    ({ empty }) => empty.kind !== "none"
  );
  const listed = await gitIn(clone, [
    "ls-files",
    "-z",
    "--",
    ...denies.map((deny) => relative(clone, deny.path)),
  ]);
  if (listed === undefined) {
    throw new Error(`${clone}: git could not say which deny paths it tracks`);
  }
  const tracked = listed
    .split("\0")
    .filter(Boolean)
    .map((file) => `${clone}/${file}`);
  const entries = await Promise.all(
    denies
      .filter(
        (deny) =>
          !tracked.some(
            (file) => file === deny.path || file.startsWith(`${deny.path}/`)
          )
      )
      .map(async (deny) => ({ ...deny, found: await statOf(deny.path) }))
  );
  return { clone, entries };
};

/**
 * Writes each file's stand-in into the mount point a sandbox left at its
 * path, in place, so a sandbox still holding it keeps its bind. Answers
 * whether a mount point is left where a dir stands in.
 */
export const rewriteLeftFiles = async (ref: WorkspaceRef): Promise<boolean> => {
  let dirs = false;
  for (const { path, empty, found } of await presentIn(ref.path)) {
    if (!leftMountPoint(found)) {
      continue;
    }
    if (empty.kind === "file") {
      // biome-ignore lint/performance/noAwaitInLoops: a few files, each written in turn
      await chmod(path, 0o644);
      await writeFile(path, empty.text, { flag: "r+" });
    } else {
      dirs = true;
    }
  }
  return dirs;
};

/** Whether a sandbox left a mount point, a file, where a dir stands in. */
export const hasLeftDirs = async (clone: string): Promise<boolean> =>
  (await presentIn(clone)).some(
    ({ empty, found }) => empty.kind === "dir" && leftMountPoint(found)
  );

/** Whether `found` at `path` is exactly its stand-in: the file's text, or an empty dir. */
const asMade = async ({ path, empty, found }: Found): Promise<boolean> => {
  if (empty.kind === "dir") {
    return (
      found.isDirectory() &&
      (await readdir(path).catch(() => ["?"])).length === 0
    );
  }
  return (
    empty.kind === "file" &&
    found.isFile() &&
    (await readFile(path, "utf8").catch(() => undefined)) === empty.text
  );
};

/**
 * OpenCode's own rewrite of the `{}` an earlier build stood in with: it writes
 * `$schema` into a config that has none (`loadConfig`, packages/opencode/src/
 * config/config.ts at v1.18.34: `text.replace(/^\s*\{/, '{\n  "$schema":
 * "https://opencode.ai/config.json",')`).
 */
const OPENCODE_REWRITE =
  '{\n  "$schema": "https://opencode.ai/config.json",}\n';

/** OpenCode's config files and dir, by their path. */
const OPENCODE_PATH = /\/(opencode\.jsonc?|\.opencode)$/;

/** The empty JSON object an earlier build stood in with for OpenCode's config. */
const EARLIER_JSON = "{}\n";

/**
 * What OpenCode writes into a writable `.opencode` dir it loads, as an
 * earlier build's stand-in was (`ensureGitignore` and `npm.install` in the
 * same file).
 */
const OPENCODE_FILLS = new Set([
  ".gitignore",
  "package.json",
  "package-lock.json",
  "bun.lock",
  "node_modules",
]);

/**
 * Whether `found` is what CawCo made at `path` or what a harness makes of it:
 * its stand-in as made, an earlier build's (OpenCode's `{}`, a writable
 * `.opencode`), or OpenCode's own rewrite of either.
 */
const knownForm = async (one: Found): Promise<boolean> => {
  if (await asMade(one)) {
    return true;
  }
  const { path, found } = one;
  const opencode = OPENCODE_PATH.test(path);
  if (!opencode) {
    return false;
  }
  if (found.isDirectory()) {
    const entries = await readdir(path).catch(() => ["?"]);
    return entries.every((entry) => OPENCODE_FILLS.has(entry));
  }
  const text = found.isFile()
    ? await readFile(path, "utf8").catch(() => undefined)
    : undefined;
  return text === EARLIER_JSON || text === OPENCODE_REWRITE;
};

/**
 * Lists the stand-ins in the clone that are CawCo's, each by its own anchored
 * line in CawCo's block of the clone's `info/exclude` (`excludeStandIns`), so
 * git never sees them, and a user's own untracked `.vscode` or `.mcp.json`
 * is never hidden. A deny path at the clone's root that git does not track is
 * CawCo's when it is missing and `willStandIn` (the boundary's host makes it
 * before the sandbox starts: Linux), a mount point a sandbox left, already
 * listed (a harness may have written it since), or in a form CawCo or a
 * harness makes ({@link knownForm}); else it is someone else's. The clone's
 * `.git` dir is no part of its status.
 */
export const listStandIns = async (
  ref: WorkspaceRef,
  willStandIn: boolean
): Promise<void> => {
  const { clone, entries } = await untrackedIn(ref.path);
  const listed = new Set(await excludedStandIns(clone));
  const own: string[] = [];
  for (const one of entries) {
    const name = relative(clone, one.path);
    if (name.startsWith(".git/")) {
      continue;
    }
    const { found } = one;
    const ours = found
      ? listed.has(name) ||
        leftMountPoint(found) ||
        // biome-ignore lint/performance/noAwaitInLoops: one path at a time
        (await knownForm({ ...one, found }))
      : willStandIn;
    if (ours) {
      own.push(name);
    }
  }
  await excludeStandIns(clone, own);
};

/**
 * Takes away each stand-in in the clone that is still exactly as it was made,
 * and each mount point a sandbox left, then the project's Claude Code dir if
 * that leaves it empty; the exclude lines of those gone go with them. Run
 * once the workspace's sandboxes are gone; one that any mount namespace still
 * holds stays all the same ({@link mountedAnywhere}), and so does one a host
 * tool has written since, listed.
 */
export const removeStandIns = async (ref: WorkspaceRef): Promise<void> => {
  if (!(await statOf(ref.path))) {
    return;
  }
  for (const one of await presentIn(ref.path)) {
    const goes =
      !mountedAnywhere(one.path) &&
      // biome-ignore lint/performance/noAwaitInLoops: one path at a time
      (leftMountPoint(one.found) || (await asMade(one)));
    if (goes) {
      await (one.found.isDirectory() ? rmdir(one.path) : rm(one.path));
    }
  }
  const claude = projectClaudeDir(await realpath(ref.path));
  if (
    (await statOf(claude))?.isDirectory() &&
    (await readdir(claude)).length === 0 &&
    !mountedAnywhere(claude)
  ) {
    await rmdir(claude);
  }
  await listStandIns(ref, false);
};
