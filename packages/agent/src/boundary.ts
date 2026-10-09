/**
 * A delegation workspace's boundary, on the machine that holds it: the one
 * place every shell command of the workspace's work items runs. What a
 * command reads and writes is the workspace's policy (`workspace-policy.ts`),
 * the same one every harness's file tools are judged by, enforced from the
 * one translation of it (`boundary-policy.ts`):
 *
 * - Linux: one @anthropic-ai/sandbox-runtime (srt) sandbox per workspace,
 *   hosted by `boundary-host.ts` in library mode. Inside it a command reads
 *   nothing in the home dir but what the policy reads back, writes only the
 *   clone, its scratch dir and the workspaces' cache, sees and signals only
 *   the workspace's processes (its own pid namespace), and reaches the
 *   network only through srt's proxy: any public host, none of the owner's
 *   machines. Every host socket is out of sight.
 * - macOS: one `sandbox-exec` runner per workspace, under a Seatbelt profile
 *   written from the same policy: the home dir read-denied but for what the
 *   policy reads back, writes only where it writes. Seatbelt keeps its
 *   signals inside its own sandbox and refuses `launchctl`. macOS has no
 *   private pid or port space to give it, and Chromium cannot start inside
 *   srt there until srt can allow it its `mach-register` names (srt #210,
 *   PR #598). `swift`, `xcodebuild` and `log` run through shims that keep them
 *   working inside ({@link writeShims}).
 *
 * Both run the same runner ({@link RUNNER}), which takes every command of the
 * workspace over a FIFO and runs it inside: one network namespace on Linux,
 * so a dev server one command starts answers the next. Commands go in
 * through one executor, `~/.cawco/workspaces/<id>/exec [--cwd-out FILE]
 * COMMAND` ({@link execScript}), that every harness runs its shell commands
 * through: claude by a PreToolUse hook that rewrites the command (the
 * workspace's `hook` script, which asks its judge, `boundary-judge.ts`), OpenCode by its
 * plugin's `bash` tool, pi by its bash tool's operations, a workflow's
 * `runCommand`. The GitHub CLI's keyring is the host's, so the executor reads
 * its token on the host side, from a copy it keeps in the workspace's state
 * dir ({@link ghToken}), and hands it in as `GH_TOKEN`: pushes and `gh` keep
 * working inside. `cawco tools` reaches the hub's tools through the
 * workspace's tool door (`tool-door.ts`).
 *
 * sessiond holds the boundary and the workspace's judge, so an agent restart
 * leaves them — and every process in the boundary — running, as it leaves the
 * sessions. One started in another
 * form (another policy, runner, executor or host) is replaced the first time
 * nothing runs in it ({@link replaceWhenIdle}). A machine that cannot hold a
 * boundary refuses the work: a work item never runs without one.
 *
 * No command holds a key or reaches a key agent: `~/.ssh` is under the
 * home dir's deny, the executor drops every agent socket's variable
 * (`AGENT_SOCKET_ENV`), and no host socket is reachable. A workspace reaches
 * another machine only through CawCo: a check that names one runs in a
 * workspace there (the hub's `runChecks`).
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
import { dirname, join } from "node:path";
import type { WorkspaceRef } from "@cawco/core";
import { WORKSPACE_BOUNDARY_START_TIMEOUT_MS } from "@cawco/core";
import { binaryRoot } from "@cawco/core/binary-installation";
import {
  AGENT_SOCKET_ENV,
  sessionIdentityDir,
  workspaceCacheDir,
  workspaceCacheEnv,
  workspaceCaches,
  workspacePolicyFile,
  workspaceReadOnlyDir,
  workspaceScratchDir,
  workspaceStateDir,
  workspacesDir,
} from "@cawco/core/paths";
import {
  commandLine as commandLineOf,
  commandLines,
  processLineage,
} from "@cawco/core/process-identity";
import {
  embeddedFile,
  materializeExecutable,
  standalone,
} from "@cawco/core/runtime";
import { type ProcSpec, sessiondEndpoint } from "@cawco/core/sessiond";
import { workspacePolicy } from "@cawco/core/workspace-policy";
import { rgPath } from "@vscode/ripgrep-universal";
import { seatbeltProfile, srtSettings } from "./boundary-policy";
import { excludeSandboxNames } from "./checkout-exclude";
import { cloneInPlace } from "./clone";
import { logRelay } from "./log-relay";
import { isJudgeOf, judgeProcId, procIdFor } from "./proc-id";
import { ensureSessiond, SessiondClient } from "./sessiond-client";
import { closeToolDoor, openToolDoor, toolDoorOf } from "./tool-door";

/** A running boundary, as a harness uses it. */
export interface Boundary {
  /** `exec [--cwd-out FILE] COMMAND`: runs COMMAND inside the boundary, in the caller's directory. */
  readonly exec: string;
  /** The PreToolUse hook a claude session runs before each tool call ({@link hookScript}). */
  readonly hook: string;
  /** The process sessiond holds: the srt host (Linux) or the runner (macOS). */
  readonly pid: number;
  /** The workspace's policy file, which every harness judges its file tools by (`workspace-policy.ts`). */
  readonly policy: string;
  /** The workspace's scratch dir, its `TMPDIR`: `~/.cawco/workspaces/<id>/tmp`, on disk and outside the clone. */
  readonly scratch: string;
}

/** What `boundary.json` keeps: the boundary, and what proves it is still the one this machine started. */
interface Held extends Boundary {
  /**
   * The form it was started in ({@link planOf}). One of another form, or of
   * none, is replaced once it is idle ({@link ensure}).
   */
  readonly form?: string;
  readonly path: string;
}

/**
 * Linux: the sandbox the srt host runs now, as it writes `<state>/sandbox`
 * each time it starts one (`boundary-host.ts`).
 */
interface Place {
  /**
   * Every process of the sandbox when its runner was ready (its init, srt's
   * shell and socat bridges, the runner): anything else in the sandbox's pid
   * namespace is the workspace's work ({@link busy}).
   */
  readonly idle: readonly number[];
  /** The sandbox's init, whose mount table the executor checks before each command. */
  readonly inner: number;
  /** The outer bwrap; killing it ends the sandbox with everything in it. */
  readonly outer: number;
}

const stateDir = workspaceStateDir;
const scratchOf = workspaceScratchDir;
const roOf = workspaceReadOnlyDir;

/** The runner's FIFO, in the part of the state dir a command reads. */
const fifoOf = (id: string): string => join(roOf(id), "runner.fifo");

/**
 * An empty git template: srt denies writes to every `.git/hooks`, so a `git
 * clone` inside (SwiftPM checkouts, git dependencies) fails copying git's
 * template hooks unless it has none to copy (REPORT.md §5g).
 */
const gitTemplateOf = (id: string): string => join(roOf(id), "git-template");

const WHITESPACE = /\s+/;

/** The line the runner prints once a command can be handed to it. */
const READY = "cawco-boundary-ready";
const STOP_TIMEOUT_MS = 5000;

