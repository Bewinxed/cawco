/**
 * A delegation workspace's private copy of the folder it was made from: the
 * one way any folder becomes a workspace, a repository's root or any other
 * (`/etc/nginx`, `/root`, a home), on either OS. The delegate's writes are
 * its own; the folder (`F`) is never written until its change set lands
 * ({@link applyChanges}), by the agent on its machine, outside every wall.
 *
 * - Linux, `overlay`: the delegate sees F at its real path, live, through a
 *   kernel overlay whose lower layer is F itself and whose upper and work
 *   dirs are the workspace's own, on disk under its state dir
 *   (`~/.cawco/workspaces/<id>/layer/mounts/<n>`), never a tmpfs. The
 *   overlay is mounted once per workspace, in a mount namespace of its own
 *   (the view), by bwrap's `--overlay-src`/`--overlay` (bwrap(1)): one
 *   holder process keeps it ({@link ensureView}), and every process of the
 *   workspace (its sessions' harnesses, its boundary's srt host, the agent's
 *   own git there) enters that namespace by `nsenter` ({@link viewArgv}), so
 *   they all read and write through one mount: two overlay mounts sharing
 *   an upper are undefined (the kernel's overlayfs.rst, "Sharing and
 *   copying layers"). Each real filesystem mounted under F gets an overlay
 *   of its own at its mount point; pseudo filesystems (proc, a tmpfs) are
 *   the host's, and so are CawCo's and the harnesses' own homes when F holds
 *   them ({@link PASSTHROUGH}). The delegate sees the person's edits to a
 *   file until it writes that file; from then on the file is its own.
 * - macOS, `copy`: an APFS clone of F at the workspace's path
 *   (`~/.worktrees/<name>-<id8>`, `cp -c`, clonefile(2)), and a second one,
 *   the base, in its state dir: what F was at the start, which the change set
 *   is read against. The root `node_modules` is not cloned before the
 *   delegate starts: the clone's `node_modules` is a link to F's
 *   ({@link LINKED_MODULES}), and its own clone is made in the background
 *   and swapped in for the link in one step ({@link ownModules}). Until then
 *   the delegate reads F's installed dependencies, and a write there is
 *   refused: the boundary's Seatbelt profile judges the path a link resolves
 *   to, and F is not among its writable roots, and every harness's file
 *   tools are judged at their real path (core workspace-judge.ts
 *   `resolveReal`). The delegate does not see the person's edits made after
 *   the clone.
 *
 * A clone cut by a build before layers (`~/.worktrees/<repo>-<id8>`, a git
 * clone of its own) is a `copy` with no base: its path is CawCo's own folder,
 * its git holds its work, and it retires as a copy does ({@link layerOf}).
 *
 * The change set ({@link changesOf}) is the upper on Linux and the clone's
 * differences from its base on the Mac, the root `node_modules` and CawCo's
 * own deny paths (core workspace-policy.ts `cloneDenies`, their stand-ins)
 * left out. A path the delegate changed that F changed too since the start
 * is a conflict ({@link conflictsOf}): on Linux by F's ctime past the start,
 * on the Mac by F against the base; either way both versions are shown, the
 * person's and the delegate's, with no base to merge from.
 */
import { dlopen, FFIType, ptr } from "bun:ffi";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import type {
  ChangedPath,
  ChangeVersion,
  WorkspaceChanges,
  WorkspaceConflict,
  WorkspaceKind,
} from "@cawco/core";
import { claudeHome, workspacesDir } from "@cawco/core/paths";
import { hostEnvironment } from "@cawco/core/session-env";
import { listedPid, signal as signalPid } from "@cawco/core/signal";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { cloneDenies } from "@cawco/core/workspace-policy";
import { removeTree } from "./remove-tree";
import { SYSTEM_PATH } from "./workspace-needs";

/** How a workspace holds its private copy on its machine. */
export type LayerForm = "overlay" | "copy";

/** One overlay of a Linux view: a filesystem at or under F, its upper and work dirs. */
export interface LayerMount {
  /** Where it is mounted in the view: F, or a mount point under F. */
  at: string;
  upper: string;
  work: string;
}

/**
 * A workspace's layer, as `layer.json` in its state dir records it: written
 * before anything of the copy is made (`made` false), and again once it is
 * whole.
 */
export interface Layer {
  /** Copy: the folder's start, an APFS clone the change set is read against. Absent for a clone cut before layers. */
  base?: string;
  /** The folder the workspace was made from, at its real path. */
  folder: string;
  form: LayerForm;
  /** A repository's root (its `.git` a directory of its own), or any other folder. */
  kind: WorkspaceKind;
  /** Whether the copy is whole: one that is not was cut short, and is cleared. */
  made: boolean;
  /** Copy: whether the root `node_modules` is still F's, by a link ({@link LINKED_MODULES}). */
  modules?: "linked" | "own";
  /** Overlay: each filesystem's layers. */
  mounts?: LayerMount[];
  /** Where the delegate works: F itself (overlay), or the clone (copy). */
  path: string;
  /**
   * Overlay: each path of F whose conflict the delegate was shown, with F's
   * ctime then: F as it stood then is what the delegate answered, so it is
   * no conflict again until F changes once more ({@link noteSeen}).
   */
  seen?: Record<string, number>;
  /** When the delegate's view of F began (epoch ms): the line a conflict is read from. */
  started: number;
}

/** The folder a workspace's layer keeps its own files in. */
export const layerDir = (id: string): string =>
  join(workspacesDir(), id, "layer");

const layerFile = (id: string): string =>
  join(workspacesDir(), id, "layer.json");

/** The record of the view's holder: `<pid> <mount namespace> <user namespace>`. */
const viewFile = (id: string): string => join(layerDir(id), "view");

/** Workspace `id`'s layer, when it has one on record. */
export const readLayer = (id: string): Promise<Layer | undefined> =>
  readRecord<Layer>(layerFile(id));

