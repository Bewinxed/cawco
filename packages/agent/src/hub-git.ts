/**
 * The hub's git remote from places that cannot reach the hub themselves.
 *
 * A workspace's boundary dials none of the owner's machines, the hub among
 * them (`DENIED_RESOLVED_ADDRESSES`, core boundary-reach.ts), so a clone whose
 * `origin` is the hub (Projects spec §5.1: "A project with no outside remote
 * gets the hub as its remote") could neither fetch nor push from inside it.
 * Its git traffic runs on the host instead, as git's own remote helper:
 *
 * - Inside the boundary, every command's git config rewrites the hub's
 *   `/git/` URLs to `cawco::<url>` (`url.<base>.insteadOf`, git-config(1)),
 *   so git runs the remote helper `git-remote-cawco` for them
 *   (gitremote-helpers(7): "<transport>::<address> … git-remote-<transport>
 *   is invoked"). That helper ({@link helperScript}) only pipes its stdin and
 *   stdout through the workspace's git door, a unix socket in its door dir
 *   (`workspaceDoorDir`).
 * - On the host the agent takes the door's connection and runs git's own
 *   HTTP helper (`git remote-http <remote> <url>`) in the clone with this
 *   machine's credential, env-only (git/hub-remote.ts {@link hubGitEnv}), after the
 *   clone's own config passed `repositoryConfigProblem` and only for the
 *   clone's own `origin`. Before a push reaches it, the push's large files
 *   go to the hub's LFS ({@link pushOriginLfs}); after a fetch, the large
 *   files of the refs it moved come from there ({@link fetchLfs}). Only a
 *   command whose refs mark large files asks the hub where they live
 *   ({@link LfsSide}): every other one answers whatever state the hub is
 *   in. Landing's fetch and push, `workspaceAt`'s fetch and a session's own
 *   `git fetch`/`git push` all run inside the boundary, so all take this
 *   one path.
 *
 * A workspace holds no credential of any host (boundary/: the home dir's
 * stores are hidden, no key agent is reached, no command gets a forge's
 * token), so every remote across the network is
 * reached the same way, whatever its host or transport: the clone's own
 * origin (`https://`, `ssh://`, scp-like) is rewritten to this helper too
 * ({@link gitDoorEnv}), and the door, which speaks git's helper protocol
 * itself for such a remote, runs the host's own git against it with the
 * host's own credential ({@link hostGitEnv}). Every push across the
 * network comes here too ({@link DOOR_PUSH}), on any host, and
 * goes on with the host's own credential. The door serves the workspace's
 * own clone alone, by the repository its helper names. A workspace's gh
 * reaches GitHub's API through its GitHub door (github-door.ts) the same
 * way: on the host, signed in there.
 *
 * A checkout outside any workspace whose `origin` is the hub (one a project
 * got the hub as its remote in, or one a move made) pulls and pushes from a
 * terminal through `cawco git-credential`, which its own config names for
 * the hub's URLs (git-credential.ts `useHubCredentialHelper`); outside a session that
 * helper asks the agent's credential socket ({@link serveHubCredential}).
 */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { chmod, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import { listenOrEnd } from "@cawco/core/listeners";
import { hubCredentialSocket } from "@cawco/core/paths/hub";
import {
  workspaceDoorDir,
  workspaceReadOnlyDir,
} from "@cawco/core/paths/workspace";
import {
  GIT_LOCALE,
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  safeGitArgv,
} from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { shellQuote } from "@cawco/core/shell-quote";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import { writeStateFile } from "@cawco/core/state-file";
import { unhandled } from "@cawco/core/unhandled";
import { gitDoorWords } from "@cawco/core/words/git-door";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { systemProgram } from "@cawco/core/workspace-needs";
import { hubGitLogin, withoutCredential } from "./git/hub-credential";
import { hubGitEnv, isHubRemote } from "./git/hub-remote";
import {
  type DeclaredLfs,
  declaredPins,
  LFS_FILTERS,
  lfsEndpointOf,
  lfsPins,
  originEndpoint,
  urlOrigin,
} from "./git/lfs";
import { hubOrigins } from "./git-credential";
import { hostGh } from "./host-gh";
import {
  declaredLfs,
  hostSigns,
  noteRefused,
  undeclaredEndpoint,
  workspaceProjectOf,
} from "./host-lfs";
import {
  copyFileOf,
  copyPathSync,
  inCopySync,
  overlaySync,
  viewRunning,
} from "./layer";
import { noRepositoryAt } from "./stand-ins";
import { prepareDoor, socketPlace } from "./tool-door";
import { cloneHolding } from "./workspace-records";

/** A workspace's git door. */
export const gitDoorOf = (id: string): string =>
  join(workspaceDoorDir(id), "git.sock");

/**
 * A workspace's read-only bin, first on its commands' PATH: its
 * `git-remote-cawco` and `cawco-ssh`, the `git` that judges a move of the
 * worktree (worktree-guard.ts `gitShim`), `cawco-chromium` (boundary/shims.ts
 * `writeChromiumShim`), and on macOS the boundary's
 * toolchain shims (boundary/shims.ts `writeShims`).
 */
export const gitHelperDirOf = (id: string): string =>
  join(workspaceReadOnlyDir(id), "bin");

/**
 * `git-remote-cawco <remote> <url>`, inside the boundary: sends the URL on
 * the door, reads the door's word (`ok`, or why not), then copies stdin to
 * the door (half-closing it when git closes stdin) and the door's frames to
 * stdout ({@link doorChannel}: a length, then that many bytes; an empty one
 * is the door's keepalive; one whose length has {@link SAID_BIT} set is the
 * door's words on why it stopped, printed to git's stderr before the helper
 * ends git's command), and ends when the host closes the door. Every
 * read of the door waits at most {@link HELPER_SILENCE_S}: a door that says
 * nothing for that long, not even a keepalive, ends git's command with a
 * refusal on its stderr, so no push or fetch through the door waits forever.
 * Perl, as the boundary's runner already uses: no other tool is assumed
 * inside.
 */
const helperScript = (): string => `#!${systemProgram("perl")}
# CawCo: git's remote helper for the hub, through the workspace's git door.
use strict;
use warnings;
use Cwd qw(abs_path);
use IO::Select;
use IO::Socket::UNIX;
use Socket qw(SOCK_STREAM);
my $silence = ${HELPER_SILENCE_S};
my $door = $ENV{CAWCO_GIT_SOCKET} // '';
my $url = $ARGV[1] // '';
# The repository git runs this helper for (gitremote-helpers(7): git hands
# its helper GIT_DIR): the door serves the workspace's clone alone.
my $gitdir = abs_path($ENV{GIT_DIR} // '.git') // '';
my $s = IO::Socket::UNIX->new(Type => SOCK_STREAM, Peer => $door)
  or die "cawco: the workspace's git door ($door) is not open: $!\\n";
my $heard = IO::Select->new($s);
my $writer = 0;
sub put { my ($fh, $buf) = @_; my $at = 0; while ($at < length $buf) { my $n = syswrite($fh, $buf, length($buf) - $at, $at); die "cawco: git door: $!\\n" unless defined $n; $at += $n; } }
# Up to $want bytes from the door, '' at its end; a door silent for $silence s ends the command.
sub take {
  my ($want) = @_;
  unless ($heard->can_read($silence)) {
    print STDERR "cawco: git did not finish through the workspace's git door: the door said nothing for $silence s, so this command was stopped. CawCo's agent on this machine is not answering; run it again, and restart the agent if it happens again.\\n";
    kill 'TERM', $writer if $writer;
    exit 128;
  }
  my $n = sysread($s, my $buf, $want);
  die "cawco: git door: $!\\n" unless defined $n;
  return $buf;
}
# Exactly $want bytes, or undef when the door ended before the first.
sub exactly {
  my ($want) = @_;
  my $got = '';
  while (length $got < $want) {
    my $more = take($want - length $got);
    if ($more eq '') { return undef if $got eq ''; die "cawco: the workspace's git door ended mid-answer\\n"; }
    $got .= $more;
  }
  return $got;
}
put($s, "$url\\t$gitdir\\n");
# The door's word first: "ok", or why it does not take this.
my $said = '';
while (1) { my $c = take(1); die "cawco: the workspace's git door closed without a word\\n" if $c eq ''; last if $c eq "\\n"; $said .= $c; }
if ($said ne 'ok') { print STDERR "$said\\n"; exit 128; }
$writer = fork() // die "cawco: fork: $!\\n";
if ($writer == 0) {
  while (1) { my $n = sysread(STDIN, my $buf, 65536); last unless $n; put($s, $buf); }
  shutdown($s, 1);
  exit 0;
}
while (1) {
  my $head = exactly(${FRAME_HEAD});
  last unless defined $head;
  my $length = unpack('N', $head);
  next if $length == 0;
  my $toStderr = $length & ${SAID_BIT};
  $length &= ~${SAID_BIT} & 0xffffffff;
  my $body = exactly($length);
  die "cawco: the workspace's git door ended mid-answer\\n" unless defined $body;
  if ($toStderr) { print STDERR $body; kill 'TERM', $writer; waitpid($writer, 0); exit 128; }
  put(\\*STDOUT, $body);
}
kill 'TERM', $writer;
waitpid($writer, 0);
exit 0;
`;

/**
 * Why git does not run in the workspace's clone, when its `.git` is no
 * repository (stand-ins.ts `noRepositoryAt`: a clone deleted by hand). Every
 * git the door runs names that `.git` as its `GIT_DIR`, and git-lfs writes
 * its format marker into the config of the dir it is given, so a run in a
 * deleted clone would leave a file there that nobody's work made.
 */
const noClone = async (ref: WorkspaceRef): Promise<string | undefined> =>
  (await noRepositoryAt(copyPathSync(ref.id, ref.path)))
    ? `${ref.path} is not a git clone any more: its .git is no repository`
    : undefined;

const LINE_END = 10;

/** A command after which the helper protocol carries git's own packets, not lines. */
const CONNECT = /^(stateless-)?connect /u;
/** git's ask for a dry run of the push that follows (gitremote-helpers(7), "option dry-run"). */
const DRY_RUN = "option dry-run true";
/** `option dry-run true|false`, either way. */
const DRY_RUN_OPTION = /^option dry-run (true|false)$/u;
/**
 * git's lease for the push that follows (gitremote-helpers(7), "option cas
 * {name}:{value}": "Request the helper to perform a force-with-lease push"),
 * the value C-quoted when it needs quoting (transport-helper.c
 * `set_helper_option`).
 */
const CAS_OPTION = /^option cas (.+)$/u;
const FORCED = /^\+/u;

/** A push command's refspec (`push [+]<src>:<dst>`), its source and destination. */
const refspecOf = (line: string): { dst: string; src: string } => {
  const [src = "", dst = ""] = line
    .slice("push ".length)
    .replace(FORCED, "")
    .split(":");
  return { src, dst };
};

/** `env` with `pairs` after the git config it already carries (`GIT_CONFIG_COUNT`, git-config(1) "ENVIRONMENT"). */
const withGitConfig = (
  env: Record<string, string>,
  pairs: readonly [string, string][]
): Record<string, string> => {
  const first = Number.parseInt(env.GIT_CONFIG_COUNT, 10) || 0;
  return {
    ...env,
    GIT_CONFIG_COUNT: String(first + pairs.length),
    ...Object.fromEntries(
      pairs.flatMap(([name, value], index) => [
        [`GIT_CONFIG_KEY_${first + index}`, name],
        [`GIT_CONFIG_VALUE_${first + index}`, value],
      ])
    ),
  };
};

const TRAILING_SLASHES = /\/+$/u;

/**
 * git-lfs's config for a push to the repository at `url` that is not the
 * clone's origin: that repository's own LFS, from its URL alone. Over
 * http(s), the endpoint git-lfs guesses from a remote ("By default, Git LFS
 * will append `.git/info/lfs` to the end of a Git remote url",
 * docs/api/server-discovery.md), its access `basic` so no 401 has git-lfs
 * write it into the clone's config ({@link DOOR_LFS}); over ssh, the URL
 * itself, for which git-lfs asks that server over ssh (`git-lfs-authenticate`
 * or its pure SSH protocol). Given as `lfs.url` and `lfs.pushurl`, which
 * git-lfs reads before any other source of an endpoint
 * (lfsapi/endpoint_finder.go `getEndpoint`) and which command-level config
 * holds over a committed `.lfsconfig` ("Settings from Git configuration
 * files override the `.lfsconfig` file", git-lfs-config(5)): a clone's
 * `.lfsconfig` never sends the host's credential, or the objects, anywhere
 * else.
 */
const lfsConfigFor = (url: string): [string, string][] => {
  let web = false;
  if (SCHEME_URL.test(url)) {
    try {
      const { protocol } = new URL(url);
      web = protocol === "https:" || protocol === "http:";
    } catch {
      web = false;
    }
  }
  if (!web) {
    return [
      ["lfs.url", url],
      ["lfs.pushurl", url],
    ];
  }
  const bare = url.replace(TRAILING_SLASHES, "");
  const endpoint = bare.endsWith(".git")
    ? `${bare}/info/lfs`
    : `${bare}.git/info/lfs`;
  return [
    ["lfs.url", endpoint],
    ["lfs.pushurl", endpoint],
    [`lfs.${endpoint}.access`, "basic"],
  ];
};

/**
 * The large files a push's sources reach, sent before the push itself:
 * `git lfs push <remote> <src>…` in the clone, on the host. To the clone's
 * own origin (`to` none) with the credential `env` carries, to the hub's
 * LFS for a hub origin (Projects spec §5.1: "Large files go through Git LFS:
 * the hub is the LFS server for its remotes"); to another repository at
 * `to`, its own LFS ({@link lfsConfigFor}) with the host's credential for
 * that host. Inside the boundary git-lfs reaches no server, and CawCo's git
 * runs no pre-push hook, so a push would otherwise land pointers whose
 * objects stay behind. Answers why the files did not go, or nothing.
 */
const pushLfs = async (
  ref: WorkspaceRef,
  sources: string[],
  env: Record<string, string>,
  to?: string
): Promise<string | undefined> => {
  if (sources.length === 0 || !Bun.which("git-lfs")) {
    return;
  }
  const gone = await noClone(ref);
  if (gone) {
    return gone;
  }
  const { code, out, err } = await runOnHost(
    ref,
    ["lfs", "push", to ?? "origin", ...sources],
    to ? withGitConfig(env, lfsConfigFor(to)) : env
  );
  if (code === 0) {
    return;
  }
  const said = lastSaid(`${out}\n${err}`, `git lfs push exited ${code}`);
  console.warn(
    `[hub-git] ${ref.id}: git lfs push ${to ? withoutCredential(to) : "origin"} of ${sources.join(" ")} failed: ${said}`
  );
  return `the large files did not reach ${to ? `${withoutCredential(to)}'s LFS` : "the origin's LFS"}: ${said}`;
};

/**
 * {@link pushLfs} to the clone's own origin, for a push whose `sources` mark
 * large files ({@link marksLfs}, against `origin`'s remote-tracking refs),
 * in git-lfs's environment for that origin ({@link LfsSide}); a push that
 * marks none sends nothing and asks the hub nothing. When the hub does not
 * say where the project's large files live (host-lfs.ts `declaredLfs`,
 * within its 15 s), the push is refused in its words: pointers never land
 * without their objects. Answers why the files did not go, or nothing.
 */
const pushOriginLfs = async (
  ref: WorkspaceRef,
  sources: string[],
  side: LfsSide
): Promise<string | undefined> => {
  if (
    sources.length === 0 ||
    !Bun.which("git-lfs") ||
    !marksLfs(ref, sources, "origin")
  ) {
    return;
  }
  const made = await side().then(
    (value) => ({ value }),
    (error: unknown) => ({
      why: error instanceof Error ? error.message : String(error),
    })
  );
  if ("why" in made) {
    console.warn(`[hub-git] ${ref.id}: ${made.why}`);
    return `the large files did not go: ${made.why}`;
  }
  return pushLfs(ref, sources, made.value.env);
};

/**
 * How long a git or git-lfs the door runs on the host may say nothing
 * before it is stopped. Our choice: each runs with its progress forced on
 * ({@link runOnHost}), so a live transfer speaks every few hundred ms
 * (git-lfs throttles its meter to one line per 200 ms, tasklog/log.go
 * `DefaultLoggingThrottle`), and a stalled connection ends itself sooner
 * (git-lfs's `lfs.activitytimeout`: "the maximum time, in seconds, that the
 * HTTP client will wait for the next tcp read or write … Default: 30
 * seconds", git-lfs-config(5)). What stays silent past this is stopped
 * whatever it waits on. A credential helper's prompt with no one at the
 * screen is the one wait seen; the door now asks the helpers once, before it
 * answers git, under a limit of their own ({@link withHostLogin}), so a run
 * here asks none. On macOS, Apple's `git-credential-osxkeychain` first takes an
 * exclusive lock on its own binary (`open(argv[0], O_EXLOCK)`), so one
 * waiting for a keychain prompt holds every other keychain lookup on the
 * machine until it ends: on 2026-10-24 the git-door probe's push of an LFS
 * file waited 74 minutes on such a `store`.
 */
const HOST_RUN_SILENCE_MS = 120_000;

/** The most of a host run's stderr kept: its progress repeats, its last words are what it said. */
const HOST_RUN_ERR_KEPT = 64_000;

/** A host run's whole stdout, the tail of its stderr, and its exit (128 when it was stopped or never ran); `silent` when its silence stopped it. */
interface HostRun {
  readonly code: number;
  readonly err: string;
  readonly out: string;
  readonly silent: boolean;
}

/** What a host run is given beyond its arguments: its stdin, and how long it may say nothing ({@link HOST_RUN_SILENCE_MS} when unsaid). */
interface HostRunOptions {
  readonly input?: string;
  readonly silenceMs?: number;
}

/**
 * One git (or `git lfs`) run on the host in `ref`'s clone, its progress
 * forced on (`--progress` for git's push and fetch, which "forces progress
 * status even if the standard error stream is not directed to a terminal",
 * git-push(1); `GIT_LFS_FORCE_PROGRESS`, which forces git-lfs's "even when
 * standard output stream is not a terminal", git-lfs-config(5)), in a
 * process group of its own. When it says nothing for
 * {@link HOST_RUN_SILENCE_MS}, the whole group is stopped (a credential
 * helper it waits on included, and with it any lock that helper holds), and
 * its last words say how long it was silent. The door's own runs.
 */
const runOnHost = (
  ref: WorkspaceRef,
  args: readonly string[],
  env: Record<string, string>,
  { input, silenceMs = HOST_RUN_SILENCE_MS }: HostRunOptions = {}
): Promise<HostRun> =>
  new Promise((resolve) => {
    const run = inCopySync(ref.id, ref.path, safeGitArgv([...args]));
    const [file = "git", ...rest] = run.argv;
    const child = spawn(file, rest, {
      cwd: run.cwd,
      env: {
        ...env,
        ...SAFE_GIT_ENV,
        GIT_DIR: join(ref.path, ".git"),
        GIT_LFS_FORCE_PROGRESS: "1",
      },
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
    let out = "";
    let err = "";
    let silent = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      silent = true;
      const leader = spawnedPid(child);
      if (leader !== undefined && child.exitCode === null) {
        try {
          signalGroup(leader, "SIGKILL");
        } catch (error) {
          console.warn(
            `[hub-git] ${ref.id}: git ${args[0]} said nothing and could not be stopped: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    };
    const heard = () => {
      clearTimeout(timer);
      timer = setTimeout(stop, silenceMs);
    };
    heard();
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      heard();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err = (err + chunk.toString()).slice(-HOST_RUN_ERR_KEPT);
      heard();
    });
    child.on("error", (error) => {
      err += `\n${error.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const what = `git ${args.slice(0, args[0] === "lfs" ? 2 : 1).join(" ")}`;
      resolve({
        code: silent ? 128 : (code ?? 128),
        out,
        err: silent
          ? `${err}\ncawco: ${what} said nothing on stdout or stderr for ${silenceMs / 1000} s, so it was stopped, with every process it had started.`
          : err,
        silent,
      });
    });
  });

/**
 * How long the door waits on the host's credential helpers for a remote's
 * login ({@link withHostLogin}) before it refuses. Our choice: a helper that
 * has the login answers in well under a second (gh, a store, an unlocked
 * keychain); one still silent after this waits on a person (a keychain
 * prompt, an askpass window) nobody may be there to answer.
 */
const CREDENTIAL_LIMIT_MS = 15_000;

/** One `key=value` line of `git credential fill`'s answer (git-credential(1), "INPUT/OUTPUT FORMAT"). */
const CREDENTIAL_LINE = /^([\w[\]]+)=(.*)$/u;

/**
 * The `Authorization` value a `git credential fill` answer gives: its
 * pre-encoded `authtype` and `credential` when a helper gave those, else
 * `username` and `password` as Basic; none when it gave neither.
 */
const authorizationOf = (answer: string): string | undefined => {
  const said = new Map<string, string>();
  for (const line of answer.split("\n")) {
    const read = CREDENTIAL_LINE.exec(line);
    if (read?.[1] && read[2] !== undefined) {
      said.set(read[1], read[2]);
    }
  }
  const authtype = said.get("authtype");
  const credential = said.get("credential");
  if (authtype && credential) {
    return `${authtype} ${credential}`;
  }
  const username = said.get("username");
  const password = said.get("password");
  return username !== undefined && password !== undefined
    ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
    : undefined;
};

/**
 * `env` for git and git-lfs against the http(s) remote at `url`, carrying
 * the host's login for it, asked of the host's credential helpers once,
 * before the door answers: `git credential fill` for the URL, with its own
 * limit ({@link CREDENTIAL_LIMIT_MS}). A helper silent past it is stopped
 * with all it started, and the door refuses at once in words naming the
 * credential helper and the host, so no push or fetch waits out the run's
 * own silence limit ({@link HOST_RUN_SILENCE_MS}) on a prompt nobody sees
 * (on 2026-10-24 a keychain `store` held a push 74 minutes).
 *
 * The login goes to git as an `Authorization` header for the repository's
 * own URL (`http.<url>.extraHeader`, matched on whole path segments), env-only
 * as the hub's is (git/hub-remote.ts `hubGitEnv`); git-lfs sends it too for the
 * repository's own LFS (`<url>/info/lfs`, lfshttp/client.go `ExtraHeadersFor`).
 * A request carrying it asks no helper: git fills a credential only after a
 * 401, and git-lfs takes an existing `Authorization` as ready ("Existing
 * Authorization … tells LFS that the request is ready", lfsapi/auth.go
 * `getCreds`); so neither later asks a helper to `store` it, and no store
 * can hang either. When no helper has a login (git's fill ends non-zero:
 * `GIT_TERMINAL_PROMPT=0`), git runs as before, without one. A URL that is
 * not http(s) (ssh, scp-like) signs in by key, not by helper: as it is.
 */
const withHostLogin = async (
  ref: WorkspaceRef,
  url: string,
  env: Record<string, string>
): Promise<Record<string, string>> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return env;
  }
  if (!(parsed.protocol === "https:" || parsed.protocol === "http:")) {
    return env;
  }
  if (parsed.password) {
    return env;
  }
  // The helpers alone: an askpass (`GIT_ASKPASS`, `core.askPass`,
  // `SSH_ASKPASS`) would open a window for every remote that needs no login;
  // set and empty, git passes all three over (prompt.c `git_prompt`), and
  // with `GIT_TERMINAL_PROMPT=0` a fill no helper answers ends at once.
  const asked = await runOnHost(
    ref,
    ["credential", "fill"],
    { ...env, GIT_ASKPASS: "" },
    {
      input: `url=${url}\n\n`,
      silenceMs: CREDENTIAL_LIMIT_MS,
    }
  );
  if (asked.silent) {
    throw new Error(
      gitDoorWords.credentialSilent(
        withoutCredential(url),
        parsed.host,
        CREDENTIAL_LIMIT_MS / 1000
      )
    );
  }
  const authorization =
    asked.code === 0 ? authorizationOf(asked.out) : undefined;
  return authorization
    ? withGitConfig(env, [
        [`http.${url}.extraHeader`, `Authorization: ${authorization}`],
      ])
    : env;
};

/** The copy's `origin` remote-tracking refs, each with the commit it is at. */
const remoteRefs = (ref: WorkspaceRef): Map<string, string> => {
  const run = inCopySync(
    ref.id,
    ref.path,
    safeGitArgv([
      "for-each-ref",
      "--format=%(objectname) %(refname)",
      "refs/remotes/origin/",
    ])
  );
  const listed = Bun.spawnSync(run.argv, {
    cwd: run.cwd,
    env: { ...process.env, ...SAFE_GIT_ENV },
  });
  return new Map(
    listed.stdout
      .toString()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha = "", name = ""] = line.split(" ");
        return [name, sha] as const;
      })
  );
};

