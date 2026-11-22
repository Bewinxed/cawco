/**
 * `bun run cleanup:worktrees [--apply] [--root <dir>] [--db <path>]
 * [--machine <id or hostname>]`: the one-time cleanup of the folders under
 * a machine's `~/.worktrees` that nothing owns, run on that machine.
 *
 * An entry there is owned, and left alone, when the hub's database (opened
 * read-only, never written) or the machine's own records name it:
 * - a workspace row of this machine at its path, in any state: the hub
 *   settles it (an archived one's clone still there is closed again by its
 *   sweep, workspaces.ts `closeLeftClones`);
 * - an active host-scope row whose folder is it or inside it: a session runs
 *   there;
 * - an artifact served from the pin it copies (`<name>-pin-<pin8>`,
 *   `artifacts.source_pin`), or the agent's own record of that pin
 *   (`~/.cawco/workspaces/<pin>/stage-pin.json`), which the agent lets go
 *   once no artifact is served from it (agent stage.ts `keepPins`);
 * - a session's spin-off worktree (`instances.scratch_worktree`);
 * - a project's place on this machine at it or inside it.
 *
 * Every other entry is skipped when a process has its cwd, an open file or
 * a mapped file inside it (`/proc/<pid>/cwd`, `fd`, `maps`), or when
 * anything in it changed in the last 24 hours (`node_modules` and files bun's
 * store hard-links never count; see `changedSince`). Otherwise:
 * - a git checkout (a clone, or a linked worktree of another repository)
 *   is skipped while another worktree of its repository stands; otherwise
 *   it first has every commit on no remote pushed to
 *   `origin cawco-safe/<entry>-<branch>` (its HEAD, a clone's other local
 *   branches and its stash entries); a push that fails skips the entry;
 * - its uncommitted changes (`git diff --binary HEAD`) and its untracked
 *   files are saved to `~/.cawco/carries/cleanup/<entry>/`; a save that
 *   fails skips the entry;
 * - then it is deleted, and a linked worktree's records in its repository
 *   pruned (`git worktree prune`).
 * - Anything that is no git checkout (a plain folder, a log, a patch) has
 *   no history to push, so it is moved whole into
 *   `~/.cawco/carries/cleanup/<entry>/` instead of deleted.
 *
 * Without `--apply` it changes nothing and prints one line per entry: what
 * it would do, and why.
 */
import { Database } from "bun:sqlite";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { hubDbPath } from "../packages/core/src/paths/hub";
import {
  workspaceCarriesDir,
  workspacesDir,
} from "../packages/core/src/paths/workspace";
import { DAY_MS } from "../packages/core/src/time";
import { IGNORED_STATUS } from "../packages/core/src/workspace-policy";

/** How recent a change keeps an entry: a day. */
const RECENT_MS = DAY_MS;

/** A pin's copy, named by its source's folder and the pin's first eight characters (agent stage-clone.ts `cutPin`). */
const PIN_COPY = /-pin-([0-9a-f]{8})$/u;

/** A process's folder under `/proc`. */
const PID = /^\d+$/u;

/** What `/proc/<pid>/maps` writes after a mapped file deleted since. */
const DELETED = / \(deleted\)$/u;

interface Options {
  apply: boolean;
  db: string;
  machine: string | undefined;
  root: string;
}

const usage =
  "usage: bun run cleanup:worktrees [--apply] [--root <dir>] [--db <path>] [--machine <id or hostname>]";

const optionsOf = (args: readonly string[]): Options => {
  const options: Options = {
    apply: false,
    db: hubDbPath(),
    machine: undefined,
    root: join(homedir(), ".worktrees"),
  };
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at];
    const value = (): string => {
      const next = args[at + 1];
      if (next === undefined) {
        throw new Error(`${arg} needs a value\n${usage}`);
      }
      at += 1;
      return next;
    };
    switch (arg) {
      case "--apply":
        options.apply = true;
        break;
      case "--root":
        options.root = resolve(value());
        break;
      case "--db":
        options.db = resolve(value());
        break;
      case "--machine":
        options.machine = value();
        break;
      default:
        throw new Error(`unknown argument ${arg}\n${usage}`);
    }
  }
  return options;
};

/** A command's result: its exit code and what it printed. */
interface Ran {
  code: number;
  err: string;
  out: string;
}