/** Writes workspace `id`'s layer record. */
export const writeLayer = (id: string, layer: Layer): Promise<void> =>
  writeStateFile(layerFile(id), `${JSON.stringify(layer, null, 2)}\n`);

/**
 * Workspace `id`'s layer: its record, or, for a clone cut by a build before
 * layers (no record, a folder where such a build cut workspace `id`'s
 * clone: `~/.worktrees/<repo>-<id8>`, and nowhere else, so a person's own
 * folder is never taken for one), a `copy` of its own with no base and no
 * folder of origin on record. Every such clone held a repository; one whose
 * `.git` was deleted since is read as a husk (stand-ins.ts `straysIn`).
 */
export const layerOf = async (
  id: string,
  path: string
): Promise<Layer | undefined> => {
  const layer = await readLayer(id).catch(() => undefined);
  if (layer) {
    return layer;
  }
  if (
    dirname(path) !== join(homedir(), ".worktrees") ||
    !basename(path).endsWith(`-${id.slice(0, 8)}`)
  ) {
    return;
  }
  const there = await lstat(path).catch(() => undefined);
  if (!there?.isDirectory()) {
    return;
  }
  return {
    folder: "",
    form: "copy",
    kind: "repo",
    made: true,
    path,
    started: 0,
  };
};

/** Whether `layer` is a view of the person's own folder at its real path, which identifies no workspace by path. */
export const isOverlay = (layer: Layer | undefined): boolean =>
  layer?.form === "overlay";

/** Whether workspace `id` is a Linux view of its folder (read from its record, synchronously). */
export const overlaySync = (id: string): boolean => {
  try {
    return (
      (JSON.parse(readFileSync(layerFile(id), "utf8")) as Layer).form ===
      "overlay"
    );
  } catch {
    return false;
  }
};

