/**
 * A scratch fleet's workspace copy as a probe on the host reads and writes
 * it (agent layer.ts). A git repository's workspace is a clone of its own at
 * `~/.worktrees/<repo>-<id8>`, and a folder's copy on the Mac is a folder of
 * its own at the workspace's path: either is read where it is. A folder's
 * workspace on Linux has the person's folder itself as its path, seen
 * through the workspace's view: what the delegate wrote is in the view's
 * upper dir under the workspace's state dir, and only a process in the
 * view's mount namespace reads the folder as the delegate does. So no probe
 * reads `workspace.path` on the host for the delegate's work there; every
 * such read goes through here.
 *
 * - {@link copyPath}: where one path of the copy is on the host: the upper's
 *   entry when the delegate (or the copy's making) wrote it, the folder's
 *   otherwise, nothing when the delegate deleted it. A folder the delegate
 *   made whole (its `node_modules`, a harness folder) is all in the upper.
 * - {@link copyGone}: the copy taken away: on Linux its layer (upper, work
 *   dirs, record) gone, the folder itself untouched; elsewhere its folder.
 * - {@link inCopy}: a command run in the copy, through the view's namespace
 *   while it runs (layer.ts `viewArgv`), as the agent's own git there runs.
 */
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { viewArgv } from "../../packages/agent/src/layer";
import { SAFE_GIT_ENV, SAFE_GIT_FLAGS } from "../../packages/core/src/safe-git";
import { systemProgram } from "../../packages/core/src/workspace-needs";

/** A workspace as the probes read its row. */
export interface CopyRef {
  id: string;
  path: string;
}

/** What a scratch fleet gives these reads: its services' HOME. */
export interface CopyFleet {
  home: string;
}

/** One overlay of a view, as layer.json records it. */
interface Mount {
  at: string;
  upper: string;
}

/** The part of layer.json these reads use. */
interface LayerRecord {
  folder: string;
  form: "overlay" | "copy";
  mounts?: Mount[];
}

/** The workspace's state dir in the fleet's HOME (core paths.ts `workspaceStateDir`). */
export const stateDirOf = (fleet: CopyFleet, id: string): string =>
  join(fleet.home, ".cawco", "workspaces", id);

/** Workspace `id`'s layer record, when it has one. */
const layerOf = (fleet: CopyFleet, id: string): LayerRecord | undefined => {
  try {
    return JSON.parse(
      readFileSync(join(stateDirOf(fleet, id), "layer.json"), "utf8")
    ) as LayerRecord;
  } catch {
    // No layer on record: a copy cut before layers, or one gone.
  }
};

/**
 * Whether workspace `ws` is a repository's clone: at the path agent
 * layer.ts `clonePath` names, `~/.worktrees/<repo>-<id8>` in the fleet's
 * HOME, a folder of its own with no layer record.
 */
const isClone = (fleet: CopyFleet, ws: CopyRef): boolean =>
  dirname(ws.path) === join(fleet.home, ".worktrees") &&
  basename(ws.path).endsWith(`-${ws.id.slice(0, 8)}`);

/** Whether workspace `ws` is a Linux view of its folder. */
export const isView = (fleet: CopyFleet, ws: CopyRef): boolean => {
  if (isClone(fleet, ws)) {
    return false;
  }
  const layer = layerOf(fleet, ws.id);
  // Gone with its workspace: every folder workspace a fleet makes on Linux
  // is a view (agent layer.ts `makeLayer`), elsewhere a copy of its own.
  return layer ? layer.form === "overlay" : process.platform === "linux";
};

/** A mountinfo path's octal escapes (`\040` for a space). */
const OCTAL_ESCAPE = /\\([0-7]{3})/gu;

const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

/** Whether `path` is an overlay whiteout: a character device 0:0. */
const isWhiteout = (path: string): boolean => {
  try {
    const info = lstatSync(path);
    return info.isCharacterDevice() && info.rdev === 0;
  } catch {
    return false;
  }
};

