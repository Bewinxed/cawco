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
 *     install-time error; only a hand-run `whiffle up` spawns one.
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
} from "@whiffle/core/sessiond";

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
 * - `WHIFFLE_SERVICE_MODE` is whiffle's own unit-set marker
 *   (`cli/src/service.ts:45`, `MODE_ENV`); honoured here so a dev-mode unit is
 *   still recognised as service-managed.
 */
export const serviceManaged = (
  env: NodeJS.ProcessEnv = process.env
): boolean => {
  if (env.INVOCATION_ID) {
    return true;
  }
  if (env.WHIFFLE_SERVICE_MODE) {
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
        "with the next agent restart). Install and start the unit: `whiffle service install` " +
        "then `systemctl --user start whiffle-sessiond`."
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

/** The ad-hoc sessiond command: this repo's own entry point, run under bun. */
const adhocCommand = (): { command: string; args: string[] } => ({
  command: process.execPath,
  args: [
    join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "sessiond",
      "src",
      "main.ts"
    ),
  ],
});

/**
 * Guarantee a sessiond is listening, or explain why there will not be one.
 *
 * The guard, restated because it is the reason this function is not a plain
 * "spawn if absent": under systemd/launchd a child spawned from here inherits
 * the agent's cgroup, so the next `systemctl restart whiffle-agent` kills every
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
    env: { ...env, WHIFFLE_SESSIOND_ENDPOINT: endpoint },
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
  #buffer = "";
  #welcome: SessiondWelcomeInfo | undefined;
  readonly #acks = new Map<string, (ack: SessiondAck) => void>();
  /** Sent but not yet settled — re-sent once at reconnect under the same id (§8). */
  readonly #unacked = new Map<string, SessiondClientMessage>();
  readonly #listeners = new Map<string, ProcListener>();
  #closed = false;
  readonly onClose = new EventEmitter();

  private constructor(socket: Socket) {
    this.#socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.#onData(chunk));
    socket.on("close", () => {
      this.#closed = true;
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
      client.#onWelcome = (welcome) => {
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
      };
    });
  }

  #onWelcome: (welcome: SessiondWelcomeInfo) => void = () => {
    // replaced by connect()/list() before any welcome can arrive
  };

  get epoch(): string | undefined {
    return this.#welcome?.epoch;
  }

  get procs(): SessiondProcInfo[] {
    return this.#welcome?.procs ?? [];
  }

  get closed(): boolean {
    return this.#closed;
  }

  // ------------------------------------------------------------------ framing

  #onData(chunk: string): void {
    this.#buffer += chunk;
    let nl = this.#buffer.indexOf("\n");
    while (nl >= 0) {
      const line = this.#buffer.slice(0, nl);
      this.#buffer = this.#buffer.slice(nl + 1);
      if (line.trim()) {
        this.#onMessage(line);
      }
      nl = this.#buffer.indexOf("\n");
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
        this.#onWelcome(this.#welcome);
        return;
      }
      case "ack": {
        this.#unacked.delete(message.commandId);
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
      case "proc.exit":
        this.#listeners
          .get(message.procId)
          ?.exit?.(message.exitCode, message.signal);
        return;
      default:
        return;
    }
  }

  #send(message: SessiondClientMessage): void {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #closed does become true at runtime (close()/the socket "close" handler) even though biome's inference sees only the field's initializer
    if (this.#closed) {
      throw new Error("[sessiond] connection is closed");
    }
    this.#socket.write(`${JSON.stringify(message)}\n`);
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
      try {
        this.#send(message);
      } catch (error) {
        this.#acks.delete(message.commandId);
        this.#unacked.delete(message.commandId);
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
   */
  subscribe(procId: string, listener: ProcListener, afterSeq?: number): void {
    this.#listeners.set(procId, listener);
    this.#send({
      type: "subscribe",
      procId,
      ...(afterSeq === undefined ? {} : { afterSeq }),
    });
  }

  unsubscribe(procId: string): void {
    this.#listeners.delete(procId);
  }

  /** Ask again what is alive. Answered with a fresh `welcome`. */
  list(): Promise<SessiondWelcomeInfo> {
    return new Promise((resolve) => {
      this.#onWelcome = (welcome) => resolve(welcome);
      this.#send({ type: "list" });
    });
  }

  close(): void {
    this.#closed = true;
    this.#socket.destroy();
  }
}

const assertApplied = (ack: SessiondAck, verb: string): void => {
  if (ack.stage === "failed") {
    throw new Error(
      `[sessiond] ${verb} failed: ${ack.reason ?? "no reason given"}`
    );
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
 * ATTACH. With `attachAfter`, nothing is spawned: `procId` is a child that
 * outlived the agent which started it, and the SDK is handed that process,
 * read from the ring line after `attachAfter`. The CLI takes a repeated
 * `initialize` from a host that reconnects — the SDK documents it ("A host
 * that re-initializes an already-running process (a repeated `initialize`
 * control request, e.g. after reconnecting) is sent a snapshot of the current
 * set right behind the success response") — so the `Query` drives it like one
 * it spawned, and nothing the child runs is interrupted.
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
  attachAfter?: number
): import("@anthropic-ai/claude-agent-sdk").SpawnedProcess => {
  const events = new EventEmitter();
  let killed = false;
  let exitCode: number | null = null;
  let signalCode: NodeJS.Signals | null = null;

  const stdout = new Readable({
    read() {
      // pushes arrive from the sessiond subscription, not on demand
    },
  });
  // The highest sequence this wrapper has handed to the SDK. It subscribes at
  // 0 against the child's own fresh ring (or at `attachAfter`, the line the
  // custody before it stopped at), so this is what separates a benign reset
  // from a lost window.
  let consumed = attachAfter ?? 0;
  const stdin = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      client
        .write(
          procId,
          typeof chunk === "string" ? chunk : chunk.toString("utf8")
        )
        .then(() => callback())
        // A write to a child that already died is the child's death, not a
        // stream error the SDK should throw on: the exit event is the truth.
        .catch(() => callback());
    },
    final(callback) {
      client
        .stdinEnd(procId)
        .then(() => callback())
        .catch(() => callback());
    },
  });

  // The listener is built here but attached only once the spawn is acked (see
  // `started`). A relaunch or a custody hand-off reuses the procId, and until
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
      stdout.push(`${event.data}\n`);
    },
    exit: (code, sig) => {
      exitCode = code;
      signalCode = sig;
      stdout.push(null);
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
    attachAfter === undefined
      ? client
          .spawnProc(procId, {
            command: options.command,
            args: options.args,
            ...(options.cwd ? { cwd: options.cwd } : {}),
            env,
          })
          .then(() => client.subscribe(procId, listener, 0))
      : Promise.resolve().then(() =>
          client.subscribe(procId, listener, attachAfter)
        )
  ).catch((error: unknown) => {
    events.emit(
      "error",
      error instanceof Error ? error : new Error(String(error))
    );
  });

  const kill = (sig: NodeJS.Signals): boolean => {
    killed = true;
    // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — kill() itself is synchronous, and the SDK does not await the signal reaching the child
    void started.then(async () => {
      try {
        await client.signal(procId, sig);
      } catch {
        // a child that already died cannot be signaled; the exit event is the truth
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
