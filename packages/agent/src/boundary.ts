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
 * dir ({@link ghToken}), and hands it in as `GH_TOKEN`, with an empty config
 * dir of gh's own ({@link ghConfigOf}): pushes, through git's `gh auth
 * git-credential` helper, and `gh` keep working inside, on both OSes. The
 * hub lands a workspace's commits the same way: its `git push` is a command
 * the workspace's agent runs through this executor (`runWorkflowCommand`). `cawco tools` reaches the hub's tools through the
 * workspace's tool door (`tool-door.ts`).
 *
 * sessiond holds the boundary and the workspace's judge, so an agent restart
 * leaves them — and every process in the boundary — running, as it leaves the
 * sessions. One started in another form (another policy, runner, executor or
 * host), or held by a retiring session keeper (a keeper handover left it
 * there, core keepers.ts), is handed over ({@link handOver}): a boundary of
 * this build's form starts beside it on the current keeper, every new command
 * runs in the new one, and the older one runs on, untouched, until nothing
 * runs in it, then closes ({@link closeIdle}). Every boundary and judge
 * process is found and stopped on whichever keeper holds it. A machine that
 * cannot hold a boundary refuses the work: a work item never runs without
 * one.
 *
 * No command holds a key or reaches a key agent: `~/.ssh` is under the
 * home dir's deny, the executor drops every agent socket's variable
 * (`AGENT_SOCKET_ENV`), and no host socket is reachable. A workspace reaches
 * another machine only through CawCo: a check that names one runs in a
 * workspace there (the hub's `runChecks`).
 */
import { createHash, randomBytes } from "node:crypto";
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
import { currentEndpoint, machineEndpoint } from "@cawco/core/keepers";
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
import type { ProcSpec } from "@cawco/core/sessiond";
import { cloneDenies, workspacePolicy } from "@cawco/core/workspace-policy";
import { rgPath } from "@vscode/ripgrep-universal";
import { seatbeltProfile, srtSettings } from "./boundary-policy";
import { cloneInPlace } from "./clone";
import { type HeldProc, KeeperPool } from "./keepers";
import { logRelay } from "./log-relay";
import {
  boundaryProcId,
  isBoundaryOf,
  isJudgeOf,
  JUDGE_FORM_LENGTH,
  judgeProcId,
} from "./proc-id";
import type { SessiondClient } from "./sessiond-client";
import {
  hasLeftDirs,
  listStandIns,
  removeStandIns,
  rewriteLeftFiles,
} from "./stand-ins";
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
   * The form it was started in ({@link formOf}). One of another form, or of
   * none, is handed over ({@link handOver}).
   */
  readonly form?: string;
  /**
   * Its generation: its sessiond id, its files in the state dir, its FIFO and
   * srt's temp dir are its own ({@link generationDir}), so an older one runs
   * on beside it. None for one started before generations, whose files lie
   * in the state dir itself.
   */
  readonly gen?: string;
  /**
   * The Linux boundary before srt (an `unshare` anchor that commands joined
   * with `nsenter`): its anchor's user namespace, as `/proc/<pid>/ns/user`
   * names it, with `pid` the anchor's. macOS before srt: `runner`.
   */
  readonly identity?: string;
  readonly path: string;
}

/**
 * An older boundary still running beside the current one ({@link handOver}):
 * its record, and the executors that were on their way into it when it was
 * handed over, which may still hand it a command.
 */
