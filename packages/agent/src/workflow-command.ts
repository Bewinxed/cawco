import { spawn } from "node:child_process";
import {
  type CommandQueue,
  type CommandQueueFrame,
  type CommandResult,
  type CommandRun,
  QUEUE_MARKER,
  QUEUE_SLOTS,
  QUEUE_WAIT_MAX_MS,
  type QueueSlot,
  queueWords,
  type WorkspaceRef,
} from "@cawco/core";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { ensureBoundary } from "./boundary";

/** The most a command may write, stdout and stderr together, in bytes. */
const OUTPUT_LIMIT = 8 * 1024 * 1024;

/** How long a command runs when its caller names no limit. */
const DEFAULT_TIMEOUT_MS = 300_000;

/** How long a stopped command's process group has between SIGTERM and SIGKILL. */
const KILL_GRACE_MS = 5000;

/** How long a cancel for a run not running yet is kept for that run to come up. */
const EARLY_CANCEL_KEPT_MS = 24 * 60 * 60 * 1000;

/** Why the runner ended a command itself. */
type Stop = "expired" | "overflowed" | "cancelled" | "abandoned";

/** A command still running: the run the hub named it, and how it is ended. */
interface Running {
  readonly runId: string | undefined;
  readonly stop: (why: Stop) => void;
}

/** Every command still running. */
const live = new Set<Running>();

/**
 * Runs cancelled before they ran (queued behind another command in their
 * directory, or starting their boundary), by id, with when the cancel came.
 */
const cancelledEarly = new Map<string, number>();

/** Signals a process group; one already gone is no error. */
const signalGroup = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw error;
    }
  }
};

/** Where queue frames go: the daemon's socket. */
let sendQueue: (frame: CommandQueueFrame) => void = () => undefined;
export const setCommandQueue = (
  send: (frame: CommandQueueFrame) => void
): void => {
  sendQueue = send;
};

/**
 * The hub connection ended: nobody is left to receive what the running
 * commands answer, and the hub runs a check again from the first when it is
 * back. Every live command is stopped with its process group; each resolves
 * through its own `close`, as a timed-out one does.
 */
export function abandonCommands(): void {
  if (live.size === 0) {
    return;
  }
  const count = live.size;
  for (const running of live) {
    running.stop("abandoned");
  }
  console.log(`abandoned ${count} command(s): hub connection ended`);
}

/**
 * `CONTROL_CANCEL_COMMAND`: stops the run the hub named `runId`, which then
 * answers `cancelled`. A run not running yet is kept cancelled: it answers
 * `cancelled` as it comes up, without starting. Answers whether it was running.
 */
export function cancelCommand(runId: unknown): boolean {
  if (typeof runId !== "string" || !runId) {
    throw new Error("cancelCommand requires the run's id.");
  }
  for (const running of live) {
    if (running.runId === runId) {
      running.stop("cancelled");
      return true;
    }
  }
  const now = Date.now();
  for (const [id, at] of cancelledEarly) {
    if (now - at > EARLY_CANCEL_KEPT_MS) {
      cancelledEarly.delete(id);
    }
  }
  cancelledEarly.set(runId, now);
  return false;
}

/** Whether `value` names a delegation workspace: an id and an absolute clone path. */
export const isWorkspaceRef = (value: unknown): value is WorkspaceRef =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as WorkspaceRef).id === "string" &&
  typeof (value as WorkspaceRef).path === "string" &&
  (value as WorkspaceRef).path.startsWith("/");

/** Whether `value` names a run the hub follows: `{ id, queueMaxMs }` (core `CommandRun`). */
const isCommandRun = (value: unknown): value is CommandRun =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as CommandRun).id === "string" &&
  typeof (value as CommandRun).queueMaxMs === "number";

/** The slots only the runner itself waits for: no command's marker opens them. */
const RUNNER_SLOTS: ReadonlySet<QueueSlot> = new Set(["folder", "boundary"]);

/** `CAWCO-QUEUE wait <slot>: <holders>` or `CAWCO-QUEUE held <slot>`. */
const QUEUE_LINE = new RegExp(
  `^${QUEUE_MARKER} (wait|held) (${(Object.keys(QUEUE_SLOTS) as QueueSlot[])
    .filter((slot) => !RUNNER_SLOTS.has(slot))
    .join("|")})(?:: (.*))?$`
);

/** One run's wait, to the hub under its id; nothing for a run the hub did not name. */
const tellWait = (
  run: CommandRun | undefined,
  queue: CommandQueue | null
): void => {
  if (run) {
    sendQueue({ kind: "command_queue", runId: run.id, queue });
  }
};

/**
 * The command each folder runs now: the machine runs a folder's commands one
 * after another (session.ts `dispatch`), and one queued behind names it.
 */
const folderRunning = new Map<string, { cmd: string; since: number }>();

/** A command as a waiter's words show it: its first line, without the safe-git preamble. */
const shownCommand = (cmd: string): string => {
  const own = cmd.startsWith(SAFE_GIT_SHELL)
    ? cmd.slice(SAFE_GIT_SHELL.length)
    : cmd;
  const line = own.trim().split("\n")[0] ?? "";
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
};

