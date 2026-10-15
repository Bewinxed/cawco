/**
 * A preview's way to a port inside a workspace (Linux). Every command of a
 * workspace runs in its boundary's own network (`boundary.ts`), so a dev
 * server a session there starts listens on the boundary's loopback, which the
 * host's does not reach. The agent bridges it: a socat joined to the
 * boundary's network, and to the user namespace that owns that network
 * ({@link JOIN}), listens on a unix socket in the agent's own runtime dir (a
 * path, so in no network) and connects each connection to 127.0.0.1:<port>
 * in there.
 *
 * Each request chooses its network: the newest generation of the workspace
 * whose sandbox runs and listens on the port, else the current one's
 * ({@link target}). A bridge is opened into it on the preview's first request,
 * and again whenever the request names another workspace or port, or the
 * network chosen is another one (a server started again in a newer
 * generation), or the one it had is gone: its socat exited,
 * or the boundary it joined closed (its init's network is not the one it
 * joined). It goes with its preview, and with the agent: it runs under
 * `setpriv --pdeathsig KILL`, and the hub starts each preview again at the
 * agent's next register. A workspace with no sandbox running answers
 * {@link WorkspaceDown}, judged off its generations' own files and `/proc`,
 * never a keeper's answer (`sandboxes` in boundary.ts); a port named for a
 * workspace is reached there, never on the host.
 */
import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { socketPathProblem } from "@cawco/core/paths";
import { DOWN_WORDS } from "@cawco/core/preview-proxy";
import type { Subprocess } from "bun";
import { listeners, workspaceNetworks } from "./boundary";

/** The workspace a preview names has no boundary running on this machine. */
export class WorkspaceDown extends Error {
  constructor() {
    super(DOWN_WORDS.workspace);
  }
}

/** Where the agent's tools are found: the system's dirs alone. */
const SYSTEM_PATH = "/usr/sbin:/usr/bin:/sbin:/bin";

/**
 * How a bridge joins a sandbox's network, a perl program run as `perl -e JOIN
 * <the sandbox's init> <nsenter> <command…>`. The sandbox's network is not
 * owned by its init's user namespace: srt's bwrap clones the network inside a
 * user namespace mapping the agent's uid to 0 (`--dev` needs root mapped),
 * then unshares a second one inside it that maps it back, and every process
 * of the sandbox lives in that second one. The kernel lets `setns` into a
 * network only to a caller with CAP_SYS_ADMIN over the network's owner and in
 * its own user namespace (`netns_install`). The agent holds both over the
 * owner, the user namespace its own uid made from its own; once it has joined
 * the inner one, it holds none over the owner, its parent (`cap_capable`). So
 * `nsenter --target <init> --user --net` works only on a util-linux that
 * enters both in one `setns` on a pidfd (2.40+, obelisk's 2.41.3), and fails
 * on one that enters them one by one (Ubuntu 24.04's 2.39.3, stage 2's rigs:
 * `reassociate to namespace 'ns/net' failed: Operation not permitted`).
 * Here the owner is read off the network itself (`ioctl(NS_GET_USERNS)`,
 * `_IO(0xb7, 1)`) and both go to nsenter as files, which it enters one by
 * one, the user namespace first, on every version.
 */
const JOIN = [
  'open(my $net, "<", "/proc/$ARGV[0]/ns/net") or die "cawco: the sandbox $ARGV[0] is gone ($!)\\n";',
  "my $owner = ioctl($net, 0xb701, 0);",
  'defined $owner or die "cawco: the user namespace that owns the network of the sandbox $ARGV[0] could not be read ($!)\\n";',
  'open(my $user, "<&=", $owner) or die "cawco: $!\\n";',
  'for ($net, $user) { fcntl($_, F_SETFD, 0) or die "cawco: $!\\n"; }',
  "my (undef, $nsenter, @command) = @ARGV;",
  'exec { $nsenter } $nsenter, "--user=/proc/self/fd/" . fileno($user), "--net=/proc/self/fd/" . fileno($net), "--preserve-credentials", @command;',
  'die "cawco: $nsenter could not run ($!)\\n";',
].join(" ");

/** How long a bridge has to put its socket down. Our call: socat binds in a few ms. */
const BRIDGE_START_MS = 3000;

/** The most of a bridge's stderr kept, to say why it did not start. */
const STDERR_KEPT = 2000;

const WORKSPACE_ID = /^[0-9a-f-]{36}$/;

/**
 * What a bridge reaches: `port` of workspace `workspace`, in the network of
 * the sandbox whose init is `inner`. A preview may be pointed at another
 * workspace or port in turn (an orchestrator showing each delegate's dev
 * server): a bridge serves a request only when it reaches what the request
 * names ({@link sameReach}).
 */
interface Reach {
  readonly inner: number;
  readonly port: number;
  readonly workspace: string;
}

interface Bridge extends Reach {
  /** The network it joined, as its sandbox init's `ns/net` read then. */
  readonly net: string;
  readonly proc: Subprocess<"ignore", "ignore", "pipe">;
  readonly socket: string;
}

