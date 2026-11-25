import { humanSize } from "@cawco/core/attachments";
import type { CommandResult } from "@cawco/core/commands/controls";
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
  OUTPUTS_DIR,
  type WorkspaceConflict,
} from "@cawco/core/workspace/controls";
import { Effect, Result } from "effect";
import { ElysiaStatus, problem } from "elysia";
import type { DbShape } from "./db";
import type { WorkItemRow, WorkspaceRow } from "./db/project-work";
import type {
  LandingPhase,
  WorkItemSubmission,
  WorkLanding,
} from "./db/stored-types";
import {
  type BranchOutcome,
  branchPushCheck,
  failedWith,
  type LandingTurn,
  land,
  landingQueue,
  pushBranch,
  type Refusal,
  reportedCommits,
  reportedDiffstat,
  reportedRange,
} from "./landing";
import { MALFORMED_REPLY, MachineProblem } from "./machine-answers";
import { machineName } from "./machine-name";
import { CommandStopped, WouldWait } from "./machine-pause";
import { handle } from "./presenters/words";
import {
  FOLDER_FILE_LIMIT,
  folderFreeBytes,
  projectRoot,
  writeFolderFiles,
} from "./project-folder";
import { LIVE } from "./work-item-state";
import type { Workspaces, WorkspacesDeps } from "./workspaces";
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
import type { Writes } from "./writes";

/** The line a parent's report carries about the item behind it. */
export const reportLine = (item: WorkItemRow): string =>
  LIVE.has(item.state)
    ? `\n\n[Work item ${handle(item.id)} is ${item.state} in workspace ${handle(item.workspaceId)}.]`
    : `\n\n[Work item ${handle(item.id)} is ${item.state} in workspace ${handle(item.workspaceId)}. A handoff to it continues this same session.]`;
/** Lines of diffstat a report keeps: the last, its summary, always among them. */
const DIFFSTAT_LINES = 40;
/** A full commit id, as a machine names one: never an option or a ref. */
const COMMIT_ID = /^[0-9a-f]{40}([0-9a-f]{24})?$/u;
/** A git tree's name, as `git rev-parse <commit>^{tree}` prints it. */
const TREE_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
/** The branch an item that lands `branch` or `pr` is pushed to: `cawco/tsk-12`. */
export const landingBranch = (item: Pick<WorkItemRow, "id" | "taskId">) =>
  `cawco/${landingKey(item)}`;
const MIB = 1024 * 1024;
/**
 * The shell that says of each output whether it is missing, a link, or a
 * file of some size. A folder is said file by file, so a link inside it is
 * refused and each file meets the size limit; a folder with no files in it
 * is missing.
 */
const outputProbe = (path: string): string =>
  `p=${shellQuote(path)}; if [ -L "$p" ]; then echo "link $p"; elif [ -d "$p" ]; then find "$p" -type l | while IFS= read -r f; do echo "link $f"; done; find "$p" -type f | while IFS= read -r f; do echo "size $(wc -c < "$f" | tr -d ' ') $f"; done; [ -n "$(find "$p" -type f | head -n 1)" ] || echo "missing $p"; elif [ ! -f "$p" ]; then echo "missing $p"; else echo "size $(wc -c < "$p" | tr -d ' ') $p"; fi`;
/** The longest one probe command runs: well under the OS's limit on one argument (128 KiB on Linux). */
const PROBE_COMMAND_LIMIT = 64_000;
/**
 * The probe of {@link outputProbe} for every output, in as few commands as
 * stay under {@link PROBE_COMMAND_LIMIT}, so any number of outputs works
 * under the OS's argument limit.
 */