/** Linux: where the srt host names the sandbox it runs now ({@link Place}). */
const placeOf = (id: string): string => join(stateDir(id), "sandbox");

const readPlace = async (id: string): Promise<Place | undefined> => {
  const text = await readFile(placeOf(id), "utf8").catch(() => "");
  const [outer, inner, ...idle] = text
    .trim()
    .split(WHITESPACE)
    .map((pid) => Number.parseInt(pid, 10));
  if (!(outer && inner) || idle.some(Number.isNaN)) {
    return;
  }
  return { outer, inner, idle };
};

export const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

/**
 * The PATH the executor, the hook and the host find their own tools on:
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
 * How long the hook waits for the judge's answer before it refuses the call.
 * Under {@link HOOK_TIMEOUT_S}, with 10s to spare: Claude Code lets the call
 * through when it times a hook out ("A timed-out `command`… hook doesn't
 * block the tool call", code.claude.com/docs/en/hooks#timeouts), so the hook
 * always answers first. The judge answers in under a millisecond; the hook
 * takes 2–4ms on obelisk.
 */
const HOOK_LIMIT_S = HOOK_TIMEOUT_S - 10;

/**
 * How the hook's refusal of a call it waited {@link HOOK_LIMIT_S} on begins.
 * That refusal stops only the one call. The model reads the line and runs the
 * command again, and the work item goes on (claude.ts `#watchBoundary`).
 */
export const BOUNDARY_HOOK_SLOW = "cawco: the boundary hook took longer than";

/**
 * The perl the hook runs on. The runner already runs every command of a
 * workspace through it, on Linux and macOS alike.
 */
const PERL = "/usr/bin/perl";

/** `value` as a single-quoted perl string. */
const perlQuote = (value: string): string =>
  `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

/** A workspace's judge, as its hook reaches it. */
interface JudgeAt {
  /** Its socket's address, packed by perl's `Socket` on this machine, in hex. */
  readonly address: string;
  readonly socket: string;
}

/**
 * The workspace's PreToolUse hook, run before every tool call it is matched
 * to ({@link HOOKED_TOOLS}). It hands the call to the workspace's judge
 * (`boundary-judge.ts`, {@link judgeFor}), which rewrites a shell call's
 * command to run through the executor and judges every other call's paths by
 * the workspace's policy, and says what the judge answered. A Bun started for
 * every call cost each one a process start a loaded Mac takes long to
 * schedule; the judge starts once, and the hook is perl with nothing to load.
 *
 * It refuses the call every way that can fail. Claude Code blocks a call only
 * on exit 2: any other failure — a missing binary, a crash, a signal — is a
 * "non-blocking error", and the call runs as it was written, outside the
 * boundary (code.claude.com/docs/en/hooks#exit-code-2). So it exits 0 only
 * when the judge allowed the call and its answer reached the CLI whole, and 2
 * otherwise: a judge that is not there or answers nothing, and an answer not
 * in by {@link HOOK_LIMIT_S} ({@link BOUNDARY_HOOK_SLOW}), each refuse that
 * call alone. Each refusal's first line names the hook, so a failure the CLI
 * reports is known as this one's.
 *
 * It runs as `perl -T`, which reads no module path or switch from the
 * environment, and loads no module: the socket's address is packed by perl's
 * `Socket` as the agent writes the hook ({@link socketAddress}), and AF_UNIX
 * and SOCK_STREAM are 1 on Linux and macOS alike. The call's JSON goes over
 * on one line (a line break in JSON is whitespace or invalid).
 */
const hookScript = (
  id: string,
  hook: string,
  judge: JudgeAt
): string => `#!${PERL} -T
# CawCo workspace ${id}: the PreToolUse hook its claude sessions run before each
# tool call. It asks the workspace's judge and says what it answered. Any
# status but 0 refuses the call (exit 2).
$hook = ${perlQuote(hook)};
$judge = ${perlQuote(judge.socket)};
sub refuse { print STDERR "cawco boundary hook $hook\\n@_\\n"; exit 2 }
$SIG{ALRM} = sub { refuse(${perlQuote(`${BOUNDARY_HOOK_SLOW} ${HOOK_LIMIT_S}s on a loaded machine, so this call did not run. Run it again.`)}) };
$SIG{PIPE} = 'IGNORE';
alarm ${HOOK_LIMIT_S};
$call = do { local $/; <STDIN> };
refuse("cawco: the call reached the boundary hook with no input, so it did not run") unless length $call;
$call =~ tr/\\r\\n/  /;
socket(JUDGE, 1, 1, 0) or refuse("cawco: the boundary hook could not open a socket ($!), so this call did not run");
connect(JUDGE, pack('H*', '${judge.address}')) or refuse("cawco: the workspace's judge at $judge did not answer ($!), so this call did not run");
select((select(JUDGE), $| = 1)[0]);
print JUDGE $call, "\\n" or refuse("cawco: the call could not be handed to the workspace's judge at $judge ($!), so it did not run");
$answer = do { local $/; <JUDGE> };
$answer =~ /\\A([02])\\n/ or refuse("cawco: the workspace's judge at $judge answered nothing, so this call did not run");
$allowed = $1 eq '0';
$said = substr($answer, 2);
refuse($said) unless $allowed;
print STDOUT $said or refuse("cawco: the judge's answer could not be written ($!), so this call did not run");
close STDOUT or refuse("cawco: the judge's answer could not be written ($!), so this call did not run");
exit 0;
`;

const HEX = /^[0-9a-f]+$/;

/**
 * `socket`'s address as perl's `Socket` packs it on this machine, in hex: the
 * hook connects with it and loads no module of its own ({@link hookScript}).
 * Refuses the workspace when perl cannot pack it, rather than writing a hook
 * that refuses every call.
 */
const socketAddress = async (id: string, socket: string): Promise<string> => {
  const packed =
    await Bun.$`${PERL} -MSocket -e ${'print unpack("H*", pack_sockaddr_un($ARGV[0]))'} ${socket}`
      .quiet()
      .nothrow();
  const address = packed.stdout.toString();
  if (packed.exitCode !== 0 || !HEX.test(address)) {
    throw refusal(
      id,
      `${PERL} could not pack its judge's socket address (${packed.stderr.toString().trim() || `status ${packed.exitCode}`})`
    );
  }
  return address;
};

/**
 * The runtime the boundary's plain Bun scripts run on: `BUN_BE_BUN=1 <binary
 * root>/run` in a binary install, bun in a checkout. Refuses the workspace
 * when it is not there, rather than writing a hook that refuses every
 * command.
 */
const bunRuntime = async (id: string): Promise<string> => {
  const runtime = standalone
    ? join(binaryRoot(), "run")
    : (Bun.which("bun") ?? "bun");
  await access(runtime, constants.X_OK).catch(() => {
    throw refusal(
      id,
      `${runtime} is not there, so its boundary scripts could not run`
    );
  });
  return runtime;
};