const run = (cmd: readonly string[], cwd?: string): Ran => {
  const done = Bun.spawnSync([...cmd], {
    ...(cwd ? { cwd } : {}),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return {
    code: done.exitCode,
    out: done.stdout.toString(),
    err: done.stderr.toString().trim(),
  };
};

/** Git in `path`, taking no optional lock and writing no index refresh: a dry run leaves the checkout as it was. */
const git = (path: string, args: readonly string[]): Ran =>
  run(["git", "--no-optional-locks", "-C", path, ...args]);

/** What the hub and the machine record as owning folders on this machine. */
interface Owners {
  /** Active host-scope rows: their folders, each with its workspace id. */
  hostActive: { id: string; path: string }[];
  /** Pin copies' paths the agent holds a pin record for. */
  pinsRecorded: Map<string, string>;
  /** Pin prefixes (first eight characters) an artifact is served from. */
  pinsServed: Set<string>;
  /** Project places on this machine: their paths, each with its project id. */
  places: { path: string; projectId: string }[];
  /** Spin-off worktrees: path to session id. */
  spinOffs: Map<string, string>;
  /** Workspace rows that are no host-scope row: path to `<id8> (<state>)`. */
  workspaces: Map<string, string>;
}

const machineOf = (client: Database, asked: string | undefined): string => {
  const rows = client
    .query<{ hostname: string; machine_id: string }, []>(
      "SELECT machine_id, hostname FROM agents"
    )
    .all();
  const name = asked ?? hostname();
  const matched = rows.filter(
    (row) => row.machine_id === name || row.hostname === name
  );
  const [only] = matched;
  if (matched.length !== 1 || !only) {
    throw new Error(
      `no single machine in the hub's database is ${JSON.stringify(name)}; name one with --machine: ${rows.map((row) => `${row.hostname} (${row.machine_id})`).join(", ")}`
    );
  }
  return only.machine_id;
};

/** What `read` answers, or `fallback` when it throws: a file gone, or not this user's to read. */
const orElse = <T>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

/** The `path` a JSON record names, if it reads as one. */
const pathIn = (text: string): string | undefined => {
  const record: unknown = orElse(() => JSON.parse(text), undefined);
  return typeof record === "object" &&
    record !== null &&
    "path" in record &&
    typeof record.path === "string"
    ? record.path
    : undefined;
};

/** The path the agent's `create.json` of state dir `id` names, if any. */
const createdPath = (id: string): string | undefined =>
  pathIn(
    orElse(
      () => readFileSync(join(workspacesDir(), id, "create.json"), "utf8"),
      ""
    )
  );

const ownersOf = (client: Database, machineId: string): Owners => {
  const workspaces = new Map<string, string>();
  const hostActive: Owners["hostActive"] = [];
  for (const row of client
    .query<{ host: number; id: string; path: string; state: string }, [string]>(
      "SELECT id, path, state, host FROM workspaces WHERE machine_id = ?"
    )
    .all(machineId)) {
    if (row.host) {
      if (row.state === "active") {
        hostActive.push({ id: row.id, path: row.path });
      }
    } else {
      workspaces.set(row.path, `${row.id.slice(0, 8)} (${row.state})`);
    }
  }
  const pinsServed = new Set(
    client
      .query<{ pin: string }, []>(
        "SELECT DISTINCT source_pin AS pin FROM artifacts WHERE source_pin IS NOT NULL"
      )
      .all()
      .map((row) => row.pin.slice(0, 8))
  );
  const pinsRecorded = new Map<string, string>();
  for (const id of existsSync(workspacesDir())
    ? readdirSync(workspacesDir())
    : []) {
    const path = existsSync(join(workspacesDir(), id, "stage-pin.json"))
      ? createdPath(id)
      : undefined;
    if (path) {
      pinsRecorded.set(path, id);
    }
  }
  const spinOffs = new Map<string, string>();
  for (const row of client
    .query<{ id: string; worktree: string }, [string]>(
      "SELECT id, scratch_worktree AS worktree FROM instances WHERE machine_id = ? AND scratch_worktree IS NOT NULL"
    )
    .all(machineId)) {
    const path = pathIn(row.worktree);
    if (path) {
      spinOffs.set(path, row.id);
    }
  }
  const places = client
    .query<{ path: string; projectId: string }, [string]>(
      "SELECT path, project_id AS projectId FROM project_places WHERE machine_id = ?"
    )
    .all(machineId);
  return {
    hostActive,
    pinsRecorded,
    pinsServed,
    places,
    spinOffs,
    workspaces,
  };
};

/** Whether `path` is `folder` or inside it. */
const within = (path: string, folder: string): boolean =>
  path === folder || path.startsWith(`${folder}/`);

/** Why `entry` (at `paths`, its path and its real path) is owned, or nothing. */
const ownerOf = (
  owners: Owners,
  name: string,
  paths: readonly string[]
): string | undefined => {
  for (const path of paths) {
    const workspace = owners.workspaces.get(path);
    if (workspace) {
      return `workspace ${workspace} owns it; the hub settles it`;
    }
    const spinOff = owners.spinOffs.get(path);
    if (spinOff) {
      return `it is session ${spinOff.slice(0, 8)}'s spin-off worktree`;
    }
    const pin = owners.pinsRecorded.get(path);
    if (pin) {
      return `the agent holds pin ${pin.slice(0, 8)}'s record of it, and lets it go once no artifact is served from it`;
    }
  }
  const pinned = PIN_COPY.exec(name)?.[1];
  if (pinned && owners.pinsServed.has(pinned)) {
    return `an artifact is served from pin ${pinned}`;
  }
  for (const path of paths) {
    const host = owners.hostActive.find((one) => within(one.path, path));
    if (host) {
      return `host-scope workspace ${host.id.slice(0, 8)} is active in ${host.path}`;
    }
    const place = owners.places.find((one) => within(one.path, path));
    if (place) {
      return `project ${place.projectId}'s place ${place.path} is in it`;
    }
  }
};

/** What every process this user can read holds open, as real paths: cwd, open files and mapped files. */
const openPaths = (): string[] => {
  const held: string[] = [];
  const link = (path: string): void => {
    const target = orElse(() => readlinkSync(path), undefined);
    if (target) {
      held.push(target);
    }
  };
  for (const pid of readdirSync("/proc").filter((one) => PID.test(one))) {
    link(`/proc/${pid}/cwd`);
    for (const fd of orElse(() => readdirSync(`/proc/${pid}/fd`), [])) {
      link(`/proc/${pid}/fd/${fd}`);
    }
    const maps = orElse(() => readFileSync(`/proc/${pid}/maps`, "utf8"), "");
    for (const line of maps.split("\n")) {
      const at = line.indexOf("/");
      if (at >= 0) {
        held.push(line.slice(at).replace(DELETED, ""));
      }
    }
  }
  return held;
};

/**
 * The newest change anywhere under `path` (itself too), links not followed;
 * stops at the first within `since`. Only what someone wrote counts: every
 * `node_modules` folder is left out whole, and so is any regular file with
 * more than one link, since bun's package store hard-links its files into
 * every install, so an install anywhere moves their ctime (and can reset
 * their mtime) without anything in this folder changing.
 */
const changedSince = (path: string, since: number): string | undefined => {
  const stack = [path];
  while (stack.length > 0) {
    const at = stack.pop();
    if (at === undefined) {
      break;
    }
    if (basename(at) === "node_modules") {
      continue;
    }
    let info: ReturnType<typeof lstatSync>;
    try {
      info = lstatSync(at);
    } catch {
      continue;
    }
    if (info.isFile() && info.nlink > 1) {
      continue;
    }
    if (Math.max(info.mtimeMs, info.ctimeMs) > since) {
      return at;
    }
    if (info.isDirectory()) {
      try {
        for (const child of readdirSync(at)) {
          stack.push(join(at, child));
        }
      } catch {
        return `${at} (unreadable)`;
      }
    }
  }
};

const sizeOf = (path: string): string => {
  const du = run(["du", "-sm", path]);
  return du.code === 0 ? `${du.out.split("\t")[0]}M` : "?M";
};

/** A ref name made of what git takes in a branch name. */
const refSafe = (text: string): string =>
  text
    .replace(/[^A-Za-z0-9._/-]+/gu, "-")
    .replace(/\/{2,}/gu, "/")
    .replace(/\.{2,}/gu, ".")
    .replace(/^[-./]+|[-./]+$/gu, "") || "entry";

/** One push of a commit to keep. */
interface Push {
  commit: string;
  count: number;
  ref: string;
  what: string;
}

/** A git checkout read: what it holds that a delete would lose. */
interface Checkout {
  /** Linked worktrees: the repository whose records to prune once it goes. */
  common: string | undefined;
  dirty: string[];
  hasHead: boolean;
  pushes: Push[];
  untracked: string[];
}

/** How many commits reachable from `commit` are on no remote this checkout knows. */
const unpushed = (path: string, commit: string): number => {
  const counted = git(path, [
    "rev-list",
    "--count",
    commit,
    "--not",
    "--remotes",
  ]);
  if (counted.code !== 0) {
    throw new Error(`git rev-list ${commit}: ${counted.err}`);
  }
  return Number(counted.out.trim());
};

const nulList = (text: string): string[] => text.split("\0").filter(Boolean);

/** Refuses a checkout git does not read as its own top, or a repository another standing worktree uses; answers whether it is a linked worktree, with its repository's git dir. */
const placeOf = (path: string): { common: string; linked: boolean } => {
  const top = git(path, ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) {
    throw new Error(`git can't read it: ${top.err}`);
  }
  const root = top.out.trim();
  if (realpathSync(root) !== realpathSync(path)) {
    throw new Error(`git reads it as part of ${root}`);
  }
  const gitDir = git(path, ["rev-parse", "--absolute-git-dir"]).out.trim();
  const common = git(path, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]).out.trim();
  const linked = gitDir !== common;
  if (!linked) {
    const others = git(path, ["worktree", "list", "--porcelain"])
      .out.split("\n")
      .filter((one) => one.startsWith("worktree "))
      .map((one) => one.slice("worktree ".length))
      .filter((one) => one !== root && existsSync(one));
    if (others.length > 0) {
      throw new Error(
        `other worktrees of its repository stand: ${others.join(", ")}`
      );
    }
  }
  return { common, linked };
};

/** A clone's own local branches other than `current`, and its stash entries: each as a commit, its label and its words. */
const ownRefsOf = (
  path: string,
  current: string | undefined
): { commit: string; label: string; what: string }[] => {
  const branches = git(path, [
    "for-each-ref",
    "--format=%(objectname) %(refname:short)",
    "refs/heads",
  ])
    .out.split("\n")
    .filter(Boolean)
    .map((line) => {
      const [commit = "", ...rest] = line.split(" ");
      const short = rest.join(" ");
      return { commit, label: short, what: `branch ${short}` };
    })
    .filter((one) => one.label !== current);
  const stashes = git(path, ["stash", "list", "--format=%H"])
    .out.split("\n")
    .filter(Boolean)
    .map((commit, index) => ({
      commit,
      label: `stash-${index}`,
      what: `stash@{${index}}`,
    }));
  return [...branches, ...stashes];
};

/** Every commit of the checkout at `path` a delete would lose, as the pushes that keep it. */
const pushesOf = (path: string, name: string, linked: boolean): Push[] => {
  const head = git(path, ["rev-parse", "--verify", "-q", "HEAD"]);
  if (head.code !== 0) {
    return [];
  }
  const commit = head.out.trim();
  const branch = git(path, ["symbolic-ref", "-q", "--short", "HEAD"]);
  const current = branch.code === 0 ? branch.out.trim() : undefined;
  const label = current ?? `detached-${commit.slice(0, 8)}`;
  // A linked worktree's branches and stash are its repository's, which stays.
  const refs = [
    { commit, label, what: `HEAD (${label})` },
    ...(linked ? [] : ownRefsOf(path, current)),
  ];
  return refs.flatMap((ref) => {
    const count = unpushed(path, ref.commit);
    return count > 0
      ? [
          {
            commit: ref.commit,
            count,
            ref: `cawco-safe/${refSafe(`${name}-${ref.label}`)}`,
            what: ref.what,
          },
        ]
      : [];
  });
};

/** The checkout's changed tracked files and its untracked files, as git status names them. */
const changesOf = (path: string): { dirty: string[]; untracked: string[] } => {
  // The status that names untracked files, ignored ones left out: git
  // ignores what an install or a build makes again.
  const status = git(
    path,
    IGNORED_STATUS.filter((arg) => arg !== "--ignored=matching")
  );
  if (status.code !== 0) {
    throw new Error(`git status: ${status.err}`);
  }
  const dirty: string[] = [];
  const untracked: string[] = [];
  const entries = nulList(status.out);
  for (let at = 0; at < entries.length; at += 1) {
    const entry = entries[at] ?? "";
    const code = entry.slice(0, 2);
    if (code === "??") {
      untracked.push(entry.slice(3));
      continue;
    }
    dirty.push(entry.slice(3));
    // A rename or copy names its source next.
    if (code.includes("R") || code.includes("C")) {
      at += 1;
    }
  }
  return { dirty, untracked };
};

const checkoutOf = (path: string, name: string): Checkout => {
  const { common, linked } = placeOf(path);
  const hasHead = git(path, ["rev-parse", "--verify", "-q", "HEAD"]).code === 0;
  return {
    common: linked ? common : undefined,
    hasHead,
    pushes: pushesOf(path, name, linked),
    ...changesOf(path),
  };
};

/** A folder under the carries' cleanup folder for `name`, new. */
const carryFor = (name: string): string => {
  const base = join(workspaceCarriesDir(), "cleanup", name);
  return existsSync(base) ? `${base}-${Date.now()}` : base;
};

/** Removes `path` whole; a folder its owner may not write is given back to its owner first. */
const remove = (path: string): void => {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    run(["chmod", "-R", "u+rwX", path]);
    rmSync(path, { recursive: true, force: true });
  }
};

