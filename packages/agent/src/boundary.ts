/**
 * A delegation workspace's boundary, on the machine that holds it: the one
 * place every shell command of the workspace's work items runs. Inside it a
 * command sees and signals only its own workspace's processes, cannot reach
 * the user's service manager, and writes only the workspace's clone, its
 * scratch dir (its `/tmp`, on disk under the clone) and the package caches.
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
 * Each workspace's executor is a script, `~/.whiffle/workspaces/<id>/exec
 * [--cwd-out FILE] COMMAND`, that every harness runs its shell commands
 * through: claude by a PreToolUse hook that rewrites the command
 * (`boundary-hook.ts`), OpenCode by its plugin's `bash` tool, pi by its bash
 * tool's operations. The GitHub CLI's keyring sits behind the bus the
 * boundary hides, so the executor reads its token on the host side and hands
 * it in as `GH_TOKEN`: pushes and `gh` keep working inside.
 */
import {
  mkdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { WorkspaceRef } from "@whiffle/core";
import { type ProcSpec, sessiondEndpoint } from "@whiffle/core/sessiond";
import { ensureSessiond, SessiondClient } from "./sessiond-client";

/** A running boundary, as a harness uses it. */
export interface Boundary {
  /** `exec [--cwd-out FILE] COMMAND`: runs COMMAND inside the boundary, in the caller's directory. */
  readonly exec: string;
  /** The anchor (Linux) or runner (macOS) process. */
  readonly pid: number;
  /** The workspace's scratch dir, on disk under its clone: its `/tmp`. */
  readonly scratch: string;
}

/** What `boundary.json` keeps: the boundary, and what proves it is still the one this machine started. */
interface Held extends Boundary {
  /** Linux: the anchor's user namespace, as `/proc/<pid>/ns/user` names it. macOS: `runner`. */
  readonly identity: string;
  readonly path: string;
}

/** Where a workspace's boundary keeps its executor and state; read-only inside the boundary. */
export const workspacesDir = (): string =>
  join(homedir(), ".whiffle", "workspaces");
const stateDir = (id: string): string => join(workspacesDir(), id);

/** A workspace's scratch dir: under its clone's `.git`, so on disk, never in git status. */
export const scratchOf = (path: string): string =>
  join(path, ".git", "whiffle-tmp");

const procIdOf = (id: string): string => `boundary-${id}`;

const WHITESPACE = /\s+/;

/** The line a boundary prints once a command can join it. */
const READY = "whiffle-boundary-ready";
const START_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 2000;

/** The package caches a command may write, so installs, builds and Playwright keep working. */
const cachesOf = (): string[] => [
  join(homedir(), ".cache"),
  join(homedir(), ".bun"),
  join(homedir(), ".npm"),
  // Playwright's browsers and most tools' caches live here on macOS.
  ...(process.platform === "darwin"
    ? [join(homedir(), "Library", "Caches")]
    : []),
];

export const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

/** `command`, as it runs inside the boundary. */
export const boundaryCommand = (boundary: Boundary, command: string): string =>
  `${shellQuote(boundary.exec)} ${shellQuote(command)}`;

/**
 * The `query()` options that bound a claude session, none for a session with
 * no boundary: flag settings with a PreToolUse hook on every shell tool that
 * rewrites its command through the executor. The CLI runs the hook itself, so
 * it holds while the agent that started the session restarts; a local
 * settings file cannot turn it off, because flag settings outrank it.
 */
export const claudeBoundaryOptions = (boundary: Boundary | undefined) =>
  boundary
    ? {
        settings: {
          disableAllHooks: false,
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash|Monitor",
                hooks: [
                  {
                    type: "command" as const,
                    command: [
                      process.execPath,
                      join(import.meta.dir, "boundary-hook.ts"),
                      boundary.exec,
                      boundary.scratch,
                    ]
                      .map(shellQuote)
                      .join(" "),
                  },
                ],
              },
            ],
          },
        },
      }
    : {};

/** The boundary a spawn is bounded to, running; none for a spawn without a workspace. */
export const boundaryFor = (
  workspace: WorkspaceRef | undefined
): Promise<Boundary | undefined> =>
  workspace ? ensureBoundary(workspace) : Promise.resolve(undefined);

const sessiondPath = (): string =>
  process.env.WHIFFLE_SESSIOND_ENDPOINT ?? sessiondEndpoint();

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
    (candidate) => candidate.procId === procIdOf(id)
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
  if (!git?.isDirectory()) {
    throw refusal(
      ref.id,
      git
        ? `${ref.path} is a git worktree from before workspaces were clones; its commits live in the repository it was cut from, which a bounded delegate cannot write. Start a new workspace.`
        : `${ref.path} is not a git checkout`
    );
  }
  const client = await sessiond();
  const held = await readHeld(ref.id);
  if (held && (await running(client, ref.id, held))) {
    return held;
  }
  return start(client, ref);
};

/**
 * The anchor's setup, run as root of a fresh user namespace (so the mounts
 * are allowed) with its own pid and mount namespaces. Everything goes
 * read-only, the writable paths come back, the scratch dir becomes `/tmp`,
 * the user runtime dir becomes a private one and sessiond's directory an
 * empty one, `/dev/shm` a private tmpfs (Chromium needs it). Then a nested
 * user namespace maps the user back to their own uid — tools see who they
 * always see, not root — and its own mount namespace locks every mount above.
 * The anchor is that namespace's PID 1: a bash loop, which reaps the orphans
 * a command leaves, printing {@link READY} once a command can join it.
 */
