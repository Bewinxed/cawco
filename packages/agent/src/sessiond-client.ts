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
 *     `signal`/`stdin_end`/`subscribe`/`list`, each mutation under its own
 *     `commandId`, each settled by its ack or failed by the connection's end.
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
// The protocol lives behind its own subpath on purpose: `sessiond.ts` reaches
// for `node:os`, and the core barrel is imported by the browser bundle.
import type { SessionLimits } from "@cawco/core";
import { type Bounded, Gone, readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import { answers } from "@cawco/core/keepers";
import { LineSplitter } from "@cawco/core/lines";
import { PacedWriter } from "@cawco/core/paced-write";
import { standalone } from "@cawco/core/runtime";
import {
  notAliveReason,
  type ProcSpec,
  SESSIOND_RELEASE,
  SESSIOND_V1,
  type SessiondAck,
  type SessiondClientMessage,
  type SessiondLimit,
  type SessiondLine,
  type SessiondProcInfo,
  type SessiondServerMessage,
  sessiondEndpoint,
} from "@cawco/core/sessiond";
import { SessiondServerMessageSchema } from "@cawco/core/stored-shapes";
import { unhandled } from "@cawco/core/unhandled";
import { z } from "zod";
import { KeeperRefused } from "./harness";
import { parseProcId } from "./proc-id";
import { holdRestart } from "./restart";

/**
 * What an update must wait for: the keeper's live children, less the agent's
 * own helpers: the OpenCode server, alive whenever the agent is, and the
 * workspaces' judges, alive whenever a workspace is (boundary.ts `judgeFor`).
 * Counting them would keep the keeper from ever moving on a machine that runs
 * OpenCode or holds a workspace. Busy sessions are the busy check's to refuse.
 */
export const heldSessions = (procs: readonly SessiondProcInfo[]): number =>
  procs.filter((proc) => {
    const { kind } = parseProcId(proc.procId);
    return proc.alive && kind !== "opencode-server" && kind !== "judge";
  }).length;

/**
 * How long a probe of the endpoint ({@link SessiondClient.connect}'s default)
 * may take before the agent reads the endpoint as not answering. Our choice:
 * a unix socket on the same machine answers in microseconds, and the ad-hoc
 * path needs a bound before it decides to spawn a replacement. What a
 * session's custody is decided by waits on the keeper's own word instead
 * ({@link keeperEnded}), and a reading of what every keeper holds gives each
 * {@link KEEPER_WELCOME_MS}.
 */
const DIAL_TIMEOUT_MS = 2000;

/**
 * How long a keeper's welcome is waited on before the keeper is read as not
 * answering: by the watchdog's dials (keeper-watchdog.ts), and by every
 * reading of what the keepers hold (keepers.ts `withKeepers`). The keeper
 * writes its welcome in the same turn of its loop as the accept, so a healthy
 * one answers in microseconds, and a keeper that is merely loaded (a GC
 * pause, a machine in swap) answers inside ten seconds.
 *
 * THE BOUND IS KEPT BY A TIMER IN THIS PROCESS'S LOOP, AND THAT LOOP STALLS
 * TOO. Under Bun (1.4.3) a timer that came due while the loop was busy runs
 * before the socket's data is read, so a welcome that arrived at once is not
 * seen: the dial is "no welcome within" however long the stall ran. With two
 * seconds, an agent whose loop stalled through them read a retiring keeper as
 * not answering 67 times in one log (the Mac, 2026-10-19, "no welcome within
 * 2077 ms" to 3375 ms, the keeper idle in `kevent64`), and each of those
 * readings of what the keepers hold was not known: the register's custody,
 * the heartbeat's, and the updater's look at which retiring keeper to remove.
 */
export const KEEPER_WELCOME_MS = 10_000;

/**
 * The keeper's connection ended before it answered: the keeper ended (the
 * kernel closes a process's sockets as it exits), and what it held ended with
 * it. The one way a wait on a keeper's word ends without its answer: a
 * {@link Gone}, which a bounded read answers `unanswered`, reason "dead".
 */
const keeperEnded = (what: string): Gone =>
  new Gone(`[sessiond] the keeper's connection ended before ${what}`);

/**
 * How long the ad-hoc path waits for a freshly spawned sessiond to bind before
 * giving up. Our choice: a `bun` cold start plus a `listen()` is well under a
 * second on this fleet; 10 s is generous enough that a loaded machine still
 * wins, short enough that a broken install fails inside one spawn.
 */
const ADHOC_START_TIMEOUT_MS = 10_000;

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
class SessiondUnavailableError extends Error {
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

/**
 * What one dial learned of the keeper: whether its `welcome` came, and if not,
 * how far the dial got. The keeper writes its welcome in the same turn of its
 * loop as the accept, so any answer but a welcome, from a keeper the service
 * manager says is running, is a loop that is not turning: one whose backlog
 * filled refuses or never completes a connect, one that still accepts says
 * nothing.
 */
export interface KeeperDial {
  /** How the dial ended, in words for the log: `first line was not a welcome`. */
  detail: string;
  /** Whether the keeper's first line was its welcome. */
  welcomed: boolean;
}

const WELCOME_LINE = /"type"\s*:\s*"welcome"/u;

/**
 * One dial of the keeper, waiting `timeoutMs` for its welcome: what it
 * answered ({@link KeeperDial}), or unanswered; `accepted` says how far an
 * unanswered dial got (its connect completed, or did not).
 */
export const dialKeeper = async (
  endpoint: string,
  timeoutMs: number
): Promise<{ dial: Bounded<KeeperDial>; accepted: boolean }> => {
  let accepted = false;
  const dial = await readWithin(
    timeoutMs,
    (signal) =>
      new Promise<KeeperDial>((resolve) => {
        // Listeners before the dial, as in core `answers`.
        const socket = new Socket();
        const lines = new LineSplitter();
        const settle = (welcomed: boolean, detail: string): void => {
          socket.destroy();
          resolve({ welcomed, detail });
        };
        signal.addEventListener("abort", () => socket.destroy(), {
          once: true,
        });
        socket.setEncoding("utf8");
        socket.once("connect", () => {
          accepted = true;
        });
        socket.on("data", (chunk: string) => {
          const [first] = lines.push(chunk);
          if (first !== undefined) {
            settle(
              WELCOME_LINE.test(first),
              WELCOME_LINE.test(first)
                ? "welcome"
                : "first line was not a welcome"
            );
          }
        });
        socket.once("error", (error: NodeJS.ErrnoException) =>
          settle(
            false,
            accepted
              ? `accepted, then ${error.code ?? error.message}`
              : `connect failed: ${error.code ?? error.message}`
          )
        );
        socket.connect(endpoint);
      })
  );
  return { dial, accepted };
};

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
  const there = await answers(endpoint, DIAL_TIMEOUT_MS);
  switch (there.kind) {
    case "answered":
      if (there.value) {
        return;
      }
      break;
    case "unanswered":
      // Something holds the endpoint and did not complete a connect: a
      // keeper there that is not turning is the watchdog's, never replaced
      // by a second one here.
      throw new Error(
        `[sessiond] ${endpoint} did not complete a connect within ${DIAL_TIMEOUT_MS} ms; no keeper was started in its place`
      );
    default:
      unhandled("read", there);
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
    const bound = await answers(endpoint, 250);
    switch (bound.kind) {
      case "answered":
        if (bound.value) {
          return;
        }
        break;
      case "unanswered":
        // Not bound yet as far as this one try saw: the next try asks again.
        break;
      default:
        unhandled("read", bound);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `[sessiond] spawned ${command} ${args.join(" ")} but it never bound ${endpoint}`
  );
};

/**
 * The fleet's session limits as the hub last said them (its register and
 * heartbeat acks); undefined until it has. Every keeper holds them (sessiond
 * `limits`) and starts each child under them: this agent says them on every
 * connection it opens, before anything else it sends there, and to every
 * open connection when they change. Until the hub has said them, a keeper
 * keeps what it was told before (by this agent before a restart).
 */
let sessionLimits: SessionLimits | undefined;

/** Every open keeper connection, which a change of the limits is said on. */
const openClients = new Set<SessiondClient>();

/** The hub said the fleet's session limits; true when they differ from what this agent held. */
export const setSessionLimits = (
  limits: SessionLimits | undefined
): boolean => {
  const next: SessionLimits = {
    ...(limits?.memoryPercent === undefined
      ? {}
      : { memoryPercent: limits.memoryPercent }),
    ...(limits?.cpuPercent === undefined
      ? {}
      : { cpuPercent: limits.cpuPercent }),
  };
  const changed =
    sessionLimits === undefined ||
    next.memoryPercent !== sessionLimits.memoryPercent ||
    next.cpuPercent !== sessionLimits.cpuPercent;
  sessionLimits = next;
  if (changed) {
    for (const client of openClients) {
      client.sayLimits(next);
    }
  }
  return changed;
};

/**
 * Every live child of every keeper this agent has a connection open to, each
 * once by pid, as each keeper lists it now: the current keeper's and those of
 * keepers still retiring. A keeper that does not answer its listing is left
 * out of this reading.
 */
export const keeperChildren = async (): Promise<SessiondProcInfo[]> => {
  const listed = await Promise.all(
    [...openClients].map((client) =>
      client.list().then(
        (welcome) => welcome.procs,
        () => [] as SessiondProcInfo[]
      )
    )
  );
  const byPid = new Map<number, SessiondProcInfo>();
  for (const proc of listed.flat()) {
    if (proc.alive) {
      byPid.set(proc.pid, proc);
    }
  }
  return [...byPid.values()];
};

/**
 * Every keeper's word that one of its children reached a limit
 * (`proc.limit`), once however many connections heard it: the supervisor
 * says it on the sessions it touches (session.ts).
 */
export const keeperLimits = new EventEmitter<{ limit: [SessiondLimit] }>();

/** The reports already passed on, by group, limit and count. Bounded: a report is said within seconds of its first hearing. */
const heardLimits = new Set<string>();
const HEARD_LIMITS_KEPT = 512;

const hearLimit = (message: SessiondLimit): void => {
  const key = `${message.group}/${message.limit}/${message.count}`;
  if (heardLimits.has(key)) {
    return;
  }
  if (heardLimits.size >= HEARD_LIMITS_KEPT) {
    heardLimits.clear();
  }
  heardLimits.add(key);
  keeperLimits.emit("limit", message);
};

/** What the agent learns the moment it attaches (design §7's epoch and heads). */
export interface SessiondWelcomeInfo {
  capabilities: readonly string[];
  /** Where the keeper starts its children ({@link SessiondWelcome.cgroup}). */
  cgroup?: string;
  epoch: string;
  procs: SessiondProcInfo[];
}

/** One subscription to a child on a connection: its listener, and whether the keeper's answer to it (its backlog or reset) has come. */
interface Subscription {
  answered: boolean;
  listener: ProcListener;
}

interface ProcListener {
  /**
   * The child is gone. Both arguments `null` means sessiond reported it dead
   * without saying how: a listing from a sessiond that predates the `signal`
   * field describes a child killed by a signal exactly that way.
   */
  exit?: (
    exitCode: number | null,
    signal: NodeJS.Signals | null,
    /** The process that exited, when its keeper says (what {@link SessiondClient.release} names). */
    pid: number | undefined,
    /** The last of what it wrote on stderr, when it wrote any and its keeper kept it (core sessiond.ts `SessiondExit.stderr`). */
    stderr?: string
  ) => void;
  /**
   * The keeper holds no child under the id: the listing that answers this
   * subscribe, read after it on the same ordered socket, does not name it
   * (one dead and still listed is told as an `exit`). Its end, if it had
   * one, was read and released elsewhere ({@link SessiondClient.release}).
   * Only for a listener that follows a child known to have been there: a
   * subscribe before a spawn lands is answered the same way.
   */
  gone?: () => void;
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
  /**
   * Each mutation sent and not yet acked. The connection's end fails every
   * one: an ack can only come on this socket, and a caller left waiting on
   * one from a keeper that has gone waits for ever, without a word.
   */
  readonly #acks = new Map<
    string,
    { resolve: (ack: SessiondAck) => void; reject: (error: Error) => void }
  >();
  /**
   * Each unsettled mutation's hold on an agent restart: a message, an answer,
   * a signal or a start on its way into the keeper, which a restart now would
   * cut with nobody left to learn whether it landed. Let go with the ack, or
   * with the connection.
   */
  readonly #holds = new Map<string, () => void>();
  /**
   * EVERY SUBSCRIPTION TO A CHILD ON THIS CONNECTION HEARS IT, each until its
   * own unsubscribe ({@link subscribe}). It was one listener per id, and a
   * second subscribe took the first one's place: the first heard nothing
   * more, its `gone` and its `exit` included, and waited for good (two ring
   * reads of one child at once; a pi host's state read, which then
   * unsubscribed the session's own listener with its own).
   */
  readonly #subscriptions = new Map<string, Set<Subscription>>();
  /**
   * The subscriptions of each id still waiting on the keeper's answer to
   * their subscribe, oldest first. sessiond answers every subscribe with
   * exactly one `proc.backlog` or `proc.reset`, in the order it read them
   * (server.ts `#subscribe`), so the head is the one an answer belongs to:
   * one that unsubscribed meanwhile still holds its place, and its answer is
   * dropped.
   */
  readonly #awaitingAnswer = new Map<string, Subscription[]>();
  /** Listeners already told their child is gone: a death reaches each once. */
  readonly #toldExit = new WeakSet<ProcListener>();
  #closedValue = false;
  get #closed(): boolean {
    return this.#closedValue;
  }
  /** The keeper said it is draining: it starts nothing more ({@link retired}). */
  #draining = false;
  readonly onClose = new EventEmitter();

  private constructor(socket: Socket) {
    this.#socket = socket;
    this.#out = new PacedWriter(socket);
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.#onData(chunk));
    socket.on("close", () => {
      this.#closedValue = true;
      openClients.delete(this);
      for (const release of this.#holds.values()) {
        release();
      }
      this.#holds.clear();
      const pending = [...this.#acks.values()];
      this.#acks.clear();
      for (const { reject } of pending) {
        reject(keeperEnded("it answered"));
      }
      for (const waiter of this.#welcomeWaiters.splice(0)) {
        waiter.reject(keeperEnded("its listing came"));
      }
      this.onClose.emit("close");
    });
    socket.on("error", () => {
      /* a dropped sessiond is handled by the close path, never thrown here */
    });
  }

  /**
   * A connection to the keeper at `endpoint`, its welcome given `timeoutMs`:
   * answered with the connection; unanswered "timeout" when no welcome came
   * in time, "dead" when the connection ended first ({@link Gone}). A
   * refused dial (an errno) is thrown: an answered no. {@link dial} waits on
   * the keeper's own word instead, which a wedged keeper reaches once the
   * watchdog ends it (keeper-watchdog.ts).
   */
  static connect(
    endpoint: string = sessiondEndpoint(),
    timeoutMs: number = DIAL_TIMEOUT_MS
  ): Promise<Bounded<SessiondClient>> {
    return readWithin(timeoutMs, (signal) =>
      SessiondClient.dial(endpoint, signal)
    );
  }

  /**
   * One dial of the keeper at `endpoint`, waited on for the keeper's own
   * word: its welcome, its refusal (a thrown errno or capability refusal),
   * its connection's end ({@link Gone}), or `signal`.
   */
  static dial(endpoint: string, signal?: AbortSignal): Promise<SessiondClient> {
    return new Promise((resolve, reject) => {
      // Same ordering rule as core `answers`: listeners before dial.
      const socket = new Socket();
      signal?.addEventListener("abort", () => socket.destroy(), {
        once: true,
      });
      socket.once("error", (error) => {
        reject(error);
      });
      const client = new SessiondClient(socket);
      socket.connect(endpoint);
      // The accept's own welcome, first in line: nothing is sent before it.
      client.#welcomeWaiters.push({
        resolve: (welcome) => {
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
          // The keeper holds the session limits before the connection carries
          // anything else: a spawn sent on it after this is read after it.
          openClients.add(client);
          if (sessionLimits) {
            client.sayLimits(sessionLimits);
          }
          resolve(client);
        },
        reject: (error) => {
          reject(error);
        },
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
   * too, or its welcome would answer a `list()` that asked later. The
   * connection's end fails every one still waiting.
   */
  readonly #welcomeWaiters: {
    resolve: (welcome: SessiondWelcomeInfo) => void;
    reject: (error: Error) => void;
  }[] = [];

  get epoch(): string | undefined {
    return this.#welcome?.epoch;
  }

  /** The cgroup the keeper this client attached to starts its children under, as its welcome names it. */
  get cgroup(): string | undefined {
    return this.#welcome?.cgroup;
  }

  /** What the keeper this client attached to says it speaks. */
  get capabilities(): readonly string[] {
    return this.#welcome?.capabilities ?? [];
  }

  get procs(): SessiondProcInfo[] {
    return this.#welcome?.procs ?? [];
  }

  /**
   * Whether this connection may carry new work: not once it has ended, nor
   * once its keeper has said it is draining. A caller that keeps one client
   * for the machine dials again when this says so, and reaches whichever
   * keeper listens now; the sessions already on this one keep it.
   */
  get retired(): boolean {
    return this.#closed || this.#draining;
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
      message = SessiondServerMessageSchema.parse(JSON.parse(line));
    } catch {
      return; // sessiond does not emit malformed frames; a partial one is not fatal
    }
    switch (message.type) {
      case "welcome": {
        this.#welcome = {
          epoch: message.epoch,
          capabilities: message.capabilities,
          procs: message.procs,
          ...(message.cgroup ? { cgroup: message.cgroup } : {}),
        };
        // A child that died before its listener subscribed had its `proc.exit`
        // broadcast to nobody, and sessiond answers a subscribe to a dead
        // child with its backlog alone. The welcome {@link subscribe} asks for
        // is where that death is learned.
        for (const proc of message.procs) {
          if (!proc.alive) {
            this.#tellExit(
              proc.procId,
              proc.exitCode ?? null,
              proc.signal ?? null,
              proc.pid,
              proc.stderr
            );
          }
        }
        this.#welcomeWaiters.shift()?.resolve(this.#welcome);
        return;
      }
      case "ack": {
        this.#holds.get(message.commandId)?.();
        this.#holds.delete(message.commandId);
        this.#acks.get(message.commandId)?.resolve(message);
        this.#acks.delete(message.commandId);
        return;
      }
      case "draining":
        this.#draining = true;
        return;
      case "proc.line":
        this.#tellLine(message.event);
        return;
      case "proc.backlog": {
        const subscription = this.#answerFor(message.procId);
        for (const event of subscription ? message.events : []) {
          subscription?.listener.line?.(event);
        }
        return;
      }
      case "proc.reset":
        this.#answerFor(message.procId)?.listener.reset?.(
          message.nextSeq,
          message.oldest
        );
        return;
      case "proc.exit":
        this.#tellExit(
          message.procId,
          message.exitCode,
          message.signal,
          message.pid,
          message.stderr
        );
        return;
      case "proc.limit":
        hearLimit(message);
        return;
      default:
        return;
    }
  }

  /**
   * A live line, to every subscription to its child whose own answer has
   * come: a line the keeper sent before it read a later subscribe is in that
   * one's backlog.
   */
  #tellLine(event: SessiondLine): void {
    for (const subscription of this.#subscriptions.get(event.procId) ?? []) {
      if (subscription.answered) {
        subscription.listener.line?.(event);
      }
    }
  }

  /** A child's end, to every subscription to it, each listener once. */
  #tellExit(
    procId: string,
    exitCode: number | null,
    signal: NodeJS.Signals | null,
    pid: number | undefined,
    stderr: string | undefined
  ): void {
    for (const { listener } of this.#subscriptions.get(procId) ?? []) {
      this.#exit(listener, exitCode, signal, pid, stderr);
    }
  }

  /**
   * The subscription a `proc.backlog` or `proc.reset` for `procId` answers
   * ({@link #awaitingAnswer}), marked answered; undefined when it has
   * unsubscribed since, or none waits.
   */
  #answerFor(procId: string): Subscription | undefined {
    const waiting = this.#awaitingAnswer.get(procId);
    const subscription = waiting?.shift();
    if (waiting?.length === 0) {
      this.#awaitingAnswer.delete(procId);
    }
    if (!(subscription && this.#subscriptions.get(procId)?.has(subscription))) {
      return;
    }
    subscription.answered = true;
    return subscription;
  }

  #exit(
    listener: ProcListener,
    exitCode: number | null,
    signal: NodeJS.Signals | null,
    pid: number | undefined,
    stderr: string | undefined
  ): void {
    if (this.#toldExit.has(listener)) {
      return;
    }
    this.#toldExit.add(listener);
    listener.exit?.(exitCode, signal, pid, stderr);
  }

  #send(message: SessiondClientMessage): void {
    if (this.#closed) {
      throw new Error("[sessiond] connection is closed");
    }
    this.#out.write(`${JSON.stringify(message)}\n`);
  }

  /**
   * Send a mutation and wait for its settlement: its ack, or the end of this
   * connection, which fails it. Nothing is re-sent on another connection: a
   * keeper that ended took what it had not answered with it, and the caller
   * hears so.
   */
  #command(
    message: SessiondClientMessage & { commandId: string }
  ): Promise<SessiondAck> {
    return new Promise((resolve, reject) => {
      this.#acks.set(message.commandId, { resolve, reject });
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
        this.#holds.get(message.commandId)?.();
        this.#holds.delete(message.commandId);
        reject(error as Error);
      }
    });
  }

  // -------------------------------------------------------------------- verbs

  /**
   * Tells this connection's keeper the session limits every child it starts
   * from now runs under ({@link sessionLimits}). Sent at once, in order with
   * everything after it on this socket; a refusal is said in the log, since
   * nobody waits on it.
   */
  sayLimits(limits: SessionLimits): void {
    if (this.retired) {
      return;
    }
    this.#command({ type: "limits", commandId: crypto.randomUUID(), limits })
      .then((settled) => {
        if (settled.stage === "failed") {
          console.warn(
            `[sessiond] the keeper refused the hub's session limits, so its next children start without them: ${settled.reason ?? "no reason given"}`
          );
        }
      })
      .catch(() => {
        /* the connection ended: the next one says them again */
      });
  }

  /**
   * Tells this connection's keeper that the dead child `pid` under `procId`
   * is settled here, so it lets the child go ({@link SessiondRelease}): sent
   * by whatever follows the child once it has read the end it waited on, and
   * by nothing earlier. A keeper whose welcome does not say
   * {@link SESSIOND_RELEASE} is sent nothing: it keeps its dead children, as
   * it always did. Nobody waits on it; a refusal is said in the log.
   */
  release(procId: string, pid: number | undefined): void {
    if (
      pid === undefined ||
      this.retired ||
      !this.capabilities.includes(SESSIOND_RELEASE)
    ) {
      return;
    }
    this.#command({
      type: "release",
      commandId: crypto.randomUUID(),
      procId,
      pid,
    })
      .then((settled) => {
        if (settled.stage === "failed") {
          console.warn(
            `[sessiond] ${procId}: the keeper kept its process ${pid}: ${settled.reason ?? "no reason given"}`
          );
        }
      })
      .catch(() => {
        /* the connection ended: the keeper keeps it, and its next follower reads its end there */
      });
  }

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

  /**
   * Signals a child and its tree. A child the keeper holds no live process
   * for ({@link notAliveReason}) has nothing left for the signal to reach,
   * which is what every signal here is for (each one ends a process): done,
   * not refused. Every caller reads `alive` from a listing first, and the
   * child may die between that listing and this.
   */
  async signal(
    procId: string,
    sig: NodeJS.Signals,
    commandId = crypto.randomUUID()
  ): Promise<void> {
    const settled = await this.#command({
      type: "signal",
      commandId,
      procId,
      sig,
    });
    if (
      settled.stage === "failed" &&
      settled.reason === notAliveReason("signal", procId)
    ) {
      return;
    }
    assertApplied(settled, "signal");
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
   *
   * Every subscription to the same child on this connection hears it, each
   * from its own backlog on ({@link #subscriptions}). Answers its own
   * unsubscribe: from then on it hears nothing more, and every other
   * subscription goes on.
   */
  subscribe(
    procId: string,
    listener: ProcListener,
    afterSeq?: number
  ): () => void {
    const subscription: Subscription = { listener, answered: false };
    const subscriptions = this.#subscriptions.get(procId) ?? new Set();
    subscriptions.add(subscription);
    this.#subscriptions.set(procId, subscriptions);
    const waiting = this.#awaitingAnswer.get(procId) ?? [];
    waiting.push(subscription);
    this.#awaitingAnswer.set(procId, waiting);
    this.#send({
      type: "subscribe",
      procId,
      ...(afterSeq === undefined ? {} : { afterSeq }),
    });
    this.#send({ type: "list" });
    // Its welcome is read by the death check in `#onMessage`, and by this
    // listener's `gone` when it does not list the child at all.
    this.#welcomeWaiters.push({
      resolve: (welcome) => {
        if (
          listener.gone &&
          this.#subscriptions.get(procId)?.has(subscription) &&
          !this.#toldExit.has(listener) &&
          !welcome.procs.some((proc) => proc.procId === procId)
        ) {
          listener.gone();
        }
      },
      reject: () => undefined,
    });
    return () => {
      const held = this.#subscriptions.get(procId);
      held?.delete(subscription);
      if (held?.size === 0) {
        this.#subscriptions.delete(procId);
      }
    };
  }

  /** Ask again what is alive. Answered with a fresh `welcome`. */
  list(): Promise<SessiondWelcomeInfo> {
    // An ended connection failed its waiters as it closed: one queued now
    // would wait for a welcome that never comes.
    if (this.#closed) {
      return Promise.reject(keeperEnded("this listing was asked"));
    }
    return new Promise((resolve, reject) => {
      this.#send({ type: "list" });
      this.#welcomeWaiters.push({ resolve, reject });
    });
  }

  close(): void {
    this.#closedValue = true;
    this.#socket.destroy();
  }
}