/** Moves `from` to `to` (a new path), across filesystems by copy and delete. */
const move = (from: string, to: string): void => {
  mkdirSync(dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      error.code === "EXDEV"
    )) {
      throw error;
    }
    cpSync(from, to, {
      recursive: true,
      verbatimSymlinks: true,
      preserveTimestamps: true,
    });
    remove(from);
  }
};

/** The words of a failure. */
const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** What `handle` prints for an entry: its verb, then why. */
type Line = (verb: string, why: string) => string;

/** Why each entry that is done with is: nothing owns or holds it. */
const UNOWNED =
  "no workspace row, pin, spin-off or project place names it, nothing holds it open, nothing changed in a day";

/** Why `paths` (an entry's path and its real path) stay as they are now: kept, owned; skipped, in use. Nothing when neither. */
const standing = (
  owners: Owners,
  held: readonly string[],
  name: string,
  paths: readonly string[]
): { verb: "keep" | "skip"; why: string } | undefined => {
  const owner = ownerOf(owners, name, paths);
  if (owner) {
    return { verb: "keep", why: owner };
  }
  const busy = held.find((one) => paths.some((at) => within(one, at)));
  if (busy) {
    return { verb: "skip", why: `a process holds ${busy} open` };
  }
  const recent = changedSince(paths[0] ?? "", Date.now() - RECENT_MS);
  return recent
    ? { verb: "skip", why: `${recent} changed in the last 24 hours` }
    : undefined;
};

