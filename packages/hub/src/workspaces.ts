import { type BackoffPolicy, backoffStep } from "@cawco/core/backoff";
import type { CommandResult } from "@cawco/core/commands/controls";
import type { ControlReply } from "@cawco/core/control-replies";
import type { ControlArgs, ControlName } from "@cawco/core/control-table";
import { detach } from "@cawco/core/detach";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import { type MachinePath, MachinePathRefused } from "@cawco/core/machine-path";
import { ownCommitsShell } from "@cawco/core/own-commits";
import type { InstanceRow, InstanceStatus } from "@cawco/core/protocol";
import { artifactLink } from "@cawco/core/references";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import { knowsNotControl } from "@cawco/core/session/controls";
import type { NeutralOrigin } from "@cawco/core/session-messages";
import { shellQuote } from "@cawco/core/shell-quote";
import {
  STAGE_CLONE_MS,
  STAGE_READY_MS,
  type StageCloneFrame,
} from "@cawco/core/stage";
import { WorkspaceCheckoutSchema } from "@cawco/core/stored-shapes";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import { carryWords, type FolderCopy } from "@cawco/core/words/carry";
import { workWords } from "@cawco/core/words/work";
import { holdingWords, sizeWords } from "@cawco/core/words/workspace-holding";
import { isWorkspaceNeedsRefusal } from "@cawco/core/words/workspace-needs";
import {
  CONTROL_HOST_OUTPUTS,
  CONTROL_HOST_SCRATCH_REMOVE,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_BUNDLE,
  CONTROL_WORKSPACE_CHANGES,
  CONTROL_WORKSPACE_CLONES,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_DISCARD,
  CONTROL_WORKSPACE_OUTPUTS,
  CONTROL_WORKSPACE_WORK_END,
  OUTPUTS_DIR,
  type WorkspaceArchive,
  type WorkspaceCheckout,
  type WorkspaceCut,
  type WorkspaceFirstSession,
  type WorkspaceHolding,
  type WorkspaceOutputs,
  type WorkspaceRef,
  type WorkspaceUnlanded,
  type WorkspaceWorkEnd,
} from "@cawco/core/workspace/controls";
import { ElysiaStatus, problem } from "elysia";
import { z } from "zod";
import type { DbShape } from "./db";
import type { ArtifactRow } from "./db/artifacts";
import {
  headColumns,
  headOf,
  type WorkItemRow,
  type WorkspaceRow,
} from "./db/project-work";
import { soon } from "./lifetime";
import type { MachineCall } from "./machine-answers";
import {
  CUT_COMMIT_GONE,
  MALFORMED_REPLY,
  MachineProblem,
  thrownAgain,
} from "./machine-answers";
import { machineName } from "./machine-name";
import type { CommandOptions } from "./machine-pause";
import { handle } from "./presenters/words";
import { makeProjectFolder, writeFolderFiles } from "./project-folder";
import { LIVE, type Parent } from "./work-item-state";

/**
 * What a held workspace holds that is nowhere else, as its machine read it
 * once its boundary was closed (schema.ts `workspaces.holding`), and where
 * it is.
 */
export interface HeldWork extends WorkspaceHolding {
  /** When its machine read it, ISO. */
  heldAt: string;
  /** What it holds, in words: "2 commits on no remote, 3 changed files, 1 stash". */
  holds: string;
  machine: string;
  machineId: string;
  path: string;
  /** The clone's size on disk, in words. */
  size: string;
  workspaceId: string;
}

/**
 * What a session's workspace holds that is on no remote, for a message about
 * to wake that session cold (delegation-actions.ts `checkCold`): `changed`,
 * its uncommitted changes and stashes, which only that clone can reach;
 * `ahead`, its commits on no remote, which a fresh delegate cut from its
 * branch reaches too (`delegate` with `from`). `live`: its item still runs.
 */
export interface Unlanded {
  ahead: number;
  changed: number;
  /**
   * Read only while something holds the workspace up (its boundary runs):
   * the subjects of its newest commits on no remote, at most
   * {@link SUBJECTS_READ}, newest first, and the files of its
   * `$TMPDIR/outputs/` by their path under it. Absent for one closed and
   * held, whose clone is read only by its machine's host.
   */
  clone?: { outputs: string[]; subjects: string[] };
  /** Its uncommitted changed files alone, stashes apart. */
  dirty: number;
  live: boolean;
  workspaceId: string;
}

/** How many of a workspace's commit subjects {@link Unlanded} reads. */
const SUBJECTS_READ = 5;

/**
 * A workspace closed on its machine: its row, archived, and the carry its
 * machine wrote first when its work was discarded; or, its clone holding
 * work that is nowhere else, its row held and `held` naming the work.
 */
export interface ArchivedWorkspace {
  carry: string | null;
  held?: HeldWork;
  workspace: WorkspaceRow;
}

/** How many of a held workspace's excluded paths are named in words; the rest are counted. */
const EXCLUDED_NAMED = 20;

/** A held workspace's excluded paths in words ("a, b and 3 more"), or "" when it has none. */
export const excludedNamed = (excluded: readonly string[] = []): string =>
  excluded.length > EXCLUDED_NAMED
    ? `${excluded.slice(0, EXCLUDED_NAMED).join(", ")} and ${excluded.length - EXCLUDED_NAMED} more`
    : excluded.join(", ");

/**
 * What an archive says when the clone holds work that is nowhere else: it
 * names what, the workspace is held, and nothing is deleted. `discard`
 * archives it anyway, its unlanded commits, changes, stashes and excluded
 * files saved to a carry first.
 */
const holdsWorkWords = (held: HeldWork): string => {
  const named = excludedNamed(held.excluded);
  return held.refused
    ? workWords.refusedHeld(
        handle(held.workspaceId),
        held.machine,
        held.refused,
        held.size,
        held.path
      )
    : `Workspace ${handle(held.workspaceId)} on ${held.machine} holds ${held.holds} (${held.size} at ${held.path}), so it was not archived and nothing was deleted: it is held.${named ? ` Kept out of git by its own excludes: ${named}.` : ""} Continue its work, or pass discard: true to archive it with its unlanded commits, changes, stashes and excluded files saved to a carry in ~/.cawco/carries on ${held.machine}.`;
};

/**
 * How long archiving waits on a running session's machine to confirm its
 * stop: well inside the hub's 120 s HTTP idle timeout (index.ts).
 */
const ARCHIVE_STOP_WAIT_MS = 30_000;

/**
 * A failed settle tried again by the sweep (workspaces.ts `settleFailed`):
 * from the sweep's minute, doubling to an hour, thirty times in a row (about
 * a day); then only a settle someone asks for tries it, its session told
 * long before ({@link SETTLE_FAILS_LASTING}).
 */
const SETTLE_RETRIES: BackoffPolicy = {
  firstMs: MINUTE_MS,
  mostMs: HOUR_MS,
  giveUp: { afterTries: 30 },
};

/** Failures in a row after which a settle's failure is lasting, and its session is told once. */
const SETTLE_FAILS_LASTING = 3;

/**
 * Whether the workspace works in a copy of its own (a clone on macOS, and
 * every workspace made before layers): not a Linux view of the folder itself
 * (agent layer.ts), whose path is the person's folder, written by nothing of
 * CawCo's until its change set lands.
 */
export const ownCopy = (workspace: WorkspaceRow): boolean =>
  workspace.path !== workspace.repoRoot;

/**
 * A folder workspace's view or copy of the folder it was made from, read
 * from its row: a view at the folder's own path (Linux), or a copy at a path
 * of its own ({@link ownCopy}, macOS). None for a repository's clone.
 */
const folderCopyOf = (workspace: WorkspaceRow): FolderCopy | undefined =>
  workspace.kind === "folder"
    ? {
        form: ownCopy(workspace) ? "copy" : "overlay",
        folder: workspace.repoRoot,
        path: workspace.path,
      }
    : undefined;

/**
 * What a workspace is, one member per lifecycle, read from its row:
 * - `clone`: a delegate's clone of a repository, landed by git.
 * - `folderOverlay`: a delegate's view of any other folder, landed by its
 *   change set (agent layer.ts).
 * - `hostFolder`: a host-scope delegate's own folder on the host
 *   (schema.ts `workspaces.host`): no clone, no boundary, nothing landed or
 *   held; settled, its scratch dir goes and its row is archived
 *   ({@link settleHost}), its folder untouched.
 * - `stageClone`: the clone a place's stage runs in (core
 *   `StageCloneFrame`): no work item, settled once that stage sleeps.
 *
 * The columns never name two of these at once: each is filed by its own
 * path ({@link openWorkspace}, `startHost`, {@link fileStage}).
 */
export type Workspace =
  | { kind: "clone"; row: WorkspaceRow }
  | { kind: "folderOverlay"; row: WorkspaceRow }
  | { kind: "hostFolder"; row: WorkspaceRow }
  | { kind: "stageClone"; row: WorkspaceRow; place: string };

/** The member of {@link Workspace} `row` is. */
export const workspaceOf = (row: WorkspaceRow): Workspace => {
  if (row.host) {
    return { kind: "hostFolder", row };
  }
  if (row.stageFor) {
    return { kind: "stageClone", row, place: row.stageFor };
  }
  return row.kind === "folder"
    ? { kind: "folderOverlay", row }
    : { kind: "clone", row };
};

/** Whether `row` is a host-scope delegate's folder: no clone and no boundary. */
export const isHostFolder = (row: WorkspaceRow): boolean =>
  workspaceOf(row).kind === "hostFolder";

/** Whether `row` is a delegate's view of a folder, landed by its change set. */
export const isFolderOverlay = (row: WorkspaceRow): boolean =>
  workspaceOf(row).kind === "folderOverlay";

/**
 * A workspace as its machine is told about it: a clone and its boundary. A
 * host-scope row (schema.ts `workspaces.host`) is the host's own folder,
 * which no machine call may treat as a clone (an archive deletes one), so
 * naming one throws.
 */
export const refOf = (workspace: WorkspaceRow): WorkspaceRef => {
  if (isHostFolder(workspace)) {
    throw new Error(
      `workspace ${handle(workspace.id)} is a host-scope delegate's folder ${workspace.path}: no clone and no boundary to act on`
    );
  }
  return { id: workspace.id, path: workspace.path };
};

/** How long the report's git reads may take. */
export const GIT_TIMEOUT_MS = 60_000;

/** Runs of whitespace between the counts a git read prints. */
export const SPACES = /\s+/u;

/** What an item's branch and its assets folder are named by: its task, else its own short id. */
export const landingKey = (item: Pick<WorkItemRow, "id" | "taskId">): string =>
  item.taskId ?? item.id.slice(0, 8);

/**
 * Where an item's outputs land in its project's folder: `assets/tsk-12/`
 * for an attempt at a task, `assets/<item>/` for a work item of none.
 */
export const outputsFolder = (item: Pick<WorkItemRow, "id" | "taskId">) =>
  `assets/${landingKey(item)}`;

/** `$TMPDIR/outputs/` as a delegate is told of it (core `OUTPUTS_DIR`). */
export const SCRATCH_OUTPUTS = `$TMPDIR/${OUTPUTS_DIR}/`;

/**
 * The shell that lists the workspace's `$TMPDIR/outputs/`, a line a file:
 * `file <bytes> <path under outputs/>`, or `link 0 <path>` for a link (which
 * could lead anywhere, so it is never read). Nothing when there is no such
 * folder.
 */
export const SCRATCH_OUTPUTS_LIST = `if [ -n "$TMPDIR" ] && [ -d "$TMPDIR/${OUTPUTS_DIR}" ]; then cd "$TMPDIR/${OUTPUTS_DIR}" && find . -mindepth 1 \\( -type l -o -type f \\) | LC_ALL=C sort | while IFS= read -r f; do f="\${f#./}"; if [ -L "$f" ]; then echo "link 0 $f"; else echo "file $(wc -c < "$f" | tr -d ' ') $f"; fi; done; fi`;

/** One entry of `$TMPDIR/outputs/`: its path under it, its size, whether it is a link. */
export interface ScratchOutput {
  link: boolean;
  path: string;
  size: number;
}

/** The line between the parts of one read of a workspace ({@link unlandedOf}). */
const READ_PART = "--cawco-part--";

/** {@link SCRATCH_OUTPUTS_LIST}'s answer, read. */
export const scratchOutputsOf = (stdout: string): ScratchOutput[] =>
  stdout
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const [kind, size, ...rest] = line.split(" ");
      const path = rest.join(" ");
      return (kind === "file" || kind === "link") && path
        ? [{ link: kind === "link", path, size: Number(size) }]
        : [];
    });

/** Why an archive on purpose is refused, in the words its caller reads (`workspace`'s handle, each waiting artifact by its link). */
type WaitingWords = (ws: string, links: readonly string[]) => string;

/**
 * One thing that holds a workspace whose items have all ended ({@link
 * createWorkspaces} `holdsOf`), and its words: a place's stage that runs
 * (a stage clone's only hold), an item's landing that still runs, a
 * session attached there, a message on its way to one, a continuation
 * under way, a stage running in it or an artifact it serves still owed, a
 * project's folder inside it.
 */
interface WorkspaceHold {
  kind:
    | "attached"
    | "continuation"
    | "landing"
    | "place"
    | "send"
    | "served"
    | "stage";
  words: string;
}

/** What one {@link settle} came to. */
export type Settled =
  | { kind: "retired"; carry: string | null }
  | { kind: "held"; held: HeldWork }
  | { kind: "deferred"; hold: string }
  | { kind: "failed"; reason: string }
  | { kind: "none" };

/**
 * What workspaces read of the hub that work items read nothing of: the hub
 * hands it to createWorkItems as one `forWorkspaces`, passed on whole.
 */
/**
 * Why a design whose workspace went can't come back as it is opened
 * (workspaces.ts `revive`): `origin` no longer holds the commit it retired
 * on (`commit`, the branch that held it); it was discarded; it retired with
 * no head the hub can place (`unrecorded`); its machine is away
 * (`offline`, which passes once the machine answers); or its cut again
 * failed for another reason, `why` its machine's words.
 */
export type GoneWhy =
  | { kind: "commit"; branch: string }
  | { kind: "discarded" }
  | { kind: "unrecorded" }
  | { kind: "offline" }
  | { kind: "failed"; why: string };

