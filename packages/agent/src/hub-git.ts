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
 *   machine's credential, env-only (move.ts {@link hubGitEnv}), after the
 *   clone's own config passed `repositoryConfigProblem` and only for the
 *   clone's own `origin`. Before a push reaches it, the push's large files
 *   go to the hub's LFS ({@link pushLfs}); after a fetch, the large files of
 *   the refs it moved come from there ({@link fetchLfs}). Landing's fetch and push,
 *   `workspaceAt`'s fetch and a session's own `git fetch`/`git push` all run
 *   inside the boundary, so all take this one path.
 *
 * A workspace holds no credential of any host (boundary.ts: the home dir's
 * stores are hidden, no key agent is reached, no command gets a forge's
 * token), so every remote across the network is
 * reached the same way, whatever its host or transport: the clone's own
 * origin (`https://`, `ssh://`, scp-like) is rewritten to this helper too
 * ({@link gitDoorEnv}), and the door, which speaks git's helper protocol
 * itself for such a remote, runs the host's own git against it with the
 * host's own credential ({@link hostGitEnv}). Every push across the
 * network comes here too ({@link guardedPushParameters}), whatever the
 * project's upstream rule (core upstream-guard.ts): one to the project's own
 * repository goes on; one to anyone else's goes on where agents may post,
 * is refused in the guard's words under "Keep agents off", or under "Ask me
 * first" held for the person and sent nowhere ({@link holdPush}). The door
 * serves the workspace's own clone alone, by the repository its helper
 * names, and takes no other URL. A workspace's gh reaches GitHub's API
 * through its GitHub door (github-door.ts) the same way: on the host,
 * judged there.
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
import type { WorkspaceRef } from "@cawco/core";
import { listenOrEnd } from "@cawco/core/listeners";
import {
  hubCredentialSocket,
  workspaceDoorDir,
  workspaceReadOnlyDir,
} from "@cawco/core/paths";
import {
  GIT_LOCALE,
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  safeGitArgv,
} from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import { writeStateFile } from "@cawco/core/state-file";
import {
  askRefusal,
  decideWrite,
  normaliseRemote,
} from "@cawco/core/upstream-guard";
import type { GitPost, PushedRef } from "@cawco/core/upstream-post";
import { systemProgram } from "@cawco/core/workspace-needs";
import { hubOrigins } from "./git-credential";
import { upstreamRule } from "./github-door";
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
import {
  type DeclaredLfs,
  declaredPins,
  hubGitEnv,
  hubGitLogin,
  isHubRemote,
  LFS_FILTERS,
  lfsEndpointOf,
  lfsPins,
  originEndpoint,
  urlOrigin,
  withoutCredential,
} from "./move";
import { noRepositoryAt } from "./stand-ins";
import { prepareDoor, socketPlace } from "./tool-door";
import { raiseUpstreamAsk } from "./upstream-posts";
import { cloneHolding } from "./workspace-records";

/** A workspace's git door. */
export const gitDoorOf = (id: string): string =>
  join(workspaceDoorDir(id), "git.sock");

/**
 * A workspace's read-only bin, first on its commands' PATH: its
 * `git-remote-cawco` and `cawco-ssh`, the `git` that judges a move of the
 * worktree (worktree-guard.ts `gitShim`), `cawco-chromium` (boundary.ts
 * `writeChromiumShim`), and on macOS the boundary's
 * toolchain shims (boundary.ts `writeShims`).
 */
export const gitHelperDirOf = (id: string): string =>
  join(workspaceReadOnlyDir(id), "bin");