/** An entry that is no git checkout moved whole into the carries. */
const moveWhole = (
  options: Options,
  path: string,
  name: string,
  line: Line
): string => {
  const to = carryFor(name);
  if (!options.apply) {
    return line(
      "move",
      `would move it whole to ${to}: no git checkout, so nothing of it is anywhere else; ${UNOWNED}`
    );
  }
  try {
    move(path, to);
  } catch (error) {
    return line("skip", `moving it to ${to} failed: ${said(error)}`);
  }
  return line("moved", `to ${to}: no git checkout; ${UNOWNED}`);
};

/** The checkout's uncommitted changes and untracked files saved into `carry`; throws why not. */
const saveChanges = (path: string, checkout: Checkout, carry: string) => {
  mkdirSync(carry, { recursive: true });
  if (checkout.hasHead && checkout.dirty.length > 0) {
    const diff = Bun.spawnSync(
      ["git", "--no-optional-locks", "-C", path, "diff", "--binary", "HEAD"],
      { stdout: "pipe", stderr: "pipe", env: process.env }
    );
    if (diff.exitCode !== 0) {
      throw new Error(`git diff: ${diff.stderr.toString().trim()}`);
    }
    writeFileSync(join(carry, "changes.diff"), diff.stdout);
  }
  // With no commit yet, its staged files are kept as files.
  const files = checkout.hasHead
    ? checkout.untracked
    : [...checkout.dirty, ...checkout.untracked];
  for (const file of files) {
    const to = join(carry, "untracked", file);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(path, file), to, {
      recursive: true,
      verbatimSymlinks: true,
      preserveTimestamps: true,
    });
  }
  writeFileSync(
    join(carry, "source.json"),
    `${JSON.stringify(
      {
        path,
        head: git(path, ["rev-parse", "-q", "--verify", "HEAD"]).out.trim(),
        pushed: checkout.pushes.map(({ commit, ref }) => ({ commit, ref })),
        savedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`
  );
};

