import { CONTINUATION_CANCELLED } from "@cawco/core/continuation";
import { isMachineWrite, readForgeAsk } from "@cawco/core/forge-post";
import {
  effectiveImageChoice,
  GENERATE_IMAGE,
  IMAGE_GENERATION_TIMEOUT_MS,
  type ImageGenerationRequest,
  imageProviderOf,
} from "@cawco/core/image-generation";
import type {
  AgentRow,
  ContinuationJob,
  InstanceRow,
} from "@cawco/core/protocol";
import type { WorkInFlight } from "@cawco/core/session/controls";
import { secondsOf } from "@cawco/core/time";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { Effect, Result } from "effect";
import { ElysiaStatus, problem } from "elysia";
import type { Static } from "typebox";
import { artifactTools } from "./artifacts/calls";
import type { Artifacts } from "./artifacts/service";
import {
  type CloseAsked,
  createAskCloses,
  type RecordAsked,
} from "./ask-closes";
import type { Asks } from "./asks";
import type { DbShape } from "./db";
import type { ContinuationRow, ContinuationSlip } from "./db/continuations";
import type { DelegateTypesShape } from "./db/delegate-types";
import type {
  ContinuationAsker,
  ContinueRequest,
  PreparedContinuation,
} from "./db/stored-types";
import type {
  ContinuationUnfound,
  ContinuationUnplaced,
  ContinueOutcome,
} from "./hub-shapes";
import type { KeepAliveRow, TurnReading } from "./keep-alive";
import type { HubLifetimeShape } from "./lifetime";
import type { Unanswered } from "./machine-answers";
import { awayProblem, silentProblem } from "./machine-answers";
import type { MachineCalls } from "./machine-calls";
import type { MachinePause, PauseCaller } from "./machine-pause";
import type { createOpenItems } from "./open-items";
import {
  catalogOfProject,
  type ProjectDelegateTypes,
} from "./project-delegate-types";
import type { continueBody } from "./routes/session-bodies";
import type { Tasks } from "./tasks";
import { unreachable } from "./unreachable";
import { titleProblem } from "./work-items";
import type { Unlanded } from "./workspaces";
import { madeWords, type Writes } from "./writes";

/** What the session calls act through (server.ts's hub context holds each). */
export interface SessionCallsDeps {
  readonly artifacts: Artifacts;
  readonly cloneForContinuation: (
    sourceId: string
  ) => Promise<(() => void) | ContinuationUnplaced>;
  /** The session's workspace's own state, and Jev's word on a cold session that holds nothing unlanded. */
  readonly coldReading: (
    row: KeepAliveRow & { projectId: string | null; workItemId: string | null },
    state: TurnReading,
    message: string | undefined
  ) => Promise<{
    jev?: { attach: boolean; noul: number } | { error: string };
    unlanded?: Unlanded | { error: string };
  }>;
  readonly continuationJob: (row: ContinuationSlip) => ContinuationJob;
  readonly continuationRefusal: (
    prepared: PreparedContinuation,
    request: ContinueRequest,
    askedBy: ContinuationAsker
  ) => Promise<string | undefined>;
  readonly db: DbShape;
  readonly delegateTypes: DelegateTypesShape;
  readonly followupState: (row: KeepAliveRow) => {
    midTurn: boolean;
    requestAt: number | null;
    hasTurns: boolean;
    recordedTurnAt: string | null;
    lastTurnAt: string | null;
    activityBound: boolean;
  };
  /** A parent's forward of the ask its delegate routed to it, to the person (ask-routing.ts `forward`). */
  readonly forwardRouted: (parent: InstanceRow, requestId: string) => string;
  /** The asks the hub owns (asks.ts). */
  readonly hubAsks: Asks;
  readonly inFlightFor: (
    sourceId: string
  ) => Promise<{ work?: WorkInFlight | undefined } | { refusal: string }>;
  /** The hub's lifetime: a session's `forge_post` runs its write on it. */
  readonly lifetime: HubLifetimeShape;
  readonly machineCalls: Pick<MachineCalls["Service"], "callAgent">;
  readonly machinePause: MachinePause;
  readonly machineRow: (machineId: string) => AgentRow | undefined;
  readonly openItems: ReturnType<typeof createOpenItems>;
  readonly outcomeOf: (row: ContinuationRow) => ContinueOutcome;
  readonly prepareContinuation: (
    sourceId: string,
    note?: string | undefined,
    asksOnly?: boolean
  ) => Promise<PreparedContinuation | ContinuationUnfound>;
  readonly projectTypes: ProjectDelegateTypes;
  readonly reportedContextOf: (
    row: KeepAliveRow
  ) => Promise<
    { tokens: number; readAt: number } | { reason: string } | Unanswered
  >;
  /** A session as its notes name it. */
  readonly sessionName: (row: InstanceRow) => string;
  readonly sessionWorkspace: (row: InstanceRow) => WorkspaceRef | undefined;
  readonly settledContinuation: (
    id: string
  ) => Promise<ContinuationRow | undefined>;
  readonly startContinuation: (
    prepared: PreparedContinuation,
    request: ContinueRequest,
    askedBy: ContinuationAsker,
    inFlight?: WorkInFlight | undefined
  ) => ContinuationRow;
  /** The project's tasks (tasks.ts), as an overtaken question's evidence reads them. */
  readonly tasks: Pick<Tasks, "get">;
  /** The write door (writes.ts): a session's `forge_post` goes through it. */
  readonly writes: Writes;
}

