import type { CommandResult, CommandRun } from "@cawco/core/commands/controls";
import {
  CONTROL_CANCEL_COMMAND,
  CONTROL_RUN_COMMAND,
  QUEUE_WAIT_MAX_MS,
} from "@cawco/core/commands/controls";
import { cutShort } from "@cawco/core/words/helpers";
import { queueWords } from "@cawco/core/words/queue";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { Effect } from "effect";
import type { ClosureContext } from "./closure-context";
import { folderStandsOn } from "./folder-stands";
import type { CommandOptions } from "./machine-pause";
import { throwIfStopped, WouldWait, whenStopped } from "./machine-pause";
import { readCheckout } from "./projects";
import { unreachable } from "./unreachable";

export type MachineCommandsContext = Pick<
  ClosureContext,
  | "db"
  | "lifetime"
  | "machineCalls"
  | "machinePause"
  | "projectsChanged"
  | "silentWords"
  | "unansweredFault"
>;

export const createMachineCommands = (ctx: MachineCommandsContext) => {
  /**
   * THE way the hub runs a command on a machine: in `cwd`, killed after
   * `timeoutMs` (the machine's default when not given), answering its
   * complete stdout and stderr (past 8 MiB it fails). A work item's landing
   * goes through it; its commands name its workspace, so they run inside
   * that workspace's boundary, as its delegate's commands do.
   * The machine's clock stands while the command waits for a shared slot,
   * up to QUEUE_WAIT_MAX_MS, so the hub waits that much longer; each change
   * of that wait reaches `how.onWait`.
   *
   * On a paused machine (machine-pause.ts) it waits for the pause's end
   * before it starts, `onWait` saying so. One running as a pause begins is
   * cancelled there ({@link stopCommands}) and runs again from the start
   * once the pause is over. A `noWait` one waits for
   * nothing: a pause, or a slot it begins to wait for (it is cancelled
   * there), throws WouldWait with the words of what it would have waited for.
   *
   * A run whose `how.stop` is aborted (its work item stopped while it
   * landed) is cancelled on its machine through the runner that started it,
   * or never starts, and throws CommandStopped, whatever it answered.
   */
  const runOnMachine = async (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number,
    workspace?: WorkspaceRef,
    how: CommandOptions = {}
  ): Promise<CommandResult> => {
    for (;;) {
      throwIfStopped(how, cmd);
      const paused = how.noWait ? ctx.machinePause.words(machineId) : undefined;
      if (paused) {
        throw new WouldWait({ message: paused });
      }
      await pauseOver(machineId, how.onWait, how.stop);
      throwIfStopped(how, cmd);
      const result = await runOnce(
        machineId,
        cwd,
        cmd,
        timeoutMs,
        workspace,
        how
      );
      throwIfStopped(how, cmd);
      if (!result.cancelled) {
        return result;
      }
      if (how.noWait) {
        throw new WouldWait({
          message: ctx.machinePause.words(machineId) ?? "its machine's pause",
        });
      }
      console.log(
        `[pause] ${machineId}: a command it stopped waits for the pause's end, then runs again`
      );
    }
  };

  /**
   * Waits out `machineId`'s pause, `onWait` saying it; at once when it is
   * not paused, or once `stop` is aborted.
   */
  const pauseOver = async (
    machineId: string,
    onWait: ((words: string | null) => void) | undefined,
    stop: AbortSignal | undefined
  ): Promise<void> => {
    const words = ctx.machinePause.words(machineId);
    if (!words) {
      return;
    }
    onWait?.(`waiting: ${words}`);
    await ctx.lifetime.run(
      Effect.raceFirst(ctx.machinePause.free(machineId), whenStopped(stop))
    );
    onWait?.(null);
  };

  /** Each command the hub has running on a machine, by its run's id. */
  const commandsInFlight = new Map<string, { machineId: string }>();

  /**
   * A pause began: every command the hub has running on the machine is
   * cancelled there, each to run again once the pause is over
   * ({@link runOnMachine}). Answers how many the machine says were
   * running; one still queued there is cancelled before it starts, and
   * is not counted.
   */
  const stopCommands = async (machineId: string): Promise<number> => {
    const runs = [...commandsInFlight].filter(
      ([, run]) => run.machineId === machineId
    );
    const answers = await Promise.all(
      runs.map(async ([runId]) => {
        const answer = await ctx.machineCalls
          .callAgent(machineId, CONTROL_CANCEL_COMMAND, [runId], 15_000)
          .catch((error: unknown) =>
            error instanceof Error ? error.message : String(error)
          );
        if (typeof answer === "string") {
          console.warn(
            `[pause] ${machineId}: could not cancel command ${runId}: ${answer}`
          );
          return;
        }
        switch (answer.kind) {
          case "unanswered":
            console.warn(
              `[pause] ${machineId}: whether command ${runId} was cancelled is not known: ${ctx.silentWords(machineId, answer)}`
            );
            return;
          case "answered":
            if (answer.value.error) {
              console.warn(
                `[pause] ${machineId}: could not cancel command ${runId}: ${String(answer.value.error)}`
              );
              return;
            }
            return answer.value.result === true;
          default:
            throw unreachable(answer);
        }
      })
    );
    return answers.filter(Boolean).length;
  };

  /**
   * Cancels run `runId` on its machine (CONTROL_CANCEL_COMMAND): its runner
   * ends the run's process group, or keeps it from starting. Throws the
   * machine's words when it could not.
   */
  const cancelRun = async (machineId: string, runId: string): Promise<void> => {
    const answer = await ctx.machineCalls.callAgent(
      machineId,
      CONTROL_CANCEL_COMMAND,
      [runId],
      15_000
    );
    switch (answer.kind) {
      case "unanswered":
        throw new Error(ctx.silentWords(machineId, answer));
      case "answered":
        if (answer.value.error) {
          throw new Error(String(answer.value.error));
        }
        return;
      default:
        throw unreachable(answer);
    }
  };

  /** One run of a command on a machine ({@link runOnMachine}). */
  const runOnce = async (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs: number | undefined,
    workspace: WorkspaceRef | undefined,
    how: CommandOptions
  ): Promise<CommandResult> => {
    const run: CommandRun = {
      id: crypto.randomUUID(),
      queueMaxMs: QUEUE_WAIT_MAX_MS,
      ...(how.moves ? { moves: how.moves } : {}),
    };
    const { onWait } = how;
    /**
     * Its owner ended: the machine's runner ends the run's process group, or
     * keeps it from starting (CONTROL_CANCEL_COMMAND), and it answers
     * `cancelled`.
     */
    const cancel = (): void => {
      console.log(
        `[command] ${machineId}: cancelling command run ${run.id}, its owner stopped: \`${cutShort(cmd, 120)}\``
      );
      ctx.lifetime.fork(
        "cancel a run its owner stopped",
        Effect.tryPromise(() => cancelRun(machineId, run.id)).pipe(
          Effect.catch(({ cause }) =>
            Effect.sync(() =>
              console.warn(
                `[command] ${machineId}: run ${run.id}, stopped with its owner, could not be cancelled: ${cause instanceof Error ? cause.message : String(cause)}`
              )
            )
          )
        )
      );
    };
    how.stop?.addEventListener("abort", cancel, { once: true });
    /** A `noWait` run's slot wait, which cancelled it: its words. */
    let waited: string | undefined;
    if (onWait || how.noWait) {
      ctx.machineCalls.commandQueues.set(run.id, (queue) => {
        if (!(how.noWait && queue) || queue.slot === "boundary") {
          onWait?.(queue ? queueWords(queue) : null);
          return;
        }
        if (waited !== undefined) {
          return;
        }
        waited = queueWords(queue);
        ctx.lifetime.fork(
          "cancel a run that may not wait",
          Effect.tryPromise(() => cancelRun(machineId, run.id)).pipe(
            Effect.catch(({ cause }) =>
              Effect.sync(() =>
                console.warn(
                  `[command] ${machineId}: a run that may not wait (${waited}) could not be cancelled: ${cause instanceof Error ? cause.message : String(cause)}`
                )
              )
            )
          )
        );
      });
    }
    commandsInFlight.set(run.id, { machineId });
    try {
      const response = await ctx.machineCalls.callAgent(
        machineId,
        CONTROL_RUN_COMMAND,
        [cwd, cmd, timeoutMs, workspace, run],
        (timeoutMs ?? 300_000) + run.queueMaxMs + 10_000
      );
      // A command that ran out its own limit is an answer (exit 124, in
      // `result`); only a reply that never came is unanswered.
      switch (response.kind) {
        case "unanswered":
          throw new Error(
            `Command got no answer: ${ctx.unansweredFault(machineId, response)}`
          );
        case "answered":
          if (!response.value.ok) {
            throw new Error(
              response.value.error ?? "the command's machine gave no reason"
            );
          }
          break;
        default:
          throw unreachable(response);
      }
      const { result } = response.value;
      if (waited !== undefined && result.cancelled) {
        throw new WouldWait({ message: waited });
      }
      return result;
    } finally {
      how.stop?.removeEventListener("abort", cancel);
      ctx.machineCalls.commandQueues.delete(run.id);
      commandsInFlight.delete(run.id);
    }
  };

  /**
   * What one of a project's checkouts says, read there: whether its folder
   * stands, kept on the checkout (`missing`, and `found` once it has) and
   * told to every client when it changes, so a folder moved or removed by
   * hand shows as missing and is never made again by a start; its
   * root commit, kept on the checkout (a move compares it with the
   * source's machine away, moves.ts `plan`), and its `origin`, linked to the
   * project. Nothing read (the machine away, no `origin`, no commit) leaves
   * it for the next chance. A link another project already has is not
   * made: two projects become one only with the person's yes (Locate
   * folder, project-locate.ts), never from what a folder reads.
   */
  const learnCheckout = async (place: {
    id: string;
    projectId: string;
    machineId: string;
    path: string;
  }): Promise<void> => {
    const stands = await folderStandsOn(
      ctx.machineCalls.readAgent,
      place.machineId,
      place.path
    );
    if (stands !== undefined && ctx.db.setPlaceFolder(place.id, stands)) {
      ctx.projectsChanged();
    }
    if (stands === false) {
      return;
    }
    const { remote, root } = await readCheckout(
      runOnMachine,
      place.machineId,
      place.path
    );
    if (root) {
      ctx.db.setPlaceRoot(place.id, root);
    }
    if (!remote) {
      return;
    }
    const owner = ctx.db.projectByRemote(remote);
    if (owner && owner.id !== place.projectId) {
      console.log(
        `[hub] ${place.path} on ${place.machineId} is a checkout of ${remote}, which ${owner.name} (${owner.id}) has; it is not linked to project ${place.projectId}, and the two stay apart until the person makes them one (Locate folder)`
      );
      return;
    }
    ctx.db.addProjectLink(place.projectId, remote);
  };

  return {
    runOnMachine,
    stopCommands,
    learnCheckout,
  };
};
