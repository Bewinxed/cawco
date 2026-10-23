import { spawn } from "node:child_process";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
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
import { workspaceScratchDir } from "@cawco/core/paths";
import {
  repositoryConfigProblem,
  SAFE_GIT_ENV,
  SAFE_GIT_SHELL,
} from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import {
  agentCommandStarted,
  ensureBoundary,
  whileSandboxDown,
} from "./boundary";
import { type DenyPaths, denyPathspecs, shimPaths } from "./worktree-guard";

/** The most a command may write, stdout and stderr together, in bytes. */
const OUTPUT_LIMIT = 8 * 1024 * 1024;

/** How long a command runs when its caller names no limit. */
const DEFAULT_TIMEOUT_MS = 300_000;

/** How long a stopped command's process group has between SIGTERM and SIGKILL. */
const KILL_GRACE_MS = 5000;

/** How long a cancel for a run not running yet is kept for that run to come up. */
const EARLY_CANCEL_KEPT_MS = 24 * 60 * 60 * 1000;

/** Why the runner ended a command itself. */
type Stop = "expired" | "overflowed" | "cancelled";

/** A command still running: the run the hub named it, what it is in words, and how it is ended. */
interface Running {
  readonly runId: string | undefined;
  readonly stop: (why: Stop) => void;
  /** The landing gate's step it is ({@link CommandRun.gate}), else the command as {@link shownCommand} shows it. */
  readonly words: string;
}

/** Every command still running. */
const live = new Set<Running>();

/** Every command the hub asked of this machine still running, in words: what the agent's hold on idle sleep counts (awake.ts). */
export const commandsRunning = (): string[] =>
  [...live].map((running) => running.words);

/**
 * Runs cancelled before they ran (queued behind another command in their
 * directory, or starting their boundary), by id, with when the cancel came.
 */
const cancelledEarly = new Map<string, number>();

/** Where queue frames go: the daemon's socket. */
let sendQueue: (frame: CommandQueueFrame) => void = () => undefined;
export const setCommandQueue = (
  send: (frame: CommandQueueFrame) => void
): void => {
  sendQueue = send;
};

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

/** Whether `value` names a run the hub follows: `{ id, queueMaxMs, gate?, moves? }` (core `CommandRun`). */
const isCommandRun = (value: unknown): value is CommandRun =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as CommandRun).id === "string" &&
  typeof (value as CommandRun).queueMaxMs === "number" &&
  ["string", "undefined"].includes(typeof (value as CommandRun).gate) &&
  ["string", "undefined"].includes(typeof (value as CommandRun).moves);

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
 * What runs `cmd`: inside `workspace`'s boundary, through its executor;
 * anywhere else, `/bin/sh -c`.
 */
const commandLine = async (
  cmd: string,
  workspace: unknown,
  run: CommandRun | undefined
): Promise<[string, string[]]> =>
  isWorkspaceRef(workspace)
    ? [await boundaryExec(workspace, run), [cmd]]
    : ["/bin/sh", ["-c", cmd]];

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
export async function runHubCommand(
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
  if (named?.moves !== undefined) {
    if (!isWorkspaceRef(workspace)) {
      throw new Error("runCommand moves a worktree only in a workspace.");
    }
    return await movedCommand(cwd, cmd, timeoutMs, workspace, named);
  }
  const [file, args] = await commandLine(cmd, workspace, named);
  // Cancelled while it waited its turn or its boundary: it never starts.
  if (named && cancelledEarly.delete(named.id)) {
    return CANCELLED;
  }
  return await spawned({
    file,
    args,
    cwd,
    cmd,
    env: {},
    timeoutMs,
    workspace,
    named,
  });
}

const CANCELLED: CommandResult = {
  cancelled: true,
  exitCode: 143,
  stdout: "",
  stderr: "",
};

/** One command as {@link runHubCommand} runs it: `file` and `args` in `cwd`, `env` over the host's. */
interface Spawned {
  readonly args: readonly string[];
  readonly cmd: string;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly file: string;
  readonly named: CommandRun | undefined;
  readonly timeoutMs: unknown;
  readonly workspace: unknown;
}