/** What `POST /api/followup-state` takes: the session or the workspace to read, and the message a Jev may weigh. */
export interface FollowupAsk {
  instanceId?: string | undefined;
  /** The message or brief the caller would send: Attach or fresh's question, with Jev on. */
  message?: string | undefined;
  workspace?: string | undefined;
}

/** What a continue asks for, as its route takes it. */
export type ContinueAsk = Static<typeof continueBody>;

/** The delegate types a session lists. */
const delegateTypesCalls = ({
  db,
  delegateTypes,
  projectTypes,
}: Pick<SessionCallsDeps, "db" | "delegateTypes" | "projectTypes">) => ({
  /** The live delegate types: the fleet's, or those of project `projectId`, its own shadowing the fleet's. */
  delegateTypes: (projectId: string | undefined) => {
    if (!projectId) {
      return { types: delegateTypes.list() };
    }
    const catalog = catalogOfProject(projectTypes, (id) =>
      db.listProjects().some((project) => project.id === id)
    )(projectId);
    return catalog instanceof ElysiaStatus ? catalog : { types: catalog.types };
  },
});

/** A session's context size. */
export const contextSizeCalls = ({
  db,
  reportedContextOf,
}: Pick<SessionCallsDeps, "db" | "reportedContextOf">) => ({
  /**
   * A session's context size as its machine reports it, or the problem when
   * the hub has no such session: what the cold-session refusal of a send reads.
   */
  contextSize: async (id: string) => {
    const [row] = db.getInstancesByIds([id]);
    if (!row) {
      return problem(404, {
        code: "session-not-found",
        detail: "Session not found",
      });
    }
    const reported = await reportedContextOf(row);
    // The answer's own words for a machine that did not answer.
    return "kind" in reported
      ? { reason: reported.reason === "dead" ? "offline" : "timeout" }
      : reported;
  },
});

/** What the hub reads of a session a message is about to reach. */
export const followupCalls = ({
  coldReading,
  db,
  followupState,
}: Pick<SessionCallsDeps, "coldReading" | "db" | "followupState">) => ({
  /**
   * What the hub reads of the session `ask` names (or of the one its
   * workspace's first work item ran) before a message reaches it: warm or
   * cold, mid-turn, what its workspace holds on no remote.
   */
  followupState: async (ask: FollowupAsk) => {
    let { instanceId } = ask;
    if (ask.workspace) {
      const workspaces = db.workspacesNamed(ask.workspace.trim());
      if (workspaces.length !== 1) {
        return problem(404, {
          code: "no-unique-workspace",
          detail: `No unique workspace "${ask.workspace}".`,
        });
      }
      instanceId = db.workItemsIn(workspaces[0].id)[0]?.instanceId;
    }
    const [row] = instanceId ? db.getInstancesByIds([instanceId]) : [];
    if (!row) {
      return {
        row: null,
        midTurn: false,
        requestAt: null,
        hasTurns: false,
        lastTurnAt: null,
        activityBound: false,
      };
    }
    const state = followupState(row);
    return {
      row,
      midTurn: state.midTurn,
      requestAt: state.requestAt,
      hasTurns: state.hasTurns,
      lastTurnAt: state.lastTurnAt,
      activityBound: state.activityBound,
      ...(await coldReading(row, state, ask.message)),
    };
  },
});