/**
 * What opening a design whose workspace went did (workspaces.ts `revive`):
 * the workspace it opens in is on its machine now (cut again, or there all
 * along), `moved` when that is a later workspace its work went on in; or
 * why it can't come back.
 */
export type Revived =
  | { kind: "here"; workspace: WorkspaceRow; moved?: true }
  | { kind: "gone"; why: GoneWhy };

export interface WorkspacesHub {
  /**
   * The Claude account session `instanceId`'s next launch on `machineId`
   * runs on, as the hub's launch grant will name it (`ItemPlacement`'s
   * `launchesOn`); none for a session that is not Claude's, or whose launch
   * would be refused. What a workspace cut again for it names, so its
   * boundary starts reading that account's user layer.
   */
  readonly launchesOn: (
    machineId: string,
    instanceId: string
  ) => string | undefined;
  /**
   * Whether a create is making a preview from workspace `id` now, its
   * server started and its row not yet written (artifacts service
   * `makingFrom`): its retirement waits for it ({@link servedHold}).
   */
  readonly makingFrom?: (id: string) => boolean;
  /**
   * Whether a send pending for the session may start a turn in it (server.ts
   * `startsTurnIn`): it wakes the session in its workspace, which holds the
   * workspace ({@link holdsOf}). One kept for a stopped session no such send
   * has woken holds nothing.
   */
  readonly sendWakes: (instanceId: string) => boolean;
  /**
   * Why the stages of `key` on machine `machineId` hold the clone they run
   * in, in words (server.ts `stageHold`): `key` a workspace's id for its
   * preview servers and sheets, a place's for its stage clone. One starts,
   * wakes or serves as its machine last said (core `StageFrame`), or its
   * machine registered a moment ago and has not said them again. Nothing
   * once every one sleeps (agent stage.ts: half an hour unused), failed or
   * was never heard.
   */
  readonly stageRuns: (key: string, machineId: string) => string | undefined;
  /**
   * Whether the session that started an item's work, its `parentInstanceId`,
   * will never decide held work: a routine's or a design check's run, which
   * no session started, a session the hub holds no row of, or one over for
   * good (server.ts `overForGood`). Its unique work goes to a carry and the
   * workspace with it ({@link closeSettled}), nobody asked.
   */
  readonly starterGone: (parentInstanceId: string) => boolean;
  /**
   * Of the artifacts a workspace serves, those waiting on the person (what
   * Needs you lists), with the decision pages waiting on him that show one
   * of them (artifacts service `waitingOnPerson`): its archive or discard on
   * purpose refuses while any is ({@link servedFrom}).
   */
  readonly waitingOnPerson?: (served: readonly ArtifactRow[]) => ArtifactRow[];
  /** A workspace was settled on its machine, archived or held: the dashboards draw it so. */
  readonly workspaceChanged?: (workspace: WorkspaceRow) => void;
}

export interface WorkspacesDeps extends WorkspacesHub {
  /** Runs a machine-scoped daemon function; throws the machine's own words. */
  readonly call: MachineCall;
  /**
   * Runs a command on a machine, in a directory — inside `workspace`'s
   * boundary when one is named; throws when the machine cannot. Its limit
   * stands while it waits for a shared machine slot; on a paused machine it
   * waits for the pause's end, and one a pause cancels runs again after it
   * (or answers `cancelled`, `how.movable`); `how.onWait` hears each wait.
   */
  readonly command: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number,
    workspace?: WorkspaceRef,
    how?: CommandOptions
  ) => Promise<CommandResult>;
  readonly db: DbShape;
  /**
   * Store stop intent and wait for the machine's positive end confirmation,
   * for `waitMs` at most. Returns at once for a session already ended or with
   * no process on its machine.
   */
  readonly end: (instanceId: string, waitMs?: number) => Promise<void>;
  /** Whether this hub process runs item `itemId`'s landing now (landing-run.ts `landingRuns`). */
  readonly landingRuns: (itemId: string) => boolean;
  readonly leadFor: (item: WorkItemRow) => InstanceRow | undefined;
  readonly mayReopen: (item: WorkItemRow, origin: NeutralOrigin) => boolean;
  /** The problem of a start on a machine the owner paused (work-items.ts `notPaused`), or nothing. */
  readonly notPaused: (
    machineId: string
  ) =>
    | ReturnType<
        typeof problem<
          409,
          { code: "work-item-machine-paused"; detail: string }
        >
      >
    | undefined;
  readonly report: (
    row: InstanceRow,
    body: string,
    failed: boolean,
    notice?: boolean,
    headline?: string,
    outputs?: string[]
  ) => void;
}

