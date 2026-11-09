/**
 * The runner inside a boundary that takes every command over its FIFO, the
 * host sockets a macOS runner may reach, and the srt host script a Linux
 * boundary runs.
 */

import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  publishedHash,
  runtimeExecutable,
  runtimeVersion,
  standalone,
} from "@cawco/core/runtime";
import { shellQuote } from "@cawco/core/shell-quote";
import { systemProgram } from "@cawco/core/workspace-needs";
import { rgPath } from "@vscode/ripgrep-universal";
import { colimaHome } from "../browser/media-forwarding";
import { runtimeSockets } from "../browser/runtime";
import { RELAY_STEP } from "../proxy-relay";
import { execScript } from "./exec";
import { perl } from "./hook-judge";
import { HOST_ENV } from "./protocol";
import { generationDir, READY, refusal } from "./state";

/**
 * The runner: reads request directories off its FIFO and runs each in its
 * own process group, inside the sandbox. A request carries the command, the
 * caller's directory and environment, and the PATH asked for, of which the
 * command gets what the boundary lets it search ({@link LAUNCH}); the runner leaves the exit status and
 * the directory the command ended in beside them. A `cancel <pid>` line is
 * the executor's cut-off: the runner sends TERM to that command's group, and
 * KILL 4 s later, from inside, where the pid it wrote names it (on Linux the
 * executor, outside the sandbox's pid namespace, cannot). The FIFO is opened
 * read-only (it lies where a command cannot write) and reopened after each
 * writer closes it. Linux: the runner first bridges the srt host's proxy
 * relay into the sandbox and points srt's proxy URLs at it, with no
 * credential (proxy-relay.ts `RELAY_STEP`), so every client gets out the
 * same way, a Chromium that drops a proxy URL's userinfo among them. srt's
 * own plumbing for the sandbox (its proxy, now the relay's address) is read
 * once as the runner starts and set again over each request's environment,
 * which the executor writes on the host, so no caller's environment can
 * drop it. Yarn 2 and later read no
 * `HTTPS_PROXY`, only their own `httpsProxy` and `httpProxy` settings, so
 * each install went direct and failed ("YN0001: Error
 * [ERR_SOCKET_CLOSED_BEFORE_CONNECTION]: Socket closed before the connection
 * was established", 2026-10-18): the runner gives them that proxy as
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
 *
 * THE COMMAND'S PATH: of the PATH its executor asked for (`$req/path`, the
 * request's dir its last argument), only the dirs the boundary lets a command
 * search, in their order. The launch asks the kernel, under the boundary's
 * own profile, by looking up a name in each absolute dir: a dir whose lookup
 * the boundary refuses (EPERM) goes, and every other answer keeps it, a dir
 * that does not exist (ENOENT) included. A refused dir stops a program's PATH
 * search there: libuv's on macOS, which Node's `child_process` runs
 * (`uv__spawn_resolve_and_spawn`, src/unix/process.c, after musl's
 * `execvp`), goes past ENOENT, ENOTDIR and EACCES and returns any other
 * error, `default: return err;`, so in a Mac
 * workspace whose PATH named `~/.local/share/solana/install/active_release/bin`
 * before Homebrew's, `execFileSync("git", …)` failed with `spawnSync git
 * EPERM` and the probe kit's `vite build` with it (2026-10-20). Seatbelt
 * refuses with EPERM; srt's denied dirs on Linux are empty tmpfs mounts,
 * whose lookups answer ENOENT, so none goes there. The kept PATH reaches the
 * command's shell in `CAWCO_SEARCHABLE_PATH`, which the shell takes before it
 * reads the request's environment, where nothing can replace it; never as an
 * argument, so the request's dir stays the launch's last (`agentWork`).
 */
