/**
 * sessiond — the process-keeper. It owns the child, the pipe and the buffer,
 * and understands nothing about what flows through them.
 *
 * WHY IT REFUSES TO UNDERSTAND PAYLOADS (design §0, §3.2, §5). sessiond exists
 * to move the single point of failure off a component that ships every day
 * (the agent) onto one that ships approximately never. That property is not
 * discipline, it is construction: everything crossing this file is either a
 * protocol envelope (parsed here) or an opaque byte payload (never parsed
 * here). Argv specs, stdin bytes, stdout lines — all opaque. The day the
 * harness invents a new frame kind, a new model, a new control verb, sessiond
 * does not move, because it never knew the old ones. If you are about to
 * decode a child's output as JSON, or branch on what a line *means*, you are
 * deleting the entire justification for this daemon: put it agent-side.
 *
 * The one framing concession (§3.3): stdout is chunked on newlines so a ring
 * entry is a whole record. A newline is a stable byte; sessiond never looks
 * inside the line it just cut.
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import { dirname } from "node:path";
import { type BuildInfo, SessionRing } from "@cawco/core";
// The protocol lives behind its own subpath: `sessiond.ts` reaches for `node:os`
// to derive the endpoint, and the core barrel is imported by the browser bundle.
import {
  type ProcSpec,
  SESSIOND_V1,
  type SessiondAck,
  type SessiondLine,
  type SessiondProcInfo,
  type SessiondServerMessage,
} from "@cawco/core/sessiond";

/**
 * The idempotency window, from the hub's own discipline
 * (`hub/src/stream.ts:55`, `COMMAND_TTL_MS = 5 * 60_000`) — same constant,
 * same reason: long enough to cover any reconnect series, short enough that
 * the map is not a leak.
 */
export const COMMAND_TTL_MS = 5 * 60_000;

/**
 * Byte ceiling per child's replay window — our choice, design §6: lines are
 * not uniform (a user-echo line can fold in a base64 image, megabytes in one
 * record), so a line count alone does not bound memory. 8 MiB × ~40 children
 * ≈ 320 MiB worst case, a deliberate ceiling for a machine already running 40
 * model sessions. An estimate, not a measurement — and a wrong guess shows up
 * as an announced `reset`, never as a silently spliced stream.
 */
/**
 * Lines kept per child, from the sessiond design's §6. Larger than the hub's
 * own 512-line default on purpose: this ring holds a child's raw stdout lines,
 * not the hub's already-folded frames, and one busy turn emits far more of
 * them. `SessionRing` takes the bound as a constructor argument so the two
 * callers can disagree without either forking the class.
 */
export const SESSIOND_RING_LINES = 4096;

export const RING_BYTES = 8 * 1024 * 1024;

/**
 * The graceful window between stdin-EOF and SIGKILL during drain, mirroring
 * the agent's existing drain discipline (`agent/src/session.ts:57`,
 * `DRAIN_TIMEOUT_MS = 8_000`).
 */
export const DRAIN_TIMEOUT_MS = 8000;

/** A live (or recently dead) child, plus the ring nobody else may reach. */
interface Proc {
  alive: boolean;
  bytes: number;
  child: ChildProcessWithoutNullStreams;
  /** The spec's `cwd`, kept so a reattaching agent learns where this child runs. */
  cwd?: string;
  exitCode: number | null;
  /** Bytes of the current, not-yet-terminated stdout line. Framing only. */
  partial: string;
  procId: string;
  ring: SessionRing<string>;
  signal: NodeJS.Signals | null;
  /**
   * Byte size of each resident ring entry, indexed exactly as the ring is
   * (`(seq - 1) % SESSIOND_RING_LINES`), so an overwritten entry can be subtracted
   * instead of guessed. `bytes` is the running total of what is still
   * replayable.
   */
  sizes: number[];
}

/** One attached agent. Cursors are per-proc, because subscriptions are. */
export interface Conn {
  /** Line framing for the agent's own NDJSON — the protocol, not a payload. */
  buffer: string;
  /** procId → the last seq this connection has been sent. */
  cursors: Map<string, number>;
  socket: Socket;
}

interface Settled {
  ack: SessiondAck;
  at: number;
}

export interface SessiondOptions {
  /** Reported in `welcome` so the agent can surface skew as a board notice. */
  build?: BuildInfo;
  /** Injectable for tests; production passes nothing and gets the real clock. */
  now?: () => number;
}

