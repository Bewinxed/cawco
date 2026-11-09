import type { CommandResult } from "@cawco/core/commands/controls";
import {
  CONTROL_FORGE_POST,
  type ForgeVerdict,
  type ForgeWrite,
} from "@cawco/core/forge-post";
import type { CheckoutMove, LandsMode } from "@cawco/core/injected";
import type { InstanceRow } from "@cawco/core/protocol";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import { shellQuote } from "@cawco/core/shell-quote";
import { workWords } from "@cawco/core/words/work";
import {
  type ChangedPath,
  type ChangeVersion,
  CONTROL_HOST_OUTPUTS,
  CONTROL_WORKSPACE_APPLY,
  CONTROL_WORKSPACE_CHANGES,
  type HostOutputListed,
  OUTPUTS_DIR,
  type WorkspaceChanges,
  type WorkspaceConflict,
} from "@cawco/core/workspace/controls";
import { ElysiaStatus } from "elysia";
import type { DbShape } from "./db";
import type { WorkItemRow, WorkspaceRow } from "./db/project-work";
import type { LandingPhase } from "./db/schema";
import type { WorkItemSubmission, WorkLanding } from "./db/stored-types";
import {
  createGate,
  failedWith,
  type Gate,
  type GateDeps,
  type GateHow,
  type GateRun,
  type StepOutcome,
  TREE_SHA,
} from "./gate";
import { capableWaitReason, GATE_FILE, projectShip } from "./gate-file";
import {
  type BranchOutcome,
  branchPushCheck,
  type Failed,
  type LandingTurn,
  land,
  landingQueue,
  pushBranch,
  type Refusal,
  reportedCommits,
  reportedDiffstat,
  reportedRange,
} from "./landing";
import { machineName } from "./machine-name";
import { CommandStopped, WouldWait } from "./machine-pause";
import { handle } from "./presenters/words";
import {
  FOLDER_FILE_LIMIT,
  type FolderCommits,
  writeFolderFiles,
} from "./project-folder";
import { projectRefusalOf, projectRootOf } from "./project-refusal";
import { shipLanded } from "./ship";
import { LIVE, WAIT_ITEM_MAX_MINUTES } from "./work-item-state";
import type { WorkspacesDeps } from "./workspaces";
import {
  GIT_TIMEOUT_MS,
  isFolderOverlay,
  isHostFolder,
  landingKey,
  outputsFolder,
  refOf,
  SCRATCH_OUTPUTS,
  SCRATCH_OUTPUTS_LIST,
  type ScratchOutput,
  scratchOutputsOf,
} from "./workspaces";

/** The line a parent's report carries about the item behind it. */
export const reportLine = (item: WorkItemRow): string =>
  LIVE.has(item.state)
    ? `\n\n[Work item ${handle(item.id)} is ${item.state} in workspace ${handle(item.workspaceId)}.]`
    : `\n\n[Work item ${handle(item.id)} is ${item.state} in workspace ${handle(item.workspaceId)}. A handoff to it continues this same session.]`;
/** Lines of diffstat a report keeps: the last, its summary, always among them. */
const DIFFSTAT_LINES = 40;
/** A full commit id, as a machine names one: never an option or a ref. */
const COMMIT_ID = /^[0-9a-f]{40}([0-9a-f]{24})?$/u;
/** The branch an item that lands `branch` or `pr` is pushed to: `cawco/tsk-12`. */
const landingBranch = (item: Pick<WorkItemRow, "id" | "taskId">) =>
  `cawco/${landingKey(item)}`;
export const MIB = 1024 * 1024;
/**
 * The shell that says of each output whether it is missing, a link, or a
 * file of some size. A folder is said file by file, so a link inside it is
 * refused and each file meets the size limit; a folder with no files in it
 * is missing.
 */
const outputsProbe = (outputs: string[]): string =>
  outputs
    .map(
      (path) =>
        `p=${shellQuote(path)}; if [ -L "$p" ]; then echo "link $p"; elif [ -d "$p" ]; then find "$p" -type l | while IFS= read -r f; do echo "link $f"; done; find "$p" -type f | while IFS= read -r f; do echo "size $(wc -c < "$f" | tr -d ' ') $f"; done; [ -n "$(find "$p" -type f | head -n 1)" ] || echo "missing $p"; elif [ ! -f "$p" ]; then echo "missing $p"; else echo "size $(wc -c < "$p" | tr -d ' ') $p"; fi`
    )
    .join("; ");
/**
 * The shell that lists the files to collect for one output, a path from the
 * workspace's root a line: the file itself, or every file under a folder.
 */
const outputFilesCommand = (path: string): string =>
  `p=${shellQuote(path)}; if [ -d "$p" ]; then find "$p" -type f | LC_ALL=C sort; else echo "$p"; fi`;
/**
 * What is wrong with the files in `$TMPDIR/outputs/`, a sentence each: a
 * link, a file past the folder's size limit, or a file that would land at
 * the path of a declared output's file (`declared`, paths from the
 * workspace's root), since both land under the item's assets folder.
 */
const scratchOutputsSaid = (
  scratch: readonly ScratchOutput[],
  declared: ReadonlySet<string>
): string[] => {
  const links = scratch.filter((one) => one.link).map((one) => one.path);
  const large = scratch
    .filter((one) => !one.link && one.size > FOLDER_FILE_LIMIT)
    .map((one) => `${one.path} is ${(one.size / MIB).toFixed(2)} MiB`);
  const twins = scratch
    .filter((one) => declared.has(one.path))
    .map((one) => one.path);
  return [
    ...(links.length > 0
      ? [
          `These files in ${SCRATCH_OUTPUTS} are links, and the hub copies files: ${links.join(", ")}. Write the file itself there.`,
        ]
      : []),
    ...(large.length > 0
      ? [
          `In ${SCRATCH_OUTPUTS}, ${large.join("; ")}; a file there stops at ${FOLDER_FILE_LIMIT / MIB} MiB.`,
        ]
      : []),
    ...(twins.length > 0
      ? [
          `These files in ${SCRATCH_OUTPUTS} would land where your declared outputs of the same path land: ${twins.join(", ")}. Rename one.`,
        ]
      : []),
  ];
};
/** The workspace-root paths of the files a declared outputs probe ({@link outputsProbe}) found. */
const declaredFilesOf = (stdout: string): Set<string> =>
  new Set(
    stdout
      .split("\n")
      .filter((line) => line.startsWith("size "))
      .map((line) => line.split(" ").slice(2).join(" ").replaceAll("//", "/"))
  );
/** What a probe's answer says is wrong with the outputs, a sentence each. */
const outputsSaid = (stdout: string): string[] => {
  const by = { missing: [] as string[], link: [] as string[] };
  const large: string[] = [];
  for (const line of stdout.split("\n")) {
    const [word, ...rest] = line.split(" ");
    if (word === "missing" || word === "link") {
      by[word].push(rest.join(" "));
    } else if (word === "size" && Number(rest[0]) > FOLDER_FILE_LIMIT) {
      large.push(
        `${rest.slice(1).join(" ")} is ${(Number(rest[0]) / MIB).toFixed(2)} MiB`
      );
    }
  }
  return [
    ...(by.missing.length > 0
      ? [
          `These outputs are not in your workspace: ${by.missing.join(", ")}; write each at its path from the workspace's root.`,
        ]
      : []),
    ...(by.link.length > 0
      ? [
          `These outputs are links, and the hub copies files: ${by.link.join(", ")}. Write the file itself at that path.`,
        ]
      : []),
    ...(large.length > 0
      ? [
          `${large.join("; ")}; an output stops at ${FOLDER_FILE_LIMIT / MIB} MiB.`,
        ]
      : []),
  ];
};
/** Where a workspace's checkout is: HEAD, and the tree it holds. */
interface CheckoutHead {
  commit: string;
  tree: string;
}
/** What a landing that pushed says of a project that declares no gate. */
const NO_CHECKS = "merged with no checks: this project declares none";
/**
 * A gate step's wait as its item's status says it: `the step “iOS build
 * compiles” is waiting: obelisk-of-light is paused until 18:52`, `… is
 * queued for the Mac's build slot behind …`; the wait alone when no step
 * waits. Before 2026-10-18 the step's name ran straight into the wait
 * ("iOS build compiles waiting: …").
 */