/**
 * Whether there is an entry at `path`, its last component never followed: a
 * link is there whether or not it resolves where it stands. A relative link
 * in a view's upper (pnpm's `node_modules/zod -> ../../…/store/…`) resolves
 * only at the folder's path, in the view, never at the upper's.
 */
const entryAt = (path: string): boolean => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Where `rel` of workspace `ws`'s copy is on the host, or nothing when the
 * copy has no such path: in a view, the upper's entry the delegate wrote
 * (nothing when that is a whiteout, its deletion), else the folder's own;
 * in a copy of its own, the path under it. A view whose layer is gone reads
 * as its folder. A link is an entry wherever it leads ({@link entryAt}).
 */
export const copyPath = (
  fleet: CopyFleet,
  ws: CopyRef,
  rel: string
): string | undefined => {
  const at = join(ws.path, rel);
  const layer = layerOf(fleet, ws.id);
  if (layer?.form === "overlay") {
    const mount = [...(layer.mounts ?? [])]
      .reverse()
      .find((each) => within(at, each.at));
    if (mount) {
      const upper = join(mount.upper, relative(mount.at, at));
      if (isWhiteout(upper)) {
        return;
      }
      if (entryAt(upper)) {
        return upper;
      }
    }
  }
  return entryAt(at) ? at : undefined;
};

/** Whether `rel` is in workspace `ws`'s copy ({@link copyPath}). */
export const inCopyExists = (
  fleet: CopyFleet,
  ws: CopyRef,
  rel: string
): boolean => copyPath(fleet, ws, rel) !== undefined;

/** `rel` of workspace `ws`'s copy as text, or nothing when it has none. */
export const copyText = (
  fleet: CopyFleet,
  ws: CopyRef,
  rel: string
): string | undefined => {
  const at = copyPath(fleet, ws, rel);
  return at === undefined ? undefined : readFileSync(at, "utf8");
};

/**
 * Where a probe writes `rel` into workspace `ws`'s copy while nothing runs
 * in it (a held workspace, its boundary and view ended): a view's upper,
 * which an overlay not mounted takes offline (the kernel's overlayfs.rst,
 * "Changes to underlying filesystems": "Offline changes, when the overlay
 * is not mounted, are allowed to the upper tree"); a copy's own path
 * elsewhere.
 */
export const copyWritePath = (
  fleet: CopyFleet,
  ws: CopyRef,
  rel: string
): string => {
  const at = join(ws.path, rel);
  const layer = layerOf(fleet, ws.id);
  if (layer?.form !== "overlay") {
    return at;
  }
  const mount = [...(layer.mounts ?? [])]
    .reverse()
    .find((each) => within(at, each.at));
  if (!mount) {
    throw new Error(`${at} is in no overlay of workspace ${ws.id}'s view`);
  }
  return join(mount.upper, relative(mount.at, at));
};

/**
 * The folder on the host that holds workspace `ws`'s own writes to its
 * folder: a view's upper of the folder itself (what the delegate wrote or
 * made there, and nothing of the person's), a copy's own folder elsewhere.
 */
export const ownWritesOf = (fleet: CopyFleet, ws: CopyRef): string => {
  if (!isView(fleet, ws)) {
    return ws.path;
  }
  const layer = layerOf(fleet, ws.id);
  // Its record gone with it: where the agent keeps the folder's own overlay
  // (layer.ts `makeLayer`, the folder's mount first), which is gone too.
  return (
    layer?.mounts?.find((each) => each.at === layer.folder)?.upper ??
    join(stateDirOf(fleet, ws.id), "layer", "mounts", "0", "upper")
  );
};

/**
 * Each of `paths` (inside workspace `ws`'s copy, at the paths its delegate
 * reads them) with every link followed as the copy has them (`readlink
 * -f`, run in the copy: a link relative to its own folder resolves in the
 * view, never in the person's folder beneath it); "" for one that does not
 * resolve.
 */