const DEFAULT_BUILD: BuildInfo = { version: "0.1.0", startedAt: Date.now() };

/**
 * The daemon, minus its process wrapper. Constructed and driven directly by
 * tests; `main.ts` only adds the endpoint, the signal wiring and the exit.
 */
export class SessiondServer {
  /**
   * Per-boot epoch (§7). A cursor minted under a previous epoch is a dead
   * cursor: the agent compares epochs and does not attempt a resume across
   * one. sessiond itself needs no check beyond `SessionRing.canReplay`.
   */
  readonly epoch = randomUUID();
  readonly #procs = new Map<string, Proc>();
  readonly #conns = new Set<Conn>();
  /** commandId → the ack it settled with. A re-delivery is re-acked, never re-run. */
  readonly #settled = new Map<string, Settled>();
  readonly #build: BuildInfo;
  readonly #now: () => number;
  #server: Server | undefined;
  #endpoint: string | undefined;

  constructor(options: SessiondOptions = {}) {
    this.#build = options.build ?? DEFAULT_BUILD;
    this.#now = options.now ?? Date.now;
  }

  /**
   * Bind the unix socket. §9: the transport *is* the security model — a
   * `0600` socket inside a `0700` directory, no abstract namespace (it has no
   * file permissions; here the path is the access control).
   *
   * Stale-socket handling, also §9: on `EADDRINUSE` we probe with a connect.
   * Refused means a crashed predecessor's leftover — unlink and bind.
   * Answered means a live sessiond — refuse loudly rather than steal its
   * socket, because two daemons owning one machine's children is the one
   * state nothing downstream can recover from.
   */
  async listen(endpoint: string): Promise<void> {
    mkdirSync(dirname(endpoint), { recursive: true, mode: 0o700 });
    chmodSync(dirname(endpoint), 0o700);
    try {
      await this.#bind(endpoint);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
        throw error;
      }
      if (await probe(endpoint)) {
        throw new Error(
          `[sessiond] another sessiond is already listening on ${endpoint}`,
          { cause: error }
        );
      }
      await unlink(endpoint);
      await this.#bind(endpoint);
    }
    chmodSync(endpoint, 0o600);
    this.#endpoint = endpoint;
  }

  #bind(endpoint: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => this.#accept(socket));
      server.once("error", reject);
      server.listen(endpoint, () => {
        server.removeListener("error", reject);
        this.#server = server;
        resolve();
      });
    });
  }

  /** What is alive, right now — the body of both `welcome` and `list`. */
  procs(): SessiondProcInfo[] {
    return [...this.#procs.values()].map((proc) => ({
      procId: proc.procId,
      pid: proc.child.pid ?? -1,
      alive: proc.alive,
      ...(proc.exitCode === null ? {} : { exitCode: proc.exitCode }),
      ...(proc.signal === null ? {} : { signal: proc.signal }),
      head: proc.ring.head,
      ...(proc.cwd === undefined ? {} : { cwd: proc.cwd }),
    }));
  }

  // ---------------------------------------------------------------- connections

  #accept(socket: Socket): void {
    const conn: Conn = { socket, buffer: "", cursors: new Map() };
    this.#conns.add(conn);
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.#onData(conn, chunk));
    // A dropped agent is the normal case, not an incident: children keep
    // running, rings keep filling, and the reattach reads its backlog out of
    // the ring. That is the whole tmux property, and it needs no code here.
    socket.on("error", () => this.#conns.delete(conn));
    socket.on("close", () => this.#conns.delete(conn));
    this.#send(conn, {
      type: "welcome",
      epoch: this.epoch,
      capabilities: [SESSIOND_V1],
      build: this.#build,
      procs: this.procs(),
    });
  }

  #onData(conn: Conn, chunk: string): void {
    conn.buffer += chunk;
    let nl = conn.buffer.indexOf("\n");
    while (nl >= 0) {
      const line = conn.buffer.slice(0, nl);
      conn.buffer = conn.buffer.slice(nl + 1);
      if (line.trim()) {
        this.#onLine(conn, line);
      }
      nl = conn.buffer.indexOf("\n");
    }
  }

  #onLine(conn: Conn, line: string): void {
    // The ONE decode in this daemon, and it is the agent's own envelope.
    // Child output never reaches this path — it goes to #ingest, which cuts
    // newlines and nothing else.
    let message: unknown;
    try {
      message = JSON.parse(line); // protocol envelope off the socket, never a payload
    } catch {
      this.#send(conn, ack("", "failed", "malformed: not json"));
      return;
    }
    this.handle(conn, message);
  }

  /**
   * Dispatch one client message. Public so tests can drive the daemon without
   * a socket; the socket path funnels here after framing.
   */
  handle(conn: Conn, message: unknown): void {
    const msg = message as Record<string, unknown>;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: `message` is `unknown` off the wire — TS's cast doesn't rule out a runtime null/undefined (e.g. `JSON.parse("null")`)
    const type = typeof msg?.type === "string" ? msg.type : "";
    // biome-ignore lint/suspicious/noUnnecessaryConditions: same as above — msg can be null/undefined at runtime despite the cast
    const commandId = typeof msg?.commandId === "string" ? msg.commandId : "";

    if (type === "subscribe") {
      this.#subscribe(
        conn,
        String(msg.procId ?? ""),
        msg.afterSeq as number | undefined
      );
      return;
    }
    if (type === "list") {
      this.#send(conn, {
        type: "welcome",
        epoch: this.epoch,
        capabilities: [SESSIOND_V1],
        build: this.#build,
        procs: this.procs(),
      });
      return;
    }

    // §8: a re-delivered commandId is re-acked, never re-executed. This is
    // what makes "re-send everything unacked after a socket drop" safe, and
    // it is why `spawn` retried across a drop is an ack rather than a
    // kill-and-replace of a perfectly healthy child.
    if (commandId) {
      const prior = this.#lookupSettled(commandId);
      if (prior) {
        this.#send(conn, prior);
        return;
      }
    }

    let settlement: SessiondAck;
    switch (type) {
      case "spawn":
        settlement = this.#spawn(
          commandId,
          String(msg.procId ?? ""),
          msg.spec as ProcSpec
        );
        break;
      case "write":
        settlement = this.#write(
          commandId,
          String(msg.procId ?? ""),
          String(msg.data ?? "")
        );
        break;
      case "signal":
        settlement = this.#signal(
          commandId,
          String(msg.procId ?? ""),
          (msg.sig as NodeJS.Signals) ?? "SIGTERM"
        );
        break;
      case "stdin_end":
        settlement = this.#stdinEnd(commandId, String(msg.procId ?? ""));
        break;
      default:
        // §5: unknown types are ANSWERED, never fatal. This is precisely how
        // the agent evolves past a months-old sessiond — it probes, reads
        // `unsupported`, and falls back. Closing the connection here would
        // turn every future agent feature into a sessiond release.
        this.#send(
          conn,
          ack(commandId, "failed", `unsupported: ${type || "(missing type)"}`)
        );
        return;
    }
    if (commandId) {
      this.#settled.set(commandId, { ack: settlement, at: this.#now() });
    }
    this.#send(conn, settlement);
  }

  #lookupSettled(commandId: string): SessiondAck | undefined {
    const entry = this.#settled.get(commandId);
    if (!entry) {
      return undefined;
    }
    if (this.#now() - entry.at > COMMAND_TTL_MS) {
      this.#settled.delete(commandId);
      return undefined;
    }
    return entry.ack;
  }

  // -------------------------------------------------------------------- verbs

  #spawn(
    commandId: string,
    procId: string,
    spec: ProcSpec | undefined
  ): SessiondAck {
    if (!(procId && spec?.command)) {
      return ack(
        commandId,
        "failed",
        "spawn: procId and spec.command required"
      );
    }
    const existing = this.#procs.get(procId);
    // A fresh commandId for a live procId is the agent's deliberate relaunch
    // (the kill-and-replace semantics it has today); the dedup map above is
    // what keeps a mere retry from landing here.
    if (existing?.alive) {
      existing.child.kill("SIGKILL");
    }

    // biome-ignore lint/suspicious/noUnnecessaryConditions: spec is agent-side and opaque (§3.2) — the ProcSpec type promises args, the wire does not
    const child = spawn(spec.command, spec.args ?? [], {
      cwd: spec.cwd,
      // The spec is built entirely agent-side and handed over opaque (§3.2):
      // sessiond does not read, validate or enrich a single entry of it.
      env: spec.env ? { ...process.env, ...spec.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    const proc: Proc = {
      procId,
      child,
      ring: new SessionRing<string>(SESSIOND_RING_LINES),
      sizes: [],
      bytes: 0,
      partial: "",
      alive: true,
      exitCode: null,
      signal: null,
      ...(spec.cwd === undefined ? {} : { cwd: spec.cwd }),
    };
    this.#procs.set(procId, proc);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.#ingest(proc, chunk));
    // stderr is not a second stream in the protocol: it is drained so the
    // pipe can never fill and wedge the child (§6's "no path from a slow
    // agent to a blocked child"), and otherwise ignored.
    child.stderr.resume();
    child.stdin.on("error", () => {
      /* a write to a stdin whose child already died is not an event */
    });
    child.on("error", () => this.#reap(proc, null, null));
    child.on("exit", (code, signal) => this.#reap(proc, code, signal));
    return ack(commandId, "applied");
  }

  #write(commandId: string, procId: string, data: string): SessiondAck {
    const proc = this.#procs.get(procId);
    if (!proc?.alive) {
      return ack(commandId, "failed", `write: ${procId} is not alive`);
    }
    // Bytes, unread. Whatever this is — a user turn, a control_response, an
    // image — sessiond's only opinion is that it reaches stdin intact.
    proc.child.stdin.write(data);
    return ack(commandId, "applied");
  }

  #signal(commandId: string, procId: string, sig: NodeJS.Signals): SessiondAck {
    const proc = this.#procs.get(procId);
    if (!proc?.alive) {
      return ack(commandId, "failed", `signal: ${procId} is not alive`);
    }
    proc.child.kill(sig);
    return ack(commandId, "applied");
  }

  #stdinEnd(commandId: string, procId: string): SessiondAck {
    const proc = this.#procs.get(procId);
    if (!proc?.alive) {
      return ack(commandId, "failed", `stdin_end: ${procId} is not alive`);
    }
    proc.child.stdin.end();
    return ack(commandId, "applied");
  }

  #subscribe(conn: Conn, procId: string, afterSeq: number | undefined): void {
    const proc = this.#procs.get(procId);
    if (!proc) {
      // Attaching before the spawn lands is the spawn choreography, not a lost
      // window: the wrapper subscribes, then asks for the child. Two things
      // matter here. The cursor is registered even though there is no ring
      // yet, because `#emit` fans out only to conns that carry one — without
      // this line the subscriber is silently absent from that loop and the
      // child's every line goes nowhere. And a caller that has consumed
      // nothing (`0`/absent) has lost nothing, so it gets the same empty
      // backlog as "follow from now" rather than a reset claiming a gap that
      // did not happen. A caller resuming from a real cursor against a proc
      // this daemon does not have HAS lost its window, and still gets §6's
      // honest refusal.
      conn.cursors.set(procId, 0);
      if (afterSeq === undefined || afterSeq === 0) {
        this.#send(conn, { type: "proc.backlog", procId, events: [] });
      } else {
        this.#send(conn, { type: "proc.reset", procId, nextSeq: 1 });
      }
      return;
    }
    conn.cursors.set(procId, proc.ring.head);
    if (afterSeq === undefined) {
      // Follow from now: an empty backlog, so the agent sees the same
      // choreography (backlog-then-deltas) on both paths.
      this.#send(conn, { type: "proc.backlog", procId, events: [] });
      return;
    }
    if (!proc.ring.canReplay(afterSeq)) {
      // §6: an honest refusal, never a partial replay. The agent turns this
      // into a visible seam in the transcript rather than a stream that
      // silently skipped the lines nobody will ever look for.
      //
      // The refusal carries how far back this ring DOES go, because refusing
      // without saying so threw away a window that was still there: a caller
      // asking from the ring's start is asking that very question, and
      // `nextSeq` alone answered it with a line the child has not written yet
      // (`head + 1`). A reader that reopens on `oldest - 1` gets everything
      // sessiond still holds; one that ignores the field behaves exactly as
      // it did before. Absent when the ring has been dropped entirely, which
      // is the one case where there is honestly nothing to go back to.
      const { oldest } = proc.ring;
      this.#send(conn, {
        type: "proc.reset",
        procId,
        nextSeq: proc.ring.head + 1,
        ...(oldest >= 1 && oldest <= proc.ring.head ? { oldest } : {}),
      });
      return;
    }
    this.#send(conn, {
      type: "proc.backlog",
      procId,
      events: proc.ring.since(afterSeq).map(toLine),
    });
  }

  // --------------------------------------------------------------- the ring

  /**
   * Cut the child's stdout on newlines and record whole lines. The ONLY thing
   * done to a payload anywhere in this daemon.
   */
  #ingest(proc: Proc, chunk: string): void {
    proc.partial += chunk;
    let nl = proc.partial.indexOf("\n");
    while (nl >= 0) {
      this.#record(proc, proc.partial.slice(0, nl));
      proc.partial = proc.partial.slice(nl + 1);
      nl = proc.partial.indexOf("\n");
    }
  }

  #record(proc: Proc, data: string): void {
    const event = proc.ring.record(proc.procId, data);
    const slot = (event.seq - 1) % SESSIOND_RING_LINES;
    // Subtract whatever this slot used to hold: the ring overwrote it, so it
    // is no longer replayable and no longer counts against the byte ceiling.
    proc.bytes += data.length - (proc.sizes[slot] ?? 0);
    proc.sizes[slot] = data.length;
    if (proc.bytes > RING_BYTES) {
      // Drop the window, keep the sequence — `SessionRing.forget()`'s exact
      // contract. Everyone behind gets a `reset` on their next resume; nobody
      // gets a spliced stream, and the child is never blocked to save it.
      proc.ring.forget();
      proc.sizes = [];
      proc.bytes = 0;
    }
    const line: SessiondLine = { seq: event.seq, procId: proc.procId, data };
    for (const conn of this.#conns) {
      if (!conn.cursors.has(proc.procId)) {
        continue;
      }
      conn.cursors.set(proc.procId, line.seq);
      this.#send(conn, { type: "proc.line", event: line });
    }
  }

  #reap(proc: Proc, code: number | null, signal: NodeJS.Signals | null): void {
    if (!proc.alive) {
      return;
    }
    // The final line often arrives without its newline; record it rather than
    // lose the record that explains the death.
    if (proc.partial) {
      this.#record(proc, proc.partial);
      proc.partial = "";
    }
    proc.alive = false;
    proc.exitCode = code;
    proc.signal = signal;
    // A proc `#spawn` has already replaced under its id is nobody's session
    // any more: its exit, announced under that id, would land on the
    // successor's subscriber as the successor's own death.
    if (this.#procs.get(proc.procId) !== proc) {
      return;
    }
    for (const conn of this.#conns) {
      this.#send(conn, {
        type: "proc.exit",
        procId: proc.procId,
        exitCode: code,
        signal,
      });
    }
  }

  #send(conn: Conn, message: SessiondServerMessage): void {
    if (conn.socket.destroyed) {
      return;
    }
    conn.socket.write(`${JSON.stringify(message)}\n`);
  }

  // --------------------------------------------------------------------- drain

  /**
   * §11: a plain function, not a signal handler. `main.ts` wires SIGTERM/SIGINT
   * to it, and the eventual Windows entry point wires console ctrl events to
   * the same function without touching a line of this logic.
   *
   * stdin-EOF first (the harness's own graceful path), then the grace window,
   * then SIGKILL. No child outlives the drain.
   */
  async drain(graceMs = DRAIN_TIMEOUT_MS): Promise<void> {
    const alive = [...this.#procs.values()].filter((proc) => proc.alive);
    for (const proc of alive) {
      try {
        proc.child.stdin.end();
      } catch {
        /* already gone */
      }
    }
    const deadline = Date.now() + graceMs;
    while (Date.now() < deadline && alive.some((proc) => proc.alive)) {
      // biome-ignore lint/performance/noAwaitInLoops: polls until every child exits or the grace window closes; each check depends on the previous sleep
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    for (const proc of alive) {
      if (proc.alive) {
        proc.child.kill("SIGKILL");
      }
    }
  }

  /** Stop listening and drop the socket file. Children are drain's business. */
  async close(): Promise<void> {
    for (const conn of this.#conns) {
      conn.socket.destroy();
    }
    this.#conns.clear();
    const server = this.#server;
    this.#server = undefined;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (this.#endpoint) {
      await unlink(this.#endpoint).catch(() => {
        /* already unlinked */
      });
      this.#endpoint = undefined;
    }
  }
}

const ack = (
  commandId: string,
  stage: SessiondAck["stage"],
  reason?: string
): SessiondAck => ({
  type: "ack",
  commandId,
  stage,
  ...(reason ? { reason } : {}),
});

const toLine = (event: {
  seq: number;
  sessionId: string;
  frame: unknown;
}): SessiondLine => ({
  seq: event.seq,
  procId: event.sessionId,
  data: event.frame as string,
});

/** Does something answer on this endpoint? The §9 stale-socket probe. */
const probe = (endpoint: string): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = createConnection(endpoint);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