export const createWorkspaces = ({
  call,
  command,
  db,
  end,
  landingRuns,
  launchesOn,
  leadFor,
  makingFrom,
  mayReopen,
  notPaused,
  report,
  sendWakes,
  stageRuns,
  starterGone,
  waitingOnPerson,
  workspaceChanged,
}: WorkspacesDeps) => {
  /** Creates this hub is still waiting for; register recovery leaves those to their caller. */
  const opening = new Set<string>();
  const discarding = new Map<string, Promise<void>>();
  /** The filed and unfiled cases use the same machine archive, acknowledged before forgetting it. */
  const discardCreate = (id: string, machineId: string): Promise<void> => {
    const pending = discarding.get(id);
    if (pending !== undefined) {
      return pending;
    }
    const unmade: WorkspaceArchive = { id, unlanded: "unmade" };
    const discarded = call(machineId, CONTROL_WORKSPACE_ARCHIVE, [unmade])
      .then(() => db.finishWorkspaceCreate(id))
      .finally(() => discarding.delete(id));
    discarding.set(id, discarded);
    return discarded;
  };
  /** Replays durable discards, including creates whose reply a previous hub never received. */
  const discardUnfiled = (machineId: string): void => {
    for (const { id } of db.workspaceCreatesOn(machineId)) {
      if (opening.has(id)) {
        continue;
      }
      discardCreate(id, machineId).catch((error: unknown) => {
        console.warn(
          `[workspaces] discard ${id} on ${machineId} is still pending: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }
  };
  /** The one workspace `needle` names; refused when it names none or several. */
  const namedWorkspace = (needle: string) => {
    const named = db.workspacesNamed(needle.trim());
    if (named.length > 1) {
      return problem(404, {
        code: "workspace-ambiguous",
        detail: `"${needle}" names ${named.length} workspaces. Pass the full workspace id.`,
      });
    }
    const [found] = named;
    if (!found) {
      return problem(404, {
        code: "workspace-unknown",
        detail: `No workspace "${needle}".`,
      });
    }
    return found;
  };
  /** The paths a workspace's items handed over as outputs: `git status` passes over them. */
  const handedOver = (workspace: WorkspaceRow): string[] =>
    db.workspaceOutputs(workspace.id);
  /** A held workspace's work as its row keeps it (schema.ts `workspaces.holding`). */
  const heldWork = (
    workspace: WorkspaceRow & { holding: WorkspaceHolding }
  ): HeldWork => ({
    ...workspace.holding,
    heldAt: (workspace.heldAt ?? workspace.createdAt).toISOString(),
    holds: holdingWords(workspace.holding),
    size: sizeWords(workspace.holding.bytes),
    machine: machineName(db, workspace.machineId),
    machineId: workspace.machineId,
    path: workspace.path,
    workspaceId: workspace.id,
  });
  /** Whether a workspace's row is held with what it holds on record. */
  const isHeld = (
    workspace: WorkspaceRow
  ): workspace is WorkspaceRow & { holding: WorkspaceHolding } =>
    workspace.state === "held" && workspace.holding !== null;
  /**
   * The commits of workspace `id` whose work is on its base branch through a
   * workspace cut `from` it that landed them (landing-run.ts `vouchLanded`): what its
   * archive does not count as its own (core `WorkspaceArchive.landed`).
   */
  const landedFrom = (id: string): string[] =>
    db
      .workspacesCutFrom(id)
      .flatMap((cut) =>
        cut.cutFromLanded && cut.cutFromCommit !== null
          ? [cut.cutFromCommit]
          : []
      );
  /** A notice about `workspace` to the session its latest item reports to, as `words` writes it of that item. */
  const workspaceNotice = (
    workspace: WorkspaceRow,
    words: (latest: WorkItemRow) => { headline: string; text: string }
  ): void => {
    const [latest] = db.workItemsIn(workspace.id);
    const [row] = latest ? db.getInstancesByIds([latest.instanceId]) : [];
    if (!(latest && row)) {
      return;
    }
    const { text, headline } = words(latest);
    report(row, text, false, true, headline);
  };
  /**
   * Tells the session that started a workspace's work, its latest item's
   * parent, that the workspace was just held, through its report path as a
   * notice: what it holds, and the two ways on; a clone CawCo did not read
   * (`refused`), why, and how it goes. Only that session decides
   * held work; nobody else is asked (2026-10-18: 38 held workspaces sat in
   * the owner's list, every one his to sort).
   */
  const heldNotice = (workspace: WorkspaceRow, work: HeldWork): void => {
    workspaceNotice(workspace, (latest) => {
      if (work.refused) {
        return {
          text: workWords.refusedNotice(
            handle(workspace.id),
            latest.title,
            work.machine,
            work.refused,
            work.size,
            workspace.path
          ),
          headline: workWords.refusedHeadline(workspace.id.slice(0, 8)),
        };
      }
      const named = work.excluded?.length
        ? ` Kept out of git by its own excludes: ${work.excluded.join(", ")}.`
        : "";
      return {
        text: `Workspace ${handle(workspace.id)} of “${latest.title}” on ${work.machine} holds ${work.holds} (${work.size} at ${workspace.path}) that is nowhere else, so it was kept, not retired.${named} It is yours to decide: continue it (delegate with workspace: "${handle(workspace.id)}", or with from: "${handle(workspace.id)}" for a fresh delegate on its commits), or discard it (discard_workspace with workspace: "${handle(workspace.id)}"), which saves that work to a carry in ~/.cawco/carries on ${work.machine} and removes the clone.`,
        headline: `Workspace ${workspace.id.slice(0, 8)} holds ${work.holds}: continue it or discard it.`,
      };
    });
  };
  /**
   * Where an archived workspace is cut again, as its row keeps it: where its
   * machine said its HEAD was. A discard's carry is let go of, and its clone
   * is cut again nowhere; a retirement's carry (`retired`, its items landing
   * none) is cut again with its commits ({@link recut}).
   */
  const cutAgainAt = (
    head: WorkspaceCut | undefined,
    carry: string | null,
    retired: boolean
  ): WorkspaceCut | null => {
    if (!head) {
      return null;
    }
    if (!carry) {
      return head;
    }
    return retired ? { ...head, carry } : null;
  };
  /**
   * Whether a settled workspace's work goes to a carry rather than holding
   * it: every item of it lands none (what it hands in are its outputs,
   * copied out as it finished; its commits feed nothing), and its latest
   * ended on its own, done or failed. One its parent, the person or the hub
   * stopped is the stopper's to decide, and is held. On 2026-10-23 drawings,
   * decision pages and research reads sat held with 1 to 4 commits each,
   * their deliverables long since handed in.
   */
  const carriesOff = (items: readonly WorkItemRow[]): boolean => {
    const [latest] = items;
    return (
      latest !== undefined &&
      latest.state !== "cancelled" &&
      latest.stoppedBy === null &&
      items.every((item) => item.lands === "none")
    );
  };
  /**
   * Whether the session that started a workspace's work, its latest item's
   * parent, will never decide what its clone holds (`starterGone`): a
   * routine's run, or a parent that ended. Its unique work is saved to a
   * carry and the workspace removed, nobody asked (the owner's rule that
   * unlanded work is never deleted, kept by the carry, commit dbe1d52294;
   * tsk-327, 2026-11-15).
   */
  const startedByNoOne = (items: readonly WorkItemRow[]): boolean => {
    const [latest] = items;
    return !!latest?.parentInstanceId && starterGone(latest.parentInstanceId);
  };
  /**
   * Tells the session that started a workspace's work, its latest item's
   * parent, as a notice, that the workspace retired with its commits in a
   * carry ({@link carriesOff}): where that carry is, and that a handoff or
   * follow-up cuts the clone again with them ({@link recut}).
   */
  const carryNotice = (workspace: WorkspaceRow, carry: string): void => {
    const machine = machineName(db, workspace.machineId);
    const copy = folderCopyOf(workspace);
    workspaceNotice(workspace, (latest) =>
      copy
        ? {
            text: carryWords.folderNotice(
              handle(workspace.id),
              latest.title,
              carry,
              machine,
              copy
            ),
            headline: carryWords.folderHeadline(
              workspace.id.slice(0, 8),
              carry,
              machine
            ),
          }
        : {
            text: workWords.carriedNotice(
              handle(workspace.id),
              latest.title,
              carry,
              machine,
              workspace.path
            ),
            headline: workWords.carriedHeadline(
              workspace.id.slice(0, 8),
              carry,
              machine
            ),
          }
    );
  };
  /**
   * What a workspace's `$TMPDIR/outputs/` holds, copied into the project's
   * folder under its latest item's assets folder before the workspace
   * closes, `$TMPDIR` with it ({@link closeWorkspace}): an item that ended
   * without finishing (cancelled, failed, reopened and left) collected
   * nothing at finish_item, and on 2026-10-25 a delegate's report there went
   * with its workspace. Read on its machine's host with its boundary killed
   * first ({@link CONTROL_WORKSPACE_OUTPUTS}), as the archive after it reads
   * the copy: a workspace whose boundary cannot start closes all the same.
   * A copy that fails keeps the workspace: closing is
   * refused with why, and the next settle tries again. A host-scope one's
   * are read as they stand ({@link CONTROL_HOST_OUTPUTS}) before its scratch
   * dir goes ({@link settleHost}). An item of no project has no folder to
   * copy into.
   */
  const keepScratchOutputs = async (workspace: WorkspaceRow) => {
    const item = db.workItemsIn(workspace.id).find((one) => one.projectId);
    if (!item?.projectId) {
      return;
    }
    const folder = outputsFolder(item);
    try {
      const read = isHostFolder(workspace)
        ? await hostOutputsRead(workspace)
        : await call(workspace.machineId, CONTROL_WORKSPACE_OUTPUTS, [
            refOf(workspace),
          ]);
      const files = read.files.map((one) => ({
        path: `${folder}/${one.path}`,
        content: Buffer.from(one.content, "base64"),
      }));
      if (files.length === 0) {
        return;
      }
      const written = await writeFolderFiles(item.projectId, files, {
        author: { name: item.title },
        message: `assets: ${SCRATCH_OUTPUTS} of work item ${item.id.slice(0, 8)}, kept as its workspace closed`,
      });
      if (written instanceof ElysiaStatus) {
        return problem(written.status, {
          code: "workspace-outputs-not-kept",
          detail: `its ${SCRATCH_OUTPUTS} could not be copied into ${folder}/ of its project's folder, so it stays: ${written.response.detail}`,
        });
      }
      console.log(
        `[workspaces] ${workspace.id}: ${SCRATCH_OUTPUTS} copied into ${folder}/ before it closed ${written.changed ? `at ${written.sha.slice(0, 9)}` : "(already there, unchanged)"}: ${written.paths.join(", ")}`
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw thrownAgain(
        error,
        `its ${SCRATCH_OUTPUTS} could not be copied into ${folder}/ of its project's folder, so it stays: ${reason}`
      );
    }
  };
  /**
   * A control on a host-scope workspace's scratch dir (agent
   * host-scratch.ts), answered `none` by an agent from before it
   * ({@link knowsNotControl}): that agent gave the session no scratch dir,
   * so it holds nothing to read or remove.
   */
  const onHostScratch = async <K extends ControlName>(
    workspace: WorkspaceRow,
    method: K,
    args: ControlArgs<K>,
    none: ControlReply<K>
  ): Promise<ControlReply<K>> => {
    try {
      return await call(workspace.machineId, method, args);
    } catch (error) {
      if (knowsNotControl(error, method)) {
        return none;
      }
      throw error;
    }
  };
  /** A host-scope workspace's `$TMPDIR/outputs/`, each regular file with its bytes ({@link CONTROL_HOST_OUTPUTS}). */
  const hostOutputsRead = (
    workspace: WorkspaceRow
  ): Promise<WorkspaceOutputs> =>
    onHostScratch(
      workspace,
      CONTROL_HOST_OUTPUTS,
      [{ id: workspace.id, read: true }],
      { files: [] }
    ).then((read) => {
      // A listing where bytes were asked is not its reply: the machine's
      // malformed answer, as every call answers one (machine-answers.ts).
      if ("listed" in read) {
        throw new MachineProblem(
          problem(502, {
            code: MALFORMED_REPLY,
            detail: `${machineName(db, workspace.machineId)} answered a read of ${workspace.id}'s outputs with their listing`,
          })
        );
      }
      return read;
    });
  /**
   * A workspace closed on its machine ({@link CONTROL_WORKSPACE_ARCHIVE}):
   * its boundary killed first and never started, then what it holds that is
   * nowhere else read on the host, and done with as `unlanded` says
   * ({@link WorkspaceUnlanded}), or with `discard` saved to a carry first
   * ({@link CONTROL_WORKSPACE_DISCARD}, which an agent that cannot write
   * one refuses), and so with `carry` (its items land none,
   * {@link carriesOff}, or its starter never decides, {@link
   * startedByNoOne}), whose carry it is cut again with; `skip`, its
   * items' handed-over outputs. The commits its
   * `from` cuts landed are not its own ({@link landedFrom}). Archived, its
   * places go with it and its row says so, with the carry and where its
   * clone's HEAD was ({@link recut} cuts it again there); holding work (only
   * a `keep` answers so) its row is held with what it holds, its clone and
   * places standing, and the session that started its work is told
   * ({@link heldNotice}) as it becomes held.
   */
  const closeWorkspace = async (
    workspace: WorkspaceRow,
    unlanded: WorkspaceUnlanded | "discard" | "carry",
    skip: string[] = []
  ) => {
    const kept = await keepScratchOutputs(workspace);
    if (kept instanceof ElysiaStatus) {
      return kept;
    }
    const discard = unlanded === "discard" || unlanded === "carry";
    const landed = landedFrom(workspace.id);
    const request: WorkspaceArchive = {
      ...refOf(workspace),
      base: workspace.base,
      unlanded: discard ? "keep" : unlanded,
      skip,
      ...(landed.length > 0 ? { landed } : {}),
    };
    // The machine's answer, as its type: what it holds and where its HEAD
    // was are kept on the workspace's row.
    const { carry, head, held } = await call(
      workspace.machineId,
      discard ? CONTROL_WORKSPACE_DISCARD : CONTROL_WORKSPACE_ARCHIVE,
      [request]
    );
    if (held) {
      const holding =
        db.updateWorkspace(workspace.id, {
          state: "held",
          holding: held,
          heldAt: new Date(),
          boundaryPid: null,
        }) ?? workspace;
      workspaceChanged?.(holding);
      const work = heldWork({ ...holding, holding: held });
      console.log(
        `[workspaces] ${workspace.id} on ${work.machine}: held, ${work.holds} (${work.size} at ${workspace.path}); the session that started its work continues it or discards it`
      );
      if (workspace.state !== "held") {
        heldNotice(workspace, work);
      }
      const inHold: ArchivedWorkspace = {
        workspace: holding,
        carry: null,
        held: work,
      };
      return inHold;
    }
    const archived =
      db.updateWorkspace(workspace.id, {
        state: "archived",
        boundaryPid: null,
        holding: null,
        heldAt: null,
        ...headColumns(cutAgainAt(head, carry, unlanded === "carry")),
        ...(carry ? { carry } : {}),
      }) ?? workspace;
    workspaceChanged?.(archived);
    const closed: ArchivedWorkspace = { workspace: archived, carry };
    return closed;
  };
  /**
   * Refuses session `from` the discard of workspace `needle` when it is
   * not one of that session's (work-items.ts `discardFor`); the workspace when it
   * is. What a discard asked of the person checks before it is recorded.
   */
  const discardable = (from: string, needle: string) => {
    const workspace = namedWorkspace(needle);
    if (workspace instanceof ElysiaStatus) {
      return workspace;
    }
    const items = db.workItemsIn(workspace.id);
    const ours =
      workspace.createdByInstanceId === from ||
      items.some(
        (item) => item.parentInstanceId === from || leadFor(item)?.id === from
      );
    if (!ours) {
      return problem(403, {
        code: "workspace-discard-not-yours",
        detail: `Workspace ${handle(workspace.id)} is not one of yours: discard_workspace lets go of a workspace your own delegates worked in. Nothing was deleted.`,
      });
    }
    return workspace;
  };
  /** Session statuses whose process may still run a command in its workspace. */
  const ATTACHED: ReadonlySet<InstanceStatus> = new Set([
    "running",
    "starting",
    "unknown",
    "stopping",
  ]);
  /** Sessions whose kept sends wait for their workspace's turn and cut (work-items.ts `recutFor`): one wait each. */
  const recutWaits = new Set<string>();
  /** Items whose session's continuation is being prepared, by count: their workspace is held ({@link holdsOf}). */
  const continuing = new Map<string, number>();
  /** A continuation's stages before it settles: its job still reads or starts in the clone. */
  const CONTINUING = new Set(["filing", "summarising", "starting"]);
  /**
   * A workspace's own folders, which go with it: its copy ({@link ownCopy})
   * and its scratch dir (its commands' `TMPDIR`). A Linux view's path is the
   * person's folder, which its retirement never touches, so nothing there
   * (a project's place) is the workspace's.
   */
  const rootsOf = (workspace: WorkspaceRow): string[] => [
    ...(ownCopy(workspace) ? [workspace.path] : []),
    ...(workspace.tmp ? [workspace.tmp] : []),
  ];
  /**
   * THE ONE READ OF WHAT A WORKSPACE SERVES: the artifacts, any session's,
   * whose row names it (db artifacts.ts `previewing`: a port preview or a
   * sheet naming it), a held next version among them. A folder preview is
   * none: the hub keeps its files (artifacts/preview-folder.ts). None of
   * them holds it: once its work is over and no stage runs in it, it goes,
   * and opening one of them brings it back ({@link revive}). Its archive or
   * discard, on purpose, refuses while any of them, or a decision page
   * showing one, waits on the person ({@link waitingFrom}).
   */
  const servedFrom = (workspace: WorkspaceRow): ArtifactRow[] =>
    db.artifacts.previewing(workspace.id);
  /**
   * How long a workspace cut again for a design being opened ({@link
   * revive}) is held for that open's stage to start and be heard: a place's
   * clone and install, then its start (core `STAGE_CLONE_MS`,
   * `STAGE_READY_MS`), what the panel's cover waits for at most. Once its
   * machine says the stage runs, the stage holds it (`stageRuns`).
   */
  const REVIVE_START_MS = STAGE_CLONE_MS + STAGE_READY_MS;
  /** Each workspace cut again for an open, by when ({@link revive}): held {@link REVIVE_START_MS} for the open's stage. */
  const revivedAt = new Map<string, number>();
  /**
   * THE ONE READ OF WHAT A WORKSPACE SERVES THAT HOLDS IT, in words, or
   * nothing: a stage running in it (`stageRuns`: a preview's server or a
   * sheet in use, which sleeps half an hour after its last use), an open
   * that just cut it again starting its stage ({@link revivedAt}), or a
   * preview being made from it. No artifact holds it (the owner's pick on
   * 2026-11-22, "Comes back when you open it"): four rules that guessed
   * when the person was done with a design (a look, a seen mark, an act
   * since its put, its row standing) each closed one he was using, or kept
   * 0.7 GB per design on a disk 96% full. Opening one whose workspace went
   * cuts it again at its last version ({@link revive}). The hub keeps awake
   * only what waits on the person, its maker awake (artifacts service
   * `keepWaitingUp`).
   */
  const servedHold = (workspace: WorkspaceRow): string | undefined => {
    const stage = stageRuns(workspace.id, workspace.machineId);
    if (stage) {
      return stage;
    }
    const revived = revivedAt.get(workspace.id);
    if (revived !== undefined) {
      if (Date.now() - revived < REVIVE_START_MS) {
        return "it was cut again for a design being opened, and that design's stage is starting";
      }
      revivedAt.delete(workspace.id);
    }
    // A create's server started there before its row names it: on
    // 2026-11-04 a hand-up's workspace retired between the two, its server
    // ended under the hand-up's check (probe preview-rehand).
    if (makingFrom?.(workspace.id)) {
      return "a preview is being made from it";
    }
  };
  /**
   * What an archive or discard of a workspace on purpose waits on: what it
   * serves ({@link servedFrom}) that waits on the person, with every
   * decision page waiting on the person that shows one of those (artifacts
   * service `waitingOnPerson`). Nothing of them is lost while it waits:
   * the session hands each up again from another workspace (its source
   * moves through its one write, db artifacts.ts `resource`, and this one
   * is free), the person settles or deletes it, or the person decides the
   * archive goes anyway (the dashboard's confirm, or his approval of the
   * session's ask, server.ts `discard_workspace`).
   */
  const waitingFrom = (workspace: WorkspaceRow): ArtifactRow[] =>
    waitingOnPerson?.(servedFrom(workspace)) ?? [];
  /** Why an archive of `workspace` stops, in `refused`'s words, while what it serves waits on the person ({@link waitingFrom}); nothing without words (he decided it goes). */
  const stoppedWhileWaiting = (
    workspace: WorkspaceRow,
    refused: WaitingWords | undefined
  ) => {
    const waiting = refused ? waitingFrom(workspace) : [];
    return refused && waiting.length > 0
      ? problem(409, {
          code: "workspace-serves-waiting",
          detail: refused(
            handle(workspace.id),
            waiting.map((row) => artifactLink(row.id, row.title))
          ),
        })
      : undefined;
  };
  /**
   * The projects' places inside a workspace's clone or its scratch dir, other
   * than the workspace's own, in words, or nothing. On 2026-10-17 one was
   * retired with two live test projects' folders in its scratch dir, and they
   * went with it.
   */
  const placesIn = (workspace: WorkspaceRow): string | undefined => {
    const roots = rootsOf(workspace);
    const inside = (path: string): boolean =>
      roots.some((root) => path === root || path.startsWith(`${root}/`));
    const places = db
      .listProjects()
      .flatMap((project) =>
        project.places
          .filter(
            (place) =>
              place.machineId === workspace.machineId && inside(place.path)
          )
          .map((place) => `${project.name} at ${place.path}`)
      );
    if (places.length > 0) {
      return `${places.length === 1 ? "a project's folder is" : "projects' folders are"} inside it: ${places.join(", ")}`;
    }
  };
  /**
   * EVERYTHING THAT HOLDS A WORKSPACE WHOSE ITEMS HAVE ALL ENDED, in the
   * order its words are told; none when nothing does. A hold defers its
   * retirement until it goes, never cancels it. What holds depends on what
   * the workspace is ({@link Workspace}):
   * - a stage clone: its place's stage while it runs, and nothing else;
   * - any other: the landing of one of its items still running (its run
   *   settles the workspace again as it ends, landing-run.ts `settleLanding`), a
   *   session of its items whose process may still run there (one asleep,
   *   stopped or failed has none), a message on its way that wakes one of
   *   those sessions there, a continuation of one of them being prepared or
   *   under way (it reads the clone and its new session starts there,
   *   taking the item on);
   * - and what it serves that holds it ({@link servedHold}), or a
   *   project's folder inside it ({@link placesIn}): inside its clone or
   *   its scratch dir, a host-scope folder's being its scratch dir, which
   *   its settle removes ({@link settleHost}); neither for one whose copy
   *   its machine just said is gone (`clones`, {@link copyGone}): nothing
   *   can be served from it, and nothing unique is in it.
   *
   * On 2026-11-20 a preview a host-scope delegate made in its
   * `$TMPDIR/outputs/` and handed up unopened lost its folder as the
   * delegate's item ended: a host-scope folder was held by its items alone.
   * On 2026-10-17 one was retired between the check that its clone was
   * there and a continuation's read of it (attach-continue, "could not read
   * git … ENOENT").
   */
  const holdsOf = (
    workspace: WorkspaceRow,
    items: readonly WorkItemRow[],
    clones?: ReadonlySet<string>
  ): WorkspaceHold[] => {
    const member = workspaceOf(workspace);
    if (member.kind === "stageClone") {
      const stage = stageRuns(member.place, workspace.machineId);
      return stage ? [{ kind: "stage", words: stage }] : [];
    }
    const holds = heldByItems(items);
    if (copyGone(workspace, clones)) {
      return holds;
    }
    const served = servedHold(workspace);
    if (served) {
      holds.push({ kind: "served", words: served });
    }
    const place = placesIn(workspace);
    if (place) {
      holds.push({ kind: "place", words: place });
    }
    return holds;
  };
  /**
   * Whether `workspace`'s own copy, a clone at `~/.worktrees/<name>-<id8>`
   * (agent workspace.ts), is not among the folders its machine listed there
   * this sweep (`clones`, {@link clonesOn}); false with no list. On
   * 2026-11-15, 92 active rows on one machine named a folder gone long ago.
   */
  const copyGone = (
    workspace: WorkspaceRow,
    clones: ReadonlySet<string> | undefined
  ): boolean =>
    clones !== undefined &&
    ownCopy(workspace) &&
    workspace.path.endsWith(`-${workspace.id.slice(0, 8)}`) &&
    !clones.has(workspace.path);
  /** What a workspace's ended items hold it by ({@link holdsOf}): an item's landing, then its sessions'. */
  const heldByItems = (items: readonly WorkItemRow[]): WorkspaceHold[] => {
    const holds: WorkspaceHold[] = [];
    // A stopped item's landing runs on in the clone until its next turn or
    // push ends it (landing.ts `stopped`): closing the clone under it would
    // cut its commands off mid-rebase.
    const landing = items.find((item) => landingRuns(item.id));
    if (landing) {
      holds.push({
        kind: "landing",
        words: `the landing of its item ${landing.id} still runs`,
      });
    }
    const sessions = new Set(items.map((item) => item.instanceId));
    const rows = db.getInstancesByIds([...sessions]);
    const attached = rows.find((row) => ATTACHED.has(row.status));
    if (attached) {
      holds.push({
        kind: "attached",
        words: `its session ${attached.id} is ${attached.status === "stopping" ? "stopping" : "attached"}`,
      });
    }
    const awaited = rows.find((row) => sendWakes(row.id));
    if (awaited) {
      holds.push({
        kind: "send",
        words: `a message to its session ${awaited.id} is on its way`,
      });
    }
    const prepared = items.find((item) => continuing.has(item.id));
    const job = db
      .continuationSlips()
      .find(
        (row) => CONTINUING.has(row.stage) && sessions.has(row.sourceInstanceId)
      );
    if (prepared || job) {
      holds.push({
        kind: "continuation",
        words: `a continuation of its session ${job?.sourceInstanceId ?? prepared?.instanceId} is under way`,
      });
    }
    return holds;
  };
  /**
   * A place's stage clone filed as its machine says it is cut and in step
   * (core `StageCloneFrame`): a new row of the stage kind, or one archived or
   * held made active again (a sheet after it retired cut it again, or it is
   * in use again). `createdBy` is a session working in the place.
   */
  const fileStage = (
    machineId: string,
    frame: StageCloneFrame,
    createdBy: string
  ): void => {
    const [row] = db.workspacesNamed(frame.id);
    if (!row) {
      const path = cutPath(machineId, frame.path);
      const filed = db.createWorkspace({
        id: frame.id,
        machineId,
        repoRoot: cutPath(machineId, frame.repoRoot),
        path,
        // Detached at the checkout's HEAD: no branch of its own, nothing it lands.
        branch: "",
        base: "",
        tmp: frame.tmp,
        state: "active",
        createdByInstanceId: createdBy,
        stageFor: frame.place,
      });
      console.log(
        `[workspaces] ${filed.id} on ${machineName(db, machineId)}: filed, the stage clone of place ${frame.place} at ${path}`
      );
      workspaceChanged?.(filed);
      return;
    }
    if (row.state === "active") {
      return;
    }
    const active =
      db.updateWorkspace(row.id, {
        state: "active",
        holding: null,
        heldAt: null,
        ...headColumns(null),
        tmp: frame.tmp,
      }) ?? row;
    console.log(
      `[workspaces] ${row.id} on ${machineName(db, machineId)}: active again, the stage clone of place ${frame.place} at ${row.path}`
    );
    workspaceChanged?.(active);
  };
  /**
   * Whether an active workspace is one to settle now: its items have all
   * ended, or it is a stage clone, which has none (its place's sheet stage
   * is what holds it).
   */
  const settlable = (
    workspace: WorkspaceRow,
    items: readonly WorkItemRow[]
  ): boolean =>
    (items.length > 0 || workspaceOf(workspace).kind === "stageClone") &&
    !items.some((item) => LIVE.has(item.state));
  /**
   * Each workspace's settle failures in a row ({@link settle}): how many,
   * when the sweep may try it again ({@link SETTLE_RETRIES}), and whether
   * its session was told. On 2026-10-29 five workspaces failed every minute,
   * each failure a log line of its own (its carry's path, stamped with the
   * time, made each reason new), and nobody was told.
   */
  const settleFailures = new Map<
    string,
    { count: number; retryAt: number; told: boolean }
  >();
  /**
   * A settle that failed: its first failure logged, the next try put off
   * ({@link SETTLE_RETRIES}; past its end, until someone asks), and once it has failed
   * {@link SETTLE_FAILS_LASTING} times in a row, the session that started its
   * work told once, as a notice, and the log says so once.
   */
  const settleFailed = (workspace: WorkspaceRow, reason: string): void => {
    const machine = machineName(db, workspace.machineId);
    const was = settleFailures.get(workspace.id);
    const count = (was?.count ?? 0) + 1;
    const step = backoffStep(SETTLE_RETRIES, count, 0);
    const wait = step.kind === "wait" ? step.ms : Number.POSITIVE_INFINITY;
    const failure = {
      count,
      retryAt: Date.now() + wait,
      told: was?.told ?? false,
    };
    if (step.kind === "gave-up") {
      console.warn(
        `[workspaces] ${workspace.id} on ${machine}: its settle failed ${count} times in a row; the sweep tries it no more, a settle asked for still does: ${reason}`
      );
    }
    if (count === 1) {
      console.warn(
        `[workspaces] ${workspace.id} on ${machine}: ${workWords.notRetired(reason)} ${workWords.retriedIn(Math.round(wait / MINUTE_MS))}`
      );
    }
    if (count >= SETTLE_FAILS_LASTING && !failure.told) {
      failure.told = true;
      console.warn(
        `[workspaces] ${workspace.id} on ${machine}: ${workWords.stillNotRetired(count, reason)}`
      );
      workspaceNotice(workspace, (latest) => ({
        text: workWords.notRetiredNotice(
          handle(workspace.id),
          latest.title,
          machine,
          count,
          reason
        ),
        headline: workWords.notRetiredHeadline(workspace.id.slice(0, 8)),
      }));
    }
    settleFailures.set(workspace.id, failure);
  };
  /**
   * The closer of the landing gate's clones (2026-11-17: the hub runs no
   * check of a project's, so none is cut any more): every workspace on
   * `machineId` cut to run a gate step for another (`checks_for` set) and
   * not archived yet is let go of there, its clone deleted unread (`drop`:
   * its commits were its source's, and the rest a build's). Run as the
   * machine registers, so a clone on a machine away at the hub's start goes
   * once it is back. One whose close fails stays, and the next register
   * tries it again. Goes in the release after this one, with the column.
   */
  const closeGateClones = async (machineId: string): Promise<void> => {
    for (const clone of db.gateClonesOn(machineId)) {
      const closed = await closeWorkspace(clone, "drop").catch(
        (error: unknown) =>
          error instanceof Error ? error.message : String(error)
      );
      let failed: string | undefined;
      if (typeof closed === "string") {
        failed = closed;
      } else if (closed instanceof ElysiaStatus) {
        failed = closed.response.detail;
      }
      console.log(
        failed === undefined
          ? `[workspaces] ${clone.id}: the landing gate's clone on ${machineName(db, machineId)} is closed`
          : `[workspaces] ${clone.id}: the landing gate's clone on ${machineName(db, machineId)} was not closed: ${failed}`
      );
    }
  };
  /**
   * A settled workspace closed on its machine ({@link closeWorkspace}): a
   * `keep`, or a `carry` when its items land none ({@link carriesOff}),
   * whose parent is told where the carry is ({@link carryNotice}), or when
   * its starter never decides ({@link startedByNoOne}), told to no one.
   */
  const closeSettled = async (
    workspace: WorkspaceRow,
    items: readonly WorkItemRow[]
  ) => {
    const noOne = startedByNoOne(items);
    const closed = await closeWorkspace(
      workspace,
      carriesOff(items) || noOne ? "carry" : "keep",
      handedOver(workspace)
    );
    if (closed instanceof ElysiaStatus) {
      return closed;
    }
    settleFailures.delete(workspace.id);
    workEndedFor.delete(workspace.id);
    workEndFailures.delete(workspace.id);
    if (closed.held) {
      const held: Settled = { kind: "held", held: closed.held };
      return held;
    }
    // A starter that never decides is told nothing: it reads nothing.
    if (closed.carry && !noOne) {
      carryNotice(closed.workspace, closed.carry);
    }
    const copy = folderCopyOf(workspace);
    console.log(
      `[workspaces] ${workspace.id} on ${machineName(db, workspace.machineId)}: retired, its work over and nothing of it anywhere but ${copy ? "where it landed" : "on its remote"}${closed.carry ? ` or in its carry ${closed.carry}` : ""}; ${copy ? carryWords.folderGone(copy) : `${workspace.path} and what it owned there are gone`}`
    );
    const retired: Settled = { kind: "retired", carry: closed.carry };
    return retired;
  };
  /** {@link closeSettled}, its failure counted ({@link settleFailed}) and answered as `failed`. */
  const closeOrFail = async (
    workspace: WorkspaceRow,
    items: readonly WorkItemRow[]
  ): Promise<Settled> => {
    const failed = (reason: string): Settled => {
      settleFailed(workspace, reason);
      return { kind: "failed", reason };
    };
    try {
      const closed = await closeSettled(workspace, items);
      return closed instanceof ElysiaStatus
        ? failed(closed.response.detail)
        : closed;
    } catch (error) {
      return failed(error instanceof Error ? error.message : String(error));
    }
  };
  /** Each archived workspace whose folder is being cleared ({@link closeLeftClones}), from its turn's start: a cut again of it waits for that ({@link recut}). */
  const reclosing = new Map<string, Promise<void>>();
  /** The last reason each machine's folders could not be listed ({@link clonesOn}): one line per change, not per sweep. */
  const listFailures = new Map<string, string>();
  /**
   * The folders directly under machine `machineId`'s `~/.worktrees`, as its
   * machine lists them now ({@link CONTROL_WORKSPACE_CLONES}), read once per
   * sweep: what tells an archived workspace's clone left standing
   * ({@link closeLeftClones}) and an active one's copy gone
   * ({@link copyGone}). Undefined, logged once, when it could not list them.
   */
  const clonesOn = async (
    machineId: string
  ): Promise<ReadonlySet<MachinePath> | undefined> => {
    try {
      const folders = await call(machineId, CONTROL_WORKSPACE_CLONES, []);
      listFailures.delete(machineId);
      return new Set(
        folders.flatMap((folder) => {
          const path = db.machinePathOn(machineId, folder);
          return path instanceof MachinePathRefused ? [] : [path];
        })
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (listFailures.get(machineId) !== reason) {
        listFailures.set(machineId, reason);
        console.warn(
          `[workspaces] ${machineName(db, machineId)} did not list its ~/.worktrees, so no archived workspace's clone there was looked for, and no active one's was found gone: ${reason}`
        );
      }
      return undefined;
    }
  };
  /**
   * Each archived workspace on `machineId` whose folder its machine still has
   * ({@link CONTROL_WORKSPACE_CLONES}) cleared in its turn: its machine's
   * archive again, unread (`unmade`), its row as it is. An archive deletes
   * the clone whole (agent layer.ts `removeLayer`) and reads what it held
   * first, so whatever stands at its path since was written after it and is
   * none of its work: a probe or OpenCode's MCP pass writing `.probe`,
   * `.context` or `.preview-probe` into an archived workspace's path made
   * the folder again (9 such folders on the hub machine on 2026-10-26), and
   * nothing looked at an archived row again. One being cut again is left to
   * that cut.
   */
  const closeLeftClones = async (
    machineId: string,
    clones: ReadonlySet<MachinePath>
  ): Promise<{ outcome: Settled; workspace: WorkspaceRow }[]> => {
    const done: { outcome: Settled; workspace: WorkspaceRow }[] = [];
    for (const left of db.archivedWorkspacesAt(machineId, [...clones])) {
      if (workspaceTurns.isBusy(left.id) || recutting.has(left.id)) {
        continue;
      }
      const outcome = await inWorkspaceTurn(
        left.id,
        async (): Promise<Settled> => {
          const [now] = db.workspacesNamed(left.id);
          if (now?.state !== "archived" || recutting.has(now.id)) {
            return { kind: "none" };
          }
          const { promise, resolve } = Promise.withResolvers<void>();
          reclosing.set(now.id, promise);
          try {
            await call(now.machineId, CONTROL_WORKSPACE_ARCHIVE, [
              {
                ...refOf(now),
                base: now.base,
                unlanded: "unmade",
                skip: [],
              } satisfies WorkspaceArchive,
            ]);
            console.log(
              `[workspaces] ${now.id} on ${machineName(db, now.machineId)}: archived, and a folder stood at ${now.path} again; it is gone`
            );
            return { kind: "retired", carry: null };
          } finally {
            reclosing.delete(now.id);
            resolve();
          }
        }
      ).catch((error: unknown): Settled => {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[workspaces] ${left.id}: archived, a folder stands at ${left.path} again, and clearing it failed: ${reason}`
        );
        return { kind: "failed", reason };
      });
      done.push({ workspace: left, outcome });
    }
    return done;
  };
  /** The ended items, each with its end, whose sessions' work each workspace's settle last ended ({@link endLeftWork}): once per set, not per sweep. */
  const workEndedFor = new Map<string, string>();
  /** The last failure each workspace's {@link endLeftWork} logged: one line per change, not per sweep. */
  const workEndFailures = new Map<string, string>();
  /**
   * A WORKSPACE WHOSE ITEMS HAVE ALL ENDED RUNS NOTHING BUT WHAT A LANDING
   * RUNS OR AN ARTIFACT SHOWS. Settled while an awake session of its items is
   * all that holds it (`holds`, {@link holdsOf}), its machine ends what
   * those sessions left running in its boundary (core
   * {@link CONTROL_WORKSPACE_WORK_END}: agent boundary/work.ts `endSessionWork`,
   * as an interrupt and a stop do), once per set of ended items; the
   * boundary and the sessions run on, so a handoff resumes one there. Not
   * while its landing runs ({@link WorkspacesDeps.landingRuns}), an artifact shows what it serves
   * ({@link servedHold}: once it holds no more, the next settle ends it),
   * a project's folder is inside it ({@link placesIn}), or a message or
   * continuation is on its way to one of its sessions (its new turn's work
   * is not left work). Why: a done delegate stays awake until it is at rest
   * (login-moves.ts `sleepFinished` then puts it to sleep), or for its idle half
   * hour while its session is kept warm, and until it slept what its
   * commands left ran on; on 2026-10-24 its parent was told to end three
   * pids it left, already gone by the time it looked.
   */
  const endLeftWork = (
    workspace: WorkspaceRow,
    items: readonly WorkItemRow[],
    holds: readonly WorkspaceHold[]
  ): void => {
    const [first] = holds;
    if (!first || holds.some((each) => each.kind !== "attached")) {
      return;
    }
    const hold = first.words;
    const sessions = new Set(items.map((item) => item.instanceId));
    const awake = db
      .getInstancesByIds([...sessions])
      .filter((row) => row.status === "running")
      .map((row) => row.id);
    const ended = items
      .map((item) => `${item.id}@${item.endedAt?.getTime() ?? 0}`)
      .sort()
      .join(" ");
    if (awake.length === 0 || workEndedFor.get(workspace.id) === ended) {
      return;
    }
    workEndedFor.set(workspace.id, ended);
    const machine = machineName(db, workspace.machineId);
    console.log(
      `[workspaces] ${workspace.id} on ${machine}: ${workWords.workEnding(awake, hold)}`
    );
    const asked: WorkspaceWorkEnd = { id: workspace.id, instanceIds: awake };
    detach(
      call(workspace.machineId, CONTROL_WORKSPACE_WORK_END, [asked]).then(
        () => {
          workEndFailures.delete(workspace.id);
        },
        (error: unknown) => {
          // Asked again at the next settle.
          if (workEndedFor.get(workspace.id) === ended) {
            workEndedFor.delete(workspace.id);
          }
          const reason = error instanceof Error ? error.message : String(error);
          if (workEndFailures.get(workspace.id) !== reason) {
            console.warn(
              `[workspaces] ${workspace.id} on ${machine}: ${workWords.workNotEnded(reason)}`
            );
          }
          workEndFailures.set(workspace.id, reason);
        }
      ),
      `end left work ${workspace.id}`
    );
  };
  /**
   * THE end of a workspace's life (schema.ts `WorkspaceState`). An active
   * delegate's workspace whose items have all ended is closed on its machine
   * ({@link closeWorkspace}, a `keep`) once nothing holds it ({@link holdsOf}):
   * archived when its clone holds nothing that is nowhere else, held with
   * what it holds otherwise. A hold defers it to the event that ends the hold
   * (its session asleep or ended, the artifact gone), or the sweep's next
   * look (workspace-retire.ts); held only by its awake sessions, what they
   * left running there ends meanwhile ({@link endLeftWork}). Its sessions are
   * not ended: each is asleep or gone already, and a handoff to one goes on
   * in a clone cut again ({@link recut}). `clones`, the folders its machine listed this sweep, tells a
   * copy gone ({@link copyGone}).
   */
  const settle = async (
    id: string,
    clones?: ReadonlySet<string>
  ): Promise<Settled> => {
    const [workspace] = db.workspacesNamed(id);
    if (workspace?.state !== "active") {
      return { kind: "none" };
    }
    const member = workspaceOf(workspace);
    const items = db.workItemsIn(workspace.id);
    if (member.kind === "hostFolder") {
      return await settleHost(workspace, items);
    }
    if (!settlable(workspace, items)) {
      return { kind: "none" };
    }
    const holds = holdsOf(workspace, items, clones);
    const [hold] = holds;
    if (hold) {
      endLeftWork(workspace, items, holds);
      return { kind: "deferred", hold: hold.words };
    }
    return await closeOrFail(workspace, items);
  };
  /**
   * A host-scope workspace settled ({@link settle}): it has no clone, so
   * nothing of it closes on its machine but its scratch dir (agent
   * host-scratch.ts). Once its items have all ended and nothing holds it (a
   * landing that still runs, a session attached or about to be woken, a
   * continuation under way, an artifact it serves still owed:
   * {@link holdsOf}; the sweep settles it again while one does), what is in
   * its `$TMPDIR/outputs/` is kept in its project's folder
   * ({@link keepScratchOutputs}), its machine removes the scratch dir, and
   * its row is archived, as a repository's is once its work is over. The
   * folder it ran in is the machine's own and stays. A handoff, a follow-up
   * or a continuation to its session files it active again ({@link recut});
   * that session's next spawn makes its scratch dir again. On 2026-11-22,
   * 666 host-scope rows on one machine were still active, their 722 items
   * long ended: a settled one stayed active, and the sweep read one only
   * while a hold kept it.
   */
  const settleHost = async (
    workspace: WorkspaceRow,
    items: readonly WorkItemRow[]
  ): Promise<Settled> => {
    if (!settlable(workspace, items)) {
      return { kind: "none" };
    }
    const [hold] = holdsOf(workspace, items);
    if (hold) {
      return { kind: "deferred", hold: hold.words };
    }
    const stays = (reason: string): Settled => {
      settleFailed(workspace, reason);
      return { kind: "failed", reason };
    };
    try {
      const kept = await keepScratchOutputs(workspace);
      if (kept instanceof ElysiaStatus) {
        return stays(kept.response.detail);
      }
      await onHostScratch(
        workspace,
        CONTROL_HOST_SCRATCH_REMOVE,
        [{ id: workspace.id }],
        undefined
      );
    } catch (error) {
      return stays(error instanceof Error ? error.message : String(error));
    }
    settleFailures.delete(workspace.id);
    const archived =
      db.updateWorkspace(workspace.id, {
        state: "archived",
        boundaryPid: null,
      }) ?? workspace;
    workspaceChanged?.(archived);
    console.log(
      `[workspaces] ${workspace.id} on ${machineName(db, workspace.machineId)}: a host-scope delegate's folder ${workspace.path}, archived: its items have ended, its scratch dir removed, its outputs kept`
    );
    return { kind: "retired", carry: null };
  };
  /**
   * Each workspace's turn: a step runs after every step queued before it,
   * before any queued after. A step is anything that closes the workspace's
   * boundary on its machine or reads its clone through it: its settle, its
   * archive, the bundle a `from` cut takes of it, a read of what it holds
   * on no remote ({@link unlandedOf}). On 2026-10-17 a read ran git through
   * a boundary that the workspace's settle was closing, and failed. A step
   * never takes its own workspace's turn again.
   */
  const workspaceTurns = makeKeyedLock();
  const inWorkspaceTurn = <T>(id: string, work: () => Promise<T>): Promise<T> =>
    workspaceTurns.run(id, work);
  /** Workspaces whose turn now runs work going on in them ({@link goOnIn}): its own send waits on no settle. */
  const goingOn = new Set<string>();
  /**
   * Whether workspace `id`'s turn may be retiring it: a step runs or waits
   * there (its settle among them), and the step running is not work going
   * on in it ({@link goOnIn}), which retires nothing. A send to its session
   * meanwhile waits for that turn ({@link retiredFor}).
   */
  const turnMayRetire = (id: string): boolean =>
    workspaceTurns.isBusy(id) && !goingOn.has(id);
  /**
   * Session `instanceId`'s workspace `workspaceId` cut again in its turn,
   * after whatever runs there, if it is retired by then ({@link recut}):
   * one wait per session ({@link recutWaits}), so nothing when one already
   * waits for it.
   */
  const recutInTurn = (instanceId: string, workspaceId: string) => {
    if (recutWaits.has(instanceId)) {
      return;
    }
    recutWaits.add(instanceId);
    return inWorkspaceTurn(workspaceId, async () => {
      const [now] = db.workspacesNamed(workspaceId);
      const cut = now && recuttable(now) ? await recut(now) : undefined;
      return cut instanceof ElysiaStatus ? cut : undefined;
    }).finally(() => recutWaits.delete(instanceId));
  };
  /**
   * Item `itemId`'s workspace `workspaceId` held for a continuation of its
   * session ({@link continuing}, {@link holdsOf}) until the answered
   * release, which only its first call ends; released, the workspace
   * settles as it stands.
   */
  const holdForContinuation = (
    itemId: string,
    workspaceId: string
  ): (() => void) => {
    continuing.set(itemId, (continuing.get(itemId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      const left = (continuing.get(itemId) ?? 1) - 1;
      if (left > 0) {
        continuing.set(itemId, left);
      } else {
        continuing.delete(itemId);
      }
      // Held no longer by this, it settles as it stands.
      settleSoon(workspaceId);
    };
  };
  /** A settle queued in its workspace's turn and not yet begun: every caller meanwhile shares it. */
  const settleQueued = new Map<string, Promise<Settled>>();
  /**
   * THE way a workspace is settled ({@link settle}), in its turn: asked while
   * one runs, one more runs after it, shared by every caller asking before
   * it begins. The events, the sweep and a read of what the workspace holds
   * all come here. Never rejects. `clones`: the sweep's list of its
   * machine's folders ({@link clonesOn}).
   */
  const settleNow = (
    id: string,
    clones?: ReadonlySet<string>
  ): Promise<Settled> => {
    const queued = settleQueued.get(id);
    if (queued !== undefined) {
      return queued;
    }
    // The turn may begin before inWorkspaceTurn returns, when nothing runs
    // in it: then the settle has begun and is no longer queued to share.
    let begun = false;
    const run = inWorkspaceTurn(id, () => {
      begun = true;
      settleQueued.delete(id);
      return settle(id, clones);
    }).catch((error: unknown): Settled => {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[workspaces] ${id}: its settle failed: ${reason}`);
      return { kind: "failed", reason };
    });
    if (!begun) {
      settleQueued.set(id, run);
    }
    return run;
  };
  /** {@link settleNow}, off the caller's step. */
  const settleSoon = (id: string): void => {
    soon(() => detach(settleNow(id), `settle ${id}`));
  };
  /**
   * A held workspace whose items have all ended and whose starter will
   * never decide it ({@link startedByNoOne}) closed with its unique work in a
   * carry ({@link closeSettled}), once nothing holds it ({@link holdsOf}):
   * on 2026-11-15, 19 such sat held on one machine, 16 of them a routine's
   * runs, each told to no one. One whose starter can still decide stays
   * held for it.
   */
  const carryHeld = async (
    id: string,
    clones?: ReadonlySet<string>
  ): Promise<Settled> => {
    const [workspace] = db.workspacesNamed(id);
    if (workspace?.state !== "held") {
      return { kind: "none" };
    }
    const items = db.workItemsIn(workspace.id);
    if (!(settlable(workspace, items) && startedByNoOne(items))) {
      return { kind: "none" };
    }
    const [hold] = holdsOf(workspace, items, clones);
    if (hold) {
      return { kind: "deferred", hold: hold.words };
    }
    return await closeOrFail(workspace, items);
  };
  /**
   * {@link settle} for each active workspace on `machineId`, one after
   * another, host-scope ones last ({@link settleHost}), then each held one whose starter will never decide it carried
   * off ({@link carryHeld}), then each archived one whose clone is still
   * there closed again ({@link closeLeftClones}): the sweep's look
   * (workspace-retire.ts), its machine's folders listed once for all of
   * them ({@link clonesOn}). A timed look passes over a workspace whose last
   * settle failed until its wait is over ({@link settleFailed}); a look
   * someone `asked` for tries it now. Answers each one's outcome by id.
   */
  const settleOn = async (
    machineId: string,
    asked: boolean
  ): Promise<{ outcome: Settled; workspace: WorkspaceRow }[]> => {
    const done: { outcome: Settled; workspace: WorkspaceRow }[] = [];
    const clones = await clonesOn(machineId);
    // Something runs in its turn now, or its last settle failed and its
    // wait is not over: a later look settles it.
    const passedOver = (workspace: WorkspaceRow): boolean =>
      workspaceTurns.isBusy(workspace.id) ||
      recutting.has(workspace.id) ||
      (!asked && (settleFailures.get(workspace.id)?.retryAt ?? 0) > Date.now());
    for (const workspace of db.activeWorkspacesOn(machineId)) {
      if (!passedOver(workspace)) {
        done.push({
          workspace,
          outcome: await settleNow(workspace.id, clones),
        });
      }
    }
    for (const workspace of db.hostWorkspacesOn(machineId)) {
      if (!passedOver(workspace)) {
        done.push({
          workspace,
          outcome: await settleNow(workspace.id, clones),
        });
      }
    }
    for (const workspace of db.heldWorkspaces()) {
      if (workspace.machineId === machineId && !passedOver(workspace)) {
        done.push({
          workspace,
          outcome: await inWorkspaceTurn(workspace.id, () =>
            carryHeld(workspace.id, clones)
          ),
        });
      }
    }
    if (clones) {
      done.push(...(await closeLeftClones(machineId, clones)));
    }
    return done;
  };
  /**
   * Workspace `id` read again, off the caller's step and in its turn, now
   * that commits it held are on its base branch through a workspace cut from
   * it (landing-run.ts `vouchLanded`): held, it is closed again with those left out
   * ({@link landedFrom}), and retires when they were all it held; active, its
   * settle reads it the same way. A held one that something still holds
   * ({@link holdsOf}: an artifact showing what it serves among them) is not
   * closed again: it stays held, as every retirement waits for that hold,
   * until it is discarded.
   */
  const resettleSoon = (id: string): void => {
    const [workspace] = db.workspacesNamed(id);
    if (workspace?.state === "active") {
      settleSoon(id);
      return;
    }
    if (workspace?.state !== "held") {
      return;
    }
    const again = inWorkspaceTurn(id, async (): Promise<void> => {
      const [now] = db.workspacesNamed(id);
      if (now?.state !== "held") {
        return;
      }
      const [held] = holdsOf(now, db.workItemsIn(now.id));
      const hold = held?.words;
      if (hold) {
        console.log(
          `[workspaces] ${now.id} on ${machineName(db, now.machineId)}: its commits landed through the workspace cut from it, and it stays held: ${hold}`
        );
        return;
      }
      const closed = await closeWorkspace(now, "keep", handedOver(now));
      if (closed instanceof ElysiaStatus) {
        console.warn(
          `[workspaces] ${now.id} on ${machineName(db, now.machineId)}: its commits landed through the workspace cut from it, and it was not closed: ${closed.response.detail}`
        );
        return;
      }
      if (closed.held) {
        return;
      }
      console.log(
        `[workspaces] ${now.id} on ${machineName(db, now.machineId)}: retired, its commits landed through the workspace cut from it and nothing else of it anywhere but on its remote`
      );
    });
    detach(again, `resettle ${id}`);
  };
  /**
   * What workspace `id` holds on no remote, in its turn
   * ({@link inWorkspaceTurn}), so no close of its boundary runs meanwhile.
   * Its settle comes first ({@link settle}): a workspace nothing holds any
   * more is closed there and read as the settle recorded it, held with what
   * it holds, or archived, holding nothing anywhere but its remote. Only one
   * something still holds (a live item, an attached session, a preview) is
   * read now, by git inside its boundary, which that hold keeps up; never
   * waiting (a paused machine or a busy folder throws machine-pause.ts `WouldWait`).
   * Undefined for one archived or gone. Throws the
   * machine's words when git cannot say.
   */
  const unlandedOf = (
    id: string
  ): Promise<Omit<Unlanded, "live"> | undefined> =>
    inWorkspaceTurn(id, async () => {
      await settle(id);
      const [workspace] = db.workspacesNamed(id);
      if (
        !workspace ||
        workspace.state === "archived" ||
        isHostFolder(workspace)
      ) {
        return;
      }
      if (isHeld(workspace)) {
        const { dirty, stashes, ahead } = workspace.holding;
        return { workspaceId: id, changed: dirty + stashes, dirty, ahead };
      }
      // A folder's unlanded work is its change set (agent layer.ts).
      if (workspaceOf(workspace).kind === "folderOverlay") {
        const changes = await call(
          workspace.machineId,
          CONTROL_WORKSPACE_CHANGES,
          [refOf(workspace)]
        );
        const changed = changes.changed.length;
        return { workspaceId: id, changed, dirty: changed, ahead: 0 };
      }
      const skip = handedOver(workspace).map(
        (path) => ` ${shellQuote(`:(exclude,literal)${path}`)}`
      );
      const lines = (name: string): string =>
        `{ [ -z "$${name}" ] || printf '%s\\n' "$${name}"; } | wc -l`;
      // The counts on the first three lines; then, each after a line of its
      // own, the newest commit subjects on no remote and the outputs folder.
      const read = await command(
        workspace.machineId,
        workspace.path,
        `${SAFE_GIT_SHELL}a=$( ${ownCommitsShell(workspace.base || undefined, landedFrom(id))} ) && s=$(git status --porcelain${skip.length > 0 ? ` -- .${skip.join("")}` : ""}) && t=$(git stash list) && echo "$a" && ${lines("s")} && ${lines("t")} && echo ${READ_PART} && git log -${SUBJECTS_READ} --format=%s HEAD --not --remotes=origin && echo ${READ_PART} && { ${SCRATCH_OUTPUTS_LIST}; }`,
        GIT_TIMEOUT_MS,
        refOf(workspace),
        { noWait: true }
      );
      const [counts = "", subjects = "", outputs = ""] = read.stdout.split(
        `${READ_PART}\n`
      );
      const [ahead, dirty, stashes] = counts.trim().split(SPACES).map(Number);
      if (
        read.exitCode !== 0 ||
        [ahead, dirty, stashes].some((count) => !Number.isInteger(count))
      ) {
        throw new Error(
          `git in workspace ${id} on ${machineName(db, workspace.machineId)} said: ${(read.stderr || read.stdout).trim() || `exit ${read.exitCode}`}`
        );
      }
      return {
        workspaceId: id,
        changed: dirty + stashes,
        dirty,
        ahead,
        clone: {
          subjects: subjects.split("\n").filter(Boolean),
          outputs: scratchOutputsOf(outputs).map((one) => one.path),
        },
      };
    });
  /**
   * What keeps a clone from being archived, as the problem: a live item
   * there, a project's folder inside it (even with `discard`: a discard lets
   * go of the clone's own work, never a project's folder there), or what it
   * serves that waits on the person, unless he decided it goes anyway; the
   * archive ends anything else it serves ({@link waitingFrom}).
   */
  const archiveBlocked = (
    workspace: WorkspaceRow,
    refused: WaitingWords | undefined
  ) => {
    const live = db
      .workItemsIn(workspace.id)
      .find((item) => LIVE.has(item.state));
    if (live) {
      return problem(409, {
        code: "workspace-archive-live",
        detail: `Workspace ${handle(workspace.id)} has a live work item: ${live.title} (${handle(live.id)}) is ${live.state}. Stop it before archiving the workspace.`,
      });
    }
    const places = placesIn(workspace);
    if (places) {
      return problem(409, {
        code: "workspace-archive-holds-places",
        detail: `Workspace ${handle(workspace.id)} was not archived and nothing was deleted: ${places}. Delete or move that, then archive it again.`,
      });
    }
    return stoppedWhileWaiting(workspace, refused);
  };
  /** The `archive` method's work, in the workspace's turn: the workspace read as it stands then. */
  const archiveNow = async (
    needle: string,
    discard: boolean,
    /** Its refusal while what it serves waits on the person ({@link waitingFrom}); none when the person decided it goes anyway. */
    refused: WaitingWords | undefined
  ) => {
    const workspace = namedWorkspace(needle);
    if (workspace instanceof ElysiaStatus) {
      return workspace;
    }
    if (workspace.state === "archived") {
      return problem(409, {
        code: "workspace-archived-already",
        detail: `Workspace ${handle(workspace.id)} is already archived.`,
      });
    }
    const member = workspaceOf(workspace);
    if (member.kind === "hostFolder") {
      return problem(409, {
        code: "workspace-archive-host-folder",
        detail: `Workspace ${handle(workspace.id)} is a host-scope delegate's folder ${workspace.path} on ${machineName(db, workspace.machineId)}, not a clone: there is nothing to archive or discard, and nothing was deleted.`,
      });
    }
    const blocked = archiveBlocked(workspace, refused);
    if (blocked) {
      return blocked;
    }
    const skip = handedOver(workspace);
    // Bounded well inside the HTTP call's own idle timeout: a machine that
    // never confirms leaves the workspace active, and the answer says so.
    const stops = await Promise.allSettled(
      [
        ...new Set(db.workItemsIn(workspace.id).map((item) => item.instanceId)),
      ].map((instanceId) => end(instanceId, ARCHIVE_STOP_WAIT_MS))
    );
    const unconfirmed = stops.flatMap((stop) =>
      stop.status === "rejected"
        ? [
            stop.reason instanceof Error
              ? stop.reason.message
              : String(stop.reason),
          ]
        : []
    );
    if (unconfirmed.length > 0) {
      return problem(409, {
        code: "workspace-archive-unconfirmed",
        detail: `Workspace ${handle(workspace.id)} stays active: ${unconfirmed.join(" ")} Retry once its machine has ended it.`,
      });
    }
    const closed = await closeWorkspace(
      workspace,
      discard ? "discard" : "keep",
      skip
    );
    if (closed instanceof ElysiaStatus) {
      return closed;
    }
    if (closed.held) {
      return problem(409, {
        code: "workspace-holds-work",
        detail: holdsWorkWords(closed.held),
      });
    }
    return closed;
  };
  /**
   * Whether a workspace is retired and may be cut again: archived, and a
   * host-scope delegate's (nothing is cut: its row is filed active again,
   * {@link reopenHost}), a folder's (whose work is in its folder once it
   * landed, so it is made again from the folder as it is), or one whose
   * machine said where its clone's HEAD was as it
   * deleted it ({@link closeWorkspace}): on a branch of its remote, or, its
   * items landing none, in its carry (`head.carry`). A discard's carry is let
   * go of, and its row keeps no head. One with no such word (a clone already
   * gone, a folder that was no clone, a retirement before the hub kept it)
   * is not: any other commit could leave its commits behind.
   */
  const recuttable = (workspace: WorkspaceRow): boolean => {
    const member = workspaceOf(workspace);
    if (workspace.state !== "archived") {
      return false;
    }
    if (member.kind === "hostFolder") {
      return true;
    }
    if (member.kind === "folderOverlay") {
      return workspace.carry === null;
    }
    const head = headOf(workspace);
    return (
      head !== null && (workspace.carry === null || head.carry !== undefined)
    );
  };
  /** Why an archived workspace is not cut again ({@link recuttable}), in words. */
  const archivedWords = (workspace: WorkspaceRow): string => {
    if (workspace.carry) {
      return `its workspace ${handle(workspace.id)} was discarded: its unlanded work is in the carry ${workspace.carry} on ${machineName(db, workspace.machineId)}, and its clone is gone.`;
    }
    const taker = db
      .workspacesCutFrom(workspace.id)
      .find((cut) => cut.cutFromLanded === true);
    if (taker) {
      return `its workspace ${handle(workspace.id)} retired: its work went on in workspace ${handle(taker.id)}, cut from it, which landed it, so it is not cut again; workspace ${handle(taker.id)} is where that work goes on.`;
    }
    if (workspace.headUnread !== null) {
      return workWords.headUnread(handle(workspace.id));
    }
    return `its workspace ${handle(workspace.id)} retired with no word of the commit its clone was on, so it is not cut again: a cut anywhere else could leave its commits behind.`;
  };
  /**
   * Cuts a workspace on `machineId` ({@link CONTROL_WORKSPACE_CREATE}, its
   * `[cwd, id, projectId, account, at, first]`). The project's folder is made
   * first (project-folder.ts `makeProjectFolder`), so the boundary has it from
   * its first start, and the folder's first use does not hand the boundary
   * over to a second one. Every cut, new ({@link openWorkspace}) or again
   * ({@link recut}), goes through here.
   */
  const cutOn = async (
    machineId: string,
    args: [
      cwd: string,
      id: string,
      projectId: string | null,
      account: string | null,
      at: WorkspaceCut | null,
      first: WorkspaceFirstSession | null,
    ]
  ) => {
    const [, , projectId] = args;
    if (projectId) {
      const made = await makeProjectFolder(projectId);
      if (made instanceof ElysiaStatus) {
        return made;
      }
    }
    // The machine's answer read as a checkout before anything is filed: a
    // kind of workspace this build does not know (a newer agent's) is none
    // it can land, so the cut is refused, its words saying so.
    const read = WorkspaceCheckoutSchema.safeParse(
      await call(machineId, CONTROL_WORKSPACE_CREATE, args)
    );
    return read.success
      ? read.data
      : {
          unread: `${machineName(db, machineId)} cut a workspace this hub cannot read, so nothing was filed: ${z.prettifyError(read.error)}`,
        };
  };
  /** What a cut that did not go says: its machine is paused, or the project's folder could not be made. */
  /** A cut whose answer did not read as a checkout ({@link cutOn}): refused, nothing filed. */
  const cutUnread = (detail: string) =>
    problem(502, { code: "workspace-cut-unread", detail });
  /** {@link cutOn} for a cut again: an answer that does not read is refused ({@link cutUnread}). */
  const recutOn = async (...args: Parameters<typeof cutOn>) => {
    const checkout = await cutOn(...args);
    return "unread" in checkout ? cutUnread(checkout.unread) : checkout;
  };
  type NotCut =
    | Exclude<
        Awaited<ReturnType<typeof cutOn>>,
        WorkspaceCheckout | { unread: string }
      >
    | ReturnType<typeof cutUnread>
    | NonNullable<ReturnType<typeof notPaused>>;
  /** Each workspace's cut under way ({@link recut}): one at a time. */
  const recutting = new Map<string, Promise<WorkspaceRow | NotCut>>();
  /**
   * A retired workspace ({@link recuttable}) cut again on its machine, at the
   * same path (a function of its id) with the same id and branch, at the
   * commit its clone's HEAD was on when it retired
   * ({@link CONTROL_WORKSPACE_CREATE}'s `at`), never its default branch's
   * tip: on 2026-10-17 a clone whose landing was stopped while queued came
   * back at main, without its own commit. The machine refuses a commit the
   * branch it was on no longer holds. Its boundary is started on the account
   * its latest item's session's next launch runs on ({@link
   * WorkspacesHub.launchesOn}): its delegate goes on in the same
   * session, on its transcript, in the same folder. Filed active again, one
   * of its project's places. Nothing git does not track comes back:
   * installed dependencies, build outputs, its scratch dir. CawCo installs
   * nothing (the owner, 2026-10-18); the next message handed to its session
   * opens with the hub's line saying the folder is new (its row's
   * `movedUntold`, work-items.ts `movedTold`), whichever path goes on there (a handoff, a
   * follow-up, a retry or a continuation), so it sets up what it needs. One
   * cut at a time per workspace; every caller shares it.
   * `onCut` runs in the step that files it active, before anything else
   * can settle it: what wakes its session there.
   */
  /** What a workspace made again records: active, its new boundary, and for a repository's the commit it was cut again at, for its delegate to be told. */
  const recutRecord = (
    checkout: WorkspaceCheckout,
    head: WorkspaceCut | null
  ): Partial<WorkspaceRow> => ({
    state: "active",
    boundaryPid: checkout.boundaryPid,
    base: checkout.base,
    tmp: checkout.tmp,
    // A folder's is made again from the folder as it is: no commit to tell.
    ...(head
      ? {
          movedUntold: {
            kind: "recut" as const,
            ...head,
            ...(checkout.restored ? { restored: checkout.restored } : {}),
          },
        }
      : {}),
    // Its commits are in the clone again: a carry of its next end is its own.
    carry: null,
  });
  /** The log line of a workspace made again. */
  const recutLine = (
    workspace: WorkspaceRow,
    head: WorkspaceCut | null
  ): string =>
    head
      ? `[workspaces] ${workspace.id} on ${machineName(db, workspace.machineId)}: cut again at ${workspace.path}, at ${head.commit.slice(0, 9)} on ${head.branch}, where its clone was when it retired, for its delegate to go on`
      : `[workspaces] ${workspace.id} on ${machineName(db, workspace.machineId)}: made again of ${workspace.repoRoot} as it is now, for its delegate to go on`;
  /**
   * A settled host-scope workspace ({@link settleHost}) filed active again
   * for its session to go on: nothing is cut, its folder is the machine's
   * own and still there, and the session's next spawn makes its scratch dir
   * again (agent host-scratch.ts).
   */
  const reopenHost = (
    workspace: WorkspaceRow,
    onCut?: () => void
  ): WorkspaceRow => {
    const again =
      db.updateWorkspace(workspace.id, { state: "active" }) ?? workspace;
    onCut?.();
    workspaceChanged?.(again);
    console.log(
      `[workspaces] ${workspace.id} on ${machineName(db, workspace.machineId)}: a host-scope delegate's folder ${workspace.path}, active again for its delegate to go on`
    );
    return again;
  };
  const recut = (
    workspace: WorkspaceRow,
    onCut?: () => void
  ): Promise<WorkspaceRow | NotCut> => {
    const pending = recutting.get(workspace.id);
    if (pending !== undefined) {
      return onCut
        ? pending.then((row) => {
            if (!(row instanceof ElysiaStatus)) {
              onCut();
            }
            return row;
          })
        : pending;
    }
    if (isHostFolder(workspace)) {
      return Promise.resolve(reopenHost(workspace, onCut));
    }
    const head = headOf(workspace);
    if (!head && workspaceOf(workspace).kind !== "folderOverlay") {
      return Promise.reject(
        new Error(
          `workspace ${handle(workspace.id)}: ${archivedWords(workspace)}`
        )
      );
    }
    const work = (async (): Promise<WorkspaceRow | NotCut> => {
      // A folder at its path being cleared: cut once that is done.
      await reclosing.get(workspace.id);
      const paused = notPaused(workspace.machineId);
      if (paused) {
        return paused;
      }
      const [latest] = db.workItemsIn(workspace.id);
      const [session] = latest ? db.getInstancesByIds([latest.instanceId]) : [];
      const projectId = latest?.projectId ?? null;
      // Its delegate goes on in that session: its conversation resumed there,
      // or a new one when it had none yet.
      const first: WorkspaceFirstSession | null = session
        ? {
            instanceId: session.id,
            harness: session.harness,
            resume: session.sessionId ?? null,
          }
        : null;
      const checkout = await recutOn(workspace.machineId, [
        workspace.repoRoot,
        workspace.id,
        projectId,
        // The account its launch runs on, as the grant will name it, not
        // the row's: a resumed session whose launch moves it (a move owed
        // at its account's limit, the machine's own login moving in) found
        // its new boundary without that account and handed it over within
        // its first second (workspace 9eb7bb73, 2026-10-27 17:52:15).
        (session && launchesOn(workspace.machineId, session.id)) ?? null,
        head,
        first,
      ]);
      if (checkout instanceof ElysiaStatus) {
        return checkout;
      }
      const path = cutPath(workspace.machineId, checkout.path);
      if (path !== workspace.path) {
        throw new Error(
          `workspace ${handle(workspace.id)} was cut again at ${path}, not at its own path ${workspace.path}`
        );
      }
      const again =
        db.updateWorkspace(workspace.id, recutRecord(checkout, head)) ??
        workspace;
      onCut?.();
      workspaceChanged?.(again);
      console.log(recutLine(workspace, head));
      return again;
    })().finally(() => recutting.delete(workspace.id));
    recutting.set(workspace.id, work);
    return work;
  };
  /**
   * THE ONE WAY WORK GOES ON IN A FINISHED ITEM'S WORKSPACE from outside
   * it (a handoff's inputs and its message, work-items.ts `handOff`; a
   * follow-up's inputs and its item, work-items.ts `startFollowUp`): in the
   * workspace's turn ({@link inWorkspaceTurn}), after any settle queued
   * before it; cut again first when it retired ({@link recut}); then `work`
   * on it as it stands then (undefined when there is no such row), in the
   * same step. So no settle retires it between the cut, what is written into
   * its scratch dir, and what holds it after: a send on its way to its
   * session ({@link holdsOf}), or an item filed live. A send `work`
   * makes waits on no settle ({@link turnMayRetire}). `cut` says whether it
   * was cut again here. Why: on 2026-11-05 a handoff's input was written
   * into a clone cut again outside its turn, with nothing holding it until
   * the handoff's message went as a second step; the message found the
   * workspace retired again and cut it again, and its session read the
   * message with no `$TMPDIR/inputs/`.
   */
  const goOnIn = <T>(
    id: string,
    work: (workspace: WorkspaceRow | undefined, cut: boolean) => Promise<T>
  ) =>
    inWorkspaceTurn(id, async () => {
      const [now] = db.workspacesNamed(id);
      const cut = now !== undefined && recuttable(now);
      const workspace = now && cut ? await recut(now) : now;
      if (workspace instanceof ElysiaStatus) {
        return workspace;
      }
      goingOn.add(id);
      try {
        return await work(workspace, cut);
      } finally {
        goingOn.delete(id);
      }
    });
  /**
   * Why an archived workspace that is not cut again ({@link recuttable})
   * can't come back for what it served, read as {@link archivedWords}
   * reads it: discarded (a discard keeps no head, and its carry is let go
   * of), or retired with no head the hub can place (one before heads were
   * kept, or one kept unread).
   */
  const goneWhyOf = (workspace: WorkspaceRow): GoneWhy =>
    workspace.carry ? { kind: "discarded" } : { kind: "unrecorded" };
  /**
   * The workspace what `workspace` served is opened in now: itself, or, when
   * it retired with no head because its work went on in a workspace cut
   * from it that landed it (its `cutFromLanded`), that one, followed on
   * while each is the same ({@link archivedWords}). None when the chain
   * ends nowhere (a loop, or a row gone).
   */
  const openedIn = (workspace: WorkspaceRow): WorkspaceRow => {
    const seen = new Set<string>([workspace.id]);
    let at = workspace;
    while (at.state === "archived" && !recuttable(at)) {
      const taker = db
        .workspacesCutFrom(at.id)
        .find((cut) => cut.cutFromLanded === true);
      if (!taker || seen.has(taker.id)) {
        return at;
      }
      seen.add(taker.id);
      at = taker;
    }
    return at;
  };
  /**
   * Why what workspace `id` served can't come back as it is opened, read
   * from the hub's records alone, before any open asks ({@link revive}'s
   * rule: the workspace it opens in, {@link openedIn}, stands, or is
   * archived and {@link recuttable}); null when it can. A cut again that
   * then fails is the open's to say. Read by every surface before it frames
   * such a preview (hub preview-unavailable.ts).
   */
  const wontComeBack = (id: string): GoneWhy | null => {
    const [named] = db.workspacesNamed(id);
    if (!named) {
      return { kind: "unrecorded" };
    }
    const target = openedIn(named);
    return target.state !== "archived" || recuttable(target)
      ? null
      : goneWhyOf(target);
  };
  /**
   * Why cutting `workspace` again failed, for the person: its machine
   * away (it comes back once the machine answers), `origin` no longer
   * holding its commit (core `CutCommitGone`, server.ts `callMachine`), or
   * any other refusal in its machine's words.
   */
  const cutFailed = (workspace: WorkspaceRow, error: unknown): GoneWhy => {
    if (error instanceof MachineProblem) {
      const { problem: said } = error;
      if (said.status === 503) {
        return { kind: "offline" };
      }
      const head = headOf(workspace);
      if (said.response.code === CUT_COMMIT_GONE && head) {
        return { kind: "commit", branch: head.branch };
      }
      return { kind: "failed", why: said.response.detail };
    }
    return {
      kind: "failed",
      why: error instanceof Error ? error.message : String(error),
    };
  };
  /**
   * THE ONE WAY A DESIGN WHOSE WORKSPACE WENT COMES BACK: the person opened
   * something workspace `id` serves (a design graph's stage, a served
   * preview's server) and its machine answered that the workspace is not
   * there (agent preview.ts `staged`, `gone`), or the hub used the stage of
   * an artifact it serves (an agent's artifact_read, a render, a write, a
   * warm-up: artifact-events.ts `stageRevived`). In the workspace's turn, after
   * any settle or cut queued before it, it is cut again at the version the
   * hub recorded as it retired ({@link recut}: same id, same path, its
   * carry's commits and uncommitted changes), the cut a handoff or follow-up
   * to a finished delegate makes; then held {@link REVIVE_START_MS} while
   * the open starts its stage, which holds it from then until it sleeps
   * (`stageRuns`), and it retires again by the same rule as any workspace.
   * A workspace whose work landed through a later one cut from it, with no
   * head of its own, is opened in that later one ({@link openedIn}, `moved`:
   * its caller moves the artifact's source there). The owner's pick on
   * 2026-11-22, "Comes back when you open it". Answers `here` when the
   * workspace is on its machine (active, held, or cut again now), or why it
   * can't come back ({@link GoneWhy}).
   */
  const revive = async (id: string): Promise<Revived> => {
    const [named] = db.workspacesNamed(id);
    if (!named) {
      return { kind: "gone", why: { kind: "unrecorded" } };
    }
    const target = openedIn(named);
    const moved = target.id === named.id ? {} : { moved: true as const };
    return await inWorkspaceTurn(target.id, async (): Promise<Revived> => {
      const [now] = db.workspacesNamed(target.id);
      if (!now) {
        return { kind: "gone", why: { kind: "unrecorded" } };
      }
      if (now.state !== "archived") {
        return { kind: "here", workspace: now, ...moved };
      }
      if (!recuttable(now)) {
        return { kind: "gone", why: goneWhyOf(now) };
      }
      goingOn.add(now.id);
      try {
        const cut = await recut(now);
        if (cut instanceof ElysiaStatus) {
          return {
            kind: "gone",
            why: { kind: "failed", why: cut.response.detail },
          };
        }
        revivedAt.set(cut.id, Date.now());
        console.log(
          `[workspaces] ${cut.id}: cut again for a design being opened from it`
        );
        return { kind: "here", workspace: cut, ...moved };
      } catch (error) {
        return { kind: "gone", why: cutFailed(now, error) };
      } finally {
        goingOn.delete(now.id);
      }
    });
  };
  /**
   * Whether a send from `origin` to session `instanceId` reopens a finished
   * item whose workspace retired ({@link recuttable}), or is in a turn that
   * may be retiring it (its settle, run as its session fell asleep): from
   * one who may reopen it ({@link mayReopen}), to its workspace's latest
   * item. Such a send waits at the hub for that turn, and while the
   * workspace is cut again (work-items.ts `recutFor`).
   */
  const retiredFor = (instanceId: string, origin: NeutralOrigin): boolean => {
    const [row] = db.getInstancesByIds([instanceId]);
    const item = row?.workItemId ? db.workItem(row.workItemId) : undefined;
    if (!item || LIVE.has(item.state) || !mayReopen(item, origin)) {
      return false;
    }
    const [workspace] = db.workspacesNamed(item.workspaceId);
    return (
      workspace !== undefined &&
      (recuttable(workspace) || turnMayRetire(workspace.id)) &&
      db.workItemsIn(workspace.id)[0]?.id === item.id
    );
  };
  /** A held workspace filed active again: a follow-up, a retry or a handoff continues its work. */
  const continued = (workspace: WorkspaceRow): WorkspaceRow => {
    if (workspace.state !== "held") {
      return workspace;
    }
    const active =
      db.updateWorkspace(workspace.id, {
        state: "active",
        holding: null,
        heldAt: null,
      }) ?? workspace;
    workspaceChanged?.(active);
    return active;
  };
  /**
   * The workspace a follow-up names, and the item before it there. Refused
   * while that workspace has a live item: one writer per checkout. Nothing
   * here awaits, so the check and the item work-items.ts `start` files after it are
   * one step — two follow-ups can never both pass it.
   */
  const claim = (needle: string) => {
    const workspace = namedWorkspace(needle);
    if (workspace instanceof ElysiaStatus) {
      return workspace;
    }
    // A retired one was cut again before this (work-items.ts `startFollowUp`).
    if (workspace.state === "archived") {
      return problem(409, {
        code: "workspace-continue-archived",
        detail: `Not continued: ${archivedWords(workspace)} Delegate without workspace to start a new one.`,
      });
    }
    const member = workspaceOf(workspace);
    if (member.kind === "hostFolder") {
      return problem(409, {
        code: "workspace-continue-host-folder",
        detail: `Workspace ${handle(workspace.id)} is a host-scope delegate's folder ${workspace.path}, not a clone: continue its session with handoff, or delegate with host again.`,
      });
    }
    const items = db.workItemsIn(workspace.id);
    const live = items.find((item) => LIVE.has(item.state));
    if (live) {
      return problem(409, {
        code: "workspace-continue-live",
        detail: `Workspace ${handle(workspace.id)} already has a live work item: ${live.title} (${handle(live.id)}) is ${live.state}. A workspace runs one work item at a time; wait for its report, or delegate without workspace to start a new one.`,
      });
    }
    const claimed: {
      workspace: WorkspaceRow;
      previous: WorkItemRow | undefined;
    } = { workspace, previous: items[0] };
    return claimed;
  };
  /**
   * A follow-up's boundary, running before its item is filed: the machine
   * starts it again when it has gone (a reboot, a sessiond restart, a held
   * workspace's settle), or says why it cannot and the follow-up is
   * refused. A workspace that is missing or archived is left to
   * {@link claim}, which refuses it in its own words.
   */
  const boundaryUp = async (needle: string): Promise<void> => {
    const [workspace] = db.workspacesNamed(needle.trim());
    if (
      !workspace ||
      workspace.state === "archived" ||
      isHostFolder(workspace)
    ) {
      return;
    }
    const boundaryPid = await call(
      workspace.machineId,
      CONTROL_WORKSPACE_BOUNDARY,
      [refOf(workspace)]
    );
    db.updateWorkspace(workspace.id, { boundaryPid });
  };
  /**
   * The folder a delegate names (`cwd`), or its parent's, as a path on the
   * machine its workspace is cut on (db `machinePathOn`): refused with that
   * gate's sentence, a 400, before anything is cut.
   */
  const cwdOn = (machineId: string, raw: string) => {
    const path = db.machinePathOn(machineId, raw);
    return path instanceof MachinePathRefused
      ? problem(400, { code: "workspace-cwd-unfit", detail: path.message })
      : path;
  };
  /**
   * The folder a repository workspace's delegation was asked from (`raw`, on
   * its machine), when it is one inside the repository the workspace cloned:
   * its brief names it ({@link withWorkspaceLine}, core injected.ts
   * `WorkspacePlace.asked`), since the clone is cut at the repository's top
   * level and its session starts there.
   */
  const askedIn = (
    workspace: WorkspaceRow,
    raw: string
  ): { asked: string } | Record<string, never> => {
    if (workspace.kind !== "repo") {
      return {};
    }
    const path = db.machinePathOn(workspace.machineId, raw);
    return !(path instanceof MachinePathRefused) &&
      path.startsWith(`${workspace.repoRoot}/`)
      ? { asked: path }
      : {};
  };
  /** A path the machine reported about a clone it cut: absolute, or its refusal thrown. */
  const cutPath = (machineId: string, raw: string): MachinePath => {
    const path = db.machinePathOn(machineId, raw);
    if (path instanceof MachinePathRefused) {
      throw path;
    }
    return path;
  };
  /**
   * What a refused workspace create says: the machine's words, `pending`
   * the discard's own failure when it did not go. A machine that lacks what
   * a workspace needs (core workspace-needs.ts) refused before anything was
   * cut, and its words end in the install command alone, so they go on
   * whole, nothing after it; its discard, if it waits, is retried as every
   * other's is.
   */
  const createFailed = (
    machineId: string,
    id: string,
    reason: string,
    waited: string,
    pending: string | undefined
  ): string => {
    if (isWorkspaceNeedsRefusal(reason)) {
      if (pending) {
        console.warn(
          `[work-items] workspace ${id}, refused on ${machineName(db, machineId)} for what it lacks, is discarded when the machine next registers: ${pending}`
        );
      }
      return reason;
    }
    const failed = `Workspace create on ${machineName(db, machineId)} failed after ${waited}s: ${reason}.`;
    return pending
      ? `${failed} Discard of workspace ${id} is pending (${pending}); it will be retried when the machine next registers.`
      : `${failed} Workspace ${id.slice(0, 8)} was discarded; no clone or boundary was left.`;
  };
  /**
   * A new workspace: the project's folder made ({@link cutOn}), then its
   * machine makes its private copy of the folder `cwd` is in, any folder
   * (agent layer.ts), and starts its boundary, and the hub files it.
   * `account` is the Claude account its first session launches on
   * (work-items.ts `ItemPlacement`), whose user layer the boundary reads from its
   * first start; `first` is that session ({@link WorkspaceFirstSession}),
   * whose spill folder it reads from then too, so its spawn hands the
   * boundary over to no second one.
   */
  const openWorkspace = async (
    createdBy: string,
    cwd: MachinePath,
    machineId: string,
    projectId: string | null,
    {
      account,
      first,
    }: {
      account?: string;
      first?: WorkspaceFirstSession;
    } = {}
  ) => {
    const id = crypto.randomUUID();
    db.beginWorkspaceCreate(id, machineId);
    opening.add(id);
    if (projectId) {
      cuttingFor.set(id, { machineId, projectId });
    }
    const started = Date.now();
    /** The create let go of, and what it says of `reason`. */
    const letGo = async (reason: string): Promise<string> => {
      opening.delete(id);
      const waited = ((Date.now() - started) / 1000).toFixed(1);
      const pending = await discardCreate(id, machineId).then(
        () => undefined,
        (discardError: unknown) =>
          discardError instanceof Error
            ? discardError.message
            : String(discardError)
      );
      return createFailed(machineId, id, reason, waited, pending);
    };
    try {
      const checkout = await cutOn(machineId, [
        cwd,
        id,
        projectId,
        account ?? null,
        null,
        first ?? null,
      ]);
      if (checkout instanceof ElysiaStatus) {
        return problem(checkout.status, {
          code: "workspace-folder-unmade",
          detail: await letGo(checkout.response.detail),
        });
      }
      if ("unread" in checkout) {
        // The clone it cut is let go of on the machine, as any create that
        // did not file is ({@link discardCreate}).
        return cutUnread(await letGo(checkout.unread));
      }
      return db.createWorkspace({
        id,
        machineId,
        // Absolute as the machine cut them; the gate says so or refuses.
        repoRoot: cutPath(machineId, checkout.repoRoot),
        path: cutPath(machineId, checkout.path),
        branch: checkout.branch,
        base: checkout.base,
        kind: checkout.kind,
        boundaryPid: checkout.boundaryPid,
        tmp: checkout.tmp,
        state: "active",
        createdByInstanceId: createdBy,
      });
    } catch (error) {
      throw thrownAgain(
        error,
        await letGo(error instanceof Error ? error.message : String(error))
      );
    } finally {
      opening.delete(id);
      cuttingFor.delete(id);
    }
  };
  /**
   * Each workspace being cut for a project ({@link openWorkspace}), by id:
   * its machine and project, until it is filed or let go. Its machine asks
   * where the project's large files live as it cuts (agent host-lfs.ts),
   * before any item of it is filed ({@link holdsProjectOn}).
   */
  const cuttingFor = new Map<
    string,
    { machineId: string; projectId: string }
  >();
  /**
   * Whether `machineId` holds a delegate workspace of project `projectId`,
   * one of a project's places (Projects spec §5.1: "places[] (checkouts on
   * any machine, delegate workspaces)"): one being cut for it
   * ({@link cuttingFor}), or one active or held there whose items are the
   * project's. A host-scope row is the
   * machine's own folder, none of the project's.
   */
  const holdsProjectOn = (machineId: string, projectId: string): boolean => {
    if (
      [...cuttingFor.values()].some(
        (cut) => cut.machineId === machineId && cut.projectId === projectId
      )
    ) {
      return true;
    }
    const projectOf = (workspace: WorkspaceRow): boolean =>
      db.workItemsIn(workspace.id).some((item) => item.projectId === projectId);
    return [
      ...db.activeWorkspacesOn(machineId),
      ...db.heldWorkspaces().filter((one) => one.machineId === machineId),
    ].some((workspace) => !isHostFolder(workspace) && projectOf(workspace));
  };
  /**
   * The workspace a `delegate` call's `from` names: one of the caller's
   * (its own delegates' workspace), with no live item, whose clone is still
   * on its machine. Refused in a sentence naming what to do otherwise.
   */
  const fromSource = (needle: string, parent: Parent) => {
    const named = db.workspacesNamed(needle.trim());
    if (named.length > 1) {
      return problem(404, {
        code: "workspace-from-ambiguous",
        detail: `"${needle}" names ${named.length} workspaces. Pass the full workspace id as from.`,
      });
    }
    const [source] = named;
    if (!source) {
      return problem(404, {
        code: "workspace-from-unknown",
        detail: `No workspace "${needle}". Pass as from a workspace id from one of your delegates' results or reports.`,
      });
    }
    const items = db.workItemsIn(source.id);
    if (
      source.createdByInstanceId !== parent.id &&
      !items.some((item) => item.parentInstanceId === parent.id)
    ) {
      return problem(403, {
        code: "workspace-from-not-yours",
        detail: `Workspace ${handle(source.id)} is not one of yours: from takes a workspace one of your own delegates worked in. Delegate without from, or ask the session that owns it.`,
      });
    }
    const member = workspaceOf(source);
    if (source.state === "archived" || member.kind === "hostFolder") {
      const why =
        member.kind === "hostFolder"
          ? "it is a host-scope delegate's folder, not a clone"
          : "it is archived, its clone gone";
      return problem(409, {
        code: "workspace-from-no-branch",
        detail: `Workspace ${handle(source.id)} has no branch to cut from: ${why}. Delegate without from.`,
      });
    }
    const live = items.find((item) => LIVE.has(item.state));
    if (live) {
      return problem(409, {
        code: "workspace-from-live",
        detail: `Workspace ${handle(source.id)} has a live work item, ${live.title} (${handle(live.id)}), so its branch is still moving. Wait for its report, or stop it with stop_delegate, then delegate with from.`,
      });
    }
    return source;
  };
  /**
   * A workspace's HEAD and its commits past its base, bundled inside its
   * boundary ({@link CONTROL_WORKSPACE_BUNDLE}). A held one's boundary,
   * started for that, is closed again however the bundle went, and the
   * workspace stays held.
   */
  const bundleOf = (id: string) =>
    inWorkspaceTurn(id, async () => {
      // As it stands in its turn: a settle before it may have closed it.
      const [source] = db.workspacesNamed(id);
      if (!source || source.state === "archived") {
        return problem(409, {
          code: "workspace-from-archived",
          detail: `Workspace ${id} was archived before its branch could be read: its clone is gone. Delegate without from.`,
        });
      }
      try {
        return await call(source.machineId, CONTROL_WORKSPACE_BUNDLE, [
          refOf(source),
          source.base,
        ]);
      } finally {
        if (source.state === "held") {
          const closed = await closeWorkspace(
            source,
            "keep",
            handedOver(source)
          );
          if (closed instanceof ElysiaStatus) {
            console.warn(
              `[workspaces] ${source.id}: held again after its branch was read, and not closed: ${closed.response.detail}`
            );
          }
        }
      }
    });
  /**
   * A new workspace's branch moved to `source`'s head: the source's HEAD
   * and its commits past its base bundled inside the source's boundary
   * ({@link CONTROL_WORKSPACE_BUNDLE}), taken inside the new workspace's
   * own ({@link CONTROL_WORKSPACE_AT}), and its branch set there, still
   * tracking the default branch. Every git step runs inside a boundary but
   * the checkout of the commit's
   * tracked files, which the agent runs on its host with the new
   * workspace's boundary closed (agent workspace.ts `workspaceAt`). A move
   * that fails archives the new workspace, unworked, and throws why.
   */
  const cutFrom = async (workspace: WorkspaceRow, source: WorkspaceRow) => {
    /** The workspace archived, unworked, and why it was not cut from `source`. */
    const unmade = async (why: string) => {
      const closed = await closeWorkspace(workspace, "unmade");
      const left =
        closed instanceof ElysiaStatus
          ? ` It stays, its outputs not kept: ${closed.response.detail}`
          : "";
      return `Workspace ${handle(workspace.id)} could not be cut from workspace ${handle(source.id)}, so it was archived: ${why}${left}`;
    };
    try {
      const made = await bundleOf(source.id);
      if (made instanceof ElysiaStatus) {
        return problem(made.status, {
          code: "workspace-from-unread",
          detail: await unmade(made.response.detail),
        });
      }
      await call(workspace.machineId, CONTROL_WORKSPACE_AT, [
        refOf(workspace),
        workspace.base,
        made,
        source.id,
      ]);
      const branch = shellQuote(workspace.branch);
      const set = await command(
        workspace.machineId,
        workspace.path,
        `${SAFE_GIT_SHELL}git checkout --quiet -B ${branch} && git branch --quiet --set-upstream-to=${shellQuote(`origin/${workspace.base}`)} ${branch}`,
        GIT_TIMEOUT_MS,
        refOf(workspace),
        // A checkout: one that left a path the boundary keeps other than
        // the commit has it fails, never passes with it dropped.
        { moves: made.head }
      );
      if (set.exitCode !== 0) {
        throw new Error(
          (set.stderr || set.stdout).trim() || `exit ${set.exitCode}`
        );
      }
      db.updateWorkspace(workspace.id, {
        cutFromWorkspace: source.id,
        cutFromCommit: made.head,
        cutFromLanded: false,
      });
    } catch (error) {
      throw thrownAgain(
        error,
        await unmade(error instanceof Error ? error.message : String(error))
      );
    }
  };
  /**
   * A new workspace's worktree moved to commit `at`, detached, before its
   * session starts: a move (`CommandOptions.moves`), so a commit that
   * changes a path the boundary keeps is checked out on the machine's host
   * and none is dropped. Its session's own checkout there would fail on such
   * a path, or, without `--force`, exit 0 with the file gone. One that fails
   * archives the workspace, unworked, and throws why.
   */
  const detachNew = async (
    workspace: WorkspaceRow,
    at: string
  ): Promise<void> => {
    const moved = await command(
      workspace.machineId,
      workspace.path,
      `${SAFE_GIT_SHELL}git checkout --quiet --detach ${shellQuote(at)}`,
      GIT_TIMEOUT_MS,
      refOf(workspace),
      { moves: at }
    ).catch((error: unknown) => ({
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    }));
    if (moved.exitCode === 0) {
      return;
    }
    const closed = await closeWorkspace(workspace, "unmade");
    const left =
      closed instanceof ElysiaStatus
        ? ` It stays, its outputs not kept: ${closed.response.detail}`
        : "";
    throw new Error(
      `Workspace ${handle(workspace.id)} could not be moved to ${at.slice(0, 9)}, so it was archived: ${(moved.stderr || moved.stdout).trim() || `exit ${moved.exitCode}`}${left}`
    );
  };

  return {
    claim,
    continued,
    recut,
    recuttable,
    cwdOn,
    cutFrom,
    fromSource,
    openWorkspace,
    detachNew,
    closeGateClones,
    goOnIn,
    namedWorkspace,
    boundaryUp,
    askedIn,
    settleSoon,
    isHeld,
    onHostScratch,
    hostOutputsRead,
    resettleSoon,
    retiredFor,
    turnMayRetire,
    recutInTurn,
    holdForContinuation,
    inWorkspaceTurn,
    archivedWords,
    holdsProjectOn,
    heldWork,
    unlandedOf,
    revive,
    wontComeBack,
    settleOn,
    discardUnfiled,
    fileStage,
    archiveNow,
    waitingFrom,
    discardable,
  };
};

export type Workspaces = ReturnType<typeof createWorkspaces>;