const outputsProbes = (outputs: string[]): string[] => {
  const commands: string[] = [];
  let batch: string[] = [];
  let length = 0;
  for (const path of outputs) {
    const probe = outputProbe(path);
    if (batch.length > 0 && length + probe.length > PROBE_COMMAND_LIMIT) {
      commands.push(batch.join("; "));
      batch = [];
      length = 0;
    }
    batch.push(probe);
    length += probe.length + 2;
  }
  if (batch.length > 0) {
    commands.push(batch.join("; "));
  }
  return commands;
};
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
/** The workspace-root paths of the files a declared outputs probe ({@link outputsProbes}) found. */
const declaredFilesOf = (stdout: string): Set<string> =>
  new Set(
    stdout
      .split("\n")
      .filter((line) => line.startsWith("size "))
      .map((line) => line.split(" ").slice(2).join(" ").replaceAll("//", "/"))
  );
/** The bytes of every file a probe's answer sizes, and of the scratch files, added up. */
const outputsBytes = (
  stdout: string,
  scratch: readonly ScratchOutput[]
): number =>
  stdout
    .split("\n")
    .filter((line) => line.startsWith("size "))
    .reduce((sum, line) => sum + Number(line.split(" ")[1]), 0) +
  scratch.reduce((sum, one) => sum + (one.link ? 0 : one.size), 0);
/** What a probe's answer says is wrong with the outputs, a sentence each. */
const outputsSaid = (stdout: string): string[] => {
  const by: Record<"missing" | "link", string[]> = { missing: [], link: [] };
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
/** A fenced block that no command output can close early. */
export const fenced = (text: string): string =>
  `\n\`\`\`\`\n${text.trimEnd()}\n\`\`\`\``;
/**
 * The landing line of an item that landed on its base: where, whether its
 * turn rebased again, and each time it stepped out of its turn.
 */
const landedLine = (
  base: string,
  landed: { rebased: boolean; sha: string },
  steps: string[]
): string => {
  const after = landed.rebased
    ? `${base} had moved by its turn, so it rebased again`
    : `${base} had not moved by its turn`;
  const stepped =
    steps.length > 0
      ? `; it stepped out of its turn ${steps.length === 1 ? "once" : `${steps.length} times`}, the last time because ${steps.at(-1)}`
      : "";
  return `${workWords.landedOn(base)} at ${landed.sha.slice(0, 9)}, rebased on top of ${base}; ${after}${stepped}.`;
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
 * opened or found, landing `pr`), back to its session, or refused.
 */
type Landed =
  | {
      kind: "done";
      line: string;
      /** What it put where, when it pushed (the item's `landed`). */
      landed?: WorkLanding;
      prUrl?: string;
    }
  | { kind: "refused"; line: string; prUrl?: string }
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
    "push check": `the push check (git push --dry-run to ${target})`,
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
    said = `${step["push check"]} from ${machine} was refused`;
  } else if (refusal.step === "push") {
    said = `${step.push} was refused`;
  }
  return `${head}: ${said}.${fenced(refusal.detail)}\nThe commits are on branch ${workspace.branch} in workspace ${handle(workspace.id)}.`;
};
/**
 * Why a finished item fails, when it does: the
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
 * A finished item's report to its parent: what it said it did (its own
 * report, quoting what it ran), how it landed and its outputs, then `tail`
 * (commits, diffstat, findings). A failure leads it, so the parent reads why
 * before what.
 */
const finishedReport = (
  summary: string,
  landing: Exclude<Landed, { kind: "retry" | "stopped" }>,
  collected: { ok: boolean; line: string },
  tail: string
): string => {
  const failure = failureOf(landing, collected);
  if (!failure) {
    return `${summary}\n\n${landing.line}${collected.line}${tail}`;
  }
  const landed =
    landing.kind === "done" ? `\n\n${landing.line}` : collected.line;
  return `${failure}\n\n${summary}${landed}${tail}`;
};
/**
 * What `finish_item` answers once a landing ended its item: done, or failed
 * because it could not land or its outputs did not arrive. `held` is the
 * words on a group's held report.
 */
