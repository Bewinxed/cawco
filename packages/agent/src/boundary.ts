/**
 * A delegation workspace's boundary, on the machine that holds it: the one
 * place every shell command of the workspace's work items runs. Inside it a
 * command sees and signals only its own workspace's processes, cannot reach
 * the user's service manager, and writes only the workspace's clone, its
 * scratch dir (its `/tmp`, on disk at `~/.cawco/workspaces/<id>/tmp`, which no
 * command inside can remove) and the package caches. On macOS, build tools
 * also write in the user's temp/cache folders, DerivedData and SwiftPM folders.
 * The network is the host's, so the hub and the internet stay reachable.
 *
 * Linux: one anchor per workspace — a user, pid and mount namespace whose
 * tree is read-only but for those paths, with the user runtime dir (the
 * service manager's bus, sessiond's socket) swapped for a private one — that
 * every command joins with `nsenter`. macOS: one `sandbox-exec` runner per
 * workspace that runs each command it is handed; Seatbelt keeps its signals
 * inside its own sandbox and its writes inside the workspace, and refuses
 * `launchctl`. macOS has no private pid or port space to give it.
 *
 * sessiond holds both, so an agent restart leaves them — and every process
 * in them — running, as it leaves the sessions. A machine that cannot hold a
 * boundary refuses the work: a work item never runs without one.
 *
 * Each workspace's executor is a script, `~/.cawco/workspaces/<id>/exec
 * [--cwd-out FILE] COMMAND`, that every harness runs its shell commands
 * through: claude by a PreToolUse hook that rewrites the command (the
 * workspace's `hook` script, which runs `boundary-hook.ts`), OpenCode by its
 * plugin's `bash` tool, pi by its bash tool's operations. The GitHub CLI's
 * keyring sits behind the bus the boundary hides, so the executor reads its
 * token on the host side and hands it in as `GH_TOKEN`: pushes and `gh` keep
 * working inside.
 */
import { constants } from "node:fs";
import {
  access,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { WorkspaceRef } from "@cawco/core";
import { WORKSPACE_BOUNDARY_START_TIMEOUT_MS } from "@cawco/core";
import { binaryRoot } from "@cawco/core/binary-installation";
import { sessionIdentityDir } from "@cawco/core/paths";
import { standalone } from "@cawco/core/runtime";
import { type ProcSpec, sessiondEndpoint } from "@cawco/core/sessiond";
import { cloneInPlace } from "./clone";
import { procIdFor } from "./proc-id";
import { ensureSessiond, SessiondClient } from "./sessiond-client";

/** A running boundary, as a harness uses it. */
export interface Boundary {
  /** `exec [--cwd-out FILE] COMMAND`: runs COMMAND inside the boundary, in the caller's directory. */
  readonly exec: string;
  /** The PreToolUse hook a claude session runs before each shell tool call ({@link hookScript}). */
  readonly hook: string;
  /** The anchor (Linux) or runner (macOS) process. */
  readonly pid: number;
  /** The workspace's scratch dir, its `/tmp`: `~/.cawco/workspaces/<id>/tmp`, on disk and outside the clone. */
  readonly scratch: string;
}

/** What `boundary.json` keeps: the boundary, and what proves it is still the one this machine started. */
interface Held extends Boundary {
  /** Linux: the anchor's user namespace, as `/proc/<pid>/ns/user` names it. macOS: `runner`. */
  readonly identity: string;
  readonly path: string;
  /** macOS runners from before session credentials must be replaced while shell-idle. */
  readonly secretsMasked?: boolean;
}

/** Where a workspace's boundary keeps its executor and state; read-only inside the boundary. */
export const workspacesDir = (): string =>
  join(homedir(), ".cawco", "workspaces");
const stateDir = (id: string): string => join(workspacesDir(), id);

/**
 * A workspace's scratch dir: beside its state, so on disk (never tmpfs) and
 * outside its clone (never in git status). A command inside the boundary
 * writes in it but cannot remove it: on Linux it is a mountpoint, on macOS
 * Seatbelt refuses its unlink.
 */
const scratchOf = (id: string): string => join(stateDir(id), "tmp");

/** The disk behind a Linux boundary's private user runtime dir. */
const runOf = (id: string): string => join(stateDir(id), "run");

const SSH_INCLUDES = "/etc/ssh/ssh_config.d";

/**
 * A Linux boundary's copy of the host's ssh includes, owned by the user, or
 * "" on a host without them. Rewritten on every start, so it follows the host.
 */
const copySshIncludes = async (id: string): Promise<string> => {
  const names = await readdir(SSH_INCLUDES).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return;
      }
      throw error;
    }
  );
  if (!names) {
    return "";
  }
  const copy = join(stateDir(id), "ssh_config.d");
  await rm(copy, { recursive: true, force: true });
  await mkdir(copy, { recursive: true });
  await Promise.all(
    names
      .filter((name) => name.endsWith(".conf"))
      .map(async (name) =>
        writeFile(join(copy, name), await readFile(join(SSH_INCLUDES, name)), {
          mode: 0o644,
        })
      )
  );
  return copy;
};