/** The refs a fetch made or moved: in `after`, at another commit than in `before`. */
const movedRefs = (
  before: Map<string, string>,
  after: Map<string, string>
): string[] =>
  [...after]
    .filter(
      ([name, sha]) =>
        before.get(name) !== sha && name !== "refs/remotes/origin/HEAD"
    )
    .map(([name]) => name);

/**
 * Where a workspace's git-lfs may reach for its clone's origin (host-lfs.ts):
 * the project's declared endpoint, when it declared one, else the origin's
 * own; and the project, whose conversation is told of any other a `.lfsconfig`
 * names.
 */
interface DoorLfs {
  allowed: (string | undefined)[];
  declared: DeclaredLfs | undefined;
  projectId: string | undefined;
}

/** {@link DoorLfs} for `ref`'s clone, whose origin is `origin`, as its project declared it on the hub. */
const doorLfsOf = async (
  ref: WorkspaceRef,
  origin: string
): Promise<DoorLfs> => {
  const projectId = await workspaceProjectOf(ref.id);
  const declared = await declaredLfs(projectId);
  return {
    allowed: [originEndpoint(origin), declared?.endpoint],
    declared,
    projectId,
  };
};

/**
 * One door connection's git-lfs side: {@link DoorLfs} and the environment
 * git-lfs runs in for the clone's origin, pinned to its endpoint. Made on
 * first call and kept for the connection, and called only once a command's
 * refs mark LFS ({@link marksLfs}): the project's declared endpoint is the
 * hub's answer (host-lfs.ts `declaredLfs`, bounded by its `HUB_MS`, 15 s),
 * so a command that moves no large file never waits on the hub. Before
 * 2026-11-04 the door asked it before answering any command, and every git
 * in every workspace stopped while the hub was wedged.
 */
