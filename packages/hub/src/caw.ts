/**
 * A project's conversation (Projects spec §5.3, §5.6; the one-session
 * build): a session like any other, whose scope is its project. Its project
 * names it (`projects.conversation_instance_id`), and Caw is its name and
 * face on the project's page.
 *
 * - **A switch per project** (`projects.caw`): whether the project's events
 *   reach a conversation. Your words reach it on or off; an event, only
 *   while it is on. Off, what it started still runs or stops as you choose
 *   ({@link turnOff}).
 * - **Started by the hub when an event needs one**: on a checkout of the
 *   project on a machine that is online, else its folder on the hub or a
 *   folder of its own ({@link CawDeps.leadHome}). A plain spawn in the
 *   project, in the permission mode its trigger's layers name
 *   ({@link modeFor}: the event route's, the routine's, the project's, the
 *   fleet's), else the one you last chose for its harness on that machine.
 *   A start that fails says why on the project's head until one goes.
 * - **Events are sends**: each event is one send to the conversation's
 *   session through the one send path ({@link Caw.tell}), opening with its
 *   context line ({@link eventContext}: the project and folder, the trigger,
 *   the skill for its kind). A report reaches it as any delegate's reaches
 *   its parent. Nothing is noted anywhere else: the person reads the
 *   conversation.
 * - **Notes**: what the hub says to the person about the project (a
 *   repository made, an offer to answer, a routine made) is a line in the
 *   conversation's transcript, waking nobody ({@link Caw.notice}).
 * - **Views**: a session drafts a view with `view_draft` (views.ts), an
 *   OpenUI Lang program written to the prompt generated from CawCo's library
 *   (openui.ts `VIEW_PROMPT`, which your ask for a view carries); you keep or
 *   discard it. Asked for from a page's end, the draft stands on that page as
 *   a proposed block (blocks.ts).
 * - Each project shows its conversation's spend: what every session of
 *   origin `project` has cost, from the usage buckets budgets already read.
 */

import { createHash } from "node:crypto";
import {
  BLOCK_PAGE_TITLES,
  BLOCK_PAGES,
  type BlockPage,
  BOARD_ONLY_DENIED_TOOLS,
  CAW_NO_MACHINE,
  type CawInitiated,
  type CawRunning,
  type ConnectionView,
  CURATOR_DENIED_TOOLS,
  type Envelope,
  HARNESSES,
  type HarnessKind,
  harnessNamed,
  type InstanceRow,
  type NeutralOrigin,
  type OfferedMode,
  type ProjectConversationView,
  type ProjectNote,
  type ProjectSpend,
  type ProjectView,
  projectLink,
  type RelayProvider,
  type SendPayload,
  type SpawnPayload,
  STAGES_TEMPLATES,
  type StagesTemplate,
  taskLink,
  VIEW_TOOLS,
  viewTitle,
  type WorkspaceRef,
} from "@cawco/core";
import { sayNestedBoundaryFix } from "@cawco/core/boundary-nesting";
import { PLACE_SUFFIX } from "@cawco/core/workspace-policy";
import { Elysia, status, t } from "elysia";
import { z } from "zod";
import type { Blocks } from "./blocks";
import { topsAtCaw } from "./caw-own";
import type { DbShape } from "./db";
import type { Origin } from "./db/schema";
import { boardTitle } from "./labels";
import { sentence, tool } from "./mcp-tool";
import { personsTier, ROUTINE_ORIGIN } from "./memory";
import { VIEW_PROMPT } from "./openui";
import {
  folderReadWords,
  folderWrittenWords,
  viewDraftedWords,
  viewQueryWords,
} from "./presenters/project";
import type { Caps } from "./project-caps";
import {
  FOLDER_CONTENT_LIMIT,
  FOLDER_ENCODINGS,
  FolderRefusal,
  folderContent,
  folderPath,
  listFolder,
  readFolderFile,
  writeFolderFile,
} from "./project-folder";
import { refusalAnswer, refuser, StatusRefusal } from "./refusal";
import {
  type RelayOffer,
  SETUP_PARTS,
  type SetupAsk,
  type SetupPart,
  setupEvent,
} from "./setup";
import { readStages, templateText } from "./stages";
import { MODE, stagesFileOf, type TaskEvent, type TaskView } from "./tasks";
import type { Views } from "./views";

/**
 * Where a view asked for from a page's end stands once drafted: that page,
 * at `position` in its order (null: its end).
 */
interface ViewPlace {
  page: BlockPage;
  position: number | null;
}

/** The harness a change names, refused when CawCo runs none of that name; undefined when it names none. */
const harnessOf = (asked: string | undefined): HarnessKind | undefined =>
  asked === undefined
    ? undefined
    : (harnessNamed(asked) ??
      refuse(400, `CawCo runs no harness called ${asked}.`));

/**
 * The model Caw runs after a change: the one it names (blank is the
 * harness's default), else none on a new harness (its models are its own),
 * else the one he had.
 */
const modelAfter = (
  had: string | null,
  asked: string | null | undefined,
  rehomed: boolean
): string | null => {
  if (asked !== undefined) {
    return asked?.trim() || null;
  }
  return rehomed ? null : had;
};

/** A fleet-watch triage run's denied tools on `harness` (core `BOARD_ONLY_DENIED_TOOLS`): the board alone. */
const boardOnlyDenied = (harness: string): readonly string[] => {
  if (!(harness in BOARD_ONLY_DENIED_TOOLS)) {
    throw new Error(
      `Fleet-watch triage does not run on ${harness}: it cannot be fenced to CawCo's tools alone.`
    );
  }
  return BOARD_ONLY_DENIED_TOOLS[harness as HarnessKind];
};

/** A memory curator's denied tools on `harness` (core `CURATOR_DENIED_TOOLS`); refused on one that cannot fence it. */
const curatorDenied = (harness: string): readonly string[] => {
  if (!(harness in CURATOR_DENIED_TOOLS)) {
    throw new Error(
      `The memory curator does not run on ${harness}: it cannot be fenced to CawCo's tools alone.`
    );
  }
  return CURATOR_DENIED_TOOLS[harness as HarnessKind];
};

/**
 * Whether `row` is its project's conversation: the session the project's
 * events reach, which its project's row names (`conversation_instance_id`). In every
 * other way it is a worker like any other.
 */
export const isProjectConversation = (
  row: Pick<InstanceRow, "id" | "projectId">,
  project: (id: string) => { conversationInstanceId: string | null } | undefined
): boolean =>
  !!row.projectId && project(row.projectId)?.conversationInstanceId === row.id;

/**
 * A spawn as it reaches a machine: an overseer row's (a fleet-watch triage
 * run, fleet-watch.ts) denies the board-only list; a curator row's (a
 * project's memory curator run) that and the web, whatever else it denies.
 * Each says it is fenced ({@link SpawnPayload.fence}): CawCo's MCP server
 * and no other. Any other row's spawn says it is not, whatever its caller
 * sent.
 */
