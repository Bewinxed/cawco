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
 *   clone, its scratch dir and the workspaces' cache (a write anywhere else,
 *   the read-denied home dir, `/tmp` and `/run` among them, fails at once
 *   with EROFS: `srtSettings` in boundary-policy.ts), sees and signals only
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
 * through one executor, `~/.cawco/workspaces/<id>/exec [--session]
 * [--cwd-out FILE] COMMAND` ({@link execScript}), that every harness runs its shell commands
 * through: claude by a PreToolUse hook that rewrites the command (the
 * workspace's `hook` script, which asks its judge, `boundary-judge.ts`), OpenCode by its
 * plugin's `bash` tool, pi by its bash tool's operations, a workflow's
 * `runCommand`. A workspace holds no credential of any host: its git reaches
 * its clone's origin, on any host and over any transport, through the git
 * door (hub-git.ts), which signs in on the host with the host's own. Its
 * `gh` reaches GitHub's API through the workspace's GitHub door
 * (github-door.ts), which judges each write by the project's upstream rule
 * and signs in on the host to what goes, whatever the rule: no forge's token
 * ever enters a workspace ({@link commandEnv}). The hub lands a workspace's
 * commits through the same door: its `git push` is a command the workspace's
 * agent runs through this executor (`runWorkflowCommand`). `cawco tools` reaches the hub's tools through the
 * workspace's tool door (`tool-door.ts`).
 *
 * sessiond holds the boundary and the workspace's judge, so an agent restart
 * leaves them — and every process in the boundary — running, as it leaves the
 * sessions. One started in another form (another policy, runner, executor or
 * host), or held by a retiring session keeper (a keeper handover left it
 * there, core keepers.ts), is handed over ({@link handOver}): a boundary of
 * this build's form starts beside it on the current keeper, every new command
 * runs in the new one, and the older one runs on, untouched, until nothing
 * runs in it, then closes ({@link closeIdle}). One whose work still runs
 * anything is not handed over until that ends ({@link workLeft}): the new
 * one's pid namespace and network are others, where the delegate's next
 * command would find nothing of what it left running. Every boundary and judge
 * process is found and stopped on whichever keeper holds it. A boundary runs
 * only while something holds it ({@link liveWhy}); one nothing has held for
 * {@link QUIET_CLOSE_MS} closes with its judge, its clone and state left as
 * they are, and its next command starts it again ({@link closeQuietly}). A
 * machine that
 * cannot hold a boundary refuses the work: a work item never runs without
 * one.
 *
 * No command holds a key or reaches a key agent: `~/.ssh` is under the
 * home dir's deny, the executor drops every agent socket's variable
 * (`AGENT_SOCKET_ENV`), and no host socket is reachable. A workspace reaches
 * another machine only through CawCo: the landing gate's iOS build runs in a
 * gate workspace on a Mac (the hub's `runGate`).
 */
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync } from "node:fs";
import {
  access,
  appendFile,
  chmod,
  copyFile,
  lstat,
  mkdir,
  open as openFile,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import type { WorkspaceRef } from "@cawco/core";
import { WORKSPACE_BOUNDARY_START_TIMEOUT_MS } from "@cawco/core";
import { atMost } from "@cawco/core/at-most";
import { binaryRoot, readUpdateState } from "@cawco/core/binary-installation";
import { nestedSeatbeltRefusal } from "@cawco/core/boundary-nesting";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { isGitDir } from "@cawco/core/git-dir";
import {
  type HandoverCommand,
  type HandoverEvent,
  step as handoverStep,
  initialHandover,
  KEEPERS_ASK_AGAIN_MS,
  type ListedWorkspace,
} from "@cawco/core/handover";
import { HEAVY_RUN_HELD_ENV } from "@cawco/core/heavy-run";
import {
  currentEndpoint,
  currentKeeper,
  machineEndpoint,
} from "@cawco/core/keepers";
import {
  AGENT_SOCKET_ENV,
  darwinUserDirs,
  forgetWorkspaceTmp,
  hostCaEnv,
  linkWorkspaceTmp,
  scratchSocketProblem,
  sessionIdentityDir,
  userGitConfigDir,
  workspaceAccountsFile,
  workspaceCacheDir,
  workspaceCacheEnv,
  workspaceCaches,
  workspaceDoorDir,
  workspaceMaestroEnv,
  workspaceMaestroHome,
  workspacePolicyFile,
  workspaceProjectFile,
  workspaceReadOnlyDir,
  workspaceRuntimeDir,
  workspaceScratchDir,
  workspaceSpillsFile,
  workspaceStateDir,
  workspacesDir,
  workspaceTmpDir,
  workspaceUpstreamRuleFile,
  workspaceXdgDirs,
  workspaceXdgEnv,
} from "@cawco/core/paths";
import {
  commandLine as commandLineOf,
  commandLines,
  processLineage,
  processStart,
} from "@cawco/core/process-identity";
import {
  embeddedFile,
  runtimeExecutable,
  runtimeVersion,
  standalone,
} from "@cawco/core/runtime";
import { hostEnvironment } from "@cawco/core/session-env";
import type { ProcSpec } from "@cawco/core/sessiond";
import { listedPid, type Pid, signal as signalPid } from "@cawco/core/signal";
import {
  DamagedRecord,
  isDamagedRecord,
  readRecord,
  writeStateFile,
} from "@cawco/core/state-file";
import type { UpstreamRule, UpstreamRules } from "@cawco/core/upstream-guard";
import {
  type Policy,
  PROTECTED_NAMES,
  PROTECTED_UNDER,
} from "@cawco/core/workspace-judge";
import {
  isPlace,
  workspaceDenies,
  workspacePolicy,
} from "@cawco/core/workspace-policy";
import { rgPath } from "@vscode/ripgrep-universal";
import {
  readOnlyDeniesBwrap,
  seatbeltProfile,
  srtSettings,
} from "./boundary-policy";
import { closeWorkspaceBrowsers, ensureGateToken } from "./browser/gate";
import { cloneInPlace } from "./clone";
import { reportDamaged } from "./damaged-records";
import { cawcoCommand } from "./git-credential";
import { closeGithubDoor, githubDoorOf, openGithubDoor } from "./github-door";
import {
  closeGitDoor,
  gitDoorEnv,
  gitDoorOf,
  gitHelperDirOf,
  guardedPushParameters,
  openGitDoor,
} from "./hub-git";
import { type HeldProc, KeeperPool } from "./keepers";
import { logRelay } from "./log-relay";
import {
  boundaryProcId,
  isBoundaryOf,
  isJudgeOf,
  JUDGE_FORM_LENGTH,
  judgeProcId,
  parseProcId,
} from "./proc-id";
import type { SessiondClient } from "./sessiond-client";
import {
  hasLeftDirs,
  listStandIns,
  removeStandIns,
  rewriteLeftFiles,
} from "./stand-ins";
import {
  closeToolDoor,
  openToolDoor,
  socketPlace,
  toolDoorOf,
} from "./tool-door";

/** A running boundary, as a harness uses it. */
export interface Boundary {
  /** `exec [--session] [--cwd-out FILE] COMMAND`: runs COMMAND inside the boundary, in the caller's directory; a session's command (`--session`) shows the workspace's notice first ({@link noticeOf}). */
  readonly exec: string;
  /** The PreToolUse hook a claude session runs before each tool call ({@link hookScript}). */
  readonly hook: string;
  /** The process sessiond holds: the srt host (Linux) or the runner (macOS). */
  readonly pid: number;
  /** The workspace's policy file, which every harness judges its file tools by (`workspace-policy.ts`). */
  readonly policy: string;
  /** The workspace's scratch dir, its commands' `TMPDIR` (on macOS by its short name, `workspaceTmpDir`): `~/.cawco/tmp/<id8>` (`workspaceScratchDir`), on disk and outside the clone. */
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
   * on beside it.
   */
  readonly gen: string;
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
   * shell and socat bridges, the runner): anything else that descends from
   * its init is the workspace's work ({@link inTree}, {@link busyOld}).
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
 * dir, where it names its sandbox ({@link placeOf}).
 */
const generationDir = (id: string, gen: string): string =>
  join(stateDir(id), "boundaries", gen);

/**
 * The policy a boundary generation started with, as {@link planFor} wrote it
 * beside its other files: what that boundary grants for its whole life,
 * whatever the workspace's policy says since ({@link narrowing}).
 */
const grantedOf = (id: string, gen: string): string =>
  join(generationDir(id, gen), "policy.json");

/** The policy generation `gen` of workspace `id` started with ({@link grantedOf}); undefined when none is on record. */
const grantedPolicy = (id: string, gen: string): Promise<Policy | undefined> =>
  readRecord<Policy>(grantedOf(id, gen)).catch(() => undefined);

/**
 * Lines for a workspace's next session command, which its executor shows on
 * stderr before the command's own output and then removes ({@link
 * execScript}'s `--session`): what CawCo did to the work without being asked
 * ({@link replaceNarrowed}). In the state dir, which nothing inside writes.
 */
const noticeOf = (id: string): string => join(stateDir(id), "notice");

/** The runner's FIFO, in the part of the state dir a command reads. */
const fifoOf = (id: string, gen: string): string =>
  join(roOf(id), `runner-${gen}.fifo`);

/**
 * An empty git template: srt denies writes to every `.git/hooks`, so a `git
 * clone` inside (SwiftPM checkouts, git dependencies) fails copying git's
 * template hooks unless it has none to copy (REPORT.md §5g).
 */
const gitTemplateOf = (id: string): string => join(roOf(id), "git-template");

/**
 * The system gitconfig every command's git reads (`GIT_CONFIG_SYSTEM`, git
 * 2.32+), read-only inside, in place of the host's: Apple's git (Command
 * Line Tools) and Homebrew's each ship one naming
 * `credential.helper=osxkeychain`, which reaches no keychain service inside
 * in any case (`KEYCHAIN_MACH_SERVICES`). It names no helper: a workspace
 * holds no credential, and every push across the network and its clone's
 * own origin go through the git door, which signs in on the host
 * (hub-git.ts). The user's gitconfig, read after it, still applies.
 * `GIT_CONFIG_COUNT` is left alone: srt and the session hand git their own
 * entries through it.
 */
const gitSystemConfigOf = (id: string): string => join(roOf(id), "gitconfig");

/** {@link gitSystemConfigOf}'s text. */
const gitSystemConfig = (id: string): string =>
  `# CawCo workspace ${id}: the system gitconfig git reads inside the boundary.\n`;

const WHITESPACE = /\s+/;

/** The line the runner prints once a command can be handed to it. */
const READY = "cawco-boundary-ready";
const STOP_TIMEOUT_MS = 5000;

/** Linux: where the srt host names the sandbox it runs now ({@link Place}): `sandbox` in its working dir. */
const placeOf = (id: string, gen: string): string =>
  join(generationDir(id, gen), "sandbox");

/**
 * Linux: the protected binds of the sandbox {@link placeOf} names, one mount
 * point a line as `/proc/<pid>/mountinfo` spells it, written by the srt host
 * before the place, so the executor checks what that very sandbox holds.
 */
const guardedOf = (id: string, gen: string): string =>
  join(generationDir(id, gen), "guarded");

const readPlace = async (
  id: string,
  gen: string
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

/** A session's `command`, as it runs inside the boundary (pi's bash tool): `--session`, so it shows the workspace's notice first. */
export const boundaryCommand = (boundary: Boundary, command: string): string =>
  `${shellQuote(boundary.exec)} --session ${shellQuote(command)}`;

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
      .env(hostEnvironment())
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
 * The bun the agent's plain Bun scripts run on, the boundary's and a stage's
 * host (stage.ts): `<binary root>/run` with {@link BUN_SCRIPT_ENV} in a
 * binary install, bun in a checkout.
 */
export const bunScriptRuntime = (): string =>
  standalone ? join(binaryRoot(), "run") : (Bun.which("bun") ?? "bun");

/** What {@link bunScriptRuntime} needs in its environment: a binary install's runs as bun only with `BUN_BE_BUN=1`. */
export const BUN_SCRIPT_ENV: Readonly<Record<string, string>> = standalone
  ? { BUN_BE_BUN: "1" }
  : {};

/**
 * {@link bunScriptRuntime} for workspace `id`'s boundary scripts. Refuses the
 * workspace when it is not there, rather than writing a hook that refuses
 * every command.
 */
const bunRuntime = async (id: string): Promise<string> => {
  const runtime = bunScriptRuntime();
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

/** The judge's two scripts as this build runs them: the judge beside it, and the server. */
const judgeScripts = (): Promise<[string, string]> =>
  Promise.all([
    scriptText(
      "boundary/workspace-judge.ts",
      join(import.meta.dir, "..", "..", "core", "src", JUDGE_SCRIPT)
    ),
    scriptText("boundary/judge.ts", join(import.meta.dir, JUDGE_SERVER)),
  ]);

/**
 * The build a judge runs, as it says it ({@link JUDGE_BUILD_QUESTION}): its
 * two scripts, hashed. Handed to each judge as it starts.
 */
const judgeBuildOf = ([judgeText, serverText]: [string, string]): string =>
  createHash("sha256")
    .update([serverText, judgeText].join("\0"))
    .digest("hex")
    .slice(0, JUDGE_FORM_LENGTH);

/**
 * The line a judge answers with the build it runs, `0` and the build
 * (`boundary-judge.ts`); a call's JSON is never this. A judge of a build
 * before this question refuses it, as it refuses any line it cannot read.
 */
const JUDGE_BUILD_QUESTION = "cawco-judge-build";

/** The judges starting now, by their sessiond id: one start each, however many ask. */
const judging = new Map<string, Promise<void>>();

/**
 * How many arms of each workspace's hook are under way ({@link armHook}),
 * from a judge's exit to its start again too ({@link watchJudge}): its hook
 * may name a judge that is going while it is.
 */
const arming = new Map<string, number>();

/** Runs `arm` with workspace `id` counted as {@link arming}. */
const whileArming = async <T>(
  id: string,
  arm: () => Promise<T>
): Promise<T> => {
  arming.set(id, (arming.get(id) ?? 0) + 1);
  try {
    return await arm();
  } finally {
    const left = (arming.get(id) ?? 1) - 1;
    if (left > 0) {
      arming.set(id, left);
    } else {
      arming.delete(id);
    }
  }
};
/** The judges whose exit this agent watches, by their sessiond id, each with the connection it watches on. */
const watchedJudges = new Map<string, SessiondClient>();

/**
 * The workspace's judge, running: `boundary-judge.ts` on {@link bunRuntime},
 * held by sessiond like the boundary, so it outlives the agent and every CLI
 * keeps asking it. It and the judge beside it (which OpenCode's plugin
 * imports too) are written into the state dir first.
 *
 * Its form is a hash of what it runs and is handed, the keeper it runs on and
 * the dir it listens in; one of each form runs,
 * on its own socket (`judge-<form>.sock` in `workspaceDoorDir`), under its own sessiond id. So a new
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
  const scripts = await judgeScripts();
  const [judgeText, serverText] = scripts;
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
  // In the workspace's socket dir, not its state dir: under a deep HOME the
  // state dir's path passes a socket's length, and the hook's
  // `pack_sockaddr_un` would cut it to a name nothing listens on.
  const place = workspaceDoorDir(id);
  // Where it listens is part of its form too, as the socket is one of what
  // it is handed: a judge is found running by its form alone, and one an
  // earlier build started with the same scripts on the same keeper but in
  // another place (the state dir, before be056a0e) listens where this hook
  // would not look. Its form differs, so this build's starts at once beside
  // it, and the hook names a judge that answers.
  const form = createHash("sha256")
    .update([serverText, judgeText, ...handed, keeper, place].join("\0"))
    .digest("hex")
    .slice(0, JUDGE_FORM_LENGTH);
  // A judge of this form may be listening there already, so nothing is removed.
  const socket = join(place, `judge-${form}.sock`);
  await socketPlace(socket, "the workspace's judge");
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
        // Its build last: what it answers when asked which it runs.
        args: [server, socket, ...handed, judgeBuildOf(scripts)],
        // Bun reads bunfig.toml and .env from where it starts: the state dir,
        // which nothing inside the boundary writes.
        cwd: stateDir(id),
        env: {
          ...BUN_SCRIPT_ENV,
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
      // Counted as arming from its exit until it is started again, as the
      // handover decides ({@link armStep}).
      whileArming(id, async () => {
        const held = await readHeld(id);
        if (held) {
          console.warn(
            `[workspace] ${id}: its judge ${procId} exited (${signal ?? `code ${code}`}); arming its hook again`
          );
        }
        armStep({ kind: "judge-exit", id, held: held !== undefined });
        await rearming.get(id);
      }).catch((error: unknown) => {
        console.warn(
          `[workspace] ${id}: its judge could not be started again: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    },
  });
};

/** Each boundary's srt host followed ({@link watchHost}), by its proc id, with the connection it is followed on. */
const watchedHosts = new Map<string, SessiondClient>();

/**
 * Says in the agent's log each line the srt host of workspace `id`'s
 * boundary `held` says after its sandbox is ready, on whichever keeper holds
 * it: above all a sandbox it starts again because a guarded path changed on
 * the host, which ends everything in the workspace (`boundary-host.ts`). Its
 * stderr the keeper drains unread, so these lines are the one record of it.
 * From `afterSeq` (its ready line, so nothing is missed between the start and
 * this), or from now for a boundary an earlier agent started. A watch lives
 * on its keeper connection, so a new connection watches again.
 */
const watchHost = async (
  id: string,
  held: Pick<Held, "gen" | "pid">,
  afterSeq?: number
): Promise<void> => {
  if (process.platform !== "linux") {
    return;
  }
  const procId = boundaryProcId(id, held.gen);
  const proc = await keepers.holding(procId);
  if (!proc || watchedHosts.get(procId) === proc.client) {
    return;
  }
  const { client } = proc;
  watchedHosts.set(procId, client);
  client.subscribe(
    procId,
    {
      line: (event) => {
        const text = event.data.trim();
        if (text && text !== READY) {
          console.info(
            `[workspace] ${id}: its boundary ${held.pid} says: ${text}`
          );
        }
      },
      exit: () => {
        if (watchedHosts.get(procId) === client) {
          watchedHosts.delete(procId);
        }
        client.unsubscribe(procId);
      },
    },
    afterSeq
  );
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
 *   DerivedData goes in the workspaces' cache, `DerivedData.noindex` (a
 *   name Spotlight never indexes), through the
 *   `IDECustomDerivedDataLocation` default, which every action takes, where
 *   `-derivedDataPath` is refused by some (`-showsdks`, exit 64); its
 *   package cache through `-packageCachePath`, which only a build or a
 *   package resolution takes. A build skips Xcode's macro and package
 *   plugin trust checks (`-skipMacroValidation`,
 *   `-skipPackagePluginValidation`), as the boundary's evaluation built with
 *   (REPORT.md, results/macos-run.txt): they ask whether the owner trusts a
 *   macro or plugin before it runs on the host, read from the host's
 *   `~/Library/org.swift.swiftpm/security`, which the boundary hides, and a
 *   workspace's build runs them inside the boundary. It runs with a home of its own
 *   ({@link writeXcodeHome}), so what Foundation puts under `~/Library/Caches`
 *   (SwiftPM's manifest cache among it) lands in the workspaces' cache.
 * - A compile through either (`swift build`, `test` or `run`; an xcodebuild
 *   `build`, `build-for-testing`, `test`, `archive`, `analyze` or `install`)
 *   is one of the machine's heavy runs: it runs under the agent's own
 *   `cawco heavy-run` (core heavy-run.ts), which starts it once a slot is
 *   free and the machine has room, unless a run it is under already holds
 *   one (`CAWCO_HEAVY_RUN_HELD`). `test-without-building` compiles nothing:
 *   Maestro's runner, on a simulator whose slot holds the run.
 * - `xcrun simctl boot` is a heavy run too, as a simulator mac-slot.sh boots
 *   is: on 2026-10-19 the Mac had a third simulator booted outside
 *   mac-slot.sh while it paged at a load of 800. Every other `xcrun` call
 *   runs as it is.
 * - `log`, which Seatbelt refuses outright, asks the agent to run `log show`
 *   or `log stream` outside the boundary (`log-relay.ts`).
 *
 * Each finds the real tool with `xcrun --find`, so it follows the selected
 * Xcode. Nothing is set globally: the owner's own Xcode is untouched.
 */
/**
 * The entries of `~/Library` an xcodebuild inside a macOS boundary writes,
 * each its own in the workspaces' cache ({@link writeXcodeHome}): Foundation's
 * caches dir, where SwiftPM keeps its shared cache and manifest database
 * (`swiftPMCacheDirectory`, FileManager's caches dir + `org.swift.swiftpm`,
 * Sources/Basics/FileSystem/FileSystem+Extensions.swift), the logs, and
 * SwiftPM's configuration and security dir.
 */
const XCODE_OWN_LIBRARY = ["Caches", "Logs", "org.swift.swiftpm"];

/** The home a macOS workspace's xcodebuild runs with (`CFFIXED_USER_HOME`): in the part of its state dir a command reads. */
const xcodeHomeOf = (id: string): string => join(roOf(id), "xcode-home");

/** Where {@link XCODE_OWN_LIBRARY}'s entries live, in the workspaces' cache. */
const xcodeLibraryCache = (): string =>
  join(workspaceCacheDir(), "xcode-library");

/**
 * The home xcodebuild runs with inside a macOS boundary. Seatbelt lets it
 * write nothing under the host's `~/Library`, and xcodebuild keeps SwiftPM's
 * manifest database under `~/Library/Caches/org.swift.swiftpm/manifests`
 * whatever `-packageCachePath` says, so package resolution failed ("The file
 * “ManifestLoading” couldn’t be saved in the folder “manifests”", Nightly C,
 * 2026-10-10). Opening the host's would let a workspace plant manifest
 * results the owner's own Xcode then trusts. `CFFIXED_USER_HOME` is the home
 * CoreFoundation, and Foundation through it, hands the process instead of
 * the account's; this one's `Library` holds a link to each entry of the
 * host's `~/Library`, which Seatbelt judges where it lands (the policy reads
 * `Developer` and `Preferences`: the simulators, Xcode's settings), and, for
 * {@link XCODE_OWN_LIBRARY}, a link into the workspaces' cache, which the
 * shim makes inside. Written here, on the host, only in the read-only part
 * of the state dir: nothing the workspace writes is followed. Each link is
 * replaced by a rename, so an xcodebuild running meanwhile never finds one
 * missing.
 */
const writeXcodeHome = async (id: string): Promise<void> => {
  const library = join(xcodeHomeOf(id), "Library");
  await mkdir(library, { recursive: true });
  const hostLibrary = join(homedir(), "Library");
  const names = await readdir(hostLibrary).catch(() => [] as string[]);
  const links = new Map<string, string>([
    ...names.map((name): [string, string] => [name, join(hostLibrary, name)]),
    ...XCODE_OWN_LIBRARY.map((name): [string, string] => [
      name,
      join(xcodeLibraryCache(), name),
    ]),
  ]);
  await Promise.all(
    [...links].map(async ([name, target]) => {
      const link = join(library, name);
      if ((await readlink(link).catch(() => undefined)) === target) {
        return;
      }
      const temporary = `${link}.${process.pid}.tmp`;
      await rm(temporary, { force: true });
      await symlink(target, temporary);
      await rename(temporary, link);
    })
  );
};

const writeShims = async (id: string, runtime: string): Promise<void> => {
  const bin = shimsOf(id);
  await mkdir(bin, { recursive: true });
  await writeXcodeHome(id);
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
  // A compile is one of the machine's heavy runs (core heavy-run.ts), held by
  // this agent's `cawco heavy-run` until it ends; one under a run already held
  // (build-both.sh, mac-slot.sh, a probe kit run) takes none.
  const heavyRunLine = `[ -n "\${${HEAVY_RUN_HELD_ENV}:-}" ] || exec ${cawcoCommand("heavy-run").map(shellQuote).join(" ")} "$(printf '%q ' "\${run[@]}")"`;
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
    run=("$swift" "$command" --disable-sandbox --cache-path ${swiftpm}/cache --security-path ${swiftpm}/security "\${scratch[@]}" "$@")
    ${heavyRunLine}
    exec "\${run[@]}"
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
compiles=
packages=
args=()
for arg in "$@"; do
  case $arg in
    OTHER_SWIFT_FLAGS=*)
      args+=("$arg -disable-sandbox")
      flags=1
      ;;
    build | build-for-testing | test | archive | analyze | install)
      args+=("$arg")
      builds=1
      compiles=1
      ;;
    test-without-building | clean | installsrc | -resolvePackageDependencies)
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
[ -z "$builds" ] || args+=(-skipMacroValidation -skipPackagePluginValidation)
# A home of its own, whose Caches, Logs and org.swift.swiftpm are the workspaces' cache.
mkdir -p ${XCODE_OWN_LIBRARY.map((name) => shellQuote(join(xcodeLibraryCache(), name))).join(" ")} || exit 1
export CFFIXED_USER_HOME=${shellQuote(xcodeHomeOf(id))}
run=("$xcodebuild" -IDEPackageSupportDisableManifestSandbox=YES -IDEPackageSupportDisablePluginExecutionSandbox=YES -IDECustomDerivedDataLocation=${shellQuote(join(cache, "DerivedData.noindex"))} "\${args[@]}")
[ -z "$compiles" ] || ${heavyRunLine}
exec "\${run[@]}"
`,
      0o755
    ),
    // A simulator boot is one of the machine's heavy runs, as mac-slot.sh's
    // are: it waits for a slot and the machine's room (memory and swap
    // among it), then the boot runs and the slot goes once it returns.
    writeWhole(
      join(bin, "xcrun"),
      `#!/bin/bash
# CawCo workspace ${id}: xcrun, a simulator boot waiting for the machine's room.
if [ "\${1:-}" = simctl ] && [ "\${2:-}" = boot ]; then
  run=(/usr/bin/xcrun "$@")
  ${heavyRunLine}
  exec "\${run[@]}"
fi
exec /usr/bin/xcrun "$@"
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

/** The workspace's upstream rule (`UpstreamRule`), written only here ({@link workspaceUpstreamRuleFile}). */
const upstreamRuleOf = workspaceUpstreamRuleFile;

/** The rules the hub last handed this machine (register and heartbeat acks); none until it has. */
let upstreamRules: UpstreamRules | undefined;

/** Workspace `id`'s rule under `rules`: its project's, or the fleet's for a workspace in none. */
const ruleFor = async (
  id: string,
  rules: UpstreamRules
): Promise<UpstreamRule> => {
  const project = await readRecord<unknown>(workspaceProjectFile(id)).catch(
    () => undefined
  );
  return (
    (typeof project === "string" && rules.projects[project]) || rules.fleet
  );
};

/** Writes workspace `id`'s upstream rule under the rules held, when it changed; nothing while none is held. */
const writeUpstreamRule = async (id: string): Promise<void> => {
  const rules = upstreamRules;
  if (!rules) {
    return;
  }
  const text = `${JSON.stringify(await ruleFor(id, rules))}\n`;
  const file = upstreamRuleOf(id);
  if ((await readFile(file, "utf8").catch(() => "")) === text) {
    return;
  }
  await writeWhole(file, text, 0o644);
};

/**
 * Takes the upstream rules the hub hands this machine with each register
 * and heartbeat ack, and writes each workspace's here (one with a `ro` dir:
 * one whose boundary was armed), so its shims judge the next call by the
 * choice as it stands: a change reaches a running session within a beat.
 */
export const takeUpstreamRules = async (
  rules: UpstreamRules | undefined
): Promise<void> => {
  if (!rules) {
    return;
  }
  upstreamRules = rules;
  const ids = await readdir(workspacesDir()).catch(() => [] as string[]);
  await Promise.all(
    ids
      .filter((id) => existsSync(roOf(id)))
      .map((id) =>
        writeUpstreamRule(id).catch((error: unknown) => {
          console.warn(
            `[workspace] ${id}: its upstream rule could not be written: ${error instanceof Error ? error.message : String(error)}`
          );
        })
      )
  );
};

/**
 * The gh config dir every workspace's commands run with (`GH_CONFIG_DIR`,
 * {@link commandEnv}), read-only inside: `http_unix_socket`
 * names the workspace's GitHub door, so gh sends every request there in the
 * clear (go-gh pkg/api/client_options.go `resolveOptions`: "if
 * opts.UnixDomainSocket == \"\" … cfg.Get([]string{\"http_unix_socket\"})"),
 * and its login is a placeholder the door replaces with the host's token for
 * what it lets through. `version: "1"` is the config gh would migrate to,
 * so it writes nothing here.
 */
const guardedGhConfigOf = (id: string): string => join(roOf(id), "gh-guarded");

/** The placeholder gh signs in with in a workspace: no token at all. */
const GH_PLACEHOLDER = "cawco-github-door";

const writeGuardedGhConfig = async (id: string): Promise<void> => {
  const dir = guardedGhConfigOf(id);
  await mkdir(dir, { recursive: true });
  await Promise.all([
    writeWhole(
      join(dir, "config.yml"),
      `# CawCo workspace ${id}: gh reaches GitHub through the workspace's GitHub door.\nversion: "1"\nhttp_unix_socket: ${JSON.stringify(githubDoorOf(id))}\n`,
      0o644
    ),
    writeWhole(
      join(dir, "hosts.yml"),
      `github.com:\n    git_protocol: https\n    user: cawco\n    oauth_token: ${GH_PLACEHOLDER}\n    users:\n        cawco:\n            oauth_token: ${GH_PLACEHOLDER}\n`,
      0o644
    ),
  ]);
};

/** Writes `path` whole or not at all, at exactly `mode`: a reader never sees it half written. */
const writeWhole = (
  path: string,
  content: string,
  mode: number
): Promise<void> => writeStateFile(path, content, { mode });

/**
 * Starts the workspace's judge in this build's form and writes its hook for
 * `held` to ask it, its executor in this build's form for the boundary `held`
 * names, and the record of them, and serves its tool door. An executor only
 * hands commands in, so it is current from the next command on, whatever form
 * the boundary is. A running CLI reads its hook at every call, so it asks
 * the new judge from the next call on. On macOS also its shims. The
 * workspace's policy is written again too, as this machine stands now
 * (`workspacePolicy`): every harness reads it at each file tool call, so a
 * store, toolchain or account added since is in it from the next call on.
 */
const armHook = (
  id: string,
  held: Omit<Held, "hook" | "policy">
): Promise<Held> => whileArming(id, () => armHookNow(id, held));

/** {@link armHook}'s writes and starts, counted as {@link arming}. */
const armHookNow = async (
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
  const runtime = await bunRuntime(id);
  if (process.platform === "darwin") {
    await writeShims(id, runtime);
  }
  await writeGuardedGhConfig(id);
  await writeUpstreamRule(id);
  await writeWhole(gitSystemConfigOf(id), gitSystemConfig(id), 0o644);
  // The copy of gh's token an earlier build's executor kept beside the
  // workspace: nothing reads it now, and a token is kept nowhere it is not used.
  await rm(join(stateDir(id), "gh-token"), { force: true });
  // Its host's pid as the keeper listed it at its start, and matched to
  // the keeper's list again before any boundary on record is armed.
  await writeWhole(
    held.exec,
    execScript(id, { ...held, pid: listedPid(held.pid) }),
    0o755
  );
  await openToolDoor(id);
  await openGitDoor({ id, path: held.path });
  await openGithubDoor(id);
  await watchHost(id, held);
  const armed: Held = { ...held, hook, policy };
  await writeWhole(
    join(stateDir(id), "boundary.json"),
    `${JSON.stringify(armed)}\n`,
    0o644
  );
  return armed;
};

/**
 * Writes one workspace's hook and its script again, in this build's form,
 * and serves its tool door: whether it was armed. A running boundary of an
 * older form is handed over here, behind the gate, and its handover arms the
 * new one ({@link handOver}); while this build's keeper is still owed the
 * machine's endpoint (an update's agent starts before its keeper does), it is
 * armed as it is and handed over once that keeper is the machine's ({@link
 * ownKeeperOwed}); one whose handover fails is armed as it is and tried again
 * at each look ({@link replaceSoon}). An older boundary an
 * earlier agent left running beside the current one is closed once nothing
 * runs in it ({@link closeWhenIdle}). Never throws: what fails is said.
 */
const rearmOne = async (id: string): Promise<boolean> => {
  const said = (what: string) => (error: unknown) => {
    console.warn(
      `[workspace] ${id}: ${what}: ${error instanceof Error ? error.message : String(error)}`
    );
  };
  if ((await readRetiring(id)).length > 0) {
    closeWhenIdle(id);
  }
  const held = await readHeld(id).catch(
    said("its boundary hook could not be written again")
  );
  if (!held) {
    return false;
  }
  // A gate an agent left as it died names no process this one waits for.
  await rm(gateOf(id), { force: true });
  const ref = { id, path: held.path };
  // A person's own folder gets no stand-ins, and nothing is listed in its
  // exclude.
  if (!isPlace(id) && process.platform === "linux") {
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
  if (!isPlace(id)) {
    await listStandIns(ref, false).catch(
      said("its clone's stand-ins could not be listed in its info/exclude")
    );
  }
  const form = await formOf(ref).catch(
    said("its boundary's form could not be checked")
  );
  const stale = form !== undefined && held.form !== form;
  if (stale && (await running(id, held))) {
    // Handed over now, behind the gate: a command waits at the gate and runs
    // through the new boundary rather than through one of another form.
    await writeStateFile(gateOf(id), String(process.pid));
    try {
      await ensureNow(ref);
      return true;
    } catch (error) {
      said("its older boundary could not be handed over yet")(error);
      replaceSoon(ref);
    } finally {
      await rm(gateOf(id), { force: true });
    }
  }
  try {
    await armHook(id, held);
    return true;
  } catch (error) {
    said("its boundary hook could not be written again")(error);
    return false;
  }
};

/**
 * How many workspaces are armed at once at start-up. Our call: each is a few
 * small writes and a keeper round trip or two, and a machine holds hundreds
 * of workspace folders; one at a time took 78 s for 421 on obelisk
 * (2026-10-10), against the update's 180 s window to register.
 */
const REARM_CONCURRENCY = 16;

/**
 * THIS AGENT'S ARMING, AS THE HANDOVER DECIDES IT (core handover.ts): the
 * start-up reading of its workspaces, and which of them are armed now,
 * started again, or left until a session there needs them. This module only
 * reads the workspaces and the keepers, arms, and runs what the reducer says.
 */
let armState = initialHandover();
/** Each workspace's arming under way or done, by id ({@link hookArmed}). */
const rearming = new Map<string, Promise<void>>();
/** Settled each time the start-up reading moves, for a gate waiting on it. */
let readingMoved = Promise.withResolvers<void>();
/** The workspaces the last whole reading found, with the clone each runs in. */
let readRefs = new Map<string, WorkspaceRef>();
const armLimit = atMost(REARM_CONCURRENCY);

/**
 * A SESSION START IN A WORKSPACE IS REFUSED BY NAME WHILE THE AGENT'S
 * START-UP READING IS NOT WHOLE: until it is, no workspace is known armed or
 * not, and a keeper that could not be read is never read as holding nothing.
 * Its reading is tried again every {@link KEEPERS_ASK_AGAIN_MS}, and the
 * refusal lasts until one is whole.
 */
export class ArmingBlocked extends Error {
  readonly workspace: string;
  constructor(workspace: string, why: string) {
    super(
      `Sessions in this workspace can't start yet: this machine's workspaces could not be read at its start (${why}). Nothing was changed; they're read again every ${KEEPERS_ASK_AGAIN_MS / 1000} s, and a start goes once a reading is whole.`
    );
    this.name = "ArmingBlocked";
    this.workspace = workspace;
  }
}

/** One step of the arming, its commands run in order. */
const armStep = (event: HandoverEvent): void => {
  const before = armState.arming;
  const stepped = handoverStep(armState, event);
  armState = stepped.state;
  for (const command of stepped.commands) {
    obeyArming(command);
  }
  if (armState.arming !== before) {
    readingMoved.resolve();
    readingMoved = Promise.withResolvers<void>();
  }
};

const obeyArming = (command: HandoverCommand): void => {
  switch (command.kind) {
    case "arm-read":
      readWorkspaces().then(
        ({ listed, refs }) => {
          readRefs = refs;
          armStep({ kind: "arm-listed", workspaces: listed });
        },
        (error: unknown) =>
          armStep({
            kind: "arm-unread",
            why: error instanceof Error ? error.message : String(error),
            now: Date.now(),
          })
      );
      return;
    case "arm":
      rearming.set(command.id, armOne(command.id, command.how));
      return;
    case "say":
      console.warn(command.words);
      return;
    case "wake": {
      const { at } = command;
      setTimeout(
        () => armStep({ kind: "tick", now: Math.max(Date.now(), at) }),
        Math.max(0, at - Date.now())
      );
      return;
    }
    default:
      return;
  }
};

/**
 * Arms one workspace as the handover says: its hook rewritten in this
 * build's form ({@link rearmOne}), its boundary started again where a
 * session's process runs with none, or its judge started again after it
 * exited ({@link armHook}). What fails is said here and by the arming
 * itself; the workspace is armed as far as it went.
 */
const armOne = async (
  id: string,
  how: "hook" | "revive" | "judge"
): Promise<void> => {
  try {
    if (how === "hook") {
      await armLimit(() => rearmOne(id));
    } else if (how === "judge") {
      const held = await readHeld(id);
      if (held) {
        await armHook(id, held);
      }
    } else {
      const ref = readRefs.get(id);
      if (ref) {
        await armLimit(() => ensureNow(ref));
      }
    }
  } catch (error) {
    console.warn(
      `[workspace] ${id}: ${
        how === "revive"
          ? "a session's process runs in it with no boundary, and its boundary could not be started again"
          : "its judge could not be started again"
      }: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    armStep({ kind: "armed", id });
  }
};

/**
 * Waits until workspace `id`'s hook is in this build's form, arming it now
 * when the start left it for later. Every session there waits on it before
 * it is adopted or launched (`#adoptClaimed`, {@link ensureBoundary}), and
 * on its own workspace's alone. While the start-up reading is blocked it
 * refuses by name ({@link ArmingBlocked}).
 */
export const hookArmed = async (id: string): Promise<void> => {
  for (;;) {
    const phase = armState.arming;
    if (phase.kind === "blocked") {
      throw new ArmingBlocked(id, phase.why);
    }
    if (phase.kind !== "listing") {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: waits for the start-up reading to move, then reads it again
    await readingMoved.promise;
  }
  armStep({ kind: "arm-need", id });
  await rearming.get(id);
};

/**
 * Writes every held workspace's hook and its script again, in this build's
 * form, as the agent starts (fd2d7601): a running CLI reads its workspace's
 * hook on every tool call, so one an earlier build wrote must not outlive
 * that build's runtime, and no session is adopted or launched in a
 * workspace before its own is rewritten ({@link hookArmed}).
 *
 * Nothing else waits on it: the agent registers and takes custody of other
 * sessions meanwhile (it took 78 s on obelisk with 421 folders, one at a
 * time, and the update nearly rolled back). The workspaces whose boundary
 * runs, on any keeper, read once from the keepers' listing, and in which a
 * session's process is attached or a command is on its way in
 * ({@link inUse}), are armed now, {@link REARM_CONCURRENCY} at a time: that
 * is where a CLI runs, and one of an older form is handed over there. One a
 * session's process runs in with no boundary is started again. Any other has
 * no command to run: it is armed the moment a session there is adopted or
 * launched, or anything else ensures its boundary, so the start neither
 * starts a boundary for an idle workspace nor hands one over; an idle one
 * still running closes once quiet ({@link sweepQuiet}). A reading that could
 * not be made whole blocks every gate by name and is read again. What this
 * returns settles once the first whole reading's arming is done.
 */
export const rearmHooks = async (): Promise<void> => {
  const started = Date.now();
  armStep({ kind: "arm-start" });
  while (armState.arming.kind !== "listed") {
    // biome-ignore lint/performance/noAwaitInLoops: waits for the first whole reading, however many it takes
    await readingMoved.promise;
  }
  const now = Object.entries(armState.workspaces).flatMap(([id, arm]) =>
    arm.kind === "later" ? [] : [id]
  );
  await Promise.all(now.map((id) => rearming.get(id)));
  const later = Object.values(armState.workspaces).filter(
    (arm) => arm.kind === "later"
  ).length;
  console.info(
    `[workspace] boundary hooks written for ${now.length} workspace(s) with a session or command in it, or a session's process with no boundary, in ${Date.now() - started} ms; ${later} with nothing in them are armed when a session there starts`
  );
};

/**
 * One reading of the workspaces for the handover's arming: each one's
 * boundary running on some keeper, whether a session's process or a command
 * is in it, and, where none runs, whether a session's process runs in its
 * clone. Throws when the folders or the keepers cannot be read whole: a
 * keeper that could not be read makes the reading unknown (keepers.ts
 * `notKnown`), never a keeper read as holding nothing.
 *
 * EVERY WORKSPACE A SESSION'S PROCESS RUNS IN HAS ITS JUDGE, WHATEVER BECAME
 * OF THAT SESSION'S ATTACH: one whose boundary no keeper runs, with a clone a
 * keeper still holds a Claude Code or pi process in ({@link attachedIn}), has
 * a hook naming a judge that is gone, which refuses every call the process
 * makes (b895ec57, 2026-10-16: closed as quiet while its session's attach
 * had failed, its process still running on the keeper before the update). A
 * place has no clone record, and is armed as its session starts.
 */
const readWorkspaces = async (): Promise<{
  listed: ListedWorkspace[];
  refs: Map<string, WorkspaceRef>;
}> => {
  const ids = await readdir(workspacesDir()).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return [] as string[];
      }
      throw error;
    }
  );
  const live = (await keepers.held()).filter((proc) => proc.alive);
  const commands = await commandsNow();
  const listed: ListedWorkspace[] = [];
  const refs = new Map<string, WorkspaceRef>();
  for (const id of ids) {
    if (live.some((proc) => isBoundaryOf(proc.procId, id))) {
      // biome-ignore lint/performance/noAwaitInLoops: one small record read per workspace
      const held = await readHeld(id).catch(() => undefined);
      listed.push({
        id,
        boundary: true,
        inUse: held !== undefined && inUse(id, held.path, live, commands),
        cli: false,
      });
      continue;
    }
    const created = isPlace(id)
      ? undefined
      : await readRecord<{ path?: string }>(
          join(stateDir(id), "create.json")
        ).catch(() => undefined);
    const cli =
      created?.path !== undefined &&
      attachedIn(id, created.path, live, commands);
    if (cli && created?.path) {
      refs.set(id, { id, path: created.path });
    }
    listed.push({ id, boundary: false, inUse: false, cli });
  }
  return { listed, refs };
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

/**
 * The boundary a spawn is bounded to, running; none for a spawn without a
 * workspace. A Claude session's `account` is added to the workspace's
 * accounts first ({@link addAccount}), so the boundary it runs in reads that
 * account's user layer. A new workspace's first session finds its account
 * there already (`createWorkspace`), so its boundary's form is unchanged; one
 * started without it (a later session on another account) is handed over,
 * its form changed with its policy. The project a work item's session
 * belongs to is the workspace's ({@link setProject}), so a workspace cut
 * before it was kept reads its project's folder from its next item on. The
 * session's `spill` folder, where its harness saves a tool result too large
 * to hand the model, is added too ({@link addSpill}): a new session's hands
 * the boundary over, its form changed with its policy.
 */
export const boundaryFor = async (
  workspace: WorkspaceRef | undefined,
  account: string | undefined,
  project?: string,
  spill?: string
): Promise<Boundary | undefined> => {
  if (!workspace) {
    return;
  }
  if (account) {
    await addAccount(workspace.id, account);
  }
  if (project) {
    await setProject(workspace.id, project);
  }
  if (spill) {
    await addSpill(workspace.id, spill);
  }
  return ensureBoundary(workspace);
};

/**
 * Adds `dir` to the folders workspace `id`'s sessions save tool results in
 * ({@link workspaceSpillsFile}), once, and makes it: srt binds a read allow
 * back only where it exists as the sandbox starts, and the harness writes
 * its first saved result long after. Made owner-only, as Claude Code makes
 * its own; never taken away while the workspace lives, as a session's
 * transcript names its saved results for as long as it is resumed.
 */
const addSpill = async (id: string, dir: string): Promise<void> => {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = workspaceSpillsFile(id);
  const listed = await reported(
    readRecord<unknown>(file).then((record = []) => {
      if (!Array.isArray(record)) {
        throw new DamagedRecord(file, "it is not a list");
      }
      return record as string[];
    })
  );
  if (listed.includes(dir)) {
    return;
  }
  await mkdir(stateDir(id), { recursive: true });
  await writeWhole(file, `${JSON.stringify([...listed, dir])}\n`, 0o644);
};

/**
 * Keeps `project` as the project workspace `id`'s work belongs to
 * ({@link workspaceProjectFile}): its policy reads that project's folder on
 * the hub's machine. Written only when it changes, so the boundary's form
 * changes only then.
 */
export const setProject = async (
  id: string,
  project: string
): Promise<void> => {
  const file = workspaceProjectFile(id);
  // A damaged record is written over with the project the hub names now.
  const kept = await readRecord<unknown>(file).catch((error: unknown) => {
    if (!isDamagedRecord(error)) {
      throw error;
    }
  });
  if (kept === project) {
    return;
  }
  await mkdir(stateDir(id), { recursive: true });
  await writeWhole(file, `${JSON.stringify(project)}\n`, 0o644);
  // Another project's folder: the one before is no longer read, now.
  if (kept !== undefined) {
    recheckNarrowed("its project changed", [id]).catch(() => undefined);
  }
};

/**
 * Adds `account` to the accounts workspace `id`'s sessions run on
 * ({@link workspaceAccountsFile}), once. Never taken away: a session moved to
 * another account may still be running on the first until it relaunches,
 * and what each adds is only that account's links to the user layer.
 */
export const addAccount = async (
  id: string,
  account: string
): Promise<void> => {
  const file = workspaceAccountsFile(id);
  const listed = await reported(
    readRecord<unknown>(file).then((record = []) => {
      if (!Array.isArray(record)) {
        throw new DamagedRecord(file, "it is not a list");
      }
      return record as string[];
    })
  );
  if (listed.includes(account)) {
    return;
  }
  await mkdir(stateDir(id), { recursive: true });
  await writeWhole(file, `${JSON.stringify([...listed, account])}\n`, 0o644);
};

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

/**
 * Whether the machine's endpoint is still owed to this build's own keeper: on
 * a binary install, the keeper it names (core keepers.ts: the current one) is
 * not this build's, and this build's keeper has not failed to start
 * (`keeperFailedVersion`). An update restarts this agent first and hands the
 * keeper over only once the build answers (binary-apply.ts `settle`), and an
 * agent whose keeper is behind has a helper hand it over (binary-update.ts
 * `#advanceKeeper`); meanwhile the keeper the endpoint names is about to
 * retire, so a boundary replaced onto it would be replaced a second time. A
 * replacement waits for this build's keeper instead.
 */
const ownKeeperOwed = async (): Promise<boolean> => {
  if (!standalone) {
    return false;
  }
  const current = await currentKeeper();
  if (
    !current ||
    (current.keeper.kind === "build" &&
      current.keeper.version === runtimeVersion)
  ) {
    return false;
  }
  return (await readUpdateState())?.keeperFailedVersion !== runtimeVersion;
};

/** Why a boundary can't start: a workspace's runs a delegate, a place's (core `isPlace`) a person's own folder. */
const refusal = (id: string, why: string): Error =>
  new Error(
    isPlace(id)
      ? `place ${id} cannot be bounded on this machine: ${why}`
      : `workspace ${id} cannot run a delegate on this machine: ${why}`
  );

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

/**
 * macOS: why this process can start no boundary at all, asked once: a
 * process under a Seatbelt profile stays under it for its whole life, and
 * one under none never gains one. Asked before anything of a boundary is
 * made, so the person reads why, not the EPERM the profile it runs under
 * answers a write into the socket root with (`linkWorkspaceTmp`).
 */
let seatbeltNested: { reason: string | undefined } | undefined;
const nestedSeatbelt = (): string | undefined => {
  seatbeltNested ??= { reason: nestedSeatbeltRefusal() };
  return seatbeltNested.reason;
};

/** Says, as the agent starts, what this machine needs before it can hold a workspace boundary. */
export const checkBoundaryHost = (): void => {
  const missing = missingHostTools();
  if (missing.length > 0) {
    console.warn(
      `[workspace] this machine refuses workspace work until it has ${missing.join(" and ")}`
    );
  }
};

/**
 * `read`'s answer; a {@link DamagedRecord} it finds is reported
 * ({@link reportDamaged}) and thrown on: what reads the record stops there,
 * and every other workspace goes on.
 */
const reported = async <T>(read: Promise<T>): Promise<T> => {
  try {
    return await read;
  } catch (error) {
    if (isDamagedRecord(error)) {
      await reportDamaged(error);
    }
    throw error;
  }
};

/**
 * The record of workspace `id`'s running boundary; undefined when there is
 * none or it cannot be read, and a {@link DamagedRecord}, reported, when it
 * is there and does not parse.
 */
const readHeld = (id: string): Promise<Held | undefined> =>
  reported(
    readRecord<Held>(join(stateDir(id), "boundary.json")).catch(
      (error: unknown): Promise<Held | undefined> =>
        isDamagedRecord(error)
          ? Promise.reject(error)
          : Promise.resolve(undefined)
    )
  );

/** Whether a keeper, the current one or a retiring one, holds a live process under `procId`. */
const holding = async (procId: string): Promise<boolean> =>
  Boolean(await keepers.holding(procId));

/**
 * The keeper's process running the boundary `held` names, on whichever keeper
 * runs it, when it is still the one that was started.
 */
const running = async (
  id: string,
  held: Held
): Promise<HeldProc | undefined> => {
  const proc = await keepers.holding(boundaryProcId(id, held.gen));
  return proc?.pid === held.pid ? proc : undefined;
};

const starting = new Map<string, Promise<Boundary>>();

/**
 * The workspace's boundary, running: the one already held, or a new one
 * (after a reboot or a sessiond restart), once the workspace's hook is in
 * this build's form ({@link hookArmed}): every spawn, restore, wake and
 * command in a workspace comes through here. Throws — with the reason — when
 * this machine cannot hold one.
 */
export const ensureBoundary = async (ref: WorkspaceRef): Promise<Boundary> => {
  await hookArmed(ref.id);
  return ensureNow(ref);
};

/**
 * {@link ensureBoundary} with the hook already armed: the start-up rewrite's
 * own hand-over ({@link rearmOne}). A quiet close under way finishes first
 * ({@link closeQuietly}), and this one starts the boundary again. Each ensure
 * is a use: the workspace's quiet time counts from it ({@link liveAt}).
 */
const ensureNow = (ref: WorkspaceRef): Promise<Boundary> => {
  liveAt.set(ref.id, Date.now());
  const pending = starting.get(ref.id);
  if (pending) {
    return pending;
  }
  const started = (async () => {
    await closing.get(ref.id);
    return await ensure(ref);
  })().finally(() => {
    starting.delete(ref.id);
    liveAt.set(ref.id, Date.now());
  });
  starting.set(ref.id, started);
  return started;
};

/**
 * Refuses a boundary for a workspace whose folder is not there to hold
 * (`why`), and closes each of its boundaries still running, on every keeper,
 * with everything in them: nothing runs in a path that is gone, and a
 * handover of one ({@link handOverStale}) or a restart ({@link
 * restartStubbed}) is never tried again. Its records stay for its archive.
 */
const refuseGone = async (ref: WorkspaceRef, why: string): Promise<never> => {
  forgetStale(ref.id);
  forgetStubbed(ref.id);
  forgetRetiring(ref.id);
  const alive = (await keepers.held()).filter(
    (proc) => proc.alive && isBoundaryOf(proc.procId, ref.id)
  );
  await Promise.all(
    alive.map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
  );
  if (alive.length > 0) {
    console.info(
      `[workspace] ${ref.id}: ${why}, so its boundary ${alive.map((proc) => proc.pid).join(", ")} is closed`
    );
  }
  throw refusal(ref.id, why);
};

/**
 * The folder a boundary holds, ready for it: a delegate's clone (refused
 * when it is none), or a place, whatever folder it is over, a plain one
 * too, which stays as the person keeps it: never made
 * into a clone. One that is not there is refused, and its boundaries closed
 * ({@link refuseGone}).
 */
const placeReady = async (ref: WorkspaceRef): Promise<void> => {
  if (isPlace(ref.id)) {
    const place = await stat(ref.path).catch(() => undefined);
    if (!place?.isDirectory()) {
      await refuseGone(ref, `${ref.path} is not a folder`);
    }
    return;
  }
  const git = await stat(join(ref.path, ".git")).catch(() => undefined);
  if (!git) {
    await refuseGone(ref, `${ref.path} is not a git checkout`);
    return;
  }
  // A workspace from before clones — a spawn racing the agent's start-up
  // pass over them — becomes one first: a worktree's commits would land in
  // the repository it was cut from, which the boundary keeps read-only.
  if (!git.isDirectory()) {
    await cloneInPlace(ref.path);
    return;
  }
  // A `.git` that is no repository (a deleted clone a sandbox refilled with
  // stand-ins, `stand-ins.ts`) has no boundary: one would stand in there
  // again. Retirement takes it away (workspace.ts `holding`).
  if (!(await isGitDir(join(ref.path, ".git")))) {
    await refuseGone(
      ref,
      `${ref.path} is not a git clone any more: its .git is no repository`
    );
  }
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
  const nested = process.platform === "darwin" ? nestedSeatbelt() : undefined;
  if (nested) {
    throw refusal(ref.id, nested);
  }
  await placeReady(ref);
  // Its door to the project's browser (browser/gate.ts), minted once and
  // kept in its state dir for the workspace's life.
  await ensureGateToken(ref.id);
  // Asked before the keeper is: the endpoint only ever moves on to this
  // build's keeper, so a keeper dialled after "not owed" is this build's.
  const owed = await ownKeeperOwed();
  const client = await sessiond();
  const held = await readHeld(ref.id);
  const holder = held ? await running(ref.id, held) : undefined;
  if (!(held && holder)) {
    await stopUnvouched(ref.id, held);
    return start(client, ref);
  }
  // Access is never kept past its removal: a generation that grants what the
  // workspace's policy no longer does is stopped now with what runs in it,
  // said to the delegate, whatever runs there or whichever keeper is owed
  // the endpoint ({@link replaceNarrowed}).
  const narrowed = await narrowedGenerations(ref, held);
  if (narrowed) {
    const runs = await replaceNarrowed(client, ref, held, narrowed, owed);
    if (narrowed.current.length > 0) {
      return runs;
    }
  }
  // One of an older form, or one a retiring keeper holds, is handed over to
  // one of this build's form on the current keeper.
  if (held.form !== (await formOf(ref)) || holder.epoch !== client.epoch) {
    return replaceOlder(client, ref, held, owed);
  }
  forgetStale(ref.id);
  // Written again each time: one an earlier agent started may have no hook
  // yet, or one that reaches cawco another way.
  return armHook(ref.id, held);
};

/**
 * {@link ensure} for workspace `ref`'s running boundary `held`, of an older
 * form or on a retiring keeper: handed over to one of this build's form on
 * the current keeper, or, until it can be, armed as it is.
 */
const replaceOlder = async (
  client: SessiondClient,
  ref: WorkspaceRef,
  held: Held,
  owed: boolean
): Promise<Boundary> => {
  if (owed) {
    // The keeper the endpoint names now retires as soon as this build's
    // takes the endpoint: the boundary runs on as it is, armed, and is
    // handed over once, at the first look after this build's keeper is
    // the machine's ({@link handOverStale}).
    if (!stale.has(ref.id)) {
      console.info(
        `[workspace] ${ref.id}: its boundary ${held.pid} (form ${held.form ?? "none"}) is handed over once this build's session keeper is the machine's`
      );
    }
    replaceSoon(ref);
    return armHook(ref.id, held);
  }
  if (process.platform === "linux" && (await hasLeftDirs(ref.path))) {
    // A boundary started beside it would bind the same mount point and
    // keep it; this one is replaced whole once nothing runs in it.
    forgetStale(ref.id);
    restartWhenIdle(ref);
    return armHook(ref.id, held);
  }
  // Every command after a handover runs in the new sandbox: its own pid
  // namespace, where nothing the work left running in this one can be seen
  // or signalled, and its own network, where nothing listens. A dev server
  // answered its previews but never its own next curl (5be5bfbb, 2026-10-15:
  // its server on 5222 "gone" at each turn after a handover), and a `setsid
  // nohup` loop was "gone" at the next turn (9b87c52b, 2026-10-19). So a
  // boundary whose work runs anything is kept as it is, armed, and handed
  // over at the first look after the last of it ends ({@link
  // handOverStale}); one nothing holds closes once quiet ({@link
  // sweepQuiet}), with what runs in it, and its next start is of this form.
  const work = await workLeft(ref.id, held);
  if (work) {
    replaceSoon(ref);
    if (keptRunning.get(ref.id) !== work) {
      keptRunning.set(ref.id, work);
      console.info(
        `[workspace] ${ref.id}: its boundary ${held.pid} (form ${held.form ?? "none"}) is kept as it is while its work ${work}, and handed over once that ends`
      );
    }
    return armHook(ref.id, held);
  }
  const fresh = await handOver(client, ref, held);
  forgetStale(ref.id);
  return fresh;
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
 * the directory the command ended in beside them. A `cancel <pid>` line is
 * the executor's cut-off: the runner sends TERM to that command's group, and
 * KILL 4 s later, from inside, where the pid it wrote names it (on Linux the
 * executor, outside the sandbox's pid namespace, cannot). The FIFO is opened
 * read-only (it lies where a command cannot write) and reopened after each
 * writer closes it. Linux: srt's own plumbing for the sandbox (its proxy, the
 * proxy credential git presents) is read once as the runner starts and set
 * again over each request's environment, which the executor writes on the
 * host, so no caller's environment can drop it. Yarn 2 and later read no
 * `HTTPS_PROXY`, only their own `httpsProxy` and `httpProxy` settings, so
 * each install went direct and failed ("YN0001: Error
 * [ERR_SOCKET_CLOSED_BEFORE_CONNECTION]: Socket closed before the connection
 * was established", 2026-10-18): the runner gives them srt's proxy as
 * `YARN_HTTPS_PROXY` and `YARN_HTTP_PROXY` ("most settings can also be
 * defined through environment variables … `YARN_CACHE_FOLDER` will set the
 * cache folder", yarnpkg.com/configuration/yarnrc). They override a
 * project's own proxy, which the boundary's network could not reach anyway:
 * srt's proxy is its one way out.
 *
 * Each command starts through {@link LAUNCH}.
 */
/**
 * How the runner starts one command, a perl program (no single quote,
 * backslash or `${`: it goes into bash single quotes inside this template).
 * Every command leads a process group of its own and starts with stdin,
 * stdout and stderr alone: the launcher closes every other fd it inherits
 * (listed in /dev/fd). The runner's process substitutions leave their pipes'
 * write ends open in it (bash keeps `/dev/fd/63` and `/dev/fd/62` beside the
 * fds 1 and 2 they were opened onto), and a job the command leaves running,
 * `nohup sleep 2999 > /dev/null 2>&1 &`, kept them: each `cat` copying a
 * stream into its FIFO saw no end, so the executor waited on its output as
 * long as the job ran (stage 2's workspace rig, nightly 0776f5fd8, timed out
 * after 900 s on that command). In a place
 * (`CAWCO_PLACE`, a person's own folder) nothing it starts outlives it:
 * the launcher makes itself the command's child subreaper (Linux
 * `prctl(PR_SET_CHILD_SUBREAPER)`, 36, by the machine's syscall number), so
 * whatever the command leaves running, backgrounded, `setsid` or
 * double-forked, is reparented to it; once the command exits it kills the
 * command's group and every process left under it, then exits with the
 * command's status. A TERM to its group (the executor's cut-off) does the
 * same. A machine whose syscall number it does not know runs no command
 * there. macOS has no subreaper: the command's group goes.
 */
const LAUNCH = [
  'if (opendir(my $fds, "/dev/fd")) { my @open = grep { /^[0-9]+$/ && $_ > 2 } readdir($fds); closedir($fds); POSIX::close($_) for @open; }',
  "setpgrp(0, 0);",
  "exec @ARGV unless $ENV{CAWCO_PLACE};",
  'if ($^O eq "linux") {',
  "  my %nr = (x86_64 => 157, aarch64 => 167, i686 => 172, armv7l => 172, armv6l => 172, riscv64 => 167);",
  "  my $n = $nr{(POSIX::uname())[4]};",
  '  (defined $n && syscall($n, 36, 1, 0, 0, 0) == 0) or die "cawco: this place keeps no command to its own processes on this machine, so the command did not run.";',
  "}",
  "my $child = fork;",
  'defined $child or die "cawco: the command could not be started: $!";',
  "if ($child == 0) { setpgrp(0, 0); exec @ARGV; exit 127; }",
  'sub kids { my @k; for my $t (glob "/proc/$$/task/*/children") { if (open(my $f, "<", $t)) { local $/; my $s = <$f>; push @k, split(" ", $s) if defined $s; } } return @k; }',
  'sub reap { kill "KILL", -$child; for (1 .. 300) { 1 while waitpid(-1, POSIX::WNOHANG()) > 0; my @k = kids(); last unless @k; kill "KILL", @k; select(undef, undef, undef, 0.01); } }',
  "$SIG{TERM} = $SIG{INT} = $SIG{HUP} = sub { reap(); exit 143; };",
  "waitpid($child, 0);",
  "my $status = $?;",
  "reap();",
  "exit(($status & 127) ? 128 + ($status & 127) : $status >> 8);",
].join(" ");

/**
 * The runner inside the boundary: takes each request off the FIFO and runs
 * it. A `cancel <pgid>` ends that command's group; a pgid of 0, 1 or with a
 * leading zero is never one its launch made, and `kill -- -0` or `-1` would
 * be its own group or every process it may signal, so it is no request.
 *
 * A command's stdout and stderr are anonymous pipes, each copied by a `cat`
 * into its request's FIFO (`$req/out`, `$req/err`), never those FIFOs opened
 * as its own fds. A program with a confining AppArmor profile of its own
 * passes an exec transition, and the kernel revalidates every fd it inherits
 * against that profile, closing those it may not use: a FIFO or file is
 * checked by its path, which no such profile names, while a pipe is not
 * mediated by path. On Ubuntu, under bwrap-userns-restrict's
 * `allow pix /** -> &bwrap//&unpriv_bwrap`, /etc/apparmor.d/ssh-keyscan
 * (`profile ssh-keyscan /usr/bin/ssh-keyscan`) took `/usr/bin/ssh-keyscan`'s
 * stdout away in every workspace: it printed nothing, its fd 1 free at its
 * first `openat` (2026-10-18), and the hub's host-key check found no key.
 *
 * srt's own environment (its proxies, `GIT_CONFIG_*`) is set again over each
 * request's (`CAWCO_SANDBOX_ENV`), but for `GIT_SSH_COMMAND`: srt names an
 * ssh through its proxy there, and CawCo's is the refusal that says a
 * workspace holds no ssh key (hub-git.ts `SSH_REFUSAL`, in `gitDoorEnv`). Set
 * again over it, srt's ran instead: a push over ssh to another host failed at
 * the proxy's CONNECT ("socat … CONNECT other.probe.test:22: Bad Gateway"),
 * never saying why.
 */
const RUNNER = `fifo=$1
[ -n "\${HTTPS_PROXY:-}" ] && export YARN_HTTPS_PROXY=$HTTPS_PROXY
[ -n "\${HTTP_PROXY:-}" ] && export YARN_HTTP_PROXY=$HTTP_PROXY
CAWCO_SANDBOX_ENV=$(export -p | grep -E '^declare -x (HTTPS?_PROXY|https?_proxy|ALL_PROXY|all_proxy|NO_PROXY|no_proxy|YARN_HTTPS?_PROXY|SANDBOX_RUNTIME|JAVA_TOOL_OPTIONS|GIT_CONFIG_[A-Z0-9_]+|DOCKER_HTTPS?_PROXY|CLOUDSDK_PROXY_[A-Z_]+|GRPC_PROXY|grpc_proxy|RSYNC_PROXY|FTP_PROXY|ftp_proxy|CLAUDE_CODE_HOST_[A-Z_]+)=')
export CAWCO_SANDBOX_ENV
sandbox=$(readlink /proc/self/ns/pid 2>/dev/null)
launch='${LAUNCH}'
echo ${READY}
while :; do
  while IFS= read -r req; do
    case $req in
      "cancel "*)
        pid=\${req#cancel }
        case $pid in ''|*[!0-9]*|0*|1) continue ;; esac
        kill -TERM -- "-$pid" 2>/dev/null
        ( sleep 4; kill -KILL -- "-$pid" 2>/dev/null ) &
        continue ;;
    esac
    (
      printf '%s\\n' "$sandbox" > "$req/sandbox"
      /usr/bin/perl -MPOSIX -e "$launch" /bin/bash --norc --noprofile -c '. "$1/env" >/dev/null 2>&1; eval "$CAWCO_SANDBOX_ENV"; if [ -n "\${CAWCO_GIT_PARAMETERS:-}" ]; then export GIT_CONFIG_PARAMETERS="\${GIT_CONFIG_PARAMETERS:+$GIT_CONFIG_PARAMETERS }$CAWCO_GIT_PARAMETERS"; fi; cd "$(cat "$1/cwd")" || exit 1; eval "$(cat "$1/cmd")"; status=$?; pwd -P > "$1/cwd-out"; exit $status' cawco "$req" > >(exec cat > "$req/out") 2> >(exec cat > "$req/err") < /dev/null &
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
 * Where each booted simulator's launchd keeps its sockets (its syslog,
 * testmanagerd's, webinspectord's), beside those in {@link LAUNCHD_SOCKETS}.
 * A workspace writes nothing there, so every socket in it is the host's: a
 * workspace drives a simulator through CoreSimulator's mach services
 * (`simctl`), never these, but for {@link TEST_MANAGER_SOCKET} and
 * {@link REMOTE_AUTOMATION_SOCKET}.
 */
const SIMULATOR_SOCKETS = "/private/var/tmp";

/**
 * Where a Mac's container runtimes keep their sockets (browser/runtime.ts
 * looks in each): Docker's system socket (its link and the file it names
 * both resolve past `/var/run`, which no policy denies on macOS) and the
 * user's Docker Desktop, OrbStack, Colima, Rancher Desktop and Podman
 * machine dirs, all under home, denied by the policy already and named here
 * so a policy's allow under home never reopens one.
 */
const CONTAINER_SOCKETS = [
  "/var/run/docker.sock",
  "/private/var/run/docker.sock",
  join(homedir(), ".docker", "run"),
  join(homedir(), ".orbstack", "run"),
  join(homedir(), ".colima"),
  join(homedir(), ".rd"),
  join(homedir(), ".local", "share", "containers"),
];

/**
 * A host socket in {@link LAUNCHD_SOCKETS} or {@link SIMULATOR_SOCKETS}
 * a workspace connects to, as a Seatbelt regex over its whole path: a booted
 * simulator's testmanagerd, which `xcodebuild test-without-building` dials to
 * run a UI test runner (XCUITest, Maestro's driver). The simulator names it
 * in its launchd's `TESTMANAGERD_SIM_SOCK` (`xcrun simctl getenv <udid>
 * TESTMANAGERD_SIM_SOCK`): `/private/tmp/com.apple.launchd.<id>/…` on iOS
 * 18.5; newer runtimes keep the same names under `/private/var/tmp`. Refused,
 * the runner fails with "Failed to connect to unix domain socket at path
 * /private/tmp/com.apple.launchd.lzUhSQrMjS/com.apple.testmanagerd.unix-domain.socket:
 * 1 Operation not permitted". Its siblings (webinspectord's, syslog) and
 * every other socket there stay the host's, but for
 * {@link REMOTE_AUTOMATION_SOCKET}. testmanagerd starts and drives apps inside
 * its own simulator, as `simctl` already lets a workspace.
 */
const TEST_MANAGER_SOCKET = String.raw`^/private(/var)?/tmp/com\.apple\.launchd\.[A-Za-z0-9]+/com\.apple\.testmanagerd\.unix-domain\.socket$`;

/**
 * A booted iOS 27 simulator's testmanagerd remote automation socket, through
 * which axe and xcui send taps, typing and gestures (iOS 18.5 takes them
 * without it). The simulator runtime's own testmanagerd binds it, beside
 * {@link TEST_MANAGER_SOCKET}: its launchd plist
 * (RuntimeRoot/Developer/Library/LaunchDaemons/com.apple.testmanagerd.plist)
 * lists `com.apple.testmanagerd.remote-automation.uds` under `Sockets`, keyed
 * `TESTMANAGERD_REMOTE_AUTOMATION_SIM_SOCK`. The Mac's own testmanagerd binds
 * no socket: its remote automation is the AppleInternal-only RemoteService
 * `com.apple.testmanagerd.remote.automation`
 * (/System/Library/LaunchDaemons/com.apple.testmanagerd.plist), so this name
 * under a launchd dir in {@link SIMULATOR_SOCKETS} is a simulator's alone.
 * Refused, every axe HID call on iOS 27.2 failed with "Failed to connect to
 * unix domain socket at path
 * /private/var/tmp/com.apple.launchd.q3TgJJkNqx/com.apple.testmanagerd.remote-automation.uds:
 * 1 Operation not permitted".
 */
const REMOTE_AUTOMATION_SOCKET = String.raw`^/private/var/tmp/com\.apple\.launchd\.[A-Za-z0-9]+/com\.apple\.testmanagerd\.remote-automation\.uds$`;

/** Linux: the agent's runtime dir, where its sandbox's proxy socket and the workspace's door go. */
const runtimeDirOf = (id: string): string => {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (!runtime) {
    throw refusal(
      id,
      "the agent has no XDG_RUNTIME_DIR, where its sandbox's proxy socket goes"
    );
  }
  return runtime;
};

/**
 * A Linux boundary generation's srt temp dir, short (a socket path is capped
 * at 108 bytes, srt #213) and its own (REPORT.md §5o).
 */
const srtTmpOf = (id: string, gen: string): string =>
  join(
    runtimeDirOf(id),
    "cawco-srt",
    createHash("sha256").update(`${id}/${gen}`).digest("hex").slice(0, 12)
  );

/**
 * Linux: what srt is to bind back from under the runtime dir, which the
 * policy read-denies with the rest of `/run`: each read allow there, the
 * workspace's door dir (`workspaceDoorDir`) and srt's own temp dir among
 * them. srt binds one back only if it exists as it wraps the runner, and the
 * runner's sandbox lives as long as the workspace, so the srt host makes each
 * before every sandbox it starts (`boundary-host.ts` PLACE): the door's
 * sockets, which the agent makes in that dir afterwards, then show inside.
 */
const runtimePlaces = (id: string, allowRead: readonly string[]): string[] => {
  const runtime = runtimeDirOf(id);
  return allowRead.filter((path) => path.startsWith(`${runtime}/`));
};

/**
 * The variable a macOS runner hands every process it starts, naming its
 * generation, beside the workspace's own marker.
 */
const BOUNDARY_MARKER = "CAWCO_BOUNDARY";

/** The host's bwrap: the first on the system PATH, where `missingHostTools` looks for it. */
const hostBwrap = (): string =>
  SYSTEM_PATH.split(":")
    .map((dir) => join(dir, "bwrap"))
    .find((path) => existsSync(path)) ?? "/usr/bin/bwrap";

/**
 * The bwrap generation `gen` of workspace `id`'s srt runs (srt's `bwrapPath`,
 * boundary-policy.ts `readOnlyDeniesBwrap`): the host's, with each
 * read-denied dir remounted read-only. Named `bwrap`, and it execs the host's
 * in its own process, so the outer sandbox process reads as a bwrap
 * ({@link isBwrap}).
 */
const bwrapLauncherOf = (id: string, gen: string): string =>
  join(generationDir(id, gen), "bwrap");

/** The ripgrep srt scans a clone with: the one this build ships. */
const ripgrep = (): string =>
  standalone ? runtimeExecutable("srt/rg") : rgPath;

/** The srt host script, as this build runs it: its embedded bundle, or the checkout's source. */
const hostScript = (): string =>
  standalone
    ? runtimeExecutable("srt/host.js")
    : join(import.meta.dir, "boundary-host.ts");

/**
 * What the host script runs, for the form: a change to it is a change of
 * form. A build's script bundles srt; a checkout's imports it, so srt's
 * module that writes the sandbox's mounts (each read-deny tmpfs among them,
 * which the bwrap it runs makes read-only, {@link bwrapLauncherOf}) is read
 * beside it.
 */
const readHostText = async (host: string): Promise<string> => {
  if (standalone) {
    return await Bun.file(host).text();
  }
  const srt = dirname(
    Bun.resolveSync("@anthropic-ai/sandbox-runtime", dirname(host))
  );
  const texts = await Promise.all(
    [host, join(srt, "sandbox", "linux-sandbox-utils.js")].map((file) =>
      Bun.file(file).text()
    )
  );
  return texts.join("\0");
};

let hostText: Promise<string> | undefined;

/** How a workspace's boundary of one generation starts in this build, and the form that names it. */
interface Plan {
  /** Written into the generation's dir before the boundary starts: path, text and, for one that runs, its mode. */
  readonly files: readonly (readonly [string, string, number?])[];
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
  // Kept beside the generation's other files, never hashed into its form:
  // what it grants, to judge a later policy by ({@link narrowing}).
  const granted = `${JSON.stringify(policy, null, 2)}\n`;
  const runtime = await bunRuntime(id);
  const exec = execScript(id, {
    exec: join(stateDir(id), "exec"),
    gen,
    path: ref.path,
    pid: undefined,
    scratch: scratchOf(id),
  });
  const hash = createHash("sha256");
  if (process.platform === "darwin") {
    const profile = seatbeltProfile(policy, {
      // With the scratch dir's short name, its `TMPDIR`: a tool's socket
      // there (Chromium's singleton) is reached by that name too.
      doors: [
        toolDoorOf(id),
        gitDoorOf(id),
        githubDoorOf(id),
        workspaceTmpDir(id),
      ],
      hostSockets: [
        ...(await Promise.all(
          [
            dirname(workspacesDir()),
            dirname(sessiondPath()),
            LAUNCHD_SOCKETS,
            SIMULATOR_SOCKETS,
            // The container runtimes' sockets, the browsers' among them: a
            // command that reached one would run a container of its own
            // beside a project's browser, or into it. Each by the path a
            // runtime is dialled at as well as by the file it names.
            ...CONTAINER_SOCKETS,
            // The per-user temp and cache dirs: a workspace writes them for
            // Apple's build tools, and every host app keeps its sockets there
            // (VS Code's git askpass, browsers' singletons, srt's proxies).
            ...(await darwinUserDirs()),
          ].map((path) => realpath(path).catch(() => path))
        )),
        ...CONTAINER_SOCKETS,
      ],
      reachedHostSockets: [TEST_MANAGER_SOCKET, REMOTE_AUTOMATION_SOCKET],
    });
    const file = join(generationDir(id, gen), "boundary.sb");
    return {
      files: [
        [file, profile],
        [grantedOf(id, gen), granted],
        ...guardFiles(id, gen),
      ],
      form: hash
        .update(profile)
        .update("\0")
        .update(RUNNER)
        .update("\0")
        .update(exec)
        .update("\0")
        .update(isPlace(id) ? PLACE_GUARD : "")
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
          TMPDIR: workspaceTmpDir(id),
          ...(isPlace(id) ? { [PLACE_ENV]: "1" } : {}),
        },
      },
    };
  }
  const srtTmp = srtTmpOf(id, gen);
  const bwrap = bwrapLauncherOf(id, gen);
  const launcher = readOnlyDeniesBwrap(hostBwrap());
  const settings = `${JSON.stringify(srtSettings(policy, { bwrap, rg: ripgrep(), srtTmp }), null, 2)}\n`;
  const host = hostScript();
  hostText ??= readHostText(host);
  // What the host makes in the clone before each sandbox, so srt binds
  // each deny path onto itself and leaves nothing on the host
  // (`cloneDenies`), and guards for the sandbox's whole life.
  const denies = `${JSON.stringify(await workspaceDenies(ref), null, 2)}\n`;
  const files = {
    settings: join(generationDir(id, gen), "srt.json"),
    runner: join(generationDir(id, gen), "runner.sh"),
    denies: join(generationDir(id, gen), "denies.json"),
  };
  const place = isPlace(id);
  return {
    files: [
      [files.settings, settings],
      [files.runner, RUNNER],
      [files.denies, denies],
      [bwrap, launcher, 0o755],
      [grantedOf(id, gen), granted],
      ...guardFiles(id, gen),
    ],
    form: hash
      .update(settings)
      .update("\0")
      .update(launcher)
      .update("\0")
      .update(RUNNER)
      .update("\0")
      .update(exec)
      .update("\0")
      .update(denies)
      .update("\0")
      .update(await hostText)
      .update("\0")
      .update(place ? `${policy.scratch}\0${PLACE_GUARD}` : "")
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
        ...runtimePlaces(id, [...policy.allowRead, srtTmp]),
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
        // A place is a person's own folder: srt resolves its own
        // mandatory names against the host's working directory and makes a
        // mount point for each one absent, so the host starts srt in the
        // place's scratch dir, never in the place (boundary-host.ts); and
        // what each command leaves running goes with it (RUNNER).
        ...(place
          ? { CAWCO_SANDBOX_CWD: policy.scratch, [PLACE_ENV]: "1" }
          : {}),
      },
    },
  };
};

/** A list of words as perl writes it: each single-quoted (none holds a quote or backslash). */
const perlWords = (words: readonly string[]): string =>
  words.map((word) => `'${word}'`).join(", ");

/** `find`'s tests for a protected entry ({@link PROTECTED_NAMES}, {@link PROTECTED_UNDER}), as the guard runs it. */
const PROTECTED_TESTS = [
  "(",
  ...PROTECTED_NAMES.flatMap((name, at) => [
    ...(at > 0 ? ["-o"] : []),
    "-name",
    name,
  ]),
  ...Object.entries(PROTECTED_UNDER).flatMap(([dir, names]) =>
    names.flatMap((name) => ["-o", "-path", `*/${dir}/${name}`])
  ),
  ")",
];

/**
 * A place's guard (`place-guard.pl before REQ PLACE` before
 * each command, `after REQ PLACE SCRATCH POLICY HOME` once it has run), the
 * executor's on the host ({@link execScript}). A person's own folder gets no
 * stand-ins (never write into a person's own folder), so srt binds only the
 * protected config the place has; what a command makes of the rest is
 * judged here, by the place's real path, once the command and everything it
 * started is over (`LAUNCH`):
 *
 * - A protected entry ({@link PROTECTED_NAMES}, {@link PROTECTED_UNDER}) that
 *   is new, by any means (written, `mv`, `ln`, a link), or that changed while
 *   no bind held it, is moved to the place's scratch dir
 *   (`.cawco-moved/<stamp>/<path>`), never deleted, and the command fails
 *   saying so. A repository the command made keeps the `.git/config`
 *   `git init` writes and sample hooks only.
 * - One that changed under its read-only bind (only if a bind failed) is
 *   left, and said with its sha256 before and after.
 * - A link the command made anywhere in the place to protected config
 *   outside it, or into a dot-dir of the home dir, is moved aside the same
 *   way.
 *
 * What the person changes between commands is never looked at. It prints a
 * line per finding (`cawco place-guard: …`) and exits 3 when it moved
 * anything; any other failure refuses the command.
 */
export const PLACE_GUARD = String.raw`#!/usr/bin/perl
use strict;
use warnings;
use Cwd ();
use Digest::SHA ();
use File::Basename ();
use File::Find ();
use File::Path ();
use JSON::PP ();

my %NAMES = map { $_ => 1 } (${perlWords(PROTECTED_NAMES)});
my %UNDER = (${Object.entries(PROTECTED_UNDER)
  .map(
    ([dir, names]) => `'${dir}' => { map { $_ => 1 } (${perlWords(names)}) }`
  )
  .join(", ")});
my @TESTS = (${perlWords(PROTECTED_TESTS)});
my %SAFE_GIT = map { $_ => 1 } qw(core.repositoryformatversion core.filemode core.bare core.logallrefupdates core.ignorecase core.precomposeunicode core.symlinks extensions.objectformat extensions.refstorage lfs.repositoryformatversion);

my ($mode, $req, $given, $scratch, $policy, $home) = @ARGV;
my $place = Cwd::realpath($given);
defined $place or die "cawco: the place $given is gone\n";

sub protected_rel {
  my @p = grep { length $_ && $_ ne "." } split m{/}, shift;
  for my $i (0 .. $#p) {
    my $parent = $i > 0 ? $p[$i - 1] : "";
    return join("/", @p[0 .. $i]) if $NAMES{$p[$i]} || ($UNDER{$parent} && $UNDER{$parent}{$p[$i]});
  }
  return undef;
}

sub find0 {
  open(my $fh, "-|", "find", $place, "-mindepth", "1", @_) or die "cawco: find could not run: $!\n";
  local $/ = "\0";
  my @out;
  while (my $line = <$fh>) { chomp $line; push @out, $line; }
  close $fh;
  die "cawco: find failed in $place\n" if ($? >> 8) > 1;
  return @out;
}

sub protected_now { return find0("-name", "node_modules", "-prune", "-o", @TESTS, "-print0", "-prune"); }

sub file_digest {
  my $digest = Digest::SHA->new(256);
  return eval { $digest->addfile(shift, "b"); $digest->hexdigest } // "unreadable";
}

sub digest_of {
  my $path = shift;
  return "link:" . (readlink($path) // "") if -l $path;
  return file_digest($path) if -f $path;
  return "absent" unless -d $path;
  my @all;
  File::Find::find({ no_chdir => 1, wanted => sub { push @all, $File::Find::name } }, $path);
  my $digest = Digest::SHA->new(256);
  for my $entry (sort @all) {
    my $kind = -l $entry ? "l:" . (readlink($entry) // "") : -d $entry ? "d" : "f:" . file_digest($entry);
    $digest->add(substr($entry, length $path), "\0", $kind, "\0");
  }
  return $digest->hexdigest;
}

my $state = "$req/guard.json";
my $mark = "$req/guard.mark";

if ($mode eq "before") {
  my %snap = map { $_ => digest_of($_) } protected_now();
  my @gits = find0("-name", "node_modules", "-prune", "-o", "-name", ".git", "-type", "d", "-print0", "-prune");
  open(my $out, ">", $state) or die "cawco: $state: $!\n";
  print $out JSON::PP->new->canonical->encode({ protected => \%snap, gits => \@gits });
  close $out or die "cawco: $state: $!\n";
  open(my $m, ">", $mark) or die "cawco: $mark: $!\n";
  close $m;
  exit 0;
}
$mode eq "after" or die "usage: place-guard.pl before|after REQ PLACE [SCRATCH POLICY HOME]\n";

my $before = JSON::PP->new->decode(do { local $/; open(my $in, "<", $state) or die "cawco: $state: $!\n"; <$in> });
my $rules = JSON::PP->new->decode(do { local $/; open(my $in, "<", $policy) or die "cawco: $policy: $!\n"; <$in> });
my %bound = map { $_ => 1 } @{ $rules->{denyWrite} };
my %gits = map { $_ => 1 } @{ $before->{gits} };
my $aside = "$scratch/.cawco-moved/" . time() . "-$$";
my $moved = 0;

sub move_aside {
  my ($path, $rel, $why) = @_;
  my $dest = "$aside/$rel";
  File::Path::make_path(File::Basename::dirname($dest));
  rename($path, $dest) or system("/bin/mv", "--", $path, $dest) == 0 or die "cawco: $rel could not be moved aside: $!\n";
  print STDERR "cawco place-guard: $rel $why, so it was moved to $dest and this command is refused.\n";
  $moved = 1;
}

sub git_config_safe {
  my $file = shift;
  open(my $in, "-|", "git", "config", "--file", $file, "--name-only", "--list") or return 0;
  my @keys = <$in>;
  close $in;
  return 0 if $?;
  chomp @keys;
  return !grep { !$SAFE_GIT{lc $_} } @keys;
}

sub hooks_samples {
  my $dir = shift;
  opendir(my $dh, $dir) or return 0;
  my @bad = grep { $_ ne "." && $_ ne ".." && !/\.sample$/ } readdir $dh;
  return !@bad;
}

sub git_own {
  my ($rel, $path) = @_;
  return 0 unless $rel =~ m{(?:^|/)\.git/(config|hooks)$};
  my $part = $1;
  return $part eq "config" ? git_config_safe($path) : hooks_samples($path);
}

for my $path (protected_now()) {
  my $rel = substr($path, length($place) + 1);
  my $was = $before->{protected}{$path};
  my $now = digest_of($path);
  next if defined $was && $was eq $now;
  if (defined $was && $bound{$path}) {
    print STDERR "cawco place-guard: $rel changed under its read-only bind (sha256 $was before, $now after); it is left as it is.\n";
    next;
  }
  next if git_own($rel, $path);
  move_aside($path, $rel, "is config a host session would load from this folder");
}

for my $link (find0("-name", "node_modules", "-prune", "-o", "-type", "l", "-newer", $mark, "-print0")) {
  next unless -l $link;
  my $target = readlink($link) // next;
  $target = File::Basename::dirname($link) . "/$target" unless $target =~ m{^/};
  my $real = Cwd::realpath($target) // $target;
  next if $real eq $place || index($real, "$place/") == 0;
  my $dotted = index($real, "$home/") == 0 && substr($real, length($home) + 1) =~ m{(?:^|/)\.};
  next unless $dotted || defined protected_rel($real);
  move_aside($link, substr($link, length($place) + 1), "links to $real, config outside this folder");
}

exit($moved ? 3 : 0);
`;

/**
 * The runner's word that its commands run in a place ({@link RUNNER}):
 * nothing a command starts outlives it. Set once on the boundary as it
 * starts, by the build that starts it, and read by that boundary's own
 * runner and host, so an older boundary still running reads its own word.
 */
const PLACE_ENV = "CAWCO_PLACE";

/** A place's guard, written into the boundary's generation dir ({@link PLACE_GUARD}); none for a clone. */
const guardFiles = (id: string, gen: string): [string, string][] =>
  isPlace(id) ? [[guardOf(id, gen), PLACE_GUARD]] : [];

const guardOf = (id: string, gen: string): string =>
  join(generationDir(id, gen), "place-guard.pl");

/** One process, as {@link busyOld} reads it. */
interface Seen {
  readonly command: string;
  readonly pid: number;
  /** Its parent, as `/proc/<pid>/stat` names it, which any process may read. */
  readonly ppid: number;
}

/** Every process on the machine, read once for every workspace {@link busyOld} looks at. */
const snapshot = async (): Promise<Seen[]> => {
  const [rows, lines] = await Promise.all([
    processLineage(),
    commandLines({ environment: process.platform !== "linux" }),
  ]);
  const commands = new Map(lines.map((line) => [line.pid, line.command]));
  return rows.map((row) => ({
    pid: row.pid,
    ppid: row.ppid,
    command: commands.get(row.pid) ?? "",
  }));
};

/**
 * Linux: `inner`, the sandbox's init, and every process that descends from
 * it, by each one's parent. Nothing started in the sandbox leaves that tree:
 * every command is the runner's, inside, and an orphan (a `setsid -f`, a
 * double fork) goes to a subreaper or the init of its parent's own pid
 * namespace, never one above (the kernel's `find_new_reaper`), so to `inner`
 * or below it, in the sandbox's namespace or any nested in it. A parent is
 * read off `/proc/<pid>/stat`, which needs no access to the process; a pid
 * namespace's link does (`ptrace_may_access`), and a process in a namespace
 * nested below the sandbox's has another one, so neither tells.
 */
const inTree = (seen: Seen[], inner: number | undefined): Seen[] => {
  const root = seen.find((one) => one.pid === inner);
  if (!root) {
    return [];
  }
  const children = new Map<number, Seen[]>();
  for (const one of seen) {
    const siblings = children.get(one.ppid);
    if (siblings) {
      siblings.push(one);
    } else {
      children.set(one.ppid, [one]);
    }
  }
  // Each pid once: the table is read a process at a time, so a pid that
  // ended and came back meanwhile could read as its own ancestor.
  const tree = new Map([[root.pid, root]]);
  for (const one of tree.values()) {
    for (const child of children.get(one.pid) ?? []) {
      tree.set(child.pid, child);
    }
  }
  return [...tree.values()];
};

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
const executors = (
  seen: readonly Pick<Seen, "command" | "pid">[],
  id: string
): number[] => {
  const exec = join(stateDir(id), "exec");
  return seen
    .filter((one) => one.pid !== process.pid && runsExecutor(one.command, exec))
    .map((one) => one.pid);
};

/**
 * Whether anything still runs in an older boundary of workspace `id`
 * ({@link Retiring}): an executor that was on its way into it as it was
 * handed over, or a command or a process one left. On Linux that is anything
 * that descends from its sandbox's init and was not there when its runner
 * was ready ({@link inTree}), a server a command left behind with
 * `setsid -f` or a double fork among them, in the sandbox's pid namespace or
 * one nested in it. On macOS it is anything carrying the
 * workspace's marker but not the current runner's ({@link BOUNDARY_MARKER}),
 * which a `setsid` or double-forked process keeps: both keep the environment
 * they were started with. A process an older runner started cannot be told
 * from one a runner before it started, so the older runners close together.
 */
const busyOld = async (
  seen: Seen[],
  id: string,
  old: Retiring,
  current: Held | undefined
): Promise<boolean> => {
  if (inFlight(seen, id, old)) {
    return true;
  }
  if (process.platform === "linux") {
    const place = await readPlace(id, old.gen);
    const idle = new Set(place?.idle);
    return inTree(seen, place?.inner).some((one) => !idle.has(one.pid));
  }
  const own = current && `${BOUNDARY_MARKER}=${current.gen}`;
  return seen.some(
    (one) =>
      one.pid !== old.pid &&
      one.pid !== current?.pid &&
      one.pid !== process.pid &&
      one.command.includes(`CAWCO_WORKSPACE=${id}`) &&
      !(own && one.command.includes(own))
  );
};

/**
 * Whether an executor that was on its way into the older boundary `old` as it
 * was handed over is still there, its command not yet answered. Checked
 * again as the executor itself, not by the record alone: a record written
 * before {@link runsExecutor} lists the judge too.
 */
const inFlight = (seen: Seen[], id: string, old: Retiring): boolean => {
  const exec = join(stateDir(id), "exec");
  return seen.some(
    (one) => old.executors.includes(one.pid) && runsExecutor(one.command, exec)
  );
};

/**
 * Linux: the ports the work of the older boundary `old` listens on, when a
 * newer generation of the workspace whose sandbox runs ({@link sandboxes})
 * listens on every one of them: its work was started again there (a
 * delegate's dev server, restarted after an update on the port it had), so
 * the older one is done. Undefined when its work listens on no port (a job, a
 * build: it closes once that ends), or on one no newer generation listens on
 * (it stays, reached there, {@link workspaceNetworks}). Its work's ports are
 * {@link workPorts}; a newer generation listens on a port when its network's
 * tables list it listening, whoever holds it.
 */
const supersededPorts = async (
  seen: Seen[],
  old: Retiring,
  generations: readonly RunningSandbox[]
): Promise<number[] | undefined> => {
  const mine = generations.find((one) => one.boundary.gen === old.gen);
  if (!mine) {
    return;
  }
  const ports = await workPorts(seen, mine.place);
  if (ports.length === 0) {
    return;
  }
  const newer = new Set(
    (
      await Promise.all(
        generations
          .filter((one) => one.started > mine.started)
          .map((one) => listeners(one.place.inner))
      )
    )
      .flat()
      .map((one) => one.port)
  );
  return ports.every((port) => newer.has(port)) ? ports : undefined;
};

/**
 * Linux: the ports the work of the sandbox at `place` listens on, sorted: the
 * listening sockets of its network ({@link listeners}) that a process of its
 * work has open, one that descends from its init and was not there when its
 * runner was ready ({@link inTree}), by the socket inodes in its
 * `/proc/<pid>/fd`. srt's own relays inside are its runner's, never its work's.
 */
const workPorts = async (seen: Seen[], place: Place): Promise<number[]> => {
  const idle = new Set(place.idle);
  const work = inTree(seen, place.inner).filter((one) => !idle.has(one.pid));
  const open = new Set(
    (await Promise.all(work.map((one) => socketsOf(one.pid)))).flat()
  );
  return [
    ...new Set(
      (await listeners(place.inner))
        .filter((one) => open.has(one.inode))
        .map((one) => one.port)
    ),
  ].sort((a, b) => a - b);
};

/**
 * What the work of workspace `id`'s running boundary `held` still runs, in
 * words ("listens on 5222", "runs"); nothing once nothing does. Its work is
 * every process in it its runner did not start with ({@link busyOld}), what
 * a command left behind with `&`, `nohup`, `setsid` or a double fork among
 * them, whatever its session or process group: on Linux each descends from
 * the sandbox's init, on macOS each carries the workspace's marker.
 */
const workLeft = async (
  id: string,
  held: Held
): Promise<string | undefined> => {
  const seen = await snapshot();
  if (!(await busyOld(seen, id, { ...held, executors: [] }, undefined))) {
    return;
  }
  const place =
    process.platform === "linux" ? await readPlace(id, held.gen) : undefined;
  const ports = place ? await workPorts(seen, place) : [];
  return ports.length > 0 ? `listens on ${ports.join(", ")}` : "runs";
};

/**
 * The workspaces whose boundary of an older form, or on a retiring keeper,
 * is kept as it is because its work still runs ({@link replaceOlder}), each
 * with what it runs as last said ({@link workLeft}): said once per change.
 * Each stays {@link stale}, looked at until the last of its work ends, then
 * handed over.
 */
const keptRunning = new Map<string, string>();

/** Whether `path` is `dir` or lies under it. */
const lies = (path: string, dir: string): boolean =>
  path === dir || path.startsWith(`${dir}/`);

/**
 * Whether one pair of a policy's lists (`allowRead` and `denyRead`, …) lets
 * `path` through: the deepest entry that holds it decides, a tie denying, as
 * srt and the judge decide (core workspace-policy.ts: "the deeper entry
 * deciding"). A path no entry holds is `unheld`: what the pair grants there
 * is its kind's default (read: yes; write: no), which no name says, so an old
 * policy reads it as let through and a new one as not, and a narrowing is
 * never missed.
 */
const letThrough = (
  path: string,
  allow: readonly string[],
  deny: readonly string[],
  unheld: boolean
): boolean => {
  const deepest = (list: readonly string[]) =>
    Math.max(
      -1,
      ...list
        .filter((entry) => lies(path, entry))
        .map((entry) => entry.split("/").length)
    );
  const allowed = deepest(allow);
  const denied = deepest(deny);
  return allowed < 0 && denied < 0 ? unheld : allowed > denied;
};

/** A policy field's `allow` or `deny` head, before what it is for (`Read`, `Write`). */
const ALLOW_OR_DENY = /^(allow|deny)/;

/** A list of a policy's as paths; undefined when it is no list of strings. */
const pathsOf = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;

/**
 * How policy `now` narrows `was`, the policy a boundary started with
 * ({@link grantedOf}), each in words; none when it widens it or leaves it as
 * it was. Read off the policy's own fields, whatever they are: each pair of
 * lists named `allow<X>` and `deny<X>` narrows when a path one of its lists
 * names was let through before and is not now ({@link letThrough}); any
 * other field narrows when it changed at all (a flag, a path), as no name
 * says which way. With no record, what the boundary grants is not known, so
 * it narrows.
 */
const narrowing = (was: Policy | undefined, now: Policy): string[] => {
  if (!was) {
    return ["what its boundary started with is not on record"];
  }
  const before: Record<string, unknown> = { ...was };
  const after: Record<string, unknown> = { ...now };
  const fields = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].sort();
  const paired = (field: string): string | undefined => {
    const rest = field.replace(ALLOW_OR_DENY, "");
    return rest !== field &&
      [`allow${rest}`, `deny${rest}`].every(
        (name) => pathsOf(before[name]) && pathsOf(after[name])
      )
      ? rest
      : undefined;
  };
  return fields.flatMap((field) => {
    const rest = paired(field);
    if (rest === undefined) {
      return JSON.stringify(before[field]) === JSON.stringify(after[field])
        ? []
        : [`${field} changed`];
    }
    if (field.startsWith("deny")) {
      return [];
    }
    const lists = (policy: Record<string, unknown>) =>
      [
        pathsOf(policy[`allow${rest}`]) ?? [],
        pathsOf(policy[`deny${rest}`]) ?? [],
      ] as const;
    const [allowBefore, denyBefore] = lists(before);
    const [allowNow, denyNow] = lists(after);
    return [
      ...new Set([...allowBefore, ...denyBefore, ...allowNow, ...denyNow]),
    ]
      .filter(
        (path) =>
          letThrough(path, allowBefore, denyBefore, true) &&
          !letThrough(path, allowNow, denyNow, false)
      )
      .map((path) => `${path} is no longer let through by allow${rest}`);
  });
};

/** One process a boundary's work runs, as the delegate's own commands saw it: its pid there and its command line. */
interface WorkProcess {
  readonly command: string;
  readonly pid: number;
}

/** How much of a stopped process's command line is said. Ours: a line's worth. */
const COMMAND_SAID = 160;

const NS_PIDS = /^NSpid:\s+(.+)$/m;

/** Linux: process `pid`'s pid in each pid namespace it is in, outermost first (`/proc/<pid>/status`'s `NSpid`); none once it is gone. */
const nsPids = async (pid: number): Promise<number[]> =>
  (
    NS_PIDS.exec(
      await readFile(`/proc/${pid}/status`, "utf8").catch(() => "")
    )?.[1] ?? ""
  )
    .trim()
    .split(WHITESPACE)
    .filter(Boolean)
    .map(Number);

/**
 * What the work of workspace `id`'s generation `boundary` runs now, as
 * {@link busyOld} counts it: every process by its pid on this machine, and
 * those the rest descend from (the work's roots), as its commands saw them.
 * Linux: each pid in the sandbox's own pid namespace; macOS: the processes
 * carrying that generation's marker, its runner aside.
 */
const workIn = async (
  id: string,
  boundary: Pick<Held, "gen" | "pid">
): Promise<{ all: number[]; roots: WorkProcess[] }> => {
  const seen = await snapshot();
  let work: Seen[] = [];
  let level = 0;
  if (process.platform === "linux") {
    const place = await readPlace(id, boundary.gen);
    if (place) {
      const idle = new Set(place.idle);
      work = inTree(seen, place.inner).filter((one) => !idle.has(one.pid));
      level = (await nsPids(place.inner)).length - 1;
    }
  } else {
    const marker = `${BOUNDARY_MARKER}=${boundary.gen}`;
    work = seen.filter(
      (one) =>
        one.pid !== boundary.pid &&
        one.pid !== process.pid &&
        one.command.includes(`CAWCO_WORKSPACE=${id}`) &&
        one.command.includes(marker)
    );
  }
  const pids = new Set(work.map((one) => one.pid));
  // macOS reads each command with its environment, which is never said.
  const plain =
    process.platform === "linux"
      ? undefined
      : new Map((await commandLines()).map((line) => [line.pid, line.command]));
  const roots = await Promise.all(
    work
      .filter((one) => !pids.has(one.ppid))
      .map(async (one) => ({
        pid: level > 0 ? ((await nsPids(one.pid))[level] ?? one.pid) : one.pid,
        command: (plain?.get(one.pid) ?? one.command).slice(0, COMMAND_SAID),
      }))
  );
  return { all: [...pids], roots };
};

/** At most this many reasons for a narrowing are said, then how many more. */
const REASONS_SAID = 3;

/**
 * The line a delegate's next command shows once CawCo stopped what its work
 * ran (`stopped`) for `cause`: each process by its command and the pid its
 * commands saw, to be started again. Queued by {@link tellStopped}.
 */
const workStoppedLine = (
  cause: string,
  stopped: readonly WorkProcess[]
): string => {
  const one = stopped.length === 1;
  const each = stopped
    .map((proc) => `\`${proc.command}\` (pid ${proc.pid})`)
    .join(", ");
  return `cawco: ${cause}, and what still ran in it was stopped: ${each}. Start ${one ? "it" : "them"} again if you still need ${one ? "it" : "them"}.`;
};

/** Queues {@link workStoppedLine} for workspace `id`'s next session command ({@link noticeOf}); nothing when nothing was stopped. Answers the line. */
const tellStopped = async (
  id: string,
  cause: string,
  stopped: readonly WorkProcess[]
): Promise<string | undefined> => {
  if (stopped.length === 0) {
    return;
  }
  const line = workStoppedLine(cause, stopped);
  await appendFile(noticeOf(id), `${line}\n`, { mode: 0o600 });
  return line;
};

/** Why a narrowed boundary was replaced, in a delegate's words: at most {@link REASONS_SAID} reasons, then how many more. */
const narrowedCause = (narrowed: readonly string[]): string => {
  const more = narrowed.length - REASONS_SAID;
  return `this workspace's access was narrowed (${narrowed.slice(0, REASONS_SAID).join("; ")}${more > 0 ? `; and ${more} more` : ""}), so its boundary was replaced`;
};

/** The generations of a workspace whose access narrowed ({@link narrowedGenerations}): the current one's reasons (none when it did not), and each older one still beside it that did. */
interface Narrowed {
  readonly current: readonly string[];
  readonly older: readonly { boundary: Retiring; why: readonly string[] }[];
}

/**
 * Which generations of workspace `ref`, its current boundary `held` and each
 * older one still beside it ({@link Retiring}), grant what the workspace's
 * policy as it stands no longer does ({@link narrowing}); undefined when none
 * does.
 */
const narrowedGenerations = async (
  ref: WorkspaceRef,
  held: Pick<Held, "gen">
): Promise<Narrowed | undefined> => {
  const now = await workspacePolicy(ref);
  const current = narrowing(await grantedPolicy(ref.id, held.gen), now);
  const older: { boundary: Retiring; why: string[] }[] = [];
  for (const boundary of await readRetiring(ref.id)) {
    // biome-ignore lint/performance/noAwaitInLoops: one small record read per older generation
    const why = narrowing(await grantedPolicy(ref.id, boundary.gen), now);
    if (why.length > 0) {
      older.push({ boundary, why });
    }
  }
  return current.length > 0 || older.length > 0
    ? { current, older }
    : undefined;
};

/**
 * The keeper a boundary replaced while this build's keeper is owed the
 * machine's endpoint ({@link ownKeeperOwed}) starts on: this build's own
 * keeper, which an update's helper starts at its own endpoint before the
 * machine's names it, once it answers there. Until then there is none to
 * start on but the current one (`client`), and the boundary started there is
 * handed over to this build's keeper once that is the machine's, as every
 * boundary on a retiring keeper is ({@link leaveRetiringKeepers}).
 */
const keeperTakingOver = async (
  client: SessiondClient,
  owed: boolean
): Promise<SessiondClient> =>
  owed
    ? ((await keepers.of({ kind: "build", version: runtimeVersion })) ?? client)
    : client;

/**
 * Stops every generation of workspace `ref` whose access the workspace's
 * policy has narrowed since it started (`narrowed`, {@link narrowing}), now,
 * as {@link restartIfIdle} stops one: the gate goes up, each is stopped with
 * everything in it, and, when the current one `held` was, a boundary of the
 * policy as it stands starts, on the keeper taking over when one is owed the
 * endpoint ({@link keeperTakingOver}). What their work still ran is said,
 * each process by its command and the pid its commands saw: in the agent's
 * log, and as a line the delegate's next command shows ({@link noticeOf}),
 * so it can start it again. Nothing it ran is lost silently, and no access
 * outlives its removal. Answers the boundary that runs.
 */
const replaceNarrowed = async (
  client: SessiondClient,
  ref: WorkspaceRef,
  held: Held,
  narrowed: Narrowed,
  owed: boolean
): Promise<Boundary> => {
  const gate = gateOf(ref.id);
  await writeStateFile(gate, String(process.pid));
  try {
    const stopping: Held[] = [
      ...(narrowed.current.length > 0 ? [held] : []),
      ...narrowed.older.map((one) => one.boundary),
    ];
    const why = [
      ...new Set([
        ...narrowed.current,
        ...narrowed.older.flatMap((one) => one.why),
      ]),
    ];
    const stopped: WorkProcess[] = [];
    for (const boundary of stopping) {
      // biome-ignore lint/performance/noAwaitInLoops: one boundary at a time, each gone before the next
      const work = await workIn(ref.id, boundary);
      stopped.push(...work.roots);
      const place = await readPlace(ref.id, boundary.gen);
      await stopBoundary(ref.id, boundary);
      if (process.platform === "darwin") {
        // What a macOS runner started outlives it ({@link stopBoundary}).
        for (const pid of work.all) {
          signalPid(listedPid(pid), "SIGKILL");
        }
      } else if (!(await sandboxesGone(place ? [place.inner] : []))) {
        throw new Error(
          `its sandbox ${place?.inner} was still there ${STOP_TIMEOUT_MS / 1000}s after it was stopped`
        );
      }
      await cleanGeneration(ref.id, boundary);
      await rm(retiringFileOf(ref.id, boundary), { force: true });
    }
    const runs =
      narrowed.current.length > 0
        ? await (async () => {
            forgetStale(ref.id);
            return start(await keeperTakingOver(client, owed), ref);
          })()
        : await armHook(ref.id, held);
    const line = await tellStopped(ref.id, narrowedCause(why), stopped);
    console.info(
      `[workspace] ${ref.id}: its boundary ${stopping.map((one) => one.pid).join(", ")} (form ${held.form ?? "none"}) is stopped now, as its access narrowed, and ${runs.pid} runs: ${line ?? `nothing ran in it (${why.slice(0, REASONS_SAID).join("; ")})`}`
    );
    return runs;
  } finally {
    await rm(gate, { force: true });
  }
};

/**
 * How often the boundaries in use are looked at for a narrowing no event
 * says ({@link lookForNarrowing}): 5 s, unless a probe's scratch fleet names
 * another in `CAWCO_NARROW_LOOK_MS` (boundary-handover holds it off, so only
 * the hub's event can act on a project's folder moved away). Read once, as
 * the daemon starts.
 */
const NARROW_LOOK_MS = process.env.CAWCO_NARROW_LOOK_MS
  ? Number(process.env.CAWCO_NARROW_LOOK_MS)
  : 5000;

/** Each workspace's narrowing check under way, and whether another was asked meanwhile ({@link recheckNarrowed}). */
let narrowLook: Promise<void> | undefined;
let narrowAgain: { readonly why: string } | undefined;

/**
 * Checks the running boundaries for a narrowed access now ({@link narrowing}),
 * and stops each generation whose access narrowed, its current boundary
 * replaced ({@link replaceNarrowed}), as a start of its own (an ensure under
 * way checks for itself, and a close under way ends it): every workspace with
 * a boundary running on any keeper, or only `ids`. One check at a time; one
 * asked meanwhile runs once it ends. Never rejects.
 *
 * THE LIST of what a workspace's policy reads (core workspace-policy.ts
 * `workspacePolicy`) and what says each changed, so its boundaries are
 * checked for a narrowed access ({@link recheckNarrowed}) at once:
 *
 * - its accounts (`accounts.json`) and its sessions' spill folders
 *   (`spills.json`), which only grow: written by {@link boundaryFor} and the
 *   workspace's create, each followed by an ensure, which checks
 *   ({@link ensure});
 * - its project (`project.json`): a change of it checks at once
 *   ({@link setProject}, written by those and a browser door's);
 * - its project's folder on the hub (`projectFolder`): moved away only by
 *   the hub (a project's delete or merge), which then syncs every machine's
 *   fleet config; the sync checks (session.ts `FLEET_SYNC`);
 * - what the fleet sync writes (`fleetSyncedPaths`, the user layer under
 *   Claude Code's home): the sync checks;
 * - this machine's accounts and the credential stores they make
 *   (`accountLayers`' config dirs, `credentialStores`): an account's sign-in
 *   or removal checks ({@link accountsChangedHere});
 * - this build (`binaryRoot`, the form): the agent's start re-arms every
 *   boundary in use, through an ensure ({@link rearmHooks});
 * - the clone's alternates, the toolchains under home (`homeToolchains`),
 *   Xcode's developer dir, a place's own files (`ownerOnlyIn`, `linkedIn`,
 *   `protectedIn`) and every link a path resolves through: no event says
 *   these, and no file watch is kept for them (a watch per workspace is what
 *   fseventsd's memory went to); the boundaries in use are looked at for
 *   them each {@link NARROW_LOOK_MS} ({@link lookForNarrowing}).
 *
 * What is fixed for a workspace's life (its clone, state and scratch dirs,
 * doors, caches, the gitconfig, the host's tool caches, Linux's host-private
 * paths) needs none.
 */
export const recheckNarrowed = (
  why: string,
  ids?: readonly string[]
): Promise<void> => {
  if (narrowLook) {
    narrowAgain = { why };
    return narrowLook;
  }
  narrowLook = recheckNow(why, ids)
    .catch((error: unknown) => {
      console.warn(
        `[workspace] the boundaries could not be checked for a narrowed access (${why}): ${error instanceof Error ? error.message : String(error)}`
      );
    })
    .finally(() => {
      narrowLook = undefined;
      const again = narrowAgain;
      narrowAgain = undefined;
      if (again) {
        recheckNarrowed(again.why).catch(() => undefined);
      }
    });
  return narrowLook;
};

/** {@link recheckNarrowed}'s check itself. */
const recheckNow = async (
  why: string,
  ids?: readonly string[]
): Promise<void> => {
  const procs = (await keepers.held()).filter((proc) => proc.alive);
  const runningIds = (
    ids ?? (await readdir(workspacesDir()).catch(() => [] as string[]))
  ).filter((id) => procs.some((proc) => isBoundaryOf(proc.procId, id)));
  for (const id of runningIds) {
    if (starting.has(id) || closing.has(id)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one workspace at a time, as each start is
    const held = await readHeld(id).catch(() => undefined);
    if (!held) {
      continue;
    }
    const ref = { id, path: held.path };
    const narrowed = await narrowedGenerations(ref, held).catch(
      () => undefined
    );
    if (!narrowed || starting.has(id) || closing.has(id)) {
      continue;
    }
    console.info(
      `[workspace] ${id}: its access narrowed (${why}), so its narrowed boundaries are stopped now`
    );
    const replaced = (async () =>
      replaceNarrowed(
        await sessiond(),
        ref,
        held,
        narrowed,
        await ownKeeperOwed()
      ))();
    starting.set(id, replaced);
    await replaced
      .catch((error: unknown) => {
        console.warn(
          `[workspace] ${id}: its narrowed boundary could not be replaced: ${error instanceof Error ? error.message : String(error)}`
        );
      })
      .finally(() => starting.delete(id));
  }
};

/**
 * The workspaces whose boundary is in use: a session attached, a live work
 * item, a preview, a command, or work running in it ({@link liveWhy},
 * {@link workLeft}); every running one while the hub has not said which
 * items are live.
 */
const inUseNow = async (): Promise<string[]> => {
  const procs = (await keepers.held()).filter((proc) => proc.alive);
  const ids = (await readdir(workspacesDir()).catch(() => [] as string[]))
    .filter((id) => procs.some((proc) => isBoundaryOf(proc.procId, id)))
    .filter((id) => !(starting.has(id) || closing.has(id)));
  const facts = await liveFacts(procs);
  if (!facts) {
    return ids;
  }
  // The process table, read once and only for a boundary nothing holds.
  let seen: Seen[] | undefined;
  const used: string[] = [];
  for (const id of ids) {
    // biome-ignore lint/performance/noAwaitInLoops: one small record read per running boundary
    const held = await readHeld(id).catch(() => undefined);
    if (!held) {
      continue;
    }
    if (liveWhy(id, held.path, facts)) {
      used.push(id);
      continue;
    }
    seen ??= await snapshot();
    if (await busyOld(seen, id, { ...held, executors: [] }, undefined)) {
      used.push(id);
    }
  }
  return used;
};

/** A machine's accounts changed (a sign-in, an account removed): every running boundary is checked for a narrowed access. */
export const accountsChangedHere = (): void => {
  recheckNarrowed("this machine's accounts changed").catch(() => undefined);
};

let narrowTimer: ReturnType<typeof setInterval> | undefined;

/** Looks at the boundaries in use for a narrowed access each {@link NARROW_LOOK_MS} ({@link recheckNarrowed}'s list, its last item). */
const lookForNarrowing = (): void => {
  if (narrowTimer) {
    return;
  }
  narrowTimer = setInterval(() => {
    if (narrowLook) {
      return;
    }
    inUseNow()
      .then((ids) =>
        ids.length > 0
          ? recheckNarrowed("a look at the boundaries in use", ids)
          : undefined
      )
      .catch((error: unknown) => {
        console.warn(
          `[workspace] the boundaries in use could not be looked at for a narrowed access: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }, NARROW_LOOK_MS);
  narrowTimer.unref();
};

/** The socket inodes process `pid` has open, as its `/proc/<pid>/fd` links name them (`socket:[INODE]`); none once it is gone. */
const socketsOf = async (pid: number): Promise<string[]> => {
  const fds = await readdir(`/proc/${pid}/fd`).catch(() => [] as string[]);
  const links = await Promise.all(
    fds.map((fd) => readlink(`/proc/${pid}/fd/${fd}`).catch(() => undefined))
  );
  return links.flatMap((link) => {
    const inode = link && SOCKET_LINK.exec(link)?.[1];
    return inode ? [inode] : [];
  });
};

const SOCKET_LINK = /^socket:\[(\d+)\]$/;

/** Where an older boundary still running beside the current one is recorded ({@link Retiring}). */
const retiringFileOf = (id: string, old: Pick<Held, "gen">): string =>
  join(stateDir(id), `retiring-${old.gen}.json`);

const RETIRING_FILE = /^retiring-[^/]+\.json$/;

/** Every older boundary of workspace `id` recorded as still running beside the current one. */
const readRetiring = async (id: string): Promise<Retiring[]> => {
  const names = await readdir(stateDir(id)).catch(() => [] as string[]);
  const records = await Promise.all(
    names
      .filter((name) => RETIRING_FILE.test(name))
      .map((name) =>
        reported(readRecord<Retiring>(join(stateDir(id), name))).catch(
          () => undefined
        )
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
  await writeStateFile(gate, String(process.pid));
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
 * more, that is no longer running, or whose work a newer generation took
 * over ({@link supersededPorts}), with every process in it, and cleans its
 * files; one that still runs something of its own is left as it is. Answers
 * whether any is left.
 */
const closeIdle = async (seen: Seen[], id: string): Promise<boolean> => {
  const current = await readHeld(id).catch(() => undefined);
  const now = process.platform === "linux" ? await sandboxes(id) : [];
  let left = false;
  for (const old of await readRetiring(id)) {
    // biome-ignore lint/performance/noAwaitInLoops: one older boundary at a time
    const alive = Boolean(await running(id, old));
    let closed = alive
      ? "has nothing left running in it and is closed"
      : "is gone";
    if (alive && (await busyOld(seen, id, old, current))) {
      const ports = inFlight(seen, id, old)
        ? undefined
        : await supersededPorts(seen, old, now);
      if (!ports) {
        left = true;
        continue;
      }
      // What still runs there is the delegate's: it is said to it.
      const line = await tellStopped(
        id,
        `a newer boundary of this workspace listens on every port its older one's work listened on (${ports.join(", ")}), so the older one was closed`,
        (await workIn(id, old)).roots
      );
      closed = `is closed with what runs in it: a newer generation listens on every port its work listened on (${ports.join(", ")})${line ? `; said to the delegate: ${line}` : ""}`;
    }
    await stopBoundary(id, old);
    await cleanGeneration(id, old);
    await rm(retiringFileOf(id, old), { force: true });
    console.info(
      `[workspace] ${id}: its older boundary ${old.pid} (form ${old.form ?? "none"}) ${closed}`
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
 * mount point left, is forgotten: its next start makes the stand-in. Not
 * while this build's keeper is owed the machine's endpoint ({@link
 * ownKeeperOwed}): the new one starts on the keeper that stays.
 */
const restartStubbed = async (): Promise<void> => {
  if (await ownKeeperOwed()) {
    return;
  }
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
  await writeStateFile(gate, String(process.pid));
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

/**
 * Hands over each {@link stale} boundary that still runs. Not while this
 * build's keeper is owed the machine's endpoint ({@link ownKeeperOwed}): each
 * waits for it, so its one handover lands on the keeper that stays.
 */
const handOverStale = async (): Promise<void> => {
  if (stale.size === 0 || (await ownKeeperOwed())) {
    return;
  }
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
      // One kept while its work runs ({@link replaceOlder}) is only looked
      // at, not ensured: an ensure is a use, and its quiet time must run.
      // A narrowing meanwhile is the narrowing look's ({@link recheckNarrowed}).
      if (keptRunning.has(ref.id) && (await workLeft(ref.id, held))) {
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
  keptRunning.delete(id);
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
 * A handover of an older form waits for this build's keeper ({@link
 * ownKeeperOwed}), so none lands on a keeper that is about to retire. What
 * still runs on one when a keeper is handed over: a boundary whose form this
 * build keeps (it is not handed over as the agent starts), one started fresh
 * (none was running) before this build's keeper took the endpoint, a judge,
 * and everything a `--keeper-only` handover leaves behind.
 *
 * A workspace nothing holds ({@link liveWhy}) moves nothing: its boundaries
 * and judges are closed where they run ({@link closeQuietly}), once nothing
 * has ensured it for {@link QUIET_CLOSE_MS} (none has, after the agent's
 * restart), and its next command starts them on the current keeper. Until the hub has said which
 * work items are live, none of the retiring keeper's is moved or closed.
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
  const facts = await liveFacts(procs);
  if (!facts) {
    return;
  }
  const ids = await readdir(workspacesDir()).catch(() => [] as string[]);
  for (const id of ids) {
    if (starting.has(id) || closing.has(id)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one small read per workspace, only while a keeper retires
    const held = await readHeld(id).catch(() => undefined);
    if (!held) {
      continue;
    }
    const onRetiring = elsewhere.some(
      (proc) => isBoundaryOf(proc.procId, id) || isJudgeOf(proc.procId, id)
    );
    if (onRetiring && !liveWhy(id, held.path, facts)) {
      // One ensured a moment ago may have its session on the way: it is
      // closed at a later look, once quiet.
      if (!recentlyHeld(id)) {
        await closeQuietly(id, "it runs on a retiring session keeper");
      }
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

/**
 * How long a workspace's boundary runs on with nothing holding it
 * ({@link liveWhy}) before it closes ({@link closeQuietly}). Our call: the hub
 * puts a finished delegate's session to sleep at once and lands its work
 * right after, each of its commands a use; a handoff that soon after finds
 * the boundary still up. Past that, a closed one costs its next command one
 * sandbox start (seconds; `WORKSPACE_BOUNDARY_START_TIMEOUT_MS` at most),
 * while an idle one holds its srt host, bwrap, socat relays, an inotify
 * instance, its judge and their memory for as long as the workspace lasts:
 * 55 of 76 on obelisk had no live work item (2026-10-15).
 */
export const QUIET_CLOSE_MS = 10 * 60_000;

/** How often the boundaries are looked at for quiet ones. Ours: a minute against {@link QUIET_CLOSE_MS}. */
const QUIET_SWEEP_MS = 60_000;

/**
 * When each workspace's boundary was last ensured or seen held
 * ({@link liveWhy}): its quiet time counts from there. One first seen by this
 * agent counts from that look, so a restart gives every boundary its full
 * quiet time again.
 */
const liveAt = new Map<string, number>();

/** Each workspace's close under way (quiet, {@link closeQuietly}, or an archive's, {@link closedWhile}); it never rejects. An ensure waits for it. */
const closing = new Map<string, Promise<void>>();

/**
 * Runs an archive's close of workspace `id` (`close`) as one step against its
 * starts: after the start under way, if any, has ended and the close before
 * it has finished, and with an ensure arriving meanwhile waiting until it is
 * done ({@link ensureNow}). A start the close did not wait for would run on
 * with its generation's dir, FIFO and state dir taken from under it, or start
 * a boundary the close has already passed.
 */
const closedWhile = async <T>(
  id: string,
  close: () => Promise<T>
): Promise<T> => {
  const before = [starting.get(id), closing.get(id)];
  const work = Promise.allSettled(before).then(close);
  const held = work.then(
    () => undefined,
    () => undefined
  );
  closing.set(id, held);
  try {
    return await work;
  } finally {
    if (closing.get(id) === held) {
      closing.delete(id);
    }
  }
};

/**
 * What the agent knows holds a workspace that this module cannot read for
 * itself, handed in by the daemon ({@link watchQuietBoundaries}).
 */
export interface BoundaryHolders {
  /** The workspaces whose port a preview this agent serves names (preview.ts `servingPreviews`). */
  readonly previews: () => Iterable<string>;
  /** The workspaces a carried session's commands run in (session.ts `boundedWorkspaces`), whatever its harness. */
  readonly sessions: () => Iterable<string>;
}

let holders: BoundaryHolders | undefined;

/**
 * The workspaces with a live work item on this machine, as the hub said on
 * its last answer to a beat (`HeartbeatAckPayload.liveWorkspaces`); none yet
 * until it has said, and nothing closes until then.
 */
let hubLive: ReadonlySet<string> | undefined;

/** Takes the hub's list of workspaces with a live work item ({@link hubLive}); anything but a list is ignored. */
export const liveWorkItems = (ids: unknown): void => {
  if (Array.isArray(ids)) {
    hubLive = new Set(ids.filter((id): id is string => typeof id === "string"));
  }
};

/** Every process's command line, as one list and by pid: read once for every workspace a look covers. */
interface Commands {
  readonly byPid: ReadonlyMap<number, string>;
  readonly lines: readonly { command: string; pid: number }[];
}

/** What {@link liveWhy} reads, once for every workspace a look covers. */
interface LiveFacts {
  readonly commands: Commands;
  readonly hub: ReadonlySet<string>;
  readonly previews: ReadonlySet<string>;
  /** Every live process a keeper holds. */
  readonly procs: readonly HeldProc[];
  readonly sessions: ReadonlySet<string>;
}

/** {@link Commands} as they stand now. */
const commandsNow = async (): Promise<Commands> => {
  const lines = await commandLines();
  return {
    byPid: new Map(lines.map((line) => [line.pid, line.command])),
    lines,
  };
};

/**
 * {@link LiveFacts} as they stand now; none while the hub has not said which
 * work items are live or the daemon has not handed in its holders.
 */
const liveFacts = async (
  procs: readonly HeldProc[]
): Promise<LiveFacts | undefined> => {
  if (!(hubLive && holders)) {
    return;
  }
  return {
    commands: await commandsNow(),
    hub: hubLive,
    previews: new Set(holders.previews()),
    procs,
    sessions: new Set(holders.sessions()),
  };
};

/**
 * Whether a session's process a keeper holds may run a command in workspace
 * `id`, whose folder is `path`: a Claude Code or pi process started in its
 * clone (every session there runs in its boundary), or, for a place (a
 * person's own folder, where the person's own sessions run on the
 * host), one launched with the place's hook. A sleeping session has no
 * process. Read off the keepers, so it holds for a CLI this agent has not
 * adopted yet.
 */
const attachedIn = (
  id: string,
  path: string,
  procs: readonly HeldProc[],
  commands: Commands
): boolean => attachedProcs(id, path, procs, commands).length > 0;

/** The session processes {@link attachedIn} counts in workspace `id`. */
const attachedProcs = (
  id: string,
  path: string,
  procs: readonly HeldProc[],
  commands: Commands
): HeldProc[] => {
  const hook = `'${join(stateDir(id), "hook")}'`;
  return procs.filter((proc) => {
    const { kind } = parseProcId(proc.procId);
    if (!(proc.alive && (kind === "claude" || kind === "pi"))) {
      return false;
    }
    if (isPlace(id)) {
      return commands.byPid.get(proc.pid)?.includes(hook) ?? false;
    }
    return (
      proc.cwd !== undefined &&
      (proc.cwd === path || proc.cwd.startsWith(`${path}/`))
    );
  });
};

/** Whether a session's process is attached in workspace `id` or a command is on its way into it: the start's own test, before the hub or the sessions are heard ({@link rearmHooks}). */
const inUse = (
  id: string,
  path: string,
  procs: readonly HeldProc[],
  commands: Commands
): boolean =>
  attachedIn(id, path, procs, commands) ||
  executors(commands.lines, id).length > 0;

/**
 * Why workspace `id`'s boundary must run now, in words; nothing when nothing
 * holds it. THE list of what holds a boundary:
 *
 *  - it is starting;
 *  - a session that may run a command there is attached: carried by this
 *    agent with its commands bounded there, or its process held by a keeper
 *    ({@link attachedIn}); a session asleep is not;
 *  - a work item there is live, as the hub says;
 *  - a preview this agent serves names a port in it;
 *  - a command is on its way in or running ({@link executors}).
 */
const liveWhy = (
  id: string,
  path: string,
  facts: LiveFacts
): string | undefined => {
  if (starting.has(id)) {
    return "its boundary is starting";
  }
  if (
    facts.sessions.has(id) ||
    attachedIn(id, path, facts.procs, facts.commands)
  ) {
    return "a session there is attached";
  }
  if (facts.hub.has(id)) {
    return "a work item there is live";
  }
  if (facts.previews.has(id)) {
    return "a preview shows a server in it";
  }
  if (executors(facts.commands.lines, id).length > 0) {
    return "a command runs in it";
  }
};

/** Whether workspace `id`'s boundary was ensured or seen held within {@link QUIET_CLOSE_MS}. */
const recentlyHeld = (id: string): boolean =>
  Date.now() - (liveAt.get(id) ?? 0) < QUIET_CLOSE_MS;

/**
 * Closes workspace `id`'s boundaries, every generation on every keeper, with
 * everything in them, and its judges and doors, as nothing holds it any more:
 * its clone, state dir, scratch dir, policy, hook and executor stay. Its
 * record goes (`boundary.json`), so a judge's exit arms nothing again
 * ({@link watchJudge}) and its executor, until the next start, says the
 * boundary is not running. Its next {@link ensureBoundary} (a session's
 * spawn or wake, the hub's land or check, a workflow's command) starts a new
 * one and arms it. The gate is up while it closes, and an executor already on
 * its way in leaves the boundary as it is. Never rejects.
 */
const closeQuietly = (id: string, why: string): Promise<void> => {
  const pending = closing.get(id);
  if (pending) {
    return pending;
  }
  const work = closeNow(id, why)
    .catch((error: unknown) => {
      console.warn(
        `[workspace] ${id}: its boundary could not be closed: ${error instanceof Error ? error.message : String(error)}`
      );
    })
    .finally(() => {
      if (closing.get(id) === work) {
        closing.delete(id);
      }
    });
  closing.set(id, work);
  return work;
};

/** {@link closeQuietly}'s close itself. */
const closeNow = async (id: string, why: string): Promise<void> => {
  const held = await readHeld(id).catch(() => undefined);
  if (!held) {
    return;
  }
  const gate = gateOf(id);
  await writeStateFile(gate, String(process.pid));
  try {
    if (executors(await commandLines(), id).length > 0) {
      liveAt.set(id, Date.now());
      return;
    }
    forgetStale(id);
    forgetRetiring(id);
    forgetStubbed(id);
    const boundaries = [held, ...(await readRetiring(id))];
    for (const boundary of boundaries) {
      // biome-ignore lint/performance/noAwaitInLoops: one boundary at a time, as an archive closes them
      await stopBoundary(id, boundary);
      await cleanGeneration(id, boundary);
      await rm(retiringFileOf(id, boundary), { force: true });
    }
    const left = (await keepers.held()).filter(
      (proc) => proc.alive && isBoundaryOf(proc.procId, id)
    );
    await Promise.all(
      left.map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
    );
    await rm(join(stateDir(id), "boundary.json"), { force: true });
    await closeToolDoor(id);
    await closeGitDoor(id);
    await closeGithubDoor(id);
    const judges = (await keepers.held()).filter(
      (proc) => proc.alive && isJudgeOf(proc.procId, id)
    );
    await Promise.all(
      judges.map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
    );
    liveAt.delete(id);
    console.info(
      `[workspace] ${id}: nothing holds it (no session attached, no live work item, no preview, no command) and ${why}, so its boundary ${boundaries.map((boundary) => boundary.pid).join(", ")} and its ${judges.length} judge(s) are closed; its clone and state stay, and its next command starts it again`
    );
  } finally {
    await rm(gate, { force: true });
  }
};

/**
 * Closes every boundary nothing has held for {@link QUIET_CLOSE_MS}
 * ({@link liveWhy}), one listing of the keepers and one of the machine's
 * processes for all of them. Nothing closes until the hub has said which work
 * items are live.
 */
const sweepQuiet = async (): Promise<void> => {
  const procs = (await keepers.held()).filter((proc) => proc.alive);
  const ids = (await readdir(workspacesDir()).catch(() => [] as string[]))
    .filter((id) => procs.some((proc) => isBoundaryOf(proc.procId, id)))
    .filter((id) => !closing.has(id));
  if (ids.length === 0) {
    return;
  }
  const facts = await liveFacts(procs);
  if (!facts) {
    return;
  }
  const now = Date.now();
  for (const id of ids) {
    // biome-ignore lint/performance/noAwaitInLoops: one small record read per workspace whose boundary runs
    const held = await readHeld(id).catch(() => undefined);
    if (!held || liveWhy(id, held.path, facts)) {
      liveAt.set(id, now);
      continue;
    }
    const since = liveAt.get(id);
    if (since === undefined) {
      liveAt.set(id, now);
      continue;
    }
    if (!(recentlyHeld(id) || starting.has(id))) {
      await closeQuietly(
        id,
        `it has been quiet for ${Math.round((now - since) / 60_000)} min`
      );
    }
  }
};

/** The judge socket a workspace's hook names ({@link hookScript}'s `$judge`). */
const HOOK_JUDGE = /^\$judge = '((?:[^'\\]|\\.)*)';$/m;

/**
 * What the judge at `socket` answers to {@link JUDGE_BUILD_QUESTION}, word
 * for word, or why it answered nothing; unanswered when it said nothing in
 * as long as a hook gives it ({@link HOOK_LIMIT_S}).
 */
const judgeSays = (socket: string): Promise<Bounded<string>> =>
  readWithin(
    HOOK_LIMIT_S * 1000,
    (signal) =>
      new Promise<string>((resolve) => {
        const chunks: Buffer[] = [];
        const connection = createConnection(socket);
        signal.addEventListener("abort", () => connection.destroy(), {
          once: true,
        });
        connection.on("connect", () => {
          connection.write(`${JUDGE_BUILD_QUESTION}\n`);
        });
        connection.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        connection.on("end", () => {
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
        connection.on("error", (error) => {
          resolve(`nothing (${error.message})`);
        });
      })
  );

/** What a judge said, in words a law's line quotes. */
const judgeWords = (read: Bounded<string>): string => {
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      return `no answer within ${HOOK_LIMIT_S} s`;
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/**
 * Whether workspace `id` is between states its hook and judge move through:
 * its boundary starting or closing, its hook being armed, its judge starting.
 */
const settling = (id: string): boolean =>
  starting.has(id) ||
  closing.has(id) ||
  arming.has(id) ||
  [...judging.keys()].some((procId) => isJudgeOf(procId, id));

/**
 * Law `live-workspace-judge-answers` (core invariant.ts), on boundary.ts's
 * beat ({@link watchQuietBoundaries}): every workspace a session's process
 * runs in or a command is on its way into ({@link inUse}) has its hook name a
 * judge that answers as this build's ({@link judgeBuildOf}). Its hook is
 * read on every call that process makes, and a judge that is gone, or of
 * another build, refuses or misjudges each one. A workspace between states
 * ({@link settling}) is looked at on the next beat; so is every workspace
 * while the start-up reading is not whole (blocked is its own named state,
 * {@link ArmingBlocked}), and the start's arming is waited out first.
 *
 * Born red, once: dad89261b^ (the start before it revived a workspace a CLI
 * runs in with no boundary), with this check laid on, a keeper holding a
 * process in workspace red-c-ws's clone, no boundary, and a hook naming a
 * judge that is gone. The start left it "with none are armed when a session
 * there starts", and the beat exited 70: "[law] Law broken:
 * live-workspace-judge-answers. Every workspace a session's process runs in
 * has a judge of this build answering its hook. Workspace red-c-ws has a
 * session's process or a command in it, and its hook's judge at
 * …/red2/c/run/gone.sock answered "nothing (connect ENOENT …)", not this
 * build's judge (0fc17cf98658ab74)." A judge of this build, asked, answered
 * "0\n0fc17cf98658ab74".
 *
 * Broken, it is repaired where it broke, and the agent stays up
 * ({@link repairJudge}): what is wrong is one workspace's judge, and an exit
 * cut every other workspace's call off while its start revived the same
 * state, which the next close broke again (obelisk, 2026-10-18: two exits,
 * one per `from` cut of held workspace bb4af2c9).
 */
const judgesAnswer = async (procs: readonly HeldProc[]): Promise<void> => {
  if (armState.arming.kind !== "listed") {
    return;
  }
  await Promise.all(rearming.values());
  const ids = await readdir(workspacesDir()).catch(() => [] as string[]);
  if (ids.length === 0) {
    return;
  }
  const commands = await commandsNow();
  const build = judgeBuildOf(await judgeScripts());
  await Promise.all(
    ids.map(async (id) => {
      if (settling(id)) {
        return;
      }
      const path =
        (await readHeld(id).catch(() => undefined))?.path ??
        (
          await readRecord<{ path?: string }>(
            join(stateDir(id), "create.json")
          ).catch(() => undefined)
        )?.path;
      if (!(path && inUse(id, path, procs, commands))) {
        return;
      }
      const asked = await judgeAnswer(id, build);
      if (asked.answers || settling(id)) {
        return;
      }
      await repairJudge({ id, path }, asked, build);
    })
  );
};

/** A judge's socket file name (`judgeFor`): its form. */
const JUDGE_SOCKET = /^judge-([0-9a-f]+)\.sock$/;

/** What workspace `id`'s hook's judge answers now. */
interface JudgeAnswer {
  /** Whether it answers as this build's judge. */
  readonly answers: boolean;
  /** The socket its hook names, if any. */
  readonly socket: string | undefined;
  /** What it said, in words a log line quotes. */
  readonly words: string;
}

/** Asks the judge workspace `id`'s hook names which build it runs ({@link JUDGE_BUILD_QUESTION}). */
const judgeAnswer = async (id: string, build: string): Promise<JudgeAnswer> => {
  const hook = await readFile(join(stateDir(id), "hook"), "utf8").catch(
    () => ""
  );
  const socket = HOOK_JUDGE.exec(hook)?.[1];
  if (!socket) {
    return { answers: false, socket, words: "its hook names no judge" };
  }
  const read = await judgeSays(socket);
  return {
    answers: read.kind === "answered" && read.value === `0\n${build}`,
    socket,
    words: `its hook's judge at ${socket} answered ${JSON.stringify(judgeWords(read))}`,
  };
};

/**
 * Repairs law `live-workspace-judge-answers` for workspace `ref` alone, its
 * hook's judge having answered `asked`, not as this build's:
 *
 *  1. the judge the hook names, if a keeper still holds it, is ended and
 *     waited out (a hung one, or one of another build: `judgeFor` never
 *     starts a second of a form already held);
 *  2. its boundary is ensured ({@link ensureNow}): one running is armed
 *     again, which starts this build's judge and points the hook at it, and
 *     one gone is started, as the agent's start revives one under a live CLI;
 *  3. the judge is asked again; still not answering, what uses the workspace
 *     is ended ({@link endUsers}), so no call is refused for ever.
 *
 * One line names the workspace, what its judge said and what was done. The
 * agent stays up whatever it comes to.
 */
const repairJudge = async (
  ref: WorkspaceRef,
  asked: JudgeAnswer,
  build: string
): Promise<void> => {
  const form = asked.socket
    ? JUDGE_SOCKET.exec(basename(asked.socket))?.[1]
    : undefined;
  if (form) {
    const procId = judgeProcId(ref.id, form);
    const stuck = await keepers.holding(procId);
    if (stuck) {
      await stuck.client.signal(procId, "SIGKILL");
      const deadline = Date.now() + STOP_TIMEOUT_MS;
      while (
        // biome-ignore lint/performance/noAwaitInLoops: polls one judge until its keeper says it is gone, or the deadline passes
        (await holding(procId)) &&
        Date.now() < deadline
      ) {
        await Bun.sleep(20);
      }
    }
  }
  let started = "its judge was started again";
  try {
    await ensureNow(ref);
    await rearming.get(ref.id);
  } catch (error) {
    started = `its boundary could not be started again (${error instanceof Error ? error.message : String(error)})`;
  }
  const again = await judgeAnswer(ref.id, build);
  const broken = `law live-workspace-judge-answers was broken (a session's process or a command is in it, and ${asked.words}, not this build's judge ${build})`;
  if (again.answers) {
    console.warn(
      `[workspace] ${ref.id}: ${broken}; ${started} and answers as this build's`
    );
    return;
  }
  const ended = await endUsers(ref);
  console.warn(
    `[workspace] ${ref.id}: ${broken}; ${started}, and still ${again.words}, so ${
      isPlace(ref.id)
        ? "nothing was ended: a place's sessions are the person's own, and each call there is refused until its next start arms it"
        : `what used it was ended: ${ended.ended.join(", ") || "nothing was left"}${ended.left.length > 0 ? `; still running after SIGKILL: ${ended.left.join(", ")}` : ""}`
    }`
  );
};

let quietTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Starts looking for quiet boundaries every {@link QUIET_SWEEP_MS}
 * ({@link sweepQuiet}), with what the daemon knows holds a workspace, and
 * then at every live workspace's judge ({@link judgesAnswer}). Once per
 * agent.
 */
export const watchQuietBoundaries = (given: BoundaryHolders): void => {
  holders = given;
  lookForNarrowing();
  if (quietTimer) {
    return;
  }
  let looking = false;
  quietTimer = setInterval(() => {
    if (looking) {
      return;
    }
    looking = true;
    sweepQuiet()
      .then(async () =>
        judgesAnswer((await keepers.held()).filter((proc) => proc.alive))
      )
      .catch((error: unknown) => {
        console.warn(
          `[workspace] the quiet boundaries could not be looked at: ${error instanceof Error ? error.message : String(error)}`
        );
      })
      .finally(() => {
        looking = false;
      });
  }, QUIET_SWEEP_MS);
  quietTimer.unref();
};

/** Waits for a process's `line` (the boundary's {@link READY}); answers that line's seq, or rejects with the process's own words if it dies first. */
const ready = (
  client: SessiondClient,
  procId: string,
  line: string,
  what: string
): Promise<number> =>
  new Promise((resolve, reject) => {
    const said: string[] = [];
    const words = (): string => (said.length ? `: ${said.join(" / ")}` : "");
    const finish = (outcome: Error | number): void => {
      clearTimeout(timer);
      client.unsubscribe(procId);
      if (typeof outcome === "number") {
        resolve(outcome);
      } else {
        reject(outcome);
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
            finish(event.seq);
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

/**
 * What every command runs with besides its caller's environment: the
 * workspaces' own cache (`workspaceCacheEnv`), its own XDG config, data and
 * state homes (`workspaceXdgEnv`), Maestro's home and temp dir in the
 * workspace (`workspaceMaestroEnv`), the host's CA store (`hostCaEnv`: TLS
 * verifies against it whatever binary is first on PATH), node's own clients
 * on the boundary's proxy as every other tool is (`NODE_USE_ENV_PROXY`:
 * node's `fetch` and `http`/`https` read `HTTPS_PROXY` and `NO_PROXY` only
 * with it, and a workspace reaches the network through that proxy alone),
 * its scratch dir as `TMPDIR` (by its short name on macOS, `workspaceTmpDir`),
 * the empty git template, git's own system config
 * ({@link gitSystemConfigOf}), the tool and git doors (hub-git.ts
 * `gitDoorEnv`), and `CAWCO_WORKSPACE`, by which a script tells that it runs
 * inside one; never a key agent's socket ({@link AGENT_SOCKET_ENV}).
 *
 * And never a forge's token, its caller's included ({@link FORGE_TOKEN_ENV}),
 * whatever the project's upstream rule: no forge CLI by its path, nor curl,
 * nor any HTTP client has one to post with, on any host. gh runs with the
 * door's config dir ({@link guardedGhConfigOf}): its requests go through the
 * workspace's GitHub door, which decides each write by the rule as every door
 * does (core `decideWrite`) and signs in on the host to what goes
 * (github-door.ts). Every push across the network goes through the git door
 * (hub-git.ts `guardedPushParameters`), which decides it the same way and
 * pushes what goes with the host's own credential.
 */
const commandEnv = (id: string, clone: string): string[] => [
  `unset ${AGENT_SOCKET_ENV.join(" ")}`,
  `for name in $(compgen -e); do case $name in ${FORGE_TOKEN_ENV.join(" | ")}) unset "$name" ;; esac; done`,
  ...Object.entries({
    ...workspaceCacheEnv(),
    ...workspaceXdgEnv(id),
    ...workspaceMaestroEnv(id),
    ...hostCaEnv(),
    // https://nodejs.org/learn/http/enterprise-network-configuration: "This
    // works with node:http and node:https (v22.21.0 or v24.5.0+) methods as
    // well as fetch() (v22.21.0 or v24.0.0+)".
    NODE_USE_ENV_PROXY: "1",
    TMPDIR: workspaceTmpDir(id),
    GIT_TEMPLATE_DIR: gitTemplateOf(id),
    GH_CONFIG_DIR: guardedGhConfigOf(id),
    GIT_CONFIG_SYSTEM: gitSystemConfigOf(id),
    CAWCO_TOOL_SOCKET: toolDoorOf(id),
    CAWCO_WORKSPACE: id,
    ...doorEnv(id, clone),
  }).map(([name, value]) => `export ${name}=${shellQuote(value)}`),
];

/** The git door's variables, its config words joined by those that send every push across the network through it. */
const doorEnv = (id: string, clone: string): Record<string, string> => {
  const door = gitDoorEnv(id, clone);
  return {
    ...door,
    CAWCO_GIT_PARAMETERS: [door.CAWCO_GIT_PARAMETERS, guardedPushParameters()]
      .filter(Boolean)
      .join(" "),
  };
};

/**
 * The variables a forge's credential travels in, whatever the forge, as
 * shell `case` patterns: gh's and hub's (`GH_TOKEN`, `GH_ENTERPRISE_TOKEN`,
 * `GITHUB_TOKEN`, `GITHUB_ENTERPRISE_TOKEN`), glab's ("Environment
 * variables, first one set wins: `GITLAB_TOKEN`, `GITLAB_ACCESS_TOKEN`,
 * `OAUTH_TOKEN`", and `CI_JOB_TOKEN` under CI auto-login,
 * docs.gitlab.com/cli/config), and any other forge's token by its name
 * (Gitea, Forgejo, Codeberg, Bitbucket): the forge-named token variables are
 * my own call, as no list of every forge's names exists.
 */
const FORGE_TOKEN_ENV = [
  "GH_*TOKEN",
  "GITHUB_*TOKEN",
  "GITLAB_*TOKEN",
  "OAUTH_TOKEN",
  "CI_JOB_TOKEN",
  "GITEA_*TOKEN",
  "FORGEJO_*TOKEN",
  "CODEBERG_*TOKEN",
  "BITBUCKET_*",
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
const mountCheck = (id: string, gen: string, pid: string): string =>
  `place=${shellQuote(placeOf(id, gen))}
read -r outer inner _ < "$place" 2>/dev/null
if ! awk 'FILENAME == ARGV[1] { want[$0] = 1; next } ($5 in want) { delete want[$5] } END { for (p in want) exit 1 }' ${shellQuote(guardedOf(id, gen))} "/proc/\${inner:-0}/mountinfo" 2>/dev/null; then
  kill -USR1 ${pid} 2>/dev/null
  for _ in $(seq ${RESTART_WAIT_TENTHS}); do
    read -r now _ < "$place" 2>/dev/null
    if [ -n "$now" ] && [ "$now" != "\${outer:-}" ]; then PATH=$caller_path exec "$0" "$@"; fi
    kill -0 ${pid} 2>/dev/null || break
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
const followTaker = (id: string, gen: string): string => `taker=
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
 * the command runs with its caller's PATH, behind the hub's git helper and,
 * on macOS, the toolchain shims.
 */
/** A place's guard, looking before its command ({@link PLACE_GUARD}): a place it cannot look at runs no command. Nothing for a clone. */
const guardBefore = (id: string, held: Pick<Held, "gen" | "path">): string =>
  isPlace(id)
    ? `if ! /usr/bin/perl ${shellQuote(guardOf(id, held.gen))} before "$req" ${shellQuote(held.path)} 2> "$req/guard-err"; then
  echo "cawco: this place's guard could not look at it before the command, so the command did not run: $(cat "$req/guard-err")" >&2
  rm -rf "$req"
  exit 126
fi
`
    : "";

/** A place's guard, judging what its command did ({@link PLACE_GUARD}): what it moved fails the command, and so does a guard that could not look. Nothing for a clone. */
const guardAfter = (
  id: string,
  held: Pick<Held, "gen" | "path" | "scratch">
): string =>
  isPlace(id)
    ? `/usr/bin/perl ${shellQuote(guardOf(id, held.gen))} after "$req" ${shellQuote(held.path)} ${shellQuote(held.scratch)} ${shellQuote(workspacePolicyFile(id))} "$HOME" >&2
guarded=$?
if [ "$guarded" = 3 ]; then status=1; elif [ "$guarded" != 0 ]; then echo "cawco: this place's guard could not check what the command changed, so the command is taken as failed." >&2; status=1; fi
`
    : "";

/**
 * The executor's text for the boundary whose host is `held.pid`, which it
 * signals (`kill -USR1`) and looks for (`kill -0`). Undefined for the form's
 * own text ({@link planFor}), which is hashed and never run, and names no
 * process.
 */
const execScript = (
  id: string,
  held: Pick<Held, "exec" | "gen" | "path" | "scratch"> & {
    readonly pid: Pid | undefined;
  }
): string => {
  const linux = process.platform === "linux";
  const pid = held.pid === undefined ? "PID" : String(held.pid);
  // The hub's git helper (`hub-git.ts`) first, then on macOS the toolchain
  // shims.
  const helpers = `${gitHelperDirOf(id)}:${linux ? "" : `${shimsOf(id)}:`}`;
  const path = `printf 'export PATH=%q\\n' ${shellQuote(helpers)}"$caller_path"`;
  return `#!/bin/bash
# CawCo workspace ${id}: runs one shell command inside the workspace's boundary.
# exec [--session] [--cwd-out FILE] COMMAND — FILE gets the directory COMMAND
# ended in; a session's command (--session) shows the workspace's notice first.
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
if ! [ -p "$fifo" ] || ! kill -0 ${pid} 2>/dev/null; then
  echo ${shellQuote(stoppedLine(id))} >&2
  exit 126
fi
${linux ? mountCheck(id, held.gen, pid) : ""}
session=
if [ "$1" = --session ]; then session=1; shift; fi
cwd_out=
if [ "$1" = --cwd-out ]; then cwd_out=$2; shift 2; fi
# A session's command shows what CawCo did to the work meanwhile, once.
notice=${shellQuote(noticeOf(id))}
if [ -n "$session" ] && [ -s "$notice" ] && mv "$notice" "$notice.$$" 2>/dev/null; then
  cat "$notice.$$" >&2
  rm -f "$notice.$$"
fi
req=$(mktemp -d ${shellQuote(held.scratch)}/.run.XXXXXX) || exit 126
printf '%s' "$1" > "$req/cmd"
pwd -P > "$req/cwd"
{
  export -p
${commandEnv(id, held.path)
  .map((line) => `  echo ${shellQuote(line)}`)
  .join("\n")}
  ${path}
} > "$req/env"
mkfifo "$req/out" "$req/err"
# Cut off: the runner ends the command's group, in the sandbox's own pid
# space, where the pid it wrote means that group (RUNNER's "cancel").
trap 'p=$(cat "$req/pid" 2>/dev/null); [ -n "$p" ] && printf "cancel %s\\n" "$p" > "$fifo"; rm -rf "$req"; exit 143' TERM INT HUP
${guardBefore(id, held)}printf '%s\\n' "$req" > "$fifo"
cat "$req/out" & out=$!
cat "$req/err" >&2 & err=$!
wait "$out" "$err"
${linux ? followTaker(id, held.gen) : `taker=${pid}`}
# A sandbox stopped mid-command leaves no status: the command is cut off.
until [ -s "$req/status" ]; do
${linux ? '  [ -z "$taker" ] && [ -s "$req/sandbox" ] && take' : ""}
  if ! kill -0 "\${taker:-${pid}}" 2>/dev/null; then
    echo ${shellQuote(`cawco: workspace ${id}'s boundary stopped while this command ran, so it was cut off.`)} >&2
    rm -rf "$req"
    exit 137
  fi
  sleep 0.01
done
status=$(cat "$req/status")
${guardAfter(id, held)}if [ -n "$cwd_out" ] && [ -s "$req/cwd-out" ]; then cp "$req/cwd-out" "$cwd_out"; fi
rm -rf "$req"
exit "$status"
`;
};

/**
 * Workspace `ref`'s executor and runner as this build writes them, for a
 * proof that runs them on the host with no sandbox around them (the probe
 * kit's git-door spec): the files the executor's environment names written
 * as arming writes them (gh's door config, git's system config), then the
 * executor's text for a runner at `pid` and the runner's own. Every command
 * still goes in through the same executor, its environment built by
 * {@link commandEnv}, and runs through the same runner: `bash -c <runner>
 * cawco <fifo>`, its pid both of the boundary's in `place`, `guarded`
 * naming no bind.
 */
export const executorUnsandboxed = async (
  ref: WorkspaceRef,
  gen: string,
  pid: Pid
): Promise<{
  exec: string;
  fifo: string;
  guarded: string;
  place: string;
  runner: string;
  scratch: string;
}> => {
  await writeGuardedGhConfig(ref.id);
  await writeWhole(gitSystemConfigOf(ref.id), gitSystemConfig(ref.id), 0o644);
  return {
    exec: execScript(ref.id, {
      exec: join(stateDir(ref.id), "exec"),
      gen,
      path: ref.path,
      pid,
      scratch: scratchOf(ref.id),
    }),
    fifo: fifoOf(ref.id, gen),
    guarded: guardedOf(ref.id, gen),
    place: placeOf(ref.id, gen),
    runner: RUNNER,
    scratch: scratchOf(ref.id),
  };
};

/**
 * The folders a boundary needs before it starts: its state dir, the part of
 * it a command reads (with the empty git template), its scratch dir with its
 * XDG homes and Maestro's home in it, and the caches it writes. Never nested in one another
 * (srt #446), but for the XDG homes, which are only the scratch dir's
 * contents. A HOME so long that a browser's socket in the scratch dir cannot
 * fit is said in the log: everything else in the workspace still runs. The
 * workspace writes its scratch dir, so a folder of it that a link the
 * workspace planted leads out of it ({@link ownInScratch}) is never made
 * through or written into, and the log says so; the git config link, the
 * bunfig and pnpm's config go only into a config home of the scratch dir's
 * own, and yarn's link only into a data home of its own.
 */
export const makeDirs = async (id: string): Promise<void> => {
  const tooLong = scratchSocketProblem(id);
  if (tooLong) {
    console.warn(`[workspace] ${id}: ${tooLong}`);
  }
  await mkdir(sessionIdentityDir(), { recursive: true, mode: 0o700 });
  const xdg = workspaceXdgDirs(id);
  const inScratch = [xdg.config, xdg.data, xdg.state, workspaceMaestroHome(id)];
  const own = await Promise.all(
    inScratch.map((path) => ownInScratch(id, path))
  );
  const planted = inScratch.filter((_, at) => !own[at]);
  if (planted.length > 0) {
    console.warn(
      `[workspace] ${id}: ${planted.join(", ")} lead out of its scratch dir through a link in it, so nothing was made or written there`
    );
  }
  await Promise.all(
    [
      stateDir(id),
      roOf(id),
      gitTemplateOf(id),
      scratchOf(id),
      ...inScratch.filter((path) => !planted.includes(path)),
      ...workspaceCaches(),
    ].map((path) => mkdir(path, { recursive: true }))
  );
  await makeRuntimeDir(id);
  if (!planted.includes(xdg.config)) {
    await linkGitConfig(xdg.config);
    await writeBunConfig(xdg.config);
    await writePnpmConfig(id, xdg.config);
  }
  if (!planted.includes(xdg.data)) {
    await linkYarnFolder(id, xdg.data);
  }
  // Its `TMPDIR`'s short name on macOS, made again after a restart cleared it.
  linkWorkspaceTmp(id);
};

/**
 * The runtime dir every command runs with (paths.ts `workspaceRuntimeDir`),
 * mode 0700 whatever the umask: pnpm takes no other for its store locks, and
 * one other users can write to it ignores. Every workspace writes the cache,
 * so it is opened without following a link (a link a workspace planted
 * there is never changed through, and the log says so) and changed through
 * that handle.
 */
const makeRuntimeDir = async (id: string): Promise<void> => {
  const dir = workspaceRuntimeDir();
  await mkdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") {
      throw error;
    }
  });
  const handle = await openFile(
    dir,
    // biome-ignore lint/suspicious/noBitwiseOperators: open(2) takes its flags as one bit set
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  ).catch((error: NodeJS.ErrnoException) => {
    console.warn(
      `[workspace] ${id}: ${dir} is not a folder of its own (${error.code}), so pnpm's store locks have no runtime dir there`
    );
  });
  if (!handle) {
    return;
  }
  try {
    // biome-ignore lint/suspicious/noBitwiseOperators: a mode's permission bits
    if (((await handle.stat()).mode & 0o777) !== 0o700) {
      await handle.chmod(0o700);
    }
  } finally {
    await handle.close();
  }
};

/**
 * Whether `path`, in workspace `id`'s scratch dir, is reached from the
 * scratch dir through folders of its own: no entry on the way down is a
 * link (or anything but a folder), each looked at without following it.
 * One not there yet is the scratch dir's own: `mkdir` makes it there.
 */
const ownInScratch = async (id: string, path: string): Promise<boolean> => {
  let at = scratchOf(id);
  for (const part of relative(at, path).split("/")) {
    at = join(at, part);
    // biome-ignore lint/performance/noAwaitInLoops: each entry is looked at before the one inside it
    const found = await lstat(at).catch(() => undefined);
    if (!found) {
      return true;
    }
    if (!found.isDirectory()) {
      return false;
    }
  }
  return true;
};

/** The global bunfig {@link writeBunConfig} writes: bun's global virtual store on. */
const BUN_GLOBAL_STORE = `# CawCo: bun's global virtual store, so this workspace's installs link from the
# workspaces' cache. A project's own bunfig.toml overrides it (globalStore = false).
[install]
globalStore = true
`;

/**
 * Linux: `<config home>/.bunfig.toml`, the global bunfig of every bun the
 * workspace runs (its `XDG_CONFIG_HOME`, `workspaceXdgEnv`), turning bun's
 * global virtual store on. Inside a boundary the clone and the workspaces'
 * bun cache are each a bind mount of their own, and link(2) refuses across
 * mount points (link(2), EXDEV: "link() does not work across different mount
 * points, even if the same filesystem is mounted on both"), so bun's
 * hardlink backend copied every package into each clone: 2.0 GB in every
 * cockpit clone (2026-10-16). With the store, bun makes each package once in
 * `<cache>/links/`, inside the cache's own mount, and a clone's
 * `node_modules` is symlinks into it (bun.com/docs/pm/global-store: "Package
 * files live in one shared cache; each project's node_modules is a thin tree
 * of symlinks into it"): 5.9 MB a cockpit clone, 2026-10-18. Only the
 * isolated linker uses it ("the hoisted linker does not use it"); a hoisted
 * install copies as before. A global bunfig, and never the env's
 * `BUN_INSTALL_GLOBAL_STORE`, which bun reads after every bunfig: a project
 * whose packages import what they never declare (they no longer reach its
 * root `node_modules` from the store) says `globalStore = false` in its own
 * (bun.com/docs/runtime/bunfig: "keys set in the local file override the
 * same keys in the global file"). Written only as a new file, in a config
 * home of the scratch dir's own ({@link makeDirs}); one there already is
 * the workspace's to keep. On macOS bun clones files inside its boundary
 * already: Seatbelt makes no mounts.
 */
const writeBunConfig = async (configHome: string): Promise<void> => {
  if (process.platform !== "linux") {
    return;
  }
  await writeNew(join(configHome, ".bunfig.toml"), BUN_GLOBAL_STORE);
};

/** Writes `path` only as a new file: one there already is the workspace's to keep. */
const writeNew = async (path: string, content: string): Promise<void> => {
  try {
    await writeFile(path, content, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
};

/** pnpm's store in the workspaces' cache: its content-addressable files and, under `links/`, its global virtual store. */
const pnpmStore = (): string => join(workspaceCacheDir(), "pnpm", "store");

/**
 * pnpm's global config in the workspace's config home (its
 * `XDG_CONFIG_HOME`), turning pnpm's global virtual store on with its store
 * in the workspaces' cache. pnpm's store defaults to
 * `$XDG_DATA_HOME/pnpm/store` (pnpm.io/settings/store#storedir: "If the
 * $XDG_DATA_HOME env variable is set", ahead of the macOS default), the
 * workspace's own data home: every workspace fetched every package again. On
 * Linux, since link(2) refuses across the boundary's mounts (EXDEV,
 * {@link writeBunConfig}), it then copied each one into its clone ("A store
 * on a genuinely different filesystem from `node_modules` cannot be
 * hardlinked from at all — the attempt fails with `EXDEV` — so `auto` already
 * falls back to copying", pnpm.io/settings/node-modules#packageimportmethod).
 * With the global virtual store pnpm hardlinks each package once into
 * `<store>/links/`, inside the cache (on Linux its own mount), and a clone's
 * `node_modules` is symlinks into it ("Each project's `node_modules`
 * contains only symlinks pointing into this shared location",
 * pnpm.io/global-virtual-store): a clone of 138 packages took 780 KB where a
 * copy took 119 MB, 2026-10-18. On macOS Seatbelt lets a command read and
 * write the cache (workspace-policy.ts `workspacePolicy`, `workspaceCaches` in
 * its reads and writes) and judges each link by where it lands, so the same
 * links work there. pnpm 12 locks the store from outside it, in the
 * runtime dir every workspace shares ({@link makeRuntimeDir}).
 *
 * Two files, one for each config pnpm has had. pnpm 11 and later read
 * `$XDG_CONFIG_HOME/pnpm/config.yaml` and take only auth and registry
 * settings from `rc` (pnpm.io/blog/releases/11.0: "Other settings must live
 * in `pnpm-workspace.yaml` or the new global `config.yaml`");
 * `enableGlobalVirtualStore` is the spelling every 11 and 12 reads
 * (`virtualStoreType` came in 11.23.0, and 11.22 warns at every install that
 * it "cannot be set in the global config file"). pnpm 10 reads every setting
 * from `$XDG_CONFIG_HOME/pnpm/rc` (`enable-global-virtual-store` since
 * 10.12.1). A config file and never the env's `pnpm_config_*`, which
 * overrides `pnpm-workspace.yaml` (pnpm.io/configuring#environment-variables):
 * a project's own `virtualStoreType: project` (or `.npmrc` on pnpm 10) still
 * installs into its own `node_modules/.pnpm`. Each written only as a new file,
 * in a config home of the scratch dir's own ({@link makeDirs}).
 */
const writePnpmConfig = async (
  id: string,
  configHome: string
): Promise<void> => {
  const dir = join(configHome, "pnpm");
  if (!(await ownInScratch(id, dir))) {
    console.warn(
      `[workspace] ${id}: ${dir} leads out of its scratch dir through a link in it, so pnpm's config was not written there`
    );
    return;
  }
  await mkdir(dir, { recursive: true });
  const store = pnpmStore();
  const said =
    "# CawCo: pnpm's global virtual store, in the workspaces' cache, so this workspace's\n# installs link from it. A project's own setting overrides it.\n";
  await Promise.all([
    writeNew(
      join(dir, "config.yaml"),
      `${said}storeDir: ${JSON.stringify(store)}\nenableGlobalVirtualStore: true\n`
    ),
    writeNew(
      join(dir, "rc"),
      `${said}store-dir=${store}\nenable-global-virtual-store=true\n`
    ),
  ]);
};

/** Yarn's global folder in the workspaces' cache: its global cache of package zips and its metadata. */
const yarnGlobalFolder = (): string =>
  join(workspaceCacheDir(), "yarn", "berry");

/**
 * `<data home>/yarn/berry`, a link to yarn's global folder in the
 * workspaces' cache. Yarn (2 and later) keeps every package as a zip in its
 * global cache (`enableGlobalCache`, true by default), inside `globalFolder`,
 * whose default off Windows is `$XDG_DATA_HOME/yarn/berry` (yarnpkg/berry
 * folderUtils.ts `getDefaultGlobalFolder`): the workspace's own data home, so
 * every workspace fetched every package again into its scratch dir. Through
 * the link they share one cache, and Plug'n'Play, yarn's default linker,
 * loads each package from its zip there: a clone holds `.pnp.cjs` and only
 * what a package's build unplugs (16 MB of 138 packages, 2026-10-18).
 * Yarn has no global config file outside the home dir (it reads
 * `~/.yarnrc.yml` and the project's own), and its env settings override the
 * project's ("such values will overwrite any that might have been defined in
 * the RC files", yarnpkg.com/configuration/yarnrc), so the default path is
 * where this goes: a project's own `globalFolder` or `enableGlobalCache:
 * false` still wins. Made only in a data home of the scratch dir's own
 * ({@link makeDirs}); a `berry` the workspace made is its own to keep.
 */
const linkYarnFolder = async (id: string, dataHome: string): Promise<void> => {
  const dir = join(dataHome, "yarn");
  if (!(await ownInScratch(id, dir))) {
    console.warn(
      `[workspace] ${id}: ${dir} leads out of its scratch dir through a link in it, so yarn's link was not made there`
    );
    return;
  }
  await mkdir(dir, { recursive: true });
  await mkdir(yarnGlobalFolder(), { recursive: true });
  try {
    await symlink(yarnGlobalFolder(), join(dir, "berry"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
};

/**
 * `<config home>/git`, a link to the user's own git config dir: git reads
 * `$XDG_CONFIG_HOME/git/config` and `…/ignore` (git-config(1) "FILES",
 * gitignore(5) `core.excludesFile`), so with the workspace's own config home
 * it reads the user's, as it did before. Made only in a config home of the
 * scratch dir's own ({@link makeDirs}); a link the workspace replaced is its
 * own to keep.
 */
const linkGitConfig = async (configHome: string): Promise<void> => {
  try {
    await symlink(userGitConfigDir(), join(configHome, "git"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
};

/** How many files {@link ownInodes} copies at once. */
const OWN_INODE_BATCH = 64;

/** A multi-linked file as `find -printf '%D %i %p\0'` names it: its device, inode and path. */
const LINKED_FILE = /^(\d+) (\d+) (.*)$/s;

/** The files under `root` with more than one link, each with its inode as `<device> <inode>`. */
const linkedFiles = async (
  root: string
): Promise<{ inode: string; file: string }[]> => {
  const listed =
    await Bun.$`/usr/bin/find ${root} -xdev -type f -links +1 -printf ${"%D %i %p\\0"}`
      .env(hostEnvironment())
      .quiet()
      .nothrow();
  return listed.stdout
    .toString()
    .split("\0")
    .flatMap((line) => {
      const [, device, inode, file] = LINKED_FILE.exec(line) ?? [];
      return file ? [{ inode: `${device} ${inode}`, file }] : [];
    });
};

/**
 * Gives every file in a Linux clone an inode of its own, but one it shares
 * with the workspaces' bun cache, and answers how many it copied. bun
 * installs by hardlinking from its cache, so a clone installed from the
 * host's bun cache shares inodes with it and every host tree installed from
 * it, and a write inside the clone would change a file the host runs. A file
 * linked to the workspaces' own bun cache (`workspaceCacheEnv`) stays linked:
 * every workspace writes that cache already, and no host tree is installed
 * from it. It copies and renames files in place, so it runs only before a
 * boundary starts with no sandbox of the workspace running (its first start,
 * a start after a reboot, a replacement once the one before is stopped),
 * never beside an older generation still running in the clone at a handover
 * ({@link launch}).
 */
const ownInodes = async (path: string): Promise<number> => {
  const linked = await linkedFiles(path);
  const cached = new Set(
    linked.length > 0
      ? (await linkedFiles(workspaceCacheEnv().BUN_INSTALL_CACHE_DIR)).map(
          ({ inode }) => inode
        )
      : []
  );
  const files = linked
    .filter(({ inode }) => !cached.has(inode))
    .map(({ file }) => file);
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

/** Whether `pid` is still a bwrap: a pid on record names no other process. */
const isBwrap = async (pid: number): Promise<boolean> =>
  (await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => ""))
    .split("\0")[0]
    ?.endsWith("bwrap") ?? false;

/** Linux: one generation of a workspace whose sandbox runs now ({@link sandboxes}). */
interface RunningSandbox {
  readonly boundary: Held;
  readonly place: Place;
  /** Its host's start, in clock ticks since boot (a later generation's host starts later); the current generation's reads as the newest. */
  readonly started: number;
}

/** Whether `outer` is a bwrap that `host` started: the sandbox the srt host `host` runs now. */
const hostsSandbox = async (host: number, outer: number): Promise<boolean> => {
  const text = await readFile(`/proc/${outer}/stat`, "utf8").catch(() => "");
  const parent = Number(text.slice(text.lastIndexOf(")") + 2).split(" ")[1]);
  return parent === host && (await isBwrap(outer));
};

/**
 * Linux: the generations of workspace `id` whose sandbox runs now, the
 * current one first, then each older one still running beside it ({@link
 * handOver}), newest first. A generation's sandbox runs while the outer bwrap
 * its srt host names ({@link placeOf}) is alive and is that host's own child:
 * the host removes the name as it ends, and the bwrap ends with the host
 * (`--die-with-parent`). Read off the generation's own files and `/proc`
 * alone, never a keeper: what a keeper answers or not, during a keeper's
 * handover among others, says nothing of whether a sandbox runs.
 */
const sandboxes = async (id: string): Promise<RunningSandbox[]> => {
  const held = await readHeld(id).catch(() => undefined);
  const named = new Set<string>();
  // During a handover the older one is both the record and retiring.
  const records = [
    ...(held ? [{ boundary: held as Held, current: true }] : []),
    ...(await readRetiring(id)).map((boundary) => ({
      boundary: boundary as Held,
      current: false,
    })),
  ].filter(({ boundary }) => {
    if (named.has(boundary.gen)) {
      return false;
    }
    named.add(boundary.gen);
    return true;
  });
  const found = await Promise.all(
    records.map(async ({ boundary, current }) => {
      const place = await readPlace(id, boundary.gen);
      if (!(place && (await hostsSandbox(boundary.pid, place.outer)))) {
        return;
      }
      return {
        boundary,
        place,
        started: current
          ? Number.POSITIVE_INFINITY
          : Number(await processStart(boundary.pid)) || 0,
      };
    })
  );
  return found
    .filter((one): one is RunningSandbox => one !== undefined)
    .sort((a, b) => (a.started === b.started ? 0 : b.started - a.started));
};

/** A TCP table's state for a listening socket (`/proc/net/tcp`'s `st`). */
const TCP_LISTEN = "0A";

/**
 * Linux: the TCP sockets listening in the network of the sandbox whose init
 * is `inner`, each with its port and socket inode, from `/proc/<inner>/net/tcp`
 * and `tcp6`: the tables of the network namespace that process is in. Empty
 * once it is gone.
 */
export const listeners = async (
  inner: number
): Promise<{ inode: string; port: number }[]> => {
  const tables = await Promise.all(
    ["tcp", "tcp6"].map((table) =>
      readFile(`/proc/${inner}/net/${table}`, "utf8").catch(() => "")
    )
  );
  return tables.flatMap((text) =>
    text
      .split("\n")
      .slice(1)
      .flatMap((line) => {
        // sl local_address rem_address st tx:rx tr:when retrnsmt uid timeout inode
        const [, local, , state, , , , , , inode] = line
          .trim()
          .split(WHITESPACE);
        if (state !== TCP_LISTEN || !local || !inode) {
          return [];
        }
        return [
          {
            port: Number.parseInt(local.slice(local.indexOf(":") + 1), 16),
            inode,
          },
        ];
      })
  );
};

/**
 * Where a workspace's servers listen: on Linux each network of a generation
 * whose sandbox runs ({@link sandboxes}), named by its sandbox's init
 * (`inner`), the current one first, then each older one newest first: a port
 * is served from the newest generation that listens on it, so a server one
 * generation started is reached over one an older generation still runs on
 * the same port. On macOS, which gives a boundary no network of its own, the
 * host's (`host`) while its boundary runs. Empty when no boundary of the
 * workspace runs on this machine.
 */
export const workspaceNetworks = async (
  id: string
): Promise<({ inner: number } | "host")[]> => {
  if (process.platform === "linux") {
    return (await sandboxes(id)).map(({ place }) => ({ inner: place.inner }));
  }
  const held = await readHeld(id).catch(() => undefined);
  const boundaries = [...(held ? [held] : []), ...(await readRetiring(id))];
  for (const boundary of boundaries) {
    // biome-ignore lint/performance/noAwaitInLoops: one boundary at a time, current first; the first that runs answers
    if (await running(id, boundary)) {
      return ["host"];
    }
  }
  return [];
};

/** Every process a macOS workspace started, found by the marker its runner handed them all. */
const killMarked = async (id: string): Promise<void> => {
  for (const { pid, command } of await commandLines({ environment: true })) {
    if (command.includes(`CAWCO_WORKSPACE=${id}`) && pid !== process.pid) {
      signalPid(listedPid(pid), "SIGKILL");
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
    signalPid(listedPid(place.outer), "SIGKILL");
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
 * dir, FIFO and srt temp dir.
 */
const cleanGeneration = async (
  id: string,
  held: Pick<Held, "gen">
): Promise<void> => {
  const srtTmp =
    process.platform === "linux" && process.env.XDG_RUNTIME_DIR
      ? [srtTmpOf(id, held.gen)]
      : [];
  const files = [generationDir(id, held.gen), fifoOf(id, held.gen), ...srtTmp];
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
  await mkdir(join(stateDir(ref.id), "boundaries"), { recursive: true });
  // Its generation's dir is made here and nowhere else, and only by this
  // start: one already there is another start's, whose files this one
  // neither uses nor cleans away as it fails.
  const made = await mkdir(generationDir(ref.id, gen)).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") {
        return false;
      }
      throw error;
    }
  );
  if (!made) {
    throw refusal(
      ref.id,
      `its boundary generation ${gen} is already another start's`
    );
  }
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
  // A place is a person's own folder: nothing of the boundary's is
  // written into it (no copied inodes, no stand-ins, no exclude lines).
  const own = !isPlace(ref.id);
  const procId = boundaryProcId(ref.id, gen);
  if (linux) {
    // Only with no sandbox of the workspace running: a handover starts this
    // one beside an older one whose work runs on in the same clone.
    const split =
      own && (await sandboxes(ref.id)).length === 0
        ? await ownInodes(ref.path)
        : 0;
    if (split > 0) {
      console.info(
        `[workspace] ${ref.id}: ${split} file(s) in its clone shared an inode with a file outside it, and each now has its own`
      );
    }
    const srtTmp = srtTmpOf(ref.id, gen);
    await rm(srtTmp, { recursive: true, force: true });
    await mkdir(srtTmp, { recursive: true, mode: 0o700 });
  }
  // Linux: the host makes each missing deny path in a clone before the
  // sandbox starts.
  if (own) {
    await listStandIns(ref, linux);
  }
  const plan = await planOf(ref, gen);
  for (const [path, content, mode] of plan.files) {
    // biome-ignore lint/performance/noAwaitInLoops: a few small files
    await writeWhole(path, content, mode ?? 0o644);
  }
  const fifo = fifoOf(ref.id, gen);
  const made = await Bun.$`/usr/bin/mkfifo ${fifo}`
    .env(hostEnvironment())
    .quiet()
    .nothrow();
  if (made.exitCode !== 0) {
    throw refusal(ref.id, `mkfifo failed: ${made.stderr.toString().trim()}`);
  }
  await client.spawnProc(procId, plan.spec);
  const readyAt = await ready(client, procId, READY, "the boundary").catch(
    (error: Error) => {
      throw refusal(ref.id, error.message);
    }
  );
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
  // Followed from its ready line on, before armHook would follow it from now.
  await watchHost(ref.id, held, readyAt);
  // armHook writes the executor.
  return armHook(ref.id, held);
};

/** SIGKILL to every live process a keeper holds that `owned` names. */
const signalHeld = async (
  owned: (procId: string) => boolean
): Promise<void> => {
  await Promise.all(
    (await keepers.held())
      .filter((proc) => proc.alive && owned(proc.procId))
      .map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
  );
};

/**
 * Kills the workspace's boundaries, the current one and every older one
 * still beside it, with every process in them ({@link stopBoundary}), and any
 * other boundary process of the workspace; on macOS everything carrying the
 * workspace's marker. Stops serving its doors, and closes its pages in its
 * project's browser with its sessions' connections there. What still uses it from
 * outside the boundary ends too: a session's CLI in its clone, an executor
 * on its way in ({@link endUsers}). Its record goes (`boundary.json`, each
 * older one's), so its executor says the boundary is not running and a
 * judge's exit arms nothing again ({@link watchJudge}); then its judges go,
 * on every keeper that runs one, unless something {@link endUsers} ended
 * outlived its SIGKILL, which its judge goes on answering. Never starts one: a
 * boundary already down, or one that never started, leaves nothing to do.
 * Its clone, state dir (its accounts, project, hook and policy), scratch dir
 * and stand-ins stay, so its next {@link ensureBoundary} starts one as a
 * quiet close leaves it. What an archive does first (workspace.ts
 * `closeClone`): nothing writes the clone from here on. A start under way
 * ends first, and one asked for meanwhile waits ({@link closedWhile}).
 * Answers the inner pids of the sandboxes it stopped (Linux).
 */
export const stopWorkspaceBoundary = (ref: WorkspaceRef): Promise<number[]> =>
  closedWhile(ref.id, () => stopNow(ref));

/**
 * Ends what still uses workspace `ref` from outside its boundary, as law
 * `live-workspace-judge-answers` counts it ({@link inUse}): every session
 * process a keeper holds in its clone ({@link attachedProcs}) and every
 * executor on its way in ({@link executors}), each SIGKILLed, then waited for
 * up to {@link STOP_TIMEOUT_MS}. Two callers:
 *
 *  - whatever stops a workspace's boundary for good ({@link stopNow}: an
 *    archive, a held workspace's close, a stage clone's cut), before its
 *    judge goes. The hub closes a workspace only once its items' sessions are
 *    asleep or ended (work-items.ts `holdOn`, `archiveNow`), so a CLI still
 *    in the clone is one whose session the hub filed gone; left there, its
 *    judge gone, every call it made was refused, and the agent's next start
 *    revived the boundary for it. On obelisk (2026-10-18) a `from` cut of
 *    held workspace bb4af2c9 closed it so, under such a CLI, and the beat
 *    exited the agent twice;
 *  - {@link repairJudge}, when a judge started again still does not answer.
 *
 * A place's sessions are the person's own, and an archive never stops a
 * place: nothing of one is ended here. Answers what it ended and what was
 * still there after the wait, each in words.
 */
const endUsers = async (
  ref: WorkspaceRef
): Promise<{ ended: string[]; left: string[] }> => {
  if (isPlace(ref.id)) {
    return { ended: [], left: [] };
  }
  const users = async () => {
    const commands = await commandsNow();
    const procs = (await keepers.held()).filter((proc) => proc.alive);
    const clis = attachedProcs(ref.id, ref.path, procs, commands);
    const execs = executors(commands.lines, ref.id);
    return {
      clis,
      execs,
      words: [
        ...clis.map((proc) => `${proc.procId} (pid ${proc.pid})`),
        ...execs.map((pid) => `executor pid ${pid}`),
      ],
    };
  };
  const found = await users();
  if (found.words.length === 0) {
    return { ended: [], left: [] };
  }
  await Promise.all(
    found.clis.map((proc) => proc.client.signal(proc.procId, "SIGKILL"))
  );
  for (const pid of found.execs) {
    signalPid(listedPid(pid), "SIGKILL");
  }
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: polls until the keepers and the process table say they are gone, or the deadline passes
    const left = await users();
    if (left.words.length === 0 || Date.now() >= deadline) {
      return { ended: found.words, left: left.words };
    }
    await Bun.sleep(50);
  }
};

/** {@link stopWorkspaceBoundary}'s stop itself, inside its hold. */
const stopNow = async (ref: WorkspaceRef): Promise<number[]> => {
  forgetStale(ref.id);
  forgetRetiring(ref.id);
  forgetStubbed(ref.id);
  await closeToolDoor(ref.id);
  await closeGitDoor(ref.id);
  await closeGithubDoor(ref.id);
  // Its sessions' connections to the project's browser cut, and its pages
  // there closed (browser/gate.ts).
  await closeWorkspaceBrowsers(ref.id);
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
    await rm(retiringFileOf(ref.id, boundary), { force: true });
  }
  await signalHeld((procId) => isBoundaryOf(procId, ref.id));
  if (process.platform === "darwin") {
    await killMarked(ref.id);
  }
  // Everything in it ends before its judge goes: a judge gone under a CLI
  // still in the clone breaks live-workspace-judge-answers.
  const users = await endUsers(ref);
  if (users.ended.length > 0) {
    console.info(
      `[workspace] ${ref.id}: its boundary is closed for good, so what still ran in its clone ends with it: ${users.ended.join(", ")}${users.left.length > 0 ? `; ${users.left.join(", ")} still ran ${STOP_TIMEOUT_MS / 1000}s after SIGKILL, so its judge is left answering` : ""}`
    );
  }
  await rm(join(stateDir(ref.id), "boundary.json"), { force: true });
  if (users.left.length === 0) {
    await signalHeld((procId) => isJudgeOf(procId, ref.id));
  }
  liveAt.delete(ref.id);
  return inners;
};

/**
 * {@link stopWorkspaceBoundary}, then the rest of the workspace on this
 * machine but its clone: on Linux, once its sandboxes are gone, the deny
 * stand-ins in its clone go (`stand-ins.ts`). Then its state and its scratch
 * dir go, and on Linux srt's temp dirs with the sockets srt leaves there
 * (REPORT.md §5o); then the dir its sockets were in. All of it in one hold
 * against starts ({@link closedWhile}): no start runs on in a state dir it
 * takes away.
 */
export const closeBoundary = (ref: WorkspaceRef): Promise<void> =>
  closedWhile(ref.id, () => closeAll(ref));

/** {@link closeBoundary}'s close itself, inside its hold. */
const closeAll = async (ref: WorkspaceRef): Promise<void> => {
  const inners = await stopNow(ref);
  // A place, a person's own folder, has no stand-ins: an empty dir there at a
  // deny path is theirs.
  if (process.platform === "linux" && !isPlace(ref.id)) {
    if (await sandboxesGone(inners)) {
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
  }
  await rm(stateDir(ref.id), { recursive: true, force: true });
  // Its scratch dir, with whatever its commands left there, and its short
  // name on macOS when it names that dir (the link alone).
  await rm(scratchOf(ref.id), { recursive: true, force: true });
  forgetWorkspaceTmp(ref.id);
  // Its sockets' dir, once nothing listens there (`workspaceDoorDir`).
  await rm(workspaceDoorDir(ref.id), { recursive: true, force: true });
};
