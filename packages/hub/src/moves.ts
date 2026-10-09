/**
 * Moving a project to a machine that has no checkout of it (Projects spec
 * §5.1 "A project runs on any machine"; core move.ts; the design in
 * `.design-foundations/plans/2026-10-09-project-move.md`): one job the hub
 * owns and records, carried like a continuation (server.ts
 * `advanceContinuation`). One advance function moves every job, whether it
 * was just asked for, its machine just came back, or the hub restarted under
 * it: where it stands is read from its record and from the machines, never
 * from memory. A machine that is away holds its step until it registers
 * again; anything else that goes wrong fails the step in the tool's own
 * words, and Retry runs that step again. Cancel stops the step in flight and
 * says what it left on disk.
 *
 * The steps run on the machines (agent move.ts); the hub decides, asks the
 * person when it must (the approval, through the same ask channel as every
 * permission: dashboards, push, Telegram), and starts the session through
 * the same spawn every hub-started session takes.
 */

import { createHash } from "node:crypto";
import { posix } from "node:path";
import {
  ASK_USER_QUESTION,
  CONTROL_MOVE_CANCEL,
  CONTROL_MOVE_CLONE,
  CONTROL_MOVE_INSPECT,
  CONTROL_MOVE_INSTALL,
  CONTROL_MOVE_LFS,
  CONTROL_MOVE_PREPARE,
  CONTROL_MOVE_SNAPSHOT,
  deriveTitleFromFirstMessage,
  type Envelope,
  installFor,
  type MoveAsk,
  type MoveError,
  type MoveEstimate,
  type MoveInspection,
  type MoveInstall,
  type MoveJob,
  type MoveLargeFile,
  type MoveLfsResult,
  type MoveProgressFrame,
  type MoveRequest,
  type MoveSnapshotResult,
  type MoveStage,
  type MoveStep,
  type MovesFrame,
  moveBranch,
  moveSize,
  moveSourceName,
  type PermissionResult,
  type SendPayload,
  type SpawnPayload,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { checkoutOf, type DbShape, type MoveRow, type ProjectRow } from "./db";
import { bareRepoPath } from "./git-remote";
import type { HubLifetimeShape } from "./lifetime";
import { hubRemoteIdentity, normaliseRemote } from "./projects";

/** A machine a step needs is away: the job waits for its next register. */
export class MoveAway extends Error {
  readonly machineId: string;
  constructor(machineId: string) {
    super(`machine ${machineId} is away`);
    this.machineId = machineId;
  }
}

/** Everything a job has learned and decided, as its record keeps it. */
export interface MoveState {
  /** The person said "Move it": in New session, or on the parked ask. */
  approved?: boolean;
  /** Set when `approval` is a step: what "Move it" does. */
  ask?: MoveAsk;
  /** The ask parked for a yes nobody gave in New session: its request id. */
  askId?: string;
  /** The uncommitted large files the approval sends to LFS. */
  bigFiles: MoveLargeFile[];
  bytes: number;
  /** The outside remote's URL, as the source's `origin` names it. */
  cloneUrl?: string;
  error?: MoveError;
  from: MoveJob["from"];
  /** The folder is no repository: the approval's yes runs `git init`. */
  gitInit: boolean;
  ignoredSecrets: string[];
  ignores: boolean;
  install?: MoveInstall;
  kept?: string;
  lfs?: MoveLfsResult;
  lfsFile?: MoveJob["lfsFile"];
  moved?: string;
  progress?: MoveJob["progress"];
  /** The first prompt's send, so it goes once whatever restarts. */
  promptUuid: string;
  /** The snapshot taken, or (no snapshot step) the source's HEAD to check out. */
  snapshot?: MoveSnapshotResult;
  /** The branch a snapshot goes to. */
  snapshotBranch: string;
  sourceHome: string;
  sourceMachineId: string;
  sourcePath: string;
  stayed?: string;
  steps: MoveStep[];
  /** A Cancel that the machine running the step has not heard yet: told at its register. */
  stopOn?: string;
  /** Once cancelled: the step it stopped at. */
  stoppedAt?: MoveStep;
  targetHome: string;
  targetInstanceId: string;
  targetMachineId: string;
  targetPath: string;
}

export interface MovesDeps {
  /**
   * A machine's control: its result, or {@link MoveAway} when the machine is
   * not connected (or went while it answered), or the machine's own error.
   */
  readonly call: (
    machineId: string,
    method: string,
    args: unknown[],
    timeoutMs: number
  ) => Promise<unknown>;
  readonly db: DbShape;
  /** The hub's git remote's repositories (git-remote.ts). */
  readonly gitRoot: string;
  readonly lifetime: HubLifetimeShape;
  readonly machineName: (machineId: string) => string;
  /**
   * The started session's transcript opens on the move's ready line: kept
   * on its row and said now. Once per session, whatever the retries.
   */
  readonly movedHere: (
    instanceId: string,
    line: { at: number; moved: string; stayed?: string }
  ) => void;
  readonly online: (machineId: string) => boolean;
  /** Parks an ask for the person (server.ts `parkForPerson`). */
  readonly park: (envelope: Envelope) => void;
  /** Whether an ask is parked now. */
  readonly parked: (requestId: string) => boolean;
  /** The project gained a checkout place on a machine. */
  readonly placesChanged: (machineId: string, projectId: string) => void;
  /** Every dashboard and app: one frame. */
  readonly publish: (frame: MovesFrame) => void;
  /** Puts the first prompt into the started session (server.ts `deliverSend`). */
  readonly send: (envelope: Envelope<SendPayload>) => void;
  /** Takes a parked ask off the ledger, answered or withdrawn. */
  readonly settle: (
    requestId: string,
    outcome: "answered" | "cancelled"
  ) => void;
  /** Starts the session as every hub-started session starts (server.ts `spawnSession`). */
  readonly spawn: (machineId: string, payload: SpawnPayload) => Promise<void>;
}

/** A refusal a route answers with its status. */
export class MoveRefused extends Error {
  readonly status: 404 | 409;
  constructor(status: 404 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

/** How long a step may take before the hub stops waiting on its answer. */
const STEP_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const INSPECT_TIMEOUT_MS = 60_000;
/** How long a started or cancelled job is kept for a screen that was away. */
const SETTLED_KEPT_MS = 10 * 60 * 1000;
/** Progress is written to the record at most this often; frames go out at most every quarter second. */
const PROGRESS_KEPT_EVERY_MS = 2000;
const PUBLISH_EVERY_MS = 250;

const MOVE_IT = "Move it";
const DONT_MOVE = "Don't move";

/** The stages a job does work in. */
const WORKING = new Set<MoveStage>([
  "approval",
  "snapshot",
  "clone",
  "lfs",
  "install",
  "start",
]);

const sizeWords = moveSize;

/** A folder as the person reads it: under the machine's home as `~`. */
const shown = (path: string, home: string): string => {
  if (path === home) {
    return "~";
  }
  return home && path.startsWith(`${home}/`)
    ? `~${path.slice(home.length)}`
    : path;
};

/**
 * What stayed on the source, for the ready line: "your .env and ignored
 * files stay on gearbox", "your .env stays on gearbox", "ignored files stay
 * on gearbox"; nothing when nothing stayed.
 */
const stayedWords = (
  secrets: string[],
  ignores: boolean,
  source: string
): string | undefined => {
  const named =
    secrets.length > 1
      ? `${secrets.slice(0, -1).join(", ")} and ${secrets.at(-1)}`
      : secrets[0];
  if (named && ignores) {
    return `your ${named} and ignored files stay on ${source}`;
  }
  if (named) {
    return `your ${named} ${secrets.length > 1 ? "stay" : "stays"} on ${source}`;
  }
  return ignores ? `ignored files stay on ${source}` : undefined;
};

/** The approval's choice, as a question's answer carries it. */
const choiceOf = (result: PermissionResult, question: string): string => {
  if (result.behavior !== "allow") {
    return "";
  }
  const input = (result.updatedInput ?? {}) as {
    answers?: Record<string, string | string[]>;
  };
  const answer = input.answers?.[question];
  return Array.isArray(answer) ? (answer[0] ?? "") : (answer ?? "");
};

/** A step's failure, split as the machine said it: its words, then the tool's last line. */
const errorOf = (stage: MoveStep, error: unknown): MoveError => {
  const text = error instanceof Error ? error.message : String(error);
  const [message, ...rest] = text.split("\n");
  const detail = rest.join("\n").trim();
  return {
    stage,
    message: message.trim() || "The step failed.",
    ...(detail ? { detail } : {}),
  };
};

const runGit = async (args: string[]): Promise<string | null> => {
  const child = Bun.spawn(["git", ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });
  const [out, code] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  return code === 0 ? out.trim() : null;
};

export const createMoves = (deps: MovesDeps) => {
  const { db } = deps;
  /** Each job's progress as its machine last said, between the record's writes. */
  const live = new Map<
    string,
    {
      progress?: MoveJob["progress"];
      lfsFile?: MoveJob["lfsFile"];
      keptAt: number;
    }
  >();
  /** The jobs this process is moving right now: each advances once at a time. */
  const advancing = new Set<string>();

  // ── What screens see ────────────────────────────────────────────────────

  /** The words a job carries once it has them, as its record keeps them. */
  const KEPT_AS_IS = [
    "install",
    "lfs",
    "error",
    "kept",
    "moved",
    "stayed",
    "stoppedAt",
  ] as const;

  /** The approval's parts: its words while it is a step, its parked ask while that waits. */
  const askParts = ({ state, stage }: MoveRow): Partial<MoveJob> => ({
    ...(state.ask ? { ask: state.ask } : {}),
    ...(stage === "approval" && state.askId && !state.approved
      ? { askId: state.askId }
      : {}),
  });

  /** The parts of a job a screen sees only while they are there. */
  const partsOf = (row: MoveRow): Partial<MoveJob> => {
    const { state, stage } = row;
    const parts: Partial<MoveJob> = askParts(row);
    if (state.snapshot && state.steps.includes("snapshot")) {
      const { branch, files } = state.snapshot;
      parts.snapshot = { branch, files };
    }
    for (const key of KEPT_AS_IS) {
      if (state[key] !== undefined) {
        Object.assign(parts, { [key]: state[key] });
      }
    }
    // Progress belongs to the step in flight: the machine's latest, else the record's.
    const now = live.get(row.id);
    const progress = now?.progress ?? state.progress;
    if (progress && (stage === "clone" || stage === "lfs")) {
      parts.progress = progress;
    }
    const lfsFile = now ? now.lfsFile : state.lfsFile;
    if (lfsFile && stage === "lfs") {
      parts.lfsFile = lfsFile;
    }
    return parts;
  };

  const jobOf = (row: MoveRow): MoveJob => {
    const { state, request } = row;
    const projectName = db.project(row.projectId)?.name ?? row.projectId;
    return {
      id: row.id,
      projectId: row.projectId,
      projectName,
      title:
        request.spawn.title?.trim() ||
        deriveTitleFromFirstMessage(request.prompt ?? "") ||
        projectName,
      stage: row.stage,
      steps: state.steps,
      sourceMachineId: state.sourceMachineId,
      sourcePath: state.sourcePath,
      targetMachineId: state.targetMachineId,
      targetPath: state.targetPath,
      targetInstanceId: state.targetInstanceId,
      bytes: state.bytes,
      from: state.from,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...partsOf(row),
    };
  };

  /** Every job, as every screen is handed it. */
  const table = (): MoveJob[] => db.moveRows().map(jobOf);

  let publishTimer: ReturnType<HubLifetimeShape["after"]> | undefined;
  let publishedAt = 0;
  /** One `moves` frame now, or (progress) at most every quarter second. */
  const publish = (soon = false): void => {
    if (!soon) {
      deps.lifetime.cancel(publishTimer);
      publishTimer = undefined;
      publishedAt = Date.now();
      deps.publish({ kind: "moves", moves: table() });
      return;
    }
    if (publishTimer) {
      return;
    }
    publishTimer = deps.lifetime.after(
      Math.max(0, PUBLISH_EVERY_MS - (Date.now() - publishedAt)),
      () => publish(false)
    );
  };

  /** Deletes a started or cancelled job once it has been kept a while. */
  const forgetLater = (row: MoveRow): void => {
    deps.lifetime.after(
      Math.max(0, row.updatedAt.getTime() + SETTLED_KEPT_MS - Date.now()),
      () => {
        const now = db.moveRow(row.id);
        if (now && (now.stage === "started" || now.stage === "cancelled")) {
          db.deleteMove(row.id);
          live.delete(row.id);
          publish();
        }
      }
    );
  };

  /**
   * Moves a job in its one record: its state as `change` makes it from what
   * the record holds now, and its stage. Tells every screen.
   */
  const update = (
    id: string,
    stage: MoveStage | undefined,
    change: (state: MoveState) => MoveState
  ): MoveRow | undefined => {
    const row = db.moveRow(id);
    if (!row) {
      return undefined;
    }
    const moved = db.updateMove(id, {
      ...(stage ? { stage } : {}),
      state: change(row.state),
    });
    if (moved && stage && stage !== row.stage) {
      live.delete(id);
      if (stage === "started" || stage === "cancelled") {
        forgetLater(moved);
      }
    }
    publish();
    return moved;
  };

  // ── Where a job's steps run ─────────────────────────────────────────────

  /** The machine a job's current step runs on. */
  const machineFor = (row: MoveRow): string => {
    const stage =
      row.stage === "failed" ? (row.state.error?.stage ?? "start") : row.stage;
    return stage === "approval" || stage === "snapshot"
      ? row.state.sourceMachineId
      : row.state.targetMachineId;
  };

  const inspect = (machineId: string, path: string) =>
    deps.call(
      machineId,
      CONTROL_MOVE_INSPECT,
      [path],
      INSPECT_TIMEOUT_MS
    ) as Promise<MoveInspection>;

  /** Whether the hub's repository of the project already holds `commit` on a branch. */
  const onHub = async (projectId: string, commit: string): Promise<boolean> => {
    const listed = await runGit([
      "-C",
      bareRepoPath(deps.gitRoot, projectId),
      "branch",
      "--contains",
      commit,
      "--format=%(refname)",
    ]);
    return Boolean(listed);
  };

  /** Whether `inspection`'s folder is a checkout of `project`. */
  const checkoutOfProject = (
    project: ProjectRow,
    inspection: MoveInspection
  ): boolean => {
    if (!(inspection.isGit && inspection.origin)) {
      return false;
    }
    const remote = normaliseRemote(inspection.origin);
    return (
      remote !== null &&
      (remote === project.remote || remote === hubRemoteIdentity(project.id))
    );
  };

  interface Plan {
    estimate: MoveEstimate;
    project: ProjectRow;
    source?: { machineId: string; inspection: MoveInspection };
    target?: { machineId: string; inspection: MoveInspection };
  }

  const refusedPlan = (
    project: ProjectRow,
    path: string,
    refused: string
  ): Plan => ({
    project,
    estimate: {
      needed: true,
      bytes: 0,
      lfsBytes: 0,
      uncommittedFiles: 0,
      needsApproval: false,
      path,
      display: path,
      refused,
    },
  });

  /** Why a project can't be read for a move at all: no source, or a machine away. */
  const sourceRefusal = (
    project: ProjectRow,
    targetMachineId: string
  ): string | undefined => {
    const sourcePlace = checkoutOf(project);
    if (!sourcePlace) {
      return `${project.name} has no checkout to move from.`;
    }
    if (!deps.online(targetMachineId)) {
      return `${deps.machineName(targetMachineId)} is offline.`;
    }
    const source = deps.machineName(sourcePlace.machineId);
    return deps.online(sourcePlace.machineId)
      ? undefined
      : `${source} is offline, and ${project.name}'s work is there. Start it once ${source} is back.`;
  };

  /**
   * What the two folders say about a move: the source gone, the destination
   * already the project (no move needed) or another folder, or a decline
   * the project remembers.
   */
  const foldersSay = (
    project: ProjectRow,
    source: { machineId: string; inspection: MoveInspection },
    target: { machineId: string; inspection: MoveInspection },
    needsApproval: boolean
  ): Partial<MoveEstimate> => {
    const sourceName = deps.machineName(source.machineId);
    const { inspection: there } = target;
    if (!source.inspection.exists) {
      return {
        refused: `${shown(source.inspection.path, source.inspection.home)} on ${sourceName} is gone.`,
      };
    }
    if (there.exists && !there.empty) {
      return checkoutOfProject(project, there)
        ? { needed: false, bytes: 0, lfsBytes: 0 }
        : {
            refused: `${shown(there.path, there.home)} on ${deps.machineName(target.machineId)} is already a different folder. Pick another path.`,
          };
    }
    if (!(needsApproval && project.moveDeclinedAt)) {
      return {};
    }
    return {
      refused: source.inspection.isGit
        ? `${project.name} has big files you chose not to move, so it can't move. Start it on ${sourceName}.`
        : `${project.name} isn't a git repository, so it can't move. Start it on ${sourceName}.`,
    };
  };

  /**
   * What moving `projectId` to `targetMachineId` takes: whether it is needed,
   * where it goes, what it fetches, and why it can't, as the New session
   * modal's reading line says it.
   */
  const plan = async (
    projectId: string,
    targetMachineId: string,
    asked?: string
  ): Promise<Plan> => {
    const project = db.project(projectId);
    if (!project) {
      throw new MoveRefused(404, `There is no project ${projectId}.`);
    }
    const there = project.places.find(
      (place) =>
        place.machineId === targetMachineId && place.kind === "checkout"
    );
    if (there && !asked) {
      return {
        project,
        estimate: {
          needed: false,
          bytes: 0,
          lfsBytes: 0,
          uncommittedFiles: 0,
          needsApproval: false,
          path: there.path,
          display: there.path,
        },
      };
    }
    const refused = sourceRefusal(project, targetMachineId);
    const sourcePlace = checkoutOf(project);
    if (refused || !sourcePlace) {
      return refusedPlan(project, asked ?? "", refused ?? "");
    }
    const [sourceInspection, targetInspection] = await Promise.all([
      inspect(sourcePlace.machineId, sourcePlace.path),
      inspect(
        targetMachineId,
        asked ?? `~/${posix.basename(sourcePlace.path)}`
      ),
    ]);
    const source = {
      machineId: sourcePlace.machineId,
      inspection: sourceInspection,
    };
    const target = { machineId: targetMachineId, inspection: targetInspection };
    const needsApproval =
      !sourceInspection.isGit || sourceInspection.bigFiles.length > 0;
    return {
      project,
      source,
      target,
      estimate: {
        needed: true,
        bytes: sourceInspection.bytes,
        lfsBytes: sourceInspection.lfs.bytes,
        uncommittedFiles: sourceInspection.uncommitted,
        needsApproval,
        path: targetInspection.path,
        display: shown(targetInspection.path, targetInspection.home),
        ...foldersSay(project, source, target, needsApproval),
      },
    };
  };

  /** The approval as a parked question: "Don't move" or "Move it". */
  const parkedAsk = (row: MoveRow): Envelope | undefined => {
    const { ask, askId } = row.state;
    if (!(ask && askId)) {
      return undefined;
    }
    const instanceId = `move:${row.id}`;
    return {
      verb: "frames",
      machineId: row.state.sourceMachineId,
      instanceId,
      requestId: askId,
      payload: {
        kind: "permission_request",
        instanceId,
        requestId: askId,
        harness: "claude",
        requestKind: "question",
        toolName: ASK_USER_QUESTION,
        raisedAt: row.createdAt.getTime(),
        input: {
          questions: [
            {
              question: ask.title,
              header: "Move",
              multiSelect: false,
              options: [
                { label: DONT_MOVE, description: "" },
                { label: MOVE_IT, description: ask.lines.join(" ") },
              ],
            },
          ],
        },
        // The pane's card reads the rest: the Details fold and the job.
        move: { jobId: row.id, details: ask.details },
      },
    };
  };

  const parkApproval = (row: MoveRow): void => {
    const ask = parkedAsk(row);
    if (ask?.requestId && !deps.parked(ask.requestId)) {
      deps.park(ask);
    }
  };

  // ── Starting a job ──────────────────────────────────────────────────────

  type Placed = Required<Plan>;

  /** A plan that can move, or the refusal that says why not. */
  const movable = (planned: Plan, request: MoveRequest): Placed => {
    const { project, estimate: estimated, source, target } = planned;
    if (estimated.refused) {
      throw new MoveRefused(409, estimated.refused);
    }
    if (!(estimated.needed && source && target)) {
      throw new MoveRefused(
        409,
        `${project.name} is already on ${deps.machineName(request.machineId)} at ${estimated.path}: start the session there.`
      );
    }
    return { project, estimate: estimated, source, target };
  };

  /** Where the clone comes from: the source's outside remote, or the hub. */
  const fromOf = (source: MoveInspection): MoveJob["from"] => {
    if (!source.origin) {
      return { kind: "hub" };
    }
    const remote = normaliseRemote(source.origin) ?? source.origin;
    return { kind: "outside", host: remote.split("/")[0] ?? remote };
  };

  /** The steps a move runs: each only when it applies. */
  const stepsFor = async (
    planned: Placed,
    from: MoveJob["from"]
  ): Promise<MoveStep[]> => {
    const { inspection: s } = planned.source;
    const { needsApproval } = planned.estimate;
    // The target can check out the source's HEAD only where the clone gets it.
    const onCloneSource =
      s.head !== null &&
      (from.kind === "hub"
        ? await onHub(planned.project.id, s.head)
        : s.pushed);
    const snapshot = needsApproval || s.uncommitted > 0 || !onCloneSource;
    return [
      ...(needsApproval ? (["approval"] as const) : []),
      ...(snapshot ? (["snapshot"] as const) : []),
      "clone",
      ...(s.lfs.files > 0 ? (["lfs"] as const) : []),
      ...(installFor(s.lockfile) ? (["install"] as const) : []),
      "start",
    ];
  };

  /** Step 2's lines: what happens to the folder, what it copies, and how big files go. */
  const askLines = (
    s: MoveInspection,
    from: MoveJob["from"],
    source: string,
    target: string
  ): string[] => {
    const big = s.bigFiles;
    const bigBytes = big.reduce((sum, file) => sum + file.bytes, 0);
    const largeToo =
      s.lfs.bytes > 0 ? `, plus ${sizeWords(s.lfs.bytes)} of large files` : "";
    const copies = `It ${from.kind === "hub" ? "copies" : "fetches"} ${sizeWords(s.bytes)} from ${moveSourceName(from)}${largeToo}.`;
    const travels =
      big.length === 1
        ? `1 big file (${sizeWords(bigBytes)}) travels separately, so the move stays quick.`
        : `${big.length} big files (${sizeWords(bigBytes)}) travel separately, so the move stays quick.`;
    return [
      `CawCo saves the folder as it is now and copies it to ${target}. Your files on ${source} stay where they are.`,
      // A folder that is no repository yet has no history to size.
      ...(s.isGit && s.bytes > 0 ? [copies] : []),
      ...(big.length > 0 ? [travels] : []),
    ];
  };

  /** The Details fold: the git terms of each step "Move it" runs, in order. */
  const askDetails = (
    s: MoveInspection,
    t: MoveInspection,
    steps: MoveStep[],
    source: string
  ): string[] => {
    const gitInit = !s.isGit;
    const install = installFor(s.lockfile);
    const origin = s.origin
      ? (normaliseRemote(s.origin) ?? "its remote")
      : "hub";
    const firstCommit = [
      "git add -A",
      'git commit -m "The folder as it was when CawCo first moved it"',
    ];
    return [
      ...(gitInit ? ["git init"] : []),
      ...s.bigFiles.map((file) => `git lfs track --filename -- ${file.path}`),
      ...(gitInit ? firstCommit : []),
      ...(steps.includes("snapshot")
        ? [`git push <hub> +<snapshot>:refs/heads/${moveBranch(source)}`]
        : []),
      `git clone <${origin}> ${shown(t.path, t.home)}`,
      ...(steps.includes("lfs") ? ["git lfs pull"] : []),
      ...(install ? [install.command] : []),
    ];
  };

  /**
   * What "Move it" does, in words (the owner's pick D, "Plain + details"):
   * New session's step 2 and the approval card read the same. When the move
   * needs a yes, `key` names what the yes covers: the folder and the
   * destination, whether it becomes a repository, and which files go to LFS.
   */
  const askFor = (
    planned: Placed,
    steps: MoveStep[],
    from: MoveJob["from"]
  ): MoveAsk => {
    const { inspection: s, machineId: sourceMachineId } = planned.source;
    const { inspection: t, machineId: targetMachineId } = planned.target;
    const source = deps.machineName(sourceMachineId);
    const target = deps.machineName(targetMachineId);
    const big = s.bigFiles;
    const gitInit = !s.isGit;
    const lines = askLines(s, from, source, target);
    const details = askDetails(s, t, steps, source);
    const key = steps.includes("approval")
      ? createHash("sha256")
          .update(
            JSON.stringify([
              s.path,
              targetMachineId,
              t.path,
              gitInit,
              big.map((file) => file.path).sort(),
            ])
          )
          .digest("hex")
          .slice(0, 32)
      : undefined;
    return {
      title: `Move ${shown(s.path, s.home)} to ${target}?`,
      lines,
      details,
      bigFiles: big,
      gitInit,
      ...(key ? { key } : {}),
    };
  };

  /** The modal's estimate: `GET /api/projects/:id/move-estimate`, with step 2's words when it can move. */
  const estimate = async (
    projectId: string,
    targetMachineId: string,
    path?: string
  ): Promise<MoveEstimate> => {
    const planned = await plan(projectId, targetMachineId, path);
    const { estimate: estimated, source, target } = planned;
    if (!(estimated.needed && source && target) || estimated.refused) {
      return estimated;
    }
    const placed: Placed = { ...planned, source, target };
    const from = fromOf(source.inspection);
    return {
      ...estimated,
      ask: askFor(placed, await stepsFor(placed, from), from),
    };
  };

  /** A new job's record; `approved` when the person said "Move it" in New session. */
  const stateFor = (
    planned: Placed,
    from: MoveJob["from"],
    steps: MoveStep[],
    ask: MoveAsk,
    approved: boolean
  ): MoveState => {
    const { inspection: s, machineId: sourceMachineId } = planned.source;
    const { inspection: t, machineId: targetMachineId } = planned.target;
    const install = installFor(s.lockfile);
    return {
      sourceMachineId,
      sourcePath: s.path,
      sourceHome: s.home,
      targetMachineId,
      targetPath: t.path,
      targetHome: t.home,
      bigFiles: s.bigFiles,
      gitInit: !s.isGit,
      snapshotBranch: moveBranch(deps.machineName(sourceMachineId)),
      steps,
      bytes: s.bytes,
      from,
      ...(s.origin ? { cloneUrl: s.origin } : {}),
      ignoredSecrets: s.ignoredSecrets,
      ignores: s.ignores,
      ...(install ? { install } : {}),
      ...(s.lfs.files > 0 ? { lfs: s.lfs } : {}),
      ...(steps.includes("approval")
        ? {
            ask,
            ...(approved ? { approved: true } : { askId: crypto.randomUUID() }),
          }
        : {}),
      // Nothing to snapshot: the target checks out the source's HEAD.
      ...(steps.includes("snapshot") || !s.head
        ? {}
        : {
            snapshot: {
              base: s.head,
              commit: s.head,
              branch: "",
              files: 0,
              sourceBranch: s.branch,
            },
          }),
      targetInstanceId: crypto.randomUUID(),
      promptUuid: crypto.randomUUID(),
    };
  };

  /** A move: `POST /api/projects/:id/moves`. Answers the job once it is recorded. */
  const start = async (
    projectId: string,
    request: MoveRequest
  ): Promise<MoveJob> => {
    const planned = movable(
      await plan(projectId, request.machineId, request.path),
      request
    );
    const { project, source, target } = planned;
    const from = fromOf(source.inspection);
    const steps = await stepsFor(planned, from);
    const ask = askFor(planned, steps, from);
    // A yes given in New session covers what the person read there, only.
    if (
      request.approved !== undefined &&
      ask.key !== undefined &&
      request.approved !== ask.key
    ) {
      throw new MoveRefused(
        409,
        `What moving ${project.name} does changed since you looked. Check it again.`
      );
    }
    // A project with no outside remote has the hub as its remote.
    const identity = source.inspection.origin
      ? normaliseRemote(source.inspection.origin)
      : hubRemoteIdentity(project.id);
    if (identity && !project.remote) {
      db.setProjectRemote(project.id, identity);
    }
    const row = db.insertMove({
      id: crypto.randomUUID(),
      projectId: project.id,
      stage: steps[0],
      state: stateFor(
        planned,
        from,
        steps,
        ask,
        ask.key !== undefined && request.approved === ask.key
      ),
      request,
    });
    console.log(
      `[moves] ${row.id}: ${project.name} from ${deps.machineName(source.machineId)} to ${deps.machineName(target.machineId)} (${steps.join(" → ")})`
    );
    publish();
    goOn(row.id);
    return jobOf(row);
  };

  // ── The steps ───────────────────────────────────────────────────────────

  const nextStage = (state: MoveState, stage: MoveStep): MoveStage =>
    state.steps[state.steps.indexOf(stage) + 1] ?? "started";

  /** What a job's current step does, and what it learned. */
  const runStep = async (row: MoveRow): Promise<Partial<MoveState>> => {
    const { state } = row;
    const stage = row.stage as MoveStep;
    const target = deps.machineName(state.targetMachineId);
    const hub = { projectId: row.projectId };
    switch (stage) {
      case "approval": {
        await deps.call(
          state.sourceMachineId,
          CONTROL_MOVE_PREPARE,
          [
            {
              jobId: row.id,
              path: state.sourcePath,
              gitInit: state.gitInit,
              bigFiles: state.bigFiles.map((file) => file.path),
            },
          ],
          STEP_TIMEOUT_MS
        );
        return {};
      }
      case "snapshot": {
        const snapshot = (await deps.call(
          state.sourceMachineId,
          CONTROL_MOVE_SNAPSHOT,
          [
            {
              jobId: row.id,
              path: state.sourcePath,
              branch: state.snapshotBranch,
              hub,
              remote: state.from.kind,
            },
          ],
          STEP_TIMEOUT_MS
        )) as MoveSnapshotResult;
        return { snapshot };
      }
      case "clone": {
        if (!state.snapshot) {
          throw new Error(
            "There is no snapshot to clone: the source had no commit."
          );
        }
        const lfs = (await deps.call(
          state.targetMachineId,
          CONTROL_MOVE_CLONE,
          [
            {
              jobId: row.id,
              path: state.targetPath,
              display: shown(state.targetPath, state.targetHome),
              machine: target,
              hub,
              ...(state.cloneUrl ? { cloneUrl: state.cloneUrl } : {}),
              lfs: state.steps.includes("lfs"),
              bytes: state.bytes,
              snapshot: state.snapshot,
            },
          ],
          STEP_TIMEOUT_MS
        )) as MoveLfsResult;
        return state.steps.includes("lfs")
          ? { lfs, progress: undefined }
          : { progress: undefined };
      }
      case "lfs": {
        const lfs = (await deps.call(
          state.targetMachineId,
          CONTROL_MOVE_LFS,
          [
            {
              jobId: row.id,
              path: state.targetPath,
              machine: target,
              hub,
              fromHub: state.from.kind === "hub",
              snapshot: state.snapshot,
            },
          ],
          STEP_TIMEOUT_MS
        )) as MoveLfsResult;
        return { lfs, progress: undefined, lfsFile: undefined };
      }
      case "install": {
        if (!state.install) {
          return {};
        }
        await deps.call(
          state.targetMachineId,
          CONTROL_MOVE_INSTALL,
          [{ jobId: row.id, path: state.targetPath, argv: state.install.argv }],
          STEP_TIMEOUT_MS
        );
        return {};
      }
      case "start":
        return await startSession(row);
      default:
        return {};
    }
  };

  /**
   * The last step: the target folder becomes a checkout place of the
   * project, the session starts there from the stored request, and its first
   * prompt goes to it. The words of what moved and what stayed are kept.
   */
  const startSession = async (row: MoveRow): Promise<Partial<MoveState>> => {
    const { state, request } = row;
    const { place, added } = db.addPlace({
      projectId: row.projectId,
      machineId: state.targetMachineId,
      path: state.targetPath,
      kind: "checkout",
    });
    if (added) {
      deps.placesChanged(place.machineId, row.projectId);
    }
    // Every Start spawns, and only the machine's answer says the session is
    // in place: a row's status is not that (a try that timed out may have
    // come up after, or not). A session that already began its conversation
    // is resumed, which a machine still carrying it answers at once; one
    // that has none starts fresh under its id.
    const [existing] = db.getInstancesByIds([state.targetInstanceId]);
    const sessionKey = existing?.sessionId;
    console.log(
      `[moves] ${row.id}: start spawns ${state.targetInstanceId}${sessionKey ? ` resuming ${sessionKey}` : ""}`
    );
    // Before the spawn: the line opens the transcript, ahead of its first prompt.
    const at = Date.now();
    await deps.spawn(state.targetMachineId, {
      instanceId: state.targetInstanceId,
      requestId: crypto.randomUUID(),
      cwd: state.targetPath,
      projectId: row.projectId,
      ...request.spawn,
      ...(sessionKey ? { resume: { sessionKey } } : {}),
    });
    const ready = readyWords(row);
    if (ready.moved) {
      deps.movedHere(state.targetInstanceId, {
        at,
        moved: ready.moved,
        ...(ready.stayed ? { stayed: ready.stayed } : {}),
      });
    }
    sendPrompt(row);
    return ready;
  };

  /** The first prompt, as the person wrote it in New session: sent once, under the job's own id. */
  const sendPrompt = ({ state, request }: MoveRow): void => {
    const prompt = request.prompt?.trim() ?? "";
    const images = request.images ?? [];
    const attachments = request.attachments ?? [];
    if (!(prompt || images.length > 0 || attachments.length > 0)) {
      return;
    }
    deps.send({
      verb: "send",
      machineId: state.targetMachineId,
      instanceId: state.targetInstanceId,
      payload: {
        instanceId: state.targetInstanceId,
        ...(images.length > 0 ? { images } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
        message: {
          type: "user",
          uuid: state.promptUuid,
          message: { role: "user", content: prompt },
          parent_tool_use_id: null,
          origin: { kind: "human" },
        },
      },
    } satisfies Envelope<SendPayload>);
  };

  /** The ready line's words: what moved, and what stayed. */
  const readyWords = ({ state, projectId }: MoveRow): Partial<MoveState> => {
    const project = db.project(projectId)?.name ?? projectId;
    const target = deps.machineName(state.targetMachineId);
    const snapshot =
      state.steps.includes("snapshot") && state.snapshot
        ? ` · snapshot ${state.snapshot.branch}`
        : "";
    const stayed = stayedWords(
      state.ignoredSecrets,
      state.ignores,
      deps.machineName(state.sourceMachineId)
    );
    return {
      moved: `Moved ${project} to ${target}${snapshot}`,
      ...(stayed ? { stayed } : {}),
    };
  };

  /**
   * A job's steps from where its record stands, each only while its machine
   * is here. The approval waits on the person's answer; every other step
   * runs and moves the job on.
   */
  const runSteps = async (id: string): Promise<void> => {
    for (;;) {
      const row = db.moveRow(id);
      if (!(row && WORKING.has(row.stage))) {
        return;
      }
      if (row.stage === "approval" && !row.state.approved) {
        parkApproval(row);
        return;
      }
      if (!deps.online(machineFor(row))) {
        return;
      }
      const stage = row.stage as MoveStep;
      // biome-ignore lint/performance/noAwaitInLoops: a job's steps run one after another
      const learned = await runStep(row);
      if (db.moveRow(id)?.stage !== stage) {
        // A Cancel landed while the step ran; it stands.
        return;
      }
      update(id, nextStage(row.state, stage), (state) => ({
        ...state,
        ...learned,
      }));
      console.log(`[moves] ${id}: ${stage} done`);
    }
  };

  /**
   * A step that threw: nothing when the job settled meanwhile (a Cancel); a
   * wait when its machine went away; else the job fails at the step, in the
   * error's own words. True when it waits for its machine.
   */
  const stepFailed = (id: string, error: unknown): boolean => {
    const row = db.moveRow(id);
    if (!(row && WORKING.has(row.stage))) {
      return false;
    }
    if (error instanceof MoveAway || !deps.online(machineFor(row))) {
      console.log(`[moves] ${id}: ${row.stage} waits for its machine`);
      return true;
    }
    const failure = errorOf(row.stage as MoveStep, error);
    console.warn(
      `[moves] ${id}: ${row.stage} failed: ${failure.message}${failure.detail ? ` (${failure.detail})` : ""}`
    );
    update(id, "failed", (state) => ({ ...state, error: failure }));
    return false;
  };

  /** Moves a job as far as it can go: the one path every job takes. */
  const advance = async (id: string): Promise<void> => {
    if (advancing.has(id)) {
      return;
    }
    advancing.add(id);
    let away = false;
    try {
      await runSteps(id);
    } catch (error) {
      away = stepFailed(id, error);
    } finally {
      advancing.delete(id);
      // A machine that went and came back registered while this unwound.
      const row = away ? db.moveRow(id) : undefined;
      if (row && deps.online(machineFor(row))) {
        goOn(id);
      }
    }
  };

  /** A job goes on by itself: its record is what anyone follows. */
  const goOn = (id: string): void => detach(advance(id), `move ${id}`);

  // ── The person ──────────────────────────────────────────────────────────

  /** What a Cancel leaves on disk, in words. */
  const keptOf = (row: MoveRow): string => {
    const { state } = row;
    const target = deps.machineName(state.targetMachineId);
    const stage =
      row.stage === "failed" ? (state.error?.stage ?? "start") : row.stage;
    const hub =
      state.steps.includes("snapshot") && state.snapshot?.branch
        ? ` The snapshot ${state.snapshot.branch} stays on the hub.`
        : "";
    switch (stage) {
      case "approval":
      case "snapshot":
        return `Nothing was copied to ${target}.${hub}`;
      case "clone":
        return `Nothing was kept on ${target}: the partial clone is removed.${hub}`;
      case "lfs": {
        const fetched =
          live.get(row.id)?.progress?.bytes ?? state.progress?.bytes ?? 0;
        return fetched > 0
          ? `The clone and ${sizeWords(fetched)} of large files on ${target} are kept.`
          : `The clone on ${target} is kept.`;
      }
      default:
        return state.lfs
          ? `The clone and its large files on ${target} are kept.`
          : `The clone on ${target} is kept.`;
    }
  };

  /**
   * Cancel: the step in flight stops on its machine (told at its next
   * register when it is away), what is done stays on disk and `kept` says
   * so. A job already starting its session is past stopping.
   */
  const cancel = (id: string, kept?: string): MoveJob => {
    const row = db.moveRow(id);
    if (!row) {
      throw new MoveRefused(404, "That move is not running.");
    }
    if (row.stage === "started" || row.stage === "cancelled") {
      throw new MoveRefused(
        409,
        `That move has already ${row.stage === "started" ? "started its session" : "been cancelled"}.`
      );
    }
    if (row.stage === "start") {
      throw new MoveRefused(
        409,
        "The session is already starting; it can't be cancelled now."
      );
    }
    const words = kept ?? keptOf(row);
    const machine = machineFor(row);
    const { askId } = row.state;
    const stoppedAt =
      row.stage === "failed"
        ? (row.state.error?.stage ?? "start")
        : (row.stage as MoveStep);
    const moved = update(id, "cancelled", (state) => ({
      ...state,
      kept: words,
      stoppedAt,
      ...(deps.online(machine) ? {} : { stopOn: machine }),
    }));
    if (row.stage === "approval" && askId && deps.parked(askId)) {
      deps.settle(askId, "cancelled");
    }
    if (deps.online(machine)) {
      detach(
        deps.call(machine, CONTROL_MOVE_CANCEL, [id], INSPECT_TIMEOUT_MS),
        `move ${id} cancel`
      );
    }
    console.log(`[moves] ${id}: cancelled at ${row.stage}: ${words}`);
    return jobOf(moved ?? row);
  };

  /** Retry: a failed job runs its failed step again, and on from there. */
  const retry = (id: string): MoveJob => {
    const row = db.moveRow(id);
    if (!row) {
      throw new MoveRefused(404, "That move is not running.");
    }
    if (row.stage !== "failed" || !row.state.error) {
      throw new MoveRefused(409, "Only a move that failed can be retried.");
    }
    const { stage } = row.state.error;
    const moved = update(id, stage, ({ error: _error, ...state }) => state);
    console.log(`[moves] ${id}: retrying ${stage}`);
    goOn(id);
    return jobOf(moved ?? row);
  };

  /**
   * The person's answer to a move's approval, when `requestId` is one: "Move
   * it" goes on; "Don't move" cancels and is remembered on the project; a
   * dismissed card cancels. False for every other ask.
   */
  const answer = (requestId: string, result: PermissionResult): boolean => {
    const row = db
      .moveRows()
      .find((one) => one.stage === "approval" && one.state.askId === requestId);
    if (!row?.state.ask) {
      return false;
    }
    deps.settle(requestId, "answered");
    const choice = choiceOf(result, row.state.ask.title);
    if (choice === MOVE_IT) {
      update(row.id, undefined, (state) => ({ ...state, approved: true }));
      console.log(`[moves] ${row.id}: the person said "Move it"`);
      goOn(row.id);
      return true;
    }
    if (choice === DONT_MOVE) {
      db.setProjectMoveDeclined(row.projectId, new Date());
    }
    cancel(row.id, "Nothing moved.");
    return true;
  };

  // ── Machines ────────────────────────────────────────────────────────────

  /** A machine's progress for the step in flight on it. */
  const progress = (machineId: string, frame: MoveProgressFrame): void => {
    const row = db.moveRow(frame.jobId);
    if (
      !row ||
      row.stage !== frame.stage ||
      row.state.targetMachineId !== machineId
    ) {
      return;
    }
    const before = live.get(row.id);
    const now = {
      progress: { bytes: frame.bytes, total: frame.total },
      lfsFile: frame.file,
      keptAt: before?.keptAt ?? 0,
    };
    live.set(row.id, now);
    if (Date.now() - now.keptAt >= PROGRESS_KEPT_EVERY_MS) {
      now.keptAt = Date.now();
      db.updateMove(row.id, {
        state: { ...row.state, progress: now.progress, lfsFile: now.lfsFile },
      });
    }
    publish(true);
  };

  /** A machine registered: the jobs waiting on it go on, and a Cancel it missed reaches it. */
  const machineBack = (machineId: string): void => {
    for (const row of db.moveRows()) {
      if (row.stage === "cancelled" && row.state.stopOn === machineId) {
        detach(
          deps.call(
            machineId,
            CONTROL_MOVE_CANCEL,
            [row.id],
            INSPECT_TIMEOUT_MS
          ),
          `move ${row.id} cancel`
        );
        db.updateMove(row.id, {
          state: { ...row.state, stopOn: undefined },
        });
      } else if (WORKING.has(row.stage) && machineFor(row) === machineId) {
        goOn(row.id);
      }
    }
  };

  /** At the hub's start: every job goes on from its record, and the settled ones are let go later. */
  const resume = (): void => {
    for (const row of db.moveRows()) {
      if (row.stage === "started" || row.stage === "cancelled") {
        forgetLater(row);
      } else if (WORKING.has(row.stage)) {
        goOn(row.id);
      }
    }
  };

  return {
    answer,
    cancel,
    estimate,
    machineBack,
    progress,
    resume,
    retry,
    start,
    table,
  };
};

export type Moves = ReturnType<typeof createMoves>;