const sameReach = (a: Reach, b: Reach): boolean =>
  a.workspace === b.workspace && a.port === b.port && a.inner === b.inner;

/** Each preview's bridge, by its instance id. */
const bridges = new Map<string, Bridge>();
/** Each preview's bridge while it opens: one open, however many requests for the same reach ask. */
const opening = new Map<string, Reach & { readonly socket: Promise<string> }>();
/**
 * How many times each preview was stopped: an open that finds the count
 * changed once its spawn settles was stopped under it, and takes down what it
 * made instead of registering it (a stop wins).
 */
const stops = new Map<string, number>();
/** The previews (macOS) whose workspace's network is the host's, each with that workspace. */
const onHost = new Map<string, string>();

/** The agent's own dir for bridge sockets, beside its other sockets; no workspace reads it. */
const bridgeDir = (): string => {
  const runtime = process.env.XDG_RUNTIME_DIR;
  return runtime
    ? join(runtime, "cawco", "previews")
    : join(homedir(), ".cawco", "previews");
};

const netOf = (pid: number): string | undefined => {
  try {
    return readlinkSync(`/proc/${pid}/ns/net`);
  } catch {
    // Gone: the sandbox closed.
  }
};

const PID = /^\d+$/;

const tool = (name: string): string => {
  const found = Bun.which(name, { PATH: SYSTEM_PATH });
  if (!found) {
    throw new Error(
      `${name} is not on this machine, so a workspace's server can't be previewed (install util-linux, socat and perl).`
    );
  }
  return found;
};

/** How long a stopped bridge's processes have to be gone. Our call: SIGKILL lands in milliseconds. */
const BRIDGE_STOP_MS = 2000;

/** The process group `pgid`'s members still running; none when `/proc` cannot say. */
const inGroup = (pgid: number): number[] =>
  readdirSync("/proc").flatMap((entry) => {
    if (!PID.test(entry)) {
      return [];
    }
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
      // Fields after the command's closing paren: state, ppid, pgrp, …
      const pgrp = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[2]);
      return pgrp === pgid ? [Number(entry)] : [];
    } catch {
      // Gone as it was read.
      return [];
    }
  });

/**
 * Stops preview `instanceId`'s bridge with every connection it holds: the
 * bridge leads a process group of its own ({@link open}), and socat's child
 * for each connection, a browser's open HMR socket among them, is in it. The
 * whole group is killed at once, so the caller that cannot wait (the agent's
 * own detach) still takes all of it; the promise settles once none of it
 * runs. A bridge still opening is stopped too: its open sees the stop once
 * its spawn settles and takes down what it made, and this waits for that.
 */
export const closeBridge = async (instanceId: string): Promise<void> => {
  stops.set(instanceId, (stops.get(instanceId) ?? 0) + 1);
  await opening.get(instanceId)?.socket.catch(() => {
    // Its open was stopped, or failed: nothing of it stands.
  });
  await teardown(instanceId);
};

/** Kills `instanceId`'s registered bridge, its whole group, and removes its socket. */
const teardown = async (instanceId: string): Promise<void> => {
  onHost.delete(instanceId);
  const bridge = bridges.get(instanceId);
  if (!bridge) {
    return;
  }
  bridges.delete(instanceId);
  await killGroup(instanceId, bridge.proc, bridge.socket);
};

/** Kills the process group `proc` leads and removes `socket`; settles once none of the group runs. */
const killGroup = async (
  instanceId: string,
  proc: Bridge["proc"],
  socket: string
): Promise<void> => {
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    // The group is gone already.
  }
  await rm(socket, { force: true });
  await proc.exited;
  const deadline = Date.now() + BRIDGE_STOP_MS;
  while (inGroup(proc.pid).length > 0 && Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: polls until the group's last connection is gone, or the deadline passes
    await Bun.sleep(10);
  }
  const left = inGroup(proc.pid);
  if (left.length > 0) {
    console.warn(
      `[preview] the bridge for ${instanceId} left ${left.join(", ")} running ${BRIDGE_STOP_MS / 1000}s after it was stopped`
    );
  }
};

/** The preview was stopped while its bridge opened; nothing of the bridge stands. */
class BridgeStopped extends Error {
  constructor() {
    super("The preview was stopped while its way into the workspace opened.");
  }
}

const alive = (bridge: Bridge): boolean =>
  bridge.proc.exitCode === null &&
  bridge.proc.signalCode === null &&
  netOf(bridge.inner) === bridge.net;

/**
 * Where `port` of workspace `workspace` is served now: the network of the
 * newest generation whose sandbox runs and listens on it, else the current
 * one's (`workspaceNetworks` lists them newest first); `host` on macOS.
 * Throws {@link WorkspaceDown} when no sandbox of the workspace runs.
 */
const target = async (
  workspace: string,
  port: number
): Promise<number | "host"> => {
  const networks = await workspaceNetworks(workspace);
  const [first] = networks;
  if (!first) {
    throw new WorkspaceDown();
  }
  if (first === "host") {
    return "host";
  }
  const inners = networks.flatMap((network) =>
    network === "host" ? [] : [network.inner]
  );
  const listens = await Promise.all(
    inners.map(async (inner) =>
      (await listeners(inner)).some((one) => one.port === port)
    )
  );
  return inners[listens.indexOf(true)] ?? first.inner;
};