type LfsSide = () => Promise<{ env: Record<string, string>; lfs: DoorLfs }>;

const lfsSideOf = (
  ref: WorkspaceRef,
  envFor: (declared: DeclaredLfs | undefined) => Promise<Record<string, string>>
): LfsSide => {
  let made: ReturnType<LfsSide> | undefined;
  return () => {
    made ??= (async () => {
      const lfs = await doorLfsOf(ref, originOf(ref.id, ref.path));
      return { lfs, env: await envFor(lfs.declared) };
    })();
    return made;
  };
};

/** `git grep`'s exit when it found nothing (git-grep(1): "1 … no match"). */
const GREP_NONE = 1;

/**
 * Whether `refs` (refs or commits of `ref`'s clone) mark large files: the
 * tree at any of them has a `.gitattributes`, at any depth, naming git-lfs's
 * filter (`filter=lfs`, what `git lfs track` writes), or, given `upstream`
 * (the remote-tracking refs a push's commits are new against), a commit
 * between them and it changed such a line. A tree that marks none holds no
 * pointer git-lfs would fetch or push. A run git cannot answer counts as
 * marking: the hub is asked, as before.
 */
const marksLfs = (
  ref: WorkspaceRef,
  refs: readonly string[],
  upstream?: string
): boolean => {
  const git = (args: string[]) => {
    const run = inCopySync(ref.id, ref.path, safeGitArgv(args));
    return Bun.spawnSync(run.argv, {
      cwd: run.cwd,
      env: { ...hostEnvironment(), ...SAFE_GIT_ENV, ...GIT_LOCALE },
      stdout: "pipe",
      stderr: "ignore",
    });
  };
  const inTrees = git([
    "grep",
    "-q",
    "-I",
    "-F",
    "-e",
    "filter=lfs",
    ...refs,
    "--",
    "*.gitattributes",
  ]);
  if (inTrees.exitCode !== GREP_NONE) {
    return true;
  }
  if (!upstream) {
    return false;
  }
  const changed = git([
    "log",
    "-1",
    "--format=%H",
    "-G",
    "filter=lfs",
    ...refs,
    "--not",
    `--remotes=${upstream}`,
    "--",
    "*.gitattributes",
  ]);
  return changed.exitCode !== 0 || changed.stdout.toString().trim() !== "";
};

