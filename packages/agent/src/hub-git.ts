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
 *   stdout through the workspace's git door, a unix socket in its read-only
 *   state dir.
 * - On the host the agent takes the door's connection and runs git's own
 *   HTTP helper (`git remote-http <remote> <url>`) in the clone with this
 *   machine's credential, env-only (move.ts {@link hubGitEnv}), after the
 *   clone's own config passed `repositoryConfigProblem` and only for the
 *   clone's own `origin`. Landing's fetch and push, `workspaceAt`'s fetch and
 *   a session's own `git fetch`/`git push` all run inside the boundary, so all
 *   take this one path.
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
import { hubCredentialSocket, workspaceReadOnlyDir } from "@cawco/core/paths";
import {
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  safeGitArgv,
} from "@cawco/core/safe-git";
import { hubGitEnv, hubGitLogin, isHubRemote, withoutCredential } from "./move";

/** A workspace's git door. */
export const gitDoorOf = (id: string): string =>
  join(workspaceReadOnlyDir(id), "git.sock");

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
    });
    child.on("error", () => socket.destroy());
    child.stdin.on("error", () => undefined);
    socket.on("error", () => child.kill("SIGTERM"));
    socket.on("close", () => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
    });
    if (rest.length > 0) {
      child.stdin.write(rest);
    }
    socket.pipe(child.stdin);
    child.stdout.pipe(socket);
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
  await rm(path, { force: true });
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

/** Stops serving workspace `id`'s git door. */
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
 * transport allowed. None without a hub.
 */
export const gitDoorEnv = (id: string): Record<string, string> => {
  const hub = process.env[CAWCO_ENV.hubUrl];
  if (!hub) {
    return {};
  }
  const url = new URL(hub);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  const prefix = `${url.origin}/git/`;
  return {
    CAWCO_GIT_SOCKET: gitDoorOf(id),
    CAWCO_GIT_PARAMETERS: [
      [`url.cawco::${prefix}.insteadOf`, prefix],
      ["protocol.cawco.allow", "always"],
    ]
      .map(([key, value]) => `${shellWord(key)}=${shellWord(value)}`)
      .join(" "),
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