/** How long a command has run, as a waiter's words say it. */
const runningFor = (since: number): string => {
  const seconds = Math.round((Date.now() - since) / 1000);
  return seconds < 120 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
};

/**
 * A `CONTROL_RUN_COMMAND` in its folder's line (session.ts `dispatch`), its
 * args as the hub sent them. One `behind` another there tells the hub at
 * once, naming the command running there and for how long: before
 * 2026-10-16 a check queued behind another command in its workspace waited
 * with nothing said. `start` as its turn comes ends that wait; `end` as it
 * finishes frees the folder.
 */
export function folderTurn(
  args: readonly unknown[] | undefined,
  behind: boolean
): { end: () => void; start: () => void } {
  const folder = String(args?.[0]);
  const cmd = typeof args?.[1] === "string" ? args[1] : "";
  const run = isCommandRun(args?.[4]) ? args[4] : undefined;
  if (behind) {
    const ahead = folderRunning.get(folder);
    tellWait(run, {
      slot: "folder",
      holders: ahead
        ? `\`${shownCommand(ahead.cmd)}\`, running ${runningFor(ahead.since)}`
        : "an earlier command there",
    });
  }
  const mine = { cmd, since: 0 };
  return {
    start: () => {
      if (behind) {
        tellWait(run, null);
      }
      mine.since = Date.now();
      folderRunning.set(folder, mine);
    },
    end: () => {
      if (folderRunning.get(folder) === mine) {
        folderRunning.delete(folder);
      }
    },
  };
}

/** How long a boundary may take to start before its command says it waits for it. */
const BOUNDARY_QUIET_MS = 2000;

/**
 * The executor of `workspace`'s boundary, started or found ({@link
 * ensureBoundary}); a start past {@link BOUNDARY_QUIET_MS} is the run's wait,
 * told to the hub, for nothing else says what it waits on then.
 */
const boundaryExec = async (
  workspace: WorkspaceRef,
  run: CommandRun | undefined
): Promise<string> => {
  let waiting = false;
  const timer = setTimeout(() => {
    waiting = true;
    tellWait(run, { slot: "boundary", holders: "" });
  }, BOUNDARY_QUIET_MS);
  try {
    return (await ensureBoundary(workspace)).exec;
  } finally {
    clearTimeout(timer);
    if (waiting) {
      tellWait(run, null);
    }
  }
};

/**
 * The command's clock: its limit counts only the time no slot wait is open.
 * While one is, the work timer stands and the queue timer runs, over every
 * wait of the command together, up to `queueMaxMs`.
 */
const commandClock = (
  limitMs: number,
  queueMaxMs: number,
  expire: (why: string) => void,
  report: (queue: CommandQueue | null) => void
) => {
  /** Open waits by slot, with what their last marker said. */
  const waits = new Map<QueueSlot, CommandQueue>();
  let workLeft = limitMs;
  let queueLeft = queueMaxMs;
  let since = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The wait the status shows: the latest opened. */
  const showing = (): CommandQueue | null => [...waits.values()].at(-1) ?? null;
  const arm = () => {
    clearTimeout(timer);
    since = Date.now();
    timer =
      waits.size === 0
        ? setTimeout(() => expire(""), workLeft)
        : setTimeout(() => {
            const queue = showing();
            expire(
              `\nCawCo: this command waited ${Math.round(queueMaxMs / 1000)} s in slot queues, the most it may, and was stopped${queue ? `: still ${queueWords(queue)}` : ""}.\n`
            );
          }, queueLeft);
  };
  const spend = () => {
    const spent = Date.now() - since;
    if (waits.size === 0) {
      workLeft = Math.max(0, workLeft - spent);
    } else {
      queueLeft = Math.max(0, queueLeft - spent);
    }
  };
  arm();
  return {
    /** One line of output: a queue marker opens or closes a wait. */
    line(text: string) {
      const marker = QUEUE_LINE.exec(text);
      if (!marker) {
        return;
      }
      const slot = marker[2] as QueueSlot;
      if (marker[1] === "held" && !waits.has(slot)) {
        return;
      }
      // What ran so far is spent from the phase it ran in; the timer then
      // runs for what is left of the phase the line leaves it in.
      spend();
      waits.delete(slot);
      if (marker[1] === "wait") {
        // A repeat moves it last: the status shows its newest words.
        waits.set(slot, { slot, holders: marker[3] ?? "" });
      }
      arm();
      report(showing());
    },
    stop() {
      clearTimeout(timer);
      if (waits.size > 0) {
        waits.clear();
        report(null);
      }
    },
  };
};

const CARRIAGE_RETURN = /\r$/;

/** Splits a stream into whole lines for `each`, holding a partial last one. */
const lines = (each: (line: string) => void) => {
  let partial = "";
  return (chunk: Buffer) => {
    const text = partial + chunk.toString("utf8");
    const parts = text.split("\n");
    partial = (parts.pop() ?? "").slice(-4096);
    for (const part of parts) {
      each(part.replace(CARRIAGE_RETURN, ""));
    }
  };
};