/** {@link runHubCommand}'s run of one process, its clock, limits and cancel as it says. */
const spawned = ({
  args,
  cmd,
  cwd,
  env,
  file,
  named,
  timeoutMs,
  workspace,
}: Spawned): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      detached: true,
      // The executor enters the boundary in `$PWD`: it names `cwd`.
      env: { ...hostEnvironment(), ...env, PWD: cwd },
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
      words: named?.gate ?? `the command \`${shownCommand(cmd)}\``,
      stop: (why) => {
        // A spawn that made no process leaves nothing to signal.
        const leader = spawnedPid(child);
        if (stopped || leader === undefined) {
          return;
        }
        stopped = why;
        clock.stop();
        try {
          if (signalGroup(leader, "SIGTERM") === "denied") {
            reject(
              new Error(
                `command group ${leader} is not this user's to signal, so it was not stopped`
              )
            );
            return;
          }
        } catch (error) {
          reject(error);
          return;
        }
        setTimeout(() => {
          try {
            signalGroup(leader, "SIGKILL");
          } catch (error) {
            console.warn(`could not kill command group ${leader}: ${error}`);
          }
        }, KILL_GRACE_MS).unref();
      },
    };
    if (spawnedPid(child) !== undefined) {
      live.add(running);
    }
    // Never a session's: a session's sweep of its workspace leaves what it
    // runs there running (boundary.ts `agentCommandStarted`).
    const executor = spawnedPid(child);
    const letGo =
      isWorkspaceRef(workspace) && executor !== undefined
        ? agentCommandStarted(workspace.id, executor)
        : undefined;
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
      letGo?.();
      reject(error);
    });
    // A stopped command's KILL still comes after its leader closes: what is
    // left of its group (a child that let go of the pipes) goes with it.
    child.on("close", (code) => {
      clock.stop();
      live.delete(running);
      letGo?.();
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

/** A commit name a move may name: a sha, or a ref of plain words. */
const MOVE_TARGET = /^[\w./@^~-]+$/;

/** How long a move on the host waits between looks at a boundary that still runs something. */
const BUSY_LOOK_MS = 2000;

/** worktree-guard.ts `denyPathspecs`, each as one shell word. */
const pathspecWords = async (
  workspace: WorkspaceRef,
  which: DenyPaths
): Promise<string> =>
  (await denyPathspecs(workspace, which)).map(shellWord).join(" ");

/** worktree-guard.ts `shimPaths`'s `before`, as shell words: what a move is judged on before it runs. */
const moveWords = async (workspace: WorkspaceRef): Promise<string> =>
  (await shimPaths(workspace)).before.map(shellWord).join(" ");

/** `text` as one shell word. */
const shellWord = (text: string): string =>
  `'${text.replaceAll("'", "'\\''")}'`;

/**
 * The harness project config that commits no branch of `workspace`'s
 * origin holds change, of those reachable from `revs` there: core's
 * `HARNESS_CONFIG` (Claude Code's, OpenCode's and pi's project config) at
 * any depth and in any letter case, and every clone-side deny path at the
 * root (the placed skills and memory among them, srt's own names aside;
 * worktree-guard.ts `denyPathspecs`), by path. A host harness loads them at a workspace's next
 * session, outside any boundary, so no workspace writes them, and no commit
 * of one carries them into a worktree either: a commit that changed them
 * through git's index alone (`git update-index --cacheinfo`, no file
 * written) would otherwise reach a worktree the host checks out, a `from`
 * cut's or a landing's, and its next session would run what they name.
 * What origin holds (the person's own commits, what landed) is never
 * counted, and the net change is what counts: a path a later commit puts
 * back as origin has it is no change. Against each commit origin holds where
 * `rev`'s own commits begin (`git rev-list --boundary`), a path counts only
 * when it differs from all of them; a history that shares none with origin
 * is read against the empty tree. Answers why a read failed, inside the
 * boundary, as an error.
 */
export const ownConfigChanges = async (
  workspace: WorkspaceRef,
  revs: readonly string[]
): Promise<string[]> => {
  const paths = await pathspecWords(workspace, "config");
  const changed = new Set<string>();
  for (const rev of revs) {
    if (!MOVE_TARGET.test(rev)) {
      throw new Error(`"${rev}" is no commit name`);
    }
    // biome-ignore lint/performance/noAwaitInLoops: a move names one or two commits
    const listed = await insideRead(
      workspace,
      `git rev-list --boundary ${rev} --not --remotes=origin`
    );
    if (!listed.ok) {
      throw new Error(listed.why);
    }
    const own = listed.out.split("\n").filter(Boolean);
    if (own.length === 0) {
      continue;
    }
    const bases = own
      .filter((line) => line.startsWith("-"))
      .map((line) => line.slice(1));
    const against = bases.length > 0 ? bases : [EMPTY_TREE];
    let differs: Set<string> | undefined;
    for (const base of against) {
      // biome-ignore lint/performance/noAwaitInLoops: a branch's own commits begin at one commit of origin's, a merge's at a few
      const read = await insideRead(
        workspace,
        `git diff --name-only -z ${base} ${rev} -- ${paths}`
      );
      if (!read.ok) {
        throw new Error(read.why);
      }
      const names = new Set(namesIn(read.out));
      differs = differs
        ? new Set([...differs].filter((name) => names.has(name)))
        : names;
    }
    for (const name of differs ?? []) {
      changed.add(name);
    }
  }
  return [...changed].sort();
};

/** git's empty tree: what a history that shares no commit with origin is read against. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** The refusal of commits that change `paths` ({@link ownConfigChanges}), in words. */
export const ownConfigWords = (paths: readonly string[]): string =>
  `its commits change ${paths.join(", ")} from what origin holds: harness project config a host session loads outside any boundary, which no workspace's commit changes. Put each back as origin has it in a new commit (\`git update-index --cacheinfo\` to origin's blob, or \`git rm --cached\` one origin does not track), then try again`;

/** A read inside `workspace`'s boundary: git's stdout, or why it failed. */
const insideRead = async (
  workspace: WorkspaceRef,
  cmd: string
): Promise<{ ok: true; out: string } | { ok: false; why: string }> => {
  const read = await runHubCommand(
    workspace.path,
    `${SAFE_GIT_SHELL}${cmd}`,
    READ_TIMEOUT_MS,
    workspace
  );
  return read.exitCode === 0
    ? { ok: true, out: read.stdout }
    : {
        ok: false,
        why:
          read.stderr.trim() || read.stdout.trim() || `exit ${read.exitCode}`,
      };
};

/** How long a move's reads inside the boundary may take. */
const READ_TIMEOUT_MS = 60_000;

/** The deny paths among NUL-ended `git diff --name-only -z` output. */
const namesIn = (out: string): string[] =>
  [...new Set(out.split("\0").filter(Boolean))].sort();

/**
 * A {@link CommandRun.moves} command in `workspace`: the hub's rebase onto
 * a commit, a checkout of one. The boundary keeps every clone-side deny path
 * from its commands (workspace-policy.ts `cloneDenies`: `.mcp.json`,
 * OpenCode's config, Claude Code's project settings), so a move that writes
 * one there fails, or, for a checkout without `--force`, prints "unable to
 * create file" and exits 0 with the file gone. A move whose commit holds
 * every deny path as HEAD does, in a worktree that holds them as HEAD does,
 * runs inside as any command does. Any other runs with git on this host
 * ({@link onHost}), as a first cut checks out before its boundary exists.
 * Either way, a move that ends 0 with a deny path the worktree holds other
 * than its HEAD does fails, naming them: nothing is dropped quietly. Before
 * any of it, a move of a HEAD or to a commit whose own commits change
 * harness project config ({@link ownConfigChanges}) does not run.
 */
const movedCommand = async (
  cwd: string,
  cmd: string,
  timeoutMs: unknown,
  workspace: WorkspaceRef,
  run: CommandRun
): Promise<CommandResult> => {
  const target = run.moves ?? "";
  if (!MOVE_TARGET.test(target)) {
    throw new Error(`runCommand cannot move to "${target}": no commit name`);
  }
  let own: string[];
  try {
    own = await ownConfigChanges(workspace, ["HEAD", target]);
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
  if (own.length > 0) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `CawCo: the move did not run: ${ownConfigWords(own)}.\n`,
    };
  }
  // A target whose harness config differs at any depth is moved on the
  // host too: the workspace's own git refuses such a move (worktree-guard.ts
  // `gitShim`), and the hub's runs through that git inside.
  const paths = await pathspecWords(workspace, "boundary");
  const touched = await insideRead(
    workspace,
    `git diff --name-only -z HEAD ${target} -- ${await moveWords(workspace)} && git diff --name-only -z HEAD -- ${paths}`
  );
  if (!touched.ok) {
    return { exitCode: 1, stdout: "", stderr: touched.why };
  }
  const writes = namesIn(touched.out);
  const { moves: _moved, ...plain } = run;
  const ran =
    writes.length === 0
      ? await runHubCommand(cwd, cmd, timeoutMs, workspace, plain)
      : await onHost(cwd, cmd, timeoutMs, workspace, run, writes);
  if (ran.exitCode !== 0 || ran.cancelled) {
    return ran;
  }
  const left = await insideRead(
    workspace,
    `git diff --name-only -z HEAD -- ${paths}`
  );
  if (!left.ok) {
    return { ...ran, exitCode: 1, stderr: `${ran.stderr}${left.why}\n` };
  }
  const dropped = namesIn(left.out);
  return dropped.length === 0
    ? ran
    : {
        ...ran,
        exitCode: 1,
        stderr: `${ran.stderr}CawCo: the move left ${dropped.join(", ")} other than HEAD has ${dropped.length === 1 ? "it" : "them"} in the workspace's worktree, paths its boundary keeps from every command.\n`,
      };
};

/**
 * A move ({@link movedCommand}) that writes deny paths `writes`, run with
 * git on this host while the workspace's sandbox is down and its sessions
 * live on ({@link whileSandboxDown}). Only a command that runs every git as
 * safe-git.ts says, in a clone whose `.git` is a folder and whose config
 * holds no key past the allowlist (`repositoryConfigProblem`), looked at
 * again once the sandbox is down. git-lfs smudges nothing here, where a
 * `.lfsconfig` could point it anywhere with the owner's credentials; a
 * target that marks files for LFS has them pulled inside the boundary
 * after. `$TMPDIR` is the workspace's scratch dir, as inside. While
 * something still runs in the boundary, the move waits (the run's `folder`
 * wait, which a run that may not wait is cancelled on), for the run's
 * `queueMaxMs` at most, then fails in words.
 */
const onHost = async (
  cwd: string,
  cmd: string,
  timeoutMs: unknown,
  workspace: WorkspaceRef,
  run: CommandRun,
  writes: readonly string[]
): Promise<CommandResult> => {
  if (!cmd.startsWith(SAFE_GIT_SHELL)) {
    throw new Error(
      `a move that writes ${writes.join(", ")} runs on the host, and only a command that runs git as safe-git.ts says runs there`
    );
  }
  const refused = await hostGitRefusal(workspace.path);
  if (refused) {
    return { exitCode: 1, stdout: "", stderr: `${refused}\n` };
  }
  const deadline = Date.now() + run.queueMaxMs;
  let told = false;
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: one look at the boundary at a time, until it is idle
      const down = await whileSandboxDown(workspace, async () => {
        const now = await hostGitRefusal(workspace.path);
        if (now) {
          return { exitCode: 1, stdout: "", stderr: `${now}\n` };
        }
        return await spawned({
          file: "/bin/sh",
          args: ["-c", cmd],
          cwd,
          cmd,
          env: {
            ...SAFE_GIT_ENV,
            GIT_LFS_SKIP_SMUDGE: "1",
            TMPDIR: workspaceScratchDir(workspace.id),
          },
          timeoutMs,
          workspace,
          named: run,
        });
      });
      if ("ran" in down) {
        console.info(
          `[workspace] ${workspace.id}: \`${shownCommand(cmd)}\` ran on the host, its sandbox down, as it writes ${writes.join(", ")}`
        );
        return down.ran.exitCode === 0
          ? await largeFilesAfter(workspace, run.moves ?? "", down.ran)
          : down.ran;
      }
      if (cancelledEarly.delete(run.id)) {
        return CANCELLED;
      }
      const words = `${down.busy}, and the move writes ${writes.join(", ")} on the host with its sandbox down`;
      if (Date.now() >= deadline) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `CawCo: the move did not run: ${words}, and it still did after ${Math.round(run.queueMaxMs / 1000)} s.\n`,
        };
      }
      told = true;
      tellWait(run, { slot: "folder", holders: words });
      await Bun.sleep(BUSY_LOOK_MS);
    }
  } finally {
    if (told) {
      tellWait(run, null);
    }
  }
};