/** Whether workspace `id` is a copy of a folder that is no repository (read from its record, synchronously). */
export const folderSync = (id: string): boolean => {
  try {
    return (
      (JSON.parse(readFileSync(layerFile(id), "utf8")) as Layer).kind ===
      "folder"
    );
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- Linux view

/** A program on the system PATH, where workspace-needs.ts looks. */
const systemTool = (name: string): string =>
  SYSTEM_PATH.split(":")
    .map((dir) => join(dir, name))
    .find((path) => existsSync(path)) ?? `/usr/bin/${name}`;

/**
 * Filesystems whose files are a folder's own: each under F gets an overlay
 * of its own. Every other mount under F (proc, sysfs, a tmpfs, devpts, a
 * network or FUSE mount, a squashfs) is the host's, bound into the view as
 * it is.
 */
const LAYERED_TYPES = new Set([
  "ext2",
  "ext3",
  "ext4",
  "xfs",
  "btrfs",
  "zfs",
  "f2fs",
  "bcachefs",
  "jfs",
  "reiserfs",
  "vfat",
  "exfat",
  "ntfs3",
]);

const OCTAL_ESCAPE = /\\([0-7]{3})/g;

/** A mountinfo path as the kernel escapes it (`\040` for a space). */
const unescapeMount = (path: string): string =>
  path.replace(OCTAL_ESCAPE, (_, code: string) =>
    String.fromCharCode(Number.parseInt(code, 8))
  );

const within = (path: string, root: string): boolean =>
  root === "/" || path === root || path.startsWith(`${root}/`);

/** The mounts strictly under `folder` on this host: those layered, and those bound as the host has them. */
const mountsUnder = (
  folder: string
): { bound: string[]; layered: string[] } => {
  const bound: string[] = [];
  const layered: string[] = [];
  for (const line of readFileSync("/proc/self/mountinfo", "utf8").split("\n")) {
    const [head, tail] = line.split(" - ");
    if (!(head && tail)) {
      continue;
    }
    const at = unescapeMount(head.split(" ")[4] ?? "");
    if (!at || at === folder || !within(at, folder)) {
      continue;
    }
    const type = tail.split(" ")[0] ?? "";
    (LAYERED_TYPES.has(type) ? layered : bound).push(at);
  }
  const depth = (path: string) => path.split("/").length;
  const order = (a: string, b: string) => depth(a) - depth(b);
  return {
    bound: [...new Set(bound)].sort(order),
    layered: [...new Set(layered)].sort(order),
  };
};

/**
 * What every process of the view reaches as the host has it, never layered,
 * where F holds it: CawCo's home (the workspace's own state, its upper among
 * it, its sessions' accounts) and the harnesses' homes, whose transcripts and
 * settings the agent reads on the host.
 */
const PASSTHROUGH = (): string[] => [
  claudeHome(),
  ...[
    ".cawco",
    ".config/opencode",
    ".local/share/opencode",
    ".local/state/opencode",
    ".cache/opencode",
    ".pi",
  ].map((name) => join(homedir(), name)),
];

/**
 * The bwrap words of `layer`'s view: the host's whole tree, then each of its
 * overlays, then what under F is the host's again.
 */
export const viewMounts = (layer: Layer): string[] => {
  const mounts = layer.mounts ?? [];
  const { bound } = mountsUnder(layer.folder);
  const through = PASSTHROUGH().filter(
    (path) => within(path, layer.folder) && existsSync(path)
  );
  return [
    "--dev-bind",
    "/",
    "/",
    ...mounts.flatMap((mount) => [
      "--overlay-src",
      mount.at,
      "--overlay",
      mount.upper,
      mount.work,
      mount.at,
    ]),
    ...bound.flatMap((path) => ["--dev-bind", path, path]),
    ...through.flatMap((path) => ["--bind", path, path]),
  ];
};

/**
 * The holder of a view: it writes its pid and its namespaces where the
 * agent reads them ({@link viewFile}), then waits. Every process of the view
 * may hold it as well: the view lives while any does.
 */
const HOLDER = `printf '%s %s %s\\n' "$$" "$(readlink /proc/self/ns/mnt)" "$(readlink /proc/self/ns/user)" > "$1.tmp" && mv -f "$1.tmp" "$1" && exec sleep 2147483647`;

interface ViewRecord {
  mnt: string;
  pid: number;
  user: string;
}

const readViewRecord = (id: string): ViewRecord | undefined => {
  try {
    const [pid, mnt, user] = readFileSync(viewFile(id), "utf8")
      .trim()
      .split(" ");
    return pid && mnt && user ? { pid: Number(pid), mnt, user } : undefined;
  } catch {
    // No record: no view was started, or its record was taken away with it.
  }
};

const nsOf = (pid: number, kind: "mnt" | "user"): string | undefined => {
  try {
    return readlinkSync(`/proc/${pid}/ns/${kind}`);
  } catch {
    // Gone, or not ours to read: in no namespace of a view.
  }
};

const NUMERIC = /^\d+$/;

/** Every live process in mount namespace `mnt`. */
const membersOf = (mnt: string): number[] =>
  readdirSync("/proc")
    .filter((name) => NUMERIC.test(name))
    .map(Number)
    .filter((pid) => nsOf(pid, "mnt") === mnt);

/**
 * A live process of workspace `id`'s view, to enter it by: its holder, or,
 * with the holder gone (an agent restart under systemd ends it), any process
 * still in its mount namespace. None when the view is gone.
 */
export const viewMember = (
  id: string
): { mnt: string; pid: number; user: string } | undefined => {
  const record = readViewRecord(id);
  if (!record) {
    return;
  }
  if (nsOf(record.pid, "mnt") === record.mnt) {
    return record;
  }
  const [pid] = membersOf(record.mnt);
  return pid === undefined ? undefined : { ...record, pid };
};

const viewing = new Map<string, Promise<number>>();

/** How long a view's holder has to name its namespace. */
const VIEW_START_MS = 10_000;

/**
 * Workspace `id`'s view, running: a live member's pid. With none, the
 * holder starts it, detached from the agent; the overlay is mounted there
 * once, and only when no process holds an earlier mount of the same upper.
 */
export const ensureView = (id: string, layer: Layer): Promise<number> => {
  const member = viewMember(id);
  if (member) {
    return Promise.resolve(member.pid);
  }
  const pending = viewing.get(id);
  if (pending) {
    return pending;
  }
  const started = startView(id, layer).finally(() => viewing.delete(id));
  viewing.set(id, started);
  return started;
};

const startView = async (id: string, layer: Layer): Promise<number> => {
  for (const mount of layer.mounts ?? []) {
    // biome-ignore lint/performance/noAwaitInLoops: a few layers, each two dirs
    await mkdir(mount.upper, { recursive: true, mode: 0o700 });
    await mkdir(mount.work, { recursive: true, mode: 0o700 });
  }
  await rm(viewFile(id), { force: true });
  const holder = Bun.spawn(
    [
      systemTool("bwrap"),
      ...viewMounts(layer),
      "--",
      "/bin/sh",
      "-c",
      HOLDER,
      "cawco-view",
      viewFile(id),
    ],
    {
      env: { ...hostEnvironment(), PATH: SYSTEM_PATH },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
      detached: true,
    }
  );
  holder.unref();
  const deadline = Date.now() + VIEW_START_MS;
  while (Date.now() < deadline) {
    const record = readViewRecord(id);
    if (record && nsOf(record.pid, "mnt") === record.mnt) {
      // biome-ignore lint/performance/noAwaitInLoops: once, as the view is up
      await openWorkDirs(layer);
      return record.pid;
    }
    if (holder.exitCode !== null) {
      const said = (await new Response(holder.stderr).text()).trim();
      throw new Error(
        `workspace ${id}'s view of ${layer.folder} did not start: bwrap exited ${holder.exitCode}${said ? `: ${said}` : ""}`
      );
    }
    await Bun.sleep(20);
  }
  signalPid(listedPid(holder.pid), "SIGKILL");
  throw new Error(
    `workspace ${id}'s view of ${layer.folder} did not name its namespace within ${VIEW_START_MS / 1000} s`
  );
};

/**
 * Moves into its first word, inside the view, and runs the rest in place of
 * itself. nsenter's own `--wd=DIR` opens DIR before it enters the namespace
 * (util-linux nsenter.c `open_target_fd`), so the working directory would
 * be the person's folder beneath the view, not the view.
 */
const VIEW_CD = 'cd -- "$1" || exit 125; shift; exec "$@"';

/**
 * Each overlay's own `work/work` given back to its owner (0700) once the
 * view is mounted: the kernel makes it with no mode bits at all
 * (overlayfs `ovl_workdir_create`), which leaves the workspace's state dir
 * a folder its owner's tools cannot read or remove (a walk, `du`, a
 * scratch fleet's collection: EACCES). The overlay itself works in it as
 * the mounter, its owner.
 */
const openWorkDirs = async (layer: Layer): Promise<void> => {
  await Promise.all(
    (layer.mounts ?? []).map((mount) =>
      chmod(join(mount.work, "work"), 0o700).catch(() => undefined)
    )
  );
};

/**
 * `argv` run in workspace `id`'s view, in `cwd` there: `nsenter` into its
 * member `pid`'s mount namespace (which starts it at the namespace's root),
 * and its user namespace when that is not ours (an agent run as root makes
 * none), keeping our uid (`--preserve-credentials`); then `cwd` is entered
 * as the view has it ({@link VIEW_CD}) and `argv` replaces that shell.
 */
export const viewArgv = (
  pid: number,
  cwd: string,
  argv: readonly string[]
): string[] => [
  systemTool("nsenter"),
  "-t",
  String(pid),
  ...(nsOf(pid, "user") === nsOf(process.pid, "user") ? [] : ["-U"]),
  "-m",
  "--preserve-credentials",
  "--",
  "/bin/sh",
  "-c",
  VIEW_CD,
  "cawco-view",
  cwd,
  ...argv,
];

/**
 * `path` in workspace `id`'s view as this process reaches it, through its
 * member `pid`'s root (proc(5) `/proc/[pid]/root`): for reading and writing
 * files only. Never a working directory or a real path: getcwd(2) and
 * realpath(3) there answer the host's.
 */
export const viewPath = (pid: number, path: string): string =>
  `/proc/${pid}/root${path}`;

/** How long the processes of a view have to leave once killed. */
const VIEW_END_MS = 5000;

/**
 * Ends workspace `id`'s view: every process in its mount namespace (the
 * holder, its sessions, its boundary, anything they left), SIGKILLed until
 * none is left. Answers the processes that would not go.
 */
export const endView = async (id: string): Promise<number[]> => {
  const record = readViewRecord(id);
  if (!record) {
    return [];
  }
  const deadline = Date.now() + VIEW_END_MS;
  let left = membersOf(record.mnt);
  while (left.length > 0 && Date.now() < deadline) {
    for (const pid of left) {
      signalPid(listedPid(pid), "SIGKILL");
    }
    // biome-ignore lint/performance/noAwaitInLoops: reads the namespace again after each round of kills
    await Bun.sleep(50);
    left = membersOf(record.mnt);
  }
  if (left.length === 0) {
    await rm(viewFile(id), { force: true });
  }
  return left;
};

// ----------------------------------------------------------------- the copy

/**
 * macOS: `renamex_np(2)` with `RENAME_SWAP`, which swaps two paths in one
 * step: the clone's `node_modules` link and its own clone of F's trade
 * places with no moment where neither is there.
 */
const RENAME_SWAP = 0x2;

interface Darwin {
  renamex_np: (from: unknown, to: unknown, flags: number) => number;
}
let darwin: Darwin | undefined;
const swapPaths = (a: string, b: string): void => {
  darwin ??= dlopen("libSystem.B.dylib", {
    renamex_np: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.u32],
      returns: FFIType.i32,
    },
  }).symbols as unknown as Darwin;
  const from = Buffer.from(`${a}\0`);
  const to = Buffer.from(`${b}\0`);
  if (darwin.renamex_np(ptr(from), ptr(to), RENAME_SWAP) !== 0) {
    throw new Error(`${a} and ${b} could not be swapped`);
  }
};