/**
 * The large files the trees of `refs` point at, fetched from the hub's LFS
 * into the clone's own store (`git lfs fetch origin <ref>…`, this machine's
 * credential): inside the boundary git-lfs reaches no hub, so a checkout or
 * rebase there onto a fetched commit (landing onto a newer default branch,
 * a session's own `git pull`) smudges from what is already here. When a
 * fetched commit's `.lfsconfig` names an endpoint that is none of `lfs`'s
 * `allowed` (the origin's, the project's declared one), nothing is fetched
 * from anywhere: its files live on a server CawCo was never told of, they
 * stay pointers, and the project's conversation is told (host-lfs.ts).
 */
const fetchLfs = async (
  ref: WorkspaceRef,
  refs: string[],
  side: LfsSide
): Promise<void> => {
  if (refs.length === 0 || !Bun.which("git-lfs")) {
    return;
  }
  const gone = await noClone(ref);
  if (gone) {
    throw new Error(`git lfs fetch of ${refs.join(" ")} did not run: ${gone}`);
  }
  if (!marksLfs(ref, refs)) {
    return;
  }
  const { env, lfs } = await side();
  const refused = await undeclaredEndpoint(ref.path, refs, lfs.allowed);
  if (refused) {
    await noteRefused(lfs.projectId, ref.path, refused);
    return;
  }
  const { code, err } = await runOnHost(
    ref,
    ["lfs", "fetch", "origin", ...refs],
    env
  );
  if (code !== 0) {
    throw new Error(
      `git lfs fetch of ${refs.join(" ")} failed: ${lastSaid(err, `exit ${code}`)}`
    );
  }
};

/**
 * git's side of the helper protocol for the hub's own remote, fed to git's
 * http helper on the host by `write`: a line at a time until a `connect` or
 * `stateless-connect` turns it to git's own packets, passed through as they
 * come. A push batch (`push` lines, then a blank one) is held until
 * {@link pushLfs} has sent its large files; when they did not go, the batch
 * never reaches the helper and git is answered `error <dst> <why>` for each
 * ref (gitremote-helpers(7), "push").
 */
const protocolFeed = (
  ref: WorkspaceRef,
  channel: DoorChannel,
  write: (bytes: Buffer | string) => void,
  side: LfsSide
) => {
  let raw = false;
  let pending = Buffer.alloc(0);
  let batch: string[] = [];
  /** git asked for a dry run (`option dry-run true`): its push sends nothing. */
  let dryRun = false;
  const endBatch = async (): Promise<void> => {
    const lines = batch;
    batch = [];
    // A dry run (a landing's push check, hub landing.ts) sends no large
    // file: the helper answers it alone.
    if (dryRun) {
      write(`${lines.join("\n")}\n\n`);
      return;
    }
    const refused = await pushOriginLfs(
      ref,
      lines.map((line) => refspecOf(line).src).filter(Boolean),
      side
    );
    if (refused) {
      channel.write(
        `${lines.map((line) => `error ${refspecOf(line).dst} ${refused}\n`).join("")}\n`
      );
      return;
    }
    write(`${lines.join("\n")}\n\n`);
  };
  return async (chunk: Buffer): Promise<void> => {
    if (raw) {
      write(chunk);
      return;
    }
    pending = Buffer.concat([pending, chunk]);
    let end = pending.indexOf(LINE_END);
    while (end >= 0 && !raw) {
      const line = pending.subarray(0, end).toString();
      pending = pending.subarray(end + 1);
      if (line.startsWith("push ")) {
        batch.push(line);
      } else if (line === "" && batch.length > 0) {
        await endBatch();
      } else {
        if (DRY_RUN_OPTION.test(line)) {
          dryRun = line === DRY_RUN;
        }
        write(`${line}\n`);
        raw = CONNECT.test(line);
      }
      end = pending.indexOf(LINE_END);
    }
    if (raw && pending.length > 0) {
      write(pending);
      pending = Buffer.alloc(0);
    }
  };
};

/** A C-quoted option value as git wrote it (`"…"`, quote.c `quote_c_style`), plain; a bare one as it is. */
const unquoted = (value: string): string => {
  if (!value.startsWith('"')) {
    return value;
  }
  try {
    const plain: unknown = JSON.parse(value);
    return typeof plain === "string" ? plain : value;
  } catch {
    return value;
  }
};

/** A reason on one line, as git's helper protocol carries it. */
const oneLine = (text: string): string => text.replace(/\s*\n\s*/gu, " ");

/** A URL with a scheme, `<scheme>://`. */
const SCHEME_URL = /^[a-z][a-z0-9+.-]*:\/\//iu;
/** git's scp-like ssh form, `[<user>@]<host>:<path>`: "only recognized if there are no slashes before the first colon" (git-scm.com/docs/git-clone, "GIT URLS"). */
const SCP_LIKE = /^(?:[^@/\s]+@)?[^/:\s]+:\S/u;
/** The schemes git takes for ssh (git's connect.c `url_is_local_not_ssh` and `parse_connect_url`). */
const SSH_SCHEMES: ReadonlySet<string> = new Set([
  "ssh:",
  "git+ssh:",
  "ssh+git:",
]);

/**
 * Whether `url` names a remote across the network, which only a credential
 * opens: an `http(s)://` or ssh URL (`ssh://`, scp-like), on any host. A
 * local path or `file://` holds no credential: git inside the boundary
 * reaches it under the boundary's own file rules, never through the door.
 */
const isNetworkRemote = (url: string): boolean => {
  if (!SCHEME_URL.test(url)) {
    return SCP_LIKE.test(url);
  }
  try {
    const { protocol } = new URL(url);
    return (
      protocol === "https:" || protocol === "http:" || SSH_SCHEMES.has(protocol)
    );
  } catch {
    return false;
  }
};

/**
 * For every workspace, the git config ({@link gitDoorEnv}) that sends every
 * push across the network, on any host, through the workspace's git door
 * (`pushInsteadOf`, git-config(1): "Any URL that starts with this value will
 * not be pushed to; instead, it will be rewritten"): `https://`, `http://`,
 * the ssh schemes, and the scp-like form under `git@`, the login every
 * forge's ssh URL carries. The door pushes each with the host's own
 * credential ({@link doorTarget}). Fetches still go straight out. A push to
 * an scp-like URL under any other login reaches git's ssh, which inside the
 * boundary is {@link SSH_REFUSAL}.
 */
