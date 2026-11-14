/** A workspace's folders on its machine: state, scratch, sockets and what its policy reads. */

import { readlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { shortLink } from "../socket-root";
import { darwinSocketRoot, workspaceScratchRoot } from "./roots";

/**
 * The one cache every workspace on this machine shares, and no host process
 * ever reads: bun's and npm's package caches, the XDG cache, uv's, and on
 * macOS Xcode's DerivedData and SwiftPM's. Every host cache is read-only
 * inside a workspace, so nothing a workspace writes reaches a file the host
 * runs; bun links a workspace's `node_modules` to the files here, never to the
 * host's.
 */
export const workspaceCacheDir = (): string =>
  join(homedir(), ".cawco", "workspace-cache");

/**
 * Where a workspace's unlanded work is saved when a person archives it
 * anyway (core `WorkspaceUnlanded` `carry`), one folder per archive: outside
 * every workspace's reach, so no workspace writes or deletes one.
 */
export const workspaceCarriesDir = (): string =>
  join(homedir(), ".cawco", "carries");

/** Where every workspace's boundary keeps its state, one dir per workspace; read-only inside the boundary. */
export const workspacesDir = (): string =>
  join(homedir(), ".cawco", "workspaces");

/** One workspace's state dir: its executor, hook, policy and boundary record. */
export const workspaceStateDir = (id: string): string =>
  join(workspacesDir(), id);

/**
 * The longest name a tool puts a unix socket at under `$TMPDIR` that a
 * workspace runs: Chromium's process singleton,
 * `org.chromium.Chromium.XXXXXX/SingletonSocket` (45 bytes with its `/`),
 * which aborts the browser at launch when the whole path passes
 * {@link UNIX_SOCKET_PATH_MAX} ("Socket path too long",
 * process_singleton_posix.cc).
 */
const SCRATCH_SOCKET_SUFFIX = "org.chromium.Chromium.XXXXXX/SingletonSocket";

/**
 * A workspace's scratch dir, its `TMPDIR`: in {@link workspaceScratchRoot},
 * named by the id's first 8 characters, as its clone (`<repo>-<id8>`),
 * branch (`ws/<id8>`) and door dir are. `~/.cawco/tmp/<id8>` is 34 bytes
 * under `/home/bewinxed`, so a socket at {@link SCRATCH_SOCKET_SUFFIX} in it
 * fits {@link UNIX_SOCKET_PATH_MAX} with room for a HOME 28 bytes longer.
 * Never inside the state dir: under it the path took 71 bytes and every
 * Chromium launch in a workspace aborted.
 */
export const workspaceScratchDir = (id: string): string =>
  join(workspaceScratchRoot(), id.slice(0, 8));

/**
 * A session with no work item's own scratch dir, where what another session
 * hands it lands (`inputs/`, agent inputs.ts `inputsHome`): in
 * {@link workspaceScratchRoot} beside the workspaces', `s-` and its id's
 * first 8 characters, so it is never a workspace's. It goes when the hub
 * forgets the session (agent session.ts `#stop`).
 */
export const sessionScratchDir = (instanceId: string): string =>
  join(workspaceScratchRoot(), `s-${instanceId.slice(0, 8)}`);

/**
 * The name a workspace's commands are given for its scratch dir, their
 * `TMPDIR`: on macOS its short name, `/private/tmp/cawco-<uid>/t-<id8>`
 * ({@link shortLink}, made by {@link linkWorkspaceTmp} before the boundary
 * starts), so a socket a tool binds there (Chromium's process singleton,
 * {@link SCRATCH_SOCKET_SUFFIX}) fits whatever the username, while its files
 * stay on disk in {@link workspaceScratchDir}; elsewhere the scratch dir.
 */
export const workspaceTmpDir = (id: string): string =>
  process.platform === "darwin"
    ? join(darwinSocketRoot(), scratchLinkName(id))
    : workspaceScratchDir(id);

/** {@link workspaceTmpDir}, its short name made or made again first on macOS. */
export const linkWorkspaceTmp = (id: string): string =>
  process.platform === "darwin"
    ? shortLink(scratchLinkName(id), workspaceScratchDir(id))
    : workspaceScratchDir(id);

/**
 * macOS: removes workspace `id`'s short name ({@link workspaceTmpDir}) as
 * the workspace goes, when it names that workspace's scratch dir and nothing
 * else; a name pointed elsewhere is not this workspace's to take. Nothing
 * elsewhere.
 */
export const forgetWorkspaceTmp = (id: string): void => {
  if (process.platform !== "darwin") {
    return;
  }
  const link = workspaceTmpDir(id);
  try {
    if (readlinkSync(link) === workspaceScratchDir(id)) {
      unlinkSync(link);
    }
  } catch {
    // Not there, or not a link: nothing of this workspace's to remove.
  }
};

/** Why a socket in workspace `id`'s `TMPDIR` would not fit, or nothing ({@link socketPathProblem}). */
export const scratchSocketProblem = (id: string): string | undefined =>
  socketPathProblem(
    join(workspaceTmpDir(id), SCRATCH_SOCKET_SUFFIX),
    `A socket in workspace ${id}'s TMPDIR, as Chromium makes one,`,
    "run the agent with a shorter HOME"
  );

/**
 * The part of a workspace's state dir a command inside its boundary reads:
 * the runner's FIFO, the empty git template, on Linux without a runtime dir
 * the doors' sockets ({@link workspaceDoorDir}) and, on macOS, the shims. Read-only inside, and never a parent of the scratch dir:
 * srt binds a writable dir nested in a read carve-out back read-only (srt
 * #446).
 */
export const workspaceReadOnlyDir = (id: string): string =>
  join(workspaceStateDir(id), "ro");

/**
 * The temp root of every Claude Code CLI a workspace's sessions run
 * (`CLAUDE_CODE_TMPDIR`), in {@link workspaceReadOnlyDir}: the CLI writes it
 * on the host, and a command inside the boundary reads it, so a background
 * task's output (`<root>/claude-<uid>/<project>/<session>/tasks/*.output`)
 * is there for the session's shell as for its Read. Never the scratch dir:
 * the CLI also runs git and loads plugins from that root on the host, which
 * no workspace may write.
 */
export const workspaceClaudeTmpDir = (id: string): string =>
  join(workspaceReadOnlyDir(id), "claude-tmp");

/** The short name of workspace `id`'s scratch dir on macOS ({@link shortLink}). */
const scratchLinkName = (id: string): string => `t-${id.slice(0, 8)}`;

/**
 * Where a workspace's unix sockets are: its tool door, its git door and its
 * judges'. A socket's path holds at most {@link UNIX_SOCKET_PATH_MAX} bytes,
 * and one in the state dir passes that under a HOME longer than 17 bytes
 * (`~/.cawco/workspaces/<id>/ro/judge-<16 hex>.sock` is HOME + 86), so never
 * under home:
 *  - on Linux, a dir of its own under `$XDG_RUNTIME_DIR`, as srt keeps its
 *    own sockets there, named by the id's first 8 characters, as its clone
 *    (`<repo>-<id8>`) and branch (`ws/<id8>`) are;
 *  - on macOS, the id's own dir under {@link darwinSocketRoot}: the whole
 *    id, so no two workspaces share one, and the judge's path is 86 bytes for
 *    uid 501, 95 for the longest uid;
 *  - on Linux without a runtime dir, the read-only dir.
 * Each is read-only inside the boundary, as the read-only dir is (a
 * workspace never binds a socket in its own door's place), and goes when the
 * boundary closes. The doors are read inside the boundary; the judges are
 * asked from the host.
 */
export const workspaceDoorDir = (id: string): string => {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (process.platform === "linux" && runtime) {
    return join(runtime, "cawco-ws", id.slice(0, 8));
  }
  if (process.platform === "darwin") {
    return join(darwinSocketRoot(), id);
  }
  return workspaceReadOnlyDir(id);
};

/**
 * The most bytes a unix socket's path holds: `sun_path` is 108 bytes on
 * Linux and 104 on macOS, its NUL included. A longer one is cut short by
 * whoever packs it (perl's `pack_sockaddr_un` among them), so a listener
 * and a caller never meet.
 */
const UNIX_SOCKET_PATH_MAX = process.platform === "darwin" ? 103 : 107;

/**
 * Why `path` cannot be a unix socket's, or nothing: refused up front, in
 * words that say what to change.
 */
export const socketPathProblem = (
  path: string,
  what: string,
  fix = process.platform === "linux"
    ? "give the agent a short XDG_RUNTIME_DIR"
    : "run the agent with a shorter HOME"
): string | undefined => {
  const bytes = Buffer.byteLength(path);
  if (bytes <= UNIX_SOCKET_PATH_MAX) {
    return;
  }
  return `${what} ${path} is ${bytes} bytes, past the ${UNIX_SOCKET_PATH_MAX} a unix socket's path holds: ${fix}`;
};

/** The name of a workspace's policy file in its state dir. */
export const WORKSPACE_POLICY_NAME = "policy.json";

/** Where a workspace's policy is written (`workspace-policy.ts`), for every harness to judge its file tools by. */
export const workspacePolicyFile = (id: string): string =>
  join(workspaceStateDir(id), WORKSPACE_POLICY_NAME);

/**
 * The Claude accounts a workspace's sessions have run on, a JSON list of
 * account ids the agent adds to as each session spawns there
 * (`boundaryFor`), so the workspace reads each one's user layer by the path
 * its session is given (`workspacePolicy`). In the state dir, which nothing
 * inside the boundary writes.
 */
export const workspaceAccountsFile = (id: string): string =>
  join(workspaceStateDir(id), "accounts.json");

/**
 * The folders a workspace's sessions' harnesses save a tool result too large
 * to hand the model in, a JSON list of absolute paths the agent adds to as
 * each session spawns there (`boundaryFor`), one per session, so the
 * workspace reads each (`workspacePolicy`). In the state dir, which nothing
 * inside the boundary writes.
 */
export const workspaceSpillsFile = (id: string): string =>
  join(workspaceStateDir(id), "spills.json");

/** The dir in a workspace's state dir that holds each {@link workspaceSpillDir}. */
export const SPILLS_DIR_NAME = "spills";

/**
 * Where workspace `id`'s pi or OpenCode session `instanceId` keeps its
 * harness's saved tool results ({@link workspaceSpillsFile}): in the state
 * dir, which nothing inside the boundary writes, so a command reads them and
 * never puts a file or a link there for the host to write through.
 */
export const workspaceSpillDir = (id: string, instanceId: string): string =>
  join(workspaceStateDir(id), SPILLS_DIR_NAME, instanceId);

/**
 * The project a workspace's work belongs to, a JSON string of its id the
 * agent writes as the workspace is cut and as each work item's session
 * spawns there (`boundaryFor`), so the workspace reads that project's folder
 * on the hub's machine (`workspacePolicy`). In the state dir, which nothing
 * inside the boundary writes.
 */
export const workspaceProjectFile = (id: string): string =>
  join(workspaceStateDir(id), "project.json");