const landedText = (
  landing: Exclude<Landed, { kind: "retry" | "stopped" }>,
  collected: { ok: boolean; line: string },
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
        text: `${landing.line}${collected.line}\n\nThe item is done${held}. End your turn.`,
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
  machine: string
): Landed => {
  switch (pushed.kind) {
    case "dirty":
      return { kind: "retry", text: dirtyText(pushed.files, branch) };
    case "nothing":
      return {
        kind: "done",
        line: `Nothing to push: ${workspace.base} already holds every commit in this workspace${lands === "pr" ? ", so no pull request was opened" : ""}.`,
      };
    case "no-remote":
      return {
        kind: "done",
        line: "Not pushed: this workspace's repository has no remote.",
      };
    case "refused":
      return {
        kind: "refused",
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
 * What a landing run reads of the hub that work items read nothing of: the
 * hub hands it to createWorkItems as one `forLandings`, passed on whole.
 */
export interface LandingsHub {
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
  /** The write door: a landing's pull or merge request goes through it (writes.ts). */
  readonly writes: Pick<Writes, "post">;
}

interface LandingRunDeps
  extends LandingsHub, Pick<WorkspacesDeps, "call" | "command" | "db"> {
  readonly closeTurn: (item: WorkItemRow, turnOver: boolean) => void;
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
  readonly update: (
    id: string,
    asked: Parameters<DbShape["updateWorkItem"]>[1]
  ) => WorkItemRow | undefined;
  readonly workspaces: Workspaces;
}

export const createLandingRun = ({
  call,
  closeTurn,
  command,
  db,
  finish,
  heldForGroup,
  published,
  report,
  sessionUrl,
  taskTitle,
  update,
  workspaces,
  writes,
}: LandingRunDeps) => {
  /**
   * Each landing this hub process runs, by item: aborted as its item ends
   * ({@link finish}), which cancels every command the landing has running,
   * through the runner that started each (machine-commands.ts
   * `runOnMachine`, `how.stop`).
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
   * its folder, or its turn to land ("queued to land on main behind …");
   * null once it waits no more. Every wait between `finish_item` and the
   * item's outcome comes here: before 2026-10-16 items queued to land sat
   * with nothing said.
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
  /** The item in the landing queue: named as `“title” (id)`, its wait its status. */
  const turnOf = (item: WorkItemRow): LandingTurn => ({
    who: `“${item.title}” (${item.id.slice(0, 8)})`,
    onWait: (words) => landingWait(item.id, words),
  });
  /**
   * Lands a finished item's commits on its workspace's base branch
   * (landing.ts): rebased on top of the branch outside the queue, then its
   * turn. Answers the line the report and the delegate read when the item
   * can be done; the text that hands it back to its delegate (`retry`:
   * uncommitted work, a conflict); or the line that says why it could not
   * land (`refused`).
   */
  const landOnBase = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<Landed> => {
    const { base } = workspace;
    /** The times it stepped out of its turn, and why the last time. */
    const stepped: string[] = [];
    landingAt(item, "turn");
    const before = await headOf(workspace, item);
    const outcome = await land(base, {
      run: runIn(workspace, item),
      logsUrl: sessionUrl(item.instanceId),
      turn: turnOf(item),
      onStepOut: (words) => {
        stepped.push(words);
      },
      queue: landings,
      skip: db.workItemOutputs(item.id),
      stopped: landingStopped(item),
    });
    const after = await headOf(workspace, item);
    if (before && after && before.commit !== after.commit) {
      movedByLanding(workspace.id, base, before, after);
    }
    switch (outcome.kind) {
      case "stopped":
        return stoppedLanding(item);
      case "landed":
        return {
          kind: "done",
          landed: { sha: outcome.sha, onto: outcome.onto },
          line: landedLine(base, outcome, stepped),
        };
      case "nothing":
        return {
          kind: "done",
          line: `Nothing to land: ${base} already holds every commit in this workspace.`,
        };
      case "no-remote":
        return {
          kind: "done",
          line: "Not landed: this workspace's repository has no remote.",
        };
      case "dirty":
        return { kind: "retry", text: dirtyText(outcome.files, base) };
      case "conflict":
        return {
          kind: "retry",
          text: `Not landed: your commits conflict with origin/${base} in:${fenced(outcome.files)}\nThe hub undid its rebase. Rebase onto origin/${base} yourself, resolve the conflicts, commit, and call finish_item again.`,
        };
      case "refused":
        return {
          kind: "refused",
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
  /** A pull request's body: what the delegate said it did, and where its report is. */
  const pullRequestBody = (item: WorkItemRow, summary: string): string => {
    const what = item.taskId
      ? `an attempt at the task “${item.title}”`
      : `work item ${handle(item.id)}`;
    return [
      summary.trim(),
      `This is ${what}; its report and transcript: ${sessionUrl(item.instanceId)}`,
    ].join("\n\n");
  };
  /**
   * The commit the hub last pushed to `item`'s own branch
   * ({@link landingBranch}): the newest branch landing of every attempt at
   * its task in its project, the item's own earlier rounds among them, or of
   * the item alone when it is no task's. Undefined: the hub never pushed there.
   * A landing whose record does not read (`landedUnread`) is none of them:
   * the hub cannot vouch it pushed there, so a branch at it is refused, not
   * pushed over.
   */
  const lastBranchPush = (item: WorkItemRow): string | undefined => {
    const now = db.workItem(item.id) ?? item;
    const sharing =
      now.projectId && now.taskId
        ? db
            .projectAttempts(now.projectId)
            .filter((attempt) => attempt.taskId === now.taskId)
        : [now];
    let last: { at: number; sha: string } | undefined;
    for (const attempt of sharing) {
      const at = attempt.landedAt?.getTime() ?? 0;
      if (
        attempt.landedSha !== null &&
        attempt.landedOnto === null &&
        attempt.landedUnread === null &&
        (!last || at > last.at)
      ) {
        last = { at, sha: attempt.landedSha };
      }
    }
    return last?.sha;
  };
  /**
   * Lands an item that lands `branch` or `pr`: its commits pushed as they are
   * to `cawco/<task or item>`, and for `pr`, a pull request against the base
   * branch opened, or the open one found. gh turning the pull request down
   * refuses the landing in gh's words.
   */
  const landOnBranch = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    summary: string
  ): Promise<Landed> => {
    const { base } = workspace;
    const branch = landingBranch(item);
    const pushed = await pushBranch(base, branch, {
      last: lastBranchPush(item),
      logsUrl: sessionUrl(item.instanceId),
      run: runIn(workspace, item),
      skip: db.workItemOutputs(item.id),
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
        machineName(db, workspace.machineId)
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
        landed,
        line: `Pushed to branch ${at} on origin; ${base} is untouched.`,
      };
    }
    return pullRequestFor(workspace, item, summary, at, landed);
  };
  /**
   * Opens the pull or merge request for an item's pushed branch, or finds
   * the open one, through the write door (writes.ts): the workspace's
   * machine makes it on its origin's forge with its own sign-in there, and
   * the door records it for the item's task. A forge that turns it down
   * refuses the landing in its words.
   */
  const pullRequestFor = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    summary: string,
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
    const outcome = await Effect.runPromise(
      Effect.result(
        writes.post({
          by: { work: item.id },
          target: { machine: workspace.machineId, repo: origin },
          op: {
            op: "change-request.open",
            base,
            head: branch,
            title,
            body: pullRequestBody(item, summary),
          },
          projectId: item.projectId ?? null,
          taskId: item.taskId ?? null,
        })
      )
    );
    const made = Result.isSuccess(outcome) ? outcome.success : undefined;
    const url = made?.item?.url;
    if (!(made && url)) {
      const said = Result.isFailure(outcome)
        ? outcome.failure.words
        : "the forge named no pull or merge request.";
      return {
        kind: "refused",
        line: `Pushed to branch ${at}, but ${machine} did not open the pull or merge request. It said:${fenced(said)}\nOpen it by hand from ${branch} into ${base}, or start the task again once ${machine} can.`,
      };
    }
    return {
      kind: "done",
      landed,
      prUrl: url,
      line: made.existing
        ? `Pushed to branch ${at}, which updates its open pull or merge request: ${url}`
        : `Pushed to branch ${at} and opened a pull or merge request against ${base}: ${url}`,
    };
  };
  /**
   * Lands a finished item the way it lands: on its base
   * ({@link landOnBase}), on a branch, through a pull request, or not at all.
   */
  const landFinished = (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    summary: string
  ): Promise<Landed> => {
    switch (item.lands) {
      case "none":
        return Promise.resolve({
          kind: "done",
          line:
            db.workItemOutputs(item.id).length > 0
              ? "Nothing pushed: this item lands none, and its outputs are what it hands in."
              : "Nothing pushed: this item lands none.",
        });
      case "branch":
      case "pr":
      case "main":
        // A folder lands by its change set into the folder itself; a
        // repository by git, on its base or a branch of its own.
        if (isFolderOverlay(workspace)) {
          return landFolder(workspace);
        }
        return item.lands === "main"
          ? landOnBase(workspace, item)
          : landOnBranch(workspace, item, summary);
    }
  };
  /**
   * Lands a finished folder item's change set in its folder (agent
   * layer.ts): the change set read against the folder as it is now, any
   * path changed there too since the delegate's start a conflict that lands
   * nothing and goes back to the delegate with both versions; then the
   * change set put into the folder by the agent on its machine, outside
   * every wall, which scans for conflicts once more first. The services its work touched are
   * the delegate's report's to name, and its parent's to restart.
   */
  const landFolder = async (workspace: WorkspaceRow): Promise<Landed> => {
    const ref = refOf(workspace);
    const read = await call(workspace.machineId, CONTROL_WORKSPACE_CHANGES, [
      ref,
    ]);
    if (read.conflicts.length > 0) {
      return { kind: "retry", text: conflictText(read.conflicts, read.folder) };
    }
    if (read.changed.length === 0) {
      return {
        kind: "done",
        line: `Nothing to land: ${read.folder} already holds every change in this workspace.`,
      };
    }
    const applied = await call(workspace.machineId, CONTROL_WORKSPACE_APPLY, [
      ref,
    ]);
    if (applied.conflicts.length > 0) {
      return {
        kind: "retry",
        text: conflictText(applied.conflicts, read.folder),
      };
    }
    return {
      kind: "done",
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
    const outputs = db.workItemOutputs(item.id);
    const result = { stdout: "" };
    for (const probe of outputsProbes(outputs)) {
      const probed = await runIn(workspace, item)(probe, GIT_TIMEOUT_MS);
      if (probed.exitCode !== 0) {
        throw new Error(
          `the hub could not look for the item's outputs: ${failedWith(probed)}`
        );
      }
      result.stdout += `${probed.stdout}\n`;
    }
    const scratch = item.projectId ? await scratchOutputs(workspace, item) : [];
    const total = outputsBytes(result.stdout, scratch);
    const free = item.projectId
      ? await folderFreeBytes({ id: item.projectId })
      : total;
    const problems = [
      ...outputsSaid(result.stdout),
      ...scratchOutputsSaid(scratch, declaredFilesOf(result.stdout)),
      ...(total > free
        ? [workWords.outputsNoRoom(humanSize(total), humanSize(free))]
        : []),
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
      const read = await workspaces.onHostScratch(
        workspace,
        CONTROL_HOST_OUTPUTS,
        [{ id: workspace.id, read: false }],
        { listed: [] }
      );
      // Bytes where a listing was asked are not its reply: the machine's
      // malformed answer, as every call answers one (machine-answers.ts).
      if (!("listed" in read)) {
        throw new MachineProblem(
          problem(502, {
            code: MALFORMED_REPLY,
            detail: `${SCRATCH_OUTPUTS} of ${workspace.id} could not be listed: its machine answered their bytes`,
          })
        );
      }
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
   * in one commit (project-folder.ts); null when there are none; the
   * folder's refusal of the commit.
   */
  const copyOutputs = async (
    workspace: WorkspaceRow,
    item: WorkItemRow & { projectId: string }
  ) => {
    const folder = outputsFolder(item);
    const files: { path: string; content: Uint8Array }[] = [];
    for (const output of db.workItemOutputs(item.id)) {
      files.push(...(await outputFiles(workspace, item, output, folder)));
    }
    files.push(...(await scratchOutputFiles(workspace, item, folder)));
    if (files.length === 0) {
      return null;
    }
    return await writeFolderFiles(item.projectId, files, {
      author: { name: item.title },
      message: `assets: ${item.taskId ? `outputs of ${item.taskId}, attempt ${item.id.slice(0, 8)}` : `outputs of work item ${item.id.slice(0, 8)}`}`,
    });
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
      return db.workItemOutputs(item.id).length > 0
        ? {
            ok: false,
            line: "\n\nOutputs not collected: the item belongs to no project.",
            paths: [],
          }
        : { ok: true, line: "", paths: [] };
    }
    const folder = outputsFolder(item);
    const uncollected = (reason: string) => ({
      ok: false,
      line: `\n\nOutputs not collected into ${folder}/: ${reason}`,
      paths: [],
    });
    try {
      const written = await copyOutputs(workspace, { ...item, projectId });
      if (!written) {
        return { ok: true, line: "", paths: [] };
      }
      if (written instanceof ElysiaStatus) {
        return uncollected(written.response.detail);
      }
      // Absolute, as the project's workspaces on the hub's machine read them
      // (core workspace-policy.ts `projectFolder`); a delegate on any machine
      // reads them by the folder path with `folder_read`.
      const root = projectRoot(projectId);
      if (root instanceof ElysiaStatus) {
        return uncollected(root.response.detail);
      }
      return {
        ok: true,
        paths: written.paths,
        line: `\n\nOutputs, copied into the project's folder ${written.changed ? `at ${written.sha.slice(0, 9)}` : "(already there, unchanged)"}, readable by the project's delegates (on the hub's machine at these paths, on any machine with folder_read and the path after ${root}/):\n${written.paths.map((path) => `- ${root}/${path}`).join("\n")}`,
      };
    } catch (error) {
      return uncollected(
        error instanceof Error ? error.message : String(error)
      );
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
    while (
      row?.cutFromWorkspace &&
      row.cutFromCommit !== null &&
      row.cutFromLanded === false
    ) {
      const from = {
        workspace: row.cutFromWorkspace,
        commit: row.cutFromCommit,
      };
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
      db.updateWorkspace(row.id, { cutFromLanded: true });
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
   * A finished item, to its end: its outputs must be in its workspace (else
   * it is back to running, told which are not); then it lands as its row
   * says and its outputs are collected,
   * and it is done (or failed, when it could not land or its outputs did not
   * arrive) with the report the hub builds sent to its parent. Landed on its
   * base, what it was cut `from` is vouched landed ({@link vouchLanded}).
   */
  const landAndReport = async (
    item: WorkItemRow,
    row: InstanceRow,
    workspace: WorkspaceRow,
    submission: WorkItemSubmission
  ) => {
    const unready = await outputsUnready(workspace, item);
    if (unready) {
      return unready;
    }
    const landing = await landFinished(workspace, item, submission.summary);
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
  ) => {
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
    const body = finishedReport(
      submission.summary,
      landing,
      collected,
      `${isHostFolder(workspace) ? "" : await reportedChanges(workspace, item, landing)}${findingsBlock(submission.findings)}`
    );
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
    return landedText(landing, collected, held);
  };
  /**
   * THE run of a `finish_item`, against the submission stored on its row, to
   * an outcome. The live call and a hub start-up resume both come here. A
   * landing that goes back to the item's session (uncommitted work, a
   * conflict) or ends it, and one a command of it throws on, stops the row
   * landing. Answers the text the delegate reads, and whether the item is
   * done.
   *
   * The row is read here, never handed in: its `landingSince` is what names
   * this landing ({@link landingStopped}), and a copy read before the
   * landing was marked names none, so it reads as stopped at its first
   * check. On 2026-11-17 every landing ended so (the gate's removal took the
   * re-read the gate made after it ran), and nothing landed for an hour.
   */
  const settleLanding = async (itemId: string) => {
    const item = db.workItem(itemId);
    const submission = item?.submission;
    if (!(item && submission && item.landingSince && LIVE.has(item.state))) {
      return {
        done: false,
        text: `${item ? `${item.title} is ${item.state} and not landing` : "The item is gone"}; nothing was landed or reported.`,
      };
    }
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
      // What waited out the landing goes: into the turn a refused landing
      // hands back, or, landed, once the turn that called finish_item is over.
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
   * A host-scope item's finish_item: no clone, so no landing and no
   * diffstat; its report and its `$TMPDIR/outputs/` are the whole of it, a
   * link or a file past the folder's limit there sent back first
   * ({@link outputsProblem}).
   */
  const reportHost = async (
    item: WorkItemRow,
    row: InstanceRow,
    workspace: WorkspaceRow,
    submission: WorkItemSubmission
  ) => {
    const unready = await outputsUnready(workspace, item);
    if (unready) {
      return unready;
    }
    return await reportLanding(item, row, workspace, submission, {
      kind: "done",
      line: "Nothing landed: it ran with host scope.",
    });
  };
  /**
   * {@link settleLanding}'s run: a landing refused before it starts
   * ({@link refusedBefore}) reported, every other landed and reported.
   */
  const landSubmitted = async (
    item: WorkItemRow,
    submission: WorkItemSubmission
  ) => {
    const [row] = db.getInstancesByIds([item.instanceId]);
    const [workspace] = db.workspacesNamed(item.workspaceId);
    if (isHostFolder(workspace)) {
      return await reportHost(item, row, workspace, submission);
    }
    const refused = await refusedBefore(workspace, item);
    if (refused) {
      return await reportLanding(item, row, workspace, submission, refused);
    }
    return await landAndReport(item, row, workspace, submission);
  };
  /**
   * An item whose outputs did not read as they became rows (schema.ts
   * `workItems.outputsUnread`) lands nothing, whichever way it lands but
   * `none`: the hub cannot tell which of its files were declared outputs,
   * and an output its landing does not pass over is committed with the
   * rest. Refused before anything is pushed; its outputs that read are still
   * collected ({@link reportLanding}). Nothing for any other item.
   */
  const outputsUnreadRefused = (
    item: WorkItemRow
  ): Extract<Landed, { kind: "refused" }> | undefined =>
    item.outputsUnread !== null && item.lands !== "none"
      ? {
          kind: "refused",
          line: workWords.outputsUnreadRefused(item.outputsUnread),
        }
      : undefined;
  /**
   * A landing refused before it starts: one whose outputs did not read
   * ({@link outputsUnreadRefused}); a branch or a pull request whose push
   * will be refused (landing.ts `branchPushCheck`; a landing on its base
   * checks inside `land`). The refused landing, or nothing.
   */
  const refusedBefore = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<Extract<Landed, { kind: "refused" }> | undefined> => {
    const unread = outputsUnreadRefused(item);
    if (unread) {
      return unread;
    }
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
  };
};
