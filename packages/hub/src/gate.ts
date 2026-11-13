import type { CommandResult } from "@cawco/core/commands/controls";
import { isMachinePath, type MachinePath } from "@cawco/core/machine-path";
import type { DeclaredStep, RunsOnCapability } from "@cawco/core/project-gate";
import { shellQuote } from "@cawco/core/shell-quote";
import {
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BUNDLE,
  type WorkspaceCommit,
} from "@cawco/core/workspace/controls";
import { ElysiaStatus } from "elysia";
import { gateStepFor, readTargetMap, type TargetMap } from "./app-targets";
import type { DbShape } from "./db";
import type { WorkItemRow, WorkspaceRow } from "./db/project-work";
import type { GatePass } from "./db/stored-types";
import {
  capableMachines,
  capableRefusal,
  changedPathsCommand,
  diffPaths,
  GATE_FILE,
  lastCapable,
  projectGate,
} from "./gate-file";
import { type GateStep, statusCommand } from "./landing";
import { machineName } from "./machine-name";
import {
  type CommandOptions,
  CommandStopped,
  WouldWait,
  whenStopped,
} from "./machine-pause";
import type { WorkspacesDeps } from "./workspaces";
import { GIT_TIMEOUT_MS, refOf, type Workspaces } from "./workspaces";

/** How long a gate step runs when it names no limit of its own. */
const GATE_TIMEOUT_SEC = 600;
/** A command's failure in a few words: what it wrote, else its exit code. */
export const failedWith = (result: CommandResult): string =>
  (result.stderr || result.stdout).trim() || `exit ${result.exitCode}`;
/** How much of each stream a gate step keeps: the report and the delegate read this. */
const GATE_TAIL = 4000;
/** A step's command result, each stream cut to its last {@link GATE_TAIL} characters. */
const gateTails = (result: CommandResult): CommandResult => ({
  exitCode: result.exitCode,
  stdout: result.stdout.slice(-GATE_TAIL),
  stderr: result.stderr.slice(-GATE_TAIL),
});
/** One landing gate step, as the hub ran it: `result` holds the stream tails. */
export interface StepOutcome {
  durationMs: number;
  exitCode: number;
  /** Why the step had nothing to run (GateStep `nothing`): it passes, and its line says this. */
  nothing?: string;
  passed: boolean;
  result: CommandResult;
  /**
   * Why a step did not run, its pass carried over ({@link gateOnce}):
   * `passed on this tree at finish_item`.
   */
  skipped?: string;
  step: GateStep;
  /**
   * Why a step did not run and so did not pass: an earlier step with
   * `on-fail: stop` failed (`bun install --frozen-lockfile failed first`).
   */
  unrun?: string;
  /** Where a step on another machine ran: `on Omars-MacBook-Pro at 1a2b3c4d5`. */
  where?: string;
}

/**
 * The outcome of a step that ran no command, `passed` as given and why in
 * `why`: unrun after an earlier failure, nothing to run, or a pass carried over.
 */
const notRun = (
  step: GateStep,
  why: Pick<StepOutcome, "nothing" | "skipped" | "unrun">,
  passed: boolean
): StepOutcome => ({
  step,
  ...why,
  passed,
  exitCode: 0,
  durationMs: 0,
  result: { exitCode: 0, stdout: "", stderr: "" },
});
/** Every path the steps declare as their inputs (`on:`), read once per look at the workspace. */
const inputPathsOf = (steps: readonly GateStep[]): string[] => [
  ...new Set(steps.flatMap((step) => step.inputs ?? [])),
];
/**
 * A clean workspace as {@link gateOnce} keys passes by it: `tree`, HEAD's
 * tree with the item's outputs' contents beside it; `inputs`, the tree of
 * each declared input path at HEAD (`absent` where HEAD has none); `outputs`,
 * each output's content hash; `stamp`, all of it, to tell whether the
 * workspace moved during a run. A step that declares its inputs (`on:`) has
 * its pass kept and matched by those paths' trees rather than the whole
 * tree's, so it holds after a rebase that left them as they were; every
 * other step by the whole tree.
 */