const stepWaitWords = (words: string, step: string | undefined): string =>
  step ? `the step “${step}” is ${words}` : words;
/** Whether a run fails: a step that failed, or one left unrun by one that did. */
const runFailed = (run: GateRun): boolean =>
  run.outcomes.some((outcome) => !outcome.passed);
/** A fenced block that no command output can close early. */
export const fenced = (text: string): string =>
  `\n\`\`\`\`\n${text.trimEnd()}\n\`\`\`\``;
/**
 * A failed gate run as the delegate reads it: `head`, which steps failed
 * and which they left unrun; `lines`, the steps', failures first, each
 * failure with its output.
 */
const failedRun = (run: GateRun): { head: string; lines: string } => {
  const failing = run.outcomes.filter(
    (outcome) => !(outcome.passed || outcome.unrun)
  );
  const unrun = run.outcomes.filter((outcome) => outcome.unrun);
  const passing = run.outcomes.filter((outcome) => outcome.passed);
  const names = (each: StepOutcome[]) =>
    each.map((outcome) => outcome.step.name).join(" and ");
  return {
    head: `${names(failing)} failed${unrun.length > 0 ? `, so ${names(unrun)} did not run` : ""}`,
    lines: [...failing, ...unrun, ...passing]
      .map(stepResultLine)
      .join("\n")
      .trimEnd(),
  };
};
/**
 * A step's line: its name, pass or fail, exit code and duration. A failure
 * carries its stdout tail under it; a pass is the line alone.
 */
const stepLine = ({
  step,
  passed,
  exitCode,
  durationMs,
  result,
  skipped,
  unrun,
  where,
  nothing,
}: StepOutcome): string => {
  if (nothing) {
    return `- ${step.name}: ${nothing}`;
  }
  if (skipped) {
    return `- ${step.name}: pass (not run again: ${skipped})`;
  }
  if (unrun) {
    return `- ${step.name}: not run (${unrun})`;
  }
  const line = `- ${step.name}: ${passed ? "pass" : "fail"} (exit ${exitCode}, ${(durationMs / 1000).toFixed(1)}s${where ? `, ${where}` : ""})`;
  // A pass is its line: its output is the report's length, not its news.
  return !passed && result.stdout.trim()
    ? `${line}${fenced(result.stdout)}`
    : line;
};
/** A gate run as the report lists it: each step; empty when it ran nothing. */
const gateLines = (run: GateRun): string =>
  run.outcomes.map(stepLine).join("\n").trimEnd();
/**
 * A finished landing's gate lines: its steps, or, for a project that
 * declares no gate, {@link NO_CHECKS} once it pushed something; empty
 * when it pushed nothing.
 */
const landingGateLines = (
  landing: Exclude<Landed, { kind: "retry" | "stopped" }>
): string => {
  if (landing.gate.declared) {
    return gateLines(landing.gate);
  }
  return landing.kind === "done" && landing.landed ? NO_CHECKS : "";
};
/** A step as the delegate reads it: a failure carries its stderr too. */
const stepResultLine = (outcome: StepOutcome): string =>
  !outcome.passed && outcome.result.stderr.trim()
    ? `${stepLine(outcome)}\nstderr:${fenced(outcome.result.stderr)}`
    : stepLine(outcome);
/**
 * The landing line of an item that landed on its base: where, what its turn
 * ran again after the turn's rebase (nothing when the branch had not moved
 * since it gated), and each time it stepped out of its turn. What its last
 * gate on top of the branch ran is the report's landing gate section.
 */
const landedLine = (
  base: string,
  landed: { rebased: boolean; sha: string },
  turn: GateRun | undefined,
  steps: string[]
): string => {
  const ran = turn?.outcomes
    .filter((each) => !each.nothing)
    .map((each) =>
      each.skipped
        ? `${each.step.name} not run again (${each.skipped})`
        : `${each.step.name} ${each.passed ? "passed" : "failed"}`
    )
    .join(", ");
  const after = landed.rebased
    ? `${base} had moved by its turn, so it rebased again${ran ? `: ${ran}` : ", with no merge checks to run"}`
    : `${base} had not moved by its turn, so nothing ran again`;
  const stepped =
    steps.length > 0
      ? `; it stepped out of its turn ${steps.length === 1 ? "once" : `${steps.length} times`} to run the merge checks again, the last time because ${steps.at(-1)}`
      : "";
  return `${workWords.landedOn(base)} at ${landed.sha.slice(0, 9)}, checked on top of ${base}; ${after}${stepped}.`;
};
/** The findings, numbered; nothing when there are none. */
export const findingsBlock = (
  findings: WorkItemSubmission["findings"]
): string =>
  findings?.length
    ? `\n\nFindings:\n${findings.map((finding, index) => `${index + 1}. ${finding.title}: ${finding.detail}`).join("\n")}`
    : "";
/**
 * What landing a finished item came to: done (with the pull request it
 * opened or found, landing `pr`), back to its session, or refused. `gate` is
 * the landing gate's run, for the report.
 */
type Landed =
  | {
      kind: "done";
      line: string;
      gate: GateRun;
      /** What it put where, when it pushed (the item's `landed`). */
      landed?: WorkLanding;
      prUrl?: string;
    }
  | { kind: "refused"; line: string; gate: GateRun; prUrl?: string }
  | { kind: "retry"; text: string }
  | { kind: "stopped"; text: string };
/**
 * What a landing that went writes on its item: what it put where and the
 * pull request it opened. A follow-up with nothing new to land keeps what
 * the item landed before.
 */
const landedFields = (
  landing: Landed
): { landed?: WorkLanding; prUrl?: string } =>
  landing.kind === "done"
    ? {
        ...(landing.landed ? { landed: landing.landed } : {}),
        ...(landing.prUrl ? { prUrl: landing.prUrl } : {}),
      }
    : {};
/** A landing its item's stop ended before it pushed (landing.ts `Stopped`): nothing landed, nothing reported. */
const stoppedLanding = (item: WorkItemRow): Landed => ({
  kind: "stopped",
  text: `${item.title} was stopped while it landed; nothing was landed or reported.`,
});
/** The text that hands uncommitted work back to the session, for a landing that takes only commits. */
const dirtyText = (files: string, where: string): string =>
  `Not landed: the workspace has changes that are not committed, new files included. The hub lands only commits, so landing now could leave ${where} without them. Commit them, delete them, or move scratch to $TMPDIR, then call finish_item again.${fenced(files)}`;
/** The text that hands failed merge checks back to the session. */
/** The paths a folder landing changed, as its report lists them. */
const changedList = (changed: readonly ChangedPath[]): string =>
  fenced(
    changed
      .map(
        (each) =>
          `${each.change === "delete" ? "deleted" : "written"} ${each.path}`
      )
      .join("\n")
  );
/** One version of a conflicting file, as the conflict's text shows it. */
const versionWords = (version: ChangeVersion): string => {
  switch (version.kind) {
    case "text":
      return fenced(version.text);
    case "binary":
      return ` binary, ${version.bytes} bytes`;
    case "large":
      return ` ${version.bytes} bytes, too large to show here`;
    case "link":
      return ` a link to ${version.target}`;
    case "folder":
      return " a folder";
    case "gone":
      return " deleted";
    default:
      return String(version);
  }
};
/**
 * A folder landing's conflicts as the delegate and the owner read them:
 * each path both changed, the version in the folder now and the delegate's,
 * with no base to merge from. Nothing was written.
 */
const conflictText = (
  conflicts: readonly WorkspaceConflict[],
  folder: string
): string =>
  [
    `Not landed: ${conflicts.length === 1 ? "a file" : `${conflicts.length} files`} you changed ${conflicts.length === 1 ? "was" : "were"} changed in ${folder} too since you started, so nothing was written there. Each is below as the folder has it now and as you left it; there is no common version to merge from. Write the version that should land (yours, the folder's, or both merged) and call finish_item again: the folder's version as it stands is what your next landing is read against.`,
    ...conflicts.map(
      (each) =>
        `### ${each.path}\n\nIn ${folder} now:${versionWords(each.yours)}\n\nYours:${versionWords(each.delegate)}`
    ),
  ].join("\n\n");