const WHITESPACE = /\s+/;

/** The line a boundary prints once a command can join it. */
const READY = "cawco-boundary-ready";
const STOP_TIMEOUT_MS = 2000;

/** The package caches a command may write, so installs, builds and Playwright keep working. */
const cachesOf = (): string[] => [
  join(homedir(), ".cache"),
  join(homedir(), ".bun"),
  join(homedir(), ".npm"),
  // Playwright's browsers and most tools' caches live here on macOS.
  ...(process.platform === "darwin"
    ? [
        join(homedir(), "Library", "Caches"),
        join(homedir(), "Library", "Developer", "Xcode", "DerivedData"),
        join(homedir(), ".swiftpm"),
        join(homedir(), "Library", "org.swift.swiftpm"),
      ]
    : []),
];

export const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

/** `command`, as it runs inside the boundary. */
export const boundaryCommand = (boundary: Boundary, command: string): string =>
  `${shellQuote(boundary.exec)} ${shellQuote(command)}`;

/**
 * How long the hook's own run of cawco may take before the hook kills it and
 * refuses the command. Well under {@link HOOK_TIMEOUT_S}: Claude Code lets the
 * call through when it times a hook out ("A timed-out `command`… hook doesn't
 * block the tool call", code.claude.com/docs/en/hooks#timeouts), so the hook
 * always answers first.
 */
const HOOK_LIMIT_S = 30;

/** Claude Code's own limit on the boundary hook, in seconds; its default is 600. */
const HOOK_TIMEOUT_S = 90;

/**
 * The workspace's PreToolUse hook: has cawco rewrite the call's command to run
 * through the executor, and refuses the call every way that can fail. Claude
 * Code blocks a call only on exit 2: any other failure — a missing binary, a
 * crash, a signal — is a "non-blocking error" and the command runs as it was
 * written, outside the boundary (code.claude.com/docs/en/hooks#exit-code-2).
 * So every status but 0 becomes 2, and a run that hangs is killed at
 * {@link HOOK_LIMIT_S} and refused too. The first line it writes names the
 * hook, so a failure the CLI reports is known as this one's.
 *
 * It names cawco by a path no update deletes: the binary install's `run`
 * wrapper, which execs whatever `current` names, or, in a checkout, bun on
 * the CLI's source. The CLI keeps the hook command it launched with for as
 * long as it lives, and outlives the agent that started it; a hook naming the
 * agent's own versioned binary stopped resolving once an update pruned that
 * version, and every command then ran outside the boundary.
 */
const hookScript = (
  id: string,
  runner: string[],
  exec: string,
  scratch: string
): string => `#!/bin/sh
# CawCo workspace ${id}: the PreToolUse hook its claude sessions run before each
# shell tool call. Any status but 0 refuses the call (exit 2).
echo "cawco boundary hook $0" >&2
exec 3<&0
${[...runner, "boundary-hook", exec, scratch].map(shellQuote).join(" ")} <&3 3<&- &
hook=$!
(
  trap 'kill "$timer" 2>/dev/null; exit 0' TERM
  sleep ${HOOK_LIMIT_S} & timer=$!
  wait "$timer" && kill -KILL "$hook" 2>/dev/null
) </dev/null >/dev/null 2>&1 &
watchdog=$!
wait "$hook"
status=$?
kill "$watchdog" 2>/dev/null
[ "$status" -eq 0 ] && exit 0
echo "cawco: the boundary hook $0 failed (status $status), so this command did not run" >&2
exit 2
`;

/**
 * How the hook reaches cawco: `<binary root>/run` in a binary install, bun on
 * `packages/cli/src/cli.ts` in a checkout. Refuses the workspace when that is
 * not there, rather than writing a hook that refuses every command.
 */
