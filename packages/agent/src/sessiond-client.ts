/**
 * The agent's half of the sessiond protocol, and the SDK seam it exists for.
 *
 * Three things live here, in the order the spawn path meets them:
 *
 *  1. {@link serviceManaged} / {@link ensureSessiond} — the auto-spawn guard
 *     (design §11). An agent under a service manager must NEVER ad-hoc spawn
 *     sessiond: the child would land in the *agent's* cgroup and die with the
 *     next agent restart, which is precisely the `KillMode` trap this whole
 *     build exists to escape. Under a service, a missing sessiond is a loud
 *     install-time error; only a hand-run `cawco up` spawns one.
 *  2. {@link SessiondClient} — NDJSON over the unix socket: `spawn`/`write`/
 *     `signal`/`stdin_end`/`subscribe`/`list`, `commandId` minted once per
 *     mutation so a re-delivery after a socket drop is re-acked rather than
 *     re-executed (design §8).
 *  3. {@link sessiondBridge} — the SDK's `spawnClaudeCodeProcess` hook
 *     (`sdk.d.ts:2053`, "Custom spawn logic for VM execution"). It hands us the
 *     command line it built; we forward it to sessiond and return a
 *     {@link SpawnedProcess} whose `stdin`/`stdout` are shims over the socket.
 *     The SDK cannot tell the difference — that is the contract the option
 *     exists to provide — but the child now lives under sessiond and outlives
 *     this process.
 *
 * Nothing here parses a child's bytes. Lines go in and out opaque; the meaning
 * is the claude adapter's business (`harnesses/claude.ts`).
 */