const LAUNCH = [
  'if (opendir(my $fds, "/dev/fd")) { my @open = grep { /^[0-9]+$/ && $_ > 2 } readdir($fds); closedir($fds); POSIX::close($_) for @open; }',
  "my $req = $ARGV[$#ARGV];",
  'open(my $asked, "<", "$req/path") or die "cawco: the command has no PATH from its executor ($req/path: $!), so it did not run.";',
  "my $path = do { local $/; <$asked> };",
  "close($asked);",
  '$ENV{CAWCO_SEARCHABLE_PATH} = join(":", grep { !(m{^/} && !lstat("$_/.cawco-path-lookup") && $!{EPERM}) } split(/:/, $path, -1));',
  "setpgrp(0, 0);",
  `exec @ARGV unless $ENV{${HOST_ENV.place}};`,
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
 * leading zero is never one its launch made, and a group of 0 or -1 would
 * be its own group or every process it may signal, so it is no request. The
 * group follows the signal with no `--`, a form every shell's `kill` reads
 * (dash refuses `--`).
 *
 * A command's stdout and stderr are anonymous pipes, each copied by a `cat`
 * into its request's FIFO (`$req/out`, `$req/err`), never those FIFOs opened
 * as its own fds; so is its stdin, copied by a `cat` out of `$req/in` when
 * its executor hands it one (a claude session's prefix, {@link execScript}),
 * and `/dev/null` otherwise. That `cat` would live as long as its executor's
 * stdin stays open, which may outlast the command, so its stderr is no
 * stream of the command's: holding one, it held the executor waiting on its
 * output after the command had ended. The command's shell ends it as it
 * exits (its EXIT trap): with no place's reaper ({@link LAUNCH}) a copy whose
 * host side stayed open was left reading in the boundary, its parent gone
 * (`cat <req>/in`, 2026-10-23). A program with a confining AppArmor profile of its own
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
export const runnerText = (): string => `fifo=$1
${RELAY_STEP}
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
        kill -TERM "-$pid" 2>/dev/null
        ( sleep 4; kill -KILL "-$pid" 2>/dev/null ) &
        continue ;;
    esac
    (
      printf '%s\\n' "$sandbox" > "$req/sandbox"
      ${shellQuote(perl())} -MPOSIX -e "$launch" ${shellQuote(systemProgram("bash"))} --norc --noprofile -c 'set -- "$1" "$CAWCO_SEARCHABLE_PATH"; unset CAWCO_SEARCHABLE_PATH; if [ -p "$1/in" ]; then exec < <(exec cat "$1/in" 2>/dev/null); trap "kill $! 2>/dev/null" EXIT; fi; . "$1/env" >/dev/null 2>&1; export PATH="$2"; eval "$CAWCO_SANDBOX_ENV"; if [ -n "\${CAWCO_GIT_PARAMETERS:-}" ]; then export GIT_CONFIG_PARAMETERS="\${GIT_CONFIG_PARAMETERS:+$GIT_CONFIG_PARAMETERS }$CAWCO_GIT_PARAMETERS"; fi; cd "$(cat "$1/cwd")" || exit 1; eval "$(cat "$1/cmd")"; status=$?; pwd -P > "$1/cwd-out"; exit $status' cawco "$req" > >(exec cat > "$req/out") 2> >(exec cat > "$req/err") < /dev/null &
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
export const LAUNCHD_SOCKETS = "/private/tmp";

/**
 * Where each booted simulator's launchd keeps its sockets (its syslog,
 * testmanagerd's, webinspectord's), beside those in {@link LAUNCHD_SOCKETS}.
 * A workspace writes nothing there, so every socket in it is the host's: a
 * workspace drives a simulator through CoreSimulator's mach services
 * (`simctl`), never these, but for {@link TEST_MANAGER_SOCKET} and
 * {@link REMOTE_AUTOMATION_SOCKET}.
 */
export const SIMULATOR_SOCKETS = "/private/var/tmp";

/**
 * Where container runtimes keep their sockets: Docker's system socket (on
 * macOS its link and the file it names both resolve past `/var/run`, which
 * no policy denies there) and the user's Docker Desktop, OrbStack, Colima,
 * Rancher Desktop and Podman machine dirs, under home, denied by the policy
 * already and named so a policy's allow under home never reopens one.
 */
const containerSocketDirs = (): string[] => [
  "/var/run/docker.sock",
  "/private/var/run/docker.sock",
  join(homedir(), ".docker", "run"),
  join(homedir(), ".orbstack", "run"),
  join(homedir(), ".colima"),
  join(homedir(), ".rd"),
  join(homedir(), ".local", "share", "containers"),
  // Colima's home where `COLIMA_HOME` or `$XDG_CONFIG_HOME/colima` puts it.
  colimaHome(),
];

/**
 * Every place a container runtime's socket is, which no workspace connects
 * to: the runtimes' own dirs ({@link containerSocketDirs}) and every socket
 * the runtime registry may dial wherever it lives (browser/runtime.ts
 * `runtimeSockets`: `DOCKER_HOST`'s, the Docker context's, each runtime's
 * usual one), each as named and as the file it names. A command that
 * reached one would run a container of its own beside a project's browser,
 * or into it. `dirs` are runtime dirs, denied whole; `sockets` are the
 * endpoints, which may sit in a dir that holds other things.
 */
export const containerSockets = async (): Promise<{
  dirs: string[];
  sockets: string[];
}> => {
  const withReal = async (paths: string[]) => [
    ...new Set([
      ...paths,
      ...(await Promise.all(
        paths.map((path) => realpath(path).catch(() => path))
      )),
    ]),
  ];
  return {
    dirs: await withReal(containerSocketDirs()),
    sockets: await withReal(await runtimeSockets()),
  };
};

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
export const TEST_MANAGER_SOCKET = String.raw`^/private(/var)?/tmp/com\.apple\.launchd\.[A-Za-z0-9]+/com\.apple\.testmanagerd\.unix-domain\.socket$`;

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
export const REMOTE_AUTOMATION_SOCKET = String.raw`^/private/var/tmp/com\.apple\.launchd\.[A-Za-z0-9]+/com\.apple\.testmanagerd\.remote-automation\.uds$`;

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
export const srtTmpOf = (id: string, gen: string): string =>
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
export const runtimePlaces = (
  id: string,
  allowRead: readonly string[]
): string[] => {
  const runtime = runtimeDirOf(id);
  return allowRead.filter((path) => path.startsWith(`${runtime}/`));
};

/** The host's bwrap: the first on the agent's PATH, where workspace-needs.ts looks for it. */
export const hostBwrap = (): string => systemProgram("bwrap");

/**
 * The bwrap generation `gen` of workspace `id`'s srt runs (srt's `bwrapPath`,
 * boundary-policy.ts `readOnlyDeniesBwrap`): the host's, with each
 * read-denied dir remounted read-only. Named `bwrap`, and it execs the host's
 * in its own process, so the outer sandbox process reads as a bwrap
 * (sandboxes.ts `isBwrap`).
 */
export const bwrapLauncherOf = (id: string, gen: string): string =>
  join(generationDir(id, gen), "bwrap");

/** The ripgrep srt scans a clone with: the one this build ships. */
export const ripgrep = (): string =>
  standalone ? runtimeExecutable("srt/rg") : rgPath;

/**
 * {@link ripgrep} as a form names it: a build's by its content, as the host
 * script is ({@link readHostText}), since its path is under the build's own
 * runtime folder (core runtime.ts `runtimeDataDir`, by `runtimeVersion`) and
 * moved at every install with the same bytes behind it. Named by that path,
 * every boundary's `settings` part moved at each install with its policy
 * unchanged, and each was handed over for nothing (workspace 9eb7bb73,
 * 2026-10-27 17:57 and 18:31). The boundary that runs on keeps the folder
 * of its build, which no install takes away.
 */
export const ripgrepForm = (): string =>
  standalone ? `srt/rg ${publishedHash("srt/rg") ?? runtimeVersion}` : rgPath;

/** The srt host script, as this build runs it: its embedded bundle, or the checkout's source. */
export const hostScript = (): string =>
  standalone
    ? runtimeExecutable("srt/host.js")
    : join(import.meta.dir, "..", "boundary-host.ts");

/**
 * What the host script runs, for the form: a change to it is a change of
 * form. A build's script bundles srt, the proxy relay and the protocol; a
 * checkout's imports them, so the relay (proxy-relay.ts), the protocol
 * (protocol.ts) and srt's module that writes
 * the sandbox's mounts (each read-deny tmpfs among them, which the bwrap it
 * runs makes read-only, {@link bwrapLauncherOf}) are read beside it.
 */
export const readHostText = async (host: string): Promise<string> => {
  if (standalone) {
    return await Bun.file(host).text();
  }
  const srt = dirname(
    Bun.resolveSync("@anthropic-ai/sandbox-runtime", dirname(host))
  );
  const texts = await Promise.all(
    [
      host,
      join(dirname(host), "proxy-relay.ts"),
      join(dirname(host), "boundary", "protocol.ts"),
      join(srt, "sandbox", "linux-sandbox-utils.js"),
    ].map((file) => Bun.file(file).text())
  );
  return texts.join("\0");
};