const DOOR_PUSH: [string, string][] = [
  "https://",
  "http://",
  "ssh://",
  "git+ssh://",
  "ssh+git://",
  "git@",
].map((prefix) => [`url.cawco::${prefix}.pushInsteadOf`, prefix]);

/**
 * For every workspace, the git config ({@link gitDoorEnv}) that keeps a
 * command's git to the command: after a commit, fetch, merge or rebase git
 * starts `git maintenance run --auto --detach` (git-config(1)
 * `maintenance.auto`: "This boolean config option controls whether some
 * commands run `git maintenance run --auto` after doing their normal work.
 * Defaults to true"), and an auto gc detaches the same way (`gc.auto`:
 * "Setting this to 0 disables it"). Either outlives the command that
 * started it, so the agent's leak watch tells the session it left a
 * process behind. Given as `-c` words, they hold over the clone's and the
 * user's own config. A workspace is retired, never packed.
 */
const QUIET_GIT: [string, string][] = [
  ["maintenance.auto", "false"],
  ["gc.auto", "0"],
];

/**
 * What git-lfs would otherwise learn from a server and write into the
 * clone's `.git/config` (`git config --replace-all`, a lock and a rename),
 * given env-only to every git the door runs for a remote outside the hub:
 * whether to ask the server about locks before a push (`lfs.locksverify`,
 * git-lfs lockverifier.go `disableFor`), for whatever endpoint the
 * repository names, through the URL-less key git-lfs falls back to
 * (config/url_config.go `Get`). A hub origin's git is held to its own LFS
 * ({@link hubGitEnv}). The rename drops the read-only bind the workspace's
 * sandbox holds on that file, so the sandbox is stopped with everything in
 * it (boundary-host.ts `guard`): on 2026-10-17 a landing's push to a
 * GitHub origin set this off (a 401 on `locks/verify`, then
 * `lfs.<url>.access` written), and cut off every command the workspace was
 * running.
 */
const DOOR_LFS: [string, string][] = [["lfs.locksverify", "false"]];

/**
 * git's environment for a remote outside the hub, on the host: the host's
 * own credential for whatever host and transport the URL names, as the
 * person's git and ssh give it (osxkeychain, libsecret, a forge CLI's helper,
 * their ssh keys and agent), with {@link DOOR_LFS}, env-only as
 * {@link hubGitEnv} is. GitHub's https credential is the host's gh where it
 * has one, as inside every workspace (boundary/state.ts `gitSystemConfig`): gh as
 * github.com's only helper (`helper =` clears what came before,
 * git-config(1) `credential.helper`), and GitHub's LFS access as that
 * credential makes it (`basic`: sent up front, so no 401 has git-lfs write
 * it into the clone's config). Both keys are scoped to github.com's URL, so
 * no other host's credential changes.
 */
const hostGitEnv = async (): Promise<Record<string, string>> => {
  const gh = await hostGh();
  const key = "credential.https://github.com.helper";
  return withGitConfig(
    {
      ...(hostEnvironment() as Record<string, string>),
      ...GIT_LOCALE,
      GIT_TERMINAL_PROMPT: "0",
    },
    [
      ...(gh
        ? ([
            [key, ""],
            [key, `!${shellQuote(gh)} auth git-credential`],
            ["lfs.https://github.com/.access", "basic"],
          ] as [string, string][])
        : []),
      ...DOOR_LFS,
    ]
  );
};

/**
 * {@link hostGitEnv} for the clone's own origin `origin` outside the hub,
 * with git-lfs held to one endpoint whatever the repository's committed
 * `.lfsconfig` names (git/lfs.ts {@link lfsPins}): the project's `declared`
 * one with its connection's credential ({@link declaredPins}), else the
 * origin's own LFS, its access `basic` where the host signs in there (gh for
 * github.com, or the host's own helpers, host-lfs.ts `hostSigns`). An ssh
 * origin's endpoint is the URL itself, for which git-lfs asks that server
 * over ssh, as {@link lfsConfigFor} gives another repository's. So a push's
 * or a fetch's large files go nowhere else, and the host's credential goes
 * to no other server.
 */
export const hostOriginGitEnv = async (
  origin: string,
  declared?: DeclaredLfs
): Promise<Record<string, string>> =>
  withGitConfig(await hostGitEnv(), await originLfsPins(origin, declared));

/** The git-lfs pins of {@link hostOriginGitEnv}, for `origin` and its project's `declared` endpoint. */
const originLfsPins = async (
  origin: string,
  declared: DeclaredLfs | undefined
): Promise<[string, string][]> => {
  if (declared) {
    return declaredPins(declared, urlOrigin(origin));
  }
  const web = urlOrigin(origin);
  if (!web?.startsWith("http")) {
    return lfsConfigFor(origin);
  }
  const endpoint = lfsEndpointOf(origin);
  const signed =
    (web === "https://github.com" && (await hostGh()) !== undefined) ||
    (await hostSigns(endpoint));
  return lfsPins(endpoint, signed);
};

/**
 * What a door connection for `url` reaches:
 * - `hub`: the clone's own origin on the hub, through git's http helper with
 *   this machine's hub credential and the hub's LFS;
 * - `host`: a remote outside the hub, on any host and over any transport
 *   that crosses the network ({@link isNetworkRemote}), reached by the
 *   host's own git with the host's own credential. Its refs and objects are
 *   read, and a push goes on, carrying its large files to the repository it
 *   reaches (`origin`: whether that is the clone's own origin, whose LFS the
 *   clone names, or another, by its URL alone).
 * Thrown for anything else: the door signs nothing else in.
 */
type DoorTarget = { kind: "hub" } | { kind: "host"; origin: boolean };

const doorTarget = (ref: WorkspaceRef, url: string): DoorTarget => {
  const origin = originOf(ref.id, ref.path);
  if (origin !== "" && url === origin) {
    if (isHubRemote(origin)) {
      return { kind: "hub" };
    }
    if (isNetworkRemote(origin)) {
      return { kind: "host", origin: true };
    }
  }
  if (!isNetworkRemote(url) || isHubRemote(url)) {
    throw new Error(
      `cawco: git did not reach ${url} through the workspace's git door: it takes this clone's own origin, and pushes across the network, alone`
    );
  }
  return { kind: "host", origin: false };
};

/**
 * What the door answers git's commands with when it speaks git's remote
 * helper protocol itself (gitremote-helpers(7)), for a remote outside the
 * hub: the remote's refs for `list`, the objects of the
 * named refs for a `fetch` batch, and a line per ref for a `push` batch
 * (`ok <dst>`, or `error <dst> <why>`). A push batch under `dryRun` (git's
 * `option dry-run true`) is answered by the remote's own `--dry-run` and
 * changes nothing: no large file sent, no ref written. `leases` are the batch's `option cas` values, each
 * the push's `--force-with-lease=<ref>:<sha>`.
 */
interface HelperBackend {
  readonly fetch: (names: readonly string[]) => Promise<void>;
  readonly list: (forPush: boolean) => Promise<readonly string[]>;
  readonly push: (
    lines: readonly string[],
    dryRun: boolean,
    leases: readonly string[]
  ) => Promise<readonly string[]>;
}

/**
 * The last line git said on stderr, its credentials out. A progress line
 * ends in `\r` and is redrawn over ({@link runOnHost}), so each is a line
 * of its own here, and the words after the last of them are the last said.
 */
const lastSaid = (err: string, fallback: string): string =>
  withoutCredential(err)
    .split(LINE_BREAKS)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? fallback;

const LINE_BREAKS = /[\r\n]+/u;

/** `git ls-remote --symref`'s `ref: <target>\tHEAD`. */
const SYMREF = /^ref: (\S+)\t(\S+)$/u;
/** `git ls-remote`'s `<sha>\t<ref>`. */
const LISTED_REF = /^([0-9a-f]{40}(?:[0-9a-f]{24})?)\t(\S+)$/u;
/** `git push --porcelain`'s ref line: `<flag>\t<from>:<to>\t<summary>` (git-push(1), "OUTPUT"). */
const PORCELAIN_REF = /^([ +\-*=!])\t[^\t]*:([^\t]+)\t(.*)$/u;

/**
 * A remote outside the hub, as the host's own git reaches it with the host's
 * own credential ({@link hostGitEnv}), whatever its host and transport: its
 * refs by `git ls-remote`, a fetch by `git fetch` of the refs git named into
 * the clone's own objects (git writes the refs itself once the batch is
 * answered), and a push by `git push --porcelain` of the batch's refspecs,
 * read per ref. A push that
 * goes sends its large files first: to the clone's own origin's LFS when
 * `origin` (its git-lfs side, {@link pushOriginLfs}), else to the LFS of the
 * repository at `url` ({@link pushLfs}). `env` is git's own, with no LFS
 * pin: git itself reads none.
 */