const ANCHOR = `exec 2>&1
set -eu
ws=$1 scratch=$2 uid=$3 gid=$4 runtime=$5 hidden=$6
shift 6
mount -o remount,bind,ro=recursive /
mount -o remount,rw /proc
for path in "$ws" "$@"; do
  mount --bind "$path" "$path"
  mount -o remount,bind,rw "$path"
done
mkdir -p "$scratch/.run"
mount --bind "$scratch" /tmp
if [ -n "$runtime" ] && [ -d "$runtime" ]; then mount --bind "$scratch/.run" "$runtime"; fi
if [ -n "$hidden" ] && [ -d "$hidden" ]; then mount -t tmpfs -o size=4k,mode=0555 hidden "$hidden"; fi
mount -t tmpfs -o mode=1777,nosuid,nodev shm /dev/shm
exec unshare --user --mount --map-user="$uid" --map-group="$gid" bash -c 'echo ${READY}; while :; do sleep 86400 & wait; done'`;

/** A directory to hide, unless the workspace or a cache lives under it. */
const hideable = (dir: string, kept: string[]): string =>
  kept.some((path) => path === dir || path.startsWith(`${dir}/`)) ? "" : dir;

const linuxSpec = async (
  ref: WorkspaceRef,
  scratch: string,
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
      "whiffle-boundary",
      ref.path,
      scratch,
      String(process.getuid?.() ?? 0),
      String(process.getgid?.() ?? 0),
      hideable(runtime, kept),
      hideable(dirname(sessiondPath()), kept),
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
      /usr/bin/perl -e 'setpgrp(0, 0); exec @ARGV' /bin/bash --norc --noprofile -c '. "$1/env" >/dev/null 2>&1; cd "$(cat "$1/cwd")" || exit 1; eval "$(cat "$1/cmd")"; status=$?; pwd -P > "$1/cwd-out"; exit $status' whiffle "$req" > "$req/out" 2> "$req/err" < /dev/null &
      echo $! > "$req/pid"
      wait $!
      echo $? > "$req/status"
    ) &
  done < "$fifo"
done`;

const sbString = (path: string): string =>
  `"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

/**
 * The Seatbelt profile for one workspace. Paths are real paths: Seatbelt
 * matches the resolved path, so a rule on a symlink never fires (a Mac's
 * `~/.whiffle` has been one).
 */
const profileOf = async (ws: string, caches: string[]): Promise<string> => {
  const writable = await Promise.all(
    [ws, ...caches].map((path) => realpath(path))
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
    "(allow file-write*",
    ...writable.map((path) => `  (subpath ${sbString(path)})`),
    '  (literal "/dev/null") (literal "/dev/zero") (literal "/dev/dtracehelper")',
    '  (regex #"^/dev/tty") (regex #"^/dev/fd/"))',
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
  await writeFile(profile, await profileOf(ref.path, caches));
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
      "whiffle-boundary",
      fifo,
    ],
    // The marker is how an archive finds every process the workspace started.
    env: { WHIFFLE_WORKSPACE: ref.id, TMPDIR: scratch },
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
            `the boundary did not start within ${START_TIMEOUT_MS / 1000}s${words()}`
          )
        ),
      START_TIMEOUT_MS
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
  `whiffle: workspace ${id}'s boundary is not running, so this command did not run. The workspace's next session starts it again.`;

const linuxExec = (
  id: string,
  pid: number,
  identity: string
): string => `#!/bin/sh
# Whiffle workspace ${id}: runs one shell command inside the workspace's boundary.
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
  env TMPDIR=/tmp bash -c 'eval "$1"; status=$?; [ -z "$2" ] || pwd -P > "$2"; exit $status' whiffle "$1" "$cwd_out"
`;

const darwinExec = (
  id: string,
  pid: number,
  fifo: string,
  scratch: string
): string => `#!/bin/bash
# Whiffle workspace ${id}: runs one shell command inside the workspace's boundary.
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
  const scratch = scratchOf(ref.path);
  const caches = cachesOf();
  await Promise.all(
    [dir, scratch, ...caches].map((path) => mkdir(path, { recursive: true }))
  );
  const procId = procIdOf(ref.id);
  // One this machine can no longer vouch for (its record is gone or names
  // another process) is replaced, never joined.
  if (await holding(client, procId)) {
    await client.signal(procId, "SIGKILL");
  }
  const spec =
    process.platform === "linux"
      ? await linuxSpec(ref, scratch, caches)
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
  let held: Held;
  const exec = join(dir, "exec");
  if (process.platform === "linux") {
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
    held = { exec, pid, scratch, identity, path: ref.path };
    await writeFile(exec, linuxExec(ref.id, pid, identity), { mode: 0o755 });
  } else {
    held = { exec, pid: proc.pid, scratch, identity: "runner", path: ref.path };
    await writeFile(
      exec,
      darwinExec(ref.id, proc.pid, join(dir, "runner.fifo"), scratch),
      {
        mode: 0o755,
      }
    );
  }
  await writeFile(join(dir, "boundary.json"), `${JSON.stringify(held)}\n`);
  return held;
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
    if (line.includes(`WHIFFLE_WORKSPACE=${id}`)) {
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
  const procId = procIdOf(ref.id);
  if (await holding(client, procId)) {
    await client.signal(procId, "SIGKILL");
  }
  if (process.platform === "darwin") {
    await killMarked(ref.id);
  }
  await rm(stateDir(ref.id), { recursive: true, force: true });
};