interface Retiring extends Held {
  readonly executors: readonly number[];
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

/**
 * A boundary generation's own part of the state dir: its srt settings and
 * runner (Linux) or Seatbelt profile (macOS), and the srt host's working
 * dir, where it names its sandbox ({@link placeOf}). A boundary without a
 * generation kept those in the state dir itself.
 */
const generationDir = (id: string, gen: string | undefined): string =>
  gen ? join(stateDir(id), "boundaries", gen) : stateDir(id);

/** The runner's FIFO, in the part of the state dir a command reads. */
const fifoOf = (id: string, gen: string | undefined): string =>
  join(roOf(id), gen ? `runner-${gen}.fifo` : "runner.fifo");

/**
 * An empty git template: srt denies writes to every `.git/hooks`, so a `git
 * clone` inside (SwiftPM checkouts, git dependencies) fails copying git's
 * template hooks unless it has none to copy (REPORT.md §5g).
 */
const gitTemplateOf = (id: string): string => join(roOf(id), "git-template");

/**
 * `gh`'s config dir inside the boundary (`GH_CONFIG_DIR`): empty and
 * read-only there. gh reads `config.yml` from its config dir as it starts and
 * takes a missing one as nothing set, but quits on any other error ("failed
 * to create root command: failed to read configuration"). The host's
 * `~/.config/gh` is under the home deny: srt shows it as missing, Seatbelt
 * answers EPERM, so on macOS every `gh` inside quit before it read
 * `GH_TOKEN`, git's `gh auth git-credential` helper with it, and a push went
 * out anonymous (Nightly C, 2026-10-10). Here it finds no config on both.
 */
const ghConfigOf = (id: string): string => join(roOf(id), "gh");

const WHITESPACE = /\s+/;

/** The line the runner prints once a command can be handed to it. */
const READY = "cawco-boundary-ready";
const STOP_TIMEOUT_MS = 5000;

/** Linux: where the srt host names the sandbox it runs now ({@link Place}): `sandbox` in its working dir. */
const placeOf = (id: string, gen: string | undefined): string =>
  join(generationDir(id, gen), "sandbox");

/**
 * Linux: the protected binds of the sandbox {@link placeOf} names, one mount
 * point a line as `/proc/<pid>/mountinfo` spells it, written by the srt host
 * before the place, so the executor checks what that very sandbox holds.
 */
const guardedOf = (id: string, gen: string | undefined): string =>
  join(generationDir(id, gen), "guarded");

const readPlace = async (
  id: string,
  gen: string | undefined
): Promise<Place | undefined> => {
  const text = await readFile(placeOf(id, gen), "utf8").catch(() => "");
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
  // The keeper it runs on is part of its form: after a keeper handover, the
  // next arming starts the workspace's judge on the current keeper, beside the
  // one a retiring keeper runs, which leaves once the hook no longer names it.
  // So the retiring keeper is left holding nothing of the workspace.
  const keeper = basename(await currentEndpoint(sessiondPath()));
  const form = createHash("sha256")
    .update([serverText, judgeText, ...handed, keeper].join("\0"))
    .digest("hex")
    .slice(0, JUDGE_FORM_LENGTH);
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
      if (await holding(procId)) {
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
 * the boundary is, but for one from before srt (`identity`): this build's
 * executor cannot reach its anchor or its runner's FIFO, and would refuse
 * every command as "not running" until the handover, so it keeps the
 * executor its own build wrote, which also waits at the handover's gate. A
 * running CLI reads its hook at every call, so it asks
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
  if (!held.identity) {
    // A boundary started before gh had a config dir of its own gets it here.
    await mkdir(ghConfigOf(id), { recursive: true });
    await writeWhole(held.exec, execScript(id, held, await hostGh()), 0o755);
  }
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
 * build's runtime. A running boundary of an older form is handed over here,
 * behind the gate, and its handover arms the new one ({@link handOver}); one
 * whose handover fails is armed as it is and tried again at each look
 * ({@link replaceSoon}). An older boundary an earlier agent left running
 * beside the current one is closed once nothing runs in it
 * ({@link closeWhenIdle}).
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
    const said = (what: string) => (error: unknown) => {
      console.warn(
        `[workspace] ${id}: ${what}: ${error instanceof Error ? error.message : String(error)}`
      );
    };
    // biome-ignore lint/performance/noAwaitInLoops: a few small writes per workspace, one workspace at a time
    if ((await readRetiring(id)).length > 0) {
      closeWhenIdle(id);
    }
    const held = await readHeld(id).catch(
      said("its boundary hook could not be written again")
    );
    if (!held) {
      continue;
    }
    // A gate an agent left as it died names no process this one waits for.
    await rm(gateOf(id), { force: true });
    const ref = { id, path: held.path };
    if (process.platform === "linux") {
      // Before anything is armed: each mount point a running sandbox left
      // where a file stands in holds that file's stand-in now, in place; one
      // where a dir stands in goes with its boundary, once nothing runs in it
      // (`stand-ins.ts`).
      const dirsLeft = await rewriteLeftFiles(ref).catch((error: unknown) => {
        said("the mount points its sandbox left could not be rewritten")(error);
        return false;
      });
      if (dirsLeft) {
        restartWhenIdle(ref);
      }
    }
    // Only CawCo's stand-ins in the clone's `info/exclude`: the fixed names
    // an earlier build wrote there go, and a user's own files show again.
    await listStandIns(ref, false).catch(
      said("its clone's stand-ins could not be listed in its info/exclude")
    );
    const form = await formOf(ref).catch(
      said("its boundary's form could not be checked")
    );
    const stale = form !== undefined && held.form !== form;
    if (stale && (await running(id, held))) {
      // Handed over now, behind the gate: the executor an earlier build left
      // may not reach this boundary (Nightly C wrote its srt executor over
      // every anchor from before srt), so a command waits at the gate and
      // runs through the new boundary rather than being refused.
      await writeFile(gateOf(id), String(process.pid));
      try {
        await ensureBoundary(ref);
        armed += 1;
        continue;
      } catch (error) {
        said("its older boundary could not be handed over yet")(error);
        replaceSoon(ref);
      } finally {
        await rm(gateOf(id), { force: true });
      }
    }
    try {
      await armHook(id, held);
      armed += 1;
    } catch (error) {
      said("its boundary hook could not be written again")(error);
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

/** The machine's keeper endpoint: its directory, where every keeper's endpoint is, is hidden from a bounded command. */
const sessiondPath = machineEndpoint;

/**
 * The machine's keepers as this module reaches them, dialled on first use: a
 * boundary or a judge starts on the current keeper, and one a retiring keeper
 * holds is found and stopped there.
 */
const keepers = new KeeperPool();

/** The keeper every new boundary and judge starts on: the current one. */
const sessiond = (): Promise<SessiondClient> => keepers.current();

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

/** Whether a keeper, the current one or a retiring one, holds a live process under `procId`. */
const holding = async (procId: string): Promise<boolean> =>
  Boolean(await keepers.holding(procId));

/**
 * The keeper's process running the boundary `held` names, on whichever keeper
 * runs it, when it is still the one that was started. A Linux one from
 * before srt names its anchor, the child of the process sessiond holds, by
 * the anchor's user namespace.
 */
const running = async (
  id: string,
  held: Held
): Promise<HeldProc | undefined> => {
  const proc = await keepers.holding(boundaryProcId(id, held.gen));
  if (!proc) {
    return;
  }
  const same =
    process.platform === "linux" && held.identity
      ? (await readlink(`/proc/${held.pid}/ns/user`).catch(() => undefined)) ===
        held.identity
      : proc.pid === held.pid;
  return same ? proc : undefined;
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
  const holder = held ? await running(ref.id, held) : undefined;
  if (!(held && holder)) {
    await stopUnvouched(ref.id, held);
    return start(client, ref);
  }
  // One of an older form, or one a retiring keeper holds, is handed over to
  // one of this build's form on the current keeper.
  if (held.form !== (await formOf(ref)) || holder.epoch !== client.epoch) {
    if (process.platform === "linux" && (await hasLeftDirs(ref.path))) {
      // A boundary started beside it would bind the same mount point and
      // keep it; this one is replaced whole once nothing runs in it.
      forgetStale(ref.id);
      restartWhenIdle(ref);
      return armHook(ref.id, held);
    }
    const fresh = await handOver(client, ref, held);
    forgetStale(ref.id);
    return fresh;
  }
  forgetStale(ref.id);
  // Written again each time: one an earlier agent started may have no hook
  // yet, or one that reaches cawco another way.
  return armHook(ref.id, held);
};

/**
 * Stops what this machine can no longer vouch for before a boundary starts,
 * never joining it: the boundary `held` names, which is no longer running as
 * it was started, and any other boundary process of the workspace that no
 * record names, on every keeper. An older boundary still running beside it
 * is left alone ({@link handOver}).
 */
const stopUnvouched = async (
  id: string,
  held: Held | undefined
): Promise<void> => {
  const kept = new Set(
    (await readRetiring(id)).map((old) => boundaryProcId(id, old.gen))
  );
  if (held) {
    await stopBoundary(id, held);
    await cleanGeneration(id, held);
  }
  await Promise.all(
    (await keepers.held())
      .filter(
        (proc) =>
          proc.alive && isBoundaryOf(proc.procId, id) && !kept.has(proc.procId)
      )
      .map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
  );
  if (process.platform === "darwin" && kept.size === 0) {
    await killMarked(id);
  }
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

/**
 * A Linux boundary generation's srt temp dir, short (a socket path is capped
 * at 108 bytes, srt #213) and its own (REPORT.md §5o).
 */
const srtTmpOf = (id: string, gen: string | undefined): string => {
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
    createHash("sha256")
      .update(gen ? `${id}/${gen}` : id)
      .digest("hex")
      .slice(0, 12)
  );
};

/**
 * The variable a macOS runner hands every process it starts, naming its
 * generation, beside the workspace's own marker.
 */
const BOUNDARY_MARKER = "CAWCO_BOUNDARY";

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

/** How a workspace's boundary of one generation starts in this build, and the form that names it. */
interface Plan {
  /** Written into the generation's dir before the boundary starts. */
  readonly files: readonly (readonly [string, string])[];
  /**
   * A hash of what the boundary runs under: its srt settings or Seatbelt
   * profile (so the policy as this machine stands now), the runner, the
   * executor and, on Linux, the host script, each as a boundary of
   * {@link FORM_GENERATION} has them, so every generation of one form has
   * the same. A boundary started in another form is handed over
   * ({@link handOver}, REPORT.md §7.7).
   */
  readonly form: string;
  readonly spec: ProcSpec;
}

/** The generation every form is computed for ({@link Plan.form}): no boundary has it. */
const FORM_GENERATION = "form";

/** The form a boundary of workspace `ref` takes in this build on this machine now. */
const formOf = async (ref: WorkspaceRef): Promise<string> =>
  (await planFor(ref, FORM_GENERATION)).form;

/** The {@link Plan} of generation `gen` of workspace `ref`'s boundary on this machine now. */
const planOf = async (ref: WorkspaceRef, gen: string): Promise<Plan> => {
  const [plan, form] = await Promise.all([planFor(ref, gen), formOf(ref)]);
  return { ...plan, form };
};

/** {@link planOf}, its form hashed from `gen`'s own files. */
const planFor = async (ref: WorkspaceRef, gen: string): Promise<Plan> => {
  const { id } = ref;
  const policy = await workspacePolicy(ref);
  const runtime = await bunRuntime(id);
  const exec = execScript(
    id,
    {
      exec: join(stateDir(id), "exec"),
      gen,
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
    const file = join(generationDir(id, gen), "boundary.sb");
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
          fifoOf(id, gen),
        ],
        // In the clone, as the srt host starts its sandbox on Linux: every
        // command's shell starts in the runner's directory before it moves to
        // its caller's, and one the profile denies (sessiond's own, under the
        // home dir) fails bash's getcwd ("shell-init: error retrieving current
        // directory") on every command.
        cwd: policy.clone,
        // The markers are how an archive finds every process the workspace
        // started, and how an older runner tells its own from this one's
        // ({@link busyOld}).
        env: {
          CAWCO_WORKSPACE: id,
          [BOUNDARY_MARKER]: gen,
          TMPDIR: policy.scratch,
        },
      },
    };
  }
  const srtTmp = srtTmpOf(id, gen);
  const settings = `${JSON.stringify(srtSettings(policy, { rg: ripgrep(), srtTmp }), null, 2)}\n`;
  const host = hostScript();
  hostText ??= Bun.file(host).text();
  // What the host makes in the clone before each sandbox, so srt binds
  // each deny path onto itself and leaves nothing on the host
  // (`cloneDenies`), and guards for the sandbox's whole life.
  const denies = `${JSON.stringify(cloneDenies(policy.clone), null, 2)}\n`;
  const files = {
    settings: join(generationDir(id, gen), "srt.json"),
    runner: join(generationDir(id, gen), "runner.sh"),
    denies: join(generationDir(id, gen), "denies.json"),
  };
  return {
    files: [
      [files.settings, settings],
      [files.runner, RUNNER],
      [files.denies, denies],
    ],
    form: hash
      .update(settings)
      .update("\0")
      .update(RUNNER)
      .update("\0")
      .update(exec)
      .update("\0")
      .update(denies)
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
        fifoOf(id, gen),
        policy.clone,
        READY,
        files.denies,
      ],
      // The host starts here, never in the clone: Bun reads bunfig.toml and
      // .env from where it starts (boundary-host.ts). It names its sandbox
      // here too ({@link placeOf}).
      cwd: generationDir(id, gen),
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

/** Linux: the processes in the pid namespace of `inner`, the sandbox's init. */
const inSandbox = (seen: Seen[], inner: number | undefined): Seen[] => {
  const space = seen.find((one) => one.pid === inner)?.pidNs;
  return space === undefined ? [] : seen.filter((one) => one.pidNs === space);
};

/**
 * What the anchor of a Linux boundary from before srt waits on, as its own
 * child: `while :; do sleep 86400 & wait; done`. A command's orphan is the
 * anchor's child too, the namespace's init reaping it, so only this exact
 * command line is the anchor's own.
 */
const ANCHOR_SLEEP = "sleep 86400";

/**
 * Whether `command` runs the executor `exec`: as `<exec> …`, or as the
 * interpreter its shebang names, `/bin/bash <exec> …`. Naming the path is not
 * enough: the workspace's judge is handed it as an argument ({@link judgeFor})
 * and runs as long as the workspace does, so an older boundary that counted
 * it would never close.
 */
const runsExecutor = (command: string, exec: string): boolean => {
  const startsWith = (text: string) =>
    text === exec || text.startsWith(`${exec} `);
  return (
    startsWith(command) || startsWith(command.slice(command.indexOf(" ") + 1))
  );
};

/** The executors on their way into workspace `id`'s boundary ({@link runsExecutor}). */
const executors = (seen: Seen[], id: string): number[] => {
  const exec = join(stateDir(id), "exec");
  return seen
    .filter((one) => one.pid !== process.pid && runsExecutor(one.command, exec))
    .map((one) => one.pid);
};

/**
 * Whether anything still runs in an older boundary of workspace `id`
 * ({@link Retiring}): an executor that was on its way into it as it was
 * handed over, or a command or a process one left. On Linux that is anything
 * in its sandbox's pid namespace that was not there when its runner was
 * ready, or, for an anchor from before srt, anything in the anchor's pid
 * namespace but the anchor and its `sleep`. On macOS it is anything carrying
 * the workspace's marker but not the current runner's ({@link
 * BOUNDARY_MARKER}): a process an older runner started cannot be told from
 * one a runner before it started, so the older runners close together.
 */
const busyOld = async (
  seen: Seen[],
  id: string,
  old: Retiring,
  current: Held | undefined
): Promise<boolean> => {
  const exec = join(stateDir(id), "exec");
  // Checked again as the executor itself, not by the record alone: a record
  // written before {@link runsExecutor} lists the judge too.
  if (
    seen.some(
      (one) =>
        old.executors.includes(one.pid) && runsExecutor(one.command, exec)
    )
  ) {
    return true;
  }
  if (process.platform === "linux" && old.identity) {
    const space = seen.find((one) => one.pid === old.pid)?.pidNs;
    return seen.some(
      (one) =>
        space !== undefined &&
        one.pidNs === space &&
        one.pid !== old.pid &&
        !(one.ppid === old.pid && one.command === ANCHOR_SLEEP)
    );
  }
  if (process.platform === "linux") {
    const place = await readPlace(id, old.gen);
    const idle = new Set(place?.idle);
    return inSandbox(seen, place?.inner).some((one) => !idle.has(one.pid));
  }
  const own = current?.gen && `${BOUNDARY_MARKER}=${current.gen}`;
  return seen.some(
    (one) =>
      one.pid !== old.pid &&
      one.pid !== current?.pid &&
      one.pid !== process.pid &&
      one.command.includes(`CAWCO_WORKSPACE=${id}`) &&
      !(own && one.command.includes(own))
  );
};

/** Where an older boundary still running beside the current one is recorded ({@link Retiring}). */
const retiringFileOf = (id: string, old: Pick<Held, "gen">): string =>
  join(stateDir(id), `retiring-${old.gen ?? "first"}.json`);

const RETIRING_FILE = /^retiring-[^/]+\.json$/;

/** Every older boundary of workspace `id` recorded as still running beside the current one. */
const readRetiring = async (id: string): Promise<Retiring[]> => {
  const names = await readdir(stateDir(id)).catch(() => [] as string[]);
  const records = await Promise.all(
    names
      .filter((name) => RETIRING_FILE.test(name))
      .map((name) =>
        readFile(join(stateDir(id), name), "utf8")
          .then((text) => JSON.parse(text) as Retiring)
          .catch(() => undefined)
      )
  );
  return records.filter((record): record is Retiring => Boolean(record));
};

/**
 * Hands workspace `ref`'s boundary `old`, of an older form, over to a new
 * one of this build's form, started beside it. The gate goes up first, so an
 * executor on its way in either waits and then runs through the new one, or
 * is already past it and is recorded with the older boundary, which it may
 * still hand its command. The older one is recorded before the new one
 * replaces its record, so no agent loses it, and runs on untouched with every
 * process in it; it closes once nothing runs in it ({@link closeIdle}).
 */
const handOver = async (
  client: SessiondClient,
  ref: WorkspaceRef,
  old: Held
): Promise<Boundary> => {
  const gate = gateOf(ref.id);
  await writeFile(gate, String(process.pid));
  try {
    const record = retiringFileOf(ref.id, old);
    const retiring: Retiring = {
      ...old,
      executors: executors(await snapshot(), ref.id),
    };
    await writeWhole(record, `${JSON.stringify(retiring)}\n`, 0o644);
    const fresh = await start(client, ref).catch(async (error: unknown) => {
      await rm(record, { force: true });
      throw error;
    });
    console.info(
      `[workspace] ${ref.id}: its boundary ${old.pid} (form ${old.form ?? "none"}) is handed over to ${fresh.pid}; it closes once nothing runs in it`
    );
    closeWhenIdle(ref.id);
    return fresh;
  } finally {
    await rm(gate, { force: true });
  }
};

/**
 * Closes every older boundary of workspace `id` that nothing runs in any
 * more, or that is no longer running, and cleans its files; one that still
 * runs something is left as it is. Answers whether any is left.
 */
const closeIdle = async (seen: Seen[], id: string): Promise<boolean> => {
  const current = await readHeld(id).catch(() => undefined);
  let left = false;
  for (const old of await readRetiring(id)) {
    // biome-ignore lint/performance/noAwaitInLoops: one older boundary at a time
    const alive = Boolean(await running(id, old));
    if (alive && (await busyOld(seen, id, old, current))) {
      left = true;
      continue;
    }
    await stopBoundary(id, old);
    await cleanGeneration(id, old);
    await rm(retiringFileOf(id, old), { force: true });
    console.info(
      `[workspace] ${id}: its older boundary ${old.pid} (form ${old.form ?? "none"}) ${alive ? "has nothing left running in it and is closed" : "is gone"}`
    );
  }
  return left;
};

/** How often the boundaries of an older form are looked at. */
const STALE_LOOK_MS = 5000;
/** The workspaces whose boundary is of an older form, to hand over. */
const stale = new Map<string, WorkspaceRef>();
/** The workspaces with an older boundary still running beside the current one. */
const retiring = new Set<string>();
let staleTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Each {@link STALE_LOOK_MS}: hands over every running boundary of an older
 * form ({@link ensureBoundary}), then closes every older boundary nothing
 * runs in any more ({@link closeIdle}), reading the processes once for all
 * of them, after the handovers. A workspace leaves the first set once its
 * boundary is handed over, current, or no longer running, and the second
 * once no older boundary of it is left.
 */
const lookAtStale = async (): Promise<void> => {
  await handOverStale();
  if (retiring.size > 0) {
    await closeRetiring();
  }
  if (stubbed.size > 0) {
    await restartStubbed();
  }
};

/**
 * The workspaces whose running sandbox holds an srt mount point, a file,
 * where a dir stands in (`stand-ins.ts`): left by a sandbox started before
 * the stand-ins, or covered again by one started beside it. Unlinking it on
 * the host would drop the deny inside that sandbox, so the boundary is
 * replaced once nothing runs in it, and its new host makes the dir.
 */
const stubbed = new Map<string, WorkspaceRef>();

/** Replaces workspace `ref`'s boundary once nothing runs in it ({@link stubbed}). */
const restartWhenIdle = (ref: WorkspaceRef): void => {
  stubbed.set(ref.id, ref);
  lookSoon();
};

const forgetStubbed = (id: string): void => {
  stubbed.delete(id);
  stopLooking();
};

/** Waits for each sandbox init in `inners` to be gone, up to {@link STOP_TIMEOUT_MS}; answers whether all are. */
const sandboxesGone = async (inners: readonly number[]): Promise<boolean> => {
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  for (;;) {
    if (!inners.some((pid) => existsSync(`/proc/${pid}`))) {
      return true;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    // biome-ignore lint/performance/noAwaitInLoops: polls until the sandboxes are gone, or the deadline passes
    await Bun.sleep(20);
  }
};

/**
 * Replaces each {@link stubbed} workspace's boundary when nothing runs in it:
 * no older boundary beside it, no executor on its way in, nothing in its
 * sandbox but what was there when its runner was ready. The gate goes up
 * first, as for a handover, so a command arriving meanwhile waits and runs
 * through the new one. A workspace with no boundary running, or no such
 * mount point left, is forgotten: its next start makes the stand-in.
 */
const restartStubbed = async (): Promise<void> => {
  for (const ref of [...stubbed.values()]) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one workspace at a time
      const held = await readHeld(ref.id);
      // On every keeper: the current one, and a retiring one still running one.
      const alive = (await keepers.held())
        .filter((proc) => proc.alive && isBoundaryOf(proc.procId, ref.id))
        .map((proc) => proc.procId);
      if (!held || alive.length === 0 || !(await hasLeftDirs(ref.path))) {
        forgetStubbed(ref.id);
        continue;
      }
      if (
        alive.some((procId) => procId !== boundaryProcId(ref.id, held.gen)) ||
        starting.has(ref.id)
      ) {
        // An older boundary closes first, once idle ({@link closeIdle}).
        continue;
      }
      const restart = restartIfIdle(ref, held);
      starting.set(ref.id, restart);
      await restart.finally(() => starting.delete(ref.id));
    } catch (error) {
      console.warn(
        `[workspace] ${ref.id}: its boundary could not be started again around its harness config yet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

/**
 * {@link restartStubbed}'s one workspace: its boundary as it is while
 * anything runs in it, else a new one on the current keeper, the one before
 * stopped on whichever keeper runs it.
 */
const restartIfIdle = async (
  ref: WorkspaceRef,
  held: Held
): Promise<Boundary> => {
  const gate = gateOf(ref.id);
  await writeFile(gate, String(process.pid));
  try {
    const seen = await snapshot();
    if (
      executors(seen, ref.id).length > 0 ||
      (await busyOld(seen, ref.id, { ...held, executors: [] }, undefined))
    ) {
      return held;
    }
    const place = await readPlace(ref.id, held.gen);
    await stopBoundary(ref.id, held);
    if (!(await sandboxesGone(place ? [place.inner] : []))) {
      throw new Error(
        `its sandbox ${place?.inner} was still there ${STOP_TIMEOUT_MS / 1000}s after it was stopped`
      );
    }
    await cleanGeneration(ref.id, held);
    const fresh = await start(await sessiond(), ref);
    forgetStubbed(ref.id);
    console.info(
      `[workspace] ${ref.id}: its boundary ${held.pid} held an srt mount point where a dir stands in, had nothing running and is replaced by ${fresh.pid}`
    );
    return fresh;
  } finally {
    await rm(gate, { force: true });
  }
};

const handOverStale = async (): Promise<void> => {
  for (const ref of [...stale.values()]) {
    if (starting.has(ref.id)) {
      continue;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one boundary handed over at a time
      const held = await readHeld(ref.id);
      if (!(held && (await running(ref.id, held)))) {
        forgetStale(ref.id);
        continue;
      }
      await ensureBoundary(ref);
    } catch (error) {
      console.warn(
        `[workspace] ${ref.id}: its older boundary could not be handed over yet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

const closeRetiring = async (): Promise<void> => {
  const seen = await snapshot();
  for (const id of [...retiring]) {
    if (starting.has(id)) {
      continue;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one workspace's older boundaries at a time
      if (!(await closeIdle(seen, id))) {
        forgetRetiring(id);
      }
    } catch (error) {
      console.warn(
        `[workspace] ${id}: its older boundary could not be closed yet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

/** Looks at the older boundaries each {@link STALE_LOOK_MS} while there are any ({@link lookAtStale}). */
const lookSoon = (): void => {
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

/** Hands workspace `ref`'s boundary, of an older form, over at the next look. */
const replaceSoon = (ref: WorkspaceRef): void => {
  stale.set(ref.id, ref);
  lookSoon();
};

/** Closes workspace `id`'s older boundaries as nothing runs in each any more. */
const closeWhenIdle = (id: string): void => {
  retiring.add(id);
  lookSoon();
};

const stopLooking = (): void => {
  if (
    stale.size === 0 &&
    retiring.size === 0 &&
    stubbed.size === 0 &&
    staleTimer
  ) {
    clearInterval(staleTimer);
    staleTimer = undefined;
  }
};

const forgetStale = (id: string): void => {
  stale.delete(id);
  stopLooking();
};

const forgetRetiring = (id: string): void => {
  retiring.delete(id);
  stopLooking();
};

/**
 * What a retiring session keeper runs of a workspace (a keeper handover left
 * it there) moves to the current keeper, so the keeper before is left holding
 * nothing of it (binary-update.ts `#tendKeepers`, while any keeper retires):
 *
 * - its current boundary is handed over at the next look ({@link
 *   replaceSoon}), as one of an older form is; the one on the retiring keeper
 *   runs on until nothing runs in it, then closes, as does an older
 *   generation that keeper still runs;
 * - its judge, when none runs on the current keeper: the hook is armed again,
 *   which starts the judge on the current keeper (its form names its keeper,
 *   {@link judgeFor}) and points the hook at it once it answers; the one
 *   before leaves once the hook no longer names it.
 *
 * One listing of each keeper, whatever the number of workspaces.
 */
export const leaveRetiringKeepers = async (): Promise<void> => {
  const current = await sessiond();
  const procs = (await keepers.held()).filter((proc) => proc.alive);
  const elsewhere = procs.filter((proc) => proc.epoch !== current.epoch);
  if (elsewhere.length === 0) {
    return;
  }
  const ids = await readdir(workspacesDir()).catch(() => [] as string[]);
  for (const id of ids) {
    if (starting.has(id)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one small read per workspace, only while a keeper retires
    const held = await readHeld(id).catch(() => undefined);
    if (!held) {
      continue;
    }
    const boundary = boundaryProcId(id, held.gen);
    if (!stale.has(id) && elsewhere.some((proc) => proc.procId === boundary)) {
      console.info(
        `[workspace] ${id}: its boundary runs on a retiring session keeper, and is handed over to one on the current keeper`
      );
      replaceSoon({ id, path: held.path });
    }
    const judged = (procsOn: typeof procs) =>
      procsOn.some((proc) => isJudgeOf(proc.procId, id));
    if (
      judged(elsewhere) &&
      !judged(procs.filter((proc) => proc.epoch === current.epoch))
    ) {
      console.info(
        `[workspace] ${id}: its judge runs on a retiring session keeper; its hook is armed again, with a judge on the current one`
      );
      await armHook(id, held).catch((error: unknown) => {
        console.warn(
          `[workspace] ${id}: its judge could not be started on the current session keeper: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }
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
 * the empty git template, gh's empty config dir ({@link ghConfigOf}), the
 * tool door, and `CAWCO_WORKSPACE`, by which a
 * script tells that it runs inside one; never a key agent's socket
 * ({@link AGENT_SOCKET_ENV}).
 */
const commandEnv = (id: string, scratch: string): string[] => [
  `unset ${AGENT_SOCKET_ENV.join(" ")}`,
  ...Object.entries({
    ...workspaceCacheEnv(),
    TMPDIR: scratch,
    GIT_TEMPLATE_DIR: gitTemplateOf(id),
    GH_CONFIG_DIR: ghConfigOf(id),
    CAWCO_TOOL_SOCKET: toolDoorOf(id),
    CAWCO_WORKSPACE: id,
  }).map(([name, value]) => `export ${name}=${shellQuote(value)}`),
];

const stoppedLine = (id: string): string =>
  `cawco: workspace ${id}'s boundary is not running, so this command did not run. The workspace's next session starts it again.`;

/** How long an executor waits for the srt host to start a sandbox again, in tenths of a second. */
const RESTART_WAIT_TENTHS = WORKSPACE_BOUNDARY_START_TIMEOUT_MS / 100;

/**
 * Linux: srt protects every clone-side deny path (`cloneDenies`: the clone's
 * git config, hooks and submodule dirs, the harness project config) with a
 * read-only bind, and the kernel drops such a bind in every other mount
 * namespace when the host renames or unlinks what it covers (a host-side
 * `git config` does: lock, then rename). The srt host watches for that and
 * starts the sandbox again (`boundary-host.ts`); this is the executor's own
 * look before every command: the running sandbox's mount table must still
 * hold every bind its host guards ({@link guardedOf}). When it does not, it
 * asks the host to start a new sandbox (SIGUSR1), and runs the command
 * through that one (REPORT.md §5d). CawCo never writes a live clone's
 * config: it writes `branch.*` only before the boundary starts
 * (`cloneInPlace`).
 */
const mountCheck = (id: string, held: Pick<Held, "gen" | "pid">): string =>
  `place=${shellQuote(placeOf(id, held.gen))}
read -r outer inner _ < "$place" 2>/dev/null
if ! awk 'FILENAME == ARGV[1] { want[$0] = 1; next } ($5 in want) { delete want[$5] } END { for (p in want) exit 1 }' ${shellQuote(guardedOf(id, held.gen))} "/proc/\${inner:-0}/mountinfo" 2>/dev/null; then
  kill -USR1 ${held.pid} 2>/dev/null
  for _ in $(seq ${RESTART_WAIT_TENTHS}); do
    read -r now _ < "$place" 2>/dev/null
    if [ -n "$now" ] && [ "$now" != "\${outer:-}" ]; then PATH=$caller_path exec "$0" "$@"; fi
    kill -0 ${held.pid} 2>/dev/null || break
    sleep 0.1
  done
  echo ${shellQuote(stoppedLine(id))} >&2
  exit 126
fi`;

/**
 * Linux: which sandbox runs the command. The srt host may start a new one
 * while a command waits to be taken ({@link mountCheck}), and the runner
 * stamps each request with its sandbox's pid namespace as it takes it; the
 * request is the current sandbox's when the current init is in that
 * namespace, and was taken by one already gone when not (`gone`, which no
 * `kill -0` finds). Until a sandbox takes it, the host's being alive is what
 * counts: it runs one or exits.
 */
const followTaker = (id: string, gen: string | undefined): string => `taker=
take() {
  local taken outer inner
  read -r taken < "$req/sandbox"
  read -r outer inner _ < ${shellQuote(placeOf(id, gen))}
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
  held: Pick<Held, "exec" | "gen" | "path" | "pid" | "scratch">,
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
fifo=${shellQuote(fifoOf(id, held.gen))}
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
${linux ? followTaker(id, held.gen) : `taker=${held.pid}`}
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
      ghConfigOf(id),
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
 * Stops the boundary of workspace `id` that `held` names, as sessiond holds
 * it, with every process in it. Linux: SIGKILL to the outer bwrap ends the
 * sandbox's pid namespace; srt then sees its child exit, and its host removes
 * srt's proxy, socat bridges and mount points and exits (killing the host
 * instead would leave those behind, REPORT.md §5e). An anchor from before
 * srt goes with the `unshare` sessiond holds (`--kill-child`). macOS: the
 * runner; what it started goes with the workspace ({@link closeBoundary}).
 * On whichever keeper holds it: the current one, or a retiring one.
 */
const stopBoundary = async (
  id: string,
  held: Pick<Held, "gen">
): Promise<void> => {
  const procId = boundaryProcId(id, held.gen);
  const place = await readPlace(id, held.gen);
  if (place && (await isBwrap(place.outer))) {
    kill(place.outer, "SIGKILL");
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    while (
      // biome-ignore lint/performance/noAwaitInLoops: polls one process until its host has cleaned up, or the deadline passes
      (await holding(procId)) &&
      Date.now() < deadline
    ) {
      await Bun.sleep(20);
    }
  }
  const left = await keepers.holding(procId);
  if (left) {
    await left.client.signal(procId, "SIGKILL");
  }
};

/**
 * Removes the files of the stopped boundary `held` names: its generation's
 * dir, FIFO and srt temp dir; for one from before generations, what it kept
 * in the state dir itself (the srt boundary's sandbox, settings, runner and
 * FIFO; the anchor's run dir, ssh includes and the macOS runner's FIFO).
 */
const cleanGeneration = async (
  id: string,
  held: Pick<Held, "gen" | "identity">
): Promise<void> => {
  const srtTmp =
    process.platform === "linux" && process.env.XDG_RUNTIME_DIR
      ? [srtTmpOf(id, held.gen)]
      : [];
  const own = generationDir(id, held.gen);
  let files: string[];
  if (held.gen) {
    files = [own, fifoOf(id, held.gen), ...srtTmp];
  } else if (held.identity) {
    files = ["run", "ssh_config.d", "runner.fifo", "boundary.sb"].map((name) =>
      join(own, name)
    );
  } else {
    files = [
      ...["sandbox", "srt.json", "runner.sh", "boundary.sb"].map((name) =>
        join(own, name)
      ),
      fifoOf(id, undefined),
      ...srtTmp,
    ];
  }
  await Promise.all(
    files.map((path) => rm(path, { recursive: true, force: true }))
  );
};

/**
 * Starts a boundary of a new generation for the workspace under sessiond and
 * writes its executor, which then runs every command through it. One that
 * fails to start is stopped and its files go, so a start tried again leaves
 * nothing of the last behind.
 */
const start = async (
  client: SessiondClient,
  ref: WorkspaceRef
): Promise<Boundary> => {
  const gen = randomBytes(4).toString("hex");
  await makeDirs(ref.id);
  await mkdir(generationDir(ref.id, gen), { recursive: true });
  try {
    return await launch(client, ref, gen);
  } catch (error) {
    await stopBoundary(ref.id, { gen });
    await cleanGeneration(ref.id, { gen });
    throw error;
  }
};

/** {@link start}'s generation `gen`, from its files to its record. */
const launch = async (
  client: SessiondClient,
  ref: WorkspaceRef,
  gen: string
): Promise<Boundary> => {
  const linux = process.platform === "linux";
  const procId = boundaryProcId(ref.id, gen);
  if (linux) {
    const split = await ownInodes(ref.path);
    if (split > 0) {
      console.info(
        `[workspace] ${ref.id}: ${split} file(s) in its clone shared an inode with a file outside it, and each now has its own`
      );
    }
    const srtTmp = srtTmpOf(ref.id, gen);
    await rm(srtTmp, { recursive: true, force: true });
    await mkdir(srtTmp, { recursive: true, mode: 0o700 });
  }
  // Linux: the host makes each missing deny path before the sandbox starts.
  await listStandIns(ref, linux);
  const plan = await planOf(ref, gen);
  for (const [path, content] of plan.files) {
    // biome-ignore lint/performance/noAwaitInLoops: a few small files
    await writeWhole(path, content, 0o644);
  }
  const fifo = fifoOf(ref.id, gen);
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
  if (linux && !(await readPlace(ref.id, gen))) {
    throw refusal(
      ref.id,
      "its sandbox's processes could not be found as it started"
    );
  }
  const held: Omit<Held, "hook" | "policy"> = {
    exec: join(stateDir(ref.id), "exec"),
    gen,
    pid: proc.pid,
    scratch: scratchOf(ref.id),
    path: ref.path,
    form: plan.form,
  };
  if (linux && (await hasLeftDirs(ref.path))) {
    // Its host left a mount point where a dir stands in: an older boundary
    // beside it held one there ({@link stubbed}).
    restartWhenIdle(ref);
  }
  // armHook writes the executor.
  return armHook(ref.id, held);
};

/**
 * Kills the workspace's boundaries, the current one and every older one
 * still beside it, with every process in them ({@link stopBoundary}), and any
 * other boundary process of the workspace; on macOS everything carrying the
 * workspace's marker. Stops serving its tool door. On Linux, once its
 * sandboxes are gone, the deny stand-ins in its clone go
 * (`stand-ins.ts`). Then its state goes, and on Linux
 * srt's temp dirs with the sockets srt leaves there (REPORT.md §5o).
 * Its judges go last, on every keeper that runs one: with the state dir gone
 * there is no workspace to start one again for ({@link watchJudge}).
 */
export const closeBoundary = async (ref: WorkspaceRef): Promise<void> => {
  forgetStale(ref.id);
  forgetRetiring(ref.id);
  forgetStubbed(ref.id);
  await closeToolDoor(ref.id);
  const held = await readHeld(ref.id).catch(() => undefined);
  const boundaries = [...(held ? [held] : []), ...(await readRetiring(ref.id))];
  const inners: number[] = [];
  for (const boundary of boundaries) {
    // biome-ignore lint/performance/noAwaitInLoops: one boundary at a time
    const place = await readPlace(ref.id, boundary.gen);
    if (place) {
      inners.push(place.inner);
    }
    await stopBoundary(ref.id, boundary);
    await cleanGeneration(ref.id, boundary);
  }
  const signalAll = async (owned: (procId: string) => boolean) =>
    await Promise.all(
      (await keepers.held())
        .filter((proc) => proc.alive && owned(proc.procId))
        .map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
    );
  await signalAll((procId) => isBoundaryOf(procId, ref.id));
  if (process.platform === "darwin") {
    await killMarked(ref.id);
  } else if (await sandboxesGone(inners)) {
    // Only once no sandbox holds a mount on them: each goes if it is still
    // exactly as it was made (`stand-ins.ts`).
    await removeStandIns(ref).catch((error: unknown) => {
      console.warn(
        `[workspace] ${ref.id}: its clone's deny stand-ins could not be taken away: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  } else {
    console.warn(
      `[workspace] ${ref.id}: its sandbox was still there ${STOP_TIMEOUT_MS / 1000}s after it was stopped, so its clone's deny stand-ins are left`
    );
  }
  await rm(stateDir(ref.id), { recursive: true, force: true });
  await signalAll((procId) => isJudgeOf(procId, ref.id));
};