const hostBackend = (
  ref: WorkspaceRef,
  url: string,
  env: Record<string, string>,
  origin: LfsSide | undefined
): HelperBackend => ({
  list: async (forPush) => {
    const listed = await runOnHost(
      ref,
      ["ls-remote", ...(forPush ? [] : ["--symref"]), url],
      env
    );
    if (listed.code !== 0) {
      throw new Error(
        `git ls-remote ${url} failed: ${lastSaid(listed.err, `exit ${listed.code}`)}`
      );
    }
    return listed.out
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        const symref = SYMREF.exec(line);
        if (symref) {
          return [`@${symref[1]} ${symref[2]}`];
        }
        const listedRef = LISTED_REF.exec(line);
        return listedRef ? [`${listedRef[1]} ${listedRef[2]}`] : [];
      });
  },
  fetch: async (names) => {
    const fetched = await runOnHost(
      ref,
      [
        "fetch",
        "--progress",
        "--no-tags",
        "--no-write-fetch-head",
        url,
        ...new Set(names),
      ],
      env
    );
    if (fetched.code !== 0) {
      throw new Error(
        `git fetch ${url} failed: ${lastSaid(fetched.err, `exit ${fetched.code}`)}`
      );
    }
  },
  push: async (lines, dryRun, leases) => {
    const specs = lines.map((line) => line.slice("push ".length));
    // A dry run sends no large file: the remote's own `--dry-run` answers it.
    const sources = lines.map((line) => refspecOf(line).src).filter(Boolean);
    let refused: string | undefined;
    if (!dryRun) {
      refused = origin
        ? await pushOriginLfs(ref, sources, origin)
        : await pushLfs(ref, sources, env, url);
    }
    if (refused) {
      return lines.map((line) => `error ${refspecOf(line).dst} ${refused}`);
    }
    const pushed = await runOnHost(
      ref,
      [
        "push",
        "--porcelain",
        "--progress",
        ...(dryRun ? ["--dry-run"] : []),
        ...leases.map((lease) => `--force-with-lease=${lease}`),
        url,
        ...specs,
      ],
      env
    );
    return pushAnswers(lines, pushed);
  },
});

/**
 * remote-curl's line naming the HTTP status a request failed with
 * (remote-curl.c `error(_("RPC failed; %s"), msg.buf)`: `RPC failed; HTTP
 * 500 curl 22 The requested URL returned error: 500`), which git follows
 * with more lines (`fatal: the remote end hung up unexpectedly`).
 */
const RPC_FAILED = /RPC failed; [^\r\n]*/u;

/**
 * A `push` batch's answer, a line per ref, from `git push --porcelain`'s run
 * of it. A ref with no porcelain line (git's push ended before the remote
 * reported on it) is refused in git's last words, with its `RPC failed`
 * line first when it said one ({@link RPC_FAILED}), so the refusal names the
 * HTTP status and not only the dropped connection after it.
 */
const pushAnswers = (
  lines: readonly string[],
  pushed: { code: number; err: string; out: string }
): string[] => {
  const results = new Map<string, string>();
  for (const line of pushed.out.split("\n")) {
    const read = PORCELAIN_REF.exec(line);
    if (read) {
      const [, flag, dst = "", summary = ""] = read;
      results.set(
        dst,
        flag === "!" ? `error ${dst} ${oneLine(summary)}` : `ok ${dst}`
      );
    }
  }
  const last = lastSaid(pushed.err, `git push exited ${pushed.code}`);
  const status = RPC_FAILED.exec(withoutCredential(pushed.err))?.[0];
  const why = status && !last.includes(status) ? `${status}; ${last}` : last;
  return lines.map((line) => {
    const { dst } = refspecOf(line);
    return results.get(dst) ?? `error ${dst} ${oneLine(why)}`;
  });
};

/**
 * git's remote helper protocol, spoken by the door itself
 * (gitremote-helpers(7)): `capabilities` is answered `fetch`, `push` and
 * `option`; `list` and `list for-push` with the backend's refs and a blank
 * line; a batch of `fetch <sha> <name>` lines, ended by a blank one, with a
 * blank line once the objects are here; a batch of `push <refspec>` lines
 * with a line per ref and a blank one. A blank line with no batch open, or
 * git's end of the connection, ends it, once `done` has run (the origin's
 * large files fetched).
 *
 * `option <name> <value>` is answered "a single line containing one of ok
 * (option successfully set), unsupported (option not recognized) or error
 * <msg>". The door honours `dry-run` ("If true, pretend the operation
 * completed successfully, but don't actually change any repository data"),
 * kept for the push batches that follow; git's `git push --dry-run` refuses
 * outright without it ("helper %s does not support dry-run", git's
 * transport-helper.c). It honours `cas` ({@link CAS_OPTION}), each lease
 * given to the push that follows as the host's `--force-with-lease`: git
 * sends a leased ref's push line without `+` and carries on when the helper
 * answers `unsupported`, so before 2026-10-19 the door pushed it as a plain
 * push and the remote refused every leased replace as non-fast-forward (a
 * branch landing's next round, hub landing.ts `leasedPush`). Every other
 * option (`progress` and `verbosity`, sent on every connection,
 * `followtags`, `atomic`, `push-option`, …) is `unsupported`, and git
 * decides whether it carries on without it.
 */
/** The options a connection's git set that its push batches read: `dry-run` as last set, the `cas` leases since the last batch. */
interface HelperOptions {
  dryRun: boolean;
  leases: string[];
}

/** The door's answer to git's `option <name> <value>` ({@link serveHelper}), kept in `options`. */
const answerOption = (line: string, options: HelperOptions): string => {
  const dry = DRY_RUN_OPTION.exec(line);
  if (dry) {
    options.dryRun = dry[1] === "true";
    return "ok";
  }
  const cas = CAS_OPTION.exec(line)?.[1];
  if (cas) {
    options.leases.push(unquoted(cas));
    return "ok";
  }
  return line.startsWith("option dry-run ")
    ? "error dry-run is true or false"
    : "unsupported";
};

const serveHelper = (
  socket: Socket,
  channel: DoorChannel,
  rest: Buffer,
  backend: HelperBackend,
  fail: (why: string) => void,
  done: () => Promise<void>
): void => {
  let pending = Buffer.alloc(0);
  let batch: string[] = [];
  let chain = Promise.resolve();
  let ended = false;
  const options: HelperOptions = { dryRun: false, leases: [] };
  const finish = async (): Promise<void> => {
    if (ended) {
      return;
    }
    ended = true;
    await done();
    channel.end();
  };
  const answer = async (line: string): Promise<void> => {
    if (line === "capabilities") {
      channel.write("fetch\npush\noption\n\n");
    } else if (line.startsWith("option ")) {
      channel.write(`${answerOption(line, options)}\n`);
    } else if (line === "list" || line === "list for-push") {
      const refs = await backend.list(line === "list for-push");
      channel.write(`${refs.map((each) => `${each}\n`).join("")}\n`);
    } else if (line.startsWith("fetch ") || line.startsWith("push ")) {
      batch.push(line);
    } else if (line === "" && batch.length > 0) {
      const lines = batch;
      batch = [];
      if (lines[0]?.startsWith("fetch ")) {
        await backend.fetch(lines.map((each) => each.split(" ")[2] ?? ""));
        channel.write("\n");
      } else {
        const results = await backend.push(
          lines,
          options.dryRun,
          options.leases.splice(0)
        );
        channel.write(`${results.map((each) => `${each}\n`).join("")}\n`);
      }
    } else if (line === "") {
      await finish();
    } else {
      throw new Error(
        `git asked the door for "${line.split(" ")[0]}", which it does not answer`
      );
    }
  };
  const feed = (chunk: Buffer): void => {
    pending = Buffer.concat([pending, chunk]);
    for (
      let end = pending.indexOf(LINE_END);
      end >= 0;
      end = pending.indexOf(LINE_END)
    ) {
      const line = pending.subarray(0, end).toString();
      pending = pending.subarray(end + 1);
      chain = chain
        .then(() => (ended ? undefined : answer(line)))
        .catch((error: unknown) => {
          ended = true;
          fail(error instanceof Error ? error.message : String(error));
        });
    }
  };
  socket.on("data", feed);
  socket.on("end", () => {
    chain = chain.then(finish);
  });
  feed(rest);
  socket.resume();
};

/** Whether two paths are the same directory on this host, links resolved. */
const sameDir = (a: string, b: string): boolean => {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
};

/**
 * Why git does not run in `ref`'s checkout, as {@link hostGit} (clone.ts)
 * holds it: a workspace's clone is refused while its own config holds a key
 * past the allowlist, as the workspace writes that config; a place is a
 * person's own folder, whose config is theirs and read-only inside its
 * boundary, and is never refused.
 */