/** A git checkout pushed, saved and deleted, or said so; skipped at the first step that fails. */
const clearCheckout = (
  options: Options,
  path: string,
  name: string,
  line: Line
): string => {
  let checkout: Checkout;
  try {
    checkout = checkoutOf(path, name);
  } catch (error) {
    return line("skip", said(error));
  }
  const carry = carryFor(name);
  const changed = checkout.dirty.length + checkout.untracked.length > 0;
  const steps = [
    ...checkout.pushes.map(
      (push) =>
        `push ${push.what}, ${push.count} commit(s) on no remote, to origin ${push.ref}`
    ),
    ...(changed
      ? [
          `save ${checkout.dirty.length} changed and ${checkout.untracked.length} untracked file(s) to ${carry}`,
        ]
      : []),
    "delete it",
    ...(checkout.common
      ? [`prune its worktree record in ${checkout.common}`]
      : []),
  ];
  if (!options.apply) {
    return line("delete", `would ${steps.join(", then ")}; ${UNOWNED}`);
  }
  for (const push of checkout.pushes) {
    const pushed = git(path, [
      "push",
      "origin",
      `${push.commit}:refs/heads/${push.ref}`,
    ]);
    if (pushed.code !== 0) {
      return line(
        "skip",
        `pushing ${push.what} to origin ${push.ref} failed: ${pushed.err}`
      );
    }
  }
  try {
    if (changed) {
      saveChanges(path, checkout, carry);
    }
  } catch (error) {
    return line(
      "skip",
      `saving its changes to ${carry} failed: ${said(error)}`
    );
  }
  try {
    remove(path);
  } catch (error) {
    return line("skip", `deleting it failed: ${said(error)}`);
  }
  if (checkout.common) {
    run(["git", "-C", checkout.common, "worktree", "prune"]);
  }
  return line("gone", `${steps.join(", then ")}; ${UNOWNED}`);
};