/** Why git must not run on this host in the clone at `path`: its `.git` no folder of its own, or its config past the allowlist. */
const hostGitRefusal = async (path: string): Promise<string | undefined> => {
  const dotGit = join(path, ".git");
  const found = await lstat(dotGit).catch(() => undefined);
  if (!found?.isDirectory()) {
    return `${dotGit} is ${found?.isSymbolicLink() ? "a link" : "no folder"}, which CawCo does not run git through on the host`;
  }
  return await repositoryConfigProblem(dotGit);
};

/** `ran`, once the large files `target` marks for LFS are pulled inside the boundary; its failure in words otherwise. */
const largeFilesAfter = async (
  workspace: WorkspaceRef,
  target: string,
  ran: CommandResult
): Promise<CommandResult> => {
  const marked = await insideRead(
    workspace,
    `if git grep -q filter=lfs ${target} -- ':(glob)**/.gitattributes'; then echo lfs; fi`
  );
  if (!marked.ok) {
    return { ...ran, exitCode: 1, stderr: `${ran.stderr}${marked.why}\n` };
  }
  if (marked.out.trim() !== "lfs") {
    return ran;
  }
  const pulled = await insideRead(workspace, "git lfs pull");
  return pulled.ok
    ? ran
    : { ...ran, exitCode: 1, stderr: `${ran.stderr}${pulled.why}\n` };
};