const configProblem = async (ref: WorkspaceRef): Promise<string | undefined> =>
  overlaySync(ref.id) || (await cloneHolding(ref.path))
    ? await repositoryConfigProblem(
        join(copyPathSync(ref.id, ref.path), ".git")
      )
    : undefined;

/**
 * How often the door tells the helper it is still at work while it says
 * nothing else ({@link DoorChannel}). Our choice: a fraction of
 * {@link HELPER_SILENCE_S}, so a busy event loop's delay never reads as a
 * door gone quiet.
 */
const DOOR_KEEPALIVE_MS = 10_000;

/**
 * How long the helper waits on the door with nothing heard, not even a
 * keepalive, before it ends git's command with a refusal ({@link helperScript}).
 * Our choice: six keepalives missed means the agent is stuck, not busy.
 */
const HELPER_SILENCE_S = 60;

/** The bytes of a frame's length (`N` in Perl's pack, a 32-bit big-endian count). */
const FRAME_HEAD = 4;

/**
 * The bit of a frame's length that marks the door's words for git's stderr
 * ({@link DoorChannel} `say`), not bytes of git's helper protocol: a frame
 * is never that long.
 */
const SAID_BIT = 0x80_00_00_00;

/**
 * The door's side of a connection once it has said `ok`: every byte for
 * git goes to the helper in a frame (its length, then that many bytes), and
 * an empty frame every {@link DOOR_KEEPALIVE_MS} while the connection is
 * open says the door is still at work (a large file's upload, a remote that
 * takes its time). The helper unwraps the frames and waits on no silence
 * longer than {@link HELPER_SILENCE_S}. `write` answers false when the
 * socket's buffer is full, as `socket.write` does.
 */
interface DoorChannel {
  readonly end: () => void;
  /** The door's words on why it stopped, for git's stderr; the helper ends git's command on them. */
  readonly say: (words: string) => void;
  readonly write: (bytes: Buffer | string) => boolean;
}

const doorChannel = (socket: Socket): DoorChannel => {
  const frame = (bytes: Buffer | string, said = false): Buffer => {
    const body = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
    const head = Buffer.alloc(FRAME_HEAD);
    head.writeUInt32BE((said ? SAID_BIT : 0) + body.length);
    return Buffer.concat([head, body]);
  };
  const open = () => !(socket.destroyed || socket.writableEnded);
  const keepalive = setInterval(() => {
    if (open()) {
      socket.write(frame(Buffer.alloc(0)));
    }
  }, DOOR_KEEPALIVE_MS);
  socket.once("close", () => clearInterval(keepalive));
  return {
    write: (bytes) => (open() ? socket.write(frame(bytes)) : false),
    say: (words) => {
      if (open()) {
        socket.write(frame(words, true));
      }
    },
    end: () => {
      clearInterval(keepalive);
      socket.end();
    },
  };
};

/** One door connection: the URL line, then the remote's side of git's helper protocol, as {@link doorTarget} reaches it. */
const serveConnection = (ref: WorkspaceRef, socket: Socket): void => {
  let head = Buffer.alloc(0);
  /** The door has said `ok`: everything after goes in frames ({@link doorChannel}). */
  let answered = false;
  let channel: DoorChannel | undefined;
  /** Past `ok`, the door's words reach git's stderr in a frame of their own before it closes. */
  const fail = (why: string) => {
    console.warn(`[hub-git] ${ref.id}: ${why}`);
    if (channel) {
      channel.say(
        `${oneLine(why.startsWith("cawco:") ? why : `cawco: ${why}`)}\n`
      );
      channel.end();
      return;
    }
    socket.destroy();
  };
  const onData = (chunk: Buffer) => {
    head = Buffer.concat([head, chunk]);
    const end = head.indexOf(LINE_END);
    if (end < 0) {
      if (head.length > 4096) {
        fail("the helper sent no URL line");
      }
      return;
    }
    socket.off("data", onData);
    socket.pause();
    const [url = "", gitDir = ""] = head
      .subarray(0, end)
      .toString()
      .trim()
      .split("\t");
    const rest = head.subarray(end + 1);
    start(url, gitDir, rest).catch((error: unknown) => {
      const why = error instanceof Error ? error.message : String(error);
      if (answered) {
        // Past `ok` the helper reads frames: the connection is cut short.
        fail(why);
        return;
      }
      console.warn(`[hub-git] ${ref.id}: ${why}`);
      // The helper prints the door's word to git's stderr and stops.
      socket.end(
        `${oneLine(why.startsWith("cawco:") ? why : `cawco: ${why}`)}\n`
      );
    });
  };
  const start = async (
    url: string,
    gitDir: string,
    rest: Buffer
  ): Promise<void> => {
    await viewRunning(ref.id);
    const gone = await noClone(ref);
    if (gone) {
      throw new Error(`git did not run in ${ref.path}: ${gone}`);
    }
    if (!(gitDir && sameDir(gitDir, join(ref.path, ".git")))) {
      throw new Error(
        `cawco: git did not reach ${url} through the workspace's git door: it serves this workspace's clone (${ref.path}) alone, and this git runs in ${gitDir || "a repository it did not name"}`
      );
    }
    const problem = await configProblem(ref);
    if (problem) {
      throw new Error(`git did not run in ${ref.path}: ${problem}`);
    }
    const target = doorTarget(ref, url);
    // git's own environment, read before the door answers: what fails after
    // `ok` reaches git only as a connection cut short. git-lfs's, held to
    // the clone's origin's LFS or its project's declared one (host-lfs.ts),
    // is made only for a command whose refs mark large files ({@link LfsSide}).
    let env: Record<string, string> = {};
    if (target.kind === "host") {
      env = await withHostLogin(ref, url, await hostGitEnv());
    }
    socket.write("ok\n");
    answered = true;
    channel = doorChannel(socket);
    switch (target.kind) {
      case "hub":
        pipeHubHelper(ref, socket, channel, url, rest);
        return;
      case "host": {
        const before = remoteRefs(ref);
        const side = target.origin
          ? lfsSideOf(ref, async (declared) =>
              withGitConfig(env, await originLfsPins(url, declared))
            )
          : undefined;
        serveHelper(
          socket,
          channel,
          rest,
          hostBackend(ref, url, env, side),
          fail,
          async () => {
            if (!side) {
              return;
            }
            // git has written the refs it fetched by the time it ends the
            // connection: their large files come here before it closes.
            await fetchLfs(ref, movedRefs(before, remoteRefs(ref)), side).catch(
              (error: unknown) =>
                console.warn(
                  `[hub-git] ${ref.id}: ${error instanceof Error ? error.message : String(error)}`
                )
            );
          }
        );
        return;
      }
      default:
        unhandled("target", target);
    }
  };
  socket.on("data", onData);
  socket.on("error", () => undefined);
};

/**
 * The hub's own remote: git's http helper on the host with this machine's
 * hub credential, piped both ways (git/hub-remote.ts `hubGitEnv`). A push or fetch
 * whose refs mark large files moves them with the hub's LFS, or the
 * project's declared LFS with its connection's credential ({@link LfsSide}).
 */
const pipeHubHelper = (
  ref: WorkspaceRef,
  socket: Socket,
  channel: DoorChannel,
  url: string,
  rest: Buffer
): void => {
  const env = hubGitEnv(url);
  const side = lfsSideOf(ref, async (declared) => hubGitEnv(url, [], declared));
  const scheme = new URL(url).protocol === "https:" ? "https" : "http";
  const run = inCopySync(
    ref.id,
    ref.path,
    safeGitArgv([`remote-${scheme}`, "origin", url])
  );
  const child = spawn(run.argv[0] as string, run.argv.slice(1), {
    cwd: run.cwd,
    env: { ...env, ...SAFE_GIT_ENV, GIT_DIR: join(ref.path, ".git") },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const before = remoteRefs(ref);
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });
  child.on("close", (code) => {
    if (code !== 0 && stderr.trim()) {
      console.warn(
        `[hub-git] ${ref.id}: git remote-${scheme} exited ${code}: ${withoutCredential(stderr.trim())}`
      );
    }
    // git waits on the helper as it disconnects, after it has written the
    // refs it fetched: the door closes once their large files are here.
    const moved = code === 0 ? movedRefs(before, remoteRefs(ref)) : [];
    fetchLfs(ref, moved, side)
      .catch((error: unknown) =>
        console.warn(
          `[hub-git] ${ref.id}: ${error instanceof Error ? error.message : String(error)}`
        )
      )
      .finally(() => channel.end());
  });
  child.on("error", () => socket.destroy());
  child.stdin.on("error", () => undefined);
  socket.on("error", () => child.kill("SIGTERM"));
  socket.on("close", () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
  });
  // git's http helper's answers, framed for the helper; a full socket holds
  // the helper's next answer back until it drains.
  child.stdout.on("data", (chunk: Buffer) => {
    if (!channel.write(chunk)) {
      child.stdout.pause();
    }
  });
  socket.on("drain", () => child.stdout.resume());
  const feed = protocolFeed(
    ref,
    channel,
    (bytes) => child.stdin.write(bytes),
    side
  );
  let chain = feed(rest);
  socket.on("data", (chunk: Buffer) => {
    socket.pause();
    chain = chain
      .then(() => feed(chunk))
      .then(() => {
        socket.resume();
      })
      .catch((error: unknown) => {
        console.warn(
          `[hub-git] ${ref.id}: ${error instanceof Error ? error.message : String(error)}`
        );
        socket.destroy();
      });
  });
  socket.on("end", () => {
    chain = chain.then(() => {
      child.stdin.end();
    });
  });
  socket.resume();
};