/** What becomes of one entry: its line, and with `apply`, done. */
const handle = (
  options: Options,
  owners: Owners,
  held: readonly string[],
  name: string
): string => {
  const path = join(options.root, name);
  // A dangling link is its own path.
  const real = orElse(() => realpathSync(path), path);
  const size = sizeOf(path);
  const line: Line = (verb, why) => `${verb.padEnd(6)} ${name} ${size}: ${why}`;
  const stays = standing(
    owners,
    held,
    name,
    real === path ? [path] : [path, real]
  );
  if (stays) {
    return line(stays.verb, stays.why);
  }
  const info = lstatSync(path);
  return info.isDirectory() && existsSync(join(path, ".git"))
    ? clearCheckout(options, path, name, line)
    : moveWhole(options, path, name, line);
};

const main = (): void => {
  const options = optionsOf(process.argv.slice(2));
  const client = new Database(options.db, { readonly: true });
  const machineId = machineOf(client, options.machine);
  const owners = ownersOf(client, machineId);
  client.close();
  const held = openPaths();
  const names = readdirSync(options.root).sort();
  console.log(
    `${options.apply ? "Cleaning" : "Dry run of"} ${options.root} on machine ${machineId}, read from ${options.db}: ${names.length} entries`
  );
  const counts = new Map<string, number>();
  for (const name of names) {
    const done = handle(options, owners, held, name);
    const verb = done.split(" ")[0] ?? "";
    counts.set(verb, (counts.get(verb) ?? 0) + 1);
    console.log(done);
  }
  console.log(
    [...counts].map(([verb, count]) => `${verb} ${count}`).join(", ")
  );
  if (!options.apply) {
    console.log("Nothing was changed. Run again with --apply to do it.");
  }
};

main();