const hookRunner = async (id: string): Promise<string[]> => {
  const runner = standalone
    ? [join(binaryRoot(), "run")]
    : [
        process.execPath,
        join(import.meta.dir, "..", "..", "cli", "src", "cli.ts"),
      ];
  const target = runner.at(-1) as string;
  await access(target, standalone ? constants.X_OK : constants.R_OK).catch(
    () => {
      throw refusal(
        id,
        `${target} is not there, so its boundary hook could not reach cawco`
      );
    }
  );
  return runner;
};

/** Writes `path` whole or not at all: a reader never sees it half written. */
const writeWhole = async (
  path: string,
  content: string,
  mode: number
): Promise<void> => {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode });
  await rename(temporary, path);
};

/** Writes the workspace's hook for `held`, and the record of it. */
const armHook = async (id: string, held: Omit<Held, "hook">): Promise<Held> => {
  const hook = join(stateDir(id), "hook");
  await writeWhole(
    hook,
    hookScript(id, await hookRunner(id), held.exec, held.scratch),
    0o755
  );
  const armed: Held = { ...held, hook };
  await writeWhole(
    join(stateDir(id), "boundary.json"),
    `${JSON.stringify(armed)}\n`,
    0o644
  );
  return armed;
};

/**
 * The `query()` options that bound a claude session, none for a session with
 * no boundary: flag settings with a PreToolUse hook on every shell tool that
 * rewrites its command through the executor, and the hook events in the
 * stream, which is how the session hears that the hook failed. The CLI runs
 * the hook itself, so it holds while the agent that started the session
 * restarts; a local settings file cannot turn it off, because flag settings
 * outrank it. `|| exit 2` refuses the call when the hook script itself is
 * gone (the shell's 127 would let it through).
 */
export const claudeBoundaryOptions = (boundary: Boundary | undefined) =>
  boundary
    ? {
        includeHookEvents: true,
        settings: {
          disableAllHooks: false,
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash|Monitor",
                hooks: [
                  {
                    type: "command" as const,
                    command: `${shellQuote(boundary.hook)} || exit 2`,
                    timeout: HOOK_TIMEOUT_S,
                  },
                ],
              },
            ],
          },
        },
      }
    : {};

/** The boundary hook's entry in the `--settings` JSON {@link claudeBoundaryOptions} launches a CLI with: its command, still JSON-quoted. */
const LAUNCHED_HOOK =
  /"matcher":"Bash\|Monitor","hooks":\[\{"type":"command","command":("(?:[^"\\]|\\.)*")/;
const HOOK_COMMAND = /^'([^']+\/hook)' \|\| exit 2$/;

/**
 * The boundary hook the claude CLI `pid` was launched with, read off its
 * command line: `hook` for one launched with a workspace's {@link hookScript},
 * `stale` for any other boundary hook — the form before the script named
 * cawco's versioned binary, which an update deletes — and nothing for a CLI
 * launched without a boundary.
 */
export const launchedHook = async (
  pid: number
): Promise<{ hook: string } | "stale" | undefined> => {
  const commandLine =
    process.platform === "linux"
      ? (await readFile(`/proc/${pid}/cmdline`, "utf8")).replaceAll("\0", " ")
      : (await Bun.$`ps -ww -o args= -p ${pid}`.quiet()).text();
  const quoted = LAUNCHED_HOOK.exec(commandLine)?.[1];
  if (!quoted) {
    return;
  }
  const hook = HOOK_COMMAND.exec(JSON.parse(quoted) as string)?.[1];
  return hook ? { hook } : "stale";
};

/** The boundary a spawn is bounded to, running; none for a spawn without a workspace. */
export const boundaryFor = (
  workspace: WorkspaceRef | undefined
): Promise<Boundary | undefined> =>
  workspace ? ensureBoundary(workspace) : Promise.resolve(undefined);

const sessiondPath = (): string =>
  process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint();

let connection: Promise<SessiondClient> | undefined;

/** This module's own sessiond connection, dialled on first use. */
const sessiond = async (): Promise<SessiondClient> => {
  const open = await connection?.catch(() => undefined);
  if (open && !open.closed) {
    return open;
  }
  const endpoint = sessiondPath();
  connection = (async () => {
    await ensureSessiond(endpoint);
    return SessiondClient.connect(endpoint);
  })();
  return connection;
};