/** A session's Open items. */
export const openItemsCalls = ({
  db,
  openItems,
}: Pick<SessionCallsDeps, "db" | "openItems">) => ({
  /**
   * A session's Open items section, built now from its records
   * (open-items.ts): what the `open_items` tool answers, which every
   * harness's listing after a compaction reads.
   */
  openItems: async (
    id: string,
    page: { cursor?: string | undefined; format?: string | undefined }
  ) => {
    const cursor = Number(page.cursor ?? 0);
    const text = await openItems.read(db.instanceIdOf(id), {
      cursor: Number.isInteger(cursor) && cursor > 0 ? cursor : 0,
      detailed: page.format === "detailed",
    });
    return text instanceof ElysiaStatus ? text : { text };
  },
});

/**
 * A question to the person settled by a session of its project
 * (ask-closes.ts): his words elsewhere recorded, its asker's withdrawal, or
 * another session's close with evidence that its work moved on; and a
 * parent's forward of its delegate's question to the person.
 */
const askCalls = ({
  db,
  forwardRouted,
  hubAsks,
  sessionName,
  tasks,
}: Pick<
  SessionCallsDeps,
  "db" | "forwardRouted" | "hubAsks" | "sessionName" | "tasks"
>) => {
  const closes = createAskCloses({
    asks: hubAsks,
    db,
    name: sessionName,
    task: async (projectId, id) => {
      const task = await tasks.get(projectId, id);
      return task instanceof ElysiaStatus
        ? undefined
        : { kind: task.kind, todos: task.todos };
    },
  });
  /** The session `id` names, as the hub holds it; throws when it holds none. */
  const actorOf = (id: string): InstanceRow => {
    const [actor] = db.getInstancesByIds([db.instanceIdOf(id)]);
    if (!actor) {
      throw new Error(`No session ${id} on this hub.`);
    }
    return actor;
  };
  return {
    /** `record_pick` naming a question to the person (ask-closes.ts `record`). */
    recordAsked: (id: string, ask: string, asked: RecordAsked): string =>
      closes.record(actorOf(id), ask, asked),
    /** `question_close` naming a question to the person (ask-closes.ts `close`). */
    closeAsked: (id: string, ask: string, closing: CloseAsked) =>
      closes.close(actorOf(id), ask, closing),
    /** `answer_delegate` with `forward`: the ask its delegate routed to it goes to the person (ask-routing.ts `forward`). */
    forwardAsked: (id: string, ask: string): string =>
      forwardRouted(actorOf(id), ask),
  };
};

/** Continuing a session in a new one. */
export const continuationCalls = ({
  cloneForContinuation,
  continuationJob,
  continuationRefusal,
  inFlightFor,
  prepareContinuation,
  startContinuation,
}: Pick<
  SessionCallsDeps,
  | "cloneForContinuation"
  | "continuationJob"
  | "continuationRefusal"
  | "inFlightFor"
  | "prepareContinuation"
  | "startContinuation"
>) => ({
  /**
   * Continue in new session, for the session `sourceId`: the fit of both
   * models is checked before anything starts (a plain 409); then the hub
   * starts the job and answers with its ids at once. The job's stages reach
   * every dashboard on the `instances` frames (`continuations`); nothing about
   * the request that started it can stop it, only its Cancel. A source with
   * nothing to continue from, or no clone to go on in, is the hub's own 4xx;
   * a machine that is away, silent or failing is thrown as its
   * `MachineProblem`, which Elysia answers, and any other throw is the hub's
   * own failure, Elysia's 500.
   */
  continueFrom: async (sourceId: string, body: ContinueAsk) => {
    const { askedBy, ...request } = body;
    const asker: ContinuationAsker = askedBy
      ? { kind: "session", id: askedBy }
      : { kind: "person" };
    const release = await cloneForContinuation(sourceId);
    if (release instanceof ElysiaStatus) {
      return release;
    }
    // The clone is let go however this ends: a filed job's record holds the
    // source's workspace from then on (workspaces.ts `holdsOf`), and what
    // is thrown (a machine's cause, the hub's own failure) goes on to Elysia.
    try {
      const prepared = await prepareContinuation(
        sourceId,
        body.note,
        body.asksOnly
      );
      if (prepared instanceof ElysiaStatus) {
        return prepared;
      }
      const why = await continuationRefusal(prepared, request, asker);
      if (why) {
        return problem(409, { code: "continuation-refused", detail: why });
      }
      // What the source's process holds that ending it would lose: the
      // job waits for it, and the caller hears so at once.
      const inFlight = await inFlightFor(sourceId);
      if ("refusal" in inFlight) {
        return problem(422, {
          code: "work-in-flight",
          detail: inFlight.refusal,
        });
      }
      const row = startContinuation(prepared, request, asker, inFlight.work);
      const job = continuationJob(row);
      return {
        continuationId: row.id,
        targetInstanceId: row.targetInstanceId,
        summariserInstanceId: row.summariserInstanceId,
        ...(job.waiting ? { waiting: job.waiting } : {}),
      };
    } finally {
      release();
    }
  },
});