/**
 * `git-remote-cawco <remote> <url>`, inside the boundary: sends the URL on
 * the door, reads the door's word (`ok`, or why not), then copies stdin to
 * the door (half-closing it when git closes stdin) and the door's frames to
 * stdout ({@link doorChannel}: a length, then that many bytes; an empty one
 * is the door's keepalive), and ends when the host closes the door. Every
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
  my $body = exactly($length);
  die "cawco: the workspace's git door ended mid-answer\\n" unless defined $body;
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
export const lfsConfigFor = (url: string): [string, string][] => {
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
export const pushLfs = async (
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
 * How long a git or git-lfs the door runs on the host may say nothing
 * before it is stopped. Our choice: each runs with its progress forced on
 * ({@link runOnHost}), so a live transfer speaks every few hundred ms
 * (git-lfs throttles its meter to one line per 200 ms, tasklog/log.go
 * `DefaultLoggingThrottle`), and a stalled connection ends itself sooner
 * (git-lfs's `lfs.activitytimeout`: "the maximum time, in seconds, that the
 * HTTP client will wait for the next tcp read or write … Default: 30
 * seconds", git-lfs-config(5)). What stays silent past this is stopped
 * whatever it waits on; one wait seen is a credential helper's prompt with
 * no one at the screen. On macOS, Apple's `git-credential-osxkeychain` first takes an
 * exclusive lock on its own binary (`open(argv[0], O_EXLOCK)`), so one
 * waiting for a keychain prompt holds every other keychain lookup on the
 * machine until it ends: on 2026-10-24 the git-door probe's push of an LFS
 * file waited 74 minutes on such a `store`.
 */
const HOST_RUN_SILENCE_MS = 120_000;

/** The most of a host run's stderr kept: its progress repeats, its last words are what it said. */
const HOST_RUN_ERR_KEPT = 64_000;