const gateFailedText = (run: GateRun, where: string): string => {
  const { head, lines } = failedRun(run);
  return `Not landed: the merge checks ran on ${where}, and ${head}. Fix it, commit, and call finish_item again.\n\n${lines}`;
};
/**
 * A refused landing's line, its first sentence what failed: the step git was
 * on, from which machine, and a branch that moved before every push, or a
 * push the boundary cut off, when the state after it says so. Then git's
 * words, and where the commits are.
 */
const refusedLine = (
  refusal: Refusal,
  landing: { head: "Not landed" | "Not pushed"; target: string },
  workspace: WorkspaceRow,
  machine: string
): string => {
  const { head, target } = landing;
  const step: Record<Refusal["step"], string> = {
    fetch: `the fetch of origin/${workspace.base}`,
    rebase: `the rebase onto origin/${workspace.base}`,
    "push check": `the push check (git push --dry-run to ${target}, before any merge check)`,
    push: `the push to ${target}`,
    read: "reading the workspace's git",
  };
  let said = `${step[refusal.step]} on ${machine} failed`;
  if (refusal.cause === "taken") {
    said = `${target} on origin was moved by someone other than the hub, so it was not replaced`;
  } else if (refusal.cause === "race") {
    said = `${target} moved on origin before each of the hub's ${refusal.tries} pushes, so every one was turned down as behind it`;
  } else if (refusal.cause === "cut-off") {
    said = `${step.push} was cut off, and ${target} does not hold the commits`;
  } else if (refusal.step === "push check") {
    said = `${step["push check"]} from ${machine} was refused, so no merge check ran`;
  } else if (refusal.step === "push") {
    said = `${step.push} was refused`;
  }
  return `${head}: ${said}.${fenced(refusal.detail)}\nThe commits are on branch ${workspace.branch} in workspace ${handle(workspace.id)}.`;
};
/**
 * Why a finished item that passed its landing gate fails, when it does: the
 * landing's line (its first sentence the step that failed), or, once it
 * landed, the line on the outputs that did not arrive.
 */
const failureOf = (
  landing: Exclude<Landed, { kind: "retry" | "stopped" }>,
  collected: { ok: boolean; line: string }
): string | undefined => {
  if (landing.kind !== "done") {
    return landing.line;
  }
  return collected.ok ? undefined : collected.line.trim();
};
/**
 * The landing gate's section of a report: its lines under their heading;
 * nothing for a landing with no gate.
 */
const gateSection = (
  landing: Exclude<Landed, { kind: "retry" | "stopped" }>
): string => {
  const lines = landingGateLines(landing);
  return lines ? `\n\n${workWords.gateHeading}\n${lines}` : "";
};
/**
 * A finished item's report to its parent: what it said it did (its own
 * report, quoting what it ran), the landing gate's lines, how it landed and
 * its outputs, then `tail` (commits, diffstat, findings). A failure leads
 * it, so the parent reads why before what.
 */
const finishedReport = (
  summary: string,
  landing: Exclude<Landed, { kind: "retry" | "stopped" }>,
  collected: { ok: boolean; line: string },
  tail: string
): string => {
  const failure = failureOf(landing, collected);
  const head = `${summary}${gateSection(landing)}`;
  if (!failure) {
    return `${head}\n\n${landing.line}${collected.line}${tail}`;
  }
  const landed =
    landing.kind === "done" ? `\n\n${landing.line}` : collected.line;
  return `${failure}\n\n${head}${landed}${tail}`;
};
/**
 * What `finish_item` answers once a landing ended its item: done, or failed
 * because it could not land or its outputs did not arrive. `gateSaid` is the
 * landing gate's lines, `held` the words on a group's held report.
 */
const landedText = (
  landing: Exclude<Landed, { kind: "retry" | "stopped" }>,
  collected: { ok: boolean; line: string },
  gateSaid: string,
  held: string
): { done: boolean; text: string } => {
  if (landing.kind !== "done") {
    return {
      done: false,
      text: `The work could not land. ${landing.line}${collected.line}\n\nThe item has failed and your parent has the details. End your turn.`,
    };
  }
  return collected.ok
    ? {
        done: true,
        text: `${landing.line}${collected.line}${gateSaid}\n\nThe item is done${held}. End your turn.`,
      }
    : {
        done: false,
        text: `${landing.line} But the outputs did not arrive.${collected.line}\n\nThe item has failed and your parent has the details. End your turn.`,
      };
};
/** A push to an item's own branch that did not happen, as its landing. */
const unpushed = (
  pushed: Exclude<BranchOutcome, { kind: "pushed" | "stopped" }>,
  workspace: WorkspaceRow,
  branch: string,
  lands: LandsMode,
  machine: string,
  gate: GateRun
): Landed => {
  switch (pushed.kind) {
    case "dirty":
      return { kind: "retry", text: dirtyText(pushed.files, branch) };
    case "nothing":
      return {
        kind: "done",
        gate,
        line: `Nothing to push: ${workspace.base} already holds every commit in this workspace${lands === "pr" ? ", so no pull request was opened" : ""}.`,
      };
    case "no-remote":
      return {
        kind: "done",
        gate,
        line: "Not pushed: this workspace's repository has no remote.",
      };
    case "refused":
      return {
        kind: "refused",
        gate,
        line: refusedLine(
          pushed,
          { head: "Not pushed", target: `branch ${branch}` },
          workspace,
          machine
        ),
      };
  }
};

/**
 * The fields that say an item's landing is over: no landing under way and no
 * submission waiting. `update` clears the landing's phase with them.
 */
export const LANDING_ENDED = { landingSince: null, submission: null } as const;

/**
 * What a landing run and its gate read of the hub that work items read
 * nothing of: the hub hands it to createWorkItems as one `forLandings`,
 * passed on whole.
 */
export interface LandingsHub extends Pick<GateDeps, "machineFree"> {
  /** The machine the hub runs on, once read (server.ts `ownMachineIdRead`): where a project ships from (ship.ts). */
  readonly hubMachineId: () => string | undefined;
  /**
   * Where a reader opens a session in the dashboard: the link a pull request
   * carries back, and each landed commit's `Agent-Logs-Url` trailer.
   */
  readonly sessionUrl: (instanceId: string) => string;
  /** A task's title as its project's index has it: a pull request's title. */
  readonly taskTitle?: (
    projectId: string,
    taskId: string
  ) => string | undefined;
}

interface LandingRunDeps
  extends
    LandingsHub,
    Pick<WorkspacesDeps, "call" | "command" | "db">,
    Pick<GateDeps, "machinePaused" | "online" | "update" | "workspaces"> {
  readonly closeTurn: (item: WorkItemRow, turnOver: boolean) => void;
  readonly declareWait: (
    item: WorkItemRow,
    minutes: number,
    reason: string
  ) => WorkItemRow;
  readonly finish: (
    item: WorkItemRow,
    change: Parameters<DbShape["updateWorkItem"]>[1],
    how?: { stopped?: boolean }
  ) => WorkItemRow;
  readonly heldForGroup: (ended: WorkItemRow) => boolean;
  readonly published: (
    item: WorkItemRow | undefined
  ) => WorkItemRow | undefined;
  readonly report: (
    row: InstanceRow,
    body: string,
    failed: boolean,
    notice?: boolean,
    headline?: string,
    outputs?: string[]
  ) => void;
}