/** A started continuation's report. */
export const outcomeCalls = ({
  outcomeOf,
  settledContinuation,
}: Pick<SessionCallsDeps, "outcomeOf" | "settledContinuation">) => ({
  /**
   * A started continuation's report once it has one, which the
   * `continue_session` tool waits on; the problem when it is not running or
   * did not end well. The job runs whether or not anyone waits here.
   */
  continuationOutcome: async (id: string) => {
    const row = await settledContinuation(id);
    if (!row) {
      return problem(404, {
        code: "continuation-not-running",
        detail: "That continuation is not running.",
      });
    }
    if (row.stage === "started") {
      return outcomeOf(row);
    }
    return problem(422, {
      code: "continuation-cancelled",
      detail:
        row.stage === "cancelled"
          ? CONTINUATION_CANCELLED
          : (row.error ?? "the continuation failed"),
    });
  },
});

/** A session's forge_post and generate_image. */
export const mediaCalls = ({
  db,
  lifetime,
  machineCalls: { callAgent },
  sessionWorkspace,
  writes,
}: Pick<
  SessionCallsDeps,
  "db" | "lifetime" | "machineCalls" | "sessionWorkspace" | "writes"
>) => {
  /** The repository a session posts to: the one it names, else its project's only one; refused in words when there is none to take. */
  const repoFor = (projectId: string | null, named: string | undefined) => {
    const links = (projectId ? db.project(projectId)?.links : undefined) ?? [];
    const repo = named ?? (links.length === 1 ? links[0] : undefined);
    return (
      repo ??
      problem(422, {
        code: "forge-post-refused",
        detail:
          links.length === 0
            ? "cawco: nothing was posted: this session's project has no repository of its own, so name one with repo."
            : `cawco: nothing was posted. This session's project has several repositories, so pass one as repo: ${links.join(", ")}.`,
      })
    );
  };
  /** The task a session's attempt is on, when it is its project's. */
  const taskOf = (row: InstanceRow): string | null => {
    const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
    return item?.projectId === (row.projectId ?? null)
      ? (item?.taskId ?? null)
      : null;
  };
  return {
    /**
     * A session's `forge_post`, through the write door (writes.ts): made on
     * its machine with its own sign-in there, on the repository it names,
     * else its project's only one, recorded for its project and its attempt's
     * task. What it says is the tool's answer; a write that did not go is a
     * problem in its words.
     */
    forgePost: async (
      id: string,
      body: { op: unknown; repo?: string | undefined }
    ) => {
      const [row] = db.listedInstancesByIds([id]);
      const asked = readForgeAsk({ repo: "-", op: body.op })?.op;
      const op = asked && isMachineWrite(asked) ? asked : undefined;
      if (!(row && op)) {
        return problem(row ? 400 : 404, {
          code: "forge-post-refused",
          detail: row
            ? "forge_post takes one write."
            : "Unknown calling session.",
        });
      }
      const projectId = row.projectId ?? null;
      const repo = repoFor(projectId, body.repo);
      if (typeof repo !== "string") {
        return repo;
      }
      const outcome = await lifetime.run(
        Effect.result(
          writes.post({
            by: { session: row.id },
            target: { machine: row.machineId, repo },
            op,
            projectId,
            taskId: taskOf(row),
          })
        )
      );
      return Result.isSuccess(outcome)
        ? madeWords(op, outcome.success)
        : problem(422, {
            code: "forge-post-refused",
            detail: outcome.failure.words,
          });
    },

    /**
     * A session's `generate_image`, made on its machine with the sign-in
     * there.
     */
    generateImage: async (id: string, body: ImageGenerationRequest) => {
      const [row] = db.listedInstancesByIds([id]);
      if (!row) {
        return problem(404, {
          code: "unknown-calling-session",
          detail: "Unknown calling session.",
        });
      }
      // The provider the call names wins; else the fleet's default,
      // which with nothing set is ChatGPT on its own model.
      const { provider: named, model, ...asked } = body;
      const provider = named ? imageProviderOf(named) : undefined;
      const chosen = effectiveImageChoice(
        {
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
        },
        db.imageSettings()
      );
      const answer = await callAgent(
        row.machineId,
        GENERATE_IMAGE,
        // Its boundary, when it runs in one: the output lands in its clone or
        // $TMPDIR alone, and its references are read from those and its
        // project's folder alone.
        [
          row.id,
          row.cwd,
          { ...asked, ...chosen },
          sessionWorkspace(row) ?? null,
          row.projectId ?? null,
        ],
        IMAGE_GENERATION_TIMEOUT_MS + 30_000
      );
      switch (answer.kind) {
        case "unanswered":
          return answer.reason === "dead"
            ? awayProblem(
                row.machineId,
                "The session's machine is offline; image generation was not started."
              )
            : silentProblem(
                `Image generation did not finish within ${secondsOf(answer.after)} s. Check the output path before retrying; do not submit a duplicate automatically.`
              );
        case "answered":
          return answer.value.ok
            ? answer.value.result
            : problem(502, {
                code: "image-not-generated",
                detail: answer.value.error ?? "Image generation failed.",
              });
        default:
          throw unreachable(answer);
      }
    },
  };
};