const doors = new Map<string, Server>();

/**
 * What git's ssh is inside a workspace (`GIT_SSH_COMMAND`, {@link gitDoorEnv}):
 * a refusal that says why. A workspace holds no ssh key and reaches no key
 * agent (boundary/), so git over ssh could sign in nowhere; the clone's
 * own origin, over ssh too, goes through the door ({@link doorTarget}).
 */
const SSH_REFUSAL = `#!${systemProgram("sh")}
# CawCo: git's ssh inside a workspace's boundary, which holds no ssh key.
echo "cawco: git over ssh did not run here: a workspace holds no ssh key and reaches no key agent. This clone's own origin goes through CawCo's git door, which signs in with this machine's own credential; a push to another repository goes through the door too by its https://, ssh:// or git@host: URL." >&2
exit 128
`;

/** Where a workspace's {@link SSH_REFUSAL} is, beside its git helper. */
const sshRefusalOf = (id: string): string =>
  join(gitHelperDirOf(id), "cawco-ssh");

/**
 * Serves workspace `ref`'s git door and writes its helper and git's ssh
 * ({@link SSH_REFUSAL}), once per agent: a socket an earlier agent left is
 * replaced. It is served whether or not the agent knows a hub: a remote
 * outside the hub needs none, and a command finds the door only by the
 * socket {@link gitDoorEnv} names, which it names while the agent knows a
 * hub. The agent knows one from its start (daemon.ts sets `CAWCO_HUB_URL`,
 * the default hub's when none was given), before any boundary is armed.
 */
export const openGitDoor = async (ref: WorkspaceRef): Promise<void> => {
  if (doors.has(ref.id)) {
    return;
  }
  await writeStateFile(
    join(gitHelperDirOf(ref.id), "git-remote-cawco"),
    helperScript(),
    {
      mode: 0o755,
    }
  );
  await writeStateFile(sshRefusalOf(ref.id), SSH_REFUSAL, { mode: 0o755 });
  const path = gitDoorOf(ref.id);
  await prepareDoor(path);
  const server = createServer({ allowHalfOpen: true }, (socket) =>
    serveConnection(ref, socket)
  );
  doors.set(ref.id, server);
  await listenOrEnd(server, path, `${ref.id}'s git door`);
};

/**
 * Stops serving workspace `id`'s git door. The dir it is in goes once the
 * workspace's judges are gone too (boundary/lifecycle.ts `closeBoundary`).
 */
export const closeGitDoor = async (id: string): Promise<void> => {
  const server = doors.get(id);
  doors.delete(id);
  if (server) {
    await new Promise<void>((done) => server.close(() => done()));
  }
  await rm(gitDoorOf(id), { force: true });
};

/**
 * `pairs` as the words git reads from `GIT_CONFIG_PARAMETERS`, each
 * `'<key>'='<value>'` with one space between (git-config(1) "ENVIRONMENT";
 * config.c `parse_config_env_list`). git reads each word from its first
 * character with quote.c `sq_dequote_step`, which takes nothing but a `'`
 * there: a value that starts with a space is refused whole, "bogus format in
 * GIT_CONFIG_PARAMETERS", and so is every command of git run with it.
 */
const configWords = (pairs: readonly (readonly [string, string])[]): string =>
  pairs
    .map(([key, value]) => `${shellQuote(key)}=${shellQuote(value)}`)
    .join(" ");

/** Workspace `id`'s copy's `origin` URL as its own config names it (its copy at `clone`); empty when it names none. */
const originOf = (id: string, clone: string): string =>
  Bun.spawnSync(
    safeGitArgv([
      "config",
      "--file",
      copyFileOf(id, join(clone, ".git", "config")),
      "--get",
      "remote.origin.url",
    ]),
    { env: { ...process.env, ...SAFE_GIT_ENV } }
  )
    .stdout.toString()
    .trim();

/**
 * The variables every command in workspace `id` runs with for git. In
 * `CAWCO_GIT_PARAMETERS`, always, the git config ({@link configWords}) the
 * runner appends to `GIT_CONFIG_PARAMETERS` (git reads it as `-c` options)
 * after it has set srt's own over the request, which carries a
 * `GIT_CONFIG_PARAMETERS` of its own: every push across the network sent
 * through the door ({@link DOOR_PUSH}), the `cawco::` transport allowed, and
 * no maintenance left running ({@link QUIET_GIT}). While the agent knows a
 * hub, also the door, git's ssh as {@link SSH_REFUSAL}, and in those words
 * the hub's `/git/` URLs and the clone's own origin across the network, on
 * any host and over any transport ({@link isNetworkRemote}), rewritten to
 * the `cawco::` helper. A workspace holds no credential of any host, so its
 * origin's fetches and pushes are signed on the host, by the door, with the
 * host's own (`doorTarget`). When the clone's origin is the hub, also
 * git-lfs's filters ({@link LFS_FILTERS}). When the door takes the origin,
 * `GIT_LFS_SKIP_PUSH=1` (git-lfs: "Do nothing on pre-push"): any git-lfs
 * command installs a pre-push hook, which inside the boundary reaches no
 * LFS server with a credential; the door sends a push's large files from
 * the host ({@link pushLfs}).
 */
export const gitDoorEnv = (
  id: string,
  clone: string
): Record<string, string> => {
  const always: [string, string][] = [
    ...DOOR_PUSH,
    ["protocol.cawco.allow", "always"],
    ...QUIET_GIT,
  ];
  const origins = hubOrigins();
  if (origins.length === 0) {
    return { CAWCO_GIT_PARAMETERS: configWords(always) };
  }
  const origin = originOf(id, clone);
  const hubOrigin = isHubRemote(origin);
  const outsideOrigin = !hubOrigin && isNetworkRemote(origin);
  return {
    CAWCO_GIT_SOCKET: gitDoorOf(id),
    GIT_SSH_COMMAND: sshRefusalOf(id),
    CAWCO_GIT_PARAMETERS: configWords([
      // Every address the hub answers at: a clone's origin names the one
      // the machine that made it reached the hub by.
      ...origins.map((each): [string, string] => [
        `url.cawco::${each}/git/.insteadOf`,
        `${each}/git/`,
      ]),
      ...(outsideOrigin
        ? [[`url.cawco::${origin}.insteadOf`, origin] as [string, string]]
        : []),
      // The filters the hub branch's checkout ran with (workspace.ts
      // `createWorkspace`): without the clean one, git inside reads every
      // large file it smudged as changed, and a landing hands the item back
      // as uncommitted work.
      ...(hubOrigin ? LFS_FILTERS : []),
      ...always,
    ]),
    ...(hubOrigin || outsideOrigin ? { GIT_LFS_SKIP_PUSH: "1" } : {}),
  };
};

// ── A checkout's own pulls and pushes ──────────────────────────────────────

let credentialServer: ReturnType<typeof Bun.serve> | undefined;

/**
 * The agent's credential socket ({@link hubCredentialSocket}, 0600): a
 * `POST /` with git's credential request answers this machine's id and
 * credential when the request is for the hub's protocol and host, and 404
 * otherwise. `cawco git-credential` outside a session asks it.
 */
export const serveHubCredential = async (): Promise<void> => {
  if (credentialServer) {
    return;
  }
  const path = hubCredentialSocket();
  await socketPlace(path, "the agent's credential socket");
  await rm(path, { force: true });
  credentialServer = Bun.serve({
    unix: path,
    fetch: async (request) => {
      const login = hubGitLogin();
      if (!(login && request.method === "POST")) {
        return new Response("no hub credential on this machine\n", {
          status: 404,
        });
      }
      const asked = new Map(
        (await request.text())
          .split("\n")
          .map((line) => line.split("="))
          .filter((pair) => pair.length >= 2)
          .map(([name, ...value]) => [name, value.join("=")] as const)
      );
      // Any address the hub answers at (git-credential.ts `hubOrigins`).
      const hub = hubOrigins().some((origin) => {
        const at = new URL(origin);
        return (
          asked.get("protocol") === at.protocol.slice(0, -1) &&
          asked.get("host") === at.host
        );
      });
      if (!hub) {
        return new Response("not the hub\n", { status: 404 });
      }
      return new Response(
        `username=${login.machineId}\npassword=${login.credential}\n`
      );
    },
  });
  await chmod(path, 0o600);
};