const refusal = (id: string, why: string): Error =>
  new Error(`workspace ${id} cannot run a delegate on this machine: ${why}`);

const userNamespaceOf = (pid: number): Promise<string | undefined> =>
  readlink(`/proc/${pid}/ns/user`).catch(() => undefined);

const readHeld = async (id: string): Promise<Held | undefined> => {
  const text = await readFile(
    join(stateDir(id), "boundary.json"),
    "utf8"
  ).catch(() => undefined);
  return text ? (JSON.parse(text) as Held) : undefined;
};

/** Whether sessiond holds a live process under `procId`. */
const holding = async (
  client: SessiondClient,
  procId: string
): Promise<boolean> =>
  (await client.list()).procs.some(
    (candidate) => candidate.procId === procId && candidate.alive
  );

/** Whether the boundary `held` names is the one sessiond is still running. */
const running = async (
  client: SessiondClient,
  id: string,
  held: Held
): Promise<boolean> => {
  const proc = (await client.list()).procs.find(
    (candidate) => candidate.procId === procIdFor("boundary", id)
  );
  if (!proc?.alive) {
    return false;
  }
  return process.platform === "linux"
    ? (await userNamespaceOf(held.pid)) === held.identity
    : proc.pid === held.pid;
};

const starting = new Map<string, Promise<Boundary>>();

/**
 * The workspace's boundary, running: the one already held, or a new one
 * (after a reboot or a sessiond restart). Throws — with the reason — when
 * this machine cannot hold one.
 */
export const ensureBoundary = (ref: WorkspaceRef): Promise<Boundary> => {
  const pending = starting.get(ref.id);
  if (pending) {
    return pending;
  }
  const started = ensure(ref).finally(() => starting.delete(ref.id));
  starting.set(ref.id, started);
  return started;
};

const ensure = async (ref: WorkspaceRef): Promise<Boundary> => {
  if (process.platform !== "linux" && process.platform !== "darwin") {
    throw refusal(
      ref.id,
      `workspace boundaries run on Linux and macOS, and this machine runs ${process.platform}`
    );
  }
  const git = await stat(join(ref.path, ".git")).catch(() => undefined);
  if (!git) {
    throw refusal(ref.id, `${ref.path} is not a git checkout`);
  }
  // A workspace from before clones — a spawn racing the agent's start-up
  // pass over them — becomes one first: a worktree's commits would land in
  // the repository it was cut from, which the boundary keeps read-only.
  if (!git.isDirectory()) {
    await cloneInPlace(ref.path);
  }
  const client = await sessiond();
  const held = await readHeld(ref.id);
  if (held && (await running(client, ref.id, held))) {
    if (process.platform !== "darwin" || held.secretsMasked) {
      // Written again each time: one an earlier agent started may have no
      // hook yet, or one that reaches cawco another way.
      return armHook(ref.id, held);
    }
    const listing = await Bun.$`ps -axwwE -o pid=,command=`.quiet();
    const active = listing
      .text()
      .split("\n")
      .some(
        (line) =>
          line.includes(`CAWCO_WORKSPACE=${ref.id}`) &&
          Number.parseInt(line.trim(), 10) !== held.pid
      );
    if (active) {
      throw refusal(
        ref.id,
        "secret masking waits for every old shell command and background process to finish"
      );
    }
    // Only the idle runner remains; retaining the harness does not retain a shell with old read access.
    await client.signal(procIdFor("boundary", ref.id), "SIGKILL");
  }
  return start(client, ref);
};

/**
 * The anchor's setup, run as root of a fresh user namespace (so the mounts
 * are allowed) with its own pid and mount namespaces. Everything goes
 * read-only — the kernel's `mount_setattr(AT_RECURSIVE)`, called directly:
 * util-linux's `ro=recursive` is that call only where libmount was built with
 * the new mount API (2.42 here), and elsewhere (2.41.3, Ubuntu's) it exits 0
 * having remounted `/` alone, every mount under it still writable — so the
 * anchor checks that none is left writable, and refuses otherwise. The
 * writable paths come back, the scratch dir becomes `/tmp`
 * (and stays writable at its own path, where the executor's `--cwd-out`
 * files land; a mountpoint both places, so nothing inside can remove it),
 * the user runtime dir becomes a private one, sessiond's directory an empty
 * one, `/dev/shm` a private tmpfs (Chromium needs it). The scratch and run
 * dirs are bound read-write onto themselves first and `/tmp` and the runtime
 * dir are binds of those, so they come up read-write: a remount aimed at
 * `/tmp` itself is refused, because libmount reads the flags of the host
 * mount beneath it and asks the kernel to change a locked atime flag. The
 * host's ssh includes are replaced by the user's own copy of them, because
 * host root shows up as nobody here and ssh refuses an included file no
 * longer owned by root or the user. Then a nested
 * user namespace maps the user back to their own uid — tools see who they
 * always see, not root — and its own mount namespace locks every mount above.
 * The anchor is that namespace's PID 1: a bash loop, which reaps the orphans
 * a command leaves, printing {@link READY} once a command can join it.
 */