/** The one dependency tree that is linked, not cloned, as a copy starts. */
export const LINKED_MODULES = "node_modules";

/** `cp -c -R -p` of `sources` into `into`: an APFS clone of each, modes and times kept. */
const cloneInto = async (
  sources: readonly string[],
  into: string
): Promise<void> => {
  if (sources.length === 0) {
    return;
  }
  const ran = await Bun.$`/bin/cp -c -R -p -- ${sources} ${into}`
    .env(hostEnvironment())
    .quiet()
    .nothrow();
  if (ran.exitCode !== 0) {
    throw new Error(
      `cp -c into ${into} failed: ${ran.stderr.toString().trim() || `exit ${ran.exitCode}`}`
    );
  }
};

/**
 * The clone of `folder` at `path`, its root `node_modules` a link to
 * `folder`'s, and the same clone again at `base`, with no `node_modules`:
 * each made by one `cp -c` of the folder's top-level entries.
 */
const cloneFolder = async (
  folder: string,
  path: string,
  base: string
): Promise<boolean> => {
  const names = await readdir(folder);
  const sources = names
    .filter((name) => name !== LINKED_MODULES)
    .map((name) => join(folder, name));
  await mkdir(path, { recursive: false, mode: 0o755 });
  await mkdir(base, { recursive: true, mode: 0o700 });
  await Promise.all([cloneInto(sources, path), cloneInto(sources, base)]);
  const modules = await lstat(join(folder, LINKED_MODULES)).catch(
    () => undefined
  );
  if (!modules?.isDirectory()) {
    return false;
  }
  await symlink(join(folder, LINKED_MODULES), join(path, LINKED_MODULES));
  return true;
};

const owning = new Map<string, Promise<void>>();

/**
 * The copy's own clone of F's root `node_modules`, made beside the link and
 * swapped in for it in one step ({@link swapPaths}), then the link removed.
 * Once per workspace at a time; again after an agent restart cut one short
 * (its partial clone is removed first).
 */
export const ownModules = (id: string): Promise<void> => {
  const pending = owning.get(id);
  if (pending) {
    return pending;
  }
  const work = (async () => {
    const layer = await readLayer(id);
    if (!(layer?.form === "copy" && layer.modules === "linked")) {
      return;
    }
    const linked = join(layer.path, LINKED_MODULES);
    const cloning = join(layer.path, `.${LINKED_MODULES}.cawco-cloning`);
    await removeTree(cloning);
    await mkdir(cloning, { mode: 0o755 });
    const source = join(layer.folder, LINKED_MODULES);
    await cloneInto(
      (await readdir(source)).map((name) => join(source, name)),
      cloning
    );
    const link = await lstat(linked).catch(() => undefined);
    if (link?.isSymbolicLink()) {
      swapPaths(cloning, linked);
      await rm(cloning, { force: true });
    } else {
      // The delegate replaced the link itself: its own tree stands.
      await removeTree(cloning);
    }
    await writeLayer(id, { ...layer, modules: "own" });
    console.info(
      `[workspace] ${id}: its own clone of ${source} is in place of the link`
    );
  })().finally(() => owning.delete(id));
  owning.set(id, work);
  return work;
};

// --------------------------------------------------------------- the making

/** Whether `folder` is a repository's root whose `.git` is a directory of its own. */
const kindOf = async (folder: string): Promise<WorkspaceKind> => {
  const git = await lstat(join(folder, ".git")).catch(() => undefined);
  if (git?.isFile()) {
    throw new Error(
      `${folder} is a git worktree, whose repository lives outside it, so a workspace of it would write that repository: delegate from the repository's own checkout`
    );
  }
  return git?.isDirectory() ? "repo" : "folder";
};

