/**
 * The hub's git remote from places that cannot reach the hub themselves.
 *
 * A workspace's boundary dials none of the owner's machines, the hub among
 * them (`DENIED_RESOLVED_ADDRESSES`, boundary-policy.ts), so a clone whose
 * `origin` is the hub (Projects spec §5.1: "A project with no outside remote
 * gets the hub as its remote") could neither fetch nor push from inside it.
 * Its git traffic runs on the host instead, as git's own remote helper:
 *
 * - Inside the boundary, every command's git config rewrites the hub's
 *   `/git/` URLs to `cawco::<url>` (`url.<base>.insteadOf`, git-config(1)),
 *   so git runs the remote helper `git-remote-cawco` for them
 *   (gitremote-helpers(7): "<transport>::<address> … git-remote-<transport>
 *   is invoked"). That helper ({@link HELPER}) only pipes its stdin and
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
 * A checkout outside any workspace whose `origin` is the hub (one a project
 * got the hub as its remote in, or one a move made) pulls and pushes from a
 * terminal through `cawco git-credential`, which its own config names for
 * the hub's URLs (git-credential.ts `useHubCredentialHelper`); outside a session that
 * helper asks the agent's credential socket ({@link serveHubCredential}).
 */
import { spawn } from "node:child_process";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import { CAWCO_ENV, type WorkspaceRef } from "@cawco/core";
import {
  hubCredentialSocket,
  workspaceDoorDir,
  workspaceReadOnlyDir,
} from "@cawco/core/paths";
import {
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  safeGitArgv,
} from "@cawco/core/safe-git";
import { hubGitEnv, hubGitLogin, isHubRemote, withoutCredential } from "./move";
import { prepareDoor, socketPlace } from "./tool-door";

/** A workspace's git door. */
export const gitDoorOf = (id: string): string =>
  join(workspaceDoorDir(id), "git.sock");

/** Where a workspace's `git-remote-cawco` is, on its commands' PATH. */
export const gitHelperDirOf = (id: string): string =>
  join(workspaceReadOnlyDir(id), "bin");

/**
 * `git-remote-cawco <remote> <url>`, inside the boundary: sends the URL on
 * the door, then copies stdin to the door (half-closing it when git closes
 * stdin) and the door to stdout, and ends when the host closes the door.
 * Perl, as the boundary's runner already uses: no other tool is assumed
 * inside.
 */
const HELPER = `#!/usr/bin/perl
# CawCo: git's remote helper for the hub, through the workspace's git door.
use strict;
use warnings;
use IO::Socket::UNIX;
use Socket qw(SOCK_STREAM);
my $door = $ENV{CAWCO_GIT_SOCKET} // '';
my $url = $ARGV[1] // '';
my $s = IO::Socket::UNIX->new(Type => SOCK_STREAM, Peer => $door)
  or die "cawco: the hub's git door ($door) is not open: $!\\n";
sub put { my ($fh, $buf) = @_; my $at = 0; while ($at < length $buf) { my $n = syswrite($fh, $buf, length($buf) - $at, $at); die "cawco: git door: $!\\n" unless defined $n; $at += $n; } }
put($s, "$url\\n");
my $writer = fork() // die "cawco: fork: $!\\n";
if ($writer == 0) {
  while (1) { my $n = sysread(STDIN, my $buf, 65536); last unless $n; put($s, $buf); }
  shutdown($s, 1);
  exit 0;
}
while (1) { my $n = sysread($s, my $buf, 65536); last unless $n; put(\\*STDOUT, $buf); }
kill 'TERM', $writer;
waitpid($writer, 0);
exit 0;
`;

const LINE_END = 10;

/** A command after which the helper protocol carries git's own packets, not lines. */
const CONNECT = /^(stateless-)?connect /;
const FORCED = /^\+/;

/** A push command's refspec (`push [+]<src>:<dst>`), its source and destination. */
const refspecOf = (line: string): { dst: string; src: string } => {
  const [src = "", dst = ""] = line
    .slice("push ".length)
    .replace(FORCED, "")
    .split(":");
  return { src, dst };
};

/**
 * The large files a push batch's sources reach, sent to the hub's LFS first:
 * `git lfs push origin <src>…` in the clone with this machine's credential
 * (Projects spec §5.1: "Large files go through Git LFS: the hub is the LFS
 * server for its remotes"). Inside the boundary git-lfs reaches no hub, and
 * CawCo's git runs no pre-push hook, so a push would otherwise land pointers
 * whose objects stay behind. Answers why the files did not go, or nothing.
 */