export const fencedSpawn = (
  payload: SpawnPayload,
  row: Pick<InstanceRow, "role">,
  harness: string
): SpawnPayload => {
  const { fence: _callerFence, ...asked } = payload;
  let denied: readonly string[];
  if (row.role === "overseer") {
    denied = boardOnlyDenied(harness);
  } else if (row.role === "curator") {
    denied = curatorDenied(harness);
  } else {
    return asked;
  }
  return {
    ...asked,
    fence: true as const,
    denyTools: [...new Set([...(asked.denyTools ?? []), ...denied])],
  };
};

/**
 * The place a sheet's stage is named by for a session with no workspace of
 * its own (live components): a place over the folder it works in, on its
 * machine. The machine runs the stage in that place's stage clone (agent stage-clone.ts):
 * a clone of the checkout at its HEAD with its uncommitted changes, kept in
 * step with it, in a boundary of its own, so the toolchain writes its own
 * tree and never the person's, while the session's own commands stay on the
 * host. Its id names the machine and folder, so every session there shares
 * one stage.
 */
export const stagePlaceRef = (
  row: Pick<InstanceRow, "machineId" | "cwd">
): WorkspaceRef => ({
  id: `${createHash("sha256")
    .update(`${row.machineId}\0${row.cwd}`)
    .digest("hex")
    .slice(0, 8)}${PLACE_SUFFIX}`,
  path: row.cwd,
});

/**
 * The skill each kind of event names in its send's context line: the how-to
 * for that kind (packages/hub/skills/), which the conversation loads when it
 * reads it.
 */
export const EVENT_SKILLS = {
  "routine-run": "project-routine-run",
  "delegate-report": "project-delegate-report",
  "attempt-judgement": "project-attempt-judgement",
  "task-move": "project-task-move",
  "github-event": "project-github-event",
  "inbound-event": "project-inbound-event",
  "person-request": "project-person-request",
  "fleet-watch": "project-fleet-watch",
  connection: "project-connection",
  decision: "project-decision",
} as const;

/** What kind of event a send to the project's conversation is ({@link EVENT_SKILLS}). */
export type EventKind = keyof typeof EVENT_SKILLS;

/**
 * One event the project's conversation hears, as one send to its session
 * ({@link Caw.tell}): who it is from (`you`, the person's words from another
 * place, which reach it on or off; `event`, anything else, only while the
 * switch is on), its kind, what triggered it in words with its link, and its
 * own words. A routine's run and an event route name themselves, for the
 * turn the run is and the mode a start takes ({@link modeFor}).
 */
export interface ProjectEvent {
  by: Origin;
  /** What rode with the person's words (pictures, files). */
  carried?: Carried;
  kind: EventKind;
  /** The event route that delivered it, when one did. */
  route?: string;
  /** The routine whose run it is. */
  routine?: string;
  text: string;
  /** What triggered it, a phrase with its link: "the routine [Nightly](…), its 09:00 run". */
  trigger: string;
}

/**
 * The two lines every event's send opens with: where the conversation runs
 * (its project and folder), what triggered it, and the skill for its kind.
 */
export const eventContext = (
  project: { id: string; name: string },
  folder: string,
  kind: EventKind,
  trigger: string
): string =>
  `[CawCo] ${projectLink(project.id, project.name)}, in ${folder}: ${trigger}.\nFor how to handle a ${kind.replaceAll("-", " ")}, use the ${EVENT_SKILLS[kind]} skill.`;

/** What a send carries besides its words: pictures (base64) and attachments. */
export type Carried = Pick<SendPayload, "attachments" | "images">;

const STAGES_FILE = "stages.md";
/** A project's delegate types: a write there is a proposal the person approves (memory.ts `proposeType`). */
const DELEGATES_DIR = "delegates/";

/** A folder call, its refusal as the sentence Caw reads. */
const folderCall = async <T>(call: () => T | Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    if (error instanceof FolderRefusal) {
      throw new Error(error.message, { cause: error });
    }
    throw error;
  }
};

/** stages.md as Caw writes it, refused with what does not read. */
const stagesRead = (body: string | Uint8Array): void => {
  const reading = readStages(
    typeof body === "string" ? body : new TextDecoder().decode(body)
  );
  if (!reading.ok) {
    throw new Error(`stages.md was not written: ${reading.problems.join(" ")}`);
  }
};

/** The system origin's name of a send to the project's conversation for an event (core `NeutralOrigin`). */
export const PROJECT_ORIGIN = "project";

/** Statuses a conversation cannot be woken from: its row is gone for good. */
const GONE: ReadonlySet<string> = new Set(["discarded"]);

/** What a thrown error says. */
const errorWords = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Why an event's send goes no further while the switch is off. */
const CAW_OFF =
  "Events don't reach this project's conversation while its switch is off.";

/** A refusal a route answers with its status. */
class CawRefusal extends StatusRefusal {}

const refuse = refuser(CawRefusal);