/**
 * Workspace `id`'s layer of `folder`, made: on Linux its view's dirs and
 * record, nothing copied, and its view mounted; on macOS the clone at
 * `path` and its base. Recorded unmade before anything is made; the create
 * marks it made once all of it is whole ({@link markMade}).
 */
export const makeLayer = async (
  id: string,
  folder: string,
  path: string
): Promise<Layer> => {
  const kind = await kindOf(folder);
  const started = Date.now();
  if (process.platform === "linux") {
    const dir = layerDir(id);
    const mounts = [folder, ...mountsUnder(folder).layered].map((at, n) => ({
      at,
      upper: join(dir, "mounts", String(n), "upper"),
      work: join(dir, "mounts", String(n), "work"),
    }));
    const layer: Layer = {
      folder,
      form: "overlay",
      kind,
      made: false,
      mounts,
      path: folder,
      started,
    };
    await writeLayer(id, layer);
    await ensureView(id, layer);
    return layer;
  }
  const base = join(layerDir(id), "base");
  const layer: Layer = {
    base,
    folder,
    form: "copy",
    kind,
    made: false,
    path,
    started,
  };
  await writeLayer(id, layer);
  const linked = await cloneFolder(folder, path, base);
  const made: Layer = {
    ...layer,
    ...(linked ? { modules: "linked" as const } : {}),
  };
  await writeLayer(id, made);
  if (linked) {
    ownModules(id).catch((error: unknown) =>
      console.warn(
        `[workspace] ${id}: its own clone of ${join(folder, LINKED_MODULES)} was not made, so it reads that folder's through the link: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
  return made;
};

/**
 * Workspace `id`'s layer whole: its create finished (workspace.ts
 * `createWorkspace`), so it is never cleared as one cut short.
 */
export const markMade = async (id: string): Promise<void> => {
  const layer = await readLayer(id);
  if (layer && !layer.made) {
    await writeLayer(id, { ...layer, made: true });
  }
};

/**
 * Removes workspace `id`'s layer: its view's processes ended and its layer
 * dir gone (Linux; F is never touched), or the clone and its base (macOS,
 * and a clone cut before layers). Throws, nothing removed, when a process of
 * the view will not end.
 */
export const removeLayer = async (id: string, layer: Layer): Promise<void> => {
  if (layer.form === "overlay") {
    const left = await endView(id);
    if (left.length > 0) {
      throw new Error(
        `workspace ${id}'s view still holds pid ${left.join(", ")} after SIGKILL, so its layer was not removed`
      );
    }
  } else if (layer.path !== layer.folder) {
    const removing = `${layer.path}.cawco-removing`;
    await removeTree(removing);
    await rename(layer.path, removing).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
    await removeTree(removing);
  }
  await removeTree(layerDir(id));
  await rm(layerFile(id), { force: true });
};

// ----------------------------------------------------------- the change set

interface Libc {
  lgetxattr: (
    path: unknown,
    name: unknown,
    value: unknown,
    size: number
  ) => number;
}
let libc: Libc | undefined;

/**
 * Whether the upper dir `path` is opaque: it replaced the lower dir of its
 * name whole (made where a deleted one was), so nothing of F's dir shows
 * through it. overlayfs marks it `overlay.opaque` = `y`, in the `user.`
 * namespace when mounted in a user namespace (`userxattr`), else
 * `trusted.` (overlayfs.rst, "Whiteouts and opaque directories").
 */
const isOpaque = (path: string): boolean => {
  libc ??= dlopen("libc.so.6", {
    lgetxattr: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u64],
      returns: FFIType.i64,
    },
  }).symbols as unknown as Libc;
  const file = Buffer.from(`${path}\0`);
  const value = Buffer.alloc(4);
  return ["user.overlay.opaque", "trusted.overlay.opaque"].some((name) => {
    const key = Buffer.from(`${name}\0`);
    const got = Number(
      (libc as Libc).lgetxattr(ptr(file), ptr(key), ptr(value), value.length)
    );
    return got >= 1 && value[0] === "y".charCodeAt(0);
  });
};

/** The change set's own paths it never carries: CawCo's deny paths and their stand-ins, and the linked tree. */
const notCarried = (folder: string): ((rel: string) => boolean) => {
  const denied = cloneDenies(folder).map((deny) => relative(folder, deny.path));
  return (rel) =>
    rel === LINKED_MODULES ||
    rel.startsWith(`${LINKED_MODULES}/`) ||
    rel.startsWith(`.${LINKED_MODULES}.cawco-`) ||
    denied.some((path) => rel === path || rel.startsWith(`${path}/`));
};

/** One entry of a tree, as the change set compares it. */
interface Entry {
  kind: "file" | "link" | "dir" | "other";
  mode: number;
  mtimeNs: bigint;
  size: number;
}

const entryAt = async (path: string): Promise<Entry | undefined> => {
  const info = await lstat(path, { bigint: true }).catch(() => undefined);
  if (!info) {
    return;
  }
  let kind: Entry["kind"] = "other";
  if (info.isSymbolicLink()) {
    kind = "link";
  } else if (info.isDirectory()) {
    kind = "dir";
  } else if (info.isFile()) {
    kind = "file";
  }
  return {
    kind,
    // biome-ignore lint/suspicious/noBitwiseOperators: a mode's permission bits
    mode: Number(info.mode & 0o7777n),
    mtimeNs: info.mtimeNs,
    size: Number(info.size),
  };
};

/** Where one tree walk of the change set stands: F, the walk's root, and the paths it never carries. */
interface Walk {
  changes: ChangedPath[];
  folder: string;
  skip: (rel: string) => boolean;
}