import { spawn as spawnProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { Socket } from "node:net";
import { dirname, join } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { LineSplitter } from "@cawco/core/lines";
import { PacedWriter } from "@cawco/core/paced-write";
import { standalone } from "@cawco/core/runtime";
// The protocol lives behind its own subpath on purpose: `sessiond.ts` reaches
// for `node:os`, and the core barrel is imported by the browser bundle.
import {
  type ProcSpec,
  SESSIOND_V1,
  type SessiondAck,
  type SessiondClientMessage,
  type SessiondLine,
  type SessiondProcInfo,
  type SessiondServerMessage,
  sessiondEndpoint,
} from "@cawco/core/sessiond";
import { KeeperRefused } from "./harness";
import { parseProcId } from "./proc-id";
import { holdRestart } from "./restart";

/**
 * What an update must wait for: the keeper's live children, less the OpenCode
 * server, which is the agent's own helper and is alive whenever the agent is.
 * Counting it would keep the keeper from ever moving on a machine that runs
 * OpenCode. Busy sessions are the busy check's to refuse.
 */
export const heldSessions = (procs: readonly SessiondProcInfo[]): number =>
  procs.filter(
    (proc) => proc.alive && parseProcId(proc.procId).kind !== "opencode-server"
  ).length;

/**
 * How long a dial or a `welcome` may take before the agent calls the endpoint
 * dead. Our choice: a unix socket on the same machine answers in microseconds,
 * so anything past a couple of seconds is a wedged daemon, not a slow one, and
 * the ad-hoc path needs a bound before it decides to spawn a replacement.
 */
export const DIAL_TIMEOUT_MS = 2000;

/**
 * How long the ad-hoc path waits for a freshly spawned sessiond to bind before
 * giving up. Our choice: a `bun` cold start plus a `listen()` is well under a
 * second on this fleet; 10 s is generous enough that a loaded machine still
 * wins, short enough that a broken install fails inside one spawn.
 */
export const ADHOC_START_TIMEOUT_MS = 10_000;

/**
 * Is this process owned by a service manager?
 *
 * - systemd sets `INVOCATION_ID` in the environment of every unit-started
 *   process (systemd.exec(5), "$INVOCATION_ID"). It is the cheapest true
 *   signal that a cgroup owns us.
 * - launchd's equivalent is `XPC_SERVICE_NAME`, which carries the job label
 *   for a launchd-started process. A login shell inherits the literal `0`
 *   placeholder instead, which is why the value — not merely its presence —
 *   is what decides.
 * - `CAWCO_SERVICE_MODE` is cawco's own unit-set marker
 *   (`cli/src/service.ts:45`, `MODE_ENV`); honoured here so a dev-mode unit is
 *   still recognised as service-managed.
 */
export const serviceManaged = (
  env: NodeJS.ProcessEnv = process.env
): boolean => {
  if (env.INVOCATION_ID) {
    return true;
  }
  if (env.CAWCO_SERVICE_MODE) {
    return true;
  }
  const xpc = env.XPC_SERVICE_NAME;
  return xpc !== undefined && xpc !== "" && xpc !== "0";
};

/**
 * A missing sessiond under service management. Deliberately its own type: the
 * caller must not paper over it with an ad-hoc spawn, and the message is the
 * whole fix.
 */
export class SessiondUnavailableError extends Error {
  readonly endpoint: string;

  constructor(endpoint: string) {
    super(
      `[sessiond] nothing is listening on ${endpoint}, and this agent is service-managed — ` +
        "refusing to ad-hoc spawn one (its children would land in the agent cgroup and die " +
        "with the next agent restart). Install and start the unit: `cawco service install` " +
        "then `systemctl --user start cawco-sessiond`."
    );
    this.name = "SessiondUnavailableError";
    this.endpoint = endpoint;
  }
}

/** Does something answer on this endpoint? The dial half of the §9 probe. */
export const probeEndpoint = (
  endpoint: string,
  timeoutMs = DIAL_TIMEOUT_MS
): Promise<boolean> =>
  new Promise((resolve) => {
    // Constructed unconnected, listeners first, THEN dialled: an `ENOENT` on a
    // socket with no `error` listener yet is an uncaught exception, and the
    // absent-endpoint case is the one this function exists to answer.
    const socket = new Socket();
    const settle = (answer: boolean): void => {
      socket.destroy();
      clearTimeout(timer);
      resolve(answer);
    };
    const timer = setTimeout(() => settle(false), timeoutMs);
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
    socket.connect(endpoint);
  });

/**
 * What one dial learned of the keeper: whether its `welcome` came, and if not,
 * how far the dial got. The keeper writes its welcome in the same turn of its
 * loop as the accept, so any answer but a welcome, from a keeper the service
 * manager says is running, is a loop that is not turning: one whose backlog
 * filled refuses or never completes a connect, one that still accepts says
 * nothing.
 */
export interface KeeperDial {
  answered: boolean;
  /** How the dial ended, in words for the log: `accepted, no welcome in 10000ms`. */
  detail: string;
}

const WELCOME_LINE = /"type"\s*:\s*"welcome"/;

/** One dial of the keeper, waiting `timeoutMs` for its welcome. */
export const dialKeeper = (
  endpoint: string,
  timeoutMs: number
): Promise<KeeperDial> =>
  new Promise((resolve) => {
    // Listeners before the dial, as in {@link probeEndpoint}.
    const socket = new Socket();
    let connected = false;
    const lines = new LineSplitter();
    const settle = (answered: boolean, detail: string): void => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ answered, detail });
    };
    const timer = setTimeout(
      () =>
        settle(
          false,
          connected
            ? `accepted, no welcome in ${timeoutMs}ms`
            : `connect did not complete in ${timeoutMs}ms`
        ),
      timeoutMs
    );
    socket.setEncoding("utf8");
    socket.once("connect", () => {
      connected = true;
    });
    socket.on("data", (chunk: string) => {
      const [first] = lines.push(chunk);
      if (first !== undefined) {
        settle(
          WELCOME_LINE.test(first),
          WELCOME_LINE.test(first) ? "welcome" : "first line was not a welcome"
        );
      }
    });
    socket.once("error", (error: NodeJS.ErrnoException) =>
      settle(
        false,
        connected
          ? `accepted, then ${error.code ?? error.message}`
          : `connect failed: ${error.code ?? error.message}`
      )
    );
    socket.connect(endpoint);
  });

/**
 * Defined only in the published package's bundle (scripts/build-binary.ts),
 * where this module is `cli.js` itself and sessiond is its `sessiond` verb.
 */
declare const __CAWCO_RELEASE__: boolean | undefined;

/** The ad-hoc sessiond command: this repo's own entry point, run under bun. */
const adhocCommand = (): { command: string; args: string[] } => {
  if (standalone) {
    return { command: process.execPath, args: ["sessiond"] };
  }
  return {
    command: process.execPath,
    args:
      typeof __CAWCO_RELEASE__ === "boolean"
        ? [fileURLToPath(import.meta.url), "sessiond"]
        : [
            join(
              dirname(fileURLToPath(import.meta.url)),
              "..",
              "..",
              "sessiond",
              "src",
              "main.ts"
            ),
          ],
  };
};

