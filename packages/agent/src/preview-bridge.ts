/**
 * A preview's way to a port inside a workspace (Linux). Every command of a
 * workspace runs in its boundary's own network (`boundary/`), so a dev
 * server a session there starts listens on the boundary's loopback, which the
 * host's does not reach. The agent bridges it: a relay (bridge-relay.ts
 * `bridgeRelay`, one bun process on CawCo's own runtime) joined to the
 * boundary's network, and
 * to the user namespace that owns that network ({@link JOIN}), listens on a
 * unix socket in the agent's own runtime dir (a path, so in no network) and
 * carries each connection to 127.0.0.1:<port> in there, every connection on
 * its one event loop.
 *
 * Each request chooses its network: the newest generation of the workspace
 * whose sandbox runs and listens on the port, else the current one's
 * ({@link target}). A bridge is opened into it on the preview's first request,
 * and again whenever the request names another workspace or port, or the
 * network chosen is another one (a server started again in a newer
 * generation), or the one it had is gone: its relay exited,
 * or the boundary it joined closed (its init's network is not the one it
 * joined). It goes with its preview, and with the agent: it runs under
 * `setpriv --pdeathsig KILL`, and the hub starts each preview again at the
 * agent's next register. A workspace with no sandbox running answers
 * {@link WorkspaceDown}, judged off its generations' own files and `/proc`,
 * never a keeper's answer (`sandboxes` in boundary/); a port named for a
 * workspace is reached there, never on the host.
 */

import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { makeJoin } from "@cawco/core/effect/join";
import { lookUntil } from "@cawco/core/effect/poll";
import { makeFolder } from "@cawco/core/folders";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import { OUTPUT_TAIL_KEPT } from "@cawco/core/output-tail";
import { socketPathProblem } from "@cawco/core/paths/workspace";
import { PreviewStartDown } from "@cawco/core/preview/protocol";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import { newTail, saidTail, writeTail } from "@cawco/core/words/helpers";
import { DOWN_WORDS } from "@cawco/core/words/preview-down";
import { isWorkspaceId } from "@cawco/core/workspace-id";
import { systemProgram, trustedPath } from "@cawco/core/workspace-needs";
import type { Subprocess } from "bun";
import { Effect, Exit, Schema } from "effect";
import { listeners, workspaceNetworks } from "./boundary/sandboxes";
import { bridgeRelay } from "./bridge-relay";
import { runPromise } from "./daemon-runtime";
import { fromPromise } from "./rejected";

/** The workspace a preview names has no boundary running on this machine. */
export class WorkspaceDown extends PreviewStartDown {
  constructor() {
    super("workspace", DOWN_WORDS.workspace);
  }
}

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

/** How long a bridge has to put its socket down. Our call: the relay binds in well under a second. */
const BRIDGE_START_MS = 3000;

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
/**
 * Each preview's opens and stops of its bridge, one after another, first
 * asked first: an open for another reach finishes before the next starts,
 * and a stop waits for the open under way, then takes down what it made.
 */
const turns = makeKeyedLock<string>();
/** Requests for one reach of one preview share one turn: one open, however many of them ask while it is under way. */
const sharing = makeJoin<string, string, Error>();
/**
 * How many times each preview was stopped: an open asked for before a stop
 * finds the count changed once its spawn settles, and takes down what it
 * made instead of registering it (a stop wins).
 */
const stops = new Map<string, number>();
/** The previews (macOS) whose workspace's network is the host's, each with that workspace. */
const onHost = new Map<string, string>();
/**
 * The previews whose scope has closed (preview.ts: a stop, or the start
 * before a new one), each until its next start ({@link previewStarting}):
 * a request its listener held when the stop came asks for its bridge no
 * sooner than now, and is refused rather than open one no stop would name.
 */
const ended = new Set<string>();

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

const PID = /^\d+$/u;

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
 * bridge leads a process group of its own ({@link open}), every connection
 * in its relay, a browser's open HMR socket among them. The whole group is
 * killed at once, so the caller that cannot wait (the agent's
 * own detach) still takes all of it; the promise settles once none of it
 * runs. A bridge still opening is stopped too: the stop is counted before
 * anything else runs, so every open asked for before it takes down what it
 * made once its spawn settles, and this waits its turn behind them.
 *
 * {@link teardown} in the preview's turn.
 */
export const bridgeClosed = (instanceId: string): Effect.Effect<void, Error> =>
  Effect.suspend(() => {
    stops.set(instanceId, (stops.get(instanceId) ?? 0) + 1);
    return turns.withLock(instanceId, teardown(instanceId));
  });

/** The promise edge of {@link bridgeClosed}. */
export const closeBridge = (instanceId: string): Promise<void> =>
  runPromise(bridgeClosed(instanceId));