const pushLfs = async (
  ref: WorkspaceRef,
  sources: string[]
): Promise<string | undefined> => {
  if (sources.length === 0 || !Bun.which("git-lfs")) {
    return;
  }
  const child = Bun.spawn(safeGitArgv(["lfs", "push", "origin", ...sources]), {
    cwd: ref.path,
    env: { ...hubGitEnv(), ...SAFE_GIT_ENV, GIT_DIR: join(ref.path, ".git") },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, out, err] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code === 0) {
    return;
  }
  const said = withoutCredential(`${err}\n${out}`.trim())
    .split("\n")
    .filter(Boolean)
    .at(-1);
  console.warn(
    `[hub-git] ${ref.id}: git lfs push of ${sources.join(" ")} failed: ${said ?? `exit ${code}`}`
  );
  return `the large files did not reach the hub: ${said ?? `git lfs push exited ${code}`}`;
};

/** The clone's `origin` remote-tracking refs, each with the commit it is at. */
const remoteRefs = (clone: string): Map<string, string> => {
  const listed = Bun.spawnSync(
    safeGitArgv([
      "for-each-ref",
      "--format=%(objectname) %(refname)",
      "refs/remotes/origin/",
    ]),
    { cwd: clone, env: { ...process.env, ...SAFE_GIT_ENV } }
  );
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
 * The large files the trees of `refs` point at, fetched from the hub's LFS
 * into the clone's own store (`git lfs fetch origin <ref>…`, this machine's
 * credential): inside the boundary git-lfs reaches no hub, so a checkout or
 * rebase there onto a fetched commit (landing onto a newer default branch,
 * a session's own `git pull`) smudges from what is already here.
 */
const fetchLfs = async (ref: WorkspaceRef, refs: string[]): Promise<void> => {
  if (refs.length === 0 || !Bun.which("git-lfs")) {
    return;
  }
  const child = Bun.spawn(safeGitArgv(["lfs", "fetch", "origin", ...refs]), {
    cwd: ref.path,
    env: { ...hubGitEnv(), ...SAFE_GIT_ENV, GIT_DIR: join(ref.path, ".git") },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  });
  const [code, err] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) {
    throw new Error(
      `git lfs fetch of ${refs.join(" ")} failed: ${withoutCredential(err.trim()).split("\n").at(-1) ?? `exit ${code}`}`
    );
  }
};

/**
 * git's side of the helper protocol, fed to the host's helper by `write`: a
 * line at a time until a `connect` or `stateless-connect` turns it to git's
 * own packets, passed through as they come. A push batch (`push` lines, then
 * a blank one) is held until {@link pushLfs} has sent its large files; when
 * they did not go, the batch never reaches the helper and git is answered
 * `error <dst> <why>` for each ref (gitremote-helpers(7), "push").
 */