interface TreeState {
  inputs: ReadonlyMap<string, string>;
  outputs: ReadonlyMap<string, string>;
  stamp: string;
  tree: string;
}
/**
 * Where `step`'s pass is kept in `state`, and how its skip says where it
 * passed: the whole tree, or, for a step that declares inputs, those paths'
 * trees (and the contents of any output under them).
 */
const passKey = (
  step: GateStep,
  state: TreeState
): { key: string; said: (stage: string) => string } => {
  const { inputs } = step;
  if (!inputs) {
    return {
      key: state.tree,
      said: (stage) => `passed on this tree ${stage}`,
    };
  }
  const parts = inputs.flatMap((path) => [
    `${path}=${state.inputs.get(path) ?? "absent"}`,
    ...[...state.outputs]
      .filter(([output]) => output === path || output.startsWith(`${path}/`))
      .map(([output, hash]) => `${output}=${hash}`),
  ]);
  return {
    key: `inputs ${parts.join(" ")}`,
    said: (stage) =>
      `passed ${stage} on the same ${step.inputsSaid ?? inputs.join(" and ")} tree`,
  };
};
/** A git tree's name, as `git rev-parse <commit>^{tree}` prints it. */
export const TREE_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
/**
 * Why `step` need not run where `passed` passed (all kept under its
 * {@link passKey}, which `said` names): the same command passed there.
 * Undefined when it must run.
 */
const priorPass = (
  step: GateStep,
  passed: GatePass[],
  said: (stage: string) => string
): string | undefined => {
  const command = step.command.trim();
  const same = passed.find((each) => each.command === command);
  return same ? said(same.stage) : undefined;
};
/**
 * A run of the landing gate: each step's outcome, and whether the project
 * declares a gate at all (gate-file.ts): one that declares none lands with
 * no checks, and its report says so.
 */
export interface GateRun {
  declared: boolean;
  outcomes: StepOutcome[];
}
/**
 * The landing gate an item lands through: the steps its project declares
 * that are due for it (gate-file.ts), and whether it declares a gate at all.
 */
export interface Gate {
  declared: boolean;
  steps: GateStep[];
}
/**
 * Why an item's gate cannot run now, in words; `needs`, when that is no
 * online machine with a capability a due step needs: the item waits for one.
 */
interface GateRefusal {
  needs?: RunsOnCapability;
  refusal: string;
}
/**
 * How a gate run waits. At finish_item and while an item gates on top of
 * its branch (`inTurn` false) its steps wait out their machine's pause and
 * the shared slots they need, `say` hearing each wait with the name of the
 * step that waits (null once none does). In the landing turn (`inTurn` true)
 * nothing waits: a step due there that runs on another machine, or one that
 * would wait for a pause or a slot, throws {@link WouldWait}, and the item
 * steps out of its turn (landing.ts).
 */
export interface GateHow {
  inTurn: boolean;
  say: (words: string | null, step?: string) => void;
}
/**
 * The turn runs only what runs in the workspace itself: a due step on
 * another machine (one that `needs:` a Mac) is the gate's, outside the queue.
 * Throws {@link WouldWait} naming the first such step, before any of them
 * runs; nothing when there is none.
 */
const refuseAway = (
  steps: GateStep[],
  machineId: string,
  named: (machineId: string) => string
): void => {
  const away = steps.find((step) => step.machine && step.machine !== machineId);
  if (away?.machine) {
    throw new WouldWait(`${away.name} runs on ${named(away.machine)}`);
  }
};
/**
 * Rethrows `error`: a {@link WouldWait} from `what`'s run saying that it was
 * `what` that would have waited, any other as it was.
 */
function waitedIn(error: unknown, what: string): never {
  if (error instanceof WouldWait) {
    throw new WouldWait(`${what} would have waited: ${error.message}`, {
      cause: error,
    });
  }
  throw error;
}
/** One step that ran to its end, and where, when on another machine. */
interface Ran {
  complete: CommandResult;
  where: string | undefined;
}

