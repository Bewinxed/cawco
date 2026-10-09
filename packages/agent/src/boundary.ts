/**
 * A delegation workspace's boundary, on the machine that holds it: the one
 * place every shell command of the workspace's work items runs. Inside it a
 * command sees and signals only its own workspace's processes, cannot reach
 * the user's service manager, and writes only the workspace's clone, its
 * scratch dir (its `/tmp`, on disk at `~/.cawco/workspaces/<id>/tmp`, which no
 * command inside can remove) and the workspaces' own cache
 * (`workspaceCacheDir`), where the executor points bun, npm, uv and
 * `XDG_CACHE_HOME`. Every host cache is read-only inside: a host process runs
 * what is in them, so a workspace that wrote one would run code outside. On
 * macOS, build tools also write in the user's temp/cache folders and the
 * provisioning profile folders automatic signing fills, and `swift`,
 * `xcodebuild` and `log` run through shims that keep them working inside and
 * point SwiftPM's and Xcode's caches at the workspaces' cache
 * ({@link writeShims}). The network is the host's, so the hub and the
 * internet stay reachable. The executor and the hook call every host tool by
 * an absolute path or a system PATH: `~/.bun/bin`, on a host process's PATH,
 * is only read-only inside, and nothing a workspace wrote must run outside.
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
 * in them — running, as it leaves the sessions. One started by an earlier
 * build, in another form, is replaced the first time nothing runs in it
 * ({@link replaceWhenIdle}). A machine that cannot hold a boundary refuses
 * the work: a work item never runs without one.
 *
 * Each workspace's executor is a script, `~/.cawco/workspaces/<id>/exec
 * [--cwd-out FILE] COMMAND`, that every harness runs its shell commands
 * through: claude by a PreToolUse hook that rewrites the command (the
 * workspace's `hook` script, which runs `boundary-hook.ts`), OpenCode by its
 * plugin's `bash` tool, pi by its bash tool's operations. The GitHub CLI's
 * keyring sits behind the bus the boundary hides, so the executor reads its
 * token on the host side and hands it in as `GH_TOKEN`: pushes and `gh` keep
 * working inside.
 *
 * Every store core's `credentialStores` names is hidden from every command.
 * Linux: each store that is a directory goes under an empty tmpfs as the
 * anchor starts, with what a command needs from beneath it bound back, and
 * each that is a file under an empty read-only file. The kernel drops a
 * file's mask in this namespace once the host renames a new file over it, as
 * a token refresh does; the srt cutover replaces this with a tmpfs over the
 * whole home dir. Before the anchor starts, every file in the clone that
 * shares an inode with another gets its own ({@link ownInodes}), so nothing
 * the workspace writes is a file the host runs. macOS: a Seatbelt deny on
 * each, the login keychain among them, and on every file named as secrets
 * are (`SECRET_FILE_NAME`) outside the workspace's own clone.
 *
 * No command holds a key or reaches a key agent: `~/.ssh` is a store, the
 * executor drops every agent socket's variable (`AGENT_SOCKET_ENV`), Linux's
 * private runtime dir and `/tmp` hold none of the host's sockets, and macOS
 * refuses a connect to one inside a store or to launchd's ssh-agent. A
 * workspace reaches another machine only through CawCo: a check that names
 * one runs in a workspace there (the hub's `runChecks`).
 */
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync } from "node:fs";
import {
  access,
  chmod,
  copyFile,
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
import {
  AGENT_SOCKET_ENV,
  credentialStores,
  SECRET_FILE_NAME,
  sessionIdentityDir,
  workspaceCacheDir,
  workspaceCacheEnv,
} from "@cawco/core/paths";
import {
  commandLine as commandLineOf,
  commandLines,
  processLineage,
} from "@cawco/core/process-identity";
import { embeddedFile, runtimeDataDir, standalone } from "@cawco/core/runtime";
import { type ProcSpec, sessiondEndpoint } from "@cawco/core/sessiond";
import { cloneInPlace } from "./clone";
import { logRelay } from "./log-relay";
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
  /**
   * The form the anchor or runner was started in ({@link formOf}). One of
   * another form, or of none, is replaced once it is idle ({@link ensure}).
   */
  readonly form?: string;
  /** Linux: the anchor's user namespace, as `/proc/<pid>/ns/user` names it. macOS: `runner`. */
  readonly identity: string;
  readonly path: string;
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

/** Where a Linux boundary keeps its copy of the host's ssh includes; "" on a host without them. */
const sshCopyOf = (id: string): string =>
  existsSync(SSH_INCLUDES) ? join(stateDir(id), "ssh_config.d") : "";

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
  const copy = sshCopyOf(id);
  if (!(names && copy)) {
    return "";
  }
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

/**
 * The caches a command may write, so installs and builds keep working: the
 * workspaces' own cache, which the executor points every tool at
 * (`workspaceCacheEnv`). Every host cache (`~/.cache`, `~/.bun`, `~/.npm`,
 * `~/Library/Caches`, Xcode's DerivedData, SwiftPM's) is read-only inside: a
 * host process runs what is in them.
 */
const cachesOf = (): string[] => [
  workspaceCacheDir(),
  ...(process.platform === "darwin"
    ? [
        // Where automatic signing keeps the provisioning profiles it fetches.
        join(
          homedir(),
          "Library",
          "Developer",
          "Xcode",
          "UserData",
          "Provisioning Profiles"
        ),
        join(homedir(), "Library", "MobileDevice", "Provisioning Profiles"),
      ]
    : []),
];

/**
 * What a command inside runs from beneath a credential store's directory (the
 * data dir holds both): the `cawco` CLI, and the runtime trees it reads.
 */
const keptInStores = (): string[] => [binaryRoot(), dirname(runtimeDataDir())];

export const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

/**
 * The PATH the executor, the hook and the anchor find their own tools on:
 * the system's dirs alone, which nothing inside a workspace writes. The
 * command itself runs with its caller's PATH.
 */
const SYSTEM_PATH = "/usr/sbin:/usr/bin:/sbin:/bin";

/** `command`, as it runs inside the boundary. */
export const boundaryCommand = (boundary: Boundary, command: string): string =>
  `${shellQuote(boundary.exec)} ${shellQuote(command)}`;

/** Claude Code's own limit on the boundary hook, in seconds; its default is 600. */
const HOOK_TIMEOUT_S = 90;

/**
 * How long the hook's run of `boundary-hook.ts` may take before the hook kills
 * it and refuses the command. Under {@link HOOK_TIMEOUT_S}, with 10s to spare:
 * Claude Code lets the call through when it times a hook out ("A timed-out
 * `command`… hook doesn't block the tool call",
 * code.claude.com/docs/en/hooks#timeouts), so the hook always answers first.
 * The run takes 15–60ms, even on a Mac at load 170.
 */
const HOOK_LIMIT_S = HOOK_TIMEOUT_S - 10;

/**
 * How the hook's refusal of a run that outlived {@link HOOK_LIMIT_S} begins.
 * That refusal stops only the one call. The model reads the line and runs the
 * command again, and the work item goes on (claude.ts `#watchBoundary`).
 */
export const BOUNDARY_HOOK_SLOW = "cawco: the boundary hook took longer than";

/**
 * The workspace's PreToolUse hook. It has `boundary-hook.ts` rewrite the
 * call's command to run through the executor, and refuses the call every way
 * that can fail. Claude Code blocks a call only on exit 2: any other failure
 * — a missing binary, a crash, a signal — is a "non-blocking error", and the
 * command runs as it was written, outside the boundary
 * (code.claude.com/docs/en/hooks#exit-code-2). So every status but 0 becomes
 * 2. A run that hangs is killed at {@link HOOK_LIMIT_S} and refused with
 * {@link BOUNDARY_HOOK_SLOW}, which refuses that call alone. Every other
 * failure says the hook failed. The first line it writes names the hook, so
 * a failure the CLI reports is known as this one's.
 *
 * It names its runtime by a path no update deletes: the binary install's
 * `run` wrapper, which execs whatever `current` names, or, in a checkout,
 * bun. The CLI keeps the hook command it launched with for as long as it
 * lives, and outlives the agent that started it. A hook that named the
 * agent's own versioned binary stopped resolving once an update pruned that
 * version, and every command then ran outside the boundary.
 *
 * The script runs on that runtime as plain Bun (`BUN_BE_BUN=1`), not as
 * cawco: cawco's start-up took over 30s on a loaded Mac, and the watchdog
 * then killed it. It runs from the state dir: Bun reads `bunfig.toml` (its
 * preloads) and `.env` from the directory it starts in, and the session's
 * own directory is the clone, which a command inside the boundary writes.
 */
const hookScript = (
  id: string,
  runner: Runner,
  exec: string,
  scratch: string
): string => `#!/bin/sh
# CawCo workspace ${id}: the PreToolUse hook its claude sessions run before each
# shell tool call. Any status but 0 refuses the call (exit 2).
PATH=${SYSTEM_PATH}
export PATH
echo "cawco boundary hook $0" >&2
cd ${shellQuote(stateDir(id))} || exit 2
exec 3<&0
${runner.env}${[...runner.argv, exec, scratch].map(shellQuote).join(" ")} <&3 3<&- &
hook=$!
(
  trap 'kill "$timer" 2>/dev/null; exit 1' TERM
  sleep ${HOOK_LIMIT_S} & timer=$!
  wait "$timer" && kill -KILL "$hook" 2>/dev/null
) </dev/null >/dev/null 2>&1 &
watchdog=$!
wait "$hook"
status=$?
kill "$watchdog" 2>/dev/null
[ "$status" -eq 0 ] && exit 0
if wait "$watchdog"; then
  echo "${BOUNDARY_HOOK_SLOW} ${HOOK_LIMIT_S}s on a loaded machine, so this command did not run. Run it again." >&2
  exit 2
fi
echo "cawco: the boundary hook $0 failed (status $status), so this command did not run" >&2
exit 2
`;

/** What the hook runs `boundary-hook.ts` with: an environment prefix for the shell, and the command. */
interface Runner {
  readonly argv: readonly string[];
  readonly env: string;
}

/**
 * Writes the hook's script into the workspace's state dir, and says how the
 * hook runs it: `BUN_BE_BUN=1 <binary root>/run` in a binary install, which
 * ships the script embedded; bun in a checkout, from its source. Refuses the
 * workspace when the runtime is not there, rather than writing a hook that
 * refuses every command.
 */
const hookRunner = async (id: string): Promise<Runner> => {
  const runtime = standalone
    ? join(binaryRoot(), "run")
    : (Bun.which("bun") ?? "bun");
  await access(runtime, constants.X_OK).catch(() => {
    throw refusal(
      id,
      `${runtime} is not there, so its boundary hook could not run`
    );
  });
  const source = await writeScript(id, "boundary-hook.ts", "boundary/hook.ts");
  return { env: standalone ? "BUN_BE_BUN=1 " : "", argv: [runtime, source] };
};

/**
 * Writes one of the plain Bun scripts the boundary runs into the workspace's
 * state dir, under its source name: from this checkout, or as the binary
 * install embedded it (scripts/build-binary.ts).
 */
const writeScript = async (
  id: string,
  name: string,
  embedded: string
): Promise<string> => {
  const path = join(stateDir(id), name);
  await writeWhole(
    path,
    await Bun.file(
      standalone ? embeddedFile(embedded) : join(import.meta.dir, name)
    ).text(),
    0o644
  );
  return path;
};

/** A macOS workspace's shims, first on the PATH of every command in its boundary: read-only inside. */
const shimsOf = (id: string): string => join(stateDir(id), "bin");

/**
 * The tools a macOS boundary runs in its own way, each a shim on its PATH.
 * macOS sandboxes do not nest: the boundary is Seatbelt's sandbox, so a tool
 * that makes one of its own inside it fails.
 *
 * - `swift build|test|run|package` gets `--disable-sandbox`: SwiftPM's
 *   "Disable using the sandbox when executing subprocesses"
 *   (docs.swift.org/…/packagemanagerdocs/swiftbuild), which also hands the
 *   compiler `-disable-sandbox` for macro servers
 *   (github.com/swiftlang/swift-package-manager/pull/7167). And its
 *   `--cache-path` and `--security-path` in the workspaces' cache: SwiftPM's
 *   own, in `~/Library`, are the host's and read-only here.
 * - `xcodebuild` gets the IDE defaults that turn off its package manifest and
 *   plugin sandboxes, as nixpkgs builds Xcode projects under its own sandbox,
 *   and `-disable-sandbox` in OTHER_SWIFT_FLAGS for macro plugin servers. Its
 *   DerivedData goes in the workspaces' cache through the
 *   `IDECustomDerivedDataLocation` default, which every action takes; its
 *   package cache through `-packageCachePath`, which only a build or a
 *   package resolution takes (`-showsdks` refuses it, exit 64).
 * - `log`, which Seatbelt refuses outright, asks the agent to run `log show`
 *   or `log stream` outside the boundary (`log-relay.ts`).
 *
 * Each finds the real tool with `xcrun --find`, so it follows the selected
 * Xcode. Nothing is set globally: the owner's own Xcode is untouched.
 */
const writeShims = async (id: string, runner: Runner): Promise<void> => {
  const bin = shimsOf(id);
  await mkdir(bin, { recursive: true });
  await writeScript(id, "boundary-log-protocol.ts", "boundary/log-protocol.ts");
  const client = await writeScript(id, "boundary-log.ts", "boundary/log.ts");
  const { port, token } = logRelay();
  const cache = workspaceCacheDir();
  const swiftpm = shellQuote(join(cache, "swiftpm"));
  await Promise.all([
    writeWhole(
      join(bin, "swift"),
      `#!/bin/sh
# CawCo workspace ${id}: swift, with SwiftPM's own sandbox off inside the boundary's
# and its caches in the workspaces' cache.
swift=$(/usr/bin/xcrun --find swift) || exit 1
case "\${1:-}" in
  build | test | run | package)
    command=$1
    shift
    exec "$swift" "$command" --disable-sandbox --cache-path ${swiftpm}/cache --security-path ${swiftpm}/security "$@"
    ;;
esac
exec "$swift" "$@"
`,
      0o755
    ),
    writeWhole(
      join(bin, "xcodebuild"),
      `#!/bin/bash
# CawCo workspace ${id}: xcodebuild, with its package and macro sandboxes off inside the boundary's
# and its DerivedData and package cache in the workspaces' cache.
xcodebuild=$(/usr/bin/xcrun --find xcodebuild) || exit 1
flags=
builds=
packages=
args=()
for arg in "$@"; do
  case $arg in
    OTHER_SWIFT_FLAGS=*)
      args+=("$arg -disable-sandbox")
      flags=1
      ;;
    build | build-for-testing | test | test-without-building | archive | analyze | clean | install | installsrc | -resolvePackageDependencies)
      args+=("$arg")
      builds=1
      ;;
    -packageCachePath)
      args+=("$arg")
      packages=1
      ;;
    *) args+=("$arg") ;;
  esac
done
[ -n "$flags" ] || args+=('OTHER_SWIFT_FLAGS=$(inherited) -disable-sandbox')
[ -z "$builds" ] || [ -n "$packages" ] || args+=(-packageCachePath ${swiftpm}/xcode)
exec "$xcodebuild" -IDEPackageSupportDisableManifestSandbox=YES -IDEPackageSupportDisablePluginExecutionSandbox=YES -IDECustomDerivedDataLocation=${shellQuote(join(cache, "DerivedData"))} "\${args[@]}"
`,
      0o755
    ),
    writeWhole(
      join(bin, "log"),
      `#!/bin/sh
# CawCo workspace ${id}: log show and log stream, run by the agent outside the boundary.
${runner.env ? `export ${runner.env.trim()}\n` : ""}exec ${[runner.argv[0] as string, client, String(port), token].map(shellQuote).join(" ")} "$@"
`,
      0o755
    ),
  ]);
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

/**
 * Writes the workspace's hook for `held`, its executor in this build's form
 * for the anchor or runner `held` names, and the record of them. An executor
 * only hands commands in, so it is current from the next command on, whatever
 * form the anchor or runner is: a boundary started by an earlier build takes
 * this build's PATH and cache environment from the next command on. On macOS
 * also its shims.
 */
const armHook = async (id: string, held: Omit<Held, "hook">): Promise<Held> => {
  const hook = join(stateDir(id), "hook");
  const runner = await hookRunner(id);
  await writeWhole(
    hook,
    hookScript(id, runner, held.exec, held.scratch),
    0o755
  );
  const gh = await hostGh();
  if (process.platform === "darwin") {
    await writeShims(id, runner);
    await writeWhole(
      held.exec,
      darwinExec(id, held.pid, fifoOf(id), held.scratch, shimsOf(id), gh),
      0o755
    );
  } else {
    await writeWhole(
      held.exec,
      linuxExec(id, held.pid, held.identity, gh),
      0o755
    );
  }
  const armed: Held = { ...held, hook };
  await writeWhole(
    join(stateDir(id), "boundary.json"),
    `${JSON.stringify(armed)}\n`,
    0o644
  );
  return armed;
};

/**
 * Writes every held workspace's hook and its script again, in this build's
 * form. The agent does this as it starts, before it adopts or launches a
 * session: a running CLI reads its workspace's hook on every shell call, so
 * one an earlier build wrote must not outlive that build's runtime. An anchor
 * or runner of an older form is replaced once it is idle
 * ({@link replaceWhenIdle}): the mounts or profile that hide the credential
 * stores are the anchor's or runner's own.
 */
export const rearmHooks = async (): Promise<void> => {
  const ids = await readdir(workspacesDir()).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  );
  let armed = 0;
  for (const id of ids) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: a few small writes per workspace, one workspace at a time
      const held = await readHeld(id);
      if (held) {
        await armHook(id, held);
        armed += 1;
        // A gate an agent left as it died names no process this one waits for.
        await rm(gateOf(id), { force: true });
        const ref = { id, path: held.path };
        if (held.form !== (await formOf(ref))) {
          replaceWhenIdle(ref);
        }
      }
    } catch (error) {
      console.warn(
        `[workspace] ${id}: its boundary hook could not be written again: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  console.info(`[workspace] boundary hooks written for ${armed} workspace(s)`);
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
/** One word of a command {@link shellQuote} built: `'…'`, with `'\''` for a quote. */
const QUOTED_WORD = /'((?:[^']|'\\'')*)'/g;
const HOOK_EVENTS_FLAG = /(^| )--include-hook-events( |$)/;
const QUOTED_WORDS = /^(?:'(?:[^']|'\\'')*' ?)+$/;

/** A boundary hook a claude CLI was launched with ({@link launchedHook}). */
export interface LaunchedHook {
  /**
   * Whether the CLI reports its hooks in its stream (`--include-hook-events`).
   * One launched before cawco asked for that says a hook failed only in its
   * transcript, as a `hook_non_blocking_error` record.
   */
  readonly events: boolean;
  /** What names the hook when it fails: in its own words, or the shell's when what it runs is gone. */
  readonly names: readonly string[];
  /**
   * What the hook runs, each checked as the CLI would use it, when its
   * failing lets a command through. The workspace's {@link hookScript}
   * refuses on any failure and needs none. The form before it — cawco's own
   * binary, by the version that launched the CLI, then `boundary-hook` —
   * fails open with whatever it names gone.
   */
  readonly needs: readonly { readonly path: string; readonly mode: number }[];
}

/**
 * The boundary hook the claude CLI `pid` was launched with, read off its
 * command line (the `--settings` JSON {@link claudeBoundaryOptions} wrote);
 * nothing for a CLI launched without one, and `unknown` for one whose hook
 * is in neither form cawco has written.
 */
export const launchedHook = async (
  pid: number
): Promise<LaunchedHook | "unknown" | undefined> => {
  const commandLine =
    process.platform === "linux"
      ? (await readFile(`/proc/${pid}/cmdline`, "utf8")).replaceAll("\0", " ")
      : ((await commandLineOf(pid)) ?? "");
  const quoted = LAUNCHED_HOOK.exec(commandLine)?.[1];
  if (!quoted) {
    return;
  }
  const events = HOOK_EVENTS_FLAG.test(commandLine);
  const command = JSON.parse(quoted) as string;
  const hook = HOOK_COMMAND.exec(command)?.[1];
  if (hook) {
    return { events, names: [hook], needs: [] };
  }
  const words = QUOTED_WORDS.test(command)
    ? [...command.matchAll(QUOTED_WORD)].map(([, word]) =>
        (word as string).replaceAll("'\\''", "'")
      )
    : [];
  const [binary, verb] = words;
  if (
    !binary ||
    words.length !== 4 ||
    !(verb === "boundary-hook" || verb?.endsWith("/boundary-hook.ts"))
  ) {
    return "unknown";
  }
  return {
    events,
    names: [binary, verb],
    needs: [
      { path: binary, mode: constants.X_OK },
      ...(verb === "boundary-hook"
        ? []
        : [{ path: verb, mode: constants.R_OK }]),
    ],
  };
};

/** The hook a session launched with a workspace boundary runs: its script, which needs nothing. */
export const workspaceHook = (
  boundary: Boundary | undefined
): LaunchedHook | undefined =>
  boundary ? { events: true, names: [boundary.hook], needs: [] } : undefined;

/** The first thing `hook` needs that is no longer there to run, if any. */
export const hookMissing = (hook: LaunchedHook): string | undefined =>
  hook.needs.find(({ path, mode }) => {
    try {
      accessSync(path, mode);
      return false;
    } catch {
      return true;
    }
  })?.path;

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
  if (!(held && (await running(client, ref.id, held)))) {
    return start(client, ref);
  }
  // Written again each time: one an earlier agent started may have no hook
  // yet, or one that reaches cawco another way.
  const armed = await armHook(ref.id, held);
  if (held.form === (await formOf(ref))) {
    forgetStale(ref.id);
    return armed;
  }
  const replaced = await replaceIfIdle(client, ref, held);
  if (replaced) {
    forgetStale(ref.id);
    return replaced;
  }
  replaceWhenIdle(ref);
  return armed;
};

/**
 * Where the agent marks that it is replacing a workspace's anchor or runner:
 * the agent's pid, in the state dir, which nothing inside the boundary
 * writes. The executor waits while it names a live process, then runs
 * through the new one ({@link linuxExec}, {@link darwinExec}).
 */
const gateOf = (id: string): string => join(stateDir(id), "replacing");

/** The form a boundary of this workspace takes in this build: a running one of another form is replaced once it is idle. */
const formOf = async (ref: WorkspaceRef): Promise<string> =>
  process.platform === "darwin" ? (await darwinForm(ref)).form : linuxForm(ref);

/** One process, as {@link busy} reads it. */
interface Seen {
  readonly command: string;
  readonly pid: number;
  /** Linux: its pid namespace, as `/proc/<pid>/ns/pid` names it. */
  readonly pidNs?: string;
  readonly ppid: number;
}

/** Every process on the machine, read once for every workspace {@link busy} looks at. */
const snapshot = async (): Promise<Seen[]> => {
  const linux = process.platform === "linux";
  const [rows, lines] = await Promise.all([
    processLineage(),
    commandLines({ environment: !linux }),
  ]);
  const commands = new Map(lines.map((line) => [line.pid, line.command]));
  return await Promise.all(
    rows.map(async (row) => ({
      pid: row.pid,
      ppid: row.ppid,
      command: commands.get(row.pid) ?? "",
      pidNs: linux
        ? await readlink(`/proc/${row.pid}/ns/pid`).catch(() => undefined)
        : undefined,
    }))
  );
};

/**
 * Whether anything bounded is running in a workspace: an executor on its way
 * in (its own path is on its command line), of any form, or a command or a
 * process it left — on Linux anything in the anchor's pid namespace but the
 * anchor's own loop and its `sleep`, on macOS anything carrying the runner's
 * marker.
 */
const busy = (seen: Seen[], id: string, held: Held): boolean => {
  const exec = join(stateDir(id), "exec");
  const linux = process.platform === "linux";
  const space = linux
    ? seen.find((one) => one.pid === held.pid)?.pidNs
    : undefined;
  return seen.some(
    (one) =>
      one.pid !== held.pid &&
      one.pid !== process.pid &&
      (one.command.includes(exec) ||
        (linux
          ? space !== undefined &&
            one.pidNs === space &&
            !(one.ppid === held.pid && one.command.startsWith("sleep "))
          : one.command.includes(`CAWCO_WORKSPACE=${id}`)))
  );
};

/**
 * Replaces a workspace's anchor or runner with one of this build's form,
 * when nothing bounded is running in it; nothing when something is. The gate
 * goes up before the look, and an executor checks the gate after it is
 * already a process: so either the look sees the executor, or the executor
 * sees the gate and waits for the new one. No command is cut off.
 */
const replaceIfIdle = async (
  client: SessiondClient,
  ref: WorkspaceRef,
  held: Held
): Promise<Boundary | undefined> => {
  const gate = gateOf(ref.id);
  await writeFile(gate, String(process.pid));
  try {
    if (busy(await snapshot(), ref.id, held)) {
      return;
    }
    await client.signal(procIdFor("boundary", ref.id), "SIGKILL");
    const replaced = await start(client, ref);
    console.info(
      `[workspace] ${ref.id}: its boundary ${held.pid} (form ${held.form ?? "none"}) was idle and is replaced by ${replaced.pid}`
    );
    return replaced;
  } finally {
    await rm(gate, { force: true });
  }
};

/** How often the boundaries of an older form are looked at until each is idle. */
const STALE_LOOK_MS = 5000;
/** The workspaces whose boundary is of an older form. */
const stale = new Map<string, WorkspaceRef>();
let staleTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Looks at every running boundary of an older form each
 * {@link STALE_LOOK_MS}, reading the processes once for all of them, and
 * replaces each the first time it is idle ({@link ensureBoundary}). A
 * workspace leaves the set once its boundary is replaced, current, or no
 * longer running.
 */
const lookAtStale = async (): Promise<void> => {
  const seen = await snapshot();
  const client = await sessiond();
  for (const ref of [...stale.values()]) {
    if (starting.has(ref.id)) {
      continue;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one boundary replaced at a time
      const held = await readHeld(ref.id);
      if (!(held && (await running(client, ref.id, held)))) {
        forgetStale(ref.id);
        continue;
      }
      if (!busy(seen, ref.id, held)) {
        await ensureBoundary(ref);
      }
    } catch (error) {
      console.warn(
        `[workspace] ${ref.id}: its older boundary could not be replaced yet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

const replaceWhenIdle = (ref: WorkspaceRef): void => {
  stale.set(ref.id, ref);
  if (staleTimer) {
    return;
  }
  let looking = false;
  staleTimer = setInterval(() => {
    if (looking) {
      return;
    }
    looking = true;
    lookAtStale()
      .catch((error: unknown) => {
        console.warn(
          `[workspace] the older boundaries could not be looked at: ${error instanceof Error ? error.message : String(error)}`
        );
      })
      .finally(() => {
        looking = false;
      });
  }, STALE_LOOK_MS);
  staleTimer.unref();
};

const forgetStale = (id: string): void => {
  stale.delete(id);
  if (stale.size === 0 && staleTimer) {
    clearInterval(staleTimer);
    staleTimer = undefined;
  }
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
 * longer owned by root or the user. Each credential store ({@link linuxSpec})
 * goes under an empty read-only tmpfs when it is a directory — so a file the
 * host adds there later is hidden too — and under an empty read-only file
 * when it is a file. What a command needs from beneath a store (the `cawco`
 * CLI in the data dir) is held aside first and bound back into the tmpfs at
 * its own path. Then a nested
 * user namespace maps the user back to their own uid — tools see who they
 * always see, not root — and its own mount namespace locks every mount above.
 * The anchor is that namespace's PID 1: a bash loop, which reaps the orphans
 * a command leaves, printing {@link READY} once a command can join it.
 */
const ANCHOR = `exec 2>&1
set -eu
PATH=${SYSTEM_PATH}
export PATH
ws=$1 scratch=$2 run=$3 uid=$4 gid=$5 runtime=$6 hidden=$7 ssh=$8 stores=$9 keeps=\${10}
shift 10
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
mask=$run/.auth-mask keep=$run/.keep
rm -rf "$keep"
mkdir -p "$mask" "$keep"
mount -t tmpfs -o size=4k,mode=0700,uid=0,gid=0 auth-mask "$mask"
touch "$mask/empty"
mount -o remount,bind,ro "$mask"
kept=()
while IFS= read -r path; do
  if [ -z "$path" ] || ! [ -e "$path" ]; then continue; fi
  held=$keep/\${#kept[@]}
  if [ -d "$path" ]; then mkdir "$held"; else touch "$held"; fi
  mount --rbind "$path" "$held"
  kept+=("$path")
done <<< "$keeps"
masked=()
while IFS= read -r path; do
  if [ -z "$path" ]; then continue; fi
  if [ -d "$path" ]; then
    mount -t tmpfs -o size=4k,mode=0555 hidden "$path"
    masked+=("$path")
  elif [ -f "$path" ]; then
    mount --bind "$mask/empty" "$path"
    mount -o remount,bind,ro "$path"
  fi
done <<< "$stores"
for i in "\${!kept[@]}"; do
  path=\${kept[$i]}
  if ! [ -e "$path" ]; then
    mkdir -p "$(dirname "$path")"
    if [ -d "$keep/$i" ]; then mkdir "$path"; else touch "$path"; fi
    mount --rbind "$keep/$i" "$path"
  fi
  umount -R "$keep/$i"
done
for path in "\${masked[@]}"; do mount -o remount,bind,ro "$path"; done
if [ -n "$ssh" ]; then mount --bind "$ssh" ${SSH_INCLUDES}; fi
mount -t tmpfs -o mode=1777,nosuid,nodev shm /dev/shm
exec unshare --user --mount --map-user="$uid" --map-group="$gid" bash -c 'echo ${READY}; while :; do sleep 86400 & wait; done'`;

/** A directory to hide, unless the workspace or a cache lives under it. */
const hideable = (dir: string, kept: string[]): string =>
  kept.some((path) => path === dir || path.startsWith(`${dir}/`)) ? "" : dir;

/**
 * A Linux anchor's spec: what it binds writable, and each credential store
 * there is now, by real path, with what a command needs from beneath one —
 * the workspace, its caches, the `cawco` CLI — bound back in ({@link ANCHOR}).
 */
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
  const reals = await Promise.all(
    credentialStores().map((path) => realpath(path).catch(() => undefined))
  );
  const stores = [
    ...new Set(reals.filter((real): real is string => Boolean(real))),
  ];
  const needed = [
    ...kept,
    ...(await Promise.all(
      keptInStores().map((path) => realpath(path).catch(() => path))
    )),
  ];
  const keeps = needed.filter((path) =>
    stores.some((store) => path === store || path.startsWith(`${store}/`))
  );
  return {
    command: "/usr/bin/unshare",
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
      stores.join("\n"),
      keeps.join("\n"),
      ...caches,
    ],
  };
};

/**
 * The form a Linux anchor of this workspace takes in this build: a hash of
 * what it runs and every argument it is given, the credential stores among
 * them. A store that appears, or a change to {@link ANCHOR}, reaches every
 * running anchor once it is idle.
 */
const linuxForm = async (ref: WorkspaceRef): Promise<string> =>
  specForm(
    await linuxSpec(
      ref,
      scratchOf(ref.id),
      runOf(ref.id),
      sshCopyOf(ref.id),
      cachesOf()
    )
  );

const specForm = (spec: ProcSpec): string =>
  createHash("sha256")
    .update([spec.command, ...spec.args].join("\0"))
    .digest("hex")
    .slice(0, 16);

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

/**
 * Where launchd keeps the ssh-agent socket it starts for a login
 * (`SSH_AUTH_SOCK` on macOS: `/private/tmp/com.apple.launchd.<id>/Listeners`).
 * A workspace writes nothing there, so every socket in it is the host's.
 */
const LAUNCHD_SOCKETS = "/private/tmp";

const sbString = (path: string): string =>
  `"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

/** Resolve existing ancestors too, so an absent credential store still has a deny rule. */
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
  const wsPath = await realpath(ws);
  const stores = await Promise.all(credentialStores().map(secretRealpath));
  // Seatbelt's last matching rule wins: what a command runs from inside a
  // store is read again after the deny.
  const keptPaths = await Promise.all(keptInStores().map(secretRealpath));
  // A lookup of a kept path stats each dir on the way: those inside a store
  // answer that alone, never their listing or any other entry.
  const inStore = (path: string): boolean =>
    stores.some((store) => path === store || path.startsWith(`${store}/`));
  const lookupDirs = [
    ...new Set(
      keptPaths.flatMap((path) => {
        const above: string[] = [];
        for (let dir = dirname(path); inStore(dir); dir = dirname(dir)) {
          above.push(dir);
        }
        return above;
      })
    ),
  ];
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
    ...stores.map((path) => `(deny file-read* (subpath ${sbString(path)}))`),
    // A project's secret files, wherever they lie: the clone's own are read
    // again below.
    `(deny file-read* (regex #"/(${SECRET_FILE_NAME})$"))`,
    ...[...keptPaths, wsPath].map(
      (path) => `(allow file-read* (subpath ${sbString(path)}))`
    ),
    ...lookupDirs.map(
      (path) => `(allow file-read-metadata (literal ${sbString(path)}))`
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
    // Key agents: a socket inside a store (gpg-agent's in ~/.gnupg), and
    // the ssh-agent socket launchd holds for every login.
    ...[...new Set([...sockets, ...stores, LAUNCHD_SOCKETS])].map(
      (path) =>
        `(deny network-outbound (remote unix-socket (subpath ${sbString(path)})))`
    ),
    "",
  ].join("\n");
};

/** The macOS runner's FIFO, in the state dir. */
const fifoOf = (id: string): string => join(stateDir(id), "runner.fifo");

/**
 * The form a macOS boundary of this workspace takes in this build: its
 * profile, and a hash of that profile with the runner and executor scripts.
 * A runner started in another form is replaced ({@link ensure}), so a change
 * to any of the three reaches every running boundary.
 */
const darwinForm = async (
  ref: WorkspaceRef
): Promise<{ readonly form: string; readonly profile: string }> => {
  await makeDirs(ref.id);
  const scratch = scratchOf(ref.id);
  const profile = await profileOf(ref.path, scratch, cachesOf());
  const form = createHash("sha256")
    .update(profile)
    .update("\0")
    .update(RUNNER)
    .update("\0")
    .update(
      darwinExec(
        ref.id,
        0,
        fifoOf(ref.id),
        scratch,
        shimsOf(ref.id),
        await hostGh()
      )
    )
    .digest("hex")
    .slice(0, 16);
  return { form, profile };
};

const darwinSpec = async (
  ref: WorkspaceRef,
  scratch: string,
  profileText: string
): Promise<ProcSpec> => {
  const fifo = fifoOf(ref.id);
  await rm(fifo, { force: true });
  const made = await Bun.$`mkfifo ${fifo}`.quiet().nothrow();
  if (made.exitCode !== 0) {
    throw refusal(ref.id, `mkfifo failed: ${made.stderr.toString().trim()}`);
  }
  const profile = join(stateDir(ref.id), "boundary.sb");
  await writeFile(profile, profileText);
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

/** Where a workspace writes, so nothing the executor runs on the host is found there. */
const writableInside = (): string[] => [
  workspaceCacheDir(),
  workspacesDir(),
  join(homedir(), ".worktrees"),
  "/tmp",
  "/private/tmp",
  "/var/folders",
  "/private/var/folders",
];

/**
 * `gh` as the executor runs it on the host, by its real path; none when the
 * agent finds none, or finds it where a workspace writes.
 */
const hostGh = async (): Promise<string | undefined> => {
  const found = Bun.which("gh");
  const real = found ? await realpath(found).catch(() => undefined) : undefined;
  if (
    !real ||
    writableInside().some((dir) => real === dir || real.startsWith(`${dir}/`))
  ) {
    return;
  }
  return real;
};

/** The command token for `gh`, read on the host, where the keyring is. */
const ghToken = (gh: string | undefined): string =>
  gh
    ? `if [ -z "\${GH_TOKEN:-}" ]; then
  token=$(${shellQuote(gh)} auth token 2>/dev/null) && [ -n "$token" ] && GH_TOKEN=$token && export GH_TOKEN
fi`
    : "";

/** The variables every command runs with: the workspaces' own cache, by `workspaceCacheEnv`. */
const cacheAssignments = (): string[] =>
  Object.entries(workspaceCacheEnv()).map(
    ([name, value]) => `${name}=${shellQuote(value)}`
  );

/** `env`'s words that drop every key agent's socket ({@link AGENT_SOCKET_ENV}) from a command's environment. */
const agentUnsets = (): string =>
  AGENT_SOCKET_ENV.map((name) => `-u ${name}`).join(" ");

const stoppedLine = (id: string): string =>
  `cawco: workspace ${id}'s boundary is not running, so this command did not run. The workspace's next session starts it again.`;

/**
 * The executor joins the anchor's namespaces and runs the command with the
 * workspaces' cache in its environment and the caller's PATH. The executor
 * finds its own tools on {@link SYSTEM_PATH}. `CAWCO_WORKSPACE` names the
 * workspace to every command, as a macOS runner's marker does: a script
 * tells by it that it runs inside one.
 */
const linuxExec = (
  id: string,
  pid: number,
  identity: string,
  gh: string | undefined
): string => `#!/bin/sh
# CawCo workspace ${id}: runs one shell command inside the workspace's boundary.
# exec [--cwd-out FILE] COMMAND — FILE gets the directory COMMAND ended in.
caller_path=$PATH
PATH=${SYSTEM_PATH}
export PATH
# While the agent replaces the anchor, wait, then run through the new one.
gate=${shellQuote(gateOf(id))}
if [ -e "$gate" ]; then
  while [ -e "$gate" ] && kill -0 "$(cat "$gate" 2>/dev/null)" 2>/dev/null; do sleep 0.1; done
  [ -e "$gate" ] || PATH=$caller_path exec "$0" "$@"
fi
anchor=${pid}
if [ "$(readlink /proc/$anchor/ns/user 2>/dev/null)" != ${shellQuote(identity)} ]; then
  echo ${shellQuote(stoppedLine(id))} >&2
  exit 126
fi
cwd_out=
if [ "$1" = --cwd-out ]; then cwd_out=$2; shift 2; fi
${ghToken(gh)}
exec /usr/bin/nsenter --user --mount --pid --preserve-credentials --target "$anchor" --wdns="$PWD" \\
  /usr/bin/env ${agentUnsets()} PATH="$caller_path" TMPDIR=/tmp CAWCO_WORKSPACE=${shellQuote(id)} ${cacheAssignments().join(" ")} \\
  /bin/bash -c 'eval "$1"; status=$?; [ -z "$2" ] || pwd -P > "$2"; exit $status' cawco "$1" "$cwd_out"
`;

const darwinExec = (
  id: string,
  pid: number,
  fifo: string,
  scratch: string,
  shims: string,
  gh: string | undefined
): string => `#!/bin/bash
# CawCo workspace ${id}: runs one shell command inside the workspace's boundary.
# exec [--cwd-out FILE] COMMAND — FILE gets the directory COMMAND ended in.
caller_path=$PATH
PATH=${SYSTEM_PATH}
export PATH
# While the agent replaces the runner, wait, then run through the new one.
gate=${shellQuote(gateOf(id))}
if [ -e "$gate" ]; then
  while [ -e "$gate" ] && kill -0 "$(cat "$gate" 2>/dev/null)" 2>/dev/null; do sleep 0.1; done
  [ -e "$gate" ] || PATH=$caller_path exec "$0" "$@"
fi
fifo=${shellQuote(fifo)}
if ! [ -p "$fifo" ] || ! kill -0 ${pid} 2>/dev/null; then
  echo ${shellQuote(stoppedLine(id))} >&2
  exit 126
fi
cwd_out=
if [ "$1" = --cwd-out ]; then cwd_out=$2; shift 2; fi
${ghToken(gh)}
req=$(mktemp -d ${shellQuote(scratch)}/.run.XXXXXX) || exit 126
printf '%s' "$1" > "$req/cmd"
pwd -P > "$req/cwd"
{
  export -p
  echo ${shellQuote(`unset ${AGENT_SOCKET_ENV.join(" ")}`)}
  echo "export TMPDIR=${scratch}"
${cacheAssignments()
  .map((assignment) => `  echo ${shellQuote(`export ${assignment}`)}`)
  .join("\n")}
  printf 'export PATH=%q\\n' ${shellQuote(`${shims}:`)}"$caller_path"
} > "$req/env"
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

/** The folders a boundary needs before it starts: its state, scratch and run dirs, and the caches it writes. */
const makeDirs = async (id: string): Promise<void> => {
  await mkdir(sessionIdentityDir(), { recursive: true, mode: 0o700 });
  await Promise.all(
    [
      stateDir(id),
      scratchOf(id),
      ...(process.platform === "linux" ? [runOf(id)] : []),
      ...cachesOf(),
    ].map((path) => mkdir(path, { recursive: true }))
  );
};

/** Starts the workspace's boundary under sessiond and writes its executor. */
/** How many files {@link ownInodes} copies at once. */
const OWN_INODE_BATCH = 64;

/**
 * Gives every file in a Linux clone an inode of its own, and answers how
 * many it copied. bun installs by hardlinking from its cache, so a clone
 * installed outside a boundary shares inodes with the host's bun cache and
 * every host tree installed from it, and a write inside the clone would
 * change a file the host runs. Inside a boundary the cache is another mount
 * and bun copies, so after a clone's first start this finds nothing. Runs
 * before the anchor starts, with nothing inside to write.
 */
const ownInodes = async (path: string): Promise<number> => {
  const listed =
    await Bun.$`/usr/bin/find ${path} -xdev -type f -links +1 -print0`
      .quiet()
      .nothrow();
  const files = listed.stdout.toString().split("\0").filter(Boolean);
  for (let at = 0; at < files.length; at += OWN_INODE_BATCH) {
    // biome-ignore lint/performance/noAwaitInLoops: a bounded batch of copies at a time
    await Promise.all(
      files.slice(at, at + OWN_INODE_BATCH).map(async (file) => {
        const copy = `${file}.cawco-own-inode`;
        await copyFile(file, copy, constants.COPYFILE_FICLONE);
        await chmod(copy, (await stat(file)).mode);
        await rename(copy, file);
      })
    );
  }
  return files.length;
};

const start = async (
  client: SessiondClient,
  ref: WorkspaceRef
): Promise<Boundary> => {
  const dir = stateDir(ref.id);
  const scratch = scratchOf(ref.id);
  const linux = process.platform === "linux";
  const run = runOf(ref.id);
  const caches = cachesOf();
  await makeDirs(ref.id);
  const procId = procIdFor("boundary", ref.id);
  // One this machine can no longer vouch for (its record is gone or names
  // another process) is replaced, never joined.
  if (await holding(client, procId)) {
    await client.signal(procId, "SIGKILL");
  }
  if (linux) {
    const split = await ownInodes(ref.path);
    if (split > 0) {
      console.info(
        `[workspace] ${ref.id}: ${split} file(s) in its clone shared an inode with a file outside it, and each now has its own`
      );
    }
  }
  const darwin = linux ? undefined : await darwinForm(ref);
  const spec = darwin
    ? await darwinSpec(ref, scratch, darwin.profile)
    : await linuxSpec(ref, scratch, run, await copySshIncludes(ref.id), caches);
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
      form: specForm(spec),
    };
  } else {
    held = {
      exec,
      pid: proc.pid,
      scratch,
      identity: "runner",
      path: ref.path,
      form: darwin?.form,
    };
  }
  // armHook writes the executor.
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
  for (const { pid, command } of await commandLines({ environment: true })) {
    if (command.includes(`CAWCO_WORKSPACE=${id}`) && pid !== process.pid) {
      kill(pid, "SIGKILL");
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
  forgetStale(ref.id);
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