export interface CawDeps {
  /** The project's conversation ended a turn (project-starters.ts asks its starters again). */
  readonly answered: (projectId: string) => void;
  /** Stands a draft a session writes for a page there, as a proposed block (blocks.ts). */
  readonly blocks: Pick<Blocks, "propose">;
  /** The project's spend cap and the fleet's default for it (project-caps.ts). */
  readonly caps: Pick<Caps, "capOf" | "quiets">;
  /**
   * The project's conversation started while its switch is on: the inbound
   * events kept for it go to it now (ingress.ts `drain`).
   */
  readonly conversationStarted: (projectId: string) => void;
  readonly db: Pick<
    DbShape,
    | "cawMode"
    | "cawSpentSince"
    | "getInstancesByIds"
    | "ingress"
    | "listProjects"
    | "project"
    | "projectNotes"
    | "projectSpend"
    | "routines"
    | "setCawMode"
    | "setProjectCaw"
    | "spendOnCap"
    | "taskIndex"
    | "updateWorkItem"
    | "workItem"
  >;
  /** Ends a session (the conversation, when its harness or model moves). */
  readonly end: (instanceId: string) => void;
  /** Whether the fleet's delegates choice was ever set (setup asks for it until it is). */
  readonly fleetChoicesSet: () => boolean;
  /** The project's folder changed under its tasks (stages.md, a task file). */
  readonly folderChanged: (projectId: string) => void;
  /**
   * Where the conversation starts while no checkout of the project is
   * online: its folder on the hub when the hub's machine runs an agent, else
   * a folder of its own on another machine that is online; undefined while
   * no machine is.
   */
  readonly leadHome: (
    projectId: string
  ) => Promise<{ machineId: string; cwd: string } | undefined>;
  /** A project note placed in a conversation's transcript as it is written (server.ts `noteProject`). */
  readonly noted: (
    instanceId: string,
    note: { at: number; id: string; note: ProjectNote }
  ) => void;
  /** Whether a machine is connected now; without one, whether any is. */
  readonly online: (machineId?: string) => boolean;
  /** Every dashboard and the app read the projects again: the switch, harness, model or conversation moved. */
  readonly projectsChanged: () => void;
  /**
   * A `folder_write` of a `delegates/` file, parked as the person's proposal
   * and drawn at the call `toolUseId` (memory.ts `proposeType`): nothing is
   * committed until they approve it.
   */
  readonly proposeType: (
    actor: InstanceRow,
    path: string,
    content: string,
    toolUseId: string | undefined
  ) => Promise<{ id: string; path: string; waiting: string }>;
  /** Setup's stream relay card, while it is to be asked (with the domain the person last reached CawCo through); null once the fleet has a relay or a journey, or the card was answered and not asked `again`. */
  readonly relayOffer: (again: boolean) => RelayOffer | null;
  /** Delivers one message to a session through the hub's one send path: whether the hub took it (its record `pending`). */
  readonly send: (envelope: Envelope<SendPayload>) => boolean;
  /**
   * Starts the project's conversation as any session starts (server.ts
   * `spawnSession`): in the mode its payload names ({@link modeFor}), else
   * the one you last chose for its harness on that machine.
   */
  readonly spawn: (machineId: string, payload: SpawnPayload) => Promise<void>;
  /**
   * A project's forget stop path (project-stops.ts): its running sessions as
   * a tree, and their stop, each end reported as `project.stop` once its
   * machine confirms it (or deferred to an away machine's next register).
   */
  readonly stops: {
    running: (
      projectId: string
    ) => Omit<CawRunning, "kind" | "taskId" | "taskTitle">[];
    stop: (projectId: string, ids: string[]) => void;
  };
  /** A task as its project's files have it. */
  readonly task: (
    projectId: string,
    id: string
  ) => Promise<Pick<TaskView, "id" | "kind" | "stage" | "title">>;
  /**
   * A session's turn ended (routines.ts `turnEnded`): the conversation runs
   * whose wake it read and that it gave no result fail, `why` when it is
   * not the plain end of a turn. `gone`, the project whose conversation it
   * was, when the session itself is over.
   */
  readonly turnEnded: (instanceId: string, why?: string, gone?: string) => void;
  /** Whether the fleet's upstream choice was ever answered (setup asks it until it is). */
  readonly upstreamAnswered: () => boolean;
  /**
   * Writes drafted views, answers the view tools, and reads a kept view to
   * change (views.ts).
   */
  readonly views: Pick<Views, "draft" | "kept" | "query" | "view">;
}