/** Opens preview `instanceId`'s bridge to `reach`, replacing the one it had. */
const open = async (instanceId: string, reach: Reach): Promise<string> => {
  const { inner, port, workspace } = reach;
  const stop = stops.get(instanceId);
  const stopped = () => stops.get(instanceId) !== stop;
  await teardown(instanceId);
  if (stopped()) {
    throw new BridgeStopped();
  }
  const net = netOf(inner);
  if (!net) {
    throw new WorkspaceDown();
  }
  const dir = bridgeDir();
  const socket = join(dir, `${instanceId}.sock`);
  const problem = socketPathProblem(socket, "A preview's bridge socket");
  if (problem) {
    throw new Error(problem);
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await rm(socket, { force: true });
  // `setsid` execs in place (a child is no group leader), so the bridge's pid
  // leads a process group of its own, which every connection's child joins.
  const proc = Bun.spawn(
    [
      tool("setsid"),
      tool("setpriv"),
      "--pdeathsig",
      "KILL",
      tool("perl"),
      "-MFcntl=F_SETFD",
      "-e",
      JOIN,
      String(inner),
      tool("nsenter"),
      tool("socat"),
      `UNIX-LISTEN:${socket},fork`,
      `TCP:127.0.0.1:${port}`,
    ],
    {
      env: { PATH: SYSTEM_PATH },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    }
  );
  // Read always, so socat's line for each refused connection never fills the
  // pipe; the last of it says why a bridge did not start.
  let said = "";
  const draining = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of proc.stderr) {
      said = (said + decoder.decode(chunk, { stream: true })).slice(
        -STDERR_KEPT
      );
    }
  })();
  const deadline = Date.now() + BRIDGE_START_MS;
  const exited = () => proc.exitCode !== null || proc.signalCode !== null;
  while (!(existsSync(socket) || exited() || Date.now() > deadline)) {
    // biome-ignore lint/performance/noAwaitInLoops: polls for the socket until socat binds it, exits, or the deadline passes
    await Bun.sleep(10);
  }
  if (exited()) {
    await draining;
    throw new Error(
      `The way into workspace ${workspace}'s network did not open: ${said.trim() || `status ${proc.exitCode ?? proc.signalCode}`}`
    );
  }
  if (!existsSync(socket)) {
    proc.kill("SIGKILL");
    throw new Error(
      `The way into workspace ${workspace}'s network did not open within ${BRIDGE_START_MS / 1000}s.`
    );
  }
  if (stopped()) {
    // Stopped while it spawned: the stop waits on this open, so what it made goes now.
    await killGroup(instanceId, proc, socket);
    throw new BridgeStopped();
  }
  bridges.set(instanceId, { ...reach, net, proc, socket });
  return socket;
};

/** Whether no boundary of workspace `workspace` runs on this machine now. */
export const workspaceGone = async (workspace: string): Promise<boolean> =>
  (await workspaceNetworks(workspace)).length === 0;

/**
 * Where one request of preview `instanceId` for workspace `workspace`'s
 * `port` goes, chosen for each request ({@link target}): the socket of a
 * bridge that reaches exactly that workspace, port and network, the preview's
 * own when it does and still runs, else one opened now in its place; `host`
 * on macOS, whose boundaries share the host's network. A bridge is never held
 * to what it first opened for: once the preview names another workspace or
 * port, or a newer generation listens on the port (its server started again
 * there), the next request goes there. One bridge per preview at a time: an
 * open under way for another reach finishes before this one's starts. Throws
 * {@link WorkspaceDown} when no sandbox of the workspace runs here; a request
 * that then finds nothing answering asks {@link workspaceGone}.
 */
export const reachWorkspace = async (
  instanceId: string,
  workspace: string,
  port: number
): Promise<string | "host"> => {
  if (!WORKSPACE_ID.test(workspace)) {
    throw new Error(`${workspace} is not a workspace id.`);
  }
  if (onHost.get(instanceId) === workspace) {
    return "host";
  }
  const inner = await target(workspace, port);
  if (inner === "host") {
    onHost.set(instanceId, workspace);
    return "host";
  }
  onHost.delete(instanceId);
  const reach: Reach = { inner, port, workspace };
  for (;;) {
    const pending = opening.get(instanceId);
    if (!pending) {
      break;
    }
    if (sameReach(pending, reach)) {
      return pending.socket;
    }
    // biome-ignore lint/performance/noAwaitInLoops: waits out each open for another reach in turn, until none is under way
    await pending.socket.catch(() => {
      // Its own request was told why; this one opens its own below.
    });
  }
  const bridge = bridges.get(instanceId);
  if (bridge && sameReach(bridge, reach) && alive(bridge)) {
    return bridge.socket;
  }
  const socket = open(instanceId, reach).finally(() => {
    if (opening.get(instanceId)?.socket === socket) {
      opening.delete(instanceId);
    }
  });
  opening.set(instanceId, { ...reach, socket });
  return socket;
};