/** The judge's file name in a workspace's state dir: `@cawco/core/workspace-judge`, as a plain Bun script. */
export const JUDGE_SCRIPT = "workspace-judge.ts";

/** The judge server's file name in a workspace's state dir, beside {@link JUDGE_SCRIPT}. */
const JUDGE_SERVER = "boundary-judge.ts";

/** The line the judge prints once it answers on its socket. */
const JUDGE_READY = "cawco-judge-ready";

/** One of the plain Bun scripts the boundary runs: as the binary install embedded it (scripts/build-binary.ts), or the checkout's `source`. */
const scriptText = (embedded: string, source: string): Promise<string> =>
  Bun.file(standalone ? embeddedFile(embedded) : source).text();

/**
 * Writes one of the plain Bun scripts the boundary runs into `dir`, under its
 * source name: from this checkout (`source`, by default beside this file),
 * or as the binary install embedded it.
 */
const writeScript = async (
  dir: string,
  name: string,
  embedded: string,
  source = join(import.meta.dir, name)
): Promise<string> => {
  const path = join(dir, name);
  await writeWhole(path, await scriptText(embedded, source), 0o644);
  return path;
};

/** The judges starting now, by their sessiond id: one start each, however many ask. */
const judging = new Map<string, Promise<void>>();
/** The judges whose exit this agent watches, by their sessiond id, each with the connection it watches on. */
const watchedJudges = new Map<string, SessiondClient>();

/**
 * The workspace's judge, running: `boundary-judge.ts` on {@link bunRuntime},
 * held by sessiond like the boundary, so it outlives the agent and every CLI
 * keeps asking it. It and the judge beside it (which OpenCode's plugin
 * imports too) are written into the state dir first.
 *
 * Its form is a hash of what it runs and is handed; one of each form runs,
 * on its own socket (`judge-<form>.sock`), under its own sessiond id. So a new
 * build's judge starts beside the old one, and the hook is pointed at it only
 * once it answers: a hook already running still reaches the old one, which
 * leaves on its own once the hook has not named it for as long as a hook
 * lives (`boundary-judge.ts`). One that exits otherwise is started again
 * ({@link watchJudge}). Refuses the workspace when it cannot start.
 */
const judgeFor = async (
  id: string,
  held: Pick<Held, "exec" | "scratch">,
  hook: string,
  policy: string
): Promise<JudgeAt> => {
  const runtime = await bunRuntime(id);
  const [judgeText, serverText] = await Promise.all([
    scriptText(
      "boundary/workspace-judge.ts",
      join(import.meta.dir, "..", "..", "core", "src", JUDGE_SCRIPT)
    ),
    scriptText("boundary/judge.ts", join(import.meta.dir, JUDGE_SERVER)),
  ]);
  const server = join(stateDir(id), JUDGE_SERVER);
  const handed = [
    hook,
    String(HOOK_TIMEOUT_S),
    held.exec,
    held.scratch,
    policy,
  ];
  const form = createHash("sha256")
    .update([serverText, judgeText, ...handed].join("\0"))
    .digest("hex")
    .slice(0, 16);
  const socket = join(stateDir(id), `judge-${form}.sock`);
  const procId = judgeProcId(id, form);
  // Written each time: OpenCode's plugin imports this build's judge from here.
  await Promise.all([
    writeWhole(join(stateDir(id), JUDGE_SCRIPT), judgeText, 0o644),
    writeWhole(server, serverText, 0o644),
  ]);
  let started = judging.get(procId);
  if (!started) {
    started = (async () => {
      const client = await sessiond();
      if (await holding(client, procId)) {
        return;
      }
      await client.spawnProc(procId, {
        command: runtime,
        args: [server, socket, ...handed],
        // Bun reads bunfig.toml and .env from where it starts: the state dir,
        // which nothing inside the boundary writes.
        cwd: stateDir(id),
        env: {
          ...(standalone ? { BUN_BE_BUN: "1" } : {}),
          PATH: SYSTEM_PATH,
        },
      });
      await ready(client, procId, JUDGE_READY, "its judge").catch(
        (error: Error) => {
          throw refusal(id, error.message);
        }
      );
      console.info(`[workspace] ${id}: its judge (form ${form}) is running`);
    })().finally(() => judging.delete(procId));
    judging.set(procId, started);
  }
  await started;
  await watchJudge(id, procId);
  return { socket, address: await socketAddress(id, socket) };
};

/**
 * Starts the workspace's judge again when it exits while the workspace is
 * still held, by arming its hook again ({@link armHook}): a crashed judge
 * would refuse every call. One that left because a newer judge took over, or
 * the workspace closed, finds the current one running, or no workspace. A
 * watch lives on its sessiond connection, so a new connection watches again.
 */
const watchJudge = async (id: string, procId: string): Promise<void> => {
  const client = await sessiond();
  if (watchedJudges.get(procId) === client) {
    return;
  }
  watchedJudges.set(procId, client);
  client.subscribe(procId, {
    line: () => undefined,
    exit: (code, signal) => {
      watchedJudges.delete(procId);
      client.unsubscribe(procId);
      readHeld(id)
        .then(async (held) => {
          if (!held) {
            return;
          }
          console.warn(
            `[workspace] ${id}: its judge ${procId} exited (${signal ?? `code ${code}`}); arming its hook again`
          );
          await armHook(id, held);
        })
        .catch((error: unknown) => {
          console.warn(
            `[workspace] ${id}: its judge could not be started again: ${error instanceof Error ? error.message : String(error)}`
          );
        });
    },
  });
};

/** A macOS workspace's shims, first on the PATH of every command in its boundary: read-only inside. */
const shimsOf = (id: string): string => join(roOf(id), "bin");

/**
 * The tools a macOS boundary runs in its own way, each a shim on its PATH.
 * macOS sandboxes do not nest: the boundary is Seatbelt's sandbox, so a tool
 * that makes one of its own inside it fails (srt #67).
 *
 * - `swift build|test|run|package` gets `--disable-sandbox`: SwiftPM's
 *   "Disable using the sandbox when executing subprocesses"
 *   (docs.swift.org/…/packagemanagerdocs/swiftbuild), which also hands the
 *   compiler `-disable-sandbox` for macro servers
 *   (github.com/swiftlang/swift-package-manager/pull/7167). Its
 *   `--cache-path` and `--security-path` go in the workspaces' cache
 *   (SwiftPM's own, in `~/Library`, are the host's and read-only here), and
 *   so does its build dir, `--scratch-path`, one per package dir, unless the
 *   command names its own (REPORT.md §5m).
 * - `xcodebuild` gets the IDE defaults that turn off its package manifest and
 *   plugin sandboxes, as nixpkgs builds Xcode projects under its own sandbox,
 *   and `-disable-sandbox` in OTHER_SWIFT_FLAGS for macro plugin servers. Its
 *   DerivedData goes in the workspaces' cache through the
 *   `IDECustomDerivedDataLocation` default, which every action takes, where
 *   `-derivedDataPath` is refused by some (`-showsdks`, exit 64); its
 *   package cache through `-packageCachePath`, which only a build or a
 *   package resolution takes.
 * - `log`, which Seatbelt refuses outright, asks the agent to run `log show`
 *   or `log stream` outside the boundary (`log-relay.ts`).
 *
 * Each finds the real tool with `xcrun --find`, so it follows the selected
 * Xcode. Nothing is set globally: the owner's own Xcode is untouched.
 */
