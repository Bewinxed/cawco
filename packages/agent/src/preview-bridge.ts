/**
 * A preview's way to a port inside a workspace (Linux). Every command of a
 * workspace runs in its boundary's own network (`boundary.ts`), so a dev
 * server a session there starts listens on the boundary's loopback, which the
 * host's does not reach. The agent bridges it: a socat joined to the
 * boundary's user and network namespaces, by `nsenter --target <its sandbox's
 * init> --user --net --preserve-credentials`, listens on a unix socket in the
 * agent's own runtime dir (a path, so in no network) and connects each
 * connection to 127.0.0.1:<port> in there. The agent runs as the user whose
 * process made that user namespace, so it may join it; joining the parent
 * user namespace is refused (obelisk, 2026-10-13: `nsenter: reassociate to
 * namespaces failed: Operation not permitted` for `--user-parent`, the page
 * for `--user --net`).
 *
 * A bridge is opened on the preview's first request and again whenever the
 * one it had is gone: its socat exited, or the boundary it joined closed (its
 * init's network is not the one it joined). It goes with its preview, and
 * with the agent: it runs under `setpriv --pdeathsig KILL`, and the hub
 * starts each preview again at the agent's next register. A workspace with no
 * boundary running answers {@link WorkspaceDown}; a port named for a
 * workspace is reached there, never on the host.
 */
import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { socketPathProblem } from "@cawco/core/paths";
import { DOWN_WORDS } from "@cawco/core/preview-proxy";
import type { Subprocess } from "bun";
import { workspaceNetworks } from "./boundary";

/** The workspace a preview names has no boundary running on this machine. */
export class WorkspaceDown extends Error {
  constructor() {
    super(DOWN_WORDS.workspace);
  }
}

/** Where the agent's tools are found: the system's dirs alone. */
const SYSTEM_PATH = "/usr/sbin:/usr/bin:/sbin:/bin";

/** How long a bridge has to put its socket down. Our call: socat binds in a few ms. */
const BRIDGE_START_MS = 3000;

/** The most of a bridge's stderr kept, to say why it did not start. */
const STDERR_KEPT = 2000;

const WORKSPACE_ID = /^[0-9a-f-]{36}$/;

interface Bridge {
  readonly inner: number;
  /** The network it joined, as its sandbox init's `ns/net` read then. */
  readonly net: string;
  readonly proc: Subprocess<"ignore", "ignore", "pipe">;
  readonly socket: string;
}

/** Each preview's bridge, by its instance id. */
const bridges = new Map<string, Bridge>();
/** Each preview's bridge while it opens: one open, however many requests ask. */
const opening = new Map<string, Promise<string | "host">>();
/**
 * How many times each preview was stopped: an open that finds the count
 * changed once its spawn settles was stopped under it, and takes down what it
 * made instead of registering it (a stop wins).
 */
const stops = new Map<string, number>();
/** The previews (macOS) whose workspace's network is the host's. */
const onHost = new Set<string>();

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

const FIELDS = /\s+/;
const PID = /^\d+$/;

/** Whether something in `inner`'s network listens on TCP `port`. */
const listening = (inner: number, port: number): boolean => {
  const hex = `:${port.toString(16).toUpperCase().padStart(4, "0")}`;
  return ["tcp", "tcp6"].some((table) => {
    let text: string;
    try {
      text = readFileSync(`/proc/${inner}/net/${table}`, "utf8");
    } catch {
      return false;
    }
    return text
      .split("\n")
      .slice(1)
      .some((line) => {
        const [, local, , state] = line.trim().split(FIELDS);
        return state === "0A" && local?.endsWith(hex) === true;
      });
  });
};

const tool = (name: string): string => {
  const found = Bun.which(name, { PATH: SYSTEM_PATH });
  if (!found) {
    throw new Error(
      `${name} is not on this machine, so a workspace's server can't be previewed (install util-linux and socat).`
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
  await opening.get(instanceId)?.catch(() => {
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
 * Opens a bridge into the workspace's network that serves `port`: the one
 * where something listens on it, else the current boundary's.
 */
const open = async (
  instanceId: string,
  workspace: string,
  port: number
): Promise<string | "host"> => {
  const stop = stops.get(instanceId);
  const stopped = () => stops.get(instanceId) !== stop;
  await teardown(instanceId);
  const networks = await workspaceNetworks(workspace);
  if (stopped()) {
    throw new BridgeStopped();
  }
  const [first] = networks;
  if (!first) {
    throw new WorkspaceDown();
  }
  if (first === "host") {
    onHost.add(instanceId);
    return "host";
  }
  const { inner } =
    networks.find(
      (network): network is { inner: number } =>
        network !== "host" && listening(network.inner, port)
    ) ?? first;
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
      tool("nsenter"),
      "--target",
      String(inner),
      "--user",
      "--net",
      "--preserve-credentials",
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
  bridges.set(instanceId, { inner, net, proc, socket });
  return socket;
};

/** Whether no boundary of workspace `workspace` runs on this machine now. */
export const workspaceGone = async (workspace: string): Promise<boolean> =>
  (await workspaceNetworks(workspace)).length === 0;

/**
 * Where preview `instanceId`'s requests for workspace `workspace`'s `port` go:
 * the socket of its bridge into the workspace's network, opened now when it
 * has none that still reaches there; `host` on macOS, whose boundaries share
 * the host's network. Throws {@link WorkspaceDown} when no boundary of the
 * workspace runs here; a request that then finds nothing answering asks
 * {@link workspaceGone}.
 */
export const reachWorkspace = (
  instanceId: string,
  workspace: string,
  port: number
): Promise<string | "host"> => {
  if (!WORKSPACE_ID.test(workspace)) {
    return Promise.reject(new Error(`${workspace} is not a workspace id.`));
  }
  if (onHost.has(instanceId)) {
    return Promise.resolve("host");
  }
  const bridge = bridges.get(instanceId);
  if (bridge && alive(bridge)) {
    return Promise.resolve(bridge.socket);
  }
  let pending = opening.get(instanceId);
  if (!pending) {
    pending = open(instanceId, workspace, port).finally(() =>
      opening.delete(instanceId)
    );
    opening.set(instanceId, pending);
  }
  return pending;
};