export const realpathsInCopy = async (
  fleet: CopyFleet,
  ws: CopyRef,
  paths: readonly string[]
): Promise<string[]> => {
  if (paths.length === 0) {
    return [];
  }
  const ran = await inCopy(fleet, ws, [
    systemProgram("sh"),
    "-c",
    'for p; do readlink -f -- "$p" || echo; done',
    "sh",
    ...paths,
  ]);
  const lines = ran.stdout.split("\n");
  return paths.map((_, at) => lines[at] ?? "");
};

/**
 * Whether workspace `ws`'s copy is gone: a view's layer (its record, upper
 * and work dirs) and state dir taken away, the folder itself standing; a
 * copy of its own, its folder gone.
 */
export const copyGone = (fleet: CopyFleet, ws: CopyRef): boolean => {
  const state = stateDirOf(fleet, ws.id);
  if (process.platform === "linux" && !isClone(fleet, ws)) {
    return !(
      existsSync(join(state, "layer.json")) || existsSync(join(state, "layer"))
    );
  }
  return !existsSync(ws.path);
};

/**
 * The view's holder, from its record (`<pid> <mount namespace> <user
 * namespace>`, layer.ts `viewFile`): while it runs in the namespace the
 * record names, and that namespace bears the view's mark (layer.ts
 * `viewMarked`: its layer dir bound onto itself), so a record its view
 * outlived never names another process's namespace.
 */
const viewPid = (fleet: CopyFleet, id: string): number | undefined => {
  const layerDir = join(stateDirOf(fleet, id), "layer");
  try {
    const [pid, mnt] = readFileSync(join(layerDir, "view"), "utf8")
      .trim()
      .split(" ");
    const number = Number(pid);
    if (
      !Number.isInteger(number) ||
      readlinkSync(`/proc/${number}/ns/mnt`) !== mnt
    ) {
      return;
    }
    const marked = readFileSync(`/proc/${number}/mountinfo`, "utf8")
      .split("\n")
      .some(
        (line) =>
          (line.split(" ")[4] ?? "").replace(OCTAL_ESCAPE, (_, code: string) =>
            String.fromCharCode(Number.parseInt(code, 8))
          ) === layerDir
      );
    return marked ? number : undefined;
  } catch {
    // No view started, its record gone with it, or its holder gone.
  }
};

/**
 * `argv` as it runs in workspace `ws`'s copy, in `cwd` there: entered into
 * its view while the view runs (layer.ts `viewArgv`), as it is for a copy
 * of its own. Throws for a view that does not run: nothing reads it so.
 */
export const copyArgv = (
  fleet: CopyFleet,
  ws: CopyRef,
  argv: readonly string[],
  cwd = ws.path
): { argv: string[]; cwd: string } => {
  if (!isView(fleet, ws)) {
    return { argv: [...argv], cwd };
  }
  const pid = viewPid(fleet, ws.id);
  if (pid === undefined) {
    throw new Error(`workspace ${ws.id}'s view does not run`);
  }
  return { argv: viewArgv(pid, cwd, argv), cwd: "/" };
};

/** `argv` run in workspace `ws`'s copy: its exit, stdout and stderr. */
export const inCopy = async (
  fleet: CopyFleet,
  ws: CopyRef,
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env
): Promise<{ exitCode: number; stderr: string; stdout: string }> => {
  let run: { argv: string[]; cwd: string };
  try {
    run = copyArgv(fleet, ws, argv);
  } catch (error) {
    return { exitCode: -1, stderr: String(error), stdout: "" };
  }
  const child = Bun.spawn(run.argv, {
    cwd: run.cwd,
    env,
    stdin: "ignore",
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

/** git in workspace `ws`'s copy ({@link inCopy}), as safe-git.ts says: its stdout, trimmed. */
export const gitInCopy = async (
  fleet: CopyFleet,
  ws: CopyRef,
  args: readonly string[]
): Promise<string> =>
  (
    await inCopy(
      fleet,
      ws,
      ["git", ...SAFE_GIT_FLAGS, "-C", ws.path, ...args],
      { ...process.env, ...SAFE_GIT_ENV }
    )
  ).stdout.trim();