/**
 * Preview `instanceId`'s scope closed: its bridge is closed as
 * {@link bridgeClosed} closes it, and every open for it is refused with
 * {@link BridgeStopped} until its next start ({@link previewStarting}).
 */
export const previewEnded = (instanceId: string): Effect.Effect<void, Error> =>
  Effect.suspend(() => {
    ended.add(instanceId);
    return bridgeClosed(instanceId);
  });

/** Preview `instanceId` starts: its requests may open its bridge again. */
export const previewStarting = (instanceId: string): void => {
  ended.delete(instanceId);
};

/** Kills `instanceId`'s registered bridge, its whole group, and removes its socket. */
const teardown = (instanceId: string): Effect.Effect<void, Error> =>
  Effect.suspend(() => {
    onHost.delete(instanceId);
    const bridge = bridges.get(instanceId);
    if (!bridge) {
      return Effect.void;
    }
    bridges.delete(instanceId);
    return killGroup(instanceId, bridge.proc, bridge.socket);
  });

/** A failure of a promise step, as the error it threw. */
const thrown = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/** Kills the process group `proc` leads and removes `socket`; ends once none of the group runs, or {@link BRIDGE_STOP_MS} on, said. */
const killGroup = (
  instanceId: string,
  proc: Bridge["proc"],
  socket: string
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    // Its socket is bound, so `setsid` has made it its group's leader.
    const leader = spawnedPid(proc);
    if (leader !== undefined) {
      signalGroup(leader, "SIGKILL");
    }
    yield* fromPromise(() => rm(socket, { force: true }));
    yield* Effect.promise(() => proc.exited);
    const left = yield* lookUntil(
      {
        every: 10,
        deadlineMs: BRIDGE_STOP_MS,
        until: (running: number[]) => running.length === 0,
      },
      Effect.sync(() => inGroup(proc.pid))
    );
    if (left.kind === "deadline") {
      yield* Effect.logWarning(
        `[preview] the bridge for ${instanceId} left ${left.last.join(", ")} running ${BRIDGE_STOP_MS / 1000}s after it was stopped`
      );
    }
  });

/** The preview was stopped before or while its bridge opened; nothing of the bridge stands. */
class BridgeStopped extends Schema.TaggedError<BridgeStopped>()(
  "BridgeStopped",
  {}
) {
  override get message(): string {
    return "The preview was stopped while its way into the workspace opened.";
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
 * Fails with {@link WorkspaceDown} when no sandbox of the workspace runs.
 */
const target = (
  workspace: string,
  port: number
): Effect.Effect<number | "host", Error> =>
  Effect.gen(function* () {
    const networks = yield* fromPromise(() => workspaceNetworks(workspace));
    const [first] = networks;
    if (!first) {
      return yield* Effect.fail(new WorkspaceDown());
    }
    if (first === "host") {
      return "host";
    }
    const inners = networks.flatMap((network) =>
      network === "host" ? [] : [network.inner]
    );
    const listens = yield* fromPromise(() =>
      Promise.all(
        inners.map(async (inner) =>
          (await listeners(inner)).some((one) => one.port === port)
        )
      )
    );
    return inners[listens.indexOf(true)] ?? first.inner;
  });

/** The bridge process to `inner`'s network for `relay`, leading a process group of its own. */
const spawnBridge = (
  inner: number,
  relay: ReturnType<typeof bridgeRelay>
): Bridge["proc"] =>
  // `setsid` execs in place (a child is no group leader), so the bridge's pid
  // leads a process group of its own.
  Bun.spawn(
    [
      systemProgram("setsid"),
      systemProgram("setpriv"),
      "--pdeathsig",
      "KILL",
      systemProgram("perl"),
      "-MFcntl=F_SETFD",
      "-e",
      JOIN,
      String(inner),
      systemProgram("nsenter"),
      ...relay.command,
    ],
    {
      env: { PATH: trustedPath(), ...relay.env },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    }
  );

/**
 * Opens preview `instanceId`'s bridge to `reach`, replacing the one it had;
 * `stop` is the preview's stop count when the open was asked for. The
 * bridge's process is held in the open's scope: an open that fails, or finds
 * itself stopped, kills its whole group and removes its socket; one that
 * opens hands it to {@link bridges}, which {@link teardown} stops.
 */
const open = (
  instanceId: string,
  reach: Reach,
  stop: number | undefined
): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    const { inner, port, workspace } = reach;
    const stopped = () =>
      stops.get(instanceId) !== stop || ended.has(instanceId);
    yield* teardown(instanceId);
    if (stopped()) {
      return yield* new BridgeStopped();
    }
    const net = netOf(inner);
    if (!net) {
      return yield* Effect.fail(new WorkspaceDown());
    }
    const dir = bridgeDir();
    const socket = join(dir, `${instanceId}.sock`);
    const problem = socketPathProblem(socket, "A preview's bridge socket");
    if (problem) {
      return yield* Effect.fail(new Error(problem));
    }
    yield* fromPromise(async () => {
      await makeFolder(dir, { mode: 0o700 });
      await rm(socket, { force: true });
    });
    const proc = yield* Effect.acquireRelease(
      Effect.try({
        try: () => spawnBridge(inner, bridgeRelay(socket, port)),
        catch: thrown,
      }),
      (made, exit) =>
        Exit.isFailure(exit)
          ? killGroup(instanceId, made, socket).pipe(
              Effect.catch((error) =>
                Effect.logWarning(
                  `[preview] the bridge for ${instanceId} that did not open was not taken down: ${error.message}`
                )
              )
            )
          : Effect.void
    );
    // Read always, so what the relay says never fills the pipe; the last of it
    // says why a bridge did not start.
    const said = newTail();
    const draining = (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of proc.stderr) {
        writeTail(
          said,
          decoder.decode(chunk, { stream: true }),
          OUTPUT_TAIL_KEPT
        );
      }
    })().catch(() => {
      // The pipe broke with its process: what it said before stands in `said`.
    });
    const exited = () => proc.exitCode !== null || proc.signalCode !== null;
    yield* lookUntil(
      { every: 10, deadlineMs: BRIDGE_START_MS, until: Boolean },
      Effect.sync(() => existsSync(socket) || exited())
    );
    if (exited()) {
      yield* Effect.promise(() => draining);
      return yield* Effect.fail(
        new Error(
          `The way into workspace ${workspace}'s network did not open: ${saidTail(said).trim() || `status ${proc.exitCode ?? proc.signalCode}`}`
        )
      );
    }
    if (!existsSync(socket)) {
      return yield* Effect.fail(
        new Error(
          `The way into workspace ${workspace}'s network did not open within ${BRIDGE_START_MS / 1000}s.`
        )
      );
    }
    if (stopped()) {
      // Stopped while it spawned: the stop waits its turn behind this open,
      // and what the open made goes as its scope closes.
      return yield* new BridgeStopped();
    }
    bridges.set(instanceId, { ...reach, net, proc, socket });
    return socket;
  }).pipe(Effect.scoped);