/** A session naming itself. */
export const titleCalls = ({ db }: Pick<SessionCallsDeps, "db">) => ({
  /**
   * The session naming itself (`set_title`): the title it asks, or the
   * problem that says why not, with the owner's name in the answer once the
   * owner has renamed it.
   */
  setTitle: (id: string, asked: string) => {
    const title = asked.trim();
    const misfit = titleProblem(title);
    if (misfit) {
      return problem(400, { code: "title-invalid", detail: misfit });
    }
    const result = db.nameInstance(id, title, "agent");
    if (!result) {
      return problem(404, {
        code: "no-session",
        detail: `no session ${id}`,
      });
    }
    if (!result.named) {
      return problem(409, {
        code: "owner-named-session-so",
        detail: `The owner named this session "${result.row.title}", so set_title leaves it alone. Carry on with the task; do not call set_title again.`,
      });
    }
    return `Named this session "${title}".`;
  },
});

/** Pausing a machine and starting it again. */
export const machinePauseCalls = ({
  machinePause,
  machineRow,
}: Pick<SessionCallsDeps, "machinePause" | "machineRow">) => ({
  /**
   * Pauses a machine until a time (machine-pause.ts): nothing CawCo starts
   * runs there until then, its agent connected throughout. Answers the
   * machine's row as it stands, its pause on it, once what ran there has
   * stopped: the row says how many commands that was. `caller` is the
   * session whose tool call asked, when one did.
   */
  pauseMachine: async (
    machineId: string,
    body: { until: string },
    caller: PauseCaller | undefined
  ) => {
    const until = new Date(body.until);
    if (Number.isNaN(until.getTime())) {
      return problem(400, {
        code: "until-not-time-send",
        detail: `until: "${body.until}" is not a time; send an ISO 8601 time, such as 2026-10-15T21:00:00Z.`,
      });
    }
    if (until.getTime() <= Date.now()) {
      return problem(400, {
        code: "until-has-already-passed",
        detail: `until: ${body.until} has already passed.`,
      });
    }
    const row = (await machinePause.pause(machineId, until, caller))
      ? machineRow(machineId)
      : undefined;
    if (!row) {
      return problem(404, {
        code: "no-machine",
        detail: "No machine with that id on this hub.",
      });
    }
    return row;
  },

  /** Ends a machine's pause now: what it was kept goes, in order. */
  resumeMachine: (machineId: string) => {
    if (!machineRow(machineId)) {
      return problem(404, {
        code: "no-machine",
        detail: "No machine with that id on this hub.",
      });
    }
    machinePause.resume(machineId);
    const row = machineRow(machineId);
    return row
      ? row
      : problem(404, {
          code: "no-machine",
          detail: "No machine with that id on this hub.",
        });
  },
});

/** Every call a session's tools make, composed from the families above. */
export const sessionCalls = (deps: SessionCallsDeps) => ({
  ...delegateTypesCalls(deps),
  ...contextSizeCalls(deps),
  ...followupCalls(deps),
  ...openItemsCalls(deps),
  ...askCalls(deps),
  ...continuationCalls(deps),
  ...outcomeCalls(deps),
  ...mediaCalls(deps),
  ...titleCalls(deps),
  ...machinePauseCalls(deps),
  /** The artifact tools of session `instanceId` (artifacts/calls.ts). */
  artifacts: (instanceId: string) => artifactTools(deps.artifacts, instanceId),
});

/** What a session's tools call directly. */
export type SessionCalls = ReturnType<typeof sessionCalls>;