/**
 * `CONTROL_RUN_COMMAND`: runs `cmd` in `cwd` on this machine, killed with its
 * whole process group after `timeoutMs` of its own work (exit 124): the
 * clock stands while the command waits for a shared machine slot
 * ({@link commandClock}), and a command whose waits pass the run's
 * `queueMaxMs` (the hub sends {@link QUEUE_WAIT_MAX_MS}; a run the hub did
 * not name waits that long too) is killed the same way, its stderr saying
 * who held the slot. Each change of its wait goes to the hub under the
 * run's `id`.
 * Answers complete stdout and complete stderr; a command that writes more
 * than {@link OUTPUT_LIMIT} bytes across both is killed the same way and
 * rejects. A run the hub cancels ({@link cancelCommand}) is ended the same
 * way and answers `cancelled`.
 *
 * Every command the runner ends itself ends one way: SIGTERM to its process
 * group, then SIGKILL to what is left of it {@link KILL_GRACE_MS} later. The
 * TERM comes first because a workspace's executor passes it on to the
 * command's own group inside the boundary (its trap), which a KILL to the
 * executor never reaches.
 *
 * Given a `workspace`, the command runs inside that workspace's boundary,
 * through the executor its sessions' shell commands run through: the same
 * sandbox, the same scratch dir as `$TMPDIR`, the same pid namespace. A boundary this
 * machine cannot start rejects with its reason; the command never runs
 * outside it.
 */
export async function runWorkflowCommand(
  cwd: unknown,
  cmd: unknown,
  timeoutMs: unknown,
  workspace?: unknown,
  run?: unknown
): Promise<CommandResult> {
  const named = isCommandRun(run) ? run : undefined;
  if (
    typeof cwd !== "string" ||
    !cwd.startsWith("/") ||
    typeof cmd !== "string" ||
    !cmd.trim()
  ) {
    throw new Error(
      "runCommand requires an absolute workspace directory and a command."
    );
  }
  // An absent workspace crosses the wire as null.
  if ((workspace ?? undefined) !== undefined && !isWorkspaceRef(workspace)) {
    throw new Error("runCommand's workspace must be { id, path }.");
  }
  const [file, args] = isWorkspaceRef(workspace)
    ? [await boundaryExec(workspace, named), [cmd]]
    : ["/bin/sh", ["-c", cmd]];
  // Cancelled while it waited its turn or its boundary: it never starts.
  if (named && cancelledEarly.delete(named.id)) {
    return { cancelled: true, exitCode: 143, stdout: "", stderr: "" };
  }
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      detached: true,
      // The executor enters the boundary in `$PWD`: it names `cwd`.
      env: { ...hostEnvironment(), PWD: cwd },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let written = 0;
    /** Why the runner ended the command, once it has. */
    let stopped: Stop | undefined;
    /** What the runner adds to stderr when it ends the command itself. */
    let said = "";
    const running: Running = {
      runId: named?.id,
      stop: (why) => {
        const { pid } = child;
        if (stopped || !pid) {
          return;
        }
        stopped = why;
        clock.stop();
        try {
          signalGroup(pid, "SIGTERM");
        } catch (error) {
          reject(error);
          return;
        }
        setTimeout(() => {
          try {
            signalGroup(pid, "SIGKILL");
          } catch (error) {
            console.warn(`could not kill command group ${pid}: ${error}`);
          }
        }, KILL_GRACE_MS).unref();
      },
    };
    if (child.pid) {
      live.add(running);
    }
    const clock = commandClock(
      typeof timeoutMs === "number" ? timeoutMs : DEFAULT_TIMEOUT_MS,
      named?.queueMaxMs ?? QUEUE_WAIT_MAX_MS,
      (why) => {
        said = why;
        running.stop("expired");
      },
      (queue) => {
        if (named) {
          sendQueue({ kind: "command_queue", runId: named.id, queue });
        }
      }
    );
    const collect = (into: Buffer[]) => {
      const scan = lines((line) => clock.line(line));
      return (chunk: Buffer) => {
        if (stopped === "overflowed") {
          return;
        }
        written += chunk.length;
        if (written > OUTPUT_LIMIT) {
          stdout.length = 0;
          stderr.length = 0;
          running.stop("overflowed");
          reject(
            new Error(
              `Command output passed ${OUTPUT_LIMIT} bytes: ${cmd.slice(0, 200)}`
            )
          );
          return;
        }
        into.push(chunk);
        scan(chunk);
      };
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => {
      clock.stop();
      live.delete(running);
      reject(error);
    });
    // A stopped command's KILL still comes after its leader closes: what is
    // left of its group (a child that let go of the pipes) goes with it.
    child.on("close", (code) => {
      clock.stop();
      live.delete(running);
      if (stopped === "overflowed") {
        return;
      }
      resolve({
        ...(stopped === "cancelled" ? { cancelled: true as const } : {}),
        exitCode: stopped === "expired" ? 124 : (code ?? 1),
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8") + said,
      });
    });
  });
}
