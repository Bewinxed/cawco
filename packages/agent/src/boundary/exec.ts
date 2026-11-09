/**
 * The executor every shell command of a workspace runs through (`exec`), its
 * environment, and the dirs a boundary makes before it starts.
 */

import { constants } from "node:fs";
import { lstat, mkdir, open as openFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { CAWCO_ENV } from "@cawco/core/cawco-env";
import {
  workspaceClaudeTmpDir,
  workspacePolicyFile,
  workspaceTmpDir,
} from "@cawco/core/paths/workspace";
import { shellQuote } from "@cawco/core/shell-quote";
import type { Pid } from "@cawco/core/signal";
import { WORKSPACE_BOUNDARY_START_TIMEOUT_MS } from "@cawco/core/workspace/controls";
import { systemProgram, trustedPath } from "@cawco/core/workspace-needs";
import { isPlace } from "@cawco/core/workspace-policy";
import {
  AGENT_SOCKET_ENV,
  hostCaEnv,
  workspaceCacheEnv,
  workspaceMaestroEnv,
  workspaceRuntimeDir,
  workspaceXdgEnv,
} from "../boundary-env";
import { gitDoorEnv, gitHelperDirOf } from "../hub-git";
import type { SessiondClient } from "../sessiond-client";
import { toolDoorOf } from "../tool-door";
import { perl } from "./hook-judge";
import { chromiumShimOf, guardedGhConfigOf } from "./shims";
import {
  fifoOf,
  generationDir,
  gitSystemConfigOf,
  gitTemplateOf,
  guardedOf,
  type Held,
  noticeOf,
  placeOf,
  scratchOf,
  stateDir,
} from "./state";

/**
 * Where the agent marks that it is replacing a workspace's boundary: the
 * agent's pid, in the state dir, which nothing inside the boundary writes.
 * The executor waits while it names a live process, then runs through the
 * new one ({@link execScript}).
 */
export const gateOf = (id: string): string => join(stateDir(id), "replacing");

export const guardOf = (id: string, gen: string): string =>
  join(generationDir(id, gen), "place-guard.pl");

/**
 * Where each executor marks the command it runs in generation `gen` of
 * workspace `id`: a file named for its pid, made before it looks at the gate,
 * removed while it waits there and as it exits ({@link execScript}), holding
 * its request's dir once it has one, written before it hands the request to
 * the runner (work.ts `agentWork`). In the generation's own dir, which nothing
 * inside the boundary writes.
 */
export const commandsOf = (id: string, gen: string): string =>
  join(generationDir(id, gen), "commands");

/** A line that names an error, as a runtime prints one it was not handed: `LinuxSandboxProfileError: …`, `error: …`. */
const ERROR_LINE = /^(?:[A-Za-z]*Error|error)\b[^:\n]{0,40}:\s/u;

/**
 * The line of a process's stderr tail that says why it died: the last that
 * names an error ({@link ERROR_LINE}). Never its last line as such: Bun ends
 * an uncaught exception's report with its own version (`Bun v1.3.… (Linux
 * x64)`), after the stack.
 */
const stderrReason = (stderr: string | undefined): string | undefined =>
  (stderr ?? "")
    .split("\n")
    .map((line) => line.trim())
    .findLast((line) => ERROR_LINE.test(line));

/**
 * Waits for a process's `line` (the boundary's state.ts `READY`); answers that
 * line's seq, or rejects with the process's own words if it dies first: what
 * it said on stdout, and the error line of the stderr tail its keeper kept
 * ({@link stderrReason}), so an exception thrown past the host's own lines
 * is named too.
 */
export const ready = (
  client: SessiondClient,
  procId: string,
  line: string,
  what: string
): Promise<number> =>
  new Promise((resolve, reject) => {
    const said: string[] = [];
    const words = (): string => (said.length ? `: ${said.join(" / ")}` : "");
    let stop = (): void => undefined;
    const finish = (outcome: Error | number): void => {
      clearTimeout(timer);
      stop();
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
    stop = client.subscribe(
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
        exit: (code, signal, _pid, stderr) => {
          const reason = stderrReason(stderr);
          if (reason && !said.includes(reason)) {
            said.push(reason);
          }
          finish(
            new Error(
              `${what} exited (${signal ?? `code ${code}`}) as it started${words()}`
            )
          );
        },
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
 * its scratch dir as `TMPDIR` (by its short name on macOS, `workspaceTmpDir`)
 * and no `CLAUDE_CODE_TMPDIR`, the empty git template, git's own system config
 * ({@link gitSystemConfigOf}), impeccable's browser (shims.ts `writeChromiumShim`),
 * the tool and git doors (hub-git.ts
 * `gitDoorEnv`), and `CAWCO_WORKSPACE`, by which a script tells that it runs
 * inside one; never a key agent's socket ({@link AGENT_SOCKET_ENV}).
 *
 * And never a forge's token, its caller's included ({@link FORGE_TOKEN_ENV}):
 * no forge CLI by its path, nor curl, nor any HTTP client has one to post
 * with, on any host. gh runs with the door's config dir
 * ({@link guardedGhConfigOf}): its requests go through the workspace's GitHub
 * door, which signs in on the host (github-door.ts). Every push across the
 * network goes through the git door (hub-git.ts `gitDoorEnv`), which pushes
 * it with the host's own credential.
 */
const commandEnv = (id: string, clone: string): string[] => [
  `unset ${AGENT_SOCKET_ENV.join(" ")}`,
  // The session's CLI temp root, read only in here (state.ts `Boundary.claudeTmp`):
  // a Claude Code a command starts takes `TMPDIR`, the scratch dir, instead.
  "unset CLAUDE_CODE_TMPDIR",
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
    IMPECCABLE_BROWSER: chromiumShimOf(id),
    CAWCO_TOOL_SOCKET: toolDoorOf(id),
    CAWCO_WORKSPACE: id,
    ...gitDoorEnv(id, clone),
  }).map(([name, value]) => `export ${name}=${shellQuote(value)}`),
];

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

/**
 * An executor whose boundary ended unasked waits for the one the agent
 * starts again (watch.ts `restartUnasked`), which writes this executor anew (a
 * new file, so a new inode at `$0`: `ls -di`, the same on Linux and macOS),
 * then runs through it.
 */
const restartWait = `  rm -f "$mark"
  self=$(ls -di "$0" 2>/dev/null)
  for _ in $(seq ${WORKSPACE_BOUNDARY_START_TIMEOUT_MS / 100}); do
    sleep 0.1
    now=$(ls -di "$0" 2>/dev/null)
    if [ -n "$now" ] && [ "$now" != "$self" ]; then PATH=$caller_path exec "$0" "$@"; fi
  done
`;

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
 * through that one (REPORT.md §5d). CawCo never writes a live copy's
 * config: it writes it only before the boundary starts (workspace.ts
 * `ownGitConfig`).
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
 * with the command's status. It finds its own tools on the dirs of the
 * agent's PATH no session can change (core workspace-needs.ts
 * `trustedPath`), written into it;
 * the command runs with its caller's PATH, behind the hub's git helper and,
 * on macOS, the toolchain shims.
 */
/** A place's guard, looking before its command (place-guard.ts `placeGuard`): a place it cannot look at runs no command. Nothing for a clone. */
const guardBefore = (id: string, held: Pick<Held, "gen" | "path">): string =>
  isPlace(id)
    ? `if ! ${shellQuote(perl())} ${shellQuote(guardOf(id, held.gen))} before "$req" ${shellQuote(held.path)} 2> "$req/guard-err"; then
  echo "cawco: this place's guard could not look at it before the command, so the command did not run: $(cat "$req/guard-err")" >&2
  rm -rf "$req"
  exit 126
fi
`
    : "";

/** A place's guard, judging what its command did (place-guard.ts `placeGuard`): what it moved fails the command, and so does a guard that could not look. Nothing for a clone. */
const guardAfter = (
  id: string,
  held: Pick<Held, "gen" | "path" | "scratch">
): string =>
  isPlace(id)
    ? `${shellQuote(perl())} ${shellQuote(guardOf(id, held.gen))} after "$req" ${shellQuote(held.path)} ${shellQuote(held.scratch)} ${shellQuote(workspacePolicyFile(id))} "$HOME" >&2
guarded=$?
if [ "$guarded" = 3 ]; then status=1; elif [ "$guarded" != 0 ]; then echo "cawco: this place's guard could not check what the command changed, so the command is taken as failed." >&2; status=1; fi
`
    : "";

/** `text` with every character a POSIX extended regular expression reads as an operator escaped. */
const ereLiteral = (text: string): string =>
  text.replace(/[.[\]()*+?{}|^$\\]/gu, "\\$&");

/**
 * The end Claude Code puts on every Bash and Monitor command it hands its
 * shell prefix (hook-judge.ts `claudePrefixScript`), as an extended regular
 * expression over the whole command, its group 1 the file: ` && pwd -P >|
 * <CLAUDE_CODE_TMPDIR>/claude-<id>-cwd`, the file the CLI reads the
 * session's next working directory from once the command succeeded. The CLI
 * quotes the file only when it needs it (2.1.302: `&& pwd -P >|
 * /…/claude-6a33-cwd`), so both forms are taken; its id is four hex digits,
 * a Bash call's with a tag after it (`${Yt}-${Dn}`). The temp root is the
 * workspace's own (state.ts `Boundary.claudeTmp`), read only inside, so the
 * executor writes the file on the host.
 */
const claudeCwdTail = (id: string): string => {
  const file = `${ereLiteral(workspaceClaudeTmpDir(id))}/claude-[0-9a-f]{4}(-[0-9A-Za-z_]+)?-cwd`;
  return ` && pwd -P >\\| ('${file}'|${file})$`;
};

/**
 * The executor's text for the boundary whose host is `held.pid`, which it
 * signals (`kill -USR1`) and looks for (`kill -0`). Undefined for the form's
 * own text (plan.ts `planFor`), which is hashed and never run, and names no
 * process.
 *
 * `--claude` is a claude session's shell prefix's (hook-judge.ts `claudePrefixScript`): COMMAND is whatever its CLI runs through it, a Bash
 * or Monitor call, a shell-form hook, a stdio MCP server's start, and all of
 * it runs inside. The executor's stdin reaches the command (`$req/in`, a
 * FIFO the command reads through a pipe, as its output leaves through one:
 * runner.ts `runnerText`), since a hook reads its call there and a server its
 * requests. A command that ends in the CLI's working-directory tail
 * ({@link claudeCwdTail}) runs without it, shows the workspace's notice
 * first, as `--session` does, and on status 0 the directory it ended in is
 * written to the CLI's file on the host, as the tail's `&&` would. One with
 * no such tail runs as it is: the tail's write fails inside, never outside.
 *
 * `--session --cwd-out FILE` is the judge's rewrite of a shell call from a
 * claude CLI launched before the prefix (`boundary-judge.ts`
 * `throughExecutor`), the form that build's judge wrote too: on status 0 the
 * directory the command ended in is written to FILE on the host, and the
 * rewrite's own shell `cd`s there. So a call an earlier build's judge
 * answered just before an update runs on this executor, and one this build's
 * judge answered runs on the earlier executor until it is written again.
 */
export const execScript = (
  id: string,
  held: Pick<Held, "exec" | "gen" | "path" | "scratch"> & {
    readonly pid: Pid | undefined;
  }
): string => {
  const linux = process.platform === "linux";
  const pid = held.pid === undefined ? "PID" : String(held.pid);
  // The workspace's read-only bin first: the hub's git helpers (`hub-git.ts`)
  // and, on macOS, the toolchain shims, one folder.
  const helpers = `${gitHelperDirOf(id)}:`;
  // The PATH asked for: the launch keeps of it what the boundary lets a
  // command search (runner.ts `LAUNCH`).
  const path = `printf '%s' ${shellQuote(helpers)}"$caller_path" > "$req/path"`;
  return `#!${systemProgram("bash")}
# CawCo workspace ${id}: runs one shell command inside the workspace's boundary.
# exec [--session [--cwd-out FILE] | --claude] COMMAND — a session's command
# (--session) shows the workspace's notice first, and FILE gets the directory
# it ended in; --claude is a claude session's shell prefix's.
caller_path=$PATH
PATH=${shellQuote(trustedPath())}
export PATH
# This command is this generation's from here until it exits: the agent keeps
# the generation running while the mark names a live executor.
marks=${shellQuote(commandsOf(id, held.gen))}
mark="$marks/$$"
mkdir -p "$marks" 2>/dev/null && : > "$mark"
# What copies this executor's stdin to the command, once it runs.
feed=
trap 'rm -f "$mark"; [ -z "$feed" ] || kill "$feed" 2>/dev/null' EXIT
# While the agent replaces the boundary, wait, then run through the new one.
# Waiting runs nothing in this generation, so the mark goes meanwhile: the
# agent's handover holds the gate up for the marked commands to end, and one
# waiting here is none of them.
gate=${shellQuote(gateOf(id))}
if [ -e "$gate" ]; then
  rm -f "$mark"
  while [ -e "$gate" ] && kill -0 "$(cat "$gate" 2>/dev/null)" 2>/dev/null; do sleep 0.1; done
  [ -e "$gate" ] || PATH=$caller_path exec "$0" "$@"
  : > "$mark"
fi
fifo=${shellQuote(fifoOf(id, held.gen))}
if ! [ -p "$fifo" ] || ! kill -0 ${pid} 2>/dev/null; then
${restartWait}  echo ${shellQuote(stoppedLine(id))} >&2
  exit 126
fi
${linux ? mountCheck(id, held.gen, pid) : ""}
session=
claude=
if [ "$1" = --session ]; then session=1; shift; elif [ "$1" = --claude ]; then claude=1; shift; fi
# Where the CLI reads a Bash or Monitor call's next working directory from:
# the file the judge's rewrite names, or the CLI's own tail.
cwd_file=
if [ -n "$session" ] && [ "$1" = --cwd-out ]; then cwd_file=$2; shift 2; fi
command=$1
if [ -n "$claude" ]; then
  tail=${shellQuote(claudeCwdTail(id))}
  if [[ $command =~ $tail ]]; then
    session=1
    cwd_file=\${BASH_REMATCH[1]}
    case $cwd_file in \\'*) cwd_file=\${cwd_file:1:\${#cwd_file}-2} ;; esac
    command=\${command:0:\${#command}-\${#BASH_REMATCH[0]}}
  fi
fi
# A session's command shows what CawCo did to the work meanwhile, once.
notice=${shellQuote(noticeOf(id))}
if [ -n "$session" ] && [ -s "$notice" ] && mv "$notice" "$notice.$$" 2>/dev/null; then
  cat "$notice.$$" >&2
  rm -f "$notice.$$"
fi
req=$(mktemp -d ${shellQuote(held.scratch)}/.run.XXXXXX) || exit 126
# The mark names the request before the runner hears of it: the agent tells
# its own commands' processes inside by it.
{ printf '%s\\n' "$req" > "$mark"; } 2>/dev/null
printf '%s' "$command" > "$req/cmd"
pwd -P > "$req/cwd"
# The caller's environment but its keeper's tree mark: what the command
# leaves running is the boundary's, under the boundary's own mark, never
# swept as the calling session's when that session's process ends.
{
  (unset ${CAWCO_ENV.sessiondTree}; export -p)
${commandEnv(id, held.path)
  .map((line) => `  echo ${shellQuote(line)}`)
  .join("\n")}
} > "$req/env"
${path}
mkfifo "$req/out" "$req/err"
[ -z "$claude" ] || mkfifo "$req/in"
# Cut off: the runner ends the command's group, in the sandbox's own pid
# space, where the pid it wrote means that group (the runner's "cancel").
trap 'p=$(cat "$req/pid" 2>/dev/null); [ -n "$p" ] && printf "cancel %s\\n" "$p" > "$fifo"; rm -rf "$req"; exit 143' TERM INT HUP
${guardBefore(id, held)}printf '%s\\n' "$req" > "$fifo"
# This executor's stdin, to the command: an asynchronous command's own is
# /dev/null unless it names another, so it takes it on fd 3. A closed one is
# an empty one, so the command still reads its end. Copied by perl, a read at
# a time: the CLI's stdin is a socket, which uutils' cat 0.8 held until it
# closed, so a server never saw its first request.
if [ -n "$claude" ]; then
  { exec 3<&0; } 2>/dev/null || exec 3</dev/null
  ${shellQuote(perl())} -e 'while (sysread(STDIN, my $read, 65536)) { syswrite(STDOUT, $read) or last }' <&3 > "$req/in" 3<&- & feed=$!
  exec 3<&-
fi
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
${guardAfter(id, held)}if [ -n "$cwd_file" ] && [ "$status" = 0 ] && [ -s "$req/cwd-out" ]; then cat "$req/cwd-out" > "$cwd_file"; fi
rm -rf "$req"
exit "$status"
`;
};

/**
 * The runtime dir every command runs with (agent boundary-env.ts `workspaceRuntimeDir`),
 * mode 0700 whatever the umask: pnpm takes no other for its store locks, and
 * one other users can write to it ignores. Every workspace writes the cache,
 * so it is opened without following a link (a link a workspace planted
 * there is never changed through, and the log says so) and changed through
 * that handle.
 */
export const makeRuntimeDir = async (id: string): Promise<void> => {
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
export const ownInScratch = async (
  id: string,
  path: string
): Promise<boolean> => {
  let at = scratchOf(id);
  for (const part of relative(at, path).split("/")) {
    at = join(at, part);
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
