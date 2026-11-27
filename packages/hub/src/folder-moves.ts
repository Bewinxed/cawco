/**
 * Move files: a project's folder, every file in it, cut and pasted to
 * another folder on the same computer or another (TOM T2; core
 * folder-move.ts; the advice project-folder-change.md §2; the owner,
 * 2026-11-18: "move means MOVE as in cut->move"). One job the hub owns and
 * records, in the shape of a project's copy to another machine (moves.ts):
 * one advance function moves every job, whether it was just asked for, its
 * machine just came back, or the hub restarted under it; where it stands is
 * read from its record and from the machines. A machine that is away holds
 * the step; anything else that goes wrong fails the step in the tool's own
 * words, and Try again runs it again. Call off stands until the project is
 * recorded at the new folder, and the old one is never removed before.
 *
 * The agents working in the folder pause between turns first (one in the
 * middle of a reply is waited for, and can be interrupted), and after the
 * move each is carried and started again in the new folder: its own
 * conversation where its harness can take it there, or continued from a
 * summary, said for each before the move starts (the owner: "stop,
 * migrate cleanly, resume"; "it needs to be cross harness").
 */

import { posix } from "node:path";
import type { ControlReply } from "@cawco/core/control-replies";
import type { ControlArgs, ControlName } from "@cawco/core/control-table";
import {
  CONTROL_FOLDER_MOVE_COPY,
  CONTROL_FOLDER_MOVE_DROP,
  CONTROL_FOLDER_MOVE_PLACE,
  CONTROL_FOLDER_MOVE_READ,
  CONTROL_FOLDER_MOVE_REMOVE,
  CONTROL_FOLDER_MOVE_RENAME,
  CONTROL_FOLDER_SESSIONS_CARRY,
  CONTROL_PAUSE_FOR_MOVE,
  FOLDER_MOVE_STEPS,
  type FolderCarrySession,
  type FolderMoveBlock,
  type FolderMoveDestinationReading,
  type FolderMoveProgressFrame,
  type FolderMoveReading,
  type FolderMoveSourceReading,
  type FolderMoveStage,
  type FolderMoveStep,
} from "@cawco/core/folder-move";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { HARNESSES, harnessName } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import { type MachinePath, MachinePathRefused } from "@cawco/core/machine-path";
import type {
  AgentHere,
  FolderForecast,
  MovePlan,
  MoveResult,
  MoveRun,
} from "@cawco/core/project-folders";
import { DAY_MS } from "@cawco/core/time";
import { blockWords, folderMoveWords } from "@cawco/core/words/folder-move";
import { Effect } from "effect";
import { problem } from "elysia";
import type { DbShape } from "./db";
import type { FolderMoveRow } from "./db/folder-moves";
import type {
  FolderMovePlace,
  FolderMoveSession,
  FolderMoveState,
} from "./db/stored-types";
import { holdSessionsBy } from "./folder-move-holds";
import { createFolderMoveRelay } from "./folder-move-relay";
import { MachineAway } from "./hub-shapes";
import type { HubLifetimeShape } from "./lifetime";
import { scratchPlaceRefusal } from "./project-place-scratch";

export interface FolderMovesDeps {
  /**
   * A machine's control: its result, or {@link MachineAway} thrown when the
   * machine is not connected, which a job waits out; else the machine's own
   * cause.
   */
  readonly call: <K extends ControlName>(
    machineId: string,
    method: K,
    args: ControlArgs<K>,
    timeoutMs: number,
    session?: { harness: HarnessKind; instanceId: string }
  ) => Promise<ControlReply<K>>;
  /**
   * Starts a session's conversation again from a summary, on `harness` in
   * `cwd` on `machineId`, as one session with it (continuations.ts, its
   * asker the folder's move): the continuation's job, which summarises it
   * where it ran and then starts it there, or why it did not start.
   */
  readonly continueFromSummary: (
    instanceId: string,
    target: { machineId: string; cwd: string; harness: HarnessKind },
    moveId: string
  ) => Promise<{ job: string } | { why: string }>;
  readonly db: DbShape;
  /** Interrupts a session's reply now, as the person's Stop does. */
  readonly interrupt: (instanceId: string) => Promise<void>;
  readonly lifetime: HubLifetimeShape;
  readonly machineName: (machineId: string) => string;
  readonly online: (machineId: string) => boolean;
  /** Every dashboard reads the projects again, and each machine takes its places again. */
  readonly projectMoved: (
    projectId: string,
    machines: Iterable<string>,
    folderMoved: boolean
  ) => void;
  /** A paused session started again on its conversation, in its row's folder: why not, or nothing. */
  readonly resume: (instanceId: string) => string | undefined;
  /** A session's name as the board shows it. */
  readonly sessionName: (instanceId: string) => string;
  /** A word to a session that starts no turn: its next reads it (`shouldQuery: false`). */
  readonly tell: (instanceId: string, words: string) => void;
}

const READ_TIMEOUT_MS = 60_000;
const STEP_TIMEOUT_MS = DAY_MS;
const PAUSE_TIMEOUT_MS = 90_000;
/** How often a move waiting on a reply looks again. */
const WAIT_LOOK_MS = 3000;
/** How long a done or called-off move is kept for a card that was away. */
const SETTLED_KEPT_MS = 30 * 60_000;
/** Free space must cover the folder and this much more (moves.ts' own margin). */
const ROOM_MARGIN = 1.05;

/** The statuses whose row has a process the move pauses. */
const RUNNING = new Set(["running", "starting", "unknown"]);
/** The statuses a move leaves alone. */
const LEFT = new Set(["discarded", "moving"]);

/** Whether `inner` is `outer` or inside it. */
const within = (inner: string, outer: string): boolean => {
  const way = posix.relative(outer, inner);
  return (
    way === "" ||
    !(way === ".." || way.startsWith("../") || posix.isAbsolute(way))
  );
};

/** A folder as the person reads it: under its machine's home as `~`. */
const shown = (path: string, home: string | null): string => {
  if (home && path === home) {
    return "~";
  }
  return home && path.startsWith(`${home}/`)
    ? `~${path.slice(home.length)}`
    : path;
};

const isStep = (stage: FolderMoveStage): stage is FolderMoveStep =>
  stage !== "done" && stage !== "failed" && stage !== "calledOff";

/** The steps before the project is recorded at the new folder: Call off stands while it is at one. */
const BEFORE_RECORD: ReadonlySet<FolderMoveStep> = new Set(
  FOLDER_MOVE_STEPS.slice(0, FOLDER_MOVE_STEPS.indexOf("record"))
);

/**
 * Whether a session's conversation goes with the folder as it is: always on
 * one computer, where one asked to continue from a summary is summarised in
 * the new folder once it is filed there (the old one is gone by then); across
 * computers when its harness and account are there.
 */
const followsFolder = (
  one: Pick<FolderMoveSession, "way">,
  way: FolderMoveState["way"]
): boolean => one.way === "same" || way !== "relay";