/** A host run's whole stdout, the tail of its stderr, and its exit (128 when it was stopped or never ran). */
export interface HostRun {
  readonly code: number;
  readonly err: string;
  readonly out: string;
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
 * its last words say how long it was silent. The door's own runs, and a held push made
 * on approval (upstream-posts.ts `makeHeldPush`).
 */
export const runOnHost = (
  ref: WorkspaceRef,
  args: readonly string[],
  env: Record<string, string>
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
      stdio: ["ignore", "pipe", "pipe"],
    });
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
      timer = setTimeout(stop, HOST_RUN_SILENCE_MS);
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
          ? `${err}\ncawco: ${what} said nothing on stdout or stderr for ${HOST_RUN_SILENCE_MS / 1000} s, so it was stopped, with every process it had started.`
          : err,
      });
    });
  });

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
 * own; and the project, whose thread is told of any other a `.lfsconfig`
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
 * The large files the trees of `refs` point at, fetched from the hub's LFS
 * into the clone's own store (`git lfs fetch origin <ref>…`, this machine's
 * credential): inside the boundary git-lfs reaches no hub, so a checkout or
 * rebase there onto a fetched commit (landing onto a newer default branch,
 * a session's own `git pull`) smudges from what is already here. When a
 * fetched commit's `.lfsconfig` names an endpoint that is none of `lfs`'s
 * `allowed` (the origin's, the project's declared one), nothing is fetched
 * from anywhere: its files live on a server CawCo was never told of, they
 * stay pointers, and the project's thread is told (host-lfs.ts).
 */
const fetchLfs = async (
  ref: WorkspaceRef,
  refs: string[],
  env: Record<string, string>,
  lfs: DoorLfs
): Promise<void> => {
  if (refs.length === 0 || !Bun.which("git-lfs")) {
    return;
  }
  const gone = await noClone(ref);
  if (gone) {
    throw new Error(`git lfs fetch of ${refs.join(" ")} did not run: ${gone}`);
  }
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
  env: Record<string, string>
) => {
  let raw = false;
  let pending = Buffer.alloc(0);
  let batch: string[] = [];
  /** git asked for a dry run (`option dry-run true`): its push sends nothing. */
  let dryRun = false;
  const endBatch = async (): Promise<void> => {
    const lines = batch;
    batch = [];
    // A dry run (a landing's push check, hub landing.ts) sends no large file
    // and lands nothing to hold for the person: the helper answers it alone.
    if (dryRun) {
      write(`${lines.join("\n")}\n\n`);
      return;
    }
    const refused = await pushLfs(
      ref,
      lines.map((line) => refspecOf(line).src).filter(Boolean),
      env
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

/**
 * A push batch to another person's repository under `ask`, held for the
 * person: each ref's source resolved here to the commit it is at, so the
 * push made once they approve sends exactly these commits, and raised as
 * their ask. Answers what git shows beside each ref; nothing was pushed.
 * A dry run (`dryRun`) reads the refs the same way and asks nobody: it
 * answers that the push would wait for the person.
 */
const holdPush = async (
  ref: WorkspaceRef,
  url: string,
  repo: string,
  lines: readonly string[],
  dryRun: boolean
): Promise<string> => {
  const what = `git push ${url}`;
  const refs: PushedRef[] = [];
  for (const line of lines) {
    const { src, dst } = refspecOf(line);
    if (!src) {
      return oneLine(
        askRefusal(
          what,
          `deleting ${dst} is not a post the owner can approve here`
        )
      );
    }
    const run = inCopySync(
      ref.id,
      ref.path,
      safeGitArgv(["rev-parse", "--verify", "--quiet", `${src}^{commit}`])
    );
    const read = Bun.spawnSync(run.argv, {
      cwd: run.cwd,
      env: {
        ...process.env,
        ...SAFE_GIT_ENV,
        GIT_DIR: join(ref.path, ".git"),
      },
    });
    const sha = read.stdout.toString().trim();
    if (read.exitCode !== 0 || !sha) {
      return oneLine(askRefusal(what, `${src} is no commit of this clone`));
    }
    refs.push({ sha, dst, force: FORCED.test(line.slice("push ".length)) });
  }
  if (dryRun) {
    return `cawco: \`${what}\` to ${repo} would wait in the owner's Needs you (their choice: Ask me first). This was a dry run: nothing was asked and nothing was posted.`;
  }
  const post: GitPost = { via: "git", url, refs };
  const raised = await raiseUpstreamAsk(ref.id, post, repo, what);
  return oneLine(raised.text);
};

/** A C-quoted option value as git wrote it (`"…"`, quote.c `quote_c_style`), plain; a bare one as it is. */
const unquoted = (value: string): string => {
  if (!value.startsWith('"')) {
    return value;
  }
  try {
    return JSON.parse(value) as string;
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
export const isNetworkRemote = (url: string): boolean => {
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
 * For every workspace, the git config (as `CAWCO_GIT_PARAMETERS` words)
 * that sends every push across the network, on any host, through the
 * workspace's git door (`pushInsteadOf`, git-config(1): "Any URL that starts
 * with this value will not be pushed to; instead, it will be rewritten"):
 * `https://`, `http://`, the ssh schemes, and the scp-like form under
 * `git@`, the login every forge's ssh URL carries. The door judges each by
 * the rule ({@link doorTarget}): the project's own repository goes on;
 * another's is refused in the guard's words, or held for the person under
 * `ask` ({@link holdPush}), and under `on` pushed with the host's own
 * credential. Fetches still go straight out. A push to an
 * scp-like URL under any other login reaches git's ssh, which inside the
 * boundary is {@link SSH_REFUSAL}.
 */
export const guardedPushParameters = (): string =>
  [
    ...[
      "https://",
      "http://",
      "ssh://",
      "git+ssh://",
      "ssh+git://",
      "git@",
    ].map((prefix) => [`url.cawco::${prefix}.pushInsteadOf`, prefix]),
    ["protocol.cawco.allow", "always"],
  ]
    .map(
      ([key, value]) =>
        `${shellWord(key as string)}=${shellWord(value as string)}`
    )
    .join(" ");

/**
 * For every workspace, the git config (as `CAWCO_GIT_PARAMETERS` words)
 * that keeps a command's git to the command: after a commit, fetch, merge
 * or rebase git starts `git maintenance run --auto --detach` (git-config(1)
 * `maintenance.auto`: "This boolean config option controls whether some
 * commands run `git maintenance run --auto` after doing their normal work.
 * Defaults to true"), and an auto gc detaches the same way (`gc.auto`:
 * "Setting this to 0 disables it"). Either outlives the command that
 * started it, so the agent's leak watch tells the session it left a
 * process behind. Given as `-c` words, they hold over the clone's and the
 * user's own config. A workspace is retired, never packed.
 */
export const quietGitParameters = (): string =>
  [
    ["maintenance.auto", "false"],
    ["gc.auto", "0"],
  ]
    .map(
      ([key, value]) =>
        `${shellWord(key as string)}=${shellWord(value as string)}`
    )
    .join(" ");

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
 * it (boundary-host.ts `guard`): on 2026-10-17 a landing's push to a guarded
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
 * has one, as inside every workspace (boundary.ts `gitSystemConfig`): gh as
 * github.com's only helper (`helper =` clears what came before,
 * git-config(1) `credential.helper`), and GitHub's LFS access as that
 * credential makes it (`basic`: sent up front, so no 401 has git-lfs write
 * it into the clone's config). Both keys are scoped to github.com's URL, so
 * no other host's credential changes.
 */
export const hostGitEnv = async (): Promise<Record<string, string>> => {
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
            [key, `!${shellWord(gh)} auth git-credential`],
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
 * `.lfsconfig` names (move.ts {@link lfsPins}): the project's `declared`
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
): Promise<Record<string, string>> => {
  const env = await hostGitEnv();
  if (declared) {
    return withGitConfig(env, declaredPins(declared, urlOrigin(origin)));
  }
  const web = urlOrigin(origin);
  if (!web?.startsWith("http")) {
    return withGitConfig(env, lfsConfigFor(origin));
  }
  const endpoint = lfsEndpointOf(origin);
  const signed =
    (web === "https://github.com" && (await hostGh()) !== undefined) ||
    (await hostSigns(endpoint));
  return withGitConfig(env, lfsPins(endpoint, signed));
};

/**
 * What a push through the door to a remote outside the hub does: goes on
 * (`go`), is held for the person (`hold`, {@link holdPush}), or is refused in
 * the guard's words (`refuse`).
 */
type PushRule =
  | { kind: "go" }
  | { kind: "hold"; repo: string }
  | { kind: "refuse"; why: string };

/**
 * What a door connection for `url` reaches:
 * - `hub`: the clone's own origin on the hub, through git's http helper with
 *   this machine's hub credential and the hub's LFS;
 * - `host`: a remote outside the hub, on any host and over any transport
 *   that crosses the network ({@link isNetworkRemote}), reached by the
 *   host's own git with the host's own credential. Its refs and objects are
 *   read; a push goes by the project's upstream rule (core
 *   upstream-guard.ts): to the clone's own origin or the project's own
 *   repository by another URL it goes on; to anyone else's it goes on where
 *   sessions may post, is held for the person under `ask`, and is refused
 *   under `off`. Each push that goes carries its large files to the
 *   repository it reaches (`origin`: whether that is the clone's own
 *   origin, whose LFS the clone names, or another, by its URL alone).
 * Thrown for anything else: the door signs nothing else in.
 */
type DoorTarget =
  { kind: "hub" } | { kind: "host"; origin: boolean; push: PushRule };

const doorTarget = (ref: WorkspaceRef, url: string): DoorTarget => {
  const origin = originOf(ref.id, ref.path);
  if (origin !== "" && url === origin) {
    if (isHubRemote(origin)) {
      return { kind: "hub" };
    }
    if (isNetworkRemote(origin)) {
      return { kind: "host", origin: true, push: { kind: "go" } };
    }
  }
  if (!isNetworkRemote(url) || isHubRemote(url)) {
    throw new Error(
      `cawco: git did not reach ${url} through the workspace's git door: it takes this clone's own origin, and pushes across the network, alone`
    );
  }
  const repo = normaliseRemote(url);
  const decision = decideWrite(upstreamRule(ref.id), {
    what: `git push ${url}`,
    ...(repo ? { repo } : {}),
  });
  return {
    kind: "host",
    origin: false,
    push:
      decision.kind === "refuse"
        ? { kind: "refuse", why: oneLine(decision.why) }
        : decision,
  };
};

/**
 * What the door answers git's commands with when it speaks git's remote
 * helper protocol itself (gitremote-helpers(7)), for a remote outside the
 * hub or a held push: the remote's refs for `list`, the objects of the
 * named refs for a `fetch` batch, and a line per ref for a `push` batch
 * (`ok <dst>`, or `error <dst> <why>`). A push batch under `dryRun` (git's
 * `option dry-run true`) is judged as the real one is and answered the same
 * way, and changes nothing: no large file sent, no ref written, nothing
 * held for the person. `leases` are the batch's `option cas` values, each
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
 * answered), and a push by its {@link PushRule}: held, refused, or made by
 * `git push --porcelain` of the batch's refspecs, read per ref. A push that
 * goes sends its large files first ({@link pushLfs}): to the clone's own
 * origin's LFS when `origin`, else to the LFS of the repository at `url`.
 */
const hostBackend = (
  ref: WorkspaceRef,
  url: string,
  env: Record<string, string>,
  origin: boolean,
  rule: PushRule
): HelperBackend => ({
  list: async (forPush) => {
    // A push that does not go on needs nothing of the remote: it is held or
    // refused whatever the remote holds, and reaches no network for it.
    if (forPush && rule.kind !== "go") {
      return [];
    }
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
    if (rule.kind === "hold") {
      const said = await holdPush(ref, url, rule.repo, lines, dryRun);
      return lines.map((line) => `error ${refspecOf(line).dst} ${said}`);
    }
    if (rule.kind === "refuse") {
      return lines.map((line) => `error ${refspecOf(line).dst} ${rule.why}`);
    }
    const specs = lines.map((line) => line.slice("push ".length));
    // A dry run sends no large file: the remote's own `--dry-run` answers it.
    const refused = dryRun
      ? undefined
      : await pushLfs(
          ref,
          lines.map((line) => refspecOf(line).src).filter(Boolean),
          env,
          origin ? undefined : url
        );
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

/** A `push` batch's answer, a line per ref, from `git push --porcelain`'s run of it. */
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
  const why = lastSaid(pushed.err, `git push exited ${pushed.code}`);
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
  readonly write: (bytes: Buffer | string) => boolean;
}

const doorChannel = (socket: Socket): DoorChannel => {
  const frame = (bytes: Buffer | string): Buffer => {
    const body = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
    const head = Buffer.alloc(FRAME_HEAD);
    head.writeUInt32BE(body.length);
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
  const fail = (why: string) => {
    console.warn(`[hub-git] ${ref.id}: ${why}`);
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
    // git-lfs held to the clone's origin's LFS, or its project's declared
    // one (host-lfs.ts): read before the door answers, so a run whose
    // endpoint the hub could not say does not start.
    const lfs = await doorLfsOf(ref, originOf(ref.id, ref.path));
    // Read before the door answers too: what fails after `ok` reaches git
    // only as a connection cut short.
    let env: Record<string, string> = {};
    if (target.kind === "host") {
      env = target.origin
        ? await hostOriginGitEnv(url, lfs.declared)
        : await hostGitEnv();
    }
    socket.write("ok\n");
    answered = true;
    const channel = doorChannel(socket);
    switch (target.kind) {
      case "hub":
        pipeHubHelper(ref, socket, channel, url, rest, lfs);
        return;
      case "host": {
        const before = remoteRefs(ref);
        serveHelper(
          socket,
          channel,
          rest,
          hostBackend(ref, url, env, target.origin, target.push),
          fail,
          async () => {
            if (!target.origin) {
              return;
            }
            // git has written the refs it fetched by the time it ends the
            // connection: their large files come here before it closes.
            await fetchLfs(
              ref,
              movedRefs(before, remoteRefs(ref)),
              env,
              lfs
            ).catch((error: unknown) =>
              console.warn(
                `[hub-git] ${ref.id}: ${error instanceof Error ? error.message : String(error)}`
              )
            );
          }
        );
        return;
      }
      default: {
        const unhandled: never = target;
        throw new Error(`unhandled target: ${JSON.stringify(unhandled)}`);
      }
    }
  };
  socket.on("data", onData);
  socket.on("error", () => undefined);
};

/**
 * The hub's own remote: git's http helper on the host with this machine's
 * hub credential, piped both ways, the hub's LFS with it, or the project's
 * declared LFS with its connection's credential (move.ts `hubGitEnv`).
 */
const pipeHubHelper = (
  ref: WorkspaceRef,
  socket: Socket,
  channel: DoorChannel,
  url: string,
  rest: Buffer,
  lfs: DoorLfs
): void => {
  const env = hubGitEnv(url, [], lfs.declared);
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
    fetchLfs(ref, moved, env, lfs)
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
    env
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
 * agent (boundary.ts), so git over ssh could sign in nowhere; the clone's
 * own origin, over ssh too, goes through the door ({@link doorTarget}).
 */
const SSH_REFUSAL = `#!${systemProgram("sh")}
# CawCo: git's ssh inside a workspace's boundary, which holds no ssh key.
echo "cawco: git over ssh did not run here: a workspace holds no ssh key and reaches no key agent. This clone's own origin goes through CawCo's git door, which signs in with this machine's own credential; another repository is reached only as the project's choice on other people's repositories allows (under Ask me first, a push to its https://, ssh:// or git@host: URL waits for the owner)." >&2
exit 128
`;

/** Where a workspace's {@link SSH_REFUSAL} is, beside its git helper. */
const sshRefusalOf = (id: string): string =>
  join(gitHelperDirOf(id), "cawco-ssh");

/**
 * Serves workspace `ref`'s git door and writes its helper, once per agent:
 * a socket an earlier agent left is replaced. Without a hub there is
 * nothing to reach, and no door.
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
 * workspace's judges are gone too (boundary.ts `closeBoundary`).
 */
export const closeGitDoor = async (id: string): Promise<void> => {
  const server = doors.get(id);
  doors.delete(id);
  if (server) {
    await new Promise<void>((done) => server.close(() => done()));
  }
  await rm(gitDoorOf(id), { force: true });
};

const shellWord = (word: string): string =>
  `'${word.replaceAll("'", "'\\''")}'`;

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
 * The variables every command in workspace `id` runs with: the door, git's
 * ssh as {@link SSH_REFUSAL}, and in `CAWCO_GIT_PARAMETERS` the git config
 * the runner appends to `GIT_CONFIG_PARAMETERS` (git reads it as `-c`
 * options) after it has set srt's own over the request, which carries a
 * `GIT_CONFIG_PARAMETERS` of its own: the hub's `/git/` URLs and the clone's
 * own origin across the network, on any host and over any transport
 * ({@link isNetworkRemote}), rewritten to the `cawco::` helper, and that
 * transport allowed. A workspace holds no credential of any host, so its
 * origin's fetches and pushes are signed on the host, by the door, with the
 * host's own (`doorTarget`). When the clone's origin is the hub, also
 * git-lfs's filters ({@link LFS_FILTERS}). When the door takes the origin,
 * `GIT_LFS_SKIP_PUSH=1` (git-lfs: "Do nothing on pre-push"): any git-lfs
 * command installs a pre-push hook, which inside the boundary reaches no
 * LFS server with a credential; the door sends a push's large files from
 * the host ({@link pushLfs}). None without a hub.
 */
export const gitDoorEnv = (
  id: string,
  clone: string
): Record<string, string> => {
  const origins = hubOrigins();
  if (origins.length === 0) {
    return {};
  }
  const origin = originOf(id, clone);
  const hubOrigin = isHubRemote(origin);
  const outsideOrigin = !hubOrigin && isNetworkRemote(origin);
  return {
    CAWCO_GIT_SOCKET: gitDoorOf(id),
    GIT_SSH_COMMAND: sshRefusalOf(id),
    CAWCO_GIT_PARAMETERS: [
      // Every address the hub answers at: a clone's origin names the one
      // the machine that made it reached the hub by.
      ...origins.map((each): [string, string] => [
        `url.cawco::${each}/git/.insteadOf`,
        `${each}/git/`,
      ]),
      ...(outsideOrigin ? [[`url.cawco::${origin}.insteadOf`, origin]] : []),
      ["protocol.cawco.allow", "always"],
      // The filters the hub branch's checkout ran with (workspace.ts
      // `createWorkspace`): without the clean one, git inside reads every
      // large file it smudged as changed, and a landing hands the item back
      // as uncommitted work.
      ...(hubOrigin ? LFS_FILTERS : []),
    ]
      .map(([key, value]) => `${shellWord(key)}=${shellWord(value)}`)
      .join(" "),
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