/** sessiond refused a command; `reason` is the keeper's own words. */
class SessiondRefusal extends Error {
  readonly reason: string;
  constructor(verb: string, reason: string) {
    super(
      `The process that keeps this machine's sessions running refused "${verb}": ${reason}`
    );
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
  // Ending stdin on a child already gone is refused, which is the end this
  // asks for (a signal to one is done, `signal`): said, and the next step
  // goes on.
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
      .then(({ procs }) => {
        if (
          procs.some(
            (proc) =>
              proc.procId === procId && proc.alive && proc.pid === held.pid
          )
        ) {
          return quietly(client.signal(procId, "SIGKILL"));
        }
        // Ended, and nobody drives it: nothing is left to read its end.
        client.release(procId, held.pid);
      })
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

/**
 * How a child ended, as sessiond reaped it (`#reap`, from the child's own
 * `exit`): its exit code, or the signal that ended it. What a harness
 * decides a process's end by, never its SDK's words for it.
 */
export interface ProcessExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** The last of what it said on stderr, as its keeper kept it; absent when it said nothing there. */
  stderr?: string;
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
    return z
      .object({ type: z.unknown().optional(), uuid: z.unknown().optional() })
      .parse(JSON.parse(data));
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
  refused: (error: KeeperRefused) => void,
  /**
   * The child is gone: sessiond reported its end, with how it ended (its
   * exit code or signal), or the spawn never started one, or sessiond could
   * not say how it ended (no `exit`). Told once. A host that detaches
   * (closes its `Query`) is not told: the child goes on.
   */
  ended: (exit: ProcessExit | undefined) => void
): import("@anthropic-ai/claude-agent-sdk").SpawnedProcess => {
  const { attach } = ring;
  const events = new EventEmitter();
  let isEnded = false;
  const end = (exit?: ProcessExit): void => {
    if (!isEnded) {
      isEnded = true;
      ended(exit);
    }
  };
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
  /** This transport's child's pid, once its keeper has listed it. */
  let childPid: number | undefined;
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
    refusal = new KeeperRefused(procId, reason, childPid);
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
    exit: (code, sig, pid, stderr) => {
      exitCode = code;
      signalCode = sig;
      stdout.push(null);
      end(
        code === null && sig === null
          ? undefined
          : { code, signal: sig, ...(stderr ? { stderr } : {}) }
      );
      // This transport is what follows its child: its end is read now.
      client.release(procId, pid);
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

  /** Reads this transport's child's pid off its keeper's listing ({@link childPid}); a listing that fails names none. */
  const listChild = async (): Promise<void> => {
    const listed = await client.list().catch(() => undefined);
    childPid = listed?.procs.find(
      (proc) => proc.procId === procId && proc.alive
    )?.pid;
  };

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
  )
    // This transport's child as its keeper lists it, before any write goes:
    // every refusal follows a write or an end, so each names the process it
    // was about ({@link KeeperRefused.pid}), never one started since under
    // the same id. A listing that fails names none.
    .then(listChild)
    .catch((error: unknown) => {
      spawnFailed = true;
      // An attach that could not subscribe leaves the child as it was.
      if (!attach) {
        end();
      }
      events.emit(
        "error",
        error instanceof Error ? error : new Error(String(error))
      );
    });

  const kill = (sig: NodeJS.Signals): boolean => {
    killed = true;
    detach(
      started.then(async () => {
        if (spent(sig)) {
          return;
        }
        try {
          await client.signal(procId, sig);
        } catch (error) {
          // A child that already died is no refusal (`signal`), and its exit
          // event is the truth of it; any other refusal is said.
          console.warn(
            `[sessiond] ${procId}: ${sig} refused: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }),
      "then"
    );
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