export const createCaw = ({
  answered,
  blocks,
  caps,
  conversationStarted,
  db,
  end,
  fleetChoicesSet,
  folderChanged,
  leadHome,
  noted,
  online,
  projectsChanged,
  proposeType,
  relayOffer,
  send,
  spawn,
  stops,
  task,
  turnEnded,
  upstreamAnswered,
  views,
}: CawDeps) => {
  /** Conversations being started now, by project: one start per project at a time. */
  const starting = new Map<string, Promise<InstanceRow>>();

  const projectOf = (projectId: string) =>
    db.project(projectId) ??
    refuse(404, `The hub keeps no project ${projectId}.`);

  const row = (id: string): InstanceRow | undefined =>
    db.getInstancesByIds([id])[0] as InstanceRow | undefined;

  /**
   * The project's conversation is now `instanceId` (null: none): its notes
   * written while it had none are its own now, and every dashboard and the
   * app read the projects again, whose rows name it.
   */
  const setConversation = (
    projectId: string,
    instanceId: string | null
  ): void => {
    db.setProjectCaw(projectId, { conversationInstanceId: instanceId });
    if (instanceId) {
      db.projectNotes.adopt(projectId, instanceId);
    }
    projectsChanged();
  };

  /** The project's conversation, when it has one the hub can still wake. */
  const standing = (
    project: ReturnType<typeof projectOf>
  ): InstanceRow | undefined => {
    const current = project.conversationInstanceId
      ? row(project.conversationInstanceId)
      : undefined;
    return current &&
      current.projectId === project.id &&
      !GONE.has(current.status) &&
      online(current.machineId)
      ? current
      : undefined;
  };

  /** A checkout of the project on a machine that is online, the primary first. */
  const checkoutFor = (project: ReturnType<typeof projectOf>) => {
    const checkouts = project.places.filter(
      (place) => place.kind === "checkout" && online(place.machineId)
    );
    return checkouts.find((place) => place.isPrimary) ?? checkouts[0];
  };

  /**
   * Where the conversation starts: a checkout that is online; before the
   * project has one online, its folder on the hub or a folder of its own
   * ({@link CawDeps.leadHome}).
   */
  const placeFor = async (
    project: ReturnType<typeof projectOf>
  ): Promise<{ machineId: string; cwd: string } | undefined> => {
    const checkout = checkoutFor(project);
    return checkout
      ? { machineId: checkout.machineId, cwd: checkout.path }
      : await leadHome(project.id);
  };

  /** Why the conversation could not start for the project now, on or off, or null. */
  const problemOf = (project: ReturnType<typeof projectOf>): string | null => {
    if (standing(project) || checkoutFor(project)) {
      return null;
    }
    return online() ? null : CAW_NO_MACHINE;
  };

  /**
   * Why the project's conversation last failed to start (a permission mode
   * nobody chose, a machine refusing it), by project, until a start goes:
   * the project's head says it ({@link view}).
   */
  const startRefusals = new Map<string, string>();

  /**
   * The permission mode a start of the project's conversation takes for
   * `event`, the most specific set one: the event route's that delivered
   * it, its routine's, the project's, the fleet's. Undefined: none is set,
   * and the start takes the mode the person last chose for its harness on
   * that machine (server.ts `settleMode`).
   */
  const modeFor = (
    project: ReturnType<typeof projectOf>,
    event: Pick<ProjectEvent, "route" | "routine"> | undefined
  ): OfferedMode | undefined =>
    (event?.route ? db.ingress.route(event.route)?.mode : undefined) ??
    (event?.routine ? db.routines.get(event.routine)?.mode : undefined) ??
    project.cawMode ??
    db.cawMode() ??
    undefined;

  /**
   * One message to the conversation's session. One that carries your words
   * is yours (`human`), as a session's composer sends it: it wakes the
   * session stopped, and at its account's limit it is moved or continued as
   * any person's turn is. Any other is CawCo's word (`system`, named
   * `project`): a routine's says so in its origin (`routine:<id>`), the turn
   * it starts that run's (memory.ts). Answers the send's uuid when the hub
   * took it.
   */
  const message = (
    target: InstanceRow,
    content: string,
    by: Origin,
    routine?: string,
    carried?: Carried
  ): string | undefined => {
    const uuid = crypto.randomUUID();
    const origin: NeutralOrigin =
      by === "you"
        ? { kind: "human" }
        : {
            kind: "system",
            name: routine ? `${ROUTINE_ORIGIN}${routine}` : PROJECT_ORIGIN,
          };
    const taken = send({
      verb: "send",
      machineId: target.machineId,
      instanceId: target.id,
      payload: {
        ...carried,
        instanceId: target.id,
        message: {
          type: "user",
          uuid,
          message: { role: "user", content },
          parent_tool_use_id: null,
          origin,
        },
      },
    });
    return taken ? uuid : undefined;
  };

  /** What starts the conversation: its first words, once its row is there, and how. */
  interface Start {
    by: Origin;
    carried?: Carried;
    first: (session: InstanceRow) => string;
    mode?: OfferedMode;
    routine?: string;
  }

  /**
   * Starts the project's conversation, a plain spawn in the project, makes
   * it the one the project's events reach, and sends it the words that
   * started it: a session is only ever started by something to say.
   */
  const startConversation = async (
    project: ReturnType<typeof projectOf>,
    start: Start
  ): Promise<{ conversation: InstanceRow; sent: string | undefined }> => {
    const place =
      (await placeFor(project)) ??
      refuse(409, problemOf(project) ?? CAW_NO_MACHINE);
    const instanceId = crypto.randomUUID();
    try {
      await spawn(place.machineId, {
        instanceId,
        cwd: place.cwd,
        harness: project.cawHarness,
        ...(project.cawModel ? { model: project.cawModel } : {}),
        ...(start.mode ? { permissionMode: start.mode } : {}),
        projectId: project.id,
        title: "Caw",
        requestId: crypto.randomUUID(),
      });
    } catch (error) {
      startRefusals.set(project.id, errorWords(error));
      projectsChanged();
      throw error;
    }
    startRefusals.delete(project.id);
    setConversation(project.id, instanceId);
    const conversation = row(instanceId);
    if (!conversation) {
      throw new Error(
        `The project's conversation ${instanceId} has no row on this hub.`
      );
    }
    const sent = message(
      conversation,
      start.first(conversation),
      start.by,
      start.routine,
      start.carried
    );
    console.log(
      `[caw] ${project.name}: started its conversation on ${project.cawHarness} (${instanceId})`
    );
    if (project.eventsOn) {
      conversationStarted(project.id);
    }
    return { conversation, sent };
  };

  /**
   * The project's conversation: the one it has, or one started now with
   * `start`'s words (its first message): for your words on or off, for an
   * event while the switch is on. Undefined for an event while it is off.
   * Callers at once share one start; `started` says whether this call's
   * words went out with it, as the send `sent`.
   */
  const conversationFor = async (
    projectId: string,
    start: Start
  ): Promise<
    | { row: InstanceRow; sent?: string | undefined; started: boolean }
    | undefined
  > => {
    const project = projectOf(projectId);
    if (start.by === "event" && !project.eventsOn) {
      return undefined;
    }
    const current = standing(project);
    if (current) {
      return { row: current, started: false };
    }
    const pending = starting.get(projectId);
    if (pending !== undefined) {
      return { row: await pending, started: false };
    }
    const begun = startConversation(project, start).finally(() =>
      starting.delete(projectId)
    );
    const shared = begun.then((one) => one.conversation);
    // A start that fails is the starter's to answer; those sharing it hear it too.
    shared.catch(() => undefined);
    starting.set(projectId, shared);
    const made = await begun;
    return { row: made.conversation, sent: made.sent, started: true };
  };

  /**
   * What one send to the conversation came to: its session took it, or not
   * and why (`why`, the hub's sentence), with what was thrown when
   * something refused it.
   */
  type Told =
    | { instanceId: string; send: string; woke: true }
    | {
        thrown?: unknown;
        why: string;
        woke: false;
      };

  /** Why `event` goes nowhere now: events are off, or the project is past its cap; undefined when it goes. */
  const heldBack = (
    project: ReturnType<typeof projectOf>,
    event: ProjectEvent
  ): Extract<Told, { woke: false }> | undefined => {
    if (event.by === "event" && !project.eventsOn) {
      return { woke: false, why: CAW_OFF };
    }
    const capped = caps.quiets(project.id);
    if (capped === undefined) {
      return;
    }
    return {
      woke: false,
      why: capped,
      ...(event.by === "you" ? { thrown: new CawRefusal(409, capped) } : {}),
    };
  };

  /**
   * One event, one send to the project's conversation (§5.3): an attempt's
   * judgement, a task moving, a routine's run, an inbound event, the
   * person's words from another place. It opens with its context
   * ({@link eventContext}) and carries the event's own words after it,
   * starting the conversation when it has none (in {@link modeFor}'s mode).
   * The person's words reach it on or off; an event, only while the switch
   * is on. Past the project's spend cap nothing goes. There is no timer
   * behind it.
   */
  const tell = async (
    projectId: string,
    event: ProjectEvent
  ): Promise<Told> => {
    const project = projectOf(projectId);
    const refused = heldBack(project, event);
    if (refused) {
      return refused;
    }
    const words = (session: InstanceRow) =>
      `${eventContext(project, session.cwd, event.kind, event.trigger)}\n\n${event.text}`;
    const mode = modeFor(project, event);
    let conversation: Awaited<ReturnType<typeof conversationFor>>;
    try {
      conversation = await conversationFor(projectId, {
        by: event.by,
        first: words,
        ...(event.carried ? { carried: event.carried } : {}),
        ...(event.routine ? { routine: event.routine } : {}),
        ...(mode ? { mode } : {}),
      });
    } catch (error) {
      return { woke: false, why: errorWords(error), thrown: error };
    }
    if (!conversation) {
      return { woke: false, why: CAW_OFF };
    }
    const sent = conversation.started
      ? conversation.sent
      : message(
          conversation.row,
          words(conversation.row),
          event.by,
          event.routine,
          event.carried
        );
    return sent
      ? { woke: true, instanceId: conversation.row.id, send: sent }
      : { woke: false, why: "Its session didn't take the message." };
  };

  /** {@link tell} for the tellers that only log what did not go: an event is never lost silently. */
  const tellQuietly = (projectId: string, event: ProjectEvent): void => {
    const said = (why: string) => {
      console.warn(
        `[caw] ${projectId}: the project's conversation did not hear ${event.kind}: ${why}`
      );
      sayNestedBoundaryFix(why);
    };
    tell(projectId, event).then(
      (told) => {
        if (!told.woke) {
          said(told.why);
        }
      },
      (error: unknown) => said(errorWords(error))
    );
  };

  /**
   * {@link tell} for your own words from a page (a view's ask, a project's
   * setup, a decided page): what refused them is thrown, as the page's
   * answer; answers the conversation's session.
   */
  const tellYours = async (
    projectId: string,
    event: Omit<ProjectEvent, "by">
  ): Promise<{ instanceId: string; send: string }> => {
    const told = await tell(projectId, { ...event, by: "you" });
    if (told.woke) {
      return { instanceId: told.instanceId, send: told.send };
    }
    throw told.thrown ?? new CawRefusal(409, told.why);
  };

  /** Ends the project's conversation and clears it: its harness or model moved. */
  const retire = (project: ReturnType<typeof projectOf>): void => {
    if (project.conversationInstanceId) {
      turnEnded(
        project.conversationInstanceId,
        "The project's conversation was replaced before it said how the run went",
        project.id
      );
      end(project.conversationInstanceId);
    }
    setConversation(project.id, null);
  };

  /**
   * What the conversation started that still runs: the project's running
   * sessions (as its forget lists them) whose delegation chain tops at it,
   * each with what it is. Rows under it stand at the top.
   */
  const initiated = (project: ReturnType<typeof projectOf>): CawRunning[] => {
    const own = project.conversationInstanceId;
    const listed = stops.running(project.id).filter((session) => {
      const one = session.id === own ? undefined : row(session.id);
      return Boolean(
        one?.parentInstanceId && topsAtCaw(db, one.parentInstanceId, project)
      );
    });
    const ids = new Set(listed.map((session) => session.id));
    const titles = new Map(
      listed.length > 0
        ? db.taskIndex(project.id).map((indexed) => [indexed.id, indexed.title])
        : []
    );
    return listed.map((session): CawRunning => {
      const item = row(session.id)?.workItemId;
      const taskId = item ? (db.workItem(item)?.taskId ?? null) : null;
      return {
        ...session,
        parentId:
          session.parentId && ids.has(session.parentId)
            ? session.parentId
            : null,
        kind: taskId ? "attempt" : "delegate",
        taskId,
        taskTitle: taskId ? (titles.get(taskId) ?? null) : null,
      };
    });
  };

  /**
   * The ids in `ids` the conversation did not start, each named in quotes
   * by its session's title: one it started that ended since it was listed
   * is its own, with nothing left to stop.
   */
  const foreignOf = (
    project: ReturnType<typeof projectOf>,
    running: CawRunning[],
    ids: string[]
  ): string[] => {
    const runs = new Set(running.map((one) => one.id));
    return ids.flatMap((id) => {
      if (runs.has(id)) {
        return [];
      }
      const one = row(id);
      if (
        one?.parentInstanceId &&
        topsAtCaw(db, one.parentInstanceId, project)
      ) {
        return [];
      }
      return [`"${one?.title ?? one?.derivedTitle ?? id}"`];
    });
  };

  /**
   * The switch turned off: you are asked whenever something the
   * conversation started still runs, so nothing is cut, or left running,
   * unseen. `stop` names the ones that stop now, through the forget's stop
   * path, each confirmed as its machine ends it; the rest run to their end,
   * marked `kept`, so they are carried past an account's limit. An id the
   * conversation did not start is refused, named, before anything stops. The
   * conversation itself is a session like any other: it stays, for your
   * next words.
   */
  const turnOff = (
    project: ReturnType<typeof projectOf>,
    choice: CawInitiated | undefined
  ): void => {
    const running = initiated(project);
    if (running.length > 0 && !choice) {
      refuse(
        409,
        `The project's conversation started ${running.length === 1 ? "1 thing that is" : `${running.length} things that are`} still running. Name which stop (\`initiated: { stop: [...] }\`, none to let them all finish), then turn it off.`
      );
    }
    const foreign = foreignOf(project, running, choice?.stop ?? []);
    if (foreign.length > 0) {
      refuse(
        409,
        `${foreign.join(", ")} ${foreign.length === 1 ? "wasn't" : "weren't"} started by the project's conversation, so nothing stopped and it is still on.`
      );
    }
    const stopping = new Set(choice?.stop ?? []);
    const stopped = running.filter((one) => stopping.has(one.id));
    if (stopped.length > 0) {
      stops.stop(
        project.id,
        stopped.map((one) => one.id)
      );
    }
    keep(running.filter((one) => !stopping.has(one.id)));
  };

  /** What runs on as Caw goes off: its work items marked `kept`, so they are carried past an account's limit. */
  const keep = (rows: CawRunning[]): void => {
    for (const one of rows) {
      const itemId = row(one.id)?.workItemId;
      if (itemId && db.workItem(itemId)?.origin === "event") {
        db.updateWorkItem(itemId, { origin: "kept" });
      }
    }
  };

  const view = (projectId: string): ProjectConversationView => {
    const project = projectOf(projectId);
    return {
      on: project.eventsOn,
      harness: project.cawHarness,
      model: project.cawModel,
      mode: project.cawMode,
      instanceId: project.conversationInstanceId,
      problem: problemOf(project) ?? startRefusals.get(projectId) ?? null,
      running: initiated(project),
      spendUsd: db.cawSpentSince(projectId, 0),
    };
  };

  /** What a session reads when you ask for a view: your words, where you asked from, then how a view is written. */
  const viewRequest = (body: string, place: ViewPlace | null) => {
    const draft = place
      ? `They asked from the ${BLOCK_PAGE_TITLES[place.page]} page: draft it with view_draft({ name, source, page: "${place.page}"${place.position === null ? "" : `, position: ${place.position}`} }), and it stands there as a block they keep or remove.`
      : "Draft it with view_draft({ name, source }).";
    return `${body}\n\n${draft}\n\n# How a view is written\n\n${VIEW_PROMPT}`;
  };

  /** What a session reads when you ask to change a kept view: your words, its program, then how a view is written. */
  const viewChange = (kept: ProjectView, body: string) =>
    `${body}\n\nIts program now:\n\n${kept.source}\n\nDraft the change with view_draft({ name: "${kept.name}", source }): they keep it where the view stands, or discard it.\n\n# How a view is written\n\n${VIEW_PROMPT}`;

  /**
   * Caw's draft written (`view_draft`), as view_draft answers it. For a
   * page, a name that is a kept view's is refused (a change keeps the view's
   * place, so it is drafted without one); with a page, the draft stands
   * there as a proposed block.
   */
  const draftView = async (
    projectId: string,
    /** Whose draft it is, by the name the board gives the session (labels.ts `boardTitle`). */
    by: string,
    input: {
      name: string;
      page?: BlockPage;
      position?: number;
      source: string;
    }
  ) => {
    if (
      input.page &&
      (await folderCall(() => views.kept(projectId))).includes(input.name)
    ) {
      throw new Error(
        `“${input.name}” is a kept view already, standing where the person put it: draft its change without a page.`
      );
    }
    const drafted = await folderCall(() =>
      views.draft(projectId, input.name, input.source, { name: by })
    );
    const proposed = input.page
      ? blocks.propose(
          projectId,
          drafted.name,
          input.page,
          input.position ?? null,
          by
        )
      : null;
    return {
      ok: true as const,
      view: drafted.name,
      draft: true as const,
      ...(proposed
        ? { proposed: { page: proposed.page, position: proposed.position } }
        : {}),
      ...(drafted.dropped.length
        ? {
            dropped: drafted.dropped,
            note: `CawCo's views have no ${drafted.dropped.join(", ")}: ${drafted.dropped.length > 1 ? "they are" : "it is"} left out of the view. Use only the components listed.`,
          }
        : {}),
    };
  };

  /** A folder's refusal (a view the project does not keep) as Caw's, with its sentence. */
  const refusedBy = (error: unknown): never => {
    if (error instanceof FolderRefusal) {
      const code = error.status;
      return refuse(
        code === 400 || code === 404 || code === 409 ? code : 400,
        error.message
      );
    }
    throw error;
  };

  const bodyOf = (body: string): string =>
    body.trim() || refuse(400, "A message needs words.");

  /**
   * Setup's steps for `project` as the fleet stands now ({@link setupEvent}),
   * the one source of both its paths: the send a new project's conversation
   * opens with ({@link Caw.setup}) and `project_setup`, the person's ask in
   * any conversation. The fleet's choices,
   * its upstream answer and the relay card are asked while unanswered, and
   * again when the person asked to change them (`change`); the place card
   * while the project has no checkout, or when they asked to move it.
   */
  const setupText = (
    project: ReturnType<typeof projectOf>,
    from: SetupAsk["from"],
    template: StagesTemplate | null,
    {
      change = [],
      opened,
      stages,
    }: {
      change?: readonly SetupPart[];
      opened?: string;
      stages?: string;
    } = {}
  ): string =>
    setupEvent({
      askFleet: !fleetChoicesSet() || change.includes("fleet"),
      askUpstream: !upstreamAnswered() || change.includes("upstream"),
      from,
      ...(opened === undefined ? {} : { opened }),
      placed:
        !change.includes("place") &&
        project.places.some((place) => place.kind === "checkout"),
      relay: relayOffer(change.includes("relay")),
      projectName: project.name,
      ...(stages === undefined ? {} : { stages }),
      template,
    });

  /**
   * The template the project's stages.md is, word for word; null when it is
   * its own. With no stages.md, the code template when the project was made
   * from it (the hub reads it with no file), else null.
   */
  const templateOf = async (
    projectId: string
  ): Promise<StagesTemplate | null> => {
    const content = await stagesFileOf(projectId);
    if (content === undefined) {
      return db.project(projectId)?.template === "code" ? "code" : null;
    }
    return (
      STAGES_TEMPLATES.find((name) => templateText(name) === content) ?? null
    );
  };

  const api = {
    /**
     * The session an attempt nobody asked for reports to (dispatch.ts): the
     * project's conversation, started for that attempt when it has none.
     * Undefined for the hub's attempt while the switch is off.
     */
    conversationFor: async (
      projectId: string,
      by: Origin
    ): Promise<InstanceRow | undefined> => {
      const project = projectOf(projectId);
      const mode = modeFor(project, undefined);
      return (
        await conversationFor(projectId, {
          by,
          first: (session) =>
            `${eventContext(project, session.cwd, "delegate-report", `${by === "you" ? "the person" : "the hub"} started an attempt at one of its tasks`)}\n\nIts report comes to you when it ends.`,
          ...(mode ? { mode } : {}),
        })
      )?.row;
    },
    tell,
    tellQuietly,
    tellYours,
    /** The mode the hub starts a project's conversation in where the project names none (`supervisor_config.caw_mode`). */
    fleetMode: (): OfferedMode | null => db.cawMode(),
    /** Sets {@link fleetMode}; answers it as stored. */
    setFleetMode: (mode: OfferedMode | null): OfferedMode | null => {
      db.setCawMode(mode);
      return db.cawMode();
    },
    view,

    /**
     * §5.5: "Caw offers the relay when you connect a push-only service". The
     * project now has `connection` signed in, whose service pushes its
     * events and is never polled, and no relay for `provider`: one send to
     * the project's conversation (so only while the switch is on), which
     * offers one (the project-connection skill).
     */
    offerRelay(
      projectId: string,
      connection: Pick<ConnectionView, "account" | "name" | "service">,
      provider: RelayProvider
    ): void {
      tellQuietly(projectId, {
        by: "event",
        kind: "connection",
        trigger: `the person signed in the connection “${connection.name}” (${connection.service}, ${connection.account})`,
        text: `${connection.service} pushes its events instead of being polled, so none reach the project until it has a relay. Offer one for the provider "${provider}".`,
      });
    },

    /**
     * A note of the hub's to the person about the project (a repository
     * made, an offer to answer, a routine made): kept with the project and
     * drawn as a line in its conversation's transcript, waking nobody, on
     * or off. A project with no conversation yet keeps it for the one that
     * starts.
     */
    notice(projectId: string, note: ProjectNote): void {
      const project = projectOf(projectId);
      const kept = db.projectNotes.add(
        projectId,
        project.conversationInstanceId,
        note
      );
      if (project.conversationInstanceId) {
        noted(project.conversationInstanceId, kept);
      }
    },

    /**
     * What the project has spent: today and this month in the hub's zone,
     * its conversation's share and each task's attempts.
     */
    spend(projectId: string): ProjectSpend {
      const project = projectOf(projectId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const month = new Date(today);
      month.setDate(1);
      const todayStart = today.getTime();
      const monthStart = month.getTime();
      const spent = db.projectSpend(projectId, { todayStart, monthStart });
      const byTask = new Map<string, ProjectSpend["attempts"][number]>();
      for (const item of spent.items) {
        const held = byTask.get(item.taskId);
        byTask.set(item.taskId, {
          taskId: item.taskId,
          title: item.title,
          type: item.type,
          state: item.state,
          lastAt: item.at,
          attempts: (held?.attempts ?? 0) + 1,
          usd: (held?.usd ?? 0) + item.usd,
        });
      }
      return {
        todayStart,
        monthStart,
        todayUsd: spent.todayUsd,
        monthUsd: spent.monthUsd,
        caw: spent.caw,
        others: spent.others,
        budget: project.budget ?? null,
        cap: caps.capOf(project),
        fleetOnCap: db.spendOnCap(),
        // This month's ledger: what moved this month, and nothing else.
        attempts: [...byTask.values()]
          .filter((attempt) => attempt.usd > 0 || attempt.lastAt >= monthStart)
          .sort((a, b) => b.lastAt - a.lastAt),
      };
    },

    /**
     * Turns the switch on or off, or moves the conversation to another
     * harness or model, or sets the mode the hub starts it in (`mode`, null:
     * the fleet's). Off, with anything it started still running, needs
     * `initiated`: the ids that stop, the rest finish ({@link turnOff});
     * refused without it. A move ends the conversation it had. A harness of its own takes
     * its own default model unless the change names one. Turned on, the
     * inbound events that waited for it go to the conversation.
     */
    configure(
      projectId: string,
      change: {
        harness?: string;
        initiated?: CawInitiated;
        mode?: OfferedMode | null;
        model?: string | null;
        on?: boolean;
      }
    ): ProjectConversationView {
      const project = projectOf(projectId);
      const harness = harnessOf(change.harness);
      const on = change.on ?? project.eventsOn;
      const rehomed = harness !== undefined && harness !== project.cawHarness;
      const model = modelAfter(project.cawModel, change.model, rehomed);
      const moved = rehomed || model !== project.cawModel;
      if (!on && project.eventsOn) {
        turnOff(project, change.initiated);
      }
      if (moved) {
        retire(project);
      }
      const mode = change.mode === undefined ? project.cawMode : change.mode;
      db.setProjectCaw(projectId, {
        eventsOn: on,
        cawModel: model,
        cawMode: mode,
        ...(harness ? { cawHarness: harness } : {}),
      });
      // Every dashboard's switch says where it stands now, not only the one
      // that flipped it.
      if (on !== project.eventsOn || moved || mode !== project.cawMode) {
        projectsChanged();
      }
      if (on && !project.eventsOn) {
        conversationStarted(projectId);
      }
      return view(projectId);
    },

    /**
     * "Ask Caw for a view": your words to the project's conversation, with
     * where you asked from (a page's end: its draft stands on that page as a
     * proposed block; the strip: a draft tab) and how a view is written.
     * Answers the conversation's session.
     */
    async requestView(
      projectId: string,
      raw: string,
      place: ViewPlace | null = null
    ): Promise<{ instanceId: string }> {
      const body = bodyOf(raw);
      const told = await tellYours(projectId, {
        kind: "person-request",
        trigger: "the person asked for a view of the project",
        text: viewRequest(body, place),
      });
      return { instanceId: told.instanceId };
    },

    /**
     * "Ask Caw to change it", on a kept view: your words and the view's
     * program to the project's conversation. Answers its session.
     */
    async askAboutView(
      projectId: string,
      name: string,
      raw: string
    ): Promise<{ instanceId: string }> {
      const body = bodyOf(raw);
      const kept = await views.view(projectId, name).catch(refusedBy);
      const told = await tellYours(projectId, {
        kind: "person-request",
        trigger: `the person asked to change the view “${viewTitle(kept.name)}” (views/${kept.name}.oui)`,
        text: viewChange(kept, body),
      });
      return { instanceId: told.instanceId };
    },

    /**
     * A project made with Caw (New project, an accepted offer): its setup
     * steps to its conversation, with your prompt, or the note of the offer
     * it was made from (kept as the project's first note). Answers the
     * conversation's session; a conversation that cannot start says why on
     * the project's head, and the project stands either way.
     */
    async setup(
      projectId: string,
      ask: {
        /** The note a project without a prompt opens with (an offer's). */
        note?: ProjectNote;
        prompt?: string;
        template: StagesTemplate | null;
      }
    ): Promise<string | undefined> {
      const project = projectOf(projectId);
      const prompt = ask.prompt?.trim();
      if (!prompt) {
        api.notice(
          projectId,
          ask.note ?? {
            title: `Project · ${project.name} made`,
            event: { kind: "project", what: "made", name: project.name },
          }
        );
      }
      const told = await tell(projectId, {
        by: "you",
        kind: "person-request",
        trigger: `the person made the project and asked to set it up${prompt ? "" : " (from a session's offer)"}`,
        text: setupText(project, prompt ? "prompt" : "offer", ask.template, {
          ...(prompt ? { opened: prompt } : {}),
        }),
      });
      if (!told.woke) {
        console.warn(
          `[caw] ${project.name}: its setup did not reach its conversation: ${told.why}`
        );
        return;
      }
      return told.instanceId;
    },

    /**
     * A machine went away: the routine runs its project's conversation had
     * there fail.
     */
    machineGone(machineId: string): void {
      for (const project of db.listProjects()) {
        const current = project.conversationInstanceId
          ? row(project.conversationInstanceId)
          : undefined;
        if (current?.machineId === machineId) {
          turnEnded(
            current.id,
            "The conversation's machine went away before it said how the run went",
            project.id
          );
        }
      }
    },

    /**
     * A task changed: one that entered a stage of kind `you` by anyone but
     * the conversation or you is one send to the conversation (a needs-you
     * item).
     */
    taskChanged(event: TaskEvent): void {
      if (
        event.kind === "changed" ||
        event.actor.mover === "you" ||
        !db.project(event.projectId)?.eventsOn ||
        isProjectConversation(
          { id: event.actor.instanceId ?? "", projectId: event.projectId },
          db.project
        )
      ) {
        return;
      }
      const { projectId, id } = event;
      task(projectId, id)
        .then((waiting) => {
          if (waiting.kind === "you") {
            tellQuietly(projectId, {
              by: "event",
              kind: "task-move",
              trigger: `${taskLink(projectId, waiting.id, waiting.title)} moved to ${waiting.stage}, a stage that waits for the person`,
              text: `It moved there by ${event.actor.mover === "session" ? event.actor.author.name : `the ${event.actor.mover}`}${"reason" in event && event.reason ? `: ${event.reason}` : ""}.`,
            });
          }
        })
        .catch(() => undefined);
    },

    /**
     * A session's idle pulse: the routine runs whose wake the turn that just
     * ended read end with it (routines.ts), and a project's conversation's
     * turn end asks its starters again.
     */
    pulse(instanceId: string, busy: boolean): void {
      if (busy) {
        return;
      }
      turnEnded(instanceId);
      const current = row(instanceId);
      if (current && isProjectConversation(current, db.project)) {
        answered(current.projectId ?? "");
      }
    },

    /** A session's process ended: the routine runs it had end with it. */
    sessionEnded(instanceId: string): void {
      const current = row(instanceId);
      const project = current?.projectId
        ? db.project(current.projectId)
        : undefined;
      turnEnded(
        instanceId,
        "The conversation's session ended before it said how the run went",
        project?.conversationInstanceId === instanceId ? project.id : undefined
      );
    },

    /**
     * The project's views, folder and Setup's steps, for the session `actor`
     * and its call `toolUseId` (where a proposal it parks is drawn): any
     * session's its scope lists them to (roles.ts `allows`).
     */
    tools(actor: InstanceRow | undefined, toolUseId?: string) {
      /** The calling session's project, whose views, folder and Setup these are. */
      const ours = (): string => {
        const projectId = actor?.projectId;
        if (!(projectId && db.project(projectId))) {
          throw new Error(
            "This session belongs to no project, so it has no project folder, views or Setup."
          );
        }
        return projectId;
      };
      /** The session calling: discovery, with no session, executes nothing. */
      const me = (): InstanceRow => {
        if (!actor) {
          throw new Error("Discovery cannot execute tools");
        }
        return actor;
      };
      return [
        tool(
          "folder_read",
          "Read a file, or list a folder (no path: the root), of your project's folder on the hub.",
          { path: z.string().optional() },
          async ({ path }) => {
            const projectId = ours();
            return await folderCall(() =>
              readFolderFile(projectId, path ?? "").catch((error: unknown) => {
                // No path, or a folder: its listing.
                if (
                  error instanceof FolderRefusal &&
                  (error.status === 400 || error.status === 409)
                ) {
                  return listFolder(projectId, path ?? "");
                }
                throw error;
              })
            );
          },
          folderReadWords
        ),
        tool(
          "folder_write",
          "Commit a file to your project's hub folder; bytes as base64. stages.md must parse; a delegates/ type waits for the person's approval.",
          {
            path: z.string().min(1),
            content: z.string().max(FOLDER_CONTENT_LIMIT),
            encoding: z.enum(FOLDER_ENCODINGS).optional(),
          },
          async ({ path, content, encoding }) => {
            const projectId = ours();
            const rel = await folderCall(() => folderPath(path));
            const theirs = personsTier(rel);
            if (theirs) {
              throw new Error(`${rel} was not written: ${theirs}`);
            }
            const body = await folderCall(() =>
              folderContent(content, encoding)
            );
            if (rel.startsWith(DELEGATES_DIR)) {
              if (typeof body !== "string") {
                throw new Error(
                  `${rel} was not proposed: a delegate type is text, not bytes.`
                );
              }
              return await proposeType(me(), rel, body, toolUseId);
            }
            if (rel === STAGES_FILE) {
              stagesRead(body);
            }
            const written = await folderCall(() =>
              writeFolderFile(projectId, rel, body, {
                author: { name: boardTitle(me()) },
              })
            );
            folderChanged(projectId);
            return { ok: true, path: rel, sha: written.sha };
          },
          folderWrittenWords
        ),
        tool(
          "view_draft",
          "Draft a view for the person to keep or discard, as they asked. Components outside CawCo's library are dropped and named in the answer.",
          {
            name: z.string().describe("Like weekly-review."),
            source: z.string().min(1).describe("openui-lang, no fences."),
            page: z
              .enum(BLOCK_PAGES)
              .optional()
              .describe("Stands there as a block; else a tab."),
            position: z.number().int().min(0).optional(),
          },
          async (input) => {
            const projectId = ours();
            const by = boardTitle(me());
            const drafted = await draftView(projectId, by, input);
            api.notice(projectId, {
              title: `View · ${by} drafted “${drafted.view}”`,
              event: { kind: "view", name: drafted.view },
            });
            return drafted;
          },
          viewDraftedWords
        ),
        tool(
          "view_query",
          "What a view's Query(tool, args) reads, for your project.",
          {
            tool: z.enum(VIEW_TOOLS),
            args: z.record(z.string(), z.unknown()).optional(),
          },
          async ({ tool: name, args }) => {
            const projectId = ours();
            return await folderCall(() =>
              views.query(projectId, name, args ?? {})
            );
          },
          viewQueryWords
        ),
        tool(
          "project_setup",
          "Setup's steps, to follow whenever the person asks you to set the project up: the first time, again, or one part.",
          {
            change: z
              .array(z.enum(SETUP_PARTS))
              .optional()
              .describe("Answered parts to ask again."),
          },
          async ({ change }) => {
            const projectId = ours();
            const stages = await folderCall(() => stagesFileOf(projectId));
            const template = await folderCall(() => templateOf(projectId));
            return setupText(projectOf(projectId), "ask", template, {
              ...(change ? { change } : {}),
              ...(stages === undefined ? {} : { stages }),
            });
          },
          sentence
        ),
      ];
    },
  };
  return api;
};

export type Caw = ReturnType<typeof createCaw>;

const answer = refusalAnswer(CawRefusal, (error) =>
  status(502, error instanceof Error ? error.message : String(error))
);

const HARNESS = t.Union(HARNESSES.map((harness) => t.Literal(harness)));
const BLOCK_PAGE = t.Union(BLOCK_PAGES.map((page) => t.Literal(page)));

/** The routes for a project's conversation and your asks for views. */
export const cawRoutes = (caw: Caw) =>
  new Elysia()
    .get("/api/projects/:id/caw", ({ params }) => {
      try {
        return caw.view(params.id);
      } catch (error) {
        return answer(error);
      }
    })
    .patch(
      "/api/projects/:id/caw",
      {
        body: t.Object({
          on: t.Optional(t.Boolean()),
          // Turning the switch off with what it started still running: the
          // ones that stop now; the rest finish.
          initiated: t.Optional(t.Object({ stop: t.Array(t.String()) })),
          harness: t.Optional(HARNESS),
          model: t.Optional(t.Nullable(t.String())),
          // The mode the hub starts its conversation in; null: the fleet's.
          mode: t.Optional(t.Nullable(MODE)),
        }),
      },
      ({ params, body }) => {
        try {
          return caw.configure(params.id, body);
        } catch (error) {
          return answer(error);
        }
      }
    )
    // The mode the hub starts every project's conversation in where the
    // project names none; null: the one the person last chose for its
    // harness on that machine.
    .get("/api/fleet/caw-mode", () => ({ mode: caw.fleetMode() }))
    .put(
      "/api/fleet/caw-mode",
      { body: t.Object({ mode: t.Nullable(MODE) }) },
      ({ body }) => ({ mode: caw.setFleetMode(body.mode) })
    )
    .get("/api/projects/:id/spend", ({ params }) => {
      try {
        return caw.spend(params.id);
      } catch (error) {
        return answer(error);
      }
    })
    // "Ask Caw for a view": from the strip a draft tab; from a page's end
    // (`page`, and a `position` in its order) a proposed block on that page.
    .post(
      "/api/projects/:id/view-requests",
      {
        body: t.Object({
          text: t.String(),
          page: t.Optional(BLOCK_PAGE),
          position: t.Optional(t.Integer({ minimum: 0 })),
        }),
      },
      async ({ params, body, request, server }) => {
        server?.timeout(request, 0);
        try {
          return await caw.requestView(
            params.id,
            body.text,
            body.page
              ? { page: body.page, position: body.position ?? null }
              : null
          );
        } catch (error) {
          return answer(error);
        }
      }
    )
    // "Ask Caw to change it", on a kept view's tab or block.
    .post(
      "/api/projects/:id/views/:name/asks",
      {
        params: t.Object({ id: t.String(), name: t.String() }),
        body: t.Object({ text: t.String() }),
      },
      async ({ params, body, request, server }) => {
        server?.timeout(request, 0);
        try {
          return await caw.askAboutView(params.id, params.name, body.text);
        } catch (error) {
          return answer(error);
        }
      }
    );