/** The socket of `instanceId`'s bridge to `reach`: its own when it reaches that and still runs, else one opened now. */
const bridgeTo = (
  instanceId: string,
  reach: Reach,
  stop: number | undefined
): Effect.Effect<string, Error> =>
  Effect.suspend(() => {
    const bridge = bridges.get(instanceId);
    return bridge && sameReach(bridge, reach) && alive(bridge)
      ? Effect.succeed(bridge.socket)
      : open(instanceId, reach, stop);
  });

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
 * open under way for another reach finishes before this one's starts. Fails
 * with {@link WorkspaceDown} when no sandbox of the workspace runs here; a
 * request that then finds nothing answering asks {@link workspaceGone}. A
 * preview whose scope has closed is refused ({@link previewEnded}).
 */
export const workspaceReached = (
  instanceId: string,
  workspace: string,
  port: number
): Effect.Effect<string | "host", Error> =>
  Effect.gen(function* () {
    // A stage runs in a boundary of any kind (core workspace-id.ts): a clone's, a place's stage clone's, a design folder's.
    if (!isWorkspaceId(workspace)) {
      return yield* Effect.fail(
        new Error(`${workspace} is not a workspace id.`)
      );
    }
    if (ended.has(instanceId)) {
      return yield* new BridgeStopped();
    }
    if (onHost.get(instanceId) === workspace) {
      return "host";
    }
    const inner = yield* target(workspace, port);
    if (inner === "host") {
      onHost.set(instanceId, workspace);
      return "host";
    }
    onHost.delete(instanceId);
    const reach: Reach = { inner, port, workspace };
    if (!turns.isBusy(instanceId)) {
      // Nothing opens or stops it: the bridge it has serves when it reaches this.
      const bridge = bridges.get(instanceId);
      if (bridge && sameReach(bridge, reach) && alive(bridge)) {
        return bridge.socket;
      }
    }
    // `bridgeTo` in the preview's turn, shared by every request for the
    // same reach while it is under way.
    return yield* sharing.run(
      JSON.stringify([instanceId, workspace, port, inner]),
      turns.withLock(
        instanceId,
        bridgeTo(instanceId, reach, stops.get(instanceId))
      )
    );
  });

/** The promise edge of {@link workspaceReached}. */
export const reachWorkspace = (
  instanceId: string,
  workspace: string,
  port: number
): Promise<string | "host"> =>
  runPromise(workspaceReached(instanceId, workspace, port));