const ANCHOR = `exec 2>&1
set -eu
ws=$1 scratch=$2 run=$3 uid=$4 gid=$5 runtime=$6 hidden=$7 ssh=$8 home=$9
shift 9
# mount_setattr (syscall 442 on x86_64 and arm64): AT_FDCWD "/", AT_RECURSIVE, attr_set MOUNT_ATTR_RDONLY
perl -e 'my ($path, $attr) = ("/", pack("Q4", 1, 0, 0, 0)); syscall(442, -100, $path, 0x8000, $attr, 32) == 0 or die "mount_setattr: $!"'
writable=$(awk '$6 !~ /(^|,)ro(,|$)/ { print $5 }' /proc/self/mountinfo)
if [ -n "$writable" ]; then echo "these mounts stayed writable: $writable"; exit 1; fi
mount -o remount,rw /proc
for path in "$ws" "$scratch" "$run" "$@"; do
  mount --bind "$path" "$path"
  mount -o remount,bind,rw "$path"
done
mount --bind "$scratch" /tmp
if [ -n "$runtime" ] && [ -d "$runtime" ]; then mount --bind "$run" "$runtime"; fi
if [ -n "$hidden" ] && [ -d "$hidden" ]; then mount -t tmpfs -o size=4k,mode=0555 hidden "$hidden"; fi
mask=$(mktemp -d "$run/auth-mask.XXXXXX")
mount -t tmpfs -o size=4k,mode=0700,uid=0,gid=0 auth-mask "$mask"
touch "$mask/empty"
mount -o remount,bind,ro "$mask"
for path in "$home/.claude/.credentials.json" "$home/.local/share/opencode/auth.json" "$home/.pi/agent/auth.json"; do
  if [ -f "$path" ]; then
    mount --bind "$mask/empty" "$path"
    mount -o remount,bind,ro "$path"
  fi
done
if [ -d "$home/.cli-proxy-api" ]; then mount -t tmpfs -o size=4k,mode=0555 hidden "$home/.cli-proxy-api"; fi
if [ -n "$ssh" ]; then mount --bind "$ssh" ${SSH_INCLUDES}; fi
mount -t tmpfs -o mode=1777,nosuid,nodev shm /dev/shm
exec unshare --user --mount --map-user="$uid" --map-group="$gid" bash -c 'echo ${READY}; while :; do sleep 86400 & wait; done'`;

/** A directory to hide, unless the workspace or a cache lives under it. */
const hideable = (dir: string, kept: string[]): string =>
  kept.some((path) => path === dir || path.startsWith(`${dir}/`)) ? "" : dir;

const linuxSpec = async (
  ref: WorkspaceRef,
  scratch: string,
  run: string,
  ssh: string,
  caches: string[]
): Promise<ProcSpec> => {
  const runtime = process.env.XDG_RUNTIME_DIR ?? "";
  // The repository the clone reads its objects from stays visible too.
  const alternates = await readFile(
    join(ref.path, ".git", "objects", "info", "alternates"),
    "utf8"
  ).catch(() => "");
  const kept = [
    ref.path,
    ...caches,
    ...alternates.split("\n").filter((line) => line.startsWith("/")),
  ];
  return {
    command: "unshare",
    args: [
      "--user",
      "--map-root-user",
      "--pid",
      "--mount",
      "--fork",
      "--mount-proc",
      "--propagation",
      "private",
      // The unshare process going (sessiond draining it) takes the anchor, and
      // with it every process in the workspace.
      "--kill-child=SIGKILL",
      "bash",
      "-c",
      ANCHOR,
      "cawco-boundary",
      ref.path,
      scratch,
      run,
      String(process.getuid?.() ?? 0),
      String(process.getgid?.() ?? 0),
      hideable(runtime, kept),
      hideable(dirname(sessiondPath()), kept),
      ssh,
      homedir(),
      ...caches,
    ],
  };
};