/** Across computers, one continues from a summary: the summarise step, before the old folder is removed. */
const withSummarise = (
  steps: readonly FolderMoveStep[],
  sessions: readonly FolderMoveSession[]
): FolderMoveStep[] =>
  steps.includes("summarise") ||
  !steps.includes("remove") ||
  !sessions.some((one) => one.way === "summary")
    ? [...steps]
    : steps.flatMap((step) =>
        step === "remove" ? ["summarise" as const, step] : [step]
      );

export const createFolderMoves = (deps: FolderMovesDeps) => {
  const { db } = deps;
  /** `path`, a folder at or under `from`, at the same place under `to` on `machineId`. */
  const rebased = (
    machineId: string,
    path: string,
    from: string,
    to: string
  ): MachinePath => {
    const moved = db.machinePathOn(
      machineId,
      posix.join(to, posix.relative(from, path))
    );
    if (moved instanceof MachinePathRefused) {
      throw moved;
    }
    return moved;
  };
  /** The streams of copies between two machines (folder-move-relay.ts). */
  const relay = createFolderMoveRelay(deps.lifetime);
  /** The jobs this process is moving now: each advances once at a time. */
  const advancing = new Set<string>();

  // ── Reading the folders ─────────────────────────────────────────────────

  const blocked = (why: string, todo: string): FolderForecast => ({
    state: "blocked",
    why,
    todo,
  });

  interface Planned {
    agents: AgentHere[];
    head: string | null;
    lines: string[];
    made: boolean;
    places: FolderMovePlace[];
    projectId: string;
    sessions: FolderMoveSession[];
    sourceHome: string;
    sourceMachineId: string;
    sourcePath: string;
    targetHome: string;
    targetMachineId: string;
    targetPath: MachinePath;
    walk?: FolderMoveState["walk"];
    way: FolderMoveState["way"];
  }

  /** The machine's word on what stands in the way, as the card says it. */
  const blockSaid = (
    block: FolderMoveBlock,
    folder: string,
    destination: string,
    machine: string
  ): FolderForecast => {
    const words = blockWords(block, { folder, destination, machine });
    return blocked(words.why, words.todo);
  };

  /** Whether a harness runs on a machine, as its last report said. */
  const runsOn = (machineId: string, harness: HarnessKind): boolean =>
    (db.harnessesOn([machineId]).get(machineId) ?? []).some(
      (report) => report.harness === harness && report.installed
    );

  /**
   * Whether a session's account is signed in on a machine, for a harness
   * whose conversations live in its account's dir; on no account, the
   * machine's own sign-in of that harness.
   */
  const signedInOn = (
    machineId: string,
    harness: HarnessKind,
    accountId: string | null
  ): boolean =>
    accountId === null
      ? (db.harnessesOn([machineId]).get(machineId) ?? []).some(
          (report) =>
            report.harness === harness && report.auth === "authenticated"
        )
      : db.accounts
          .signins()
          .some(
            (signin) =>
              signin.accountId === accountId &&
              signin.machineId === machineId &&
              signin.state === "signed-in"
          );

  /**
   * How a session's conversation follows to `target`: as it is on one
   * machine; to another, as it is when that machine runs its harness (and,
   * for Claude, its account is signed in there), else from a summary on a
   * harness that machine runs; from a summary whenever the person asked.
   */
  const wayFor = (
    row: { harness: HarnessKind; accountId: string | null; id: string },
    sourceMachineId: string,
    targetMachineId: string,
    summaries: ReadonlySet<string>
  ): Pick<FolderMoveSession, "way" | "why" | "tool"> => {
    const machine = deps.machineName(targetMachineId);
    const other =
      HARNESSES.find((kind) => runsOn(targetMachineId, kind)) ?? row.harness;
    if (summaries.has(row.id)) {
      return {
        way: "summary",
        why: folderMoveWords.asked,
        tool: runsOn(targetMachineId, row.harness) ? row.harness : other,
      };
    }
    if (sourceMachineId === targetMachineId) {
      return { way: "same", why: null, tool: row.harness };
    }
    if (!runsOn(targetMachineId, row.harness)) {
      return {
        way: "summary",
        why: folderMoveWords.noHarness(machine, harnessName(row.harness)),
        tool: other,
      };
    }
    if (
      traitsOf(row.harness).accountDir &&
      !signedInOn(targetMachineId, row.harness, row.accountId)
    ) {
      return {
        way: "summary",
        why: folderMoveWords.noAccount(machine),
        tool: row.harness,
      };
    }
    return { way: "same", why: null, tool: row.harness };
  };

  /** The sessions whose folder the move moves: every one on the folder's machine that ran in it or inside it. */
  const sessionsIn = (
    sourceMachineId: string,
    sourcePath: string,
    targetMachineId: string,
    targetPath: string,
    summaries: ReadonlySet<string>
  ): FolderMoveSession[] =>
    db
      .listInstances()
      .filter(
        (row) =>
          row.machineId === sourceMachineId &&
          !LEFT.has(row.status) &&
          row.kind !== "scratch" &&
          within(row.cwd, sourcePath)
      )
      .map((row) => ({
        instanceId: row.id,
        name: deps.sessionName(row.id),
        harness: row.harness,
        sessionId: row.sessionId ?? null,
        accountId: row.accountId ?? null,
        from: row.cwd,
        to: rebased(targetMachineId, row.cwd, sourcePath, targetPath),
        wasRunning: RUNNING.has(row.status),
        replying: RUNNING.has(row.status) && db.turnOpen(row.id),
        ...wayFor(
          {
            harness: row.harness,
            accountId: row.accountId ?? null,
            id: row.id,
          },
          sourceMachineId,
          targetMachineId,
          summaries
        ),
      }));

  /** A session as the card lists it. */
  const agentOf = (session: FolderMoveSession): AgentHere => ({
    id: session.instanceId,
    name: session.name,
    replying: session.replying === true,
    carry: {
      tool: harnessName(session.tool),
      way: session.way,
      why: session.why,
    },
  });

  interface Refused {
    forecast: FolderForecast;
  }
  const refused = (why: string, todo = ""): Refused => ({
    forecast: blocked(why, todo),
  });

  /** The place a move takes, or why it takes none. */
  const placeOf = (projectId: string, placeId: string) => {
    const project = db.project(projectId);
    if (!project) {
      return refused(folderMoveWords.noProject);
    }
    const place = project.places.find((each) => each.id === placeId);
    if (!place) {
      return refused(
        folderMoveWords.noFolder.why,
        folderMoveWords.noFolder.todo
      );
    }
    return place.kind === "checkout"
      ? { place }
      : refused(folderMoveWords.builtin.why, folderMoveWords.builtin.todo);
  };

  /** Where the folder goes, on its machine: refused as the machine's paths are, and as the place's move is. */
  const destinationOf = (
    place: { id: string; machineId: string; path: string },
    to: { machineId: string; path: string }
  ): { targetPath: MachinePath } | Refused => {
    const targetPath = db.machinePathOn(to.machineId, to.path);
    if (targetPath instanceof MachinePathRefused) {
      return refused(targetPath.message);
    }
    const scratch = scratchPlaceRefusal(
      db.machineHome(to.machineId),
      targetPath
    );
    if (scratch) {
      return refused(scratch.response.detail);
    }
    if (place.machineId === to.machineId && place.path === targetPath) {
      return refused(
        folderMoveWords.sameFolder.why,
        folderMoveWords.sameFolder.todo
      );
    }
    if (
      db.folderMoves
        .rowsOf(place.id)
        .some((row) => row.stage !== "done" && row.stage !== "calledOff")
    ) {
      return refused(folderMoveWords.moving.why, folderMoveWords.moving.todo);
    }
    // A plain folder's workspace is a live view of the folder where it is.
    const layered = db
      .workspacesFrom(place.machineId, place.path)
      .find(
        (workspace) =>
          workspace.kind === "folder" && workspace.state === "active"
      );
    if (layered) {
      const words = folderMoveWords.layered(folderMoveWords.aDelegate);
      return refused(words.why, words.todo);
    }
    // A repository's workspace holds a clone on this computer and reads its
    // source here: across computers it would point at a folder that is gone.
    const cloned =
      place.machineId === to.machineId
        ? []
        : db
            .workspacesFrom(place.machineId, place.path)
            .filter(
              (workspace) =>
                workspace.kind === "repo" && workspace.state !== "archived"
            );
    if (cloned.length > 0) {
      const words = folderMoveWords.cloned(
        cloned.map(
          (workspace) =>
            db.workItemsIn(workspace.id)[0]?.title ?? workspace.branch
        )
      );
      return refused(words.why, words.todo);
    }
    const away = [place.machineId, to.machineId].find(
      (machineId) => !deps.online(machineId)
    );
    if (away) {
      const words = folderMoveWords.away(deps.machineName(away));
      return refused(words.why, words.todo);
    }
    return { targetPath };
  };

  /** Both folders read: on one machine in one call, else each on its own. */
  const readBoth = async (
    sourceMachineId: string,
    sourcePath: string,
    targetMachineId: string,
    targetPath: string
  ): Promise<[FolderMoveReading, FolderMoveReading]> => {
    if (sourceMachineId === targetMachineId) {
      const both = await deps.call(
        sourceMachineId,
        CONTROL_FOLDER_MOVE_READ,
        [{ source: sourcePath, destination: targetPath, walk: true }],
        READ_TIMEOUT_MS
      );
      return [both, both];
    }
    return await Promise.all([
      deps.call(
        sourceMachineId,
        CONTROL_FOLDER_MOVE_READ,
        [{ source: sourcePath, walk: true }],
        READ_TIMEOUT_MS
      ),
      deps.call(
        targetMachineId,
        CONTROL_FOLDER_MOVE_READ,
        [{ destination: targetPath, walk: false }],
        READ_TIMEOUT_MS
      ),
    ]);
  };

  /** How the folder goes: one rename on its own disk, a copy on its machine, or a copy between two. */
  const wayOf = (
    sourceMachineId: string,
    targetMachineId: string,
    sameDisk: boolean | undefined
  ): FolderMoveState["way"] => {
    if (sourceMachineId !== targetMachineId) {
      return "relay";
    }
    return sameDisk ? "rename" : "copy";
  };

  /** What stops a copy that a rename would not meet: what it cannot carry, room, and names a disk takes as one. */
  const copyBlockOf = (
    source: FolderMoveSourceReading,
    destination: FolderMoveDestinationReading
  ): FolderMoveBlock | undefined => {
    if (source.copyBlock) {
      return source.copyBlock;
    }
    const need = source.walk?.bytes ?? 0;
    if (destination.room !== null && destination.room < need * ROOM_MARGIN) {
      return { kind: "no-room", free: destination.room, need };
    }
    return destination.caseBlind && source.namesByCase.length > 0
      ? { kind: "case-clash", paths: source.namesByCase }
      : undefined;
  };

  /** Every project's other place on the folder's machine: those inside it move with it; a wider one stops holding it. */
  const nesting = (
    projectId: string,
    placeId: string,
    machineId: string,
    path: string
  ) => {
    const others = db
      .listProjects()
      .flatMap((owner) =>
        owner.places
          .filter(
            (each) =>
              each.kind === "checkout" &&
              each.machineId === machineId &&
              each.id !== placeId
          )
          .map((each) => ({ owner, each }))
      );
    return {
      inner: others.filter(({ each }) => within(each.path, path)),
      outer: others.filter(
        ({ each, owner }) => owner.id !== projectId && within(path, each.path)
      ),
    };
  };

  /** What will happen, one line each, in order. */
  const linesOf = (
    way: FolderMoveState["way"],
    source: FolderMoveSourceReading,
    there: string,
    targetMachine: string,
    projects: { inner: string[]; outer: string[] }
  ): string[] => [
    way === "rename"
      ? folderMoveWords.renames(there)
      : folderMoveWords.copies(
          source.walk ?? { files: 0, bytes: 0, whole: false },
          there,
          way === "relay" ? targetMachine : null
        ),
    folderMoveWords.everything,
    ...projects.inner.map(folderMoveWords.inner),
    ...projects.outer.map(folderMoveWords.outer),
    ...(source.links > 0 ? [folderMoveWords.links(source.links)] : []),
  ];

  /** What stands in the way of the two folders as read, by the machine it is on. */
  const readBlock = (
    way: FolderMoveState["way"],
    source: FolderMoveSourceReading,
    destination: FolderMoveDestinationReading
  ): { block: FolderMoveBlock; on: "source" | "target" } | undefined => {
    const own =
      source.block ??
      (way === "rename" ? undefined : copyBlockOf(source, destination));
    if (own) {
      return { block: own, on: "source" };
    }
    return destination.block
      ? { block: destination.block, on: "target" }
      : undefined;
  };

  /**
   * What moving place `placeId` to `to` would do, or what stands in the
   * way: read on both machines, the folder walked for a copy.
   */
  const plan = async (
    projectId: string,
    placeId: string,
    to: { machineId: string; path: string },
    summaries: ReadonlySet<string> = new Set()
  ): Promise<{ planned: Planned } | Refused> => {
    const taken = placeOf(projectId, placeId);
    if ("forecast" in taken) {
      return taken;
    }
    const { place } = taken;
    const where = destinationOf(place, to);
    if ("forecast" in where) {
      return where;
    }
    const { targetPath } = where;
    const sourceMachineId = place.machineId;
    const targetMachineId = to.machineId;
    const sourcePath = place.path;
    const [sourceRead, targetRead] = await readBoth(
      sourceMachineId,
      sourcePath,
      targetMachineId,
      targetPath
    );
    const { source } = sourceRead;
    const { destination } = targetRead;
    if (!(source && destination)) {
      return refused(folderMoveWords.unread);
    }
    const folder = shown(sourcePath, sourceRead.home);
    const there = shown(targetPath, targetRead.home);
    const sourceMachine = deps.machineName(sourceMachineId);
    const targetMachine = deps.machineName(targetMachineId);
    const way = wayOf(sourceMachineId, targetMachineId, sourceRead.sameDisk);
    const stands = readBlock(way, source, destination);
    if (stands) {
      return {
        forecast: blockSaid(
          stands.block,
          folder,
          there,
          stands.on === "source" ? sourceMachine : targetMachine
        ),
      };
    }
    const { inner, outer } = nesting(
      projectId,
      placeId,
      sourceMachineId,
      sourcePath
    );
    const sessions = sessionsIn(
      sourceMachineId,
      sourcePath,
      targetMachineId,
      targetPath,
      summaries
    );
    const names = (list: typeof inner) => [
      ...new Set(list.map(({ owner }) => owner.name)),
    ];
    return {
      planned: {
        projectId,
        sourceMachineId,
        targetMachineId,
        sourcePath,
        targetPath,
        sourceHome: sourceRead.home,
        targetHome: targetRead.home,
        way,
        head: source.head,
        places: [
          { placeId, projectId, from: sourcePath, to: targetPath },
          ...inner.map(({ each, owner }) => ({
            placeId: each.id,
            projectId: owner.id,
            from: each.path,
            to: rebased(targetMachineId, each.path, sourcePath, targetPath),
          })),
        ],
        sessions,
        agents: sessions.filter((each) => each.wasRunning).map(agentOf),
        lines: linesOf(way, source, there, targetMachine, {
          inner: names(inner),
          outer: names(outer),
        }),
        made: place.made,
        ...(source.walk ? { walk: source.walk } : {}),
      },
    };
  };

  /** `GET /api/projects/:id/places/:placeId/move-preview`: what the move would do. */
  const preview = async (
    projectId: string,
    placeId: string,
    to: { machineId: string; path: string }
  ): Promise<MovePlan> => {
    try {
      const planned = await plan(projectId, placeId, to);
      if ("forecast" in planned) {
        return { agents: [], forecast: planned.forecast };
      }
      return {
        agents: planned.planned.agents,
        forecast: { state: "ready", lines: planned.planned.lines },
      };
    } catch (error) {
      // A machine away, or one that could not read the folders (an agent
      // too old to know the move's read), is said where the forecast goes.
      if (error instanceof MachineAway) {
        const away = folderMoveWords.away(deps.machineName(error.machineId));
        return { agents: [], forecast: blocked(away.why, away.todo) };
      }
      return {
        agents: [],
        forecast: blocked(
          error instanceof Error ? error.message : String(error),
          ""
        ),
      };
    }
  };

  // ── What the card reads ─────────────────────────────────────────────────

  /** The stages the card shows, by the job's way and whether agents pause. */
  const stagesOf = (
    state: FolderMoveState
  ): { key: string; words: string }[] => {
    const words = folderMoveWords.stages;
    const agents = state.steps.includes("quiet");
    const resume = state.steps.includes("resume");
    const moving =
      state.way === "rename"
        ? [{ key: "rename", words: words.rename }]
        : [
            { key: "copy", words: words.copy },
            { key: "check", words: words.check },
            ...(state.steps.includes("summarise")
              ? [{ key: "summarise", words: words.summarise }]
              : []),
            { key: "remove", words: words.remove },
          ];
    return [
      ...(agents ? [{ key: "quiet", words: words.quiet }] : []),
      ...moving,
      ...(resume ? [{ key: "resume", words: words.resume }] : []),
    ];
  };

  /** The stage the card shows a step under. */
  const shownStage = (state: FolderMoveState, step: FolderMoveStep): string => {
    switch (step) {
      case "quiet":
        return "quiet";
      case "rename":
        return "rename";
      case "copy":
        return state.progress?.phase === "check" ? "check" : "copy";
      case "place":
      case "record":
        return state.way === "rename" ? "rename" : "check";
      case "carry":
        return state.way === "relay" ? "check" : "resume";
      case "summarise":
        return "summarise";
      case "remove":
        return "remove";
      case "resume":
        return "resume";
    }
  };

  const progressWords = (
    state: FolderMoveState,
    step: FolderMoveStep
  ): string | null => {
    const now = state.progress;
    if (step === "quiet") {
      const waiting = state.sessions.filter(
        (one) => one.wasRunning && !one.paused && one.replying
      );
      return waiting.length > 0
        ? folderMoveWords.waitingFor(waiting.map((one) => one.name))
        : null;
    }
    if (!now) {
      return null;
    }
    if (step === "copy" && now.phase === "copy") {
      return folderMoveWords.copyProgress(
        now.files,
        now.filesTotal,
        now.bytes,
        now.bytesTotal
      );
    }
    if (step === "copy" && now.phase === "check") {
      return folderMoveWords.checkProgress(now.files, now.filesTotal);
    }
    return step === "remove" && now.phase === "remove"
      ? folderMoveWords.removeProgress(now.files, now.filesTotal)
      : null;
  };

  /** Where both folders stand when step `step` failed. */
  const foldersAt = (state: FolderMoveState, step: FolderMoveStep): string => {
    const there = shown(state.targetPath, state.targetHome);
    switch (step) {
      case "quiet":
      case "rename":
        return folderMoveWords.foldersBefore;
      case "copy":
        return folderMoveWords.foldersCopy;
      case "place":
      case "summarise":
        return folderMoveWords.foldersPlaced(there);
      case "record":
        return state.way === "rename"
          ? folderMoveWords.foldersRenamed(there)
          : folderMoveWords.foldersPlaced(there);
      case "carry":
      case "remove":
      case "resume":
        return state.way === "rename"
          ? folderMoveWords.foldersRenamed(there)
          : folderMoveWords.foldersMoved(there);
    }
  };

  const runOf = (row: FolderMoveRow): MoveRun => {
    const { state } = row;
    const stages = stagesOf(state);
    const step: FolderMoveStep = isStep(row.stage)
      ? row.stage
      : (state.error?.step ?? "quiet");
    const at = Math.max(
      0,
      stages.findIndex((one) => one.key === shownStage(state, step))
    );
    const away = [row.sourceMachineId, row.targetMachineId].find(
      (machineId) => !deps.online(machineId)
    );
    return {
      id: row.id,
      state: "running",
      stages: stages.map((one) => one.words),
      at,
      callOff: BEFORE_RECORD.has(step),
      progress: progressWords(state, step),
      waitingFor:
        row.stage !== "failed" && away ? deps.machineName(away) : null,
      failed:
        row.stage === "failed" && state.error
          ? {
              stage: stages[at]?.words ?? "",
              words: state.error.words,
              folders: foldersAt(state, state.error.step),
            }
          : null,
    };
  };

  const endedWords = (state: FolderMoveState, machine: string): string[] =>
    state.sessions.flatMap((one) =>
      one.ended
        ? [
            ...one.ended.tasks.map((task) =>
              folderMoveWords.endedTask(machine, task.description)
            ),
            ...(one.ended.wakeups > 0
              ? [folderMoveWords.endedWakeups(one.name, one.ended.wakeups)]
              : []),
          ]
        : []
    );

  /** What the card says of an agent after the move: its way when it continued from a summary, why when it did not start. */
  const resultWhy = (one: FolderMoveSession): string | null => {
    if (!one.resumed) {
      return one.resumeWhy ?? null;
    }
    return one.way === "summary"
      ? folderMoveWords.resumedSummary(harnessName(one.tool))
      : null;
  };

  const resultOf = (row: FolderMoveRow): MoveResult => {
    const { state } = row;
    const machine = deps.machineName(row.targetMachineId);
    const there = shown(state.targetPath, state.targetHome);
    let checked: string;
    if (row.stage === "calledOff") {
      checked = folderMoveWords.calledOff(folderMoveWords.calledOffUntouched);
    } else if (state.way === "rename") {
      checked = folderMoveWords.renamed(there, machine, state.head);
    } else {
      checked = folderMoveWords.checked(
        state.copied ?? { files: 0, bytes: 0, head: state.head },
        machine
      );
    }
    return {
      id: row.id,
      state: "done",
      checked,
      agents: state.sessions
        .filter((one) => one.wasRunning || one.way === "summary")
        .map((one) => ({
          name: one.name,
          resumed: one.resumed === true,
          why: resultWhy(one),
        })),
      leftBehind: (state.left ?? []).map((left) => ({
        name: shown(left.path, state.sourceHome),
        why: folderMoveWords.left(left),
      })),
      ended: endedWords(state, deps.machineName(row.sourceMachineId)),
    };
  };

  /** `GET /api/folder-moves/:id`: where a move stands, or what it did. */
  const read = (id: string) => {
    const row = db.folderMoves.row(id);
    if (!row) {
      return problem(404, {
        code: "folder-move-gone",
        detail: folderMoveWords.over,
      });
    }
    return row.stage === "done" || row.stage === "calledOff"
      ? resultOf(row)
      : runOf(row);
  };

  // ── Starting a move ─────────────────────────────────────────────────────

  /** The steps a move runs, in order: each only when it applies. */
  const stepsFor = (
    way: FolderMoveState["way"],
    sessions: readonly FolderMoveSession[]
  ): FolderMoveStep[] => {
    const pauses = sessions.some((one) => one.wasRunning);
    const carries = sessions.some(
      (one) => one.sessionId !== null && followsFolder(one, way)
    );
    const resumes = sessions.some(
      (one) => one.wasRunning || one.way === "summary"
    );
    const copies = way !== "rename";
    const has: Record<FolderMoveStep, boolean> = {
      quiet: pauses,
      rename: !copies,
      copy: copies,
      place: copies,
      record: true,
      carry: carries,
      // Its summariser reads the old folder, so it runs before the removal.
      summarise:
        way === "relay" && sessions.some((one) => one.way === "summary"),
      remove: copies,
      resume: resumes,
    };
    // Across machines a conversation is carried before the removal, which
    // drops the old machine's copies of what was carried.
    const steps = FOLDER_MOVE_STEPS.filter((step) => has[step]);
    if (!(way === "copy" && carries)) {
      return steps;
    }
    // On one machine it is filed again once the old folder is gone:
    // OpenCode's own move then runs no turn.
    const filed: FolderMoveStep[] = steps.filter((step) => step !== "carry");
    filed.splice(filed.indexOf("remove") + 1, 0, "carry");
    return filed;
  };

  /** `POST /api/projects/:id/places/:placeId/move`: the job, once recorded; it runs from there. */
  const start = async (
    projectId: string,
    placeId: string,
    to: { machineId: string; path: string; summaries: string[] }
  ) => {
    const planned = await plan(
      projectId,
      placeId,
      to,
      new Set(to.summaries)
    ).catch((error: unknown) => {
      if (error instanceof MachineAway) {
        const away = folderMoveWords.away(deps.machineName(error.machineId));
        return { forecast: blocked(away.why, away.todo) };
      }
      throw error;
    });
    if ("forecast" in planned) {
      const { forecast } = planned;
      return problem(409, {
        code: "folder-move-refused",
        detail:
          forecast.state === "blocked"
            ? `${forecast.why} ${forecast.todo}`.trim()
            : "",
      });
    }
    const p = planned.planned;
    const state: FolderMoveState = {
      sourcePath: p.sourcePath,
      sourceHome: p.sourceHome,
      targetPath: p.targetPath,
      targetHome: p.targetHome,
      way: p.way,
      steps: stepsFor(p.way, p.sessions),
      places: p.places,
      sessions: p.sessions,
      made: p.made,
      head: p.head,
      ...(p.walk ? { walk: p.walk } : {}),
    };
    const row = db.folderMoves.insert({
      id: crypto.randomUUID(),
      projectId,
      placeId,
      sourceMachineId: p.sourceMachineId,
      targetMachineId: p.targetMachineId,
      stage: state.steps[0] ?? "done",
      state,
    });
    console.log(
      `[folder-moves] ${row.id}: ${p.sourcePath} on ${deps.machineName(p.sourceMachineId)} to ${p.targetPath} on ${deps.machineName(p.targetMachineId)} (${state.steps.join(" → ")})`
    );
    goOn(row.id);
    return runOf(row);
  };

  // ── The steps ───────────────────────────────────────────────────────────

  const update = (
    id: string,
    stage: FolderMoveStage | undefined,
    change: (state: FolderMoveState) => FolderMoveState
  ): FolderMoveRow | undefined => {
    const row = db.folderMoves.row(id);
    if (!row) {
      return undefined;
    }
    const moved = db.folderMoves.update(id, {
      ...(stage ? { stage } : {}),
      state: change(row.state),
    });
    if (moved && (moved.stage === "done" || moved.stage === "calledOff")) {
      forgetLater(moved.id);
    }
    return moved;
  };

  const forgetLater = (id: string): void => {
    deps.lifetime.after("folder move forgotten", SETTLED_KEPT_MS, () => {
      db.folderMoves.deleteSettled(id);
    });
  };

  /** The machine each step runs on, and the ones it needs here. */
  const machinesFor = (row: FolderMoveRow, step: FolderMoveStep): string[] => {
    switch (step) {
      case "quiet":
      case "rename":
      case "remove":
        return [row.sourceMachineId];
      case "copy":
      case "carry":
      case "summarise":
        return [...new Set([row.sourceMachineId, row.targetMachineId])];
      case "place":
      case "resume":
        return [row.targetMachineId];
      case "record":
        return [];
    }
  };

  const nextOf = (
    state: FolderMoveState,
    step: FolderMoveStep
  ): FolderMoveStage => state.steps[state.steps.indexOf(step) + 1] ?? "done";

  const carryOf = (one: FolderMoveSession): FolderCarrySession => ({
    instanceId: one.instanceId,
    harness: one.harness,
    sessionId: one.sessionId ?? "",
    accountId: one.accountId,
    from: one.from,
    to: one.to,
  });

  /** The quiet step: each running agent paused between turns; false while any still replies. */
  const quiet = async (row: FolderMoveRow): Promise<boolean> => {
    const sessions: FolderMoveSession[] = [];
    let all = true;
    for (const one of row.state.sessions) {
      if (!one.wasRunning || one.paused) {
        sessions.push(one);
        continue;
      }
      const answer = await deps.call(
        row.sourceMachineId,
        CONTROL_PAUSE_FOR_MOVE,
        [],
        PAUSE_TIMEOUT_MS,
        { harness: one.harness, instanceId: one.instanceId }
      );
      if (answer.paused) {
        if (answer.ended) {
          db.moveEndings.put(one.instanceId, answer.ended);
        }
        sessions.push({
          ...one,
          paused: true,
          replying: false,
          ...(answer.ended ? { ended: answer.ended } : {}),
        });
      } else {
        all = false;
        sessions.push({ ...one, replying: answer.replying });
      }
    }
    update(row.id, undefined, (state) => ({ ...state, sessions }));
    return all;
  };

  /** A copy between the two sides: on one machine, or relayed by the hub. */
  const copy = async (row: FolderMoveRow) => {
    const { state } = row;
    if (state.way !== "relay") {
      return await deps.call(
        row.sourceMachineId,
        CONTROL_FOLDER_MOVE_COPY,
        [
          {
            jobId: row.id,
            source: state.sourcePath,
            destination: state.targetPath,
          },
        ],
        STEP_TIMEOUT_MS
      );
    }
    const token = relay.open();
    try {
      const [, taken] = await Promise.all([
        deps.call(
          row.sourceMachineId,
          CONTROL_FOLDER_MOVE_COPY,
          [
            {
              jobId: row.id,
              source: state.sourcePath,
              relay: { side: "send", token },
            },
          ],
          STEP_TIMEOUT_MS
        ),
        deps.call(
          row.targetMachineId,
          CONTROL_FOLDER_MOVE_COPY,
          [
            {
              jobId: row.id,
              destination: state.targetPath,
              relay: { side: "take", token },
            },
          ],
          STEP_TIMEOUT_MS
        ),
      ]);
      return taken;
    } finally {
      relay.close(token, "the copy ended");
    }
  };

  /**
   * The record: each place moved now says its new folder (and machine),
   * keeping its id, root and whether CawCo made it; each session that
   * follows as it is says its new folder. The point of no return for the
   * record, not for the files: the old folder stands until the removal.
   */
  const record = (row: FolderMoveRow): void => {
    const { state } = row;
    for (const place of state.places) {
      db.movePlace(place.placeId, row.targetMachineId, place.to);
    }
    for (const one of state.sessions) {
      if (followsFolder(one, state.way)) {
        db.moveInstanceFolder(one.instanceId, row.targetMachineId, one.to);
      }
    }
    // A repository's workspaces are clones of their own, and read their
    // source again only to cut anew, start a delegate from it or diff a
    // landing: that source is the new folder now. Across computers only
    // archived ones are left (the plan refuses while one holds a clone), and
    // they go with the folder to its computer, where a recut makes them again.
    const across = row.sourceMachineId !== row.targetMachineId;
    for (const workspace of db.workspacesFrom(
      row.sourceMachineId,
      state.sourcePath
    )) {
      if (across && workspace.kind !== "repo") {
        continue;
      }
      if (across && workspace.state !== "archived") {
        console.warn(
          `[folder-moves] ${row.id}: workspace ${workspace.id} was cut from ${workspace.repoRoot} during the move and keeps its clone on ${deps.machineName(row.sourceMachineId)}, its source there gone`
        );
        continue;
      }
      db.setWorkspaceRoot(
        workspace.id,
        row.targetMachineId,
        rebased(
          row.targetMachineId,
          workspace.repoRoot,
          state.sourcePath,
          state.targetPath
        )
      );
    }
    for (const projectId of new Set(
      state.places.map((place) => place.projectId)
    )) {
      deps.projectMoved(
        projectId,
        [row.sourceMachineId, row.targetMachineId],
        true
      );
    }
  };

  /** The conversations filed for their new folder: here, or sent and taken across machines. */
  const carry = async (row: FolderMoveRow): Promise<void> => {
    const going = row.state.sessions.filter(
      (one) => followsFolder(one, row.state.way) && one.sessionId !== null
    );
    const sessions = going.map(carryOf);
    let carried: ControlReply<typeof CONTROL_FOLDER_SESSIONS_CARRY>;
    if (row.state.way === "relay") {
      const token = relay.open();
      try {
        const [sent, taken] = await Promise.all([
          deps.call(
            row.sourceMachineId,
            CONTROL_FOLDER_SESSIONS_CARRY,
            [{ jobId: row.id, sessions, relay: { side: "send", token } }],
            STEP_TIMEOUT_MS
          ),
          deps.call(
            row.targetMachineId,
            CONTROL_FOLDER_SESSIONS_CARRY,
            [{ jobId: row.id, sessions, relay: { side: "take", token } }],
            STEP_TIMEOUT_MS
          ),
        ]);
        carried = Object.fromEntries(
          Object.entries(taken).map(([id, outcome]) => {
            const out = sent[id];
            return [id, out && !out.carried ? out : outcome];
          })
        );
      } finally {
        relay.close(token, "the carry ended");
      }
    } else {
      carried = await deps.call(
        row.targetMachineId,
        CONTROL_FOLDER_SESSIONS_CARRY,
        [{ jobId: row.id, sessions }],
        STEP_TIMEOUT_MS
      );
    }
    update(row.id, undefined, (state) => {
      const outcomes = state.sessions.map((one): FolderMoveSession => {
        const outcome = carried[one.instanceId];
        if (!outcome) {
          return one;
        }
        if (outcome.carried) {
          return { ...one, carried: true };
        }
        // Across machines a conversation that didn't cross continues from a summary there.
        return row.state.way === "relay"
          ? { ...one, carried: false, way: "summary", why: outcome.why }
          : { ...one, carried: false, resumeWhy: outcome.why };
      });
      return {
        ...state,
        sessions: outcomes,
        steps: withSummarise(state.steps, outcomes),
      };
    });
  };

  /** A continuation's job, read: whether its summary is still being written, or why it stopped. */
  const summaryOf = (job: string): { writing: boolean; why?: string } => {
    // Gone from the hub's table: it settled a while ago, its summary written.
    const row = db.continuationRow(job);
    if (!row) {
      return { writing: false };
    }
    if (row.stage === "failed" || row.stage === "cancelled") {
      return {
        writing: false,
        why: row.error ?? folderMoveWords.summaryCalledOff,
      };
    }
    return {
      writing:
        row.stage === "waiting" ||
        row.stage === "filing" ||
        row.stage === "summarising",
    };
  };

  /** One session across computers: its summary asked for, still being written, or written. */
  const summariseOne = async (
    row: FolderMoveRow,
    one: FolderMoveSession
  ): Promise<{ one: FolderMoveSession; writing: boolean }> => {
    if (one.way !== "summary" || one.resumed || one.resumeWhy) {
      return { one, writing: false };
    }
    if (!one.continuation) {
      const started = await deps.continueFromSummary(
        one.instanceId,
        { machineId: row.targetMachineId, cwd: one.to, harness: one.tool },
        row.id
      );
      return "job" in started
        ? { one: { ...one, continuation: started.job }, writing: true }
        : { one: { ...one, resumeWhy: started.why }, writing: false };
    }
    const { writing, why } = summaryOf(one.continuation);
    return why
      ? {
          one: { ...one, resumeWhy: folderMoveWords.notResumed(why) },
          writing,
        }
      : { one, writing };
  };

  /**
   * Across computers, each conversation that continues from a summary is
   * summarised while the old folder stands, since its summariser and the
   * read of its changes run there (continuations.ts), and its new session
   * then starts in the new folder, in place by now. False while a summary
   * is still being written.
   */
  const summarise = async (row: FolderMoveRow): Promise<boolean> => {
    const sessions: FolderMoveSession[] = [];
    let writing = false;
    for (const each of row.state.sessions) {
      const now = await summariseOne(row, each);
      sessions.push(now.one);
      writing = writing || now.writing;
    }
    update(row.id, undefined, (state) => ({ ...state, sessions }));
    return !writing;
  };

  /** The old folder removed by the copy's list; what stays is named. */
  const remove = async (row: FolderMoveRow): Promise<void> => {
    const { state } = row;
    const carriedAway =
      state.way === "relay"
        ? state.sessions.filter((one) => one.carried === true).map(carryOf)
        : [];
    const removed = await deps.call(
      row.sourceMachineId,
      CONTROL_FOLDER_MOVE_REMOVE,
      [
        {
          jobId: row.id,
          source: state.sourcePath,
          made: state.made,
          sessions: carriedAway,
        },
      ],
      STEP_TIMEOUT_MS
    );
    update(row.id, undefined, (now) => ({
      ...now,
      left: removed.left,
      progress: undefined,
    }));
  };

  /** One agent's start again: from a summary, or in its new folder on its own conversation, told where its project went. */
  const resumeOne = async (
    row: FolderMoveRow,
    one: FolderMoveSession,
    moved: string
  ): Promise<FolderMoveSession> => {
    if (one.resumed || one.carried === false) {
      return one;
    }
    if (one.way === "summary" && one.continuation) {
      // Summarised before the removal: its job starts it by itself.
      return { ...one, resumed: true };
    }
    if (one.way === "summary") {
      const started = await deps.continueFromSummary(
        one.instanceId,
        { machineId: row.targetMachineId, cwd: one.to, harness: one.tool },
        row.id
      );
      return "job" in started
        ? { ...one, continuation: started.job, resumed: true }
        : { ...one, resumeWhy: started.why };
    }
    if (one.sessionId !== null) {
      deps.tell(one.instanceId, moved);
    }
    if (!one.wasRunning) {
      return { ...one, resumeWhy: folderMoveWords.asleep };
    }
    // Its hold ends with this word: the start it is given is the move's own.
    update(row.id, undefined, (now) => ({
      ...now,
      sessions: now.sessions.map((each) =>
        each.instanceId === one.instanceId ? { ...each, resumed: true } : each
      ),
    }));
    const why = deps.resume(one.instanceId);
    return why
      ? { ...one, resumed: false, resumeWhy: folderMoveWords.notResumed(why) }
      : { ...one, resumed: true };
  };

  /** Each agent started again in the new folder, or continued from a summary there. */
  const resume = async (row: FolderMoveRow): Promise<void> => {
    const { state } = row;
    const moved = folderMoveWords.movedLine(
      shown(state.sourcePath, state.sourceHome),
      shown(state.targetPath, state.targetHome)
    );
    const sessions: FolderMoveSession[] = [];
    for (const one of state.sessions) {
      sessions.push(await resumeOne(row, one, moved));
    }
    update(row.id, undefined, (now) => ({ ...now, sessions }));
  };

  /** One step run: false when it waits (a reply to end) and the job looks again later. */
  const runStep = async (
    row: FolderMoveRow,
    step: FolderMoveStep
  ): Promise<boolean> => {
    const { state } = row;
    switch (step) {
      case "quiet":
        return await quiet(row);
      case "rename": {
        const renamed = await deps.call(
          row.sourceMachineId,
          CONTROL_FOLDER_MOVE_RENAME,
          [
            {
              jobId: row.id,
              source: state.sourcePath,
              destination: state.targetPath,
              made: state.made,
            },
          ],
          STEP_TIMEOUT_MS
        );
        if (!renamed.renamed) {
          // Another disk after all: the move copies.
          update(row.id, undefined, (now) => ({
            ...now,
            way: "copy",
            steps: stepsFor("copy", now.sessions),
          }));
          console.log(
            `[folder-moves] ${row.id}: the destination is on another disk, so the folder is copied`
          );
        }
        return true;
      }
      case "copy": {
        const copied = await copy(row);
        update(row.id, undefined, (now) => ({
          ...now,
          copied,
          progress: undefined,
        }));
        return true;
      }
      case "place":
        await deps.call(
          row.targetMachineId,
          CONTROL_FOLDER_MOVE_PLACE,
          [{ jobId: row.id, destination: state.targetPath, made: state.made }],
          STEP_TIMEOUT_MS
        );
        return true;
      case "record":
        record(row);
        return true;
      case "carry":
        await carry(row);
        return true;
      case "summarise":
        return await summarise(row);
      case "remove":
        await remove(row);
        return true;
      case "resume":
        await resume(row);
        return true;
    }
  };

  const allHere = (row: FolderMoveRow, step: FolderMoveStep): boolean =>
    machinesFor(row, step).every((machineId) => deps.online(machineId));

  /** A job's steps from where its record stands, each while its machines are here. */
  const runSteps = async (id: string): Promise<void> => {
    for (;;) {
      const row = db.folderMoves.row(id);
      if (!(row && isStep(row.stage))) {
        return;
      }
      const step = row.stage;
      if (!allHere(row, step)) {
        return;
      }
      const done = await runStep(row, step);
      const now = db.folderMoves.row(id);
      if (!now || now.stage !== step) {
        // Called off while the step ran: that stands.
        return;
      }
      if (!done) {
        goOnAfterLook("folder move looks again", id);
        return;
      }
      // A rename that became a copy names its own steps from here.
      // A rename that found another disk copies from here.
      const next: FolderMoveStage =
        now.state.way === row.state.way ? nextOf(now.state, step) : "copy";
      update(id, next, (state) => state);
      console.log(`[folder-moves] ${id}: ${step} done`);
    }
  };

  const stepFailed = (id: string, error: unknown): void => {
    const row = db.folderMoves.row(id);
    if (!(row && isStep(row.stage))) {
      return;
    }
    if (error instanceof MachineAway || !allHere(row, row.stage)) {
      console.log(`[folder-moves] ${id}: ${row.stage} waits for its machine`);
      return;
    }
    const words = error instanceof Error ? error.message : String(error);
    console.warn(`[folder-moves] ${id}: ${row.stage} failed: ${words}`);
    const step = row.stage;
    update(id, "failed", (state) => ({
      ...state,
      error: { step, words },
      progress: undefined,
    }));
  };

  /**
   * The job's steps ({@link runSteps}), unless they run already: the claim
   * is taken as it starts, before anything else runs; a step that throws
   * fails the job ({@link stepFailed}).
   */
  const advance = (id: string): Effect.Effect<void> =>
    Effect.suspend(() => {
      if (advancing.has(id)) {
        return Effect.void;
      }
      advancing.add(id);
      return Effect.tryPromise({
        try: () => runSteps(id),
        catch: (error) => error,
      }).pipe(
        Effect.catch((error) => Effect.sync(() => stepFailed(id, error))),
        Effect.ensuring(Effect.sync(() => advancing.delete(id)))
      );
    });

  /** The job's steps go on, let go on the hub's lifetime. */
  const goOn = (id: string): void => {
    deps.lifetime.fork("folder move", advance(id));
  };

  /** The job's steps go on once {@link WAIT_LOOK_MS} has passed; `name` is the wait's. */
  const goOnAfterLook = (name: string, id: string): void => {
    deps.lifetime.fork(
      name,
      Effect.sleep(WAIT_LOOK_MS).pipe(Effect.andThen(advance(id)))
    );
  };

  // ── The person ──────────────────────────────────────────────────────────

  /**
   * Call off: allowed until the project is recorded at the new folder. The
   * partial copy goes (CawCo's own), the old folder is untouched and still
   * the project's, and each paused agent starts again there.
   */
  const callOff = async (id: string) => {
    const row = db.folderMoves.row(id);
    if (!row) {
      return problem(404, {
        code: "folder-move-gone",
        detail: folderMoveWords.over,
      });
    }
    const step = isStep(row.stage) ? row.stage : row.state.error?.step;
    if (
      row.stage === "done" ||
      row.stage === "calledOff" ||
      !step ||
      !BEFORE_RECORD.has(step)
    ) {
      return problem(409, {
        code: "folder-move-past-call-off",
        detail:
          row.stage === "calledOff"
            ? folderMoveWords.calledOffAlready
            : folderMoveWords.pastCallOff,
      });
    }
    const moved = update(id, "calledOff", (state) => ({
      ...state,
      calledOffAt: step,
    }));
    const drop = (machineId: string, destination?: string) =>
      deps.online(machineId)
        ? deps
            .call(
              machineId,
              CONTROL_FOLDER_MOVE_DROP,
              [{ jobId: id, ...(destination ? { destination } : {}) }],
              READ_TIMEOUT_MS
            )
            .catch((error: unknown) =>
              console.warn(
                `[folder-moves] ${id}: its partial copy on ${deps.machineName(machineId)} stays: ${String(error)}`
              )
            )
        : Promise.resolve();
    await Promise.all([
      drop(row.targetMachineId, row.state.targetPath),
      drop(row.sourceMachineId),
    ]);
    // Each agent paused for the move starts again in the old folder, which is still its own.
    const sessions = (moved ?? row).state.sessions.map((one) => {
      if (!(one.wasRunning && one.paused)) {
        return one;
      }
      const why = deps.resume(one.instanceId);
      return why
        ? { ...one, resumeWhy: folderMoveWords.notResumed(why) }
        : { ...one, resumed: true };
    });
    const settled = update(id, undefined, (state) => ({ ...state, sessions }));
    console.log(`[folder-moves] ${id}: called off at ${step}`);
    return resultOf(settled ?? row);
  };

  /** Try again: a failed step runs again; a done move's removal runs again for what it left. */
  const retry = async (id: string) => {
    const row = db.folderMoves.row(id);
    if (!row) {
      return problem(404, {
        code: "folder-move-gone",
        detail: folderMoveWords.over,
      });
    }
    if (row.stage === "done" && (row.state.left?.length ?? 0) > 0) {
      await remove(row);
      const again = db.folderMoves.row(id);
      return again
        ? resultOf(again)
        : problem(404, {
            code: "folder-move-gone",
            detail: folderMoveWords.over,
          });
    }
    if (row.stage !== "failed" || !row.state.error) {
      return problem(409, {
        code: "folder-move-not-failed",
        detail: folderMoveWords.notStopped,
      });
    }
    const { step } = row.state.error;
    const moved = update(id, step, ({ error: _error, ...state }) => state);
    goOn(id);
    return runOf(moved ?? row);
  };

  /** Interrupt now: the reply a move waits for stops, and the move goes on. */
  const interrupt = async (instanceId: string) => {
    const row = db.folderMoves
      .rows()
      .find(
        (one) =>
          one.stage === "quiet" &&
          one.state.sessions.some(
            (each) => each.instanceId === instanceId && !each.paused
          )
      );
    if (!row) {
      return problem(409, {
        code: "folder-move-not-waiting",
        detail: folderMoveWords.notWaiting,
      });
    }
    await deps.interrupt(instanceId);
    goOnAfterLook("folder move after an interrupt", row.id);
    return { interrupted: true };
  };

  // ── Machines ────────────────────────────────────────────────────────────

  /** A machine's progress for the step in flight on it. */
  const progress = (
    machineId: string,
    frame: FolderMoveProgressFrame
  ): void => {
    const row = db.folderMoves.row(frame.jobId);
    if (!(
      row &&
      (row.sourceMachineId === machineId ||
        row.targetMachineId === machineId) &&
      isStep(row.stage)
    )) {
      return;
    }
    const { kind: _kind, jobId: _jobId, ...now } = frame;
    db.folderMoves.update(row.id, { state: { ...row.state, progress: now } });
  };

  /** A machine registered: the moves waiting on it go on. */
  const machineBack = (machineId: string): void => {
    for (const row of db.folderMoves.rowsOn(machineId)) {
      if (isStep(row.stage)) {
        goOn(row.id);
      }
    }
  };

  /** At the hub's start: every move goes on from its record; the settled ones are let go later. */
  const resumeAll = (): void => {
    for (const row of db.folderMoves.rows()) {
      if (row.stage === "done" || row.stage === "calledOff") {
        forgetLater(row.id);
      } else if (isStep(row.stage)) {
        goOn(row.id);
      }
    }
  };

  /** The sessions a move holds: paused for it, not yet started again by it. */
  holdSessionsBy((instanceId) => {
    const held = db.folderMoves
      .rows()
      .some(
        (row) =>
          (isStep(row.stage) || row.stage === "failed") &&
          row.state.sessions.some(
            (one) =>
              one.instanceId === instanceId &&
              one.paused === true &&
              !one.resumed
          )
      );
    return held
      ? "Its project's folder is moving, so it starts again in the new folder once the move is done."
      : undefined;
  });

  return {
    callOff,
    interrupt,
    machineBack,
    preview,
    progress,
    read,
    relayPut: relay.put,
    relayTake: relay.take,
    resume: resumeAll,
    retry,
    start,
  };
};