const protocolFeed = (
  ref: WorkspaceRef,
  socket: Socket,
  write: (bytes: Buffer | string) => void
) => {
  let raw = false;
  let pending = Buffer.alloc(0);
  let batch: string[] = [];
  const endBatch = async (): Promise<void> => {
    const lines = batch;
    batch = [];
    const refused = await pushLfs(
      ref,
      lines.map((line) => refspecOf(line).src).filter(Boolean)
    );
    if (refused) {
      socket.write(
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
        // biome-ignore lint/performance/noAwaitInLoops: a batch is answered before the next command is read
        await endBatch();
      } else {
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

/** One door connection: the URL line, then git's remote helper on the host, piped both ways. */
const serveConnection = (ref: WorkspaceRef, socket: Socket): void => {
  let head = Buffer.alloc(0);
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
    const url = head.subarray(0, end).toString().trim();
    const rest = head.subarray(end + 1);
    start(url, rest).catch((error: unknown) =>
      fail(error instanceof Error ? error.message : String(error))
    );
  };
  const start = async (url: string, rest: Buffer): Promise<void> => {
    const problem = await repositoryConfigProblem(join(ref.path, ".git"));
    if (problem) {
      throw new Error(`git did not run in ${ref.path}: ${problem}`);
    }
    const read = Bun.spawnSync(
      safeGitArgv(["config", "--get", "remote.origin.url"]),
      { cwd: ref.path, env: { ...process.env, ...SAFE_GIT_ENV } }
    );
    const origin = read.stdout.toString().trim();
    if (!(origin && origin === url && isHubRemote(origin))) {
      throw new Error(
        `${url} is not this workspace's origin on the hub, so the door does not take it`
      );
    }
    const scheme = new URL(url).protocol === "https:" ? "https" : "http";
    const child = spawn(
      "git",
      safeGitArgv([`remote-${scheme}`, "origin", url]).slice(1),
      {
        cwd: ref.path,
        env: {
          ...hubGitEnv(),
          ...SAFE_GIT_ENV,
          GIT_DIR: join(ref.path, ".git"),
        },
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    const before = remoteRefs(ref.path);
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
      const moved = code === 0 ? movedRefs(before, remoteRefs(ref.path)) : [];
      fetchLfs(ref, moved)
        .catch((error: unknown) =>
          console.warn(
            `[hub-git] ${ref.id}: ${error instanceof Error ? error.message : String(error)}`
          )
        )
        .finally(() => socket.end());
    });
    child.on("error", () => socket.destroy());
    child.stdin.on("error", () => undefined);
    socket.on("error", () => child.kill("SIGTERM"));
    socket.on("close", () => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
    });
    child.stdout.pipe(socket, { end: false });
    const feed = protocolFeed(ref, socket, (bytes) => child.stdin.write(bytes));
    let chain = feed(rest);
    socket.on("data", (chunk: Buffer) => {
      socket.pause();
      chain = chain
        .then(() => feed(chunk))
        .then(() => {
          socket.resume();
        })
        .catch((error: unknown) =>
          fail(error instanceof Error ? error.message : String(error))
        );
    });
    socket.on("end", () => {
      chain = chain.then(() => {
        child.stdin.end();
      });
    });
    socket.resume();
  };
  socket.on("data", onData);
  socket.on("error", () => undefined);
};

const doors = new Map<string, Server>();

/**
 * Serves workspace `ref`'s git door and writes its helper, once per agent:
 * a socket an earlier agent left is replaced. Without a hub there is
 * nothing to reach, and no door.
 */
export const openGitDoor = async (ref: WorkspaceRef): Promise<void> => {
  if (doors.has(ref.id)) {
    return;
  }
  const bin = gitHelperDirOf(ref.id);
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "git-remote-cawco"), HELPER, { mode: 0o755 });
  const path = gitDoorOf(ref.id);
  await prepareDoor(path);
  const server = createServer({ allowHalfOpen: true }, (socket) =>
    serveConnection(ref, socket)
  );
  doors.set(ref.id, server);
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(path, () => {
      server.off("error", fail);
      done();
    });
  });
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

/**
 * The variables every command in workspace `id` runs with: the door, and in
 * `CAWCO_GIT_PARAMETERS` the git config the runner appends to
 * `GIT_CONFIG_PARAMETERS` (git reads it as `-c` options) after it has set
 * srt's own over the request, which carries a `GIT_CONFIG_PARAMETERS` of its
 * own: the hub's `/git/` URLs rewritten to the `cawco::` helper, and that
 * transport allowed. When the clone at `clone`'s origin is the hub, also
 * `GIT_LFS_SKIP_PUSH=1` (git-lfs: "Do nothing on pre-push"): any git-lfs
 * command installs a pre-push hook, which inside the boundary reaches no
 * hub; the door sends a push's large files from the host ({@link pushLfs}).
 * A clone of an outside remote keeps its own LFS push. None without a hub.
 */
export const gitDoorEnv = (
  id: string,
  clone: string
): Record<string, string> => {
  const hub = process.env[CAWCO_ENV.hubUrl];
  if (!hub) {
    return {};
  }
  const url = new URL(hub);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  const prefix = `${url.origin}/git/`;
  const origin = Bun.spawnSync(
    safeGitArgv([
      "config",
      "--file",
      join(clone, ".git", "config"),
      "--get",
      "remote.origin.url",
    ]),
    { env: { ...process.env, ...SAFE_GIT_ENV } }
  )
    .stdout.toString()
    .trim();
  return {
    CAWCO_GIT_SOCKET: gitDoorOf(id),
    CAWCO_GIT_PARAMETERS: [
      [`url.cawco::${prefix}.insteadOf`, prefix],
      ["protocol.cawco.allow", "always"],
    ]
      .map(([key, value]) => `${shellWord(key)}=${shellWord(value)}`)
      .join(" "),
    ...(origin.startsWith(prefix) ? { GIT_LFS_SKIP_PUSH: "1" } : {}),
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
      const hub = process.env[CAWCO_ENV.hubUrl];
      const login = hubGitLogin();
      if (!(hub && login && request.method === "POST")) {
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
      const at = new URL(hub);
      const protocol = at.protocol === "wss:" ? "https" : "http";
      if (asked.get("protocol") !== protocol || asked.get("host") !== at.host) {
        return new Response("not the hub\n", { status: 404 });
      }
      return new Response(
        `username=${login.machineId}\npassword=${login.credential}\n`
      );
    },
  });
  await chmod(path, 0o600);
};