/**
 * The macOS runner: reads request directories off its FIFO and runs each in
 * its own process group, inside this sandbox. A request carries the command,
 * the caller's directory and environment; the runner leaves the exit status
 * and the directory the command ended in beside them. The FIFO is opened
 * read-only (a write would be refused outside the workspace) and reopened
 * after each writer closes it.
 */
const RUNNER = `fifo=$1
echo ${READY}
while :; do
  while IFS= read -r req; do
    (
      /usr/bin/perl -e 'setpgrp(0, 0); exec @ARGV' /bin/bash --norc --noprofile -c '. "$1/env" >/dev/null 2>&1; cd "$(cat "$1/cwd")" || exit 1; eval "$(cat "$1/cmd")"; status=$?; pwd -P > "$1/cwd-out"; exit $status' cawco "$req" > "$req/out" 2> "$req/err" < /dev/null &
      echo $! > "$req/pid"
      wait $!
      echo $? > "$req/status"
    ) &
  done < "$fifo"
done`;

const sbString = (path: string): string =>
  `"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

/** Resolve existing ancestors too, so an absent sign-in file still has a deny rule. */
const secretRealpath = async (path: string): Promise<string> => {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    return join(await secretRealpath(dirname(path)), basename(path));
  }
};

/**
 * The Seatbelt profile for one workspace. Paths are real paths: Seatbelt
 * matches the resolved path, so a rule on a symlink never fires (a Mac's
 * `~/.cawco` has been one).
 */
const profileOf = async (
  ws: string,
  scratch: string,
  caches: string[]
): Promise<string> => {
  const scratchPath = await realpath(scratch);
  const secretsPath = await realpath(sessionIdentityDir());
  const signInPaths = await Promise.all(
    [
      join(homedir(), ".claude", ".credentials.json"),
      join(homedir(), ".local", "share", "opencode", "auth.json"),
      join(homedir(), ".pi", "agent", "auth.json"),
      join(homedir(), ".cli-proxy-api"),
    ].map(secretRealpath)
  );
  const userDirs = await Promise.all(
    ["DARWIN_USER_TEMP_DIR", "DARWIN_USER_CACHE_DIR"].map(async (name) => {
      const path = (await Bun.$`getconf ${name}`.quiet()).text().trim();
      if (!path.startsWith("/")) {
        throw new Error(`getconf ${name} did not return an absolute path`);
      }
      return path;
    })
  );
  const writable = await Promise.all(
    [ws, ...caches, ...userDirs].map((path) => realpath(path))
  );
  const sockets = await Promise.all(
    [dirname(workspacesDir()), dirname(sessiondPath())].map((path) =>
      realpath(path).catch(() => path)
    )
  );
  return [
    "(version 1)",
    "(allow default)",
    "(deny signal)",
    "(allow signal (target same-sandbox))",
    "(deny file-write*)",
    `(deny file-read* (subpath ${sbString(secretsPath)}))`,
    ...signInPaths.map(
      (path) => `(deny file-read* (subpath ${sbString(path)}))`
    ),
    "(allow file-write*",
    ...[...writable, scratchPath].map(
      (path) => `  (subpath ${sbString(path)})`
    ),
    '  (literal "/dev/null") (literal "/dev/zero") (literal "/dev/dtracehelper")',
    '  (regex #"^/dev/tty") (regex #"^/dev/fd/"))',
    // Its contents are the workspace's to write; the scratch dir itself stays.
    `(deny file-write-unlink (literal ${sbString(scratchPath)}))`,
    '(deny process-exec (literal "/bin/launchctl"))',
    ...[...new Set(sockets)].map(
      (path) =>
        `(deny network-outbound (remote unix-socket (subpath ${sbString(path)})))`
    ),
    "",
  ].join("\n");
};

const darwinSpec = async (
  ref: WorkspaceRef,
  dir: string,
  scratch: string,
  caches: string[]
): Promise<ProcSpec> => {
  const fifo = join(dir, "runner.fifo");
  await rm(fifo, { force: true });
  const made = await Bun.$`mkfifo ${fifo}`.quiet().nothrow();
  if (made.exitCode !== 0) {
    throw refusal(ref.id, `mkfifo failed: ${made.stderr.toString().trim()}`);
  }
  const profile = join(dir, "boundary.sb");
  await writeFile(profile, await profileOf(ref.path, scratch, caches));
  return {
    command: "/usr/bin/sandbox-exec",
    args: [
      "-f",
      profile,
      "/bin/bash",
      "--norc",
      "--noprofile",
      "-c",
      RUNNER,
      "cawco-boundary",
      fifo,
    ],
    // The marker is how an archive finds every process the workspace started.
    env: { CAWCO_WORKSPACE: ref.id, TMPDIR: scratch },
  };
};

/** Waits for the boundary's {@link READY} line; its own words if it dies first. */
const ready = (client: SessiondClient, procId: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const said: string[] = [];
    const words = (): string => (said.length ? `: ${said.join(" / ")}` : "");
    const finish = (error?: Error): void => {
      clearTimeout(timer);
      client.unsubscribe(procId);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            `the boundary did not start within ${WORKSPACE_BOUNDARY_START_TIMEOUT_MS / 1000}s${words()}`
          )
        ),
      WORKSPACE_BOUNDARY_START_TIMEOUT_MS
    );
    client.subscribe(
      procId,
      {
        line: (event) => {
          const line = event.data.trim();
          if (line === READY) {
            finish();
          } else if (line) {
            said.push(line);
          }
        },
        exit: (code, signal) =>
          finish(
            new Error(
              `the boundary exited (${signal ?? `code ${code}`}) as it started${words()}`
            )
          ),
      },
      0
    );
  });

/** The command token for `gh`, read on the host, where the keyring is. */
const GH_TOKEN = `if [ -z "\${GH_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  token=$(gh auth token 2>/dev/null) && [ -n "$token" ] && GH_TOKEN=$token && export GH_TOKEN
fi`;

const stoppedLine = (id: string): string =>
  `cawco: workspace ${id}'s boundary is not running, so this command did not run. The workspace's next session starts it again.`;

const linuxExec = (
  id: string,
  pid: number,
  identity: string
): string => `#!/bin/sh
# CawCo workspace ${id}: runs one shell command inside the workspace's boundary.
# exec [--cwd-out FILE] COMMAND — FILE gets the directory COMMAND ended in.
anchor=${pid}
if [ "$(readlink /proc/$anchor/ns/user 2>/dev/null)" != ${shellQuote(identity)} ]; then
  echo ${shellQuote(stoppedLine(id))} >&2
  exit 126
fi
cwd_out=
if [ "$1" = --cwd-out ]; then cwd_out=$2; shift 2; fi
${GH_TOKEN}
exec nsenter --user --mount --pid --preserve-credentials --target "$anchor" --wdns="$PWD" \\
  env TMPDIR=/tmp bash -c 'eval "$1"; status=$?; [ -z "$2" ] || pwd -P > "$2"; exit $status' cawco "$1" "$cwd_out"
`;

const darwinExec = (
  id: string,
  pid: number,
  fifo: string,
  scratch: string
): string => `#!/bin/bash
# CawCo workspace ${id}: runs one shell command inside the workspace's boundary.
# exec [--cwd-out FILE] COMMAND — FILE gets the directory COMMAND ended in.
fifo=${shellQuote(fifo)}
if ! [ -p "$fifo" ] || ! kill -0 ${pid} 2>/dev/null; then
  echo ${shellQuote(stoppedLine(id))} >&2
  exit 126
fi
cwd_out=
if [ "$1" = --cwd-out ]; then cwd_out=$2; shift 2; fi
${GH_TOKEN}
req=$(mktemp -d ${shellQuote(scratch)}/.run.XXXXXX) || exit 126
printf '%s' "$1" > "$req/cmd"
pwd -P > "$req/cwd"
{ export -p; echo "export TMPDIR=${scratch}"; } > "$req/env"
mkfifo "$req/out" "$req/err"
trap 'kill -TERM -- "-$(cat "$req/pid" 2>/dev/null)" 2>/dev/null; rm -rf "$req"; exit 143' TERM INT HUP
printf '%s\\n' "$req" > "$fifo"
cat "$req/out" & out=$!
cat "$req/err" >&2 & err=$!
wait "$out" "$err"
until [ -s "$req/status" ]; do sleep 0.02; done
status=$(cat "$req/status")
if [ -n "$cwd_out" ] && [ -s "$req/cwd-out" ]; then cp "$req/cwd-out" "$cwd_out"; fi
rm -rf "$req"
exit "$status"
`;

/** Starts the workspace's boundary under sessiond and writes its executor. */
const start = async (
  client: SessiondClient,
  ref: WorkspaceRef
): Promise<Boundary> => {
  const dir = stateDir(ref.id);
  const scratch = scratchOf(ref.id);
  const linux = process.platform === "linux";
  const run = runOf(ref.id);
  const caches = cachesOf();
  await mkdir(sessionIdentityDir(), { recursive: true, mode: 0o700 });
  await Promise.all(
    [dir, scratch, ...(linux ? [run] : []), ...caches].map((path) =>
      mkdir(path, { recursive: true })
    )
  );
  const procId = procIdFor("boundary", ref.id);
  // One this machine can no longer vouch for (its record is gone or names
  // another process) is replaced, never joined.
  if (await holding(client, procId)) {
    await client.signal(procId, "SIGKILL");
  }
  const spec = linux
    ? await linuxSpec(ref, scratch, run, await copySshIncludes(ref.id), caches)
    : await darwinSpec(ref, dir, scratch, caches);
  await client.spawnProc(procId, spec);
  await ready(client, procId).catch((error: Error) => {
    throw refusal(ref.id, error.message);
  });
  const proc = (await client.list()).procs.find(
    (candidate) => candidate.procId === procId
  );
  if (!proc?.alive) {
    throw refusal(ref.id, "the boundary exited right after it started");
  }
  let held: Omit<Held, "hook">;
  const exec = join(dir, "exec");
  if (linux) {
    // sessiond's child is the unshare process; the anchor is its one child.
    const children = await readFile(
      `/proc/${proc.pid}/task/${proc.pid}/children`,
      "utf8"
    );
    const pid = Number.parseInt(children.trim().split(WHITESPACE)[0] ?? "", 10);
    const identity = Number.isNaN(pid) ? undefined : await userNamespaceOf(pid);
    if (!identity || identity === (await readlink("/proc/self/ns/user"))) {
      throw refusal(
        ref.id,
        `the anchor under ${proc.pid} is not in a namespace of its own`
      );
    }
    held = {
      exec,
      pid,
      scratch,
      identity,
      path: ref.path,
      secretsMasked: true,
    };
    await writeWhole(exec, linuxExec(ref.id, pid, identity), 0o755);
  } else {
    held = {
      exec,
      pid: proc.pid,
      scratch,
      identity: "runner",
      path: ref.path,
      secretsMasked: true,
    };
    await writeWhole(
      exec,
      darwinExec(ref.id, proc.pid, join(dir, "runner.fifo"), scratch),
      0o755
    );
  }
  return armHook(ref.id, held);
};

const kill = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(pid, signal);
  } catch {
    // already gone
  }
};

/** Every process a macOS workspace started, found by the marker its runner handed them all. */
const killMarked = async (id: string): Promise<void> => {
  const listing = await Bun.$`ps -axwwE -o pid=,command=`.quiet().nothrow();
  for (const line of listing.text().split("\n")) {
    if (line.includes(`CAWCO_WORKSPACE=${id}`)) {
      const pid = Number.parseInt(line.trim(), 10);
      if (pid && pid !== process.pid) {
        kill(pid, "SIGKILL");
      }
    }
  }
};

/**
 * Kills the workspace's boundary with every process in it: on Linux, SIGKILL
 * to the anchor — its namespace's PID 1, which ignores anything softer — takes
 * the whole namespace; on macOS the runner and everything carrying the
 * workspace's marker. Then its state goes.
 */
export const closeBoundary = async (ref: WorkspaceRef): Promise<void> => {
  const client = await sessiond();
  const held = await readHeld(ref.id);
  if (
    held &&
    process.platform === "linux" &&
    (await userNamespaceOf(held.pid)) === held.identity
  ) {
    kill(held.pid, "SIGKILL");
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    while (
      // biome-ignore lint/performance/noAwaitInLoops: polls one namespace until the kernel has torn it down, or the deadline passes
      (await userNamespaceOf(held.pid)) === held.identity &&
      Date.now() < deadline
    ) {
      await Bun.sleep(20);
    }
  }
  const procId = procIdFor("boundary", ref.id);
  if (await holding(client, procId)) {
    await client.signal(procId, "SIGKILL");
  }
  if (process.platform === "darwin") {
    await killMarked(ref.id);
  }
  await rm(stateDir(ref.id), { recursive: true, force: true });
};
