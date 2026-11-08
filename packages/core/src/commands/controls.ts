/** The control verbs that run a command on a machine, and the queue of runs a machine keeps. */

import { HOUR_MS } from "../time";

/**
 * Runs a shell command on a machine, in a directory, killed with its process
 * group after a limit (exit 124). Args `[cwd, command, timeoutMs?, workspace?,
 * run?]`; answers {@link CommandResult}. The limit counts the command's own
 * work: while it waits in a shared machine slot's queue (a
 * {@link QUEUE_MARKER} line) the clock stands, for the run's `queueMaxMs` at
 * most ({@link CommandRun}), and each change of that wait goes to the hub as
 * a {@link CommandQueueFrame} under the run's id. A command that writes more than 8 MiB across
 * stdout and stderr is killed with its process group and the call fails with
 * an error naming the limit. The hub's one way to run something on a machine,
 * a work item's landing gate among them. A
 * {@link WorkspaceRef} runs the command inside that workspace's boundary,
 * exactly as its sessions' shell commands run; a machine that cannot start the
 * boundary fails the call with its reason.
 */
export const CONTROL_RUN_COMMAND = "runCommand";

/**
 * Stops a {@link CONTROL_RUN_COMMAND} run by its {@link CommandRun} id, args
 * `[runId]`: the machine ends its whole process group the way it ends every
 * command it stops (SIGTERM, then SIGKILL 5 s later), and the run answers
 * `cancelled`. A run still queued behind another command in its directory
 * answers `cancelled` as it comes up, without starting. Answers whether the
 * run was running. The hub sends it as a machine's pause begins
 * (machine-pause.ts), then runs the command again once the pause is over.
 */
export const CONTROL_CANCEL_COMMAND = "cancelCommand";

/**
 * The line a command prints, on stdout or stderr, as it starts and stops
 * waiting for a shared machine slot (apps/apple/scripts/mac-slot.sh and
 * build-both.sh print it):
 *
 *   CAWCO-QUEUE wait <slot>: <who holds it, and for how long>
 *   CAWCO-QUEUE held <slot>
 *
 * A line in the command's own output, not a file: the runner already reads
 * both streams live, the line crosses the workspace boundary, SSH and
 * build-both.sh's relay as it is, and a wait cannot outlive the process
 * that printed it. The runner reads only the token, the verb and the slot;
 * what follows the colon is shown as written.
 */
export const QUEUE_MARKER = "CAWCO-QUEUE";

/**
 * The shared slots a command may queue for, as the status names each. Two
 * are the runner's own, never a marker's: `folder`, a command waiting behind
 * the one running in its directory (the machine runs those one after
 * another), and `boundary`, one waiting for its workspace's boundary to start
 * (agent hub-command.ts). `heavy` is one of the machine's heavy-work slots
 * (heavy-slots.ts): the runner waits for it before a merge check starts, and
 * `bun run check` prints its marker when it waits for one itself.
 */
export const QUEUE_SLOTS = {
  boundary: "its workspace's boundary to start",
  build: "the Mac's build slot",
  folder: "its turn in its folder",
  heavy: "one of its machine's heavy-work slots",
  sim: "a simulator slot",
  template: "the simulator template lock",
} as const;
export type QueueSlot = keyof typeof QUEUE_SLOTS;

/** The most a command waits in slot queues, all its waits together: past it, it fails. */
export const QUEUE_WAIT_MAX_MS = 3 * HOUR_MS;

/**
 * The run a {@link CONTROL_RUN_COMMAND} names: the id its
 * {@link CommandQueueFrame}s carry, and the most its slot waits may last
 * (the hub sends {@link QUEUE_WAIT_MAX_MS}).
 */
export interface CommandRun {
  /**
   * The run is one of a work item's merge checks, in these words (`the
   * merge checks of “Fix the tray” (153fd0db): iOS build compiles`).
   */
  gate?: string;
  id: string;
  /**
   * The command moves the workspace's worktree to this commit: a landing's
   * `git reset --keep` to its rebased commit (hub landing.ts
   * `landedRebase`), a checkout of it. A move that would write a path the boundary
   * keeps from every command (core clone-denies.ts `cloneDenies`) runs
   * with git on the host, the sandbox down (agent hub-command.ts
   * `movedCommand`); any move that leaves such a path other than its HEAD
   * has it fails. Given only with a workspace, and with a command that runs
   * git as safe-git.ts says.
   */
  moves?: string;
  queueMaxMs: number;
}

/** A command's wait for a slot: which, and who holds it (the marker's words). */
export interface CommandQueue {
  holders: string;
  slot: QueueSlot;
}

/**
 * Daemon → hub: a {@link CONTROL_RUN_COMMAND} run named `runId` began
 * waiting for a slot (`queue`), or stopped (null).
 */
export interface CommandQueueFrame {
  kind: "command_queue";
  queue: CommandQueue | null;
  runId: string;
}

/**
 * What {@link CONTROL_RUN_COMMAND} answers: both streams complete, each
 * decoded as UTF-8 once the command has ended. Never truncated: past 8 MiB
 * across the two, the call fails instead.
 */
export interface CommandResult {
  /**
   * The hub stopped the run ({@link CONTROL_CANCEL_COMMAND}): not a failure,
   * and its exit code and output say nothing about the command.
   */
  cancelled?: true;
  exitCode: number;
  /** Everything the command wrote to stderr. */
  stderr: string;
  /** Everything the command wrote to stdout. */
  stdout: string;
}

/**
 * A shell command a session's process was running when it died: the command
 * as the model asked it, and the end of what it had printed by then, when
 * its harness kept any (Claude Code spools a running command's output:
 * agent claude.ts `cutCommands`; pi and OpenCode keep none, and their
 * commands are read off the session's own tool calls: agent session.ts
 * `#shells`). The hub says each one interrupted, with that output or that
 * none was kept, in the turn it hands back and in the item's report when
 * the death fails it.
 */
export interface CutCommand {
  command: string;
  /** What it printed: empty when it printed nothing, or when none was kept ({@link unkept}). */
  output: string;
  /** Its harness keeps no output of a running command (pi, OpenCode). */
  unkept?: true;
}
