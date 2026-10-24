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
import { readFileSync } from "node:fs";
import { chmod, mkdir, readFile, stat, unlink } from "node:fs/promises";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import { dirname, relative } from "node:path";
import {
  type BuildInfo,
  type ChildLimit,
  type SessionLimits,
  SessionRing,
} from "@cawco/core";
import { CAWCO_ENV } from "@cawco/core/cawco-env";
import { detach } from "@cawco/core/detach";
import { LineSplitter } from "@cawco/core/lines";
import { PacedWriter } from "@cawco/core/paced-write";
import { serverEnvironment, sessionEnvironment } from "@cawco/core/session-env";
// The protocol lives behind its own subpath: `sessiond.ts` reaches for `node:os`
// to derive the endpoint, and the core barrel is imported by the browser bundle.
import {
  notAliveReason,
  type ProcSpec,
  SESSIOND_DRAINING,
  SESSIOND_PROCESS_LIMIT,
  SESSIOND_RELEASE,
  SESSIOND_V1,
  type SessiondAck,
  type SessiondLine,
  type SessiondProcInfo,
  type SessiondServerMessage,
  type SessiondWelcome,
} from "@cawco/core/sessiond";
import {
  listedPid,
  type Pid,
  signal as signalPid,
  spawnedPid,
} from "@cawco/core/signal";
import { workWords } from "@cawco/core/words/work";
import {
  type ChildGroup,
  type Children,
  groupMembers,
  JOIN_CHILDREN,
  killGroup,
  LIMITS,
  OWN_LIMIT_SHARE,
  openChildGroup,
  readGroup,
  removeGroup,
} from "./cgroup";
import { paceList } from "./list-pace";
import { type Listed, processTable } from "./table";
import { capChildTasks, START_ROOM, spawnRefusal, TASK_RESERVE } from "./tasks";

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
 * How much of a child's stderr is kept, its last bytes, to hand on with its
 * exit (`proc.exit`'s `stderr`): what a harness that refused to start said
 * about why ("--dangerously-skip-permissions cannot be used with root/sudo
 * privileges for security reasons", Claude Code as root). Our choice: room
 * for a stack trace's head and the sentence under it, and nothing a chatty
 * child's long life can grow.
 */
export const STDERR_TAIL_BYTES = 4096;

/** What every welcome says this keeper speaks: the protocol, and `release`. */
const CAPABILITIES = [SESSIOND_V1, SESSIOND_RELEASE];

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
 * anyone can measure. A process started and orphaned inside one interval,
 * out of the child's process group, is not in that record: the reading at
 * the child's end finds it by its tree mark ({@link SessiondServer}
 * `#readTree`).
 */
export const SURVEY_INTERVAL_MS = 30_000;

/**
 * How often each child's cgroup is read for a limit it reached, and for
 * whether an ended child's group is empty and can go. Our choice: three small
 * reads per child every two seconds is nothing next to what a runaway costs,
 * and two seconds is soon enough that the operator reads it while the
 * session is still in the turn that ran it.
 */
export const LIMIT_WATCH_MS = 2000;

/** A child's cgroup, watched for its limits until it is empty and removed ({@link SessiondServer.watchGroups}). */
interface Watched {
  group: ChildGroup;
  proc: Proc;
  /** A counter rose at the last reading: the run of refusals it began is already said. */
  rising: Record<ChildLimit, boolean>;
  /** The counters at the last reading. */
  seen: Record<ChildLimit, number>;
}

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The cgroup v2 path a `/proc/<pid>/cgroup` text names (its `0::` line); undefined where it has none. */
const cgroupOf = (text: string): string | undefined =>
  text
    .split("\n")
    .find((line) => line.startsWith("0::"))
    ?.slice(3)
    .trim();

/**
 * Of `running`, what is still in `proc`'s cgroup or one below it: the child
 * itself while it lives, wherever it is, and every other process whose
 * `/proc/<pid>/cgroup` names the child's group. One gone since the table was
 * read is dropped too: there is nothing left to signal. Everything is kept
 * where the child has no cgroup to read (no cgroup v2).
 */
const stillIn = async (
  proc: Proc,
  running: Map<number, string>
): Promise<Map<number, string>> => {
  const own = proc.cgroup;
  if (own === undefined) {
    return running;
  }
  const read = await Promise.all(
    [...running].map(async ([pid, started]) => {
      if (pid === proc.pid && proc.alive) {
        return [pid, started, true] as const;
      }
      const at = cgroupOf(
        await readFile(`/proc/${pid}/cgroup`, "utf8").catch(() => "")
      );
      return [
        pid,
        started,
        at !== undefined && (at === own || at.startsWith(`${own}/`)),
      ] as const;
    })
  );
  return new Map(
    read.flatMap(([pid, started, inside]) => (inside ? [[pid, started]] : []))
  );
};

/**
 * A child's environment: the spec's over this keeper's own as the child gets
 * it. A session gets it as a session does: its socket, and the embedded pi's
 * package dir its entry set, are CawCo's own and reach no child (core
 * `sessionEnvironment`). A harness server, which runs many sessions, gets no
 * `CAWCO_*` at all (`serverEnvironment`). Either gets its tree mark
 * ({@link Proc.mark}), last, so no spec names another's.
 */
const childEnvironment = (
  spec: ProcSpec,
  mark: string
): Record<string, string> => ({
  ...(spec.inherit === "server"
    ? serverEnvironment(process.env)
    : sessionEnvironment(process.env)),
  ...spec.env,
  [CAWCO_ENV.sessiondTree]: mark,
});

/** A live (or recently dead) child, plus the ring nobody else may reach. */
interface Proc {
  alive: boolean;
  bytes: number;
  /**
   * The cgroup the child started in, as `/proc/<pid>/cgroup` names it: its
   * own group, or the keeper's where it has none. Undefined where there is
   * no cgroup v2 (macOS, a v1 or hybrid host), and nothing is read for it.
   */
  cgroup?: string;
  child: ChildProcessWithoutNullStreams;
  /** The spec's `cwd`, kept so a reattaching agent learns where this child runs. */
  cwd?: string;
  exitCode: number | null;
  /**
   * Its own cgroup's directory, when the keeper made it one ({@link
   * openChildGroup}): everything in it is the child's, and a kill of the
   * child kills it whole (`#kill`).
   */
  group?: string;
  /** Cuts stdout into lines. Framing only. */
  lines: LineSplitter;
  /**
   * Its tree mark: a value of its own in its environment
   * (`CAWCO_SESSIOND_TREE`), which everything it starts inherits and keeps
   * wherever it goes, a new session or process group and a new parent
   * included ({@link SessiondServer} `#survey`).
   */
  mark: string;
  /** The command lines of its tree's processes that carry its mark, by pid, as the last marked reading that found any read them: what its sweep names. */
  named: Map<number, string>;
  /** The child's pid, read once its spawn made it: a child with none never becomes a proc. */
  pid: Pid;
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
  /** The last {@link STDERR_TAIL_BYTES} the child wrote on stderr, unread: handed on with its exit. */
  stderr: Buffer;
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
  /** Where each child's own cgroup is made, which it joins before it execs (cgroup.ts). */
  children?: Children;
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
  /** Where each child's own cgroup is made, when the keeper has delegation. */
  readonly #children: Children | undefined;
  /** The keeper's own cgroup, which a child with no group of its own starts in ({@link Proc.cgroup}). */
  readonly #ownCgroup: string | undefined;
  /** Each child's cgroup still on this machine, by its path. */
  readonly #groups = new Map<string, Watched>();
  /** Names each child's group apart from every other this keeper made. */
  #groupSerial = 0;
  /**
   * The fleet's session limits as an agent last said them (`limits`): every
   * child started from then on gets them in its cgroup, whoever asked for the
   * start. None until an agent says.
   */
  #limits: SessionLimits = {};
  /** The clock the children's groups are read on ({@link LIMIT_WATCH_MS}). */
  #watching: ReturnType<typeof setInterval> | undefined;
  /** A reading of the groups is still out: the clock does not start a second. */
  #watchInFlight = false;
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
    this.#ownCgroup = cgroupOf(
      process.platform === "linux"
        ? readFileSync("/proc/self/cgroup", "utf8")
        : ""
    );
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
        // Read at the answer, not at the ask: a child that ended meanwhile
        // has its tree from this reading only if it is still alive.
        .then((table) =>
          Promise.all(
            [...this.#procs.values()]
              .filter((proc) => proc.alive)
              .map((proc) => this.#survey(proc, table))
          )
        )
        .catch((error: unknown) => {
          console.error(
            `[sessiond] survey: the process table could not be read: ${reasonOf(error)}`
          );
        })
        .finally(() => {
          this.#surveyInFlight = false;
        });
    }, SURVEY_INTERVAL_MS);
    if (this.#children) {
      this.#watching = setInterval(() => {
        // biome-ignore lint/suspicious/noUnnecessaryConditions: set true below and false in the reading's `finally`; biome's inference sees only the initializer
        if (this.#watchInFlight || this.#groups.size === 0) {
          return;
        }
        this.#watchInFlight = true;
        this.watchGroups()
          .catch((error: unknown) => {
            console.error(
              `[sessiond] the children's cgroups could not be read: ${reasonOf(error)}`
            );
          })
          .finally(() => {
            this.#watchInFlight = false;
          });
      }, LIMIT_WATCH_MS);
    }
  }

  /**
   * EACH CHILD IS TOLD OF ITS OWN LIMIT. Every child's group is read: a
   * counter that rose since the reading before is a limit the kernel held it
   * to (a fork refused at its `pids.max`, a process killed at its
   * `memory.max`), and every attached agent hears it once per run of
   * refusals (`proc.limit`), which it says on the session. An ended child's
   * group goes once nothing is left in it, read one last time first: a
   * harness the OOM killer ended is reported too.
   */
  async watchGroups(): Promise<void> {
    const watched = [...this.#groups.entries()];
    const readings = await Promise.all(
      watched.map(([path]) => readGroup(path))
    );
    for (const [index, [path, watch]] of watched.entries()) {
      const reading = readings[index];
      for (const limit of LIMITS) {
        const rose = reading[limit] > watch.seen[limit];
        // A run of refusals is said once; one not said (a limit above the
        // child's own) leaves the next reading to say it, should the child
        // reach its own limit within the same run.
        watch.rising[limit] =
          rose &&
          (watch.rising[limit] ||
            this.#reportLimit(watch, limit, reading[limit], reading.current));
        watch.seen[limit] = reading[limit];
      }
      if (
        !(watch.proc.alive || reading.populated) &&
        // biome-ignore lint/performance/noAwaitInLoops: one removal at a time, each after its own last reading
        (await removeGroup(path))
      ) {
        this.#groups.delete(path);
      }
    }
  }

  #reportLimit(
    watch: Watched,
    limit: ChildLimit,
    count: number,
    current: number
  ): boolean {
    const { group, proc } = watch;
    const max = limit === "tasks" ? group.limits.tasks : group.limits.memory;
    if (limit === "tasks" && current < group.limits.tasks * OWN_LIMIT_SHARE) {
      // Refused by a limit above it (the keeper's pool, the user's): not this
      // child's own, and not said as one (cgroup.ts GroupReading.tasks).
      console.warn(
        `[sessiond] ${proc.procId}: a fork in ${group.name} was refused at a limit above it, with ${current} of its own ${group.limits.tasks} tasks in use (pids.events max ${count})`
      );
      return false;
    }
    if (max === undefined) {
      // A kill by the machine's own OOM killer in a group with no memory.max
      // of its own (memory.events counts "any kind of OOM killer"): not this
      // child's limit, and not said as one.
      console.warn(
        `[sessiond] ${proc.procId}: the machine's OOM killer ended a process in ${group.name} (${count} so far); it has no memory limit of its own`
      );
      return true;
    }
    console.warn(
      `[sessiond] ${proc.procId}: ${group.name} reached its ${limit === "tasks" ? `task limit (pids.max ${max}); pids.events max` : `memory limit (memory.max ${max}); memory.events oom_kill`} reads ${count}`
    );
    for (const conn of this.#conns) {
      this.#send(conn, {
        type: "proc.limit",
        procId: proc.procId,
        pid: proc.pid,
        group: group.name,
        limit,
        max,
        count,
      });
    }
    return true;
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
      pid: proc.pid,
      alive: proc.alive,
      ...(proc.exitCode === null ? {} : { exitCode: proc.exitCode }),
      ...(proc.signal === null ? {} : { signal: proc.signal }),
      ...(proc.alive ? {} : stderrOf(proc)),
      head: proc.ring.head,
      ...(proc.cwd === undefined ? {} : { cwd: proc.cwd }),
    }));
  }

  // ---------------------------------------------------------------- connections

  /**
   * The welcome, and the answer to a listing: with the cgroup a child starts
   * under, its `children` group or the keeper's own, which a start's room is
   * read under (agent session.ts `#roomForStart`).
   */
  #welcomeOf(): SessiondWelcome {
    const cgroup = this.#children
      ? `/${relative(this.#children.root, this.#children.group)}`
      : this.#ownCgroup;
    return {
      type: "welcome",
      epoch: this.epoch,
      capabilities: CAPABILITIES,
      build: this.#build,
      procs: this.procs(),
      ...(cgroup ? { cgroup } : {}),
    };
  }

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
    this.#send(conn, this.#welcomeOf());
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
      const answer = () => this.#send(conn, this.#welcomeOf());
      paceList(answer);
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
      case "limits":
        settlement = this.#setLimits(commandId, msg.limits);
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
      case "release":
        settlement = this.#release(
          commandId,
          String(msg.procId ?? ""),
          Number(msg.pid)
        );
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
   * THE KEEPER HOLDS THE SESSION LIMITS. What an agent says replaces what was
   * held, at once (before any spawn read after it on the socket takes its
   * turn), and every child started from then on runs under it, whoever asks
   * for the start, until the next `limits`. A field absent is no such limit;
   * a value outside 1 to 100 is refused, and what was held stays.
   */
  #setLimits(commandId: string, given: unknown): SessiondAck {
    const raw = (given ?? {}) as Record<string, unknown>;
    const next: SessionLimits = {};
    for (const key of ["memoryPercent", "cpuPercent"] as const) {
      const value = raw[key];
      if (value === undefined || value === null) {
        continue;
      }
      if (typeof value !== "number" || !(value >= 1 && value <= 100)) {
        return ack(
          commandId,
          "failed",
          `limits: ${key} is ${JSON.stringify(value)}, not a percent from 1 to 100`
        );
      }
      next[key] = value;
    }
    if (
      next.memoryPercent !== this.#limits.memoryPercent ||
      next.cpuPercent !== this.#limits.cpuPercent
    ) {
      console.info(
        `[sessiond] session limits: memory ${next.memoryPercent === undefined ? "unlimited" : `${next.memoryPercent}% of this machine's RAM`}, CPU ${next.cpuPercent === undefined ? "unlimited" : `${next.cpuPercent}% of its cores`}, for each child started from now`
      );
    }
    this.#limits = next;
    return ack(commandId, "applied");
  }

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
    const refused = await spawnRefusal();
    if (refused) {
      return ack(commandId, "failed", refused);
    }
    const existing = this.#procs.get(procId);
    // A spawn for a live procId is the agent's deliberate relaunch (the
    // kill-and-replace semantics it has today): the agent never sends a
    // spawn twice, so nothing but a relaunch lands here.
    if (existing?.alive) {
      // The kill lands once its tree is read; the successor starts now, under
      // its own process group, so nothing of it is in what gets killed.
      this.#kill(existing).catch((error: unknown) => {
        console.error(
          `[sessiond] ${procId}: the replaced child's tree could not be read, so it was not killed: ${reasonOf(error)}`
        );
      });
    }

    // Its own cgroup, its limits written before it is in it: the session
    // limits this keeper holds when the spawn's turn comes. One that cannot
    // be made starts nothing: a child is never started without its ceiling.
    let group: ChildGroup | undefined;
    if (this.#children) {
      this.#groupSerial += 1;
      try {
        group = await openChildGroup(
          this.#children,
          procId,
          `${this.epoch.slice(0, 8)}-${this.#groupSerial}`,
          this.#limits
        );
      } catch (error) {
        return ack(
          commandId,
          "failed",
          `spawn: its cgroup under ${this.#children.group} could not be made (${reasonOf(error)})`
        );
      }
      if (group.unapplied.length > 0) {
        console.warn(
          `[sessiond] ${procId}: the hub's ${group.unapplied.join(" and ")} limit is not applied on this machine`
        );
      }
    }

    let child: ChildProcessWithoutNullStreams;
    const mark = randomUUID();
    // biome-ignore lint/suspicious/noUnnecessaryConditions: spec is agent-side and opaque (§3.2) — the ProcSpec type promises args, the wire does not
    const args = spec.args ?? [];
    // With a cgroup of its own, the child starts in a shell that joins it and
    // execs the command in place (same pid): capped from its first instruction.
    const [command, argv] = group
      ? ["/bin/sh", ["-c", JOIN_CHILDREN, group.procs, spec.command, ...args]]
      : [spec.command, args];
    const unmade = (): void => {
      if (group) {
        removeGroup(group.path).catch(() => undefined);
      }
    };
    try {
      child = spawn(command, argv, {
        cwd: spec.cwd,
        // The spec is built entirely agent-side and handed over opaque (§3.2):
        // sessiond does not read, validate or enrich a single entry of it.
        env: childEnvironment(spec, mark),
        stdio: ["pipe", "pipe", "pipe"],
        // Its own process group, which it leads: what it starts stays findable
        // under its pid after it has exited ({@link #survey}).
        detached: true,
      }) as ChildProcessWithoutNullStreams;
    } catch (error) {
      unmade();
      return refusedSpawn(commandId, error);
    }
    const started = new Promise<Error | undefined>((resolve) => {
      child.once("spawn", () => resolve(undefined));
      child.once("error", (error) => resolve(error));
    });
    const pid = spawnedPid(child);
    if (pid === undefined) {
      return neverRan(commandId, started, unmade);
    }

    const proc: Proc = {
      procId,
      child,
      pid,
      mark,
      named: new Map(),
      tree: new Map(),
      ring: new SessionRing<string>(SESSIOND_RING_LINES),
      sizes: [],
      bytes: 0,
      lines: new LineSplitter(),
      alive: true,
      exitCode: null,
      signal: null,
      stderr: Buffer.alloc(0),
      ...(spec.cwd === undefined ? {} : { cwd: spec.cwd }),
      ...(group ? { group: group.path } : {}),
      ...this.#startsIn(group),
    };
    this.#procs.set(procId, proc);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.#ingest(proc, chunk));
    // stderr is not a second stream in the protocol: it is drained so the
    // pipe can never fill and wedge the child (§6's "no path from a slow
    // agent to a blocked child"), and its last bytes are kept, unread, to go
    // with the child's exit ({@link STDERR_TAIL_BYTES}).
    child.stderr.on("data", (chunk: Buffer) => {
      proc.stderr = keepTail(proc.stderr, chunk);
    });
    child.stdin.on("error", () => {
      /* a write to a stdin whose child already died is not an event */
    });
    const failed = await started;
    if (failed) {
      // It never ran: nobody's session, and no exit to announce.
      proc.alive = false;
      if (this.#procs.get(procId) === proc) {
        this.#procs.delete(procId);
      }
      unmade();
      return refusedSpawn(commandId, failed);
    }
    if (group) {
      this.#groups.set(group.path, {
        group,
        proc,
        seen: { tasks: 0, memory: 0 },
        rising: { tasks: false, memory: false },
      });
    }
    child.on("error", () => this.#reap(proc, null, null));
    // Reaped once what it wrote on stderr is in: a child that refuses to
    // start says why and exits at once, and node may tell its exit before
    // the last of its stderr has been read ({@link stderrRead}).
    child.on("exit", (code, signal) => {
      detach(
        stderrRead(child).then(() => this.#reap(proc, code, signal)),
        "sessiond reap"
      );
    });
    await capChildTasks(pid);
    return ack(commandId, "applied");
  }

  /**
   * A DEAD CHILD STAYS UNTIL THE AGENT THAT FOLLOWS IT HAS SETTLED ITS END.
   * Its exit and its ring are what an agent that was away when it died
   * reads it by: a carry lets go of a session whose process its keeper lists
   * exited (session.ts `#carryReady`), and a subscribe after the death learns
   * it from the listing (agent sessiond-client.ts `subscribe`). The keeper
   * cannot tell when that is over: an exit written to an agent that ended
   * before reading it was never read. So it is the agent's to say, and a
   * child it never releases stays as every dead child stayed before: the
   * keeper of 4034 listed 184 children, one alive, after 34 hours (the Mac,
   * 2026-10-19). Only the dead process under the id, by its pid.
   */
  #release(commandId: string, procId: string, pid: number): SessiondAck {
    const proc = this.#procs.get(procId);
    if (proc?.pid !== pid) {
      // Gone, or a start since under the id: nothing of that process is held.
      return ack(commandId, "applied");
    }
    if (proc.alive) {
      return ack(commandId, "failed", `release: ${procId} (${pid}) is alive`);
    }
    this.#procs.delete(procId);
    return ack(commandId, "applied");
  }

  #write(commandId: string, procId: string, data: string): SessiondAck {
    const proc = this.#procs.get(procId);
    if (!proc?.alive) {
      return ack(commandId, "failed", notAliveReason("write", procId));
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
      return ack(commandId, "failed", notAliveReason("signal", procId));
    }
    return (
      sig === "SIGKILL" ? this.#kill(proc) : this.#signalTree(proc, sig)
    ).then(() => ack(commandId, "applied"));
  }

  #stdinEnd(
    commandId: string,
    procId: string
  ): SessiondAck | Promise<SessiondAck> {
    const proc = this.#procs.get(procId);
    if (!proc?.alive) {
      return ack(commandId, "failed", notAliveReason("stdin_end", procId));
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

  /** The cgroup a child starts in ({@link Proc.cgroup}): its own group, or the keeper's; none without cgroup v2. */
  #startsIn(group: ChildGroup | undefined): { cgroup?: string } {
    const cgroup = group?.cgroup ?? this.#ownCgroup;
    return cgroup === undefined ? {} : { cgroup };
  }

  // ---------------------------------------------------------------- the tree

  /**
   * Everything `proc` started that is running now, itself included while it
   * lives: its descendants by parentage, the process group it leads, what
   * an earlier reading found that is still the same process, every process
   * that carries its tree mark ({@link Proc.mark}) in a marked reading, and
   * the descendants of all those. Recorded on the proc, so the next reading
   * still knows them after the child has exited and they have been
   * reparented.
   *
   * Parentage alone misses what was reparented before the reading, and the
   * group alone misses what left it: a shell the child ran with job control,
   * a browser its driver launched detached. Both together still miss a
   * process that left the group and was orphaned since the last reading: an
   * MCP server's helper started with `setsid` whose launcher exited, under
   * init by the time the child dies. Its environment still carries the
   * child's mark, and every reading taken where the tree is ended or
   * signalled is marked ({@link #readTree}). macOS withholds the
   * environment of Apple's platform binaries (`/bin/sleep`, `/bin/bash`), so
   * there the mark finds only the rest (node, a browser, any tool installed
   * apart from the system).
   *
   * Every live child is read on a clock as well ({@link SURVEY_INTERVAL_MS}):
   * one the kernel kills for memory is asked nothing first, and what it had
   * started is known only from the reading before.
   *
   * ONLY WHAT IS STILL IN THE CHILD'S CGROUP IS ITS TREE. A process that left
   * it was put elsewhere on purpose, by itself or by the service manager:
   * conmon, which podman moves into a `libpod-conmon-<id>.scope` of its own
   * after its double fork and `setsid()`, or anything a user moved into a
   * scope of its own. It is dropped from the tree, here and in every later
   * reading, and never signalled: CawCo signals no process it did not start.
   * A container a session's work started is ended through its runtime as the
   * session ends (agent session-containers.ts), never by a signal from here.
   * The child itself is its own while it lives, wherever it is.
   */
  async #survey(proc: Proc, table: Listed[]): Promise<Pid[]> {
    const root = proc.pid;
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
        row.tree === proc.mark ||
        (row.pid === root
          ? proc.alive
          : row.pgid === root || proc.tree.get(row.pid) === row.started);
      if (own) {
        take(row);
      }
    }
    const kept = await stillIn(proc, running);
    proc.tree = kept;
    const named = table.flatMap((row) =>
      row.command !== undefined && row.tree === proc.mark
        ? [[row.pid, row.command] as const]
        : []
    );
    if (named.length > 0) {
      proc.named = new Map(named);
    }
    return [...kept.keys()].map(listedPid);
  }

  /** {@link #survey} on a fresh reading of the process table, marked: what carries the child's mark is its own. */
  async #readTree(proc: Proc): Promise<Pid[]> {
    return this.#survey(proc, await processTable(true));
  }

  /** A signal for the child reaches everything it started. */
  async #signalTree(proc: Proc, sig: NodeJS.Signals): Promise<void> {
    for (const pid of await this.#readTree(proc)) {
      signalPid(pid, sig);
    }
  }

  /**
   * Everything the child started that is running now, and the child while it
   * lives: its tree ({@link #survey}), and, when it has a cgroup of its own,
   * every process in it, which is its tree whatever session or group a
   * process put itself in and whoever its parent is now.
   */
  async #everything(proc: Proc): Promise<Pid[]> {
    const tree = await this.#readTree(proc);
    const members = proc.group ? await groupMembers(proc.group) : [];
    return [...new Set([...tree, ...members.map(listedPid)])];
  }

  /**
   * A KILL OF A CHILD ENDS ALL IT STARTED. With a cgroup of its own, the
   * kernel kills the group whole ({@link killGroup}): nothing in it is
   * missed for having left the child's process group and been reparented
   * before any reading, as bwrap's sandbox does (`--new-session` calls
   * setsid(), bubblewrap.c), which a boundary's srt host starts. Without
   * one, every process of its tree is sent SIGKILL.
   */
  async #kill(proc: Proc): Promise<void> {
    if (!proc.group) {
      await this.#signalTree(proc, "SIGKILL");
      return;
    }
    await killGroup(proc.group);
    // Read too, for the record: a later reading knows what it was.
    await this.#readTree(proc);
  }

  /**
   * WHAT A CHILD STARTED DOES NOT OUTLIVE IT. A harness that exits leaves its
   * MCP servers to close themselves and their browsers to follow, and one
   * killed outright leaves them running under init with nobody to end them:
   * 136 MCP server sets and 569 browser processes were alive behind about a
   * dozen working sessions the day this was written. Whatever is left is told
   * to end now ({@link #everything}), and killed after {@link SWEEP_GRACE_MS}
   * ({@link #kill}).
   */
  async #sweep(proc: Proc): Promise<void> {
    const left = await this.#everything(proc);
    if (left.length === 0) {
      return;
    }
    for (const pid of left) {
      signalPid(pid, "SIGTERM");
    }
    console.info(
      `[sessiond] ${proc.procId} (${proc.pid}): ${workWords.leftRunningSwept}: ${left
        .map((pid) => {
          const command = proc.named.get(pid);
          return command
            ? `pid ${pid} (${command.slice(0, 120)})`
            : `pid ${pid}`;
        })
        .join(", ")}`
    );
    const timer = setTimeout(() => {
      this.#sweeps.delete(timer);
      this.#kill(proc).catch((error: unknown) => {
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
        pid: proc.pid,
        exitCode: code,
        signal,
        ...stderrOf(proc),
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
      const table = await processTable(true).catch((error: unknown) => {
        console.error(
          `[sessiond] drain: the process table could not be read before the children were told to end: ${reasonOf(error)}`
        );
      });
      await Promise.all(
        (table ? alive : []).map((proc) =>
          this.#survey(proc, table as Listed[])
        )
      );
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
    const table = await processTable(true).catch((error: unknown) => {
      console.error(
        `[sessiond] drain: the process table could not be read for the final kill; what the children started may outlive them: ${reasonOf(error)}`
      );
    });
    const trees = await Promise.all(
      (table ? [...this.#procs.values()] : []).map((proc) =>
        this.#survey(proc, table as Listed[])
      )
    );
    for (const pid of trees.flat()) {
      signalPid(pid, "SIGKILL");
    }
    // A child's own cgroup goes whole, whatever its tree missed (#kill).
    await Promise.all(
      [...this.#procs.values()].flatMap((proc) =>
        proc.group
          ? [
              killGroup(proc.group).catch((error: unknown) => {
                console.error(
                  `[sessiond] drain: ${proc.procId}'s cgroup could not be killed: ${reasonOf(error)}`
                );
              }),
            ]
          : []
      )
    );
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
    clearInterval(this.#watching);
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

/**
 * A spawn that made no process, and so no pid: node leaves its pid unset and
 * says why in its `error`. Nobody's session, and nothing to signal.
 */
const neverRan = async (
  commandId: string,
  started: Promise<Error | undefined>,
  unmade: () => void
): Promise<SessiondAck> => {
  const why = await started;
  unmade();
  return refusedSpawn(commandId, why ?? new Error("the spawn made no process"));
};

/**
 * How long a child's exit waits for the end of its stderr before it is
 * reaped. Ours: a pipe the child alone held ends within a tick of its exit;
 * one a process it started still holds never ends, and is not waited on.
 */
const STDERR_SETTLE_MS = 250;

/** Settles once `child`'s stderr has ended, or {@link STDERR_SETTLE_MS} on. */
const stderrRead = (child: ChildProcessWithoutNullStreams): Promise<void> =>
  child.stderr.readableEnded
    ? Promise.resolve()
    : new Promise((resolve) => {
        const timer = setTimeout(resolve, STDERR_SETTLE_MS);
        child.stderr.once("end", () => {
          clearTimeout(timer);
          resolve();
        });
        child.stderr.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
      });

/** `kept` with `chunk` after it, cut to its last {@link STDERR_TAIL_BYTES}. */
const keepTail = (kept: Buffer, chunk: Buffer): Buffer => {
  const both = kept.length === 0 ? chunk : Buffer.concat([kept, chunk]);
  return both.length > STDERR_TAIL_BYTES
    ? both.subarray(both.length - STDERR_TAIL_BYTES)
    : both;
};

/**
 * A dead child's kept stderr, as its exit and its listing carry it: bytes
 * turned into text whole, never read for what they say. Nothing when it
 * wrote nothing there.
 */
const stderrOf = (proc: Proc): { stderr?: string } =>
  proc.stderr.length === 0 ? {} : { stderr: proc.stderr.toString("utf8") };

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
