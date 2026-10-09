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
import { chmod, mkdir, stat, unlink } from "node:fs/promises";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import { dirname } from "node:path";
import { type BuildInfo, SessionRing } from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { LineSplitter } from "@cawco/core/lines";
import { PacedWriter } from "@cawco/core/paced-write";
import { processLineage } from "@cawco/core/process-identity";
import { sessionEnvironment } from "@cawco/core/session-env";
// The protocol lives behind its own subpath: `sessiond.ts` reaches for `node:os`
// to derive the endpoint, and the core barrel is imported by the browser bundle.
import {
  type ProcSpec,
  SESSIOND_DRAINING,
  SESSIOND_PROCESS_LIMIT,
  SESSIOND_V1,
  type SessiondAck,
  type SessiondLine,
  type SessiondProcInfo,
  type SessiondServerMessage,
} from "@cawco/core/sessiond";
import { JOIN_CHILDREN } from "./cgroup";
import { capChildTasks, START_ROOM, TASK_RESERVE, taskHeadroom } from "./tasks";

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

/**
 * How long what a child started gets to end by itself once the child is gone,
 * before it is killed. Our choice: an MCP server closes when its client does
 * and a browser when its driver does, in well under a second; two is room for
 * a loaded machine, and short enough that a stopped session's memory is back
 * before anyone looks.
 */
export const SWEEP_GRACE_MS = 2000;

/**
 * How often every live child's tree is read, so a child that dies unasked
 * (the kernel's OOM killer, a crash) still has its tree on record. Our
 * choice: one `ps` for the whole machine every half minute costs nothing
 * anyone can measure, and a process started and orphaned inside one interval
 * is the only one a sweep can miss.
 */
export const SURVEY_INTERVAL_MS = 30_000;

/**
 * One process as the operating system lists it. `started` is its start time
 * as `ps -o lstart=` prints it: with the pid, what says a pid seen later is
 * still the same process and not another that was since given its number.
 */
interface Listed {
  pgid: number;
  pid: number;
  ppid: number;
  started: string;
}

/**
 * Every process on the machine, read from the kernel (core's process
 * reader: one `kern.proc.all` sysctl on macOS, `/proc` on Linux), as `ps -A
 * -o pid=,ppid=,pgid=,lstart=` listed it. Neither system has a call that
 * lists a process's descendants, so the whole table is read.
 *
 * NOTHING HERE WAITS ON ANOTHER PROCESS. This was a synchronous spawn of the
 * process lister, and on a Mac it wedged the keeper: Bun's `spawnSync` waits on a private kqueue
 * of its own and, while it waits, points the runtime's loop handle at it, so
 * polls and keep-alives released or armed in that window land on the wrong
 * loop (oven-sh/bun#34069, the fix still open as oven-sh/bun#40078). The
 * keeper of 8 Oct held that second kqueue (lsof fd 8), sat in `kevent64` with
 * its socket open, and sent no `welcome` to anyone for 35 minutes.
 *
 * AND NOTHING HERE HOLDS THE LOOP. The read is synchronous on macOS, and the
 * welcome waits behind it. It reads the tree and the start times alone
 * (`processLineage`, under a millisecond), never every thread's state: that
 * read took 70 to 460ms on a Mac at load 550, once per child asked to end, and
 * twenty stopped at once held the loop 580ms. Asks made in the same turn of
 * the loop share one reading, which is the same moment for each of them.
 */
let reading: Promise<Listed[]> | undefined;
const processTable = (): Promise<Listed[]> => {
  reading ??= processLineage()
    .then((rows) =>
      rows.map(({ pid, ppid, pgid, started }) => ({
        pid,
        ppid,
        pgid,
        // As this daemon always held it: the columns split on runs of spaces
        // and joined by one (`Thu Oct 1 20:26:18 2026`).
        started: started.split(SPACES).join(" "),
      }))
    )
    .finally(() => {
      reading = undefined;
    });
  return reading;
};
const SPACES = /\s+/;

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const signalPid = (pid: number, sig: NodeJS.Signals): void => {
  try {
    process.kill(pid, sig);
  } catch {
    // already gone
  }
};

/** A live (or recently dead) child, plus the ring nobody else may reach. */
interface Proc {
  alive: boolean;
  bytes: number;
  child: ChildProcessWithoutNullStreams;
  /** The spec's `cwd`, kept so a reattaching agent learns where this child runs. */
  cwd?: string;
  exitCode: number | null;
  /** Cuts stdout into lines. Framing only. */
  lines: LineSplitter;
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
  /**
   * Every process this child was seen to have started, by pid, with its start
   * time: read when the child is asked to end or signalled, while it is still
   * their ancestor. Once it exits they are reparented, and nothing but this
   * says they were its own.
   */
  tree: Map<number, string>;
}