export const createLandingRun = ({
  call,
  closeTurn,
  command,
  db,
  declareWait,
  finish,
  heldForGroup,
  hubMachineId,
  machineFree,
  machinePaused,
  online,
  published,
  report,
  sessionUrl,
  taskTitle,
  update,
  workspaces,
}: LandingRunDeps) => {
  /**
   * Each landing this hub process runs, by item: aborted as its item ends
   * ({@link finish}), which cancels every command the landing has running,
   * its gate's steps on every machine included, through the runner that
   * started each (machine-commands.ts `runOnMachine`, `how.stop`). Before 2026-10-18 a
   * stop ended a landing only at its next turn or push: three stopped items'
   * iOS steps waited on in the Mac's queue, one for 1 h 22 m.
   */
  const landingStops = new Map<string, AbortController>();
  /** Whether this hub process runs item `itemId`'s landing now ({@link settleLanding}): a resume leaves it to that run. */
  const landingRuns = (itemId: string): boolean => landingStops.has(itemId);
  /** Item `itemId`'s landing, if this hub runs one, cancelled as its item ends: every command of it stops ({@link landingStops}). */
  const stopLanding = (itemId: string): void => {
    landingStops.get(itemId)?.abort();
  };
  /**
   * Items whose landing waits for something now: what its status says, and
   * since when. In memory: a hub that starts says it again as the landing
   * it resumes waits (work-items.ts `resumeLandings`).
   */
  const landingWaits = new Map<string, { words: string; since: number }>();
  /** Where `item`'s landing stands now ({@link LandingPhase}), stored as it moves there. */
  const landingAt = (item: WorkItemRow, phase: LandingPhase): void => {
    if (db.workItem(item.id)?.landingPhase !== phase) {
      update(item.id, { landingPhase: phase });
    }
  };
  /**
   * What an item's landing waits for, as its status says it (WorkItemSummary
   * `checkQueue`): a shared slot ("queued for …"), its machine's pause
   * ("waiting: Omars-MacBook-Pro is paused until 00:57"), another command in
   * its folder, its gate on top of the branch ("gating on top of main: the
   * step “iOS build compiles” is waiting: Omars-MacBook-Pro is paused until
   * 00:57", {@link stepWaitWords}), or its turn
   * to land ("queued to land on main behind …"); null once it waits no more.
   * Every wait between `finish_item` and the item's
   * outcome comes here: before 2026-10-16 only a step's own slot and pause
   * waits did, and items queued to land sat with nothing said.
   */
  const landingWait = (itemId: string, words: string | null): void => {
    if (words) {
      landingWaits.set(itemId, {
        words,
        since: landingWaits.get(itemId)?.since ?? Date.now(),
      });
    } else if (!landingWaits.delete(itemId)) {
      return;
    }
    published(db.workItem(itemId));
  };
  /** One landing at a time per repository and branch (landing.ts). */
  const landings = landingQueue();

  /** Ends `id`'s landing: no landing under way and no submission waiting ({@link LANDING_ENDED}). */
  const endLanding = (id: string): WorkItemRow | undefined =>
    update(id, LANDING_ENDED);
  /**
   * Whether the landing `item` is in was stopped (landing.ts `LandingDeps.stopped`):
   * the item ended (a stop cancels it and clears its `landingSince`), or its
   * row marks a landing other than the one `item` was read in.
   */
  const landingStopped = (item: WorkItemRow): (() => boolean) => {
    const since = item.landingSince?.getTime();
    return () => {
      const now = db.workItem(item.id);
      return !(
        now &&
        LIVE.has(now.state) &&
        since !== undefined &&
        now.landingSince?.getTime() === since
      );
    };
  };
  /**
   * The report's commits and diffstat: what `landing` put on the item's
   * base, or, where it put nothing there, what the workspace holds that the
   * base does not (landing.ts {@link reportedRange}). Each command prints
   * only what the report shows; one git could not answer says so.
   */
  const reportedChanges = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    landing: Exclude<Landed, { kind: "retry" | "stopped" }>
  ): Promise<string> => {
    // A folder has no commits: its landing line names every path it changed.
    if (isFolderOverlay(workspace)) {
      return "";
    }
    const git = (cmd: string) => runIn(workspace, item)(cmd, GIT_TIMEOUT_MS);
    const range = reportedRange(
      `origin/${workspace.base}`,
      landing.kind === "done" ? landing.landed : undefined
    );
    const [commits, diffstat] = await Promise.all([
      git(reportedCommits(range)),
      git(reportedDiffstat(range, DIFFSTAT_LINES)),
    ]);
    if (commits.exitCode !== 0) {
      return `\n\nCommits:${fenced(`git could not list them: ${failedWith(commits)}`)}`;
    }
    if (!commits.stdout.trim()) {
      return `\n\nCommits:${fenced("(none)")}\n\nDiffstat:${fenced("(no changes)")}`;
    }
    return `\n\nCommits:${fenced(commits.stdout.trim())}\n\nDiffstat:${fenced(diffstat.stdout.trim() || "(no changes)")}`;
  };
  /**
   * Runs a command in the item's workspace, inside its boundary, with every
   * `git` in it run as `safe-git.ts` says: no hook or config the workspace
   * wrote runs for the hub. Each wait it makes (its machine's pause, another
   * command in the folder, a boundary starting) is the item's status
   * ({@link landingWait}); `noWait`, in a landing turn, it makes none and
   * throws {@link WouldWait} instead. The item's end cancels it while its
   * landing runs ({@link landingStops}), all but a push (`lands`), which
   * runs to its end.
   */
  const runIn =
    (workspace: WorkspaceRow, item: WorkItemRow) =>
    (
      cmd: string,
      timeoutMs: number,
      noWait = false,
      lands = false,
      moves?: string
    ): Promise<CommandResult> =>
      command(
        workspace.machineId,
        workspace.path,
        `${SAFE_GIT_SHELL}${cmd}`,
        timeoutMs,
        refOf(workspace),
        {
          onWait: (words) => landingWait(item.id, words),
          noWait,
          ...(moves ? { moves } : {}),
          ...(lands ? {} : { stop: landingStops.get(item.id)?.signal }),
        }
      );
  const gateRun = createGate({
    call,
    command,
    db,
    machineFree,
    machinePaused,
    online,
    update,
    workspaces,
    landingStop: (itemId) => landingStops.get(itemId)?.signal,
    runIn,
  });

  /** HEAD of the workspace's checkout and the tree it holds, read whatever stops the item's landing; nothing when git cannot say. */
  const headOf = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<CheckoutHead | undefined> => {
    const read = await runIn(workspace, item)(
      "git rev-parse HEAD HEAD^{tree}",
      GIT_TIMEOUT_MS,
      false,
      true
    );
    const [commit = "", tree = ""] = read.stdout.trim().split("\n");
    return read.exitCode === 0 && COMMIT_ID.test(commit) && TREE_SHA.test(tree)
      ? { commit, tree }
      : undefined;
  };
  /**
   * The landing rebased workspace `id`'s commits onto origin's `base`, HEAD
   * going `from` → `to` (landing.ts `onBase`, landed or not): its row's
   * `movedUntold` says so to the next message its session reads
   * (work-items.ts `movedTold`), when the move changed a file. A stamp
   * alone (landing.ts `stampCommand`, every commit's first landing) rewrites
   * each commit's message and leaves the tree as it was: HEAD moved, no file
   * did, and there is nothing to install again, so it is told nothing. One
   * still untold keeps where it started and follows HEAD: a clone cut again
   * stays the new clone it is, at `to` now; an earlier landing's move keeps
   * its `from`.
   */
  const movedByLanding = (
    id: string,
    base: string,
    from: CheckoutHead,
    to: CheckoutHead
  ): void => {
    const [row] = db.workspacesNamed(id);
    const prior = row?.movedUntold ?? undefined;
    if (!prior && from.tree === to.tree) {
      return;
    }
    const move: CheckoutMove =
      prior?.kind === "recut"
        ? { ...prior, commit: to.commit }
        : {
            kind: "landing",
            branch: base,
            from: prior?.from ?? from.commit,
            to: to.commit,
          };
    db.updateWorkspace(id, { movedUntold: move });
  };
  /**
   * How an item's landing gate runs in its landing on `base` (landing.ts):
   * in its turn it never waits; while it gates on top of the branch, its
   * status says so (and why, when it stepped out of its turn: `stepped`),
   * with what each step waits for there.
   */
  const landingHow = (
    itemId: string,
    base: string,
    turning: boolean,
    stepped: string | undefined
  ): GateHow => {
    if (turning) {
      return { inTurn: true, say: (words) => landingWait(itemId, words) };
    }
    const gating = stepped
      ? `stepped out of its turn to land (${stepped}), so running the merge checks again on top of ${base}`
      : `running the merge checks on top of ${base}`;
    return {
      inTurn: false,
      say: (words, step) =>
        landingWait(
          itemId,
          words ? `${gating}: ${stepWaitWords(words, step)}` : gating
        ),
    };
  };
  /** The item in the landing queue: named as `“title” (id)`, its wait its status. */
  const turnOf = (item: WorkItemRow): LandingTurn => ({
    who: `“${item.title}” (${item.id.slice(0, 8)})`,
    onWait: (words) => landingWait(item.id, words),
  });
  /**
   * Lands a finished item's commits on its workspace's base branch
   * (landing.ts): it gates on top of the branch outside the queue, the
   * landing gate's steps run on the rebased tree, its status saying so and
   * what each step waits for there; then it takes its turn, where only the
   * steps whose inputs the turn's rebase moved run again, and none waits.
   * Answers the line the report and the delegate read when the item can be
   * done; the text that hands it back to its delegate (`retry`: uncommitted
   * work, a conflict, a gate that failed); or the line that says why it
   * could not land (`refused`).
   */
  const landOnBase = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    gate: Gate
  ): Promise<Landed> => {
    const { base } = workspace;
    /** The last gate's run on top of the branch and the turn's, for the report. */
    const runs: { gate: GateRun; turn?: GateRun } = {
      gate: { declared: gate.declared, outcomes: [] },
    };
    /** The times it stepped out of its turn, and why the last time. */
    const stepped: string[] = [];
    /** The landing gate on the tree the workspace holds. */
    const onBaseGate = async (
      turning: boolean
    ): Promise<Failed<GateRun> | undefined> => {
      const how = landingHow(item.id, base, turning, stepped.at(-1));
      how.say(null);
      landingAt(item, turning ? "turn" : "gating");
      const run = await gateRun.gateOnce(
        workspace,
        item,
        gate,
        turning
          ? `in its turn to land on ${base}`
          : `while it ran the merge checks on top of ${base}`,
        how
      );
      if (runFailed(run)) {
        return { kind: "gate-failed", failing: run };
      }
      if (turning) {
        runs.turn = run;
      } else {
        runs.gate = run;
      }
      // Gated, it says next that it waits its turn, or nothing when it takes
      // it at once. A failure's or an error's words go as settleLanding ends.
      landingWait(item.id, null);
    };
    const before = await headOf(workspace, item);
    const outcome = await land<GateRun>(base, {
      run: runIn(workspace, item),
      logsUrl: sessionUrl(item.instanceId),
      turn: turnOf(item),
      check: onBaseGate,
      onStepOut: (words) => {
        stepped.push(words);
      },
      queue: landings,
      skip: item.outputs ?? [],
      stopped: landingStopped(item),
    });
    const after = await headOf(workspace, item);
    if (before && after && before.commit !== after.commit) {
      movedByLanding(workspace.id, base, before, after);
    }
    const ran = runs.gate;
    switch (outcome.kind) {
      case "stopped":
        return stoppedLanding(item);
      case "landed": {
        const gated = await gateRun.gatePassOf(
          workspace,
          item,
          outcome.sha,
          runs.turn ?? ran
        );
        return {
          kind: "done",
          gate: ran,
          landed: {
            sha: outcome.sha,
            onto: outcome.onto,
            ...(gated ? { gate: gated } : {}),
          },
          line: landedLine(base, outcome, runs.turn, stepped),
        };
      }
      case "nothing":
        return {
          kind: "done",
          gate: ran,
          line: `Nothing to land: ${base} already holds every commit in this workspace.`,
        };
      case "no-remote":
        return {
          kind: "done",
          gate: ran,
          line: "Not landed: this workspace's repository has no remote.",
        };
      case "dirty":
        return { kind: "retry", text: dirtyText(outcome.files, base) };
      case "conflict":
        return {
          kind: "retry",
          text: `Not landed: your commits conflict with origin/${base} in:${fenced(outcome.files)}\nThe hub undid its rebase. Rebase onto origin/${base} yourself, resolve the conflicts, commit, and call finish_item again.`,
        };
      case "gate-failed":
        return {
          kind: "retry",
          text: gateFailedText(
            outcome.failing,
            `your commits rebased onto origin/${base}, which your branch is now on top of`
          ),
        };
      case "refused":
        return {
          kind: "refused",
          gate: ran,
          line: refusedLine(
            outcome,
            { head: "Not landed", target: base },
            workspace,
            machineName(db, workspace.machineId)
          ),
        };
    }
  };
  /**
   * The report of an item that just ended through `finish_item`, to its parent;
   * or, for a done item of a group, held for the group's one report
   * (work-items.ts `settleGroup`) — a failure reports at once. Answers what the
   * delegate is told of a hold.
   */
  const reportOrHold = (
    row: InstanceRow,
    ended: WorkItemRow,
    body: string,
    headline: string,
    outputs: string[]
  ): string => {
    if (heldForGroup(ended)) {
      return `; your parent hears of it with the rest of group “${ended.group}”`;
    }
    report(
      row,
      `${body}${reportLine(ended)}`,
      ended.state === "failed",
      false,
      headline,
      outputs
    );
    return "";
  };
  /** A pull request's body: what the delegate said it did, the landing gate's lines, and where its report is. */
  const pullRequestBody = (
    item: WorkItemRow,
    summary: string,
    gate: GateRun
  ): string => {
    const what = item.taskId
      ? `an attempt at the task “${item.title}”`
      : `work item ${handle(item.id)}`;
    const lines = gate.declared ? gateLines(gate) : NO_CHECKS;
    return [
      summary.trim(),
      ...(lines ? [`Merge checks, run by the CawCo hub:\n${lines}`] : []),
      `This is ${what}; its report and transcript: ${sessionUrl(item.instanceId)}`,
    ].join("\n\n");
  };
  /**
   * The commit the hub last pushed to `item`'s own branch
   * ({@link landingBranch}): the newest branch landing of every attempt at
   * its task in its project, the item's own earlier rounds among them, or of
   * the item alone when it is no task's. Undefined: the hub never pushed there.
   */
  const lastBranchPush = (item: WorkItemRow): string | undefined => {
    const now = db.workItem(item.id) ?? item;
    const sharing =
      now.projectId && now.taskId
        ? db
            .projectAttempts(now.projectId)
            .filter((attempt) => attempt.taskId === now.taskId)
        : [now];
    let last: WorkLanding | undefined;
    for (const { landed } of sharing) {
      if (
        landed &&
        landed.onto === null &&
        (!last || (landed.at ?? 0) > (last.at ?? 0))
      ) {
        last = landed;
      }
    }
    return last?.sha;
  };
  /**
   * Lands an item that lands `branch` or `pr`: its commits pushed as they are
   * to `cawco/<task or item>`, and for `pr`, a pull request against the base
   * branch opened, or the open one found. gh turning the pull request down
   * refuses the landing in gh's words. `gate` is the landing gate's run at
   * finish_item, on the tree pushed.
   */
  const landOnBranch = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    summary: string,
    gate: GateRun
  ): Promise<Landed> => {
    const { base } = workspace;
    const branch = landingBranch(item);
    const pushed = await pushBranch(base, branch, {
      last: lastBranchPush(item),
      logsUrl: sessionUrl(item.instanceId),
      run: runIn(workspace, item),
      turn: turnOf(item),
      queue: landings,
      skip: item.outputs ?? [],
      stopped: landingStopped(item),
    });
    if (pushed.kind === "stopped") {
      return stoppedLanding(item);
    }
    if (pushed.kind !== "pushed") {
      return unpushed(
        pushed,
        workspace,
        branch,
        item.lands,
        machineName(db, workspace.machineId),
        gate
      );
    }
    const at = `${branch} at ${pushed.sha.slice(0, 9)}`;
    const landed: WorkLanding = {
      sha: pushed.sha,
      onto: null,
      at: Date.now(),
    };
    if (item.lands !== "pr") {
      return {
        kind: "done",
        gate,
        landed,
        line: `Pushed to branch ${at} on origin; ${base} is untouched.`,
      };
    }
    return pullRequestFor(workspace, item, summary, gate, at, landed);
  };
  /**
   * Opens the pull or merge request for an item's pushed branch, or finds
   * the open one: the workspace's machine makes it through the forge adapter
   * of its origin's host with its own sign-in there (agent forges/,
   * `CONTROL_FORGE_POST`). A forge that turns it down refuses the landing in
   * its words.
   */
  const pullRequestFor = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    summary: string,
    gate: GateRun,
    at: string,
    landed: WorkLanding
  ): Promise<Landed> => {
    const { base } = workspace;
    const branch = landingBranch(item);
    const machine = machineName(db, workspace.machineId);
    const title =
      (item.projectId && item.taskId
        ? taskTitle?.(item.projectId, item.taskId)
        : undefined) ?? item.title;
    const origin = (
      await runIn(workspace, item)("git remote get-url origin", GIT_TIMEOUT_MS)
    ).stdout.trim();
    const write: ForgeWrite = {
      op: "pull_request",
      base,
      head: branch,
      title,
      body: pullRequestBody(item, summary, gate),
    };
    let verdict: ForgeVerdict;
    try {
      verdict = (await call(workspace.machineId, CONTROL_FORGE_POST, [
        { repo: origin, write },
      ])) as ForgeVerdict;
    } catch (error) {
      verdict = {
        kind: "refused",
        why: error instanceof Error ? error.message : String(error),
      };
    }
    const made =
      verdict.kind === "made" ? verdict.made : { ok: false, said: verdict.why };
    if (!(made.ok && made.url)) {
      return {
        kind: "refused",
        gate,
        line: `Pushed to branch ${at}, but ${machine} did not open the pull or merge request. It said:${fenced(made.said)}\nOpen it by hand from ${branch} into ${base}, or start the task again once ${machine} can.`,
      };
    }
    return {
      kind: "done",
      gate,
      landed,
      prUrl: made.url,
      line: made.existing
        ? `Pushed to branch ${at}, which updates its open pull or merge request: ${made.url}`
        : `Pushed to branch ${at} and opened a pull or merge request against ${base}: ${made.url}`,
    };
  };
  /**
   * Lands a finished item the way it lands: on its base (the gate's steps
   * run on top of it, {@link landOnBase}), on a branch, through a pull
   * request, or not at all. `earlier` is the gate's run at finish_item: every
   * step for a branch or a pull request, none for an item landing on its base.
   */
  const landFinished = (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    gate: Gate,
    earlier: GateRun,
    summary: string
  ): Promise<Landed> => {
    switch (item.lands) {
      case "none":
        return Promise.resolve({
          kind: "done",
          gate: earlier,
          line: item.outputs?.length
            ? "Nothing pushed: this item lands none, and its outputs are what it hands in."
            : "Nothing pushed: this item lands none.",
        });
      case "branch":
      case "pr":
      case "main":
        // A folder lands by its change set into the folder itself; a
        // repository by git, on its base or a branch of its own.
        if (isFolderOverlay(workspace)) {
          return landFolder(workspace, item, gate);
        }
        return item.lands === "main"
          ? landOnBase(workspace, item, gate)
          : landOnBranch(workspace, item, summary, earlier);
    }
  };
  /**
   * Lands a finished folder item's change set in its folder (agent
   * layer.ts): the change set read against the folder as it is now, any
   * path changed there too since the delegate's start a conflict that lands
   * nothing and goes back to the delegate with both versions; then the
   * folder's checks (its project's gate.md, as a repository's merge checks
   * are), run in the workspace's view of the folder; then the change set put
   * into the folder by the agent on its machine, outside every wall, which
   * scans for conflicts once more first. The services its work touched are
   * the delegate's report's to name, and its parent's to restart.
   */
  const landFolder = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    gate: Gate
  ): Promise<Landed> => {
    const ref = refOf(workspace);
    const read = (await call(workspace.machineId, CONTROL_WORKSPACE_CHANGES, [
      ref,
    ])) as WorkspaceChanges;
    const ran: GateRun = { declared: gate.declared, outcomes: [] };
    if (read.conflicts.length > 0) {
      return { kind: "retry", text: conflictText(read.conflicts, read.folder) };
    }
    if (read.changed.length === 0) {
      return {
        kind: "done",
        gate: ran,
        line: `Nothing to land: ${read.folder} already holds every change in this workspace.`,
      };
    }
    landingAt(item, "gating");
    const how: GateHow = {
      inTurn: false,
      say: (words, step) =>
        landingWait(
          item.id,
          words
            ? `running the folder's checks: ${stepWaitWords(words, step)}`
            : "running the folder's checks"
        ),
    };
    how.say(null);
    const checked = await gateRun.gateOnce(
      workspace,
      item,
      gate,
      `while it ran the folder's checks on its changes to ${read.folder}`,
      how
    );
    landingWait(item.id, null);
    if (runFailed(checked)) {
      return {
        kind: "retry",
        text: gateFailedText(
          checked,
          `your changes over ${read.folder} as it is now`
        ),
      };
    }
    const applied = (await call(workspace.machineId, CONTROL_WORKSPACE_APPLY, [
      ref,
    ])) as { applied: number; conflicts: WorkspaceConflict[] };
    if (applied.conflicts.length > 0) {
      return {
        kind: "retry",
        text: conflictText(applied.conflicts, read.folder),
      };
    }
    return {
      kind: "done",
      gate: checked,
      line: `Landed: ${applied.applied} ${applied.applied === 1 ? "path" : "paths"} of this workspace's changes are in ${read.folder} on ${machineName(db, workspace.machineId)}.${changedList(read.changed)}`,
    };
  };
  /**
   * Whether each of the item's outputs is in its workspace: a file, or a
   * folder of files (no link, which could lead anywhere), each within the
   * size the project's folder takes; and, for an item of a project, whether
   * what it left in `$TMPDIR/outputs/` can be copied ({@link
   * scratchOutputsSaid}). The text that sends the item back when one is
   * not; else nothing.
   */
  const outputsProblem = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<string | undefined> => {
    const outputs = item.outputs ?? [];
    const result =
      outputs.length > 0
        ? await runIn(workspace, item)(outputsProbe(outputs), GIT_TIMEOUT_MS)
        : { exitCode: 0, stdout: "", stderr: "" };
    if (result.exitCode !== 0) {
      throw new Error(
        `the hub could not look for the item's outputs: ${failedWith(result)}`
      );
    }
    const scratch = item.projectId ? await scratchOutputs(workspace, item) : [];
    const problems = [
      ...outputsSaid(result.stdout),
      ...scratchOutputsSaid(scratch, declaredFilesOf(result.stdout)),
    ];
    return problems.length > 0
      ? `Not landed: the item's outputs are not ready. ${problems.join(" ")} Then call finish_item again.`
      : undefined;
  };
  /**
   * What the workspace's `$TMPDIR/outputs/` holds ({@link
   * SCRATCH_OUTPUTS_LIST}), read inside its boundary; a host-scope one's
   * listed on its host ({@link CONTROL_HOST_OUTPUTS}), as it stands.
   */
  const scratchOutputs = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<ScratchOutput[]> => {
    if (isHostFolder(workspace)) {
      const read = await workspaces.onHostScratch<{
        listed: HostOutputListed[];
      }>(workspace, CONTROL_HOST_OUTPUTS, [{ id: workspace.id, read: false }], {
        listed: [],
      });
      return read.listed;
    }
    const listed = await runIn(workspace, item)(
      SCRATCH_OUTPUTS_LIST,
      GIT_TIMEOUT_MS
    );
    if (listed.exitCode !== 0) {
      throw new Error(
        `${SCRATCH_OUTPUTS} could not be listed: ${failedWith(listed)}`
      );
    }
    return scratchOutputsOf(listed.stdout);
  };
  /**
   * The files of `$TMPDIR/outputs/` read from the workspace, each at its
   * path under it within the item's assets `folder`: `$TMPDIR/outputs/x.md`
   * lands at `assets/<item>/x.md`. Links are not read. A host-scope one's
   * are read on its host as they stand ({@link CONTROL_HOST_OUTPUTS}): its
   * scratch dir is no boundary's.
   */
  const scratchOutputFiles = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    folder: string
  ): Promise<{ path: string; content: Uint8Array }[]> => {
    if (isHostFolder(workspace)) {
      const read = await workspaces.hostOutputsRead(workspace);
      return read.files.map((one) => ({
        path: `${folder}/${one.path}`,
        content: Buffer.from(one.content, "base64"),
      }));
    }
    const files: { path: string; content: Uint8Array }[] = [];
    for (const one of await scratchOutputs(workspace, item)) {
      if (one.link) {
        continue;
      }
      const read = await runIn(workspace, item)(
        `base64 < "$TMPDIR/${OUTPUTS_DIR}/"${shellQuote(one.path)}`,
        GIT_TIMEOUT_MS
      );
      if (read.exitCode !== 0) {
        throw new Error(
          `${SCRATCH_OUTPUTS}${one.path} could not be read: ${failedWith(read)}`
        );
      }
      files.push({
        path: `${folder}/${one.path}`,
        content: Buffer.from(read.stdout, "base64"),
      });
    }
    return files;
  };
  /**
   * One output's files read from the workspace, each at its whole path from
   * the workspace's root under the item's assets `folder` (so two folders of
   * one name never merge): the file itself, or every file of a folder, its
   * subfolders' included.
   */
  const outputFiles = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    output: string,
    folder: string
  ): Promise<{ path: string; content: Uint8Array }[]> => {
    const listed = await runIn(workspace, item)(
      outputFilesCommand(output),
      GIT_TIMEOUT_MS
    );
    if (listed.exitCode !== 0) {
      throw new Error(`${output} could not be listed: ${failedWith(listed)}`);
    }
    const files: { path: string; content: Uint8Array }[] = [];
    for (const path of listed.stdout.split("\n").filter(Boolean)) {
      const read = await runIn(workspace, item)(
        `base64 < ${shellQuote(path)}`,
        GIT_TIMEOUT_MS
      );
      if (read.exitCode !== 0) {
        throw new Error(`${path} could not be read: ${failedWith(read)}`);
      }
      files.push({
        path: `${folder}/${path}`,
        content: Buffer.from(read.stdout, "base64"),
      });
    }
    return files;
  };
  /**
   * The item's outputs, declared and in `$TMPDIR/outputs/`, read from its
   * workspace and written into its project's folder under its assets folder
   * in one commit (project-folder.ts); null when there are none.
   */
  const copyOutputs = async (
    workspace: WorkspaceRow,
    item: WorkItemRow & { projectId: string }
  ): Promise<FolderCommits | null> => {
    const folder = outputsFolder(item);
    const files: { path: string; content: Uint8Array }[] = [];
    for (const output of item.outputs ?? []) {
      files.push(...(await outputFiles(workspace, item, output, folder)));
    }
    files.push(...(await scratchOutputFiles(workspace, item, folder)));
    if (files.length === 0) {
      return null;
    }
    const written = await writeFolderFiles(item.projectId, files, {
      author: { name: item.title },
      message: `assets: ${item.taskId ? `outputs of ${item.taskId}, attempt ${item.id.slice(0, 8)}` : `outputs of work item ${item.id.slice(0, 8)}`}`,
    });
    if (written instanceof ElysiaStatus) {
      throw projectRefusalOf(written);
    }
    return written;
  };
  /**
   * Copies the item's outputs from its workspace into its project's folder,
   * under `assets/<task or item>/` ({@link copyOutputs}): its declared
   * outputs and whatever it left in `$TMPDIR/outputs/`. The report's lines
   * on them, whether they arrived, and the paths they arrived at from the
   * folder's root.
   */
  const collectOutputs = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<{ ok: boolean; line: string; paths: string[] }> => {
    const { projectId } = item;
    if (!projectId) {
      return item.outputs?.length
        ? {
            ok: false,
            line: "\n\nOutputs not collected: the item belongs to no project.",
            paths: [],
          }
        : { ok: true, line: "", paths: [] };
    }
    const folder = outputsFolder(item);
    try {
      const written = await copyOutputs(workspace, { ...item, projectId });
      if (!written) {
        return { ok: true, line: "", paths: [] };
      }
      // Absolute, as the project's workspaces on the hub's machine read them
      // (core workspace-policy.ts `projectFolder`); a delegate on any machine
      // reads them by the folder path with `folder_read`.
      const root = projectRootOf(projectId);
      return {
        ok: true,
        paths: written.paths,
        line: `\n\nOutputs, copied into the project's folder ${written.changed ? `at ${written.sha.slice(0, 9)}` : "(already there, unchanged)"}, readable by the project's delegates (on the hub's machine at these paths, on any machine with folder_read and the path after ${root}/):\n${written.paths.map((path) => `- ${root}/${path}`).join("\n")}`,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        line: `\n\nOutputs not collected into ${folder}/: ${reason}`,
        paths: [],
      };
    }
  };
  /**
   * After `workspace`'s item landed on its base: the commit each workspace
   * up its `from` chain was cut at (workspaces.ts `cutFrom`) is vouched landed when
   * `git cherry` in this clone, against the branch it just pushed, finds
   * every patch of it there (no `+` line), and that workspace is read again
   * (workspaces.ts `resettleSoon`). A landing rebases a workspace's own commits, so
   * main carries new commits for them: the workspace it was cut from still
   * had the originals, on no remote, and stayed held for good (2026-10-18,
   * three of the 38 retired by hand). A patch the landing changed (a
   * conflict resolved on the way) is not vouched: that source stays held,
   * and its parent decides.
   */
  const vouchLanded = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<void> => {
    const target = shellQuote(`origin/${workspace.base}`);
    let [row] = db.workspacesNamed(workspace.id);
    while (row?.cutFrom && !row.cutFrom.landed) {
      const from = row.cutFrom;
      if (!COMMIT_ID.test(from.commit)) {
        return;
      }
      const cherry = await runIn(workspace, item)(
        `git cherry ${target} ${from.commit}`,
        GIT_TIMEOUT_MS
      );
      if (
        cherry.exitCode !== 0 ||
        cherry.stdout.split("\n").some((line) => line.startsWith("+"))
      ) {
        console.log(
          `[workspaces] ${row.id}: the work of ${from.commit.slice(0, 9)}, cut from workspace ${from.workspace}, is not all on ${workspace.base}: ${cherry.exitCode === 0 ? "git cherry names patches not there" : failedWith(cherry)}`
        );
        return;
      }
      db.updateWorkspace(row.id, { cutFrom: { ...from, landed: true } });
      console.log(
        `[workspaces] ${row.id}: landed the work of workspace ${from.workspace} at ${from.commit.slice(0, 9)}; that workspace is read again`
      );
      workspaces.resettleSoon(from.workspace);
      [row] = db.workspacesNamed(from.workspace);
    }
  };
  /**
   * What `item`'s finish hears when its outputs are not ready to collect
   * ({@link outputsProblem}): its landing ends and the problem goes back to
   * it. Nothing when they are ready.
   */
  const outputsUnready = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<{ done: false; text: string } | undefined> => {
    const unready = await outputsProblem(workspace, item);
    if (!unready) {
      return undefined;
    }
    endLanding(item.id);
    return { done: false, text: unready };
  };
  /**
   * A finished item whose gate passed at finish_item, to its end: its
   * outputs must be in its workspace (else it is back to running, told which
   * are not); then it lands as its row says (on its base, the rest of the
   * gate's steps run on the rebased tree) and its outputs are collected,
   * and it is done (or failed, when it could not land or its outputs did not
   * arrive) with the report the hub builds sent to its parent. Landed on its
   * base, what it was cut `from` is vouched landed ({@link vouchLanded}).
   */
  const landAndReport = async (
    item: WorkItemRow,
    row: InstanceRow,
    workspace: WorkspaceRow,
    gate: Gate,
    submission: WorkItemSubmission,
    earlier: GateRun
  ): Promise<{ done: boolean; text: string }> => {
    const unready = await outputsUnready(workspace, item);
    if (unready) {
      return unready;
    }
    const landing = await landFinished(
      workspace,
      item,
      gate,
      earlier,
      submission.summary
    );
    if (landing.kind === "retry") {
      endLanding(item.id);
      return { done: false, text: landing.text };
    }
    return await reportLanding(item, row, workspace, submission, landing);
  };
  /**
   * A landing that went or was refused, to the item's end: its outputs
   * collected when it went, the report built and sent, the item done or
   * failed. A stopped landing's item is settled already: its text alone.
   */
  const reportLanding = async (
    item: WorkItemRow,
    row: InstanceRow,
    workspace: WorkspaceRow,
    submission: WorkItemSubmission,
    landing: Exclude<Landed, { kind: "retry" }>
  ): Promise<{ done: boolean; text: string }> => {
    // Its stop settled the row already.
    if (landing.kind === "stopped") {
      console.log(
        `[work-items] ${item.id}: its landing stopped as the item ended; nothing was landed or reported`
      );
      return { done: false, text: landing.text };
    }
    if (landing.kind === "done" && item.lands === "main") {
      await vouchLanded(workspace, item);
    }
    // A refused landing's outputs are collected too: its item fails, and
    // its workspace, $TMPDIR with it, goes once nothing holds it.
    const collected = await collectOutputs(workspace, item);
    const failure = failureOf(landing, collected);
    const shipped =
      landing.kind === "done" && !failure && submission.ship
        ? `\n\n${await shipWords(item, landing, submission.ship.notes)}`
        : "";
    const body = finishedReport(
      submission.summary,
      landing,
      collected,
      `${isHostFolder(workspace) ? "" : await reportedChanges(workspace, item, landing)}${findingsBlock(submission.findings)}${shipped}`
    );
    const lines = landingGateLines(landing);
    const gateSaid = `${lines ? `\n\nMerge checks:\n${lines}` : ""}${shipped}`;
    const ended = finish(db.workItem(item.id) ?? item, {
      ...(failure ? { state: "failed", error: failure } : { state: "done" }),
      result: body,
      summary: submission.summary,
      headline: submission.headline,
      digest: `${submission.summary.trim()}\n${landing.line}${collected.line}`,
      ...landedFields(landing),
      ...LANDING_ENDED,
    });
    const held = reportOrHold(
      row,
      ended,
      body,
      submission.headline,
      collected.paths
    );
    return landedText(landing, collected, gateSaid, held);
  };
  /**
   * What shipping a landed item said (ship.ts): its project's `Ship:`
   * command run on the hub's machine with the landed commit and `notes`, or
   * why it did not run.
   */
  const shipWords = async (
    item: WorkItemRow,
    landing: Extract<Landed, { kind: "done" }>,
    notes: string
  ): Promise<string> => {
    const sha = landing.landed?.sha;
    if (!(item.lands === "main" && landing.landed?.onto && sha)) {
      return "Not shipped: only work that lands on main ships, and this item put nothing there.";
    }
    const ship = item.projectId ? await projectShip(item.projectId) : undefined;
    if (!(ship && item.projectId)) {
      return `Not shipped: this project's ${GATE_FILE} declares no Ship: command, so the hub has nothing to ship it with. The nightly ships it.`;
    }
    const hub = hubMachineId();
    const checkout = hub
      ? gateRun.repositoryOn(item.projectId, hub)
      : undefined;
    if (!checkout) {
      return "Not shipped: the hub's machine holds no checkout of this project to run its Ship: command in. The nightly ships it.";
    }
    try {
      return await shipLanded({
        checkout,
        command: ship,
        commit: sha,
        notes,
      });
    } catch (error) {
      return `Not shipped: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  /**
   * THE run of a `finish_item`, against the submission stored on its row, to
   * an outcome. The live call and a hub start-up resume both come here. The
   * landing gate (gate.ts `gateSteps`) runs on the tree that lands: for an
   * item that lands on its base, on top of that base, inside the landing
   * ({@link landOnBase}); for a branch or a pull request, here, on the tree
   * it pushes. A gate that fails hands the item back to its
   * session with the failing output; one that passes lands it and reports.
   * Either way the row stops landing — also when a step cannot run at all,
   * which throws. Answers the text the delegate reads, and whether the item
   * is done.
   */
  const settleLanding = async (
    item: WorkItemRow,
    submission: WorkItemSubmission
  ): Promise<{ done: boolean; text: string }> => {
    const stop = new AbortController();
    landingStops.set(item.id, stop);
    try {
      return await landSubmitted(item, submission);
    } catch (error) {
      endLanding(item.id);
      if (error instanceof CommandStopped) {
        return stoppedWith(item, error);
      }
      throw error;
    } finally {
      landingStops.delete(item.id);
      // A wait an error cut short leaves no words behind it.
      landingWait(item.id, null);
      // An item stopped while it landed was not settled for it (workspaces.ts `holdsOf`).
      if (!LIVE.has((db.workItem(item.id) ?? item).state)) {
        workspaces.settleSoon(item.workspaceId);
      }
      // What waited out the landing goes: into the turn a failed gate hands
      // back, or, landed, once the turn that called finish_item is over.
      closeTurn(item, false);
    }
  };
  /**
   * A landing its item's end cancelled ({@link landingStops}): a stop, not a
   * failure. The item's end settled its row; the text is what the delegate
   * reads.
   */
  const stoppedWith = (
    item: WorkItemRow,
    error: CommandStopped
  ): { done: boolean; text: string } => {
    const now = db.workItem(item.id) ?? item;
    console.log(
      `[work-items] ${item.id}: its landing was stopped as the item ended (${now.state}); every command it had running was cancelled: ${error.message}`
    );
    return {
      done: false,
      text: `${now.title} is ${now.state} now; its landing stopped with it, and nothing was landed or reported.`,
    };
  };
  /**
   * A host-scope item's finish_item: no clone, so no gate, no landing and no
   * diffstat; its report and its `$TMPDIR/outputs/` are the whole of it, a
   * link or a file past the folder's limit there sent back first
   * ({@link outputsProblem}).
   */
  const reportHost = async (
    item: WorkItemRow,
    row: InstanceRow,
    workspace: WorkspaceRow,
    submission: WorkItemSubmission
  ): Promise<{ done: boolean; text: string }> => {
    const unready = await outputsUnready(workspace, item);
    if (unready) {
      return unready;
    }
    return await reportLanding(item, row, workspace, submission, {
      kind: "done",
      line: "Nothing landed: it ran with host scope.",
      gate: { declared: false, outcomes: [] },
    });
  };
  /**
   * {@link settleLanding}'s run: the gate's steps read, the gate at
   * finish_item run (none for an item landing on its base), and the landing.
   */
  const landSubmitted = async (
    item: WorkItemRow,
    submission: WorkItemSubmission
  ): Promise<{ done: boolean; text: string }> => {
    const [row] = db.getInstancesByIds([item.instanceId]);
    const [workspace] = db.workspacesNamed(item.workspaceId);
    if (isHostFolder(workspace)) {
      return await reportHost(item, row, workspace, submission);
    }
    const gate = await gateRun.gateSteps(workspace, item);
    if ("refusal" in gate) {
      const refused = endLanding(item.id) ?? item;
      // No machine a due step needs is online: the item waits for one, never
      // idle, the longest wait an item declares; the sweep wakes it sooner
      // when one comes (work-items.ts `wakeCapable`).
      if (gate.needs && LIVE.has(refused.state)) {
        declareWait(
          refused,
          WAIT_ITEM_MAX_MINUTES,
          capableWaitReason(gate.needs)
        );
      }
      return { done: false, text: gate.refusal };
    }
    const refused = await branchRefused(workspace, item, gate);
    if (refused) {
      return await reportLanding(item, row, workspace, submission, refused);
    }
    landingAt(item, "gating");
    const run = await gateRun.gateOnce(
      workspace,
      item,
      item.lands === "main" ? { ...gate, steps: [] } : gate,
      "at finish_item",
      {
        inTurn: false,
        say: (words, step) =>
          landingWait(item.id, words && stepWaitWords(words, step)),
      }
    );
    if (runFailed(run)) {
      endLanding(item.id);
      return { done: false, text: gateFailedText(run, "your commits") };
    }
    // The gate took its time: the item may have been stopped since.
    const current = db.workItem(item.id) ?? item;
    if (landingStopped(current)()) {
      return {
        done: false,
        text: `${current.title} is ${current.state} now; nothing was landed or reported.`,
      };
    }
    return await landAndReport(current, row, workspace, gate, submission, run);
  };
  /**
   * A branch or a pull request gates at finish_item, before its push: the
   * push is checked first, so one that will be refused runs no step
   * (landing.ts `branchPushCheck`; a landing on its base checks inside
   * `land`). The refused landing, or nothing.
   */
  const branchRefused = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    gate: Gate
  ): Promise<Extract<Landed, { kind: "refused" }> | undefined> => {
    if (item.lands !== "branch" && item.lands !== "pr") {
      return;
    }
    const branch = landingBranch(item);
    const refused = await branchPushCheck(
      runIn(workspace, item),
      branch,
      lastBranchPush(item)
    );
    return refused
      ? {
          kind: "refused",
          gate: { declared: gate.declared, outcomes: [] },
          line: refusedLine(
            refused,
            { head: "Not pushed", target: `branch ${branch}` },
            workspace,
            machineName(db, workspace.machineId)
          ),
        }
      : undefined;
  };

  return {
    /** While item `itemId`'s landing waits (a shared machine slot, a pause, its turn to land): what its status says, and since when ({@link landingWait}). */
    landingWaitOf: (itemId: string): { words: string; since: number } | null =>
      landingWaits.get(itemId) ?? null,
    landingWait,
    landingRuns,
    stopLanding,
    settleLanding,
    runIn,
    passesOf: gateRun.passesOf,
  };
};