/**
 * Guarantee a sessiond is listening, or explain why there will not be one.
 *
 * The guard, restated because it is the reason this function is not a plain
 * "spawn if absent": under systemd/launchd a child spawned from here inherits
 * the agent's cgroup, so the next `systemctl restart cawco-agent` kills every
 * session — the exact failure sessiond was built to remove. Service mode gets a
 * loud error; ad-hoc mode gets a detached daemon.
 */
export const ensureSessiond = async (
  endpoint: string = sessiondEndpoint(),
  env: NodeJS.ProcessEnv = process.env
): Promise<void> => {
  if (await probeEndpoint(endpoint)) {
    return;
  }
  if (serviceManaged(env)) {
    throw new SessiondUnavailableError(endpoint);
  }

  const { command, args } = adhocCommand();
  const child = spawnProcess(command, args, {
    detached: true,
    stdio: "ignore",
    env: { ...env, CAWCO_SESSIOND_ENDPOINT: endpoint },
  });
  child.unref();

  const deadline = Date.now() + ADHOC_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: polls the freshly spawned daemon at a fixed interval until it binds or the deadline passes
    if (await probeEndpoint(endpoint, 250)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `[sessiond] spawned ${command} ${args.join(" ")} but it never bound ${endpoint}`
  );
};

/** What the agent learns the moment it attaches (design §7's epoch and heads). */
export interface SessiondWelcomeInfo {
  capabilities: readonly string[];
  epoch: string;
  procs: SessiondProcInfo[];
}

interface ProcListener {
  /**
   * The child is gone. Both arguments `null` means sessiond reported it dead
   * without saying how: a listing from a sessiond that predates the `signal`
   * field describes a child killed by a signal exactly that way.
   */
  exit?: (exitCode: number | null, signal: NodeJS.Signals | null) => void;
  line?: (event: SessiondLine) => void;
  /**
   * `nextSeq` is where this subscription resumes; `oldest` is the earliest
   * line sessiond can still serve, absent when it holds none (or when the
   * sessiond on the other end predates the field). A caller that only needs
   * to know it lost lines reads the first; one that wants to reopen on what
   * survives reads the second.
   */
  reset?: (nextSeq: number, oldest?: number) => void;
}

/**
 * One attached agent connection.
 *
 * Single-socket, single-threaded message handling — the same property the hub's
 * subscribe choreography relies on — so a backlog followed by live deltas is
 * gapless without any reordering buffer here.
 */
export class SessiondClient {
  readonly #socket: Socket;
  /** A ring line can be megabytes (an image folded into a user echo): framed in linear time. */
  readonly #lines = new LineSplitter();
  /** A write to a child's stdin can be megabytes too (an image): sent a piece at a time (core/paced-write.ts). */
  readonly #out: PacedWriter;
  #welcome: SessiondWelcomeInfo | undefined;
  readonly #acks = new Map<string, (ack: SessiondAck) => void>();
  /** Sent but not yet settled — re-sent once at reconnect under the same id (§8). */
  readonly #unacked = new Map<string, SessiondClientMessage>();
  /**
   * Each unsettled mutation's hold on an agent restart: a message, an answer,
   * a signal or a start on its way into the keeper, which a restart now would
   * cut with nobody left to learn whether it landed. Let go with the ack, or
   * with the connection.
   */
  readonly #holds = new Map<string, () => void>();
  readonly #listeners = new Map<string, ProcListener>();
  /** Listeners already told their child is gone: a death reaches each once. */
  readonly #toldExit = new WeakSet<ProcListener>();
  #closed = false;
  readonly onClose = new EventEmitter();

  private constructor(socket: Socket) {
    this.#socket = socket;
    this.#out = new PacedWriter(socket);
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.#onData(chunk));
    socket.on("close", () => {
      this.#closed = true;
      for (const release of this.#holds.values()) {
        release();
      }
      this.#holds.clear();
      this.onClose.emit("close");
    });
    socket.on("error", () => {
      /* a dropped sessiond is handled by the close path, never thrown here */
    });
  }