/** One attached agent. Cursors are per-proc, because subscriptions are. */
export interface Conn {
  /** procId → the last seq this connection has been sent. */
  cursors: Map<string, number>;
  /** Line framing for the agent's own NDJSON — the protocol, not a payload. */
  lines: LineSplitter;
  /** Everything sent to this agent, in order, a piece at a time. */
  out: PacedWriter;
  socket: Socket;
}

export interface SessiondOptions {
  /** Reported in `welcome` so the agent can surface skew as a board notice. */
  build?: BuildInfo;
  /** The children's cgroup's `cgroup.procs`, which each child joins before it execs (cgroup.ts). */
  children?: string;
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
  /** A survey's reading is still out: the clock does not start a second. */
  #surveyInFlight = false;
  /** The spawn in progress; the next waits for it ({@link #queueSpawn}). */
  #spawning: Promise<unknown> = Promise.resolve();
  /** The children's cgroup's `cgroup.procs`, when the keeper has one. */
  readonly #children: string | undefined;
  /** The sweeps still giving an ended child's tree its grace ({@link #sweep}). */
  readonly #sweeps = new Set<ReturnType<typeof setTimeout>>();
  /** The clock every live child's tree is read on ({@link #survey}). */
  #surveying: ReturnType<typeof setInterval> | undefined;
  readonly #build: BuildInfo;
  #server: Server | undefined;
  #endpoint: string | undefined;
  /** The inode of the socket file this keeper bound: the path is unlinked only while it is still this one. */
  #socketInode: number | undefined;
  /**
   * Set once, when the drain starts: from then nothing new starts here and no
   * connection is accepted ({@link drain}).
   */
  #draining = false;
  /** The listener's close, begun when the drain starts and awaited by {@link close}. */
  #listenerClosed: Promise<void> | undefined;