/** F's entries of the lower dir `lower` that an opaque upper dir holding `names` hides: each deleted. */
const opaqueDeletes = async (
  walk: Walk,
  lower: string,
  names: readonly string[]
): Promise<void> => {
  for (const name of await readdir(lower).catch(() => [] as string[])) {
    const rel = relative(walk.folder, join(lower, name));
    if (!(names.includes(name) || walk.skip(rel))) {
      walk.changes.push({ path: rel, change: "delete" });
    }
  }
};

/**
 * The upper dir `upper` of a view's overlay at `at`, as changes to F's
 * paths: each file and link it holds is written, each whiteout (a character
 * device 0:0) deleted, and an opaque dir's F entries that it does not hold
 * deleted too.
 */
const upperChanges = async (
  folder: string,
  at: string,
  upper: string,
  skip: (rel: string) => boolean
): Promise<ChangedPath[]> => {
  const walk: Walk = { changes: [], folder, skip };
  const down = async (dir: string): Promise<void> => {
    const names = await readdir(join(upper, dir)).catch(() => [] as string[]);
    if (dir && isOpaque(join(upper, dir))) {
      await opaqueDeletes(walk, join(at, dir), names);
    }
    for (const name of names) {
      const inner = join(dir, name);
      const rel = relative(folder, join(at, inner));
      if (skip(rel)) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one entry at a time, down the upper's tree
      const info = await lstat(join(upper, inner));
      if (info.isDirectory()) {
        await down(inner);
      } else if (info.isCharacterDevice() && info.rdev === 0) {
        walk.changes.push({ path: rel, change: "delete" });
      } else if (info.isFile() || info.isSymbolicLink()) {
        walk.changes.push({ path: rel, change: "write" });
      }
    }
  };
  await down("");
  return walk.changes;
};

/** Whether `now` and `then` are the same entry by kind, size, time and mode. */
const sameEntry = (now: Entry | undefined, then: Entry | undefined): boolean =>
  now !== undefined &&
  then !== undefined &&
  now.kind === then.kind &&
  now.size === then.size &&
  now.mtimeNs === then.mtimeNs &&
  now.mode === then.mode;

/**
 * The copy at `path` against its `base`, as changes to F's paths: each file
 * or link whose kind, size, time or mode differs, or that the base lacks, is
 * written; each the copy lacks is deleted.
 */
const copyChanges = async (
  path: string,
  base: string,
  skip: (rel: string) => boolean
): Promise<ChangedPath[]> => {
  const changes: ChangedPath[] = [];
  const one = async (rel: string): Promise<boolean> => {
    const [now, then] = await Promise.all([
      entryAt(join(path, rel)),
      entryAt(join(base, rel)),
    ]);
    if (now?.kind === "dir") {
      if (then && then.kind !== "dir") {
        changes.push({ path: rel, change: "delete" });
      }
      return true;
    }
    if (
      (now?.kind === "file" || now?.kind === "link") &&
      !sameEntry(now, then)
    ) {
      changes.push({ path: rel, change: "write" });
    }
    return false;
  };
  const down = async (dir: string): Promise<void> => {
    const [mine, was] = await Promise.all([
      readdir(join(path, dir)).catch(() => [] as string[]),
      readdir(join(base, dir)).catch(() => [] as string[]),
    ]);
    for (const name of was) {
      const rel = join(dir, name);
      if (!(mine.includes(name) || skip(rel))) {
        changes.push({ path: rel, change: "delete" });
      }
    }
    for (const name of mine) {
      const rel = join(dir, name);
      // biome-ignore lint/performance/noAwaitInLoops: one entry at a time, down both trees
      if (!skip(rel) && (await one(rel))) {
        await down(rel);
      }
    }
  };
  await down("");
  return changes;
};

/** Where the delegate's version of `rel` is read on the host: the upper that holds it, or the copy. */
const delegateFile = (layer: Layer, rel: string): string | undefined => {
  if (layer.form === "copy") {
    return join(layer.path, rel);
  }
  const target = join(layer.folder, rel);
  const mount = [...(layer.mounts ?? [])]
    .reverse()
    .find((each) => within(target, each.at));
  return mount ? join(mount.upper, relative(mount.at, target)) : undefined;
};

/**
 * Workspace `id`'s change set: every path of F the delegate wrote or
 * deleted, read on the host from its upper dirs (Linux) or its copy against
 * the base (macOS), CawCo's own paths left out ({@link notCarried}).
 */
export const changesOf = async (layer: Layer): Promise<ChangedPath[]> => {
  const skip = notCarried(layer.folder);
  let candidates: ChangedPath[];
  if (layer.form === "overlay") {
    const all = await Promise.all(
      (layer.mounts ?? []).map((mount) =>
        upperChanges(layer.folder, mount.at, mount.upper, skip)
      )
    );
    candidates = all.flat();
  } else if (layer.base) {
    candidates = await copyChanges(layer.path, layer.base, skip);
  } else {
    throw new Error(
      `${layer.path} is a clone cut before layers, with no base to read its changes against`
    );
  }
  const differ = await Promise.all(
    candidates.map((change) => differsFromFolder(layer, change))
  );
  return candidates.filter((_, at) => differ[at]);
};

/**
 * Whether the delegate's `change` is not yet so in F: a written path whose
 * F entry is missing or another kind, size, link target or content; a
 * deleted one F still has. A change set landed ({@link applyChanges}) is so
 * in F, and holds nothing more until the delegate writes again.
 */