  static connect(
    endpoint: string = sessiondEndpoint(),
    timeoutMs = DIAL_TIMEOUT_MS
  ): Promise<SessiondClient> {
    return new Promise((resolve, reject) => {
      // Same ordering rule as {@link probeEndpoint}: listeners before dial.
      const socket = new Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        reject(
          new Error(
            `[sessiond] no welcome from ${endpoint} within ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      const client = new SessiondClient(socket);
      socket.connect(endpoint);
      // The accept's own welcome, first in line: nothing is sent before it.
      client.#welcomeWaiters.push((welcome) => {
        clearTimeout(timer);
        // §5: no compatible capability is a loud refusal, never a plausible lie.
        if (!welcome.capabilities.includes(SESSIOND_V1)) {
          socket.destroy();
          reject(
            new Error(
              `[sessiond] speaks ${welcome.capabilities.join(", ") || "(nothing)"}; this agent needs ${SESSIOND_V1}`
            )
          );
          return;
        }
        resolve(client);
      });
    });
  }

  /**
   * Who each welcome answers, oldest first. sessiond sends one welcome on
   * accept and one per `list`, in the order it read them, on this one ordered
   * socket, so the head of this queue is always the asker the next welcome
   * belongs to. It was a single slot, and a second `list` outstanding at once
   * (a hub reconnect starting a second reattach while the first was still
   * listing) took the slot over: the first asker was never answered, and its
   * reattach stalled without a word. A `subscribe`'s own `list` holds a place
   * too, or its welcome would answer a `list()` that asked later.
   */
  readonly #welcomeWaiters: ((welcome: SessiondWelcomeInfo) => void)[] = [];

  get epoch(): string | undefined {
    return this.#welcome?.epoch;
  }

  /** What the keeper this client attached to says it speaks. */
  get capabilities(): readonly string[] {
    return this.#welcome?.capabilities ?? [];
  }

  get procs(): SessiondProcInfo[] {
    return this.#welcome?.procs ?? [];
  }

  get closed(): boolean {
    return this.#closed;
  }

  // ------------------------------------------------------------------ framing

  #onData(chunk: string): void {
    for (const line of this.#lines.push(chunk)) {
      if (line.trim()) {
        this.#onMessage(line);
      }
    }
  }

  #onMessage(line: string): void {
    let message: SessiondServerMessage;
    try {
      message = JSON.parse(line) as SessiondServerMessage;
    } catch {
      return; // sessiond does not emit malformed frames; a partial one is not fatal
    }
    switch (message.type) {
      case "welcome": {
        this.#welcome = {
          epoch: message.epoch,
          capabilities: message.capabilities,
          procs: message.procs,
        };
        // A child that died before its listener subscribed had its `proc.exit`
        // broadcast to nobody, and sessiond answers a subscribe to a dead
        // child with its backlog alone. The welcome {@link subscribe} asks for
        // is where that death is learned.
        for (const proc of message.procs) {
          const listener = this.#listeners.get(proc.procId);
          if (!proc.alive && listener) {
            this.#exit(listener, proc.exitCode ?? null, proc.signal ?? null);
          }
        }
        this.#welcomeWaiters.shift()?.(this.#welcome);
        return;
      }
      case "ack": {
        this.#unacked.delete(message.commandId);
        this.#holds.get(message.commandId)?.();
        this.#holds.delete(message.commandId);
        this.#acks.get(message.commandId)?.(message);
        this.#acks.delete(message.commandId);
        return;
      }
      case "proc.line":
        this.#listeners.get(message.event.procId)?.line?.(message.event);
        return;
      case "proc.backlog":
        for (const event of message.events) {
          this.#listeners.get(message.procId)?.line?.(event);
        }
        return;
      case "proc.reset":
        this.#listeners
          .get(message.procId)
          ?.reset?.(message.nextSeq, message.oldest);
        return;
      case "proc.exit": {
        const listener = this.#listeners.get(message.procId);
        if (listener) {
          this.#exit(listener, message.exitCode, message.signal);
        }
        return;
      }
      default:
        return;
    }
  }

  #exit(
    listener: ProcListener,
    exitCode: number | null,
    signal: NodeJS.Signals | null
  ): void {
    if (this.#toldExit.has(listener)) {
      return;
    }
    this.#toldExit.add(listener);
    listener.exit?.(exitCode, signal);
  }

  #send(message: SessiondClientMessage): void {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #closed does become true at runtime (close()/the socket "close" handler) even though biome's inference sees only the field's initializer
    if (this.#closed) {
      throw new Error("[sessiond] connection is closed");
    }
    this.#out.write(`${JSON.stringify(message)}\n`);
  }

  /**
   * Send a mutation and wait for its settlement. The `commandId` is minted
   * once, before the first send attempt, so the retry after a socket drop is
   * the *same* command — sessiond re-acks it instead of, in `spawn`'s case,
   * killing and replacing a perfectly healthy child (§8).
   */
  #command(
    message: SessiondClientMessage & { commandId: string }
  ): Promise<SessiondAck> {
    return new Promise((resolve, reject) => {
      this.#acks.set(message.commandId, resolve);
      this.#unacked.set(message.commandId, message);
      this.#holds.set(
        message.commandId,
        holdRestart(
          message.type === "spawn" ? "starting" : "write",
          "procId" in message
            ? `${message.type}:${message.procId}`
            : message.type
        )
      );
      try {
        this.#send(message);
      } catch (error) {
        this.#acks.delete(message.commandId);
        this.#unacked.delete(message.commandId);
        this.#holds.get(message.commandId)?.();
        this.#holds.delete(message.commandId);
        reject(error as Error);
      }
    });
  }

  /** Re-send everything unsettled, unchanged, after a reconnect (§8). */
  resendUnacked(): void {
    for (const message of this.#unacked.values()) {
      this.#send(message);
    }
  }

  // -------------------------------------------------------------------- verbs

  async spawnProc(
    procId: string,
    spec: ProcSpec,
    commandId = crypto.randomUUID()
  ): Promise<void> {
    assertApplied(
      await this.#command({ type: "spawn", commandId, procId, spec }),
      "spawn"
    );
  }

  async write(
    procId: string,
    data: string,
    commandId = crypto.randomUUID()
  ): Promise<void> {
    assertApplied(
      await this.#command({ type: "write", commandId, procId, data }),
      "write"
    );
  }

  async signal(
    procId: string,
    sig: NodeJS.Signals,
    commandId = crypto.randomUUID()
  ): Promise<void> {
    assertApplied(
      await this.#command({ type: "signal", commandId, procId, sig }),
      "signal"
    );
  }

  async stdinEnd(
    procId: string,
    commandId = crypto.randomUUID()
  ): Promise<void> {
    assertApplied(
      await this.#command({ type: "stdin_end", commandId, procId }),
      "stdin_end"
    );
  }

  /**
   * Follow a child's stdout. `afterSeq` present is a resume from the ring;
   * absent follows from now. The listener sees backlog lines and live deltas
   * through the same callback, in seq order.
   *
   * A child that is already dead is reported to the listener as an exit. The
   * `list` sent behind the subscribe is answered after it on the same ordered
   * socket, so its welcome says whether the child was alive once the
   * subscription stood; a death after that is broadcast to this listener as
   * usual. Without it a subscriber that arrived late — an adoption between
   * `list` and `subscribe`, a `Query` attaching to a child that died after
   * its ring was read — waited on a child that could never write or exit
   * again.
   */
  subscribe(procId: string, listener: ProcListener, afterSeq?: number): void {
    this.#listeners.set(procId, listener);
    this.#send({
      type: "subscribe",
      procId,
      ...(afterSeq === undefined ? {} : { afterSeq }),
    });
    this.#send({ type: "list" });
    // Its welcome is read by the death check in `#onMessage`, not by a caller.
    this.#welcomeWaiters.push(() => undefined);
  }

  unsubscribe(procId: string): void {
    this.#listeners.delete(procId);
  }

  /** Ask again what is alive. Answered with a fresh `welcome`. */
  list(): Promise<SessiondWelcomeInfo> {
    return new Promise((resolve) => {
      this.#send({ type: "list" });
      this.#welcomeWaiters.push(resolve);
    });
  }

  close(): void {
    this.#closed = true;
    this.#socket.destroy();
  }
}

/** sessiond refused a command; `reason` is the keeper's own words. */
export class SessiondRefusal extends Error {
  readonly reason: string;
  constructor(verb: string, reason: string) {
    super(`[sessiond] ${verb} failed: ${reason}`);
    this.reason = reason;
  }
}

/** The keeper's own words for why a command did not go, however it failed. */
export const refusalReason = (error: unknown): string => {
  if (error instanceof SessiondRefusal) {
    return error.reason;
  }
  return error instanceof Error ? error.message : String(error);
};

const assertApplied = (ack: SessiondAck, verb: string): void => {
  if (ack.stage === "failed") {
    throw new SessiondRefusal(verb, ack.reason ?? "no reason given");
  }
};

/**
 * How long a child told to end gets before it is killed. Ours: the harness's
 * own exit on a closed stdin takes a second or two; five is room for one that
 * is mid-write.
 */
const END_GRACE_MS = 5000;

/**
 * Ends a held child nobody is driving, with everything it started (sessiond
 * signals its whole tree): its stdin is closed, which is a harness's own way
 * out, it is told to terminate, and if that same process is still there after
 * {@link END_GRACE_MS} it is killed. Every step is a no-op on a child already
 * gone, and the kill is refused to a process since started under the same id.
 */
export const endProc = async (
  client: SessiondClient,
  procId: string
): Promise<void> => {
  const held = (await client.list()).procs.find(
    (proc) => proc.procId === procId && proc.alive
  );
  if (!held) {
    return;
  }
  // Each step on a child already gone is refused, which is the end this
  // asks for: said, and the next step goes on.
  const quietly = (step: Promise<void>): Promise<void> =>
    step.catch((error: unknown) => {
      console.warn(
        `[sessiond] ${procId}: ending it: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  await quietly(client.stdinEnd(procId));
  await quietly(client.signal(procId, "SIGTERM"));
  setTimeout(() => {
    client
      .list()
      .then(({ procs }) =>
        procs.some(
          (proc) =>
            proc.procId === procId && proc.alive && proc.pid === held.pid
        )
          ? quietly(client.signal(procId, "SIGKILL"))
          : undefined
      )
      .catch(() => undefined);
  }, END_GRACE_MS).unref();
};

/**
 * The sequence space a ring line's seq belongs to: one child process, under
 * one sessiond boot. sessiond's own epoch spans every child it runs, and a
 * relaunch starts a new ring at seq 1 under the same procId — so a mark kept
 * per sessiond epoch alone would have the hub refuse the new child's lines as
 * lines it had already framed.
 */
export const procEpoch = (sessiondEpoch: string, pid: number): string =>
  `${sessiondEpoch}/${pid}`;

/** What a {@link sessiondBridge} knows about the ring it reads. */
export interface BridgeRing {
  /**
   * An attach to the child already running under the procId, in place of a
   * spawn. `afterSeq` is where the SDK starts reading; lines at or below
   * `head` are the backlog of the host before it; `prelude` is the
   * permission asks that host left unanswered, raw.
   */
  readonly attach?: {
    readonly afterSeq: number;
    readonly head: number;
    readonly prelude: readonly string[];
  };
  /**
   * The ring seq of every line handed to the SDK that carries a `uuid`, in
   * ring order — what lets the session stamp each frame with the line it came
   * from (design §7).
   */
  readonly seqs: Map<string, number>;
}

/** The previous host's control traffic, which an attach does not replay. */
const PREVIOUS_HOST_LINES: ReadonlySet<unknown> = new Set([
  "control_request",
  "control_response",
  "control_cancel_request",
]);

const parseRingLine = (
  data: string
): { type?: unknown; uuid?: unknown } | undefined => {
  try {
    return JSON.parse(data) as { type?: unknown; uuid?: unknown };
  } catch {
    return undefined;
  }
};

/**
 * The SDK seam. `options` is the command line the SDK built for the CLI; it
 * goes to sessiond verbatim (`ProcSpec` is opaque there), and what comes back
 * is a `SpawnedProcess` the SDK drives exactly as it drives a `ChildProcess`.
 *
 * `options.signal` is the SDK's own *forwarded* abort — it fires only after the
 * SDK's stdin-EOF + ~2 s grace window (`sdk.d.ts:6725-6741`), so honouring it
 * with a SIGTERM is the graceful path completing, never a child killed early.
 *
 * ATTACH. With `ring.attach`, nothing is spawned: `procId` is a child that
 * outlived the agent which started it, and the SDK is handed that process.
 * The CLI takes a repeated `initialize` from a host that reconnects — the SDK
 * documents it ("A host that re-initializes an already-running process (a
 * repeated `initialize` control request, e.g. after reconnecting) is sent a
 * snapshot of the current set right behind the success response") — so the
 * `Query` drives it like one it spawned, mid-turn or not, and nothing the
 * child runs is interrupted.
 */
export const sessiondBridge = (
  client: SessiondClient,
  procId: string,
  options: {
    command: string;
    args: string[];
    cwd?: string;
    env: Record<string, string | undefined>;
    signal?: AbortSignal;
  },
  ring: BridgeRing,
  /** The keeper refused the child its input ({@link KeeperRefused}): told once. */
  refused: (error: KeeperRefused) => void
): import("@anthropic-ai/claude-agent-sdk").SpawnedProcess => {
  const { attach } = ring;
  const events = new EventEmitter();
  let killed = false;
  /** The spawn itself failed: that error is the report, not a refusal after it. */
  let spawnFailed = false;
  let exitCode: number | null = null;
  let signalCode: NodeJS.Signals | null = null;

  const stdout = new Readable({
    read() {
      // pushes arrive from the sessiond subscription, not on demand
    },
  });
  // The highest sequence this wrapper has handed to the SDK. It subscribes at
  // 0 against the child's own fresh ring (or, attaching, where the hub's own
  // mark says its frames stop), so this is what separates a benign reset from
  // a lost window.
  let consumed = attach?.afterSeq ?? 0;
  const stdin = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      // Not before the spawn is acked (`started`): sessiond registers the
      // child only once its launch has run, and a write it gets before that
      // reaches no child ("is not alive", or on a relaunch the old child
      // under the same procId). The SDK's first write is its `initialize`,
      // and one lost there left the session waiting on an answer forever.
      if (spent("write")) {
        callback();
        return;
      }
      started
        .then(() =>
          client.write(
            procId,
            typeof chunk === "string" ? chunk : chunk.toString("utf8")
          )
        )
        .then(() => callback())
        .catch((error: unknown) => {
          refusedInput("write", error);
          callback();
        });
    },
    final(callback) {
      if (spent("stdin_end")) {
        callback();
        return;
      }
      started
        .then(() => client.stdinEnd(procId))
        .then(() => callback())
        .catch((error: unknown) => {
          refusedInput("stdin_end", error);
          callback();
        });
    },
  });

  /**
   * The keeper refused this child its input. Never silent: said with the
   * child and the keeper's reason. To a child whose end this transport has
   * already heard, the exit is the session's ending and the refusal only
   * follows it. Otherwise the session is told (`refused`), and the SDK's
   * stream ends with the refusal, so nothing waits on an answer to bytes
   * that never arrived. A spawn that failed has said so already.
   */
  let refusal: KeeperRefused | null = null;
  /**
   * After a refusal this transport asks nothing more of the keeper: the
   * session starts again under the same id, and a write, an end or a signal
   * from here would reach that next process. Said, and not sent.
   */
  const spent = (verb: string): boolean => {
    if (!refusal) {
      return false;
    }
    console.warn(
      `[sessiond] ${procId}: ${verb} not sent: this process was refused its input, and its id may name its next process by now`
    );
    return true;
  };
  const refusedInput = (verb: "write" | "stdin_end", error: unknown): void => {
    const reason = refusalReason(error);
    if (spawnFailed) {
      return;
    }
    if (exitCode !== null || signalCode !== null) {
      console.warn(
        `[sessiond] ${procId}: ${verb} refused after its process ended: ${reason}`
      );
      return;
    }
    console.warn(`[sessiond] ${procId}: ${verb} refused: ${reason}`);
    if (refusal) {
      return;
    }
    refusal = new KeeperRefused(procId, reason);
    refused(refusal);
    events.emit("error", refusal);
  };

  // The listener is built here but attached only once the spawn is acked (see
  // `started`). A relaunch reuses the procId, and until
  // the ack lands sessiond's table still holds the OLD child under it: a
  // subscribe at 0 sent before the ack replayed that child's entire ring into
  // this SDK's stdout — or, if its ring had overflowed, announced a reset that
  // failed the spawn — and if it was still alive, its death arrived here as
  // this process's own. After the ack the table holds the new child, and
  // cursor 0 names exactly its first line.
  const listener: ProcListener = {
    // Lines lost their terminator on the way into the ring; the SDK's own
    // reader frames on newlines, so it goes back on.
    line: (event) => {
      consumed = event.seq;
      const parsed = parseRingLine(event.data);
      // An attach replays what the hub has not yet framed, and in that
      // backlog the control traffic was the previous host's: its requests
      // were answered (or are handed over in the prelude), and its responses
      // answer nothing this `Query` asked.
      if (
        attach &&
        event.seq <= attach.head &&
        PREVIOUS_HOST_LINES.has(parsed?.type)
      ) {
        return;
      }
      if (typeof parsed?.uuid === "string") {
        ring.seqs.set(parsed.uuid, event.seq);
      }
      stdout.push(`${event.data}\n`);
    },
    exit: (code, sig) => {
      exitCode = code;
      signalCode = sig;
      stdout.push(null);
      // An `exit` with neither a code nor a signal is not one a process can
      // emit, and the SDK reads it as still running: its `waitForExit` waits
      // for another `exit` and never returns. A child whose end sessiond
      // cannot describe is reported as what it is to this transport — a
      // process that is not there — through `error`, which the SDK's
      // `ProcessTransport` turns into the error its read ends with.
      if (code === null && sig === null) {
        events.emit(
          "error",
          new Error(
            `[sessiond] ${procId}: the child had already exited; sessiond reported neither its exit code nor its signal`
          )
        );
        return;
      }
      events.emit("exit", code, sig);
    },
    // An overflowed ring is an honest refusal, not a silent splice: the SDK
    // is told the stream broke rather than handed a transcript with a hole.
    //
    // A reset that resumes exactly where this wrapper stands skipped no
    // line, so it is not that. Only an announcement that jumps past the next
    // sequence this wrapper expects is a real hole, and that one throws.
    reset: (nextSeq) => {
      if (nextSeq <= consumed + 1) {
        return;
      }
      events.emit(
        "error",
        new Error(
          `[sessiond] ${procId}: replay window lost, stream resumes at ${nextSeq} (consumed ${consumed})`
        )
      );
    },
  };

  // Env entries the SDK left undefined are absent, not empty: `ProcSpec.env`
  // is a string map, and sessiond merges it over its own `process.env`.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  const started = (
    attach
      ? Promise.resolve().then(() => {
          // The asks the previous host left open, first: this `Query` parks
          // them under the CLI's own request ids and answers them itself.
          for (const line of attach.prelude) {
            stdout.push(`${line}\n`);
          }
          client.subscribe(procId, listener, attach.afterSeq);
        })
      : client
          .spawnProc(procId, {
            command: options.command,
            args: options.args,
            ...(options.cwd ? { cwd: options.cwd } : {}),
            env,
          })
          .then(() => client.subscribe(procId, listener, 0))
  ).catch((error: unknown) => {
    spawnFailed = true;
    events.emit(
      "error",
      error instanceof Error ? error : new Error(String(error))
    );
  });

  const kill = (sig: NodeJS.Signals): boolean => {
    killed = true;
    // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — kill() itself is synchronous, and the SDK does not await the signal reaching the child
    void started.then(async () => {
      if (spent(sig)) {
        return;
      }
      try {
        await client.signal(procId, sig);
      } catch (error) {
        // A child that already died cannot be signaled, and its exit event is
        // the truth of it; the refusal is still said.
        console.warn(
          `[sessiond] ${procId}: ${sig} refused: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
    return true;
  };
  options.signal?.addEventListener("abort", () => kill("SIGTERM"), {
    once: true,
  });

  return {
    stdin,
    stdout,
    get killed() {
      return killed;
    },
    get exitCode() {
      return exitCode;
    },
    get signalCode() {
      return signalCode;
    },
    kill,
    on: (event: "exit" | "error", handler: (...args: never[]) => void) => {
      events.on(event, handler as (...args: unknown[]) => void);
    },
    once: (event: "exit" | "error", handler: (...args: never[]) => void) => {
      events.once(event, handler as (...args: unknown[]) => void);
    },
    off: (event: "exit" | "error", handler: (...args: never[]) => void) => {
      events.off(event, handler as (...args: unknown[]) => void);
    },
  } as import("@anthropic-ai/claude-agent-sdk").SpawnedProcess;
};