  constructor(options: SessiondOptions = {}) {
    this.#build = options.build ?? DEFAULT_BUILD;
    this.#children = options.children;
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
    await mkdir(dirname(endpoint), { recursive: true, mode: 0o700 });
    await chmod(dirname(endpoint), 0o700);
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
    await chmod(endpoint, 0o600);
    this.#endpoint = endpoint;
    this.#socketInode = (await stat(endpoint)).ino;
    this.#surveying = setInterval(() => {
      if (
        // biome-ignore lint/suspicious/noUnnecessaryConditions: set true below and false in the reading's `finally`; biome's inference sees only the initializer
        this.#surveyInFlight ||
        ![...this.#procs.values()].some((proc) => proc.alive)
      ) {
        return;
      }
      this.#surveyInFlight = true;
      processTable()
        .then((table) => {
          // Read at the answer, not at the ask: a child that ended meanwhile
          // has its tree from this reading only if it is still alive.
          for (const proc of this.#procs.values()) {
            if (proc.alive) {
              this.#survey(proc, table);
            }
          }
        })
        .catch((error: unknown) => {
          console.error(
            `[sessiond] survey: the process table could not be read: ${reasonOf(error)}`
          );
        })
        .finally(() => {
          this.#surveyInFlight = false;
        });
    }, SURVEY_INTERVAL_MS);
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
    const conn: Conn = {
      socket,
      lines: new LineSplitter(),
      out: new PacedWriter(socket),
      cursors: new Map(),
    };
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
    // A connection the listener took in just as the drain began.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: set true by drain() at runtime; biome's inference sees only the initializer
    if (this.#draining) {
      this.#send(conn, { type: "draining" });
    }
  }

  #onData(conn: Conn, chunk: string): void {
    for (const line of conn.lines.push(chunk)) {
      if (line.trim()) {
        this.#onLine(conn, line);
      }
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

    let settlement: SessiondAck | Promise<SessiondAck>;
    switch (type) {
      case "spawn":
        settlement = this.#queueSpawn(
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
    if (settlement instanceof Promise) {
      this.#settleLater(conn, commandId, settlement);
      return;
    }
    this.#send(conn, settlement);
  }

  /**
   * A verb that reads the process table first settles when the reading is in.
   * A reading that fails settles the command as failed, with the reason: the
   * agent learns its signal reached nobody rather than that it landed.
   */
  #settleLater(
    conn: Conn,
    commandId: string,
    pending: Promise<SessiondAck>
  ): void {
    const settled = pending.catch((error: unknown) =>
      ack(
        commandId,
        "failed",
        `the process table could not be read: ${reasonOf(error)}`
      )
    );
    detach(
      settled.then((settlement) => this.#send(conn, settlement)),
      "sessiond settlement"
    );
  }

  // -------------------------------------------------------------------- verbs

  /**
   * Spawns run one at a time, each after the one before has started or been
   * refused: a burst of starts (an update's held starts all released at once)
   * is weighed against the room left after the child before it, never all
   * against the same reading.
   */
  #queueSpawn(
    commandId: string,
    procId: string,
    spec: ProcSpec | undefined
  ): Promise<SessiondAck> {
    const next = this.#spawning.then(() =>
      this.#spawn(commandId, procId, spec)
    );
    this.#spawning = next.catch(() => undefined);
    return next;
  }

  /**
   * THE KEEPER OUTLIVES WHAT IT CANNOT START. A child is started only with
   * room for it to come up ({@link START_ROOM}) above what the keeper keeps
   * for itself ({@link TASK_RESERVE}); one without is refused, with the limit
   * in the reason ({@link SESSIOND_PROCESS_LIMIT}), and so is one whose fork
   * the kernel refuses. The ack comes when the child has started or failed to,
   * never before: a refused fork is a refusal, not an applied spawn followed
   * by a death nobody can explain.
   */
  async #spawn(
    commandId: string,
    procId: string,
    spec: ProcSpec | undefined
  ): Promise<SessiondAck> {
    // Checked when the spawn's turn comes, not when it arrived: one queued
    // behind another as the drain began starts nothing either.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: set true by drain() at runtime; biome's inference sees only the initializer
    if (this.#draining) {
      return ack(commandId, "failed", SESSIOND_DRAINING);
    }
    if (!(procId && spec?.command)) {
      return ack(
        commandId,
        "failed",
        "spawn: procId and spec.command required"
      );
    }
    const room = await taskHeadroom();
    if (room && room.free < TASK_RESERVE + START_ROOM) {
      return ack(
        commandId,
        "failed",
        `${SESSIOND_PROCESS_LIMIT}: ${room.what}; a child starts with ${START_ROOM} free above the ${TASK_RESERVE} kept for the keeper`
      );
    }
    const existing = this.#procs.get(procId);
    // A spawn for a live procId is the agent's deliberate relaunch (the
    // kill-and-replace semantics it has today): the agent never sends a
    // spawn twice, so nothing but a relaunch lands here.
    if (existing?.alive) {
      // The kill lands once its tree is read; the successor starts now, under
      // its own process group, so nothing of it is in what gets killed.
      this.#signalTree(existing, "SIGKILL").catch((error: unknown) => {
        console.error(
          `[sessiond] ${procId}: the replaced child's tree could not be read, so it was not killed: ${reasonOf(error)}`
        );
      });
    }

    let child: ChildProcessWithoutNullStreams;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: spec is agent-side and opaque (§3.2) — the ProcSpec type promises args, the wire does not
    const args = spec.args ?? [];
    // With a children's cgroup, the child starts in a shell that joins it and
    // execs the command in place (same pid): capped from its first instruction.
    const [command, argv] = this.#children
      ? [
          "/bin/sh",
          ["-c", JOIN_CHILDREN, this.#children, spec.command, ...args],
        ]
      : [spec.command, args];
    try {
      child = spawn(command, argv, {
        cwd: spec.cwd,
        // The spec is built entirely agent-side and handed over opaque (§3.2):
        // sessiond does not read, validate or enrich a single entry of it.
        // Under it, this keeper's own environment as a session gets it: its
        // socket, and the embedded pi's package dir its entry set, are
        // CawCo's own and reach no child (core `sessionEnvironment`).
        env: { ...sessionEnvironment(process.env), ...spec.env },
        stdio: ["pipe", "pipe", "pipe"],
        // Its own process group, which it leads: what it starts stays findable
        // under its pid after it has exited ({@link #survey}).
        detached: true,
      }) as ChildProcessWithoutNullStreams;
    } catch (error) {
      return refusedSpawn(commandId, error);
    }

    const proc: Proc = {
      procId,
      child,
      tree: new Map(),
      ring: new SessionRing<string>(SESSIOND_RING_LINES),
      sizes: [],
      bytes: 0,
      lines: new LineSplitter(),
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
    const started = await new Promise<Error | undefined>((resolve) => {
      child.once("spawn", () => resolve(undefined));
      child.once("error", (error) => resolve(error));
    });
    if (started) {
      // It never ran: nobody's session, and no exit to announce.
      proc.alive = false;
      if (this.#procs.get(procId) === proc) {
        this.#procs.delete(procId);
      }
      return refusedSpawn(commandId, started);
    }
    child.on("error", () => this.#reap(proc, null, null));
    child.on("exit", (code, signal) => this.#reap(proc, code, signal));
    if (child.pid !== undefined) {
      await capChildTasks(child.pid);
    }
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

  #signal(
    commandId: string,
    procId: string,
    sig: NodeJS.Signals
  ): SessiondAck | Promise<SessiondAck> {
    const proc = this.#procs.get(procId);
    if (!proc?.alive) {
      return ack(commandId, "failed", `signal: ${procId} is not alive`);
    }
    return this.#signalTree(proc, sig).then(() => ack(commandId, "applied"));
  }

  #stdinEnd(
    commandId: string,
    procId: string
  ): SessiondAck | Promise<SessiondAck> {
    const proc = this.#procs.get(procId);
    if (!proc?.alive) {
      return ack(commandId, "failed", `stdin_end: ${procId} is not alive`);
    }
    // Read before the child starts to go: what it started is its own only
    // while it is still there to be their ancestor. The end waits for the
    // reading; a reading that fails still ends stdin, since closing it is the
    // harness's own graceful way out and needs no tree.
    return this.#readTree(proc).then(
      () => {
        proc.child.stdin.end();
        return ack(commandId, "applied");
      },
      (error: unknown) => {
        proc.child.stdin.end();
        console.error(
          `[sessiond] ${procId}: its tree could not be read before stdin closed: ${reasonOf(error)}`
        );
        return ack(commandId, "applied");
      }
    );
  }

  // ---------------------------------------------------------------- the tree

  /**
   * Everything `proc` started that is running now, itself included while it
   * lives: its descendants by parentage, the process group it leads, and what
   * an earlier reading found that is still the same process, with the
   * descendants of those. Recorded on the proc, so the next reading still
   * knows them after the child has exited and they have been reparented.
   *
   * Parentage alone misses what was reparented before the reading, and the
   * group alone misses what left it: a shell the child ran with job control,
   * a browser its driver launched detached. Read together, at each moment the
   * child is asked to end, they are the tree.
   *
   * Every live child is read on a clock as well ({@link SURVEY_INTERVAL_MS}):
   * one the kernel kills for memory is asked nothing first, and what it had
   * started is known only from the reading before.
   */
  #survey(proc: Proc, table: Listed[]): number[] {
    const root = proc.child.pid ?? -1;
    const byParent = new Map<number, Listed[]>();
    for (const row of table) {
      const siblings = byParent.get(row.ppid);
      if (siblings) {
        siblings.push(row);
      } else {
        byParent.set(row.ppid, [row]);
      }
    }
    const running = new Map<number, string>();
    const take = (row: Listed): void => {
      if (running.has(row.pid)) {
        return;
      }
      running.set(row.pid, row.started);
      for (const child of byParent.get(row.pid) ?? []) {
        take(child);
      }
    };
    for (const row of table) {
      // The child's own pid is the child only while it lives: afterwards the
      // number is the system's to hand out again.
      const own =
        row.pid === root
          ? proc.alive
          : row.pgid === root || proc.tree.get(row.pid) === row.started;
      if (own) {
        take(row);
      }
    }
    proc.tree = running;
    return [...running.keys()];
  }

  /** {@link #survey} on a fresh reading of the process table. */
  async #readTree(proc: Proc): Promise<number[]> {
    return this.#survey(proc, await processTable());
  }

  /** A signal for the child reaches everything it started. */
  async #signalTree(proc: Proc, sig: NodeJS.Signals): Promise<void> {
    for (const pid of await this.#readTree(proc)) {
      signalPid(pid, sig);
    }
  }

  /**
   * WHAT A CHILD STARTED DOES NOT OUTLIVE IT. A harness that exits leaves its
   * MCP servers to close themselves and their browsers to follow, and one
   * killed outright leaves them running under init with nobody to end them:
   * 136 MCP server sets and 569 browser processes were alive behind about a
   * dozen working sessions the day this was written. Whatever is left is told
   * to end now, and killed after {@link SWEEP_GRACE_MS}.
   */
  async #sweep(proc: Proc): Promise<void> {
    const left = await this.#readTree(proc);
    if (left.length === 0) {
      return;
    }
    for (const pid of left) {
      signalPid(pid, "SIGTERM");
    }
    const timer = setTimeout(() => {
      this.#sweeps.delete(timer);
      this.#signalTree(proc, "SIGKILL").catch((error: unknown) => {
        console.error(
          `[sessiond] ${proc.procId}: what it started could not be read for the kill: ${reasonOf(error)}`
        );
      });
    }, SWEEP_GRACE_MS);
    this.#sweeps.add(timer);
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
    for (const line of proc.lines.push(chunk)) {
      this.#record(proc, line);
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
    if (proc.lines.pending) {
      this.#record(proc, proc.lines.end());
    }
    proc.alive = false;
    proc.exitCode = code;
    proc.signal = signal;
    this.#sweep(proc).catch((error: unknown) => {
      console.error(
        `[sessiond] ${proc.procId}: what it started could not be read, so it was not swept: ${reasonOf(error)}`
      );
    });
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
    // Paced: a ring line can be megabytes, and Bun's socket write is
    // quadratic in what it has to queue (core/paced-write.ts).
    conn.out.write(`${JSON.stringify(message)}\n`);
  }

  // --------------------------------------------------------------------- drain

  /**
   * §11: a plain function, not a signal handler. `main.ts` wires SIGTERM/SIGINT
   * to it, and the eventual Windows entry point wires console ctrl events to
   * the same function without touching a line of this logic.
   *
   * stdin-EOF first (the harness's own graceful path), then the grace window,
   * then SIGKILL. No child outlives the drain, and nothing a child started.
   *
   * NOTHING NEW STARTS ON A KEEPER THAT IS ENDING. The listener closes and
   * its path goes before the first child is told to end, every attached agent
   * is told (`draining`), and a spawn still to come is refused. A drain under
   * load was still running 30 s after its SIGTERM (2026-10-09), still
   * accepting, and an agent's next ten starts went down its still-open
   * connection to a keeper that was ending: none of them ever started.
   */
  async drain(graceMs = DRAIN_TIMEOUT_MS): Promise<void> {
    this.#draining = true;
    this.#listenerClosed ??= this.#closeListener();
    for (const conn of this.#conns) {
      this.#send(conn, { type: "draining" });
    }
    const alive = [...this.#procs.values()].filter((proc) => proc.alive);
    if (alive.length > 0) {
      const table = await processTable().catch((error: unknown) => {
        console.error(
          `[sessiond] drain: the process table could not be read before the children were told to end: ${reasonOf(error)}`
        );
      });
      for (const proc of table ? alive : []) {
        this.#survey(proc, table as Listed[]);
      }
    }
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
    // The grace is spent: the sweeps still waiting on theirs end here too.
    for (const timer of this.#sweeps) {
      clearTimeout(timer);
    }
    this.#sweeps.clear();
    if (this.#procs.size === 0) {
      return;
    }
    const table = await processTable().catch((error: unknown) => {
      console.error(
        `[sessiond] drain: the process table could not be read for the final kill; what the children started may outlive them: ${reasonOf(error)}`
      );
    });
    for (const proc of table ? this.#procs.values() : []) {
      for (const pid of this.#survey(proc, table as Listed[])) {
        signalPid(pid, "SIGKILL");
      }
    }
  }

  /**
   * Accept no more connections, and drop the socket file while it is still
   * this keeper's: the keeper started next may have bound the path already,
   * and its socket is not this one's to remove. Resolves once every open
   * connection has ended too (net.Server.close), which {@link close} brings.
   */
  async #closeListener(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;
    const endpoint = this.#endpoint;
    this.#endpoint = undefined;
    // Stops accepting now; settles when the open connections have ended.
    const closed = server
      ? new Promise<void>((resolve) => server.close(() => resolve()))
      : undefined;
    if (endpoint) {
      const now = await stat(endpoint).catch(() => undefined);
      if (now?.ino === this.#socketInode) {
        await unlink(endpoint).catch(() => {
          /* already unlinked */
        });
      }
    }
    await closed;
  }

  /** Stop listening and drop the socket file. Children are drain's business. */
  async close(): Promise<void> {
    clearInterval(this.#surveying);
    this.#listenerClosed ??= this.#closeListener();
    for (const conn of this.#conns) {
      conn.socket.destroy();
    }
    this.#conns.clear();
    await this.#listenerClosed;
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

/**
 * A spawn the operating system refused. A fork refused for want of a task
 * (`EAGAIN`: the user's or the cgroup's limit) is a process-limit refusal;
 * anything else (a missing program, a bad cwd) says what it was.
 */
const refusedSpawn = (commandId: string, error: unknown): SessiondAck => {
  const { code } = error as NodeJS.ErrnoException;
  return code === "EAGAIN"
    ? ack(
        commandId,
        "failed",
        `${SESSIOND_PROCESS_LIMIT}: the kernel refused the fork (EAGAIN)`
      )
    : ack(commandId, "failed", `spawn: ${reasonOf(error)}`);
};

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