const differsFromFolder = async (
  layer: Layer,
  change: ChangedPath
): Promise<boolean> => {
  const target = join(layer.folder, change.path);
  const there = await lstat(target).catch(() => undefined);
  if (change.change === "delete") {
    return there !== undefined;
  }
  const from = delegateFile(layer, change.path);
  const mine = from ? await lstat(from).catch(() => undefined) : undefined;
  if (!(there && mine)) {
    return true;
  }
  if (mine.isSymbolicLink() || there.isSymbolicLink()) {
    return !(
      mine.isSymbolicLink() &&
      there.isSymbolicLink() &&
      (await readlink(from as string)) === (await readlink(target))
    );
  }
  if (!(mine.isFile() && there.isFile()) || mine.size !== there.size) {
    return true;
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: a mode's permission bits
  if ((mine.mode & 0o7777) !== (there.mode & 0o7777)) {
    return true;
  }
  const [a, b] = await Promise.all([
    readFile(from as string),
    readFile(target),
  ]);
  return !a.equals(b);
};

/** The most of one version of a file a conflict shows as text. */
const VERSION_TEXT_LIMIT = 64 * 1024;

/** One version of `path` as a conflict shows it: gone, a link, a folder, binary or too large, or its text. */
const versionOf = async (path: string | undefined): Promise<ChangeVersion> => {
  const info = path ? await lstat(path).catch(() => undefined) : undefined;
  if (!(path && info) || (info.isCharacterDevice() && info.rdev === 0)) {
    return { kind: "gone" };
  }
  if (info.isSymbolicLink()) {
    return { kind: "link", target: await readlink(path) };
  }
  if (info.isDirectory()) {
    return { kind: "folder" };
  }
  if (info.size > VERSION_TEXT_LIMIT) {
    return { kind: "large", bytes: info.size };
  }
  const bytes = await readFile(path);
  return bytes.includes(0)
    ? { kind: "binary", bytes: info.size }
    : { kind: "text", text: bytes.toString("utf8") };
};

/**
 * Whether F's `rel` changed since the delegate's start: on Linux its ctime
 * is past the start (no base is kept); on the Mac it differs from the base
 * in kind, size, time or mode, or one of them lacks it.
 */
const changedInFolder = async (layer: Layer, rel: string): Promise<boolean> => {
  const target = join(layer.folder, rel);
  if (layer.form === "overlay") {
    const info = await lstat(target).catch(() => undefined);
    return (
      info !== undefined &&
      !info.isDirectory() &&
      info.ctimeMs > layer.started &&
      layer.seen?.[rel] !== info.ctimeMs
    );
  }
  if (!layer.base) {
    return false;
  }
  const [now, then] = await Promise.all([
    entryAt(target),
    entryAt(join(layer.base, rel)),
  ]);
  if (!(now || then)) {
    return false;
  }
  if (now?.kind === "dir" && then?.kind === "dir") {
    return false;
  }
  return !sameEntry(now, then);
};

/** Each path of `changes` that F changed too since the start, with both versions. */
export const conflictsOf = async (
  layer: Layer,
  changes: readonly ChangedPath[]
): Promise<WorkspaceConflict[]> => {
  const found = await Promise.all(
    changes.map(async (change): Promise<WorkspaceConflict | undefined> => {
      if (!(await changedInFolder(layer, change.path))) {
        return;
      }
      const [yours, theirs] = await Promise.all([
        versionOf(join(layer.folder, change.path)),
        change.change === "delete"
          ? Promise.resolve<ChangeVersion>({ kind: "gone" })
          : versionOf(delegateFile(layer, change.path)),
      ]);
      return { path: change.path, yours, delegate: theirs };
    })
  );
  return found.filter((each): each is WorkspaceConflict => each !== undefined);
};

/**
 * Notes that the delegate was shown `conflicts`: F as it is now at each
 * path is what its next landing is read against, so the version the
 * delegate then leaves lands unless F changes again. On Linux by F's ctime
 * now ({@link Layer.seen}); on the Mac by F's entry cloned into the base.
 */
const noteSeen = async (
  id: string,
  layer: Layer,
  conflicts: readonly WorkspaceConflict[]
): Promise<void> => {
  if (conflicts.length === 0) {
    return;
  }
  if (layer.form === "overlay") {
    const seen = { ...layer.seen };
    for (const each of conflicts) {
      // biome-ignore lint/performance/noAwaitInLoops: a few conflicting paths
      const info = await lstat(join(layer.folder, each.path)).catch(
        () => undefined
      );
      seen[each.path] = info?.ctimeMs ?? -1;
    }
    await writeLayer(id, { ...layer, seen });
    return;
  }
  const { base } = layer;
  if (!base) {
    return;
  }
  for (const each of conflicts) {
    const into = join(base, each.path);
    // biome-ignore lint/performance/noAwaitInLoops: one path at a time, each replaced whole
    await removeTree(into);
    if (await lstat(join(layer.folder, each.path)).catch(() => undefined)) {
      await mkdir(dirname(into), { recursive: true });
      await cloneInto([join(layer.folder, each.path)], dirname(into));
    }
  }
};

/**
 * Workspace `id`'s change set and its conflicts with F as it is now; each
 * conflict shown is noted ({@link noteSeen}).
 */
export const readChanges = async (
  id: string,
  layer: Layer
): Promise<WorkspaceChanges> => {
  const changed = await changesOf(layer);
  const conflicts = await conflictsOf(layer, changed);
  await noteSeen(id, layer, conflicts);
  return { folder: layer.folder, changed, conflicts };
};

// ------------------------------------------------------------- the landing

/** The name a file is written under beside its place before it is renamed there. */
const stagingOf = (target: string): string =>
  join(
    dirname(target),
    `.${basename(target)}.cawco-${randomBytes(4).toString("hex")}`
  );

/**
 * One written path of the change set put into F: its folders made as the
 * delegate's are, then the file written beside its place and renamed over
 * it (so F never holds half of it), its mode and time kept; a link made the
 * same way.
 */
const putOne = async (layer: Layer, rel: string): Promise<void> => {
  const from = delegateFile(layer, rel);
  if (!from) {
    return;
  }
  const target = join(layer.folder, rel);
  const info = await lstat(from);
  await mkdir(dirname(target), { recursive: true });
  const staging = stagingOf(target);
  try {
    if (info.isSymbolicLink()) {
      await symlink(await readlink(from), staging);
    } else {
      await writeFile(staging, await readFile(from), { mode: info.mode });
      // biome-ignore lint/suspicious/noBitwiseOperators: chmod(2) takes the permission bits
      await chmod(staging, info.mode & 0o7777);
      await utimes(staging, info.atime, info.mtime);
    }
    const there = await lstat(target).catch(() => undefined);
    if (there?.isDirectory()) {
      await removeTree(target);
    }
    await rename(staging, target);
  } catch (error) {
    await rm(staging, { force: true });
    throw error;
  }
};

/**
 * Lands workspace `id`'s change set in F, by the agent on its machine,
 * outside every wall: the conflict scan first, against F as it is now (any
 * conflict refuses the whole set, nothing written); then every written path
 * ({@link putOne}), then the deletions, deepest first. Answers how many paths
 * it changed. A run cut short is safe to run again: each step is whole.
 */
export const applyChanges = async (
  id: string,
  layer: Layer
): Promise<{ applied: number; conflicts: WorkspaceConflict[] }> => {
  const changed = await changesOf(layer);
  const conflicts = await conflictsOf(layer, changed);
  if (conflicts.length > 0) {
    await noteSeen(id, layer, conflicts);
    return { applied: 0, conflicts };
  }
  const landedAt = Date.now();
  const writes = changed.filter((each) => each.change === "write");
  const deletes = changed
    .filter((each) => each.change === "delete")
    .sort((a, b) => b.path.split("/").length - a.path.split("/").length);
  for (const each of writes) {
    // biome-ignore lint/performance/noAwaitInLoops: one path at a time, so a failure names the one it stopped at
    await putOne(layer, each.path);
  }
  for (const each of deletes) {
    // biome-ignore lint/performance/noAwaitInLoops: deepest first, so a folder's entries go before it
    await removeTree(join(layer.folder, each.path));
  }
  await landedInBase(layer, changed);
  // F's paths it just wrote are past the old start: the next conflict scan
  // reads from this landing on.
  await writeLayer(id, { ...layer, started: landedAt });
  return { applied: changed.length, conflicts: [] };
};

/**
 * A copy's base, brought to what just landed: each written path cloned from
 * the copy, each deleted one removed, so F's landed paths read unchanged
 * against it from now on. Nothing for a Linux view, which keeps no base.
 */
const landedInBase = async (
  layer: Layer,
  changed: readonly ChangedPath[]
): Promise<void> => {
  const { base } = layer;
  if (!(layer.form === "copy" && base)) {
    return;
  }
  for (const each of changed) {
    const into = join(base, each.path);
    // biome-ignore lint/performance/noAwaitInLoops: one path at a time, each replaced whole
    await removeTree(into);
    if (each.change === "write") {
      await mkdir(dirname(into), { recursive: true });
      await cloneInto([join(layer.path, each.path)], dirname(into));
    }
  }
};

/**
 * `argv` run in workspace `id`'s copy, in `cwd` there, for a run that cannot
 * wait for a view to start (the git door's, which only a running boundary,
 * itself in the view, reaches): through its view when it is a Linux view,
 * as it is otherwise. Throws for a view nothing holds.
 */
export const inCopySync = (
  id: string,
  cwd: string,
  argv: readonly string[]
): { argv: string[]; cwd: string } => {
  if (!overlaySync(id)) {
    return { argv: [...argv], cwd };
  }
  const member = viewMember(id);
  if (!member) {
    throw new Error(`workspace ${id}'s view of its folder is not running`);
  }
  return { argv: viewArgv(member.pid, cwd, argv), cwd: "/" };
};

/** `path` of workspace `id`'s copy as this process reads it ({@link inCopySync}'s view; {@link viewPath}). */
export const copyPathSync = (id: string, path: string): string => {
  if (!overlaySync(id)) {
    return path;
  }
  const member = viewMember(id);
  if (!member) {
    throw new Error(`workspace ${id}'s view of its folder is not running`);
  }
  return viewPath(member.pid, path);
};

/**
 * Where one file of workspace `id`'s copy is read on the host with no view
 * running: in a Linux view, the upper's copy of `path` when the delegate (or
 * the making of its layer) wrote it, else the folder's own; the path itself
 * otherwise. For a file the making always writes (a repository copy's
 * `.git/config`, workspace.ts `ownGitConfig`).
 */
export const copyFileOf = (id: string, path: string): string => {
  if (!overlaySync(id)) {
    return path;
  }
  const layer = JSON.parse(readFileSync(layerFile(id), "utf8")) as Layer;
  const mount = [...(layer.mounts ?? [])]
    .reverse()
    .find((each) => within(path, each.at));
  const upper = mount ? join(mount.upper, relative(mount.at, path)) : path;
  return existsSync(upper) ? upper : path;
};

/** Workspace `id`'s view running when it is a Linux view, so a run in its copy finds it ({@link inCopySync}). */
export const viewRunning = async (id: string): Promise<void> => {
  const layer = await readLayer(id).catch(() => undefined);
  if (layer?.form === "overlay") {
    await ensureView(id, layer);
  }
};

/**
 * A session's process, entered into workspace `workspace`'s view when it is
 * a Linux view: the harness itself (its file tools, its hooks, every shell
 * it starts) then reads and writes the folder through the view, at its real
 * path, as the boundary's commands do. As it is for no workspace, a place, a
 * copy, or on macOS. Its boundary was ensured first, which runs the view, so
 * a view nothing holds refuses the spawn ({@link inCopySync}).
 */
export const enterSpawn = <
  T extends { args: string[]; command: string; cwd?: string },
>(
  workspace: string | undefined,
  spawn: T
): T => {
  if (!(workspace && overlaySync(workspace))) {
    return spawn;
  }
  const { argv } = inCopySync(workspace, spawn.cwd ?? "/", [
    spawn.command,
    ...spawn.args,
  ]);
  const [command = spawn.command, ...args] = argv;
  return { ...spawn, command, args };
};