const writeShims = async (id: string, runtime: string): Promise<void> => {
  const bin = shimsOf(id);
  await mkdir(bin, { recursive: true });
  await writeScript(
    roOf(id),
    "boundary-log-protocol.ts",
    "boundary/log-protocol.ts"
  );
  const client = await writeScript(
    roOf(id),
    "boundary-log.ts",
    "boundary/log.ts"
  );
  const { port, token } = logRelay();
  const cache = workspaceCacheDir();
  const swiftpm = shellQuote(join(cache, "swiftpm"));
  await Promise.all([
    writeWhole(
      join(bin, "swift"),
      `#!/bin/bash
# CawCo workspace ${id}: swift, with SwiftPM's own sandbox off inside the boundary's
# and its caches and build dir in the workspaces' cache.
swift=$(/usr/bin/xcrun --find swift) || exit 1
case "\${1:-}" in
  build | test | run | package)
    command=$1
    shift
    scratch=()
    case " $* " in
      *" --scratch-path"* | *" --build-path"*) ;;
      *) scratch=(--scratch-path ${swiftpm}/build/"$(/sbin/md5 -q -s "$PWD")") ;;
    esac
    exec "$swift" "$command" --disable-sandbox --cache-path ${swiftpm}/cache --security-path ${swiftpm}/security "\${scratch[@]}" "$@"
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
${standalone ? "export BUN_BE_BUN=1\n" : ""}exec ${[runtime, client, String(port), token].map(shellQuote).join(" ")} "$@"
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
 * Starts the workspace's judge in this build's form and writes its hook for
 * `held` to ask it, its executor in this build's form for the boundary `held`
 * names, and the record of them, and serves its tool door. An executor only
 * hands commands in, so it is current from the next command on, whatever form
 * the boundary is; a running CLI reads its hook at every call, so it asks
 * the new judge from the next call on. On macOS also its shims. The
 * workspace's policy is written again too, as this machine stands now
 * (`workspacePolicy`): every harness reads it at each file tool call, so a
 * store, toolchain or account added since is in it from the next call on.
 */
const armHook = async (
  id: string,
  held: Omit<Held, "hook" | "policy">
): Promise<Held> => {
  const hook = join(stateDir(id), "hook");
  const policy = workspacePolicyFile(id);
  await writeWhole(
    policy,
    `${JSON.stringify(await workspacePolicy({ id, path: held.path }), null, 2)}\n`,
    0o644
  );
  const judge = await judgeFor(id, held, hook, policy);
  await writeWhole(hook, hookScript(id, hook, judge), 0o755);
  // What the hook ran before it asked a judge.
  await rm(join(stateDir(id), "boundary-hook.ts"), { force: true });
  if (process.platform === "darwin") {
    await writeShims(id, await bunRuntime(id));
  }
  await writeWhole(held.exec, execScript(id, held, await hostGh()), 0o755);
  await openToolDoor(id);
  const armed: Held = { ...held, hook, policy };
  await writeWhole(
    join(stateDir(id), "boundary.json"),
    `${JSON.stringify(armed)}\n`,
    0o644
  );
  return armed;
};

/**
 * Writes every held workspace's hook and its script again, in this build's
 * form, and serves its tool door. The agent does this as it starts, before it
 * adopts or launches a session: a running CLI reads its workspace's hook on
 * every tool call, so one an earlier build wrote must not outlive that
 * build's runtime. A boundary of an older form is replaced once it is idle
 * ({@link replaceWhenIdle}).
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
        if (held.form !== (await planOf(ref)).form) {
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
 * The tools the boundary hook runs on (a JavaScript regular expression,
 * code.claude.com/docs/en/hooks#matcher-patterns: "Contains any other
 * character | JavaScript regular expression, unanchored"). The shell tools,
 * whose command it rewrites through the executor, and PowerShell, which it
 * refuses; and every tool that names a local path, which it judges by the
 * workspace's policy: the file tools, LSP, Artifact and SendUserFile (which
 * send a file out), EnterWorktree, and every MCP tool, whose arguments the
 * judge reads for paths. Claude Code runs those in the CLI, on the host. No
 * other tool takes a path (code.claude.com/docs/en/tools-reference), and the
 * hook and its judge run on none of them. A hook's deny holds in every
 * permission mode ("a hook deny applies even in bypassPermissions mode",
 * code.claude.com/docs/en/agent-sdk/permissions).
 */
const HOOKED_TOOLS =
  "^(Bash|Monitor|PowerShell|Read|Write|Edit|MultiEdit|NotebookEdit|NotebookRead|Glob|Grep|LS|LSP|Artifact|SendUserFile|EnterWorktree|mcp__.*)$";

/**
 * The `query()` options that bound a claude session, none for a session with
 * no boundary: flag settings with a PreToolUse hook on {@link HOOKED_TOOLS},
 * and the hook events in the stream, which is how the session hears that the
 * hook failed. The CLI runs the hook itself, so it holds while the agent that
 * started the session restarts; a local settings file cannot turn it off,
 * because flag settings outrank it. `|| exit 2` refuses the call when the
 * hook script itself is gone (the shell's 127 would let it through). The
 * adapter merges these settings with the ones every session carries into the
 * CLI's one `--settings`.
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
                matcher: HOOKED_TOOLS,
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

/** The matchers the hook has been launched on that judge the file tools: every tool, as builds before this one wrote it, and {@link HOOKED_TOOLS}. */
const GATING_MATCHERS = new Set(["*", HOOKED_TOOLS]);

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The boundary hook's entry in the `--settings` JSON {@link claudeBoundaryOptions}
 * launches a CLI with: its matcher — {@link HOOKED_TOOLS}, `*` or `Bash|Monitor`
 * as earlier builds wrote it — and its command, still JSON-quoted.
 */
const LAUNCHED_HOOK = new RegExp(
  `"matcher":"(${escapeRegExp(HOOKED_TOOLS)}|\\*|Bash\\|Monitor)","hooks":\\[\\{"type":"command","command":("(?:[^"\\\\]|\\\\.)*")`
);
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
  /**
   * Whether the hook judges the CLI's file tools and MCP calls
   * ({@link GATING_MATCHERS}). One launched on `Bash|Monitor` alone leaves
   * them unjudged: such a CLI is relaunched onto the hook that judges them
   * ({@link hookFailsOpen}).
   */
  readonly gatesFiles: boolean;
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
  const [, matcher, quoted] = LAUNCHED_HOOK.exec(commandLine) ?? [];
  if (!quoted) {
    return;
  }
  const events = HOOK_EVENTS_FLAG.test(commandLine);
  const gatesFiles = GATING_MATCHERS.has(matcher as string);
  const command = JSON.parse(quoted) as string;
  const hook = HOOK_COMMAND.exec(command)?.[1];
  if (hook) {
    return { events, gatesFiles, names: [hook], needs: [] };
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
    gatesFiles,
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
  boundary
    ? { events: true, gatesFiles: true, names: [boundary.hook], needs: [] }
    : undefined;

/**
 * Whether a CLI running `hook` lets a call outside the workspace's policy:
 * its hook runs what can go missing ({@link LaunchedHook.needs}), or it runs
 * on shell tools alone ({@link LaunchedHook.gatesFiles}). Such a CLI is
 * relaunched onto the workspace's hook script between turns.
 */
export const hookFailsOpen = (hook: LaunchedHook): boolean =>
  hook.needs.length > 0 || !hook.gatesFiles;

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
  if (open && !open.retired) {
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

/**
 * What a Linux machine runs a boundary with, each by the package that ships
 * it: srt's own dependencies (its README, "Platform-Specific Dependencies").
 * Its ripgrep is the one this build ships ({@link ripgrep}).
 */
const HOST_TOOLS = [
  ["bwrap", "bubblewrap"],
  ["socat", "socat"],
] as const;

/** The host tools this machine lacks, each named with its package; none off Linux. */
const missingHostTools = (): string[] =>
  process.platform === "linux"
    ? HOST_TOOLS.filter(
        ([tool]) =>
          !SYSTEM_PATH.split(":").some((dir) => existsSync(join(dir, tool)))
      ).map(([tool, pkg]) => `${tool} (install the ${pkg} package)`)
    : [];

/** Says, as the agent starts, what this machine needs before it can hold a workspace boundary. */
export const checkBoundaryHost = (): void => {
  const missing = missingHostTools();
  if (missing.length > 0) {
    console.warn(
      `[workspace] this machine refuses workspace work until it has ${missing.join(" and ")}`
    );
  }
};

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
  return Boolean(proc?.alive) && proc?.pid === held.pid;
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
  const missing = missingHostTools();
  if (missing.length > 0) {
    throw refusal(ref.id, `this machine has no ${missing.join(" and no ")}`);
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
  if (held.form === (await planOf(ref)).form) {
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
 * Where the agent marks that it is replacing a workspace's boundary: the
 * agent's pid, in the state dir, which nothing inside the boundary writes.
 * The executor waits while it names a live process, then runs through the
 * new one ({@link execScript}).
 */
const gateOf = (id: string): string => join(stateDir(id), "replacing");

/**
 * The runner: reads request directories off its FIFO and runs each in its
 * own process group, inside the sandbox. A request carries the command, the
 * caller's directory and environment; the runner leaves the exit status and
 * the directory the command ended in beside them. The FIFO is opened
 * read-only (it lies where a command cannot write) and reopened after each
 * writer closes it. Linux: srt's own plumbing for the sandbox (its proxy, the
 * proxy credential git presents) is read once as the runner starts and set
 * again over each request's environment, which the executor writes on the
 * host, so no caller's environment can drop it.
 */
const RUNNER = `fifo=$1
CAWCO_SANDBOX_ENV=$(export -p | grep -E '^declare -x (HTTPS?_PROXY|https?_proxy|ALL_PROXY|all_proxy|NO_PROXY|no_proxy|GIT_SSH_COMMAND|SANDBOX_RUNTIME|JAVA_TOOL_OPTIONS|GIT_CONFIG_[A-Z0-9_]+|DOCKER_HTTPS?_PROXY|CLOUDSDK_PROXY_[A-Z_]+|GRPC_PROXY|grpc_proxy|RSYNC_PROXY|FTP_PROXY|ftp_proxy|CLAUDE_CODE_HOST_[A-Z_]+)=')
export CAWCO_SANDBOX_ENV
sandbox=$(readlink /proc/self/ns/pid 2>/dev/null)
echo ${READY}
while :; do
  while IFS= read -r req; do
    (
      printf '%s\\n' "$sandbox" > "$req/sandbox"
      /usr/bin/perl -e 'setpgrp(0, 0); exec @ARGV' /bin/bash --norc --noprofile -c '. "$1/env" >/dev/null 2>&1; eval "$CAWCO_SANDBOX_ENV"; cd "$(cat "$1/cwd")" || exit 1; eval "$(cat "$1/cmd")"; status=$?; pwd -P > "$1/cwd-out"; exit $status' cawco "$req" > "$req/out" 2> "$req/err" < /dev/null &
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

/** A Linux workspace's srt temp dir, short (a socket path is capped at 108 bytes, srt #213) and its own (REPORT.md §5o). */
const srtTmpOf = (id: string): string => {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (!runtime) {
    throw refusal(
      id,
      "the agent has no XDG_RUNTIME_DIR, where its sandbox's proxy socket goes"
    );
  }
  return join(
    runtime,
    "cawco-srt",
    createHash("sha256").update(id).digest("hex").slice(0, 12)
  );
};

/** The ripgrep srt scans a clone with: the one this build ships. */
const ripgrep = (): string =>
  standalone ? materializeExecutable("srt/rg") : rgPath;

/** The srt host script, as this build runs it: its embedded bundle, or the checkout's source. */
const hostScript = (): string =>
  standalone
    ? materializeExecutable("srt/host.js")
    : join(import.meta.dir, "boundary-host.ts");

/** What the host script holds, for the form: a change to it is a change of form. */
let hostText: Promise<string> | undefined;

/** How a workspace's boundary starts in this build, and the form that names it. */
interface Plan {
  /** Written into the state dir before the boundary starts. */
  readonly files: readonly (readonly [string, string])[];
  /**
   * A hash of what the boundary runs under: its srt settings or Seatbelt
   * profile (so the policy as this machine stands now), the runner, the
   * executor and, on Linux, the host script. A boundary started in another
   * form is replaced once it is idle (REPORT.md §7.7).
   */
  readonly form: string;
  readonly spec: ProcSpec;
}

/** The {@link Plan} of workspace `ref` on this machine now. */
const planOf = async (ref: WorkspaceRef): Promise<Plan> => {
  const { id } = ref;
  const policy = await workspacePolicy(ref);
  const runtime = await bunRuntime(id);
  const exec = execScript(
    id,
    {
      exec: join(stateDir(id), "exec"),
      path: ref.path,
      pid: 0,
      scratch: scratchOf(id),
    },
    await hostGh()
  );
  const hash = createHash("sha256");
  if (process.platform === "darwin") {
    const profile = seatbeltProfile(policy, {
      door: toolDoorOf(id),
      hostSockets: await Promise.all(
        [
          dirname(workspacesDir()),
          dirname(sessiondPath()),
          LAUNCHD_SOCKETS,
        ].map((path) => realpath(path).catch(() => path))
      ),
    });
    const file = join(stateDir(id), "boundary.sb");
    return {
      files: [[file, profile]],
      form: hash
        .update(profile)
        .update("\0")
        .update(RUNNER)
        .update("\0")
        .update(exec)
        .digest("hex")
        .slice(0, 16),
      spec: {
        command: "/usr/bin/sandbox-exec",
        args: [
          "-f",
          file,
          "/bin/bash",
          "--norc",
          "--noprofile",
          "-c",
          RUNNER,
          "cawco-boundary",
          fifoOf(id),
        ],
        // In the clone, as the srt host starts its sandbox on Linux: every
        // command's shell starts in the runner's directory before it moves to
        // its caller's, and one the profile denies (sessiond's own, under the
        // home dir) fails bash's getcwd ("shell-init: error retrieving current
        // directory") on every command.
        cwd: policy.clone,
        // The marker is how an archive finds every process the workspace started.
        env: { CAWCO_WORKSPACE: id, TMPDIR: policy.scratch },
      },
    };
  }
  const srtTmp = srtTmpOf(id);
  const settings = `${JSON.stringify(srtSettings(policy, { rg: ripgrep(), srtTmp }), null, 2)}\n`;
  const host = hostScript();
  hostText ??= Bun.file(host).text();
  const files = {
    settings: join(stateDir(id), "srt.json"),
    runner: join(stateDir(id), "runner.sh"),
  };
  return {
    files: [
      [files.settings, settings],
      [files.runner, RUNNER],
    ],
    form: hash
      .update(settings)
      .update("\0")
      .update(RUNNER)
      .update("\0")
      .update(exec)
      .update("\0")
      .update(await hostText)
      .digest("hex")
      .slice(0, 16),
    spec: {
      command: runtime,
      args: [
        host,
        files.settings,
        files.runner,
        fifoOf(id),
        policy.clone,
        READY,
      ],
      // The host starts here, never in the clone: Bun reads bunfig.toml and
      // .env from where it starts (boundary-host.ts).
      cwd: stateDir(id),
      env: {
        ...(standalone ? { BUN_BE_BUN: "1" } : {}),
        // srt's own temp dir, for its sockets; the commands' TMPDIR is the
        // scratch dir, which srt hands in from CLAUDE_CODE_TMPDIR.
        TMPDIR: srtTmp,
        CLAUDE_CODE_TMPDIR: policy.scratch,
        CAWCO_WORKSPACE: id,
        PATH: SYSTEM_PATH,
      },
    },
  };
};

/** One process, as {@link busy} reads it. */
interface Seen {
  readonly command: string;
  readonly pid: number;
  /** Linux: its pid namespace, as `/proc/<pid>/ns/pid` names it. */
  readonly pidNs?: string;
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
      command: commands.get(row.pid) ?? "",
      pidNs: linux
        ? await readlink(`/proc/${row.pid}/ns/pid`).catch(() => undefined)
        : undefined,
    }))
  );
};

/** Linux: the processes in the pid namespace of `inner`, the sandbox's init. */
const inSandbox = (seen: Seen[], inner: number | undefined): Seen[] => {
  const space = seen.find((one) => one.pid === inner)?.pidNs;
  return space === undefined ? [] : seen.filter((one) => one.pidNs === space);
};

/**
 * Whether anything bounded is running in a workspace: an executor on its way
 * in (its own path is on its command line), or a command or a process it
 * left — on Linux anything in the sandbox's pid namespace that was not there
 * when its runner was ready, on macOS anything carrying the runner's marker.
 */
const busy = async (seen: Seen[], id: string, held: Held): Promise<boolean> => {
  const exec = join(stateDir(id), "exec");
  if (
    seen.some((one) => one.pid !== process.pid && one.command.includes(exec))
  ) {
    return true;
  }
  if (process.platform === "linux") {
    const place = await readPlace(id);
    const idle = new Set(place?.idle);
    return inSandbox(seen, place?.inner).some((one) => !idle.has(one.pid));
  }
  return seen.some(
    (one) =>
      one.pid !== held.pid &&
      one.pid !== process.pid &&
      one.command.includes(`CAWCO_WORKSPACE=${id}`)
  );
};

/**
 * Replaces a workspace's boundary with one of this build's form, when nothing
 * bounded is running in it; nothing when something is. The gate goes up
 * before the look, and an executor checks the gate after it is already a
 * process: so either the look sees the executor, or the executor sees the
 * gate and waits for the new one. No command is cut off.
 */
const replaceIfIdle = async (
  client: SessiondClient,
  ref: WorkspaceRef,
  held: Held
): Promise<Boundary | undefined> => {
  const gate = gateOf(ref.id);
  await writeFile(gate, String(process.pid));
  try {
    if (await busy(await snapshot(), ref.id, held)) {
      return;
    }
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
      if (!(await busy(seen, ref.id, held))) {
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

/** Waits for a process's `line` (the boundary's {@link READY}); answers every line said before it, or its own words if it dies first. */
const ready = (
  client: SessiondClient,
  procId: string,
  line: string,
  what: string
): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const said: string[] = [];
    const words = (): string => (said.length ? `: ${said.join(" / ")}` : "");
    const finish = (error?: Error): void => {
      clearTimeout(timer);
      client.unsubscribe(procId);
      if (error) {
        reject(error);
      } else {
        resolve(said);
      }
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            `${what} did not start within ${WORKSPACE_BOUNDARY_START_TIMEOUT_MS / 1000}s${words()}`
          )
        ),
      WORKSPACE_BOUNDARY_START_TIMEOUT_MS
    );
    client.subscribe(
      procId,
      {
        line: (event) => {
          const text = event.data.trim();
          if (text === line) {
            finish();
          } else if (text) {
            said.push(text);
          }
        },
        exit: (code, signal) =>
          finish(
            new Error(
              `${what} exited (${signal ?? `code ${code}`}) as it started${words()}`
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

/**
 * Where the executor keeps `gh`'s token for workspace `id`: its state dir,
 * which no workspace reads (`workspacePolicy` gives back only its `ro` and
 * `tmp` parts), and which goes with the workspace ({@link closeBoundary}).
 */
const ghTokenCacheOf = (id: string): string => join(stateDir(id), "gh-token");

/**
 * The command token for `gh` when its caller has none, read on the host,
 * where the keyring is. `gh auth token` costs a command about 26 ms
 * (artifacts/srt-eval/REPORT.md §9), so the executor keeps its answer in a
 * 0600 file and asks again only when the file is missing or gh's `hosts.yml`
 * is not older than it: `gh auth login`, `logout` and `switch` rewrite
 * `hosts.yml`. The newer answer replaces the file by a rename; no answer
 * removes it, and no token goes in. The fast path forks nothing.
 */
const ghToken = (id: string, gh: string | undefined): string =>
  gh
    ? `if [ -z "\${GH_TOKEN:-}" ]; then
  gh_cache=${shellQuote(ghTokenCacheOf(id))}
  gh_hosts=\${GH_CONFIG_DIR:-\${XDG_CONFIG_HOME:-$HOME/.config}/gh}/hosts.yml
  if [ -s "$gh_cache" ] && [ "$gh_cache" -nt "$gh_hosts" ]; then
    read -r GH_TOKEN < "$gh_cache"
  elif token=$(${shellQuote(gh)} auth token 2>/dev/null) && [ -n "$token" ]; then
    (umask 077 && printf '%s\\n' "$token" > "$gh_cache.$$" && mv -f "$gh_cache.$$" "$gh_cache") || rm -f "$gh_cache.$$"
    GH_TOKEN=$token
  else
    rm -f "$gh_cache"
  fi
  [ -n "\${GH_TOKEN:-}" ] && export GH_TOKEN
fi`
    : "";

/**
 * What every command runs with besides its caller's environment: the
 * workspaces' own cache (`workspaceCacheEnv`), its scratch dir as `TMPDIR`,
 * the empty git template, the tool door, and `CAWCO_WORKSPACE`, by which a
 * script tells that it runs inside one; never a key agent's socket
 * ({@link AGENT_SOCKET_ENV}).
 */
const commandEnv = (id: string, scratch: string): string[] => [
  `unset ${AGENT_SOCKET_ENV.join(" ")}`,
  ...Object.entries({
    ...workspaceCacheEnv(),
    TMPDIR: scratch,
    GIT_TEMPLATE_DIR: gitTemplateOf(id),
    CAWCO_TOOL_SOCKET: toolDoorOf(id),
    CAWCO_WORKSPACE: id,
  }).map(([name, value]) => `export ${name}=${shellQuote(value)}`),
];

const stoppedLine = (id: string): string =>
  `cawco: workspace ${id}'s boundary is not running, so this command did not run. The workspace's next session starts it again.`;

/** How long an executor waits for the srt host to start a sandbox again, in tenths of a second. */
const RESTART_WAIT_TENTHS = WORKSPACE_BOUNDARY_START_TIMEOUT_MS / 100;

/**
 * Linux: srt protects the clone's `.git/config` and `.git/hooks` with
 * read-only binds, and the kernel drops such a bind in every other mount
 * namespace when the host renames or unlinks what it covers (a host-side
 * `git config` does: lock, then rename). The srt host watches for that and
 * starts the sandbox again (`boundary-host.ts`); this is the executor's own
 * look before every command: the running sandbox's mount table must still
 * hold both. When it does not, it asks the host to start a new sandbox
 * (SIGUSR1), and runs the command through that one (REPORT.md §5d). CawCo
 * never writes a live clone's config: it writes `branch.*` only before the
 * boundary starts (`cloneInPlace`).
 */
const mountCheck = (id: string, held: Pick<Held, "path" | "pid">): string => {
  const clone = held.path;
  return `place=${shellQuote(placeOf(id))}
read -r outer inner _ < "$place" 2>/dev/null
for protected in ${shellQuote(join(clone, ".git", "config"))} ${shellQuote(join(clone, ".git", "hooks"))}; do
  if ! awk -v p="$protected" '$5 == p { found = 1 } END { exit !found }' "/proc/\${inner:-0}/mountinfo" 2>/dev/null; then
    kill -USR1 ${held.pid} 2>/dev/null
    for _ in $(seq ${RESTART_WAIT_TENTHS}); do
      read -r now _ < "$place" 2>/dev/null
      if [ -n "$now" ] && [ "$now" != "\${outer:-}" ]; then PATH=$caller_path exec "$0" "$@"; fi
      kill -0 ${held.pid} 2>/dev/null || break
      sleep 0.1
    done
    echo ${shellQuote(stoppedLine(id))} >&2
    exit 126
  fi
done`;
};

/**
 * Linux: which sandbox runs the command. The srt host may start a new one
 * while a command waits to be taken ({@link mountCheck}), and the runner
 * stamps each request with its sandbox's pid namespace as it takes it; the
 * request is the current sandbox's when the current init is in that
 * namespace, and was taken by one already gone when not (`gone`, which no
 * `kill -0` finds). Until a sandbox takes it, the host's being alive is what
 * counts: it runs one or exits.
 */
const followTaker = (id: string): string => `taker=
take() {
  local taken outer inner
  read -r taken < "$req/sandbox"
  read -r outer inner _ < ${shellQuote(placeOf(id))}
  if [ "$(readlink "/proc/\${inner:-0}/ns/pid" 2>/dev/null)" = "$taken" ]; then taker=$outer; else taker=gone; fi
}`;

/**
 * The executor: hands a command, the caller's directory and environment to
 * the workspace's runner over its FIFO, streams the output back and exits
 * with the command's status. It finds its own tools on {@link SYSTEM_PATH};
 * the command runs with its caller's PATH, behind the shims on macOS.
 */
const execScript = (
  id: string,
  held: Pick<Held, "exec" | "path" | "pid" | "scratch">,
  gh: string | undefined
): string => {
  const linux = process.platform === "linux";
  const path = linux
    ? `printf 'export PATH=%q\\n' "$caller_path"`
    : `printf 'export PATH=%q\\n' ${shellQuote(`${shimsOf(id)}:`)}"$caller_path"`;
  return `#!/bin/bash
# CawCo workspace ${id}: runs one shell command inside the workspace's boundary.
# exec [--cwd-out FILE] COMMAND — FILE gets the directory COMMAND ended in.
caller_path=$PATH
PATH=${SYSTEM_PATH}
export PATH
# While the agent replaces the boundary, wait, then run through the new one.
gate=${shellQuote(gateOf(id))}
if [ -e "$gate" ]; then
  while [ -e "$gate" ] && kill -0 "$(cat "$gate" 2>/dev/null)" 2>/dev/null; do sleep 0.1; done
  [ -e "$gate" ] || PATH=$caller_path exec "$0" "$@"
fi
fifo=${shellQuote(fifoOf(id))}
if ! [ -p "$fifo" ] || ! kill -0 ${held.pid} 2>/dev/null; then
  echo ${shellQuote(stoppedLine(id))} >&2
  exit 126
fi
${linux ? mountCheck(id, held) : ""}
cwd_out=
if [ "$1" = --cwd-out ]; then cwd_out=$2; shift 2; fi
${ghToken(id, gh)}
req=$(mktemp -d ${shellQuote(held.scratch)}/.run.XXXXXX) || exit 126
printf '%s' "$1" > "$req/cmd"
pwd -P > "$req/cwd"
{
  export -p
${commandEnv(id, held.scratch)
  .map((line) => `  echo ${shellQuote(line)}`)
  .join("\n")}
  ${path}
} > "$req/env"
mkfifo "$req/out" "$req/err"
trap 'kill -TERM -- "-$(cat "$req/pid" 2>/dev/null)" 2>/dev/null; rm -rf "$req"; exit 143' TERM INT HUP
printf '%s\\n' "$req" > "$fifo"
cat "$req/out" & out=$!
cat "$req/err" >&2 & err=$!
wait "$out" "$err"
${linux ? followTaker(id) : `taker=${held.pid}`}
# A sandbox stopped mid-command leaves no status: the command is cut off.
until [ -s "$req/status" ]; do
${linux ? '  [ -z "$taker" ] && [ -s "$req/sandbox" ] && take' : ""}
  if ! kill -0 "\${taker:-${held.pid}}" 2>/dev/null; then
    echo ${shellQuote(`cawco: workspace ${id}'s boundary stopped while this command ran, so it was cut off.`)} >&2
    rm -rf "$req"
    exit 137
  fi
  sleep 0.01
done
status=$(cat "$req/status")
if [ -n "$cwd_out" ] && [ -s "$req/cwd-out" ]; then cp "$req/cwd-out" "$cwd_out"; fi
rm -rf "$req"
exit "$status"
`;
};

/**
 * The folders a boundary needs before it starts: its state dir, the part of
 * it a command reads (with the empty git template), its scratch dir beside
 * that, and the caches it writes. Never nested in one another (srt #446).
 */
const makeDirs = async (id: string): Promise<void> => {
  await mkdir(sessionIdentityDir(), { recursive: true, mode: 0o700 });
  await Promise.all(
    [
      stateDir(id),
      roOf(id),
      gitTemplateOf(id),
      scratchOf(id),
      ...workspaceCaches(),
    ].map((path) => mkdir(path, { recursive: true }))
  );
};

/** How many files {@link ownInodes} copies at once. */
const OWN_INODE_BATCH = 64;

/**
 * Gives every file in a Linux clone an inode of its own, and answers how
 * many it copied. bun installs by hardlinking from its cache, so a clone
 * installed outside a boundary shares inodes with the host's bun cache and
 * every host tree installed from it, and a write inside the clone would
 * change a file the host runs. Inside a boundary the cache is the workspaces'
 * own, so after a clone's first start this finds nothing. Runs before the
 * boundary starts, with nothing inside to write.
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

const kill = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(pid, signal);
  } catch {
    // already gone
  }
};

/** Whether `pid` is still a bwrap: a pid on record names no other process. */
const isBwrap = async (pid: number): Promise<boolean> =>
  (await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => ""))
    .split("\0")[0]
    ?.endsWith("bwrap") ?? false;

/** Every process a macOS workspace started, found by the marker its runner handed them all. */
const killMarked = async (id: string): Promise<void> => {
  for (const { pid, command } of await commandLines({ environment: true })) {
    if (command.includes(`CAWCO_WORKSPACE=${id}`) && pid !== process.pid) {
      kill(pid, "SIGKILL");
    }
  }
};

/**
 * Stops the boundary sessiond holds for workspace `id`, with every process in
 * it. Linux: SIGKILL to the outer bwrap ends the sandbox's pid namespace; srt
 * then sees its child exit, and its host removes srt's proxy, socat bridges
 * and mount points and exits (killing the host instead would leave those
 * behind, REPORT.md §5e). macOS: the runner and everything carrying the
 * workspace's marker.
 */
const stopBoundary = async (
  client: SessiondClient,
  id: string
): Promise<void> => {
  const procId = procIdFor("boundary", id);
  const place = await readPlace(id);
  if (place && (await isBwrap(place.outer))) {
    kill(place.outer, "SIGKILL");
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    while (
      // biome-ignore lint/performance/noAwaitInLoops: polls one process until its host has cleaned up, or the deadline passes
      (await holding(client, procId)) &&
      Date.now() < deadline
    ) {
      await Bun.sleep(20);
    }
  }
  if (await holding(client, procId)) {
    await client.signal(procId, "SIGKILL");
  }
  if (process.platform === "darwin") {
    await killMarked(id);
  }
};

/** Starts the workspace's boundary under sessiond and writes its executor. */
const start = async (
  client: SessiondClient,
  ref: WorkspaceRef
): Promise<Boundary> => {
  const linux = process.platform === "linux";
  await makeDirs(ref.id);
  const procId = procIdFor("boundary", ref.id);
  // One this machine can no longer vouch for, or one of another form, is
  // stopped first, never joined.
  await stopBoundary(client, ref.id);
  await rm(placeOf(ref.id), { force: true });
  if (linux) {
    const split = await ownInodes(ref.path);
    if (split > 0) {
      console.info(
        `[workspace] ${ref.id}: ${split} file(s) in its clone shared an inode with a file outside it, and each now has its own`
      );
    }
    const srtTmp = srtTmpOf(ref.id);
    await rm(srtTmp, { recursive: true, force: true });
    await mkdir(srtTmp, { recursive: true, mode: 0o700 });
  }
  await excludeSandboxNames(ref.path);
  const plan = await planOf(ref);
  for (const [path, content] of plan.files) {
    // biome-ignore lint/performance/noAwaitInLoops: two small files
    await writeWhole(path, content, 0o644);
  }
  const fifo = fifoOf(ref.id);
  await rm(fifo, { force: true });
  const made = await Bun.$`/usr/bin/mkfifo ${fifo}`.quiet().nothrow();
  if (made.exitCode !== 0) {
    throw refusal(ref.id, `mkfifo failed: ${made.stderr.toString().trim()}`);
  }
  await client.spawnProc(procId, plan.spec);
  await ready(client, procId, READY, "the boundary").catch((error: Error) => {
    throw refusal(ref.id, error.message);
  });
  const proc = (await client.list()).procs.find(
    (candidate) => candidate.procId === procId
  );
  if (!proc?.alive) {
    throw refusal(ref.id, "the boundary exited right after it started");
  }
  // The host names its sandbox before it passes the ready line on.
  if (linux && !(await readPlace(ref.id))) {
    throw refusal(
      ref.id,
      "its sandbox's processes could not be found as it started"
    );
  }
  const held: Omit<Held, "hook" | "policy"> = {
    exec: join(stateDir(ref.id), "exec"),
    pid: proc.pid,
    scratch: scratchOf(ref.id),
    path: ref.path,
    form: plan.form,
  };
  // armHook writes the executor.
  return armHook(ref.id, held);
};

/**
 * Kills the workspace's boundary with every process in it ({@link
 * stopBoundary}), stops serving its tool door, then its state goes, and on
 * Linux srt's temp dir with the sockets srt leaves there (REPORT.md §5o).
 * Its judges go last: with the state dir gone there is no workspace to start
 * one again for ({@link watchJudge}).
 */
export const closeBoundary = async (ref: WorkspaceRef): Promise<void> => {
  forgetStale(ref.id);
  await closeToolDoor(ref.id);
  const client = await sessiond();
  await stopBoundary(client, ref.id);
  if (process.platform === "linux" && process.env.XDG_RUNTIME_DIR) {
    await rm(srtTmpOf(ref.id), { recursive: true, force: true });
  }
  await rm(stateDir(ref.id), { recursive: true, force: true });
  await Promise.all(
    (await client.list()).procs
      .filter((proc) => proc.alive && isJudgeOf(proc.procId, ref.id))
      .map((proc) => client.signal(proc.procId, "SIGKILL"))
  );
};