export interface GateDeps extends Pick<
  WorkspacesDeps,
  "call" | "command" | "db"
> {
  /** What item `itemId`'s end aborts while this hub runs its landing (landing-run.ts `landingStops`); nothing when it runs none. */
  readonly landingStop: (itemId: string) => AbortSignal | undefined;
  /** Resolves once `machineId`'s pause is over; at once when it is not paused. */
  readonly machineFree: (machineId: string) => Promise<void>;
  /**
   * "Omars-MacBook-Pro is paused until 00:57" while the owner has paused
   * `machineId` (machine-pause.ts); undefined when it is not paused.
   */
  readonly machinePaused: (machineId: string) => string | undefined;
  /** Whether `machineId`'s agent is connected now: the Apple build gate runs only on one that is. */
  readonly online: (machineId: string) => boolean;
  readonly runIn: (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ) => (
    cmd: string,
    timeoutMs: number,
    noWait?: boolean,
    lands?: boolean,
    moves?: string
  ) => Promise<CommandResult>;
  readonly update: (
    id: string,
    asked: Parameters<DbShape["updateWorkItem"]>[1]
  ) => WorkItemRow | undefined;
  readonly workspaces: Workspaces;
}

export const createGate = ({
  call,
  command,
  db,
  landingStop,
  machineFree,
  machinePaused,
  online,
  runIn,
  update,
  workspaces,
}: GateDeps) => {
  /**
   * The gate commands that passed for a live item, by what they passed on
   * ({@link passKey}: the whole tree, or the trees of the paths a step
   * declares), as its row keeps them (`gatePasses`): one command runs at
   * most once on one such key ({@link gateOnce}), a hub restart included.
   */
  const passesOf = (itemId: string): Map<string, GatePass[]> =>
    new Map(Object.entries(db.workItem(itemId)?.gatePasses ?? {}));
  /** `pass` kept on `item`'s row under `key`, as its step passes. */
  const keepPass = (itemId: string, key: string, pass: GatePass): void => {
    const kept = db.workItem(itemId)?.gatePasses ?? {};
    update(itemId, {
      gatePasses: { ...kept, [key]: [...(kept[key] ?? []), pass] },
    });
  };
  /** The passes `taken` let go of: their run's workspace moved while it ran. */
  const dropPasses = (
    itemId: string,
    taken: readonly { key: string; pass: GatePass }[]
  ): void => {
    const kept = { ...(db.workItem(itemId)?.gatePasses ?? {}) };
    for (const { key, pass } of taken) {
      kept[key] = (kept[key] ?? []).filter(
        (each) => !(each.command === pass.command && each.stage === pass.stage)
      );
    }
    update(itemId, { gatePasses: kept });
  };
  /**
   * The project's repository on a machine, which a gate workspace there is
   * cut from: its checkout place there (the primary first), or the folder
   * the last workspace of the project cut there was cut from
   * (workspaces.ts `recordRepository`), which outlives that workspace. Nothing when
   * the hub knows neither.
   */
  const repositoryOn = (
    projectId: string,
    machineId: string
  ): MachinePath | undefined => {
    const checkout = db
      .project(projectId)
      ?.places.find(
        (place) => place.machineId === machineId && place.kind === "checkout"
      )?.path;
    return checkout && isMachinePath(checkout)
      ? checkout
      : db.projectRepository(projectId, machineId);
  };
  /**
   * The workspace that runs `workspace`'s landing gate steps on `machineId`
   * (the iOS build on a Mac): the one cut there before, or a new one cut from
   * the project's repository on that machine. It stays between runs, so a
   * build there is incremental; it is archived with `workspace`.
   */
  const gateWorkspace = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    machineId: string
  ): Promise<WorkspaceRow> => {
    const held = db
      .checkWorkspacesOf(workspace.id)
      .find((each) => each.machineId === machineId);
    if (held) {
      return held;
    }
    const { projectId } = item;
    const repository = projectId
      ? repositoryOn(projectId, machineId)
      : undefined;
    if (!(projectId && repository)) {
      throw new Error(
        projectId
          ? `the hub knows no repository of this project on ${machineName(db, machineId)}: no checkout place there, and no workspace of it was ever cut there. Your parent delegates once to that machine with cwd at the repository there (or adds it as a checkout of the project); then call finish_item again.`
          : "this item belongs to no project, so the hub knows no checkout of its repository there."
      );
    }
    const opened = await workspaces.openWorkspace(
      item.instanceId,
      repository,
      machineId,
      projectId,
      { checksFor: workspace.id }
    );
    return opened;
  };
  /**
   * Runs the landing gate's `steps` in order. A step runs in the workspace's
   * worktree, on its machine, inside its boundary. A step on another machine
   * (the iOS build on a Mac) runs there, in the workspace's gate workspace
   * ({@link gateWorkspace}), inside that one's boundary, at the workspace's
   * last commit: the commits past its base go over as a git bundle, once per
   * run and machine. Uncommitted work stays where it is. `how` says whether
   * its steps may wait ({@link GateHow}).
   */
  const runGate = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    steps: GateStep[],
    how: GateHow,
    passed?: (step: GateStep) => void
  ): Promise<GateRun> => {
    let commit: Promise<WorkspaceCommit> | undefined;
    /** The step running now, for the words of its waits. */
    let current: GateStep | undefined;
    /** What a step waits for, as the item's status says it ({@link GateHow}). */
    const queued = (words: string | null): void =>
      how.say(words, current?.name);
    /** The item's end, which cancels every step running ({@link GateDeps.landingStop}). */
    const stop = landingStop(item.id);
    /**
     * How a step's commands run: a pause that cancels one hands it back
     * here; in the turn, one that would wait throws {@link WouldWait}; the
     * item's end cancels it.
     */
    const asStep = (step: GateStep): CommandOptions => ({
      onWait: queued,
      what: "merge check",
      movable: true,
      noWait: how.inTurn,
      gate: `the merge checks of “${item.title}” (${item.id.slice(0, 8)}): ${step.name}`,
      stop,
    });
    /**
     * Waits out a pause of the machine a step runs on, the item's status
     * saying it; at once when it is not paused. In the turn it throws
     * {@link WouldWait} instead; the item's end throws {@link CommandStopped}.
     */
    const unpaused = async (machineId: string): Promise<void> => {
      const words = machinePaused(machineId);
      if (!words) {
        return;
      }
      if (how.inTurn) {
        throw new WouldWait(words);
      }
      queued(`waiting: ${words}`);
      await Promise.race([machineFree(machineId), whenStopped(stop)]);
      queued(null);
      if (stop?.aborted) {
        throw new CommandStopped(
          `${item.title} ended while its merge checks waited for a pause to end`
        );
      }
    };
    /** A memo per machine: the first call for a machine runs `make`, every later one shares it. */
    const once = <T>(
      memo: Map<string, Promise<T>>,
      machineId: string,
      make: () => Promise<T>
    ): Promise<T> => {
      const known = memo.get(machineId);
      if (known !== undefined) {
        return known;
      }
      const made = make();
      memo.set(machineId, made);
      return made;
    };
    const placed = new Map<
      string,
      Promise<{ at: WorkspaceRow; head: string }>
    >();
    /** The gate workspace on `machineId`, at the workspace's commit. */
    const atCommit = (
      machineId: string
    ): Promise<{ at: WorkspaceRow; head: string }> =>
      once(placed, machineId, async () => {
        const at = await gateWorkspace(workspace, item, machineId);
        commit ??= call(workspace.machineId, CONTROL_WORKSPACE_BUNDLE, [
          refOf(workspace),
          workspace.base,
        ]) as Promise<WorkspaceCommit>;
        const made = await commit;
        await call(machineId, CONTROL_WORKSPACE_AT, [
          refOf(at),
          workspace.base,
          made,
          workspace.id,
        ]);
        return { at, head: made.head };
      });
    /**
     * One step on another machine; a machine that cannot run it fails the
     * step in its words. Undefined when a pause cancelled it, to run again.
     */
    const runElsewhere = async (
      machineId: string,
      step: GateStep,
      limit: number
    ): Promise<Ran | undefined> => {
      const on = `on ${machineName(db, machineId)}`;
      try {
        const { at, head } = await atCommit(machineId);
        const complete = await command(
          machineId,
          at.path,
          step.command,
          limit,
          refOf(at),
          asStep(step)
        );
        return complete.cancelled
          ? undefined
          : { where: `${on} at ${head.slice(0, 9)}`, complete };
      } catch (error) {
        // The item's end cancelled it: the landing stops, no step failed.
        if (error instanceof CommandStopped) {
          throw error;
        }
        return {
          where: on,
          complete: {
            exitCode: 1,
            stdout: "",
            stderr: `The hub could not run this step ${on}: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
    };
    /**
     * Where a step runs: the machine it names, else the workspace's. A step
     * that `needs:` a capability whose machine is paused moves to one with
     * it that is not, when one is online ({@link gateMachine}).
     */
    const machineFor = (step: GateStep): string => {
      const named = step.machine ?? workspace.machineId;
      return step.needs && item.projectId && machinePaused(named)
        ? (gateMachine(workspace, item.projectId, step.needs)?.machineId ??
            named)
        : named;
    };
    /**
     * One run of a step where `machineId` is: in the workspace, or its gate
     * workspace there. Undefined when a pause cancelled it.
     */
    const runStep = async (
      machineId: string,
      step: GateStep,
      limit: number
    ): Promise<Ran | undefined> => {
      if (machineId !== workspace.machineId) {
        return await runElsewhere(machineId, step, limit);
      }
      const complete = await command(
        workspace.machineId,
        workspace.path,
        step.command,
        limit,
        refOf(workspace),
        asStep(step)
      );
      return complete.cancelled ? undefined : { complete, where: undefined };
    };
    if (how.inTurn) {
      refuseAway(steps, workspace.machineId, (id) => machineName(db, id));
    }
    try {
      const outcomes: StepOutcome[] = [];
      /** A failed step with `on-fail: stop`, which leaves every step after it unrun. */
      let stopped: GateStep | undefined;
      for (const step of steps) {
        current = step;
        if (stopped) {
          outcomes.push(
            notRun(step, { unrun: `${stopped.name} failed first` }, false)
          );
          continue;
        }
        const limit = (step.timeoutSec ?? GATE_TIMEOUT_SEC) * 1000;
        let started = 0;
        // A step a pause cancels is no outcome and no attempt: it waits the
        // pause out (or moves, a step that `needs:` a capability), then runs
        // again from the start.
        let ran: Ran | undefined;
        while (!ran) {
          const machineId = machineFor(step);
          await unpaused(machineId);
          started = Date.now();
          // A step that ends while waiting (killed, past the most a wait may
          // last, or a machine that could not run it) leaves no wait behind it.
          ran = await runStep(machineId, step, limit).finally(() =>
            queued(null)
          );
        }
        const { complete, where } = ran;
        const result = gateTails(complete);
        outcomes.push({
          step,
          result,
          where,
          exitCode: result.exitCode,
          durationMs: Date.now() - started,
          passed: result.exitCode === 0,
        });
        if (result.exitCode === 0) {
          passed?.(step);
        } else if (step.stopsRest) {
          stopped = step;
        }
      }
      return { declared: true, outcomes };
    } catch (error) {
      waitedIn(error, current?.name ?? "the merge checks");
    }
  };
  /**
   * What a gate run in the workspace runs on ({@link TreeState}): HEAD's
   * tree (`git rev-parse HEAD^{tree}`), with the item's outputs' contents
   * beside it when it has outputs, and the tree of each path a step declares
   * as its inputs, `inputPaths` (`git rev-parse HEAD:<path>`), while nothing
   * else is uncommitted; landing.ts lands only such a tree. Undefined while
   * something else is uncommitted: those steps read files no tree names, so
   * their passes are neither kept nor matched. `noWait` in a landing turn.
   */
  const treeState = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    inputPaths: readonly string[],
    noWait: boolean
  ): Promise<TreeState | undefined> => {
    const outputs = item.outputs ?? [];
    // One hash a line per output; a folder's is the hash of its files' list
    // with each file's hash.
    const hashed =
      outputs.length > 0
        ? ` && for p in ${outputs.map(shellQuote).join(" ")}; do if [ -d "$p" ]; then find "$p" -type f | LC_ALL=C sort | while IFS= read -r f; do echo "$f $(git hash-object -- "$f")"; done | git hash-object --stdin; else git hash-object -- "$p"; fi || exit 1; done`
        : "";
    const declared =
      inputPaths.length > 0
        ? ` && for path in ${inputPaths.map(shellQuote).join(" ")}; do git rev-parse --verify -q "HEAD:$path" || echo absent; done`
        : "";
    const read = await runIn(workspace, item)(
      `left=$(${statusCommand(outputs)}) && test -z "$left" && git rev-parse --verify 'HEAD^{tree}'${hashed}${declared}`,
      GIT_TIMEOUT_MS,
      noWait
    );
    const lines = read.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (
      read.exitCode !== 0 ||
      lines.length !== 1 + outputs.length + inputPaths.length
    ) {
      return;
    }
    const contents = lines.slice(1, 1 + outputs.length);
    const trees = lines.slice(1 + outputs.length);
    return {
      tree: lines.slice(0, 1 + outputs.length).join(" "),
      outputs: new Map(
        outputs.map((output, at) => [output, contents[at] ?? ""])
      ),
      inputs: new Map(inputPaths.map((path, at) => [path, trees[at] ?? ""])),
      stamp: lines.join(" "),
    };
  };
  /**
   * {@link runGate} over `gate`'s steps, each run at most once on one tree:
   * a step that passed on the tree the workspace holds now is not run again;
   * its outcome says where it passed. A step that declares its inputs
   * (`on:`) is matched by those paths' trees instead, so a rebase that left
   * them alone does not run it again: an iOS compile on `apps/apple` runs
   * once per apps/apple tree, at finish_item, and not again on the rebased
   * tree when the rebase left apps/apple as it was. `stage` names this run
   * for the lines of the steps it lets skip later; `how`, whether its steps
   * may wait ({@link GateHow}). A pass is kept only when the workspace held
   * the same trees before and after the run.
   */
  const gateOnce = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    gate: Gate,
    stage: string,
    how: GateHow
  ): Promise<GateRun> => {
    const { steps } = gate;
    const inputPaths = inputPathsOf(steps);
    const state = await treeState(workspace, item, inputPaths, how.inTurn);
    const kept = passesOf(item.id);
    const prior = steps.map((step): string | undefined => {
      if (!state || step.nothing) {
        return undefined;
      }
      const { key, said } = passKey(step, state);
      return priorPass(step, kept.get(key) ?? [], said);
    });
    const due = steps.filter(
      (step, at) => !step.nothing && prior[at] === undefined
    );
    // Each pass is kept as its step passes, so a gate a restart cuts runs
    // again from the step it was on; a run whose workspace moved under it
    // lets this run's passes go at its end.
    const taken: { key: string; pass: GatePass }[] = [];
    const passed = state
      ? (step: GateStep) => {
          const one = {
            key: passKey(step, state).key,
            pass: { command: step.command.trim(), stage },
          };
          taken.push(one);
          keepPass(item.id, one.key, one.pass);
        }
      : undefined;
    const run =
      due.length > 0
        ? await runGate(workspace, item, due, how, passed)
        : { declared: gate.declared, outcomes: [] };
    if (
      taken.length > 0 &&
      (await treeState(workspace, item, inputPaths, how.inTurn))?.stamp !==
        state?.stamp
    ) {
      dropPasses(item.id, taken);
    }
    const ran = [...run.outcomes];
    return {
      declared: gate.declared,
      outcomes: steps.map((step, at) => {
        if (step.nothing) {
          return notRun(step, { nothing: step.nothing }, true);
        }
        const skipped = prior[at];
        return skipped === undefined
          ? (ran.shift() as StepOutcome)
          : notRun(step, { skipped }, true);
      }),
    };
  };
  /**
   * The landing gate's passes on the tree `sha` holds (WorkLanding `gate`):
   * the tree, and each step that passed in `run`, the gate's last run, on
   * the tree that landed. Nothing when git cannot name the tree.
   */
  const gatePassOf = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    sha: string,
    run: GateRun
  ): Promise<{ passed: string[]; tree: string } | undefined> => {
    const read = await runIn(workspace, item)(
      `git rev-parse ${sha}^{tree}`,
      GIT_TIMEOUT_MS,
      false,
      true
    );
    const tree = read.exitCode === 0 ? read.stdout.trim() : "";
    if (!TREE_SHA.test(tree)) {
      return;
    }
    const passed = run.outcomes
      .filter((outcome) => outcome.passed)
      .map((outcome) => outcome.step.command.trim());
    return { tree, passed: [...new Set(passed)] };
  };
  /** The paths of the workspace's changes against its target, for the steps that run `on:` some. */
  const changedPaths = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<string[]> => {
    const diff = await runIn(workspace, item)(
      changedPathsCommand(shellQuote(`origin/${workspace.base}`)),
      GIT_TIMEOUT_MS
    );
    if (diff.exitCode !== 0) {
      throw new Error(
        `the hub could not read the item's changes against origin/${workspace.base} for the on: steps of its merge checks: ${failedWith(diff)}`
      );
    }
    return diffPaths(diff.stdout);
  };
  /**
   * The online machine with `capability` a step that `needs:` it runs on:
   * one holding the workspace's gate workspace already (its build is
   * incremental), else one with the project's repository, else any; among
   * the machines not paused first. With every one paused, a paused one: its
   * step waits for the pause's end, its item's status saying so.
   */
  const gateMachine = (
    workspace: WorkspaceRow,
    projectId: string,
    capability: RunsOnCapability
  ) => {
    const capable = capableMachines(db.listAgents(), capability, online);
    const held = new Set(
      db.checkWorkspacesOf(workspace.id).map((each) => each.machineId)
    );
    const pick = (among: typeof capable) =>
      among.find((each) => held.has(each.machineId)) ??
      among.find((each) => repositoryOn(projectId, each.machineId)) ??
      among[0];
    return (
      pick(capable.filter((each) => !machinePaused(each.machineId))) ??
      pick(capable)
    );
  };
  /** The project's gate ({@link projectGate}), the folder's refusal thrown on in its words, as the landing's failures are: finish_item answers them. */
  const gateOf = async (projectId: string) => {
    const declared = await projectGate(projectId);
    if (declared instanceof ElysiaStatus) {
      throw new Error(declared.response.detail);
    }
    return declared;
  };

  /**
   * THE landing gate of an item: what stands between its finished work and
   * where it lands, and what no session writes. The steps its project
   * declares in gate.md (gate-file.ts), in order: each `on:` step only when
   * the item's diff against its target touches one of its paths, and each
   * `needs:` step on an online machine with that capability, at the item's
   * last commit, in the workspace's gate workspace there ({@link runGate}).
   * A project with no gate.md declares none. An item that lands none has no
   * gate: it puts nothing anywhere. `refusal`, in words, when gate.md does
   * not read or no machine a due step needs is online (then `needs`, the
   * capability the item waits for).
   */
  const gateSteps = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<Gate | GateRefusal> => {
    const { projectId } = item;
    if (item.lands === "none" || !projectId) {
      return { declared: false, steps: [] };
    }
    const declared = await gateOf(projectId);
    if (declared.kind === "none") {
      return { declared: false, steps: [] };
    }
    if (declared.kind === "unreadable") {
      return {
        refusal: `Not landed: this project's ${GATE_FILE}, which declares its merge checks, does not read, so the hub cannot tell what to run. ${declared.problems.join(" ")} It is in the project's folder on the hub: ask your parent or the person to fix it there, then call finish_item again.`,
      };
    }
    const touched = declared.steps.some((step) => step.inputs || step.targetMap)
      ? await changedPaths(workspace, item)
      : [];
    const maps = await targetMapsOf(workspace, item, declared.steps, touched);
    if ("refusal" in maps) {
      return maps;
    }
    const steps: GateStep[] = [];
    for (const step of declared.steps) {
      const due = dueStep(
        workspace,
        projectId,
        step,
        touched,
        step.targetMap ? maps.get(step.targetMap) : undefined
      );
      if ("refusal" in due) {
        return due;
      }
      steps.push(...due.steps);
    }
    return { declared: true, steps };
  };
  /** The target map of every `targets:` step in `steps`, by its path ({@link targetMapOf}), or the first refusal. */
  const targetMapsOf = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    steps: readonly DeclaredStep[],
    touched: readonly string[]
  ): Promise<Map<string, TargetMap> | GateRefusal> => {
    const maps = new Map<string, TargetMap>();
    for (const path of new Set(steps.flatMap((step) => step.targetMap ?? []))) {
      const map = await targetMapOf(workspace, item, path, touched);
      if ("refusal" in map) {
        return map;
      }
      maps.set(path, map);
    }
    return maps;
  };
  /**
   * The target map at `path` (app-targets.ts) as the tree that lands holds
   * it: the item's own (HEAD's) when its diff `touched` changes it, else its
   * target's (`origin/<base>`). A refusal in words when it does not read.
   */
  const targetMapOf = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    path: string,
    touched: readonly string[]
  ): Promise<TargetMap | GateRefusal> => {
    const ref = touched.includes(path) ? "HEAD" : `origin/${workspace.base}`;
    const shown = await runIn(workspace, item)(
      `git show ${shellQuote(`${ref}:${path}`)}`,
      GIT_TIMEOUT_MS
    );
    const map =
      shown.exitCode === 0
        ? readTargetMap(shown.stdout)
        : { problem: failedWith(shown) };
    return "problem" in map
      ? {
          refusal: `Not landed: this project's merge checks build what its target map, ${path}, gives a change, and ${ref}'s ${path} does not read: ${map.problem}. Write it with apps/apple/scripts/targets-map.sh --write on the Mac and commit it, or ask your parent; then call finish_item again.`,
        }
      : map;
  };
  /**
   * One declared step as the gate runs it for an item whose diff is
   * `touched` (app-targets.ts `gateStepFor`, with its target `map` for a
   * `targets:` step): none, or one with nothing to run, when the diff
   * leaves what it reads alone; on an online machine with the capability it
   * `needs:`, else `refusal`, naming the changed paths that made it due.
   */
  const dueStep = (
    workspace: WorkspaceRow,
    projectId: string,
    step: DeclaredStep,
    touched: readonly string[],
    map: TargetMap | undefined
  ): { steps: GateStep[] } | GateRefusal => {
    const shaped = gateStepFor(step, touched, map);
    if ("steps" in shaped) {
      return shaped;
    }
    const { base, reads } = shaped;
    const { needs } = step;
    if (!needs) {
      return { steps: [base] };
    }
    const machine = gateMachine(workspace, projectId, needs);
    return machine
      ? { steps: [{ ...base, needs, machine: machine.machineId }] }
      : {
          refusal: capableRefusal(
            { name: step.name, needs },
            reads,
            lastCapable(db.listAgents(), needs)
          ),
          needs,
        };
  };

  return {
    gateOnce,
    gatePassOf,
    repositoryOn,
    gateSteps,
    passesOf,
  };
};
