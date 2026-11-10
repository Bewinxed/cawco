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
 *   session through the one send path ({@link Caw.tell}), with its context
 *   line ({@link eventContext}: the project and folder, the trigger, the
 *   skill for its kind). What the person typed is the whole of their
 *   message: their words' context rides in the send's reminder after them,
 *   and their acts are CawCo's notices ({@link ProjectEvent}). A report
 *   reaches it as any delegate's reaches its parent. Nothing is noted
 *   anywhere else: the person reads the conversation.
 * - **Notes**: what the hub says to the person about the project (a
 *   repository made, an offer to answer, a routine made) is a line in the
 *   conversation's transcript, waking nobody ({@link Caw.notice}).
 * - **Views**: a session drafts a view with `view_draft` (views.ts), an
 *   OpenUI Lang program written to the prompt generated from CawCo's library
 *   (openui.ts `VIEW_PROMPT`, which `view_guide` answers; the project-view
 *   skill says how); you keep or discard it. Asked for from a page's end, the draft stands on that page as
 *   a proposed block (blocks.ts).
 * - Each project shows its conversation's spend: what every session of
 *   origin `project` has cost, from the usage buckets budgets already read.
 */

import { createHash } from "node:crypto";
import { accountNameAmong, CLAUDE_PROVIDER } from "@cawco/core/accounts";
import {
  BLOCK_PAGE_TITLES,
  BLOCK_PAGES,
  type BlockPage,
  viewTitle,
} from "@cawco/core/blocks";
import { sayNestedBoundaryFix } from "@cawco/core/boundary-nesting";
import type { ConnectionView } from "@cawco/core/connections";
import {
  BOARD_ONLY_DENIED_TOOLS,
  CURATOR_DENIED_TOOLS,
} from "@cawco/core/delegate-types";
import {
  ACT_ORIGIN,
  type ARTIFACT_ORIGIN,
  HARNESSES,
  type HarnessKind,
  harnessNamed,
  type OfferedMode,
  type PLAN_ORIGIN,
} from "@cawco/core/harness/kinds";
import {
  CAW_NO_MACHINE,
  type CawInitiated,
  type CawRunning,
  type CawStart,
  type ProjectConversationView,
  type ProjectNote,
  type ProjectSpend,
} from "@cawco/core/project-conversation";
import type {
  Envelope,
  InstanceRow,
  SendPayload,
  SpawnPayload,
} from "@cawco/core/protocol";
import { projectLink, taskLink } from "@cawco/core/references";
import type { RelayProvider } from "@cawco/core/relays";
import type { NeutralOrigin } from "@cawco/core/session-messages";
import { unhandled } from "@cawco/core/unhandled";
import { VIEW_TOOLS } from "@cawco/core/views";
import { areaWords } from "@cawco/core/words/areas";
import { noticeWords } from "@cawco/core/words/notices";
import { projectWords } from "@cawco/core/words/project";
import { conversationWords } from "@cawco/core/words/project-conversation";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { PLACE_SUFFIX } from "@cawco/core/workspace-policy";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import { z } from "zod";
import type { Blocks } from "./blocks";
import { topsAtCaw } from "./caw-own";
import type { LeadHomeProblem } from "./caw-problems";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import type { Origin } from "./db/schema";
import { boardTitle } from "./labels";
import { type McpTool, sentence, tool } from "./mcp-tool";
import {
  AGENTS_FILE,
  type Memory,
  personsTier,
  ROUTINE_ORIGIN,
} from "./memory";
import { VIEW_PROMPT } from "./openui";
import {
  folderReadWords,
  folderWrittenWords,
  viewDraftedWords,
  viewQueryWords,
} from "./presenters/project";
import type { Caps } from "./project-caps";
import { typeFileProblem } from "./project-delegate-types";
import {
  FOLDER_CONTENT_LIMIT,
  FOLDER_ENCODINGS,
  folderContent,
  folderPath,
  listFolder,
  readFolderFile,
  writeFolderFile,
} from "./project-folder";
import type { AnyProblem } from "./refusal";
import type { CawToolName } from "./roles";
import {
  SETUP_CARDS,
  SETUP_PARTS,
  type SetupFacts,
  type SetupPart,
  setupFactsWords,
  shippedTemplates,
} from "./setup";
import { readStages } from "./stages";
import { MODE, stagesFileOf, type TaskEvent, type TaskView } from "./tasks";
import type { Views } from "./views";
import type { WorkPlace } from "./work-place";

/**
 * Where a view asked for from a page's end stands once drafted: that page,
 * at `position` in its order (null: its end).
 */
export interface ViewPlace {
  page: BlockPage;
  position: number | null;
}

/** The harness a change names, refused when CawCo runs none of that name; undefined when it names none. */
const harnessOf = (asked: string | undefined) =>
  asked === undefined
    ? undefined
    : (harnessNamed(asked) ??
      problem(400, {
        code: "caw-harness-unknown",
        detail: `CawCo runs no harness called ${asked}.`,
      }));

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
 * A clean session's spawn (core `SpawnPayload.clean`), on every launch of
 * its row: said clean, so its machine starts its harness without the
 * instruction context; fenced, so it takes CawCo's MCP server and no other
 * (no fleet server, no placed hook, no fleet settings, no MCP config of the
 * person's); and with no skills, its delegate type's among them.
 */
export const cleanSpawn = ({
  skills: _skills,
  ...payload
}: SpawnPayload): SpawnPayload => ({ ...payload, clean: true, fence: true });

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
  "routine-report": "project-routine-report",
  "delegate-report": "project-delegate-report",
  "attempt-judgement": "project-attempt-judgement",
  "task-move": "project-task-move",
  "github-event": "project-github-event",
  "inbound-event": "project-inbound-event",
  "person-request": "project-person-request",
  "task-input": "project-task-input",
  "fleet-watch": "project-fleet-watch",
  connection: "project-connection",
  decision: "project-decision",
  "project-setup": "project-setup",
  "view-request": "project-view",
} as const;

/** What kind of event a send to the project's conversation is ({@link EVENT_SKILLS}). */
export type EventKind = keyof typeof EVENT_SKILLS;

/** What every event says of itself: its kind, and what triggered it in words with its link. */
interface EventBase {
  /** What rode with it (pictures, files). */
  carried?: Carried;
  kind: EventKind;
  /** What triggered it, a phrase with its link: "the routine [Nightly](…), its 09:00 run". */
  trigger: string;
}

/**
 * The person's words from another place (their phone, a page's ask): the
 * message is `words` and nothing else, drawn as theirs. Its context
 * ({@link eventContext}) and `note`, CawCo's word on what the agent needs
 * beside them, ride in the send's reminder after the words (core
 * `NeutralUserMessage.reminder`). It reaches the conversation on or off.
 */
export interface YourWords extends EventBase {
  by: "you";
  /** CawCo's word to the agent beside the words: facts, never a procedure (that is the kind's skill). */
  note?: string;
  words: string;
}

/**
 * One of the person's acts that carries none of their words (a project made
 * from an offer set up, marks on an artifact whose session ended, a plan's
 * change, a decision page's Make tasks), told in CawCo's words on the
 * `system` origin `origin` names, which wakes as their words do (core
 * `byPerson`): drawn as CawCo's notice, its line `origin.line` or its kind's.
 * Its context rides in the send's reminder, so a notice the transcript reads
 * by its opening tag (an artifact's) still opens the message. It reaches
 * the conversation on or off.
 */
export interface YourAct extends EventBase {
  by: "act";
  origin: { line?: string; name: PersonsActOrigin };
  text: string;
}

/** The `system` origins of the person's acts (core `byPerson`). */
export type PersonsActOrigin =
  typeof ACT_ORIGIN | typeof ARTIFACT_ORIGIN | typeof PLAN_ORIGIN;

/**
 * Anything else the conversation hears (a routine's run, an inbound event,
 * a task moving, a report), CawCo's word opening with its context, only
 * while the switch is on. A routine's run and an event route name
 * themselves, for the turn the run is and the mode a start takes
 * ({@link modeFor}).
 */
export interface HubEvent extends EventBase {
  by: "event";
  /** The event route that delivered it, when one did. */
  route?: string;
  /** The routine whose run it is. */
  routine?: string;
  text: string;
}

/**
 * One event the project's conversation hears, as one send to its session
 * ({@link Caw.tell}). Who wrote it and how it routes are apart: the
 * person's words ({@link YourWords}) and acts ({@link YourAct}) reach it on
 * or off and wake it stopped; an event ({@link HubEvent}) only while the
 * switch is on. Only {@link YourWords} is drawn as the person's.
 */
export type ProjectEvent = YourWords | YourAct | HubEvent;

/**
 * The person's words or act sent straight to one session (not through its
 * project's conversation): their words, the whole of the message, with
 * CawCo's `note` to the agent beside them in its reminder; or their act,
 * CawCo's notice of it on the `act` origin (core `ACT_ORIGIN`) with the
 * `line` the person reads of it.
 */
export type PersonsSend =
  | { by: "you"; note?: string; words: string }
  | { by: "act"; line: string; text: string };

/** How an event routes: the person's (on or off, waking it stopped) or the hub's (only while on). */
const routeOf = (event: Pick<ProjectEvent, "by">): Origin =>
  event.by === "event" ? "event" : "you";

/**
 * The two lines every event's send carries: where the conversation runs
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

/**
 * One send as it goes to the conversation's session: its content (the
 * person's words alone, or CawCo's text), the origin it is drawn by, the
 * reminder that rides after it, a routine's run, and what it carries.
 */
interface Said {
  carried?: Carried;
  content: string;
  origin: NeutralOrigin;
  reminder?: string;
}

/** `event` as it is said to a session in `folder` of `project` ({@link Said}). */
const saidOf = (
  project: { id: string; name: string },
  folder: string,
  event: ProjectEvent
): Said => {
  const context = eventContext(project, folder, event.kind, event.trigger);
  const carried = event.carried ? { carried: event.carried } : {};
  switch (event.by) {
    case "you":
      return {
        ...carried,
        content: event.words,
        origin: { kind: "human" },
        reminder: event.note ? `${context}\n\n${event.note}` : context,
      };
    case "act":
      return {
        ...carried,
        content: event.text,
        origin: { kind: "system", ...event.origin },
        reminder: context,
      };
    case "event":
      return {
        ...carried,
        content: `${context}\n\n${event.text}`,
        origin: {
          kind: "system",
          name: event.routine
            ? `${ROUTINE_ORIGIN}${event.routine}`
            : PROJECT_ORIGIN,
        },
      };
    default:
      return unhandled("project event", event);
  }
};

const STAGES_FILE = "stages.md";
/** A project's delegate types: a write there is a proposal the person approves (memory.ts `proposeType`). */
const DELEGATES_DIR = "delegates/";

/** stages.md as Caw writes it, refused with what does not read; undefined when it reads. */
const stagesRead = (body: string | Uint8Array) => {
  const reading = readStages(
    typeof body === "string" ? body : new TextDecoder().decode(body)
  );
  return reading.ok
    ? undefined
    : problem(422, {
        code: "caw-stages-unfit",
        detail: `stages.md was not written: ${reading.problems.join(" ")}`,
      });
};

/**
 * Why `rel` is not a session's to write with `folder_write` (memory.ts
 * `personsTier`), or nothing; AGENTS.md is its writer's while the setup page
 * it wrote from is `approved` by the person's Send.
 */
const notWriters = (rel: string, approved: boolean): string | undefined =>
  approved && rel === AGENTS_FILE ? undefined : personsTier(rel);

/**
 * A `delegates/` write's text, refused when it is bytes; with the setup
 * page's Send as its approval (`approved`), refused too when it makes no
 * whole type, as an approved proposal is (memory.ts `proposeType`).
 */
const typeText = (
  rel: string,
  body: string | Uint8Array,
  approved: boolean
) => {
  if (typeof body !== "string") {
    return problem(422, {
      code: "caw-delegate-type-bytes",
      detail: `${rel} was not ${approved ? "written" : "proposed"}: a delegate type is text, not bytes.`,
    });
  }
  const misfit = approved ? typeFileProblem(rel, body) : undefined;
  if (misfit) {
    return problem(422, {
      code: "caw-delegate-type-unfit",
      detail: `${rel} was not written: ${misfit}`,
    });
  }
  return body;
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

/** Why a send went nowhere when its record names no reason. */
const NOT_TAKEN = "Its session didn't take the message.";

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
    | "accounts"
    | "areas"
    | "cawMode"
    | "cawSpentSince"
    | "chosenMode"
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
  /**
   * Ends a session and deletes it, as a session nothing was said in is
   * deleted (server.ts `DELETE /api/instances/:id`): a start of the
   * conversation whose words did not go leaves nothing standing.
   */
  readonly discard: (instanceId: string) => void;
  /** Ends a session (the conversation, when its harness or model moves). */
  readonly end: (instanceId: string) => void;
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
  ) => Promise<
    { machineId: string; cwd: string } | LeadHomeProblem | undefined
  >;
  /** The machines online now, and the name CawCo shows a machine by. */
  readonly machines: {
    name: (machineId: string) => string;
    online: () => string[];
  };
  /** A project note placed in a conversation's transcript as it is written (session-notes.ts `noteProject`). */
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
  readonly proposeType: Memory["proposeType"];
  /**
   * Renames the project as the dashboard's rename does (project-edit.ts),
   * every client reading it again; answers the name as kept, or its
   * refusal.
   */
  readonly rename: (
    projectId: string,
    name: string
  ) => Promise<string | AnyProblem>;
  /** Delivers one message to a session through the hub's one send path: its record, `pending` when the hub took it, else why not. */
  readonly send: (envelope: Envelope<SendPayload>) => {
    reason: string | null;
    state: string;
  };
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
  /** A task as its project's files have it, or the problem of its read. */
  readonly task: (
    projectId: string,
    id: string
  ) => Promise<Pick<TaskView, "id" | "kind" | "stage" | "title"> | AnyProblem>;
  /**
   * A session's turn ended (routines.ts `turnEnded`): the conversation runs
   * whose wake it read and that it gave no result fail, `why` when it is
   * not the plain end of a turn. `gone`, the project whose conversation it
   * was, when the session itself is over.
   */
  readonly turnEnded: (instanceId: string, why?: string, gone?: string) => void;
  /**
   * Writes drafted views, answers the view tools, and reads a kept view to
   * change (views.ts).
   */
  readonly views: Pick<Views, "draft" | "kept" | "query" | "view">;
  /** Where the project's work runs now (work-place.ts `workPlace`). */
  readonly workPlace: (project: ProjectRow) => WorkPlace;
}

export const createCaw = ({
  answered,
  blocks,
  caps,
  conversationStarted,
  db,
  discard,
  end,
  folderChanged,
  leadHome,
  machines,
  noted,
  online,
  projectsChanged,
  proposeType,
  rename,
  send,
  spawn,
  stops,
  task,
  turnEnded,
  views,
  workPlace,
}: CawDeps) => {
  /** Conversations being started now, by project: one start per project at a time. */
  const starting = new Map<string, ReturnType<typeof startConversation>>();
  /** The session each start in {@link starting} is making, by project, once its id is minted. */
  const startingIds = new Map<string, string>();

  const projectOf = (projectId: string) =>
    db.project(projectId) ??
    problem(404, {
      code: "caw-project-unknown",
      detail: `The hub keeps no project ${projectId}.`,
    });

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
  const standing = (project: ProjectRow): InstanceRow | undefined => {
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

  /**
   * The checkout the project's work runs in (work-place.ts `workPlace`),
   * when its place is one.
   */
  const checkoutFor = (
    project: ProjectRow
  ): { cwd: string; machineId: string } | undefined => {
    const place = workPlace(project);
    return place.kind === "checkout" ? place : undefined;
  };

  /**
   * Where the conversation starts: the checkout the project's work runs in;
   * before the project has one online, its folder on the hub or a folder of
   * its own ({@link CawDeps.leadHome}). The conversation cuts no workspace,
   * so a project whose checkouts are all away still has one.
   */
  const placeFor = async (project: ProjectRow) => {
    const checkout = checkoutFor(project);
    return checkout
      ? { machineId: checkout.machineId, cwd: checkout.cwd }
      : await leadHome(project.id);
  };

  /** Why the conversation could not start for the project now, on or off, or null. */
  const problemOf = (project: ProjectRow): string | null => {
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
  const startProblems = new Map<string, string>();

  /**
   * The permission mode a start of the project's conversation takes for
   * `event`, the most specific set one: the event route's that delivered
   * it, its routine's, the project's in effect (its own, its area's, the
   * fleet's: db `inEffect`). Undefined: none is set,
   * and the start takes the mode the person last chose for its harness on
   * that machine (launches.ts `settleMode`).
   */
  const modeFor = (
    project: ProjectRow,
    event: Pick<HubEvent, "route" | "routine"> | undefined
  ): OfferedMode | undefined =>
    (event?.route ? db.ingress.route(event.route)?.mode : undefined) ??
    (event?.routine ? db.routines.get(event.routine)?.mode : undefined) ??
    project.inEffect.cawMode.value ??
    undefined;

  /**
   * How a start of the project's conversation goes, the one rule for the
   * hub's starts and the person's (his panel's first words,
   * project/conversation.ts on the dashboard; {@link CawStart}): where
   * ({@link placeFor}), on the project's harness and model, in `mode` (the
   * start's own, {@link modeFor}), else the one the person last chose for
   * that harness on that machine. Refused, in the words the project's head
   * says it, while no machine is online.
   */
  const startOf = async (
    project: ProjectRow,
    mode: OfferedMode | undefined
  ) => {
    const place = await placeFor(project);
    if (place instanceof ElysiaStatus) {
      return place;
    }
    if (!place) {
      return problem(409, { code: "caw-no-machine", detail: CAW_NO_MACHINE });
    }
    const harness = project.cawHarness;
    const start: CawStart = {
      machineId: place.machineId,
      cwd: place.cwd,
      harness,
      model: project.cawModel ?? null,
      permissionMode: mode ?? db.chosenMode(place.machineId, harness) ?? null,
    };
    return start;
  };

  /**
   * One message to the conversation's session ({@link Said}). One that
   * carries your words is yours (`human`), as a session's composer sends
   * it: it wakes the session stopped, and at its account's limit it is moved
   * or continued as any person's turn is; so does your act on its `system`
   * origin (core `byPerson`). Any other is CawCo's word (`system`, named
   * `project`): a routine's says so in its origin (`routine:<id>`), the turn
   * it starts that run's (memory.ts). Answers the send's uuid when the hub
   * took it, else why it did not, in the hub's words.
   */
  const message = (
    target: InstanceRow,
    said: Said
  ): { uuid: string } | { why: string } => {
    const uuid = crypto.randomUUID();
    const record = send({
      verb: "send",
      machineId: target.machineId,
      instanceId: target.id,
      payload: {
        ...said.carried,
        instanceId: target.id,
        message: {
          type: "user",
          uuid,
          message: { role: "user", content: said.content },
          parent_tool_use_id: null,
          origin: said.origin,
          ...(said.reminder ? { reminder: said.reminder } : {}),
        },
      },
    });
    return record.state === "pending"
      ? { uuid }
      : { why: record.reason ?? NOT_TAKEN };
  };

  /** What starts the conversation: how it routes, its first send once its row is there, and how. */
  interface Start {
    by: Origin;
    first: (session: InstanceRow) => Said;
    mode?: OfferedMode;
    /** Skills in its context before its first send (the spawn's `skills`). */
    skills?: readonly string[];
  }

  /**
   * Starts the project's conversation, a plain spawn in the project, sends
   * it the words that started it, and makes it the one the project's events
   * reach: a session is only ever started by something to say. Named only
   * once its words are taken, in the same step, so nothing between sees it
   * unnamed. A start whose words do not go is undone: its session is
   * deleted, the project's conversation stays as it was, and why stands as
   * the project's `problem` ({@link view}) until a start goes.
   */
  const startConversation = async (project: ProjectRow, start: Start) => {
    const how = await startOf(project, start.mode);
    if (how instanceof ElysiaStatus) {
      return how;
    }
    const instanceId = crypto.randomUUID();
    startingIds.set(project.id, instanceId);
    try {
      await spawn(how.machineId, {
        instanceId,
        cwd: how.cwd,
        harness: how.harness,
        ...(how.model ? { model: how.model } : {}),
        ...(how.permissionMode ? { permissionMode: how.permissionMode } : {}),
        ...(start.skills?.length ? { skills: [...start.skills] } : {}),
        projectId: project.id,
        title: "Caw",
        requestId: crypto.randomUUID(),
      });
    } catch (error) {
      const why = errorWords(error);
      startProblems.set(project.id, why);
      projectsChanged();
      return problem(502, { code: "caw-failed", detail: why });
    }
    const conversation = row(instanceId);
    const sent = conversation
      ? firstSend(conversation, start)
      : { why: `Its session ${instanceId} has no row on this hub.` };
    if (!conversation || "why" in sent) {
      discard(instanceId);
      const why = conversationWords.firstSendRefused(
        "why" in sent ? sent.why : NOT_TAKEN
      );
      startProblems.set(project.id, why);
      projectsChanged();
      console.warn(
        `[caw] ${project.name}: its conversation's start was undone (${instanceId}): ${why}`
      );
      return problem(409, { code: "caw-start-undone", detail: why });
    }
    startProblems.delete(project.id);
    setConversation(project.id, instanceId);
    console.log(
      `[caw] ${project.name}: started its conversation on ${project.cawHarness} (${instanceId})`
    );
    if (project.eventsOn) {
      conversationStarted(project.id);
    }
    return { conversation, sent: sent.uuid };
  };

  /** The words that start the conversation, sent: an error thrown on the way is why they did not go. */
  const firstSend = (
    conversation: InstanceRow,
    start: Start
  ): { uuid: string } | { why: string } => {
    try {
      return message(conversation, start.first(conversation));
    } catch (error) {
      return { why: errorWords(error) };
    }
  };

  /**
   * The project's conversation: the one it has, or one started now with
   * `start`'s words (its first message): for your words on or off, for an
   * event while the switch is on. Undefined for an event while it is off.
   * Callers at once share one start; `started` says whether this call's
   * words went out with it, as the send `sent`.
   */
  const conversationFor = async (projectId: string, start: Start) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    if (start.by === "event" && !project.eventsOn) {
      return;
    }
    const current = standing(project);
    if (current) {
      return { row: current, started: false };
    }
    const pending = starting.get(projectId);
    if (pending !== undefined) {
      // A start that fails is the starter's to answer; those sharing it hear it too.
      const shared = await pending;
      return shared instanceof ElysiaStatus
        ? shared
        : { row: shared.conversation, started: false };
    }
    const begun = startConversation(project, start).finally(() => {
      starting.delete(projectId);
      startingIds.delete(projectId);
    });
    starting.set(projectId, begun);
    const made = await begun;
    return made instanceof ElysiaStatus
      ? made
      : { row: made.conversation, sent: made.sent, started: true };
  };

  /** Why `event` goes nowhere now: events are off, or the project is past its cap; undefined when it goes. */
  const heldBack = (project: ProjectRow, event: ProjectEvent) => {
    if (routeOf(event) === "event" && !project.eventsOn) {
      return problem(409, { code: "caw-off", detail: CAW_OFF });
    }
    const capped = caps.quiets(project.id);
    return capped === undefined
      ? undefined
      : problem(409, { code: "caw-spend-capped", detail: capped });
  };

  /**
   * One event, one send to the project's conversation (§5.3): an attempt's
   * judgement, a task moving, a routine's run, an inbound event, the
   * person's words or acts from another place, each said as
   * {@link saidOf} says it, starting the conversation when it has none (in
   * {@link modeFor}'s mode, with `skills` in its context first). The
   * person's words and acts reach it on or off; an event, only while the
   * switch is on. Past the project's spend cap nothing goes. There is no
   * timer behind it. Answers the conversation's session and the send, or
   * why nothing went.
   */
  const tell = async (
    projectId: string,
    event: ProjectEvent,
    skills?: readonly string[]
  ) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const held = heldBack(project, event);
    if (held) {
      return held;
    }
    const said = (session: InstanceRow) => saidOf(project, session.cwd, event);
    const mode = modeFor(project, event.by === "event" ? event : undefined);
    const conversation = await conversationFor(projectId, {
      by: routeOf(event),
      first: said,
      ...(skills ? { skills } : {}),
      ...(mode ? { mode } : {}),
    });
    if (conversation instanceof ElysiaStatus) {
      return conversation;
    }
    if (!conversation) {
      return problem(409, { code: "caw-off", detail: CAW_OFF });
    }
    const sent =
      conversation.started && conversation.sent
        ? { uuid: conversation.sent }
        : message(conversation.row, said(conversation.row));
    return "uuid" in sent
      ? { instanceId: conversation.row.id, send: sent.uuid }
      : problem(409, { code: "caw-send-not-taken", detail: sent.why });
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
        if (told instanceof ElysiaStatus) {
          said(told.response.detail);
        }
      },
      (error: unknown) => said(errorWords(error))
    );
  };

  /**
   * {@link tell} for the person's words or acts from a page (a view's ask, a
   * decided page): what held them back is the page's answer.
   */
  const tellYours = (projectId: string, event: YourWords | YourAct) =>
    tell(projectId, event);

  /** Ends the project's conversation and clears it: its harness or model moved. */
  const retire = (project: ProjectRow): void => {
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
  const initiated = (project: ProjectRow): CawRunning[] => {
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
    project: ProjectRow,
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
  const turnOff = (project: ProjectRow, choice: CawInitiated | undefined) => {
    const running = initiated(project);
    if (running.length > 0 && !choice) {
      return problem(409, {
        code: "caw-initiated-unnamed",
        detail: `The project's conversation started ${running.length === 1 ? "1 thing that is" : `${running.length} things that are`} still running. Name which stop (\`initiated: { stop: [...] }\`, none to let them all finish), then turn it off.`,
      });
    }
    const foreign = foreignOf(project, running, choice?.stop ?? []);
    if (foreign.length > 0) {
      return problem(409, {
        code: "caw-initiated-foreign",
        detail: `${foreign.join(", ")} ${foreign.length === 1 ? "wasn't" : "weren't"} started by the project's conversation, so nothing stopped and it is still on.`,
      });
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

  const view = (projectId: string) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const conversation: ProjectConversationView = {
      on: project.eventsOn,
      hearsTasks: project.hearsTasks,
      attemptsHearComments: project.attemptsHearComments,
      harness: project.cawHarness,
      model: project.cawModel,
      mode: project.cawMode,
      instanceId: project.conversationInstanceId,
      problem: problemOf(project) ?? startProblems.get(projectId) ?? null,
      starting: starting.has(projectId),
      startingId: startingIds.get(projectId) ?? null,
      running: initiated(project),
      spendUsd: db.cawSpentSince(projectId, 0),
    };
    return conversation;
  };

  /** Where a view was asked for, as the facts beside the person's words (the project-view skill says what to do with them). */
  const viewPlaceNote = (place: ViewPlace | null): string =>
    place
      ? `They asked from the ${BLOCK_PAGE_TITLES[place.page]} page: page "${place.page}"${place.position === null ? "" : `, position ${place.position}`}.`
      : "They asked from the views strip: no page.";

  /** The views' refusal of project `projectId`; none when it keeps no view `name`, which is refused (a change keeps the view's place, so it is drafted without a page). */
  const keptAlready = async (projectId: string, name: string) => {
    const kept = await views.kept(projectId);
    if (kept instanceof ElysiaStatus) {
      return kept;
    }
    if (kept.includes(name)) {
      return problem(409, {
        code: "caw-view-kept",
        detail: `“${name}” is a kept view already, standing where the person put it: draft its change without a page.`,
      });
    }
  };

  /**
   * Caw's draft written (`view_draft`), as view_draft answers it. For a
   * page, a name that is a kept view's is refused (a change keeps the view's
   * place, so it is drafted without one); with a page, the draft stands
   * there as a proposed block. A refusal of the view's or the block's is
   * answered as it is.
   */
  const draftView = async (
    projectId: string,
    /** The drafting session: told if its draft no longer applies (views.ts). */
    session: string,
    /** Whose draft it is, by the name the board gives the session (labels.ts `boardTitle`). */
    by: string,
    input: {
      name: string;
      page?: BlockPage;
      position?: number;
      source: string;
    }
  ) => {
    const unplaced = input.page
      ? await keptAlready(projectId, input.name)
      : undefined;
    if (unplaced) {
      return unplaced;
    }
    const drafted = await views.draft(
      projectId,
      input.name,
      input.source,
      { name: by },
      session
    );
    if (drafted instanceof ElysiaStatus) {
      return drafted;
    }
    const proposed = input.page
      ? blocks.propose(
          projectId,
          drafted.name,
          input.page,
          input.position ?? null,
          by
        )
      : null;
    if (proposed instanceof ElysiaStatus) {
      return proposed;
    }
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

  const bodyOf = (body: string) =>
    body.trim() ||
    problem(400, {
      code: "caw-message-empty",
      detail: "A message needs words.",
    });

  /**
   * The facts a setup page is built from, for `project_setup` (setup.ts
   * {@link SetupFacts}): the project's name and the template tapped, every
   * shipped template, its stages.md and tasks by stage, its places and the
   * machines online, and the page's card ids with what Send applies.
   */
  const setupFacts = async (
    projectId: string,
    change: readonly SetupPart[]
  ) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const stages = await stagesFileOf(projectId);
    if (stages instanceof ElysiaStatus) {
      return stages;
    }
    const tasks: Record<string, string[]> = {};
    for (const indexed of db.taskIndex(projectId)) {
      tasks[indexed.stage] = [
        ...(tasks[indexed.stage] ?? []),
        `${indexed.id} “${indexed.title}”`,
      ];
    }
    const facts: SetupFacts = {
      name: project.name,
      named: project.name !== projectWords.placeholderName,
      tapped: project.tapped ?? null,
      change,
      templates: shippedTemplates(),
      stages: stages ?? null,
      tasks,
      places: project.places.map((place) =>
        place.kind === "hub"
          ? "its folder on the hub"
          : `${machines.name(place.machineId)} — ${place.path}${place.isPrimary ? " (primary)" : ""}`
      ),
      machines: machines.online(),
      account: project.inEffect.account.value
        ? `${accountLine(project.inEffect.account.value, false)} (${areaWords.source(
            project.inEffect.account.from,
            areaName(project.areaId)
          )})`
        : null,
      accounts: db.accounts.list().map((one) => accountLine(one.id, true)),
      area: areaName(project.areaId),
      areas: db.areas.list().map((one) => `${one.name} (id ${one.id})`),
      cards: SETUP_CARDS,
    };
    return facts;
  };

  /** An area by its name; null for none, or one gone. */
  const areaName = (id: string | null): string | null =>
    (id && db.areas.get(id)?.name) || null;

  /**
   * An account as `project_setup` names it: its name, and with `whole` its
   * id, provider and the machines it is signed in on.
   */
  const accountLine = (id: string, whole: boolean): string => {
    const all = db.accounts.list();
    const account = all.find((one) => one.id === id);
    if (!account) {
      return id;
    }
    const name = accountNameAmong(account, all);
    if (!whole) {
      return name;
    }
    const on = db.accounts
      .signins()
      .filter((one) => one.accountId === id && one.state === "signed-in")
      .map((one) => machines.name(one.machineId));
    const provider =
      account.provider === CLAUDE_PROVIDER ? "Claude" : account.provider;
    return `${name}: id ${account.id}, ${provider}, ${on.length > 0 ? `signed in on ${on.join(", ")}` : "signed in nowhere"}`;
  };

  /**
   * The setup pages sent and not yet written up, by project: from the
   * person's Send of the setup page until its conversation's next turn ends,
   * Caw's own `folder_write` of AGENTS.md and of a delegate type commits it,
   * the Send being the person's approval of both (no proposal follows it).
   */
  const setupsSent = new Map<string, string>();

  /**
   * A `folder_write`'s file, once its session may write it: a delegate
   * type waits for the person's approval unless `approved`, stages.md must
   * read, any other file is committed as the session (`folder_write`).
   */
  const fileWritten = async (
    calling: { actor: InstanceRow; project: ProjectRow },
    rel: string,
    body: string | Uint8Array,
    approved: boolean,
    toolUseId: string | undefined
  ) => {
    if (rel.startsWith(DELEGATES_DIR)) {
      const type = typeText(rel, body, approved);
      if (type instanceof ElysiaStatus) {
        return type;
      }
      if (!approved) {
        return await proposeType(calling.actor, rel, type, toolUseId);
      }
    }
    if (rel === STAGES_FILE) {
      const unfit = stagesRead(body);
      if (unfit) {
        return unfit;
      }
    }
    const projectId = calling.project.id;
    const committed = await writeFolderFile(projectId, rel, body, {
      author: { name: boardTitle(calling.actor) },
    });
    if (committed instanceof ElysiaStatus) {
      return committed;
    }
    folderChanged(projectId);
    return { ok: true, path: rel, sha: committed.sha };
  };

  /**
   * A change to the project's conversation written: its `next` switches, its
   * model and harness (`moved`: the conversation went to another), every
   * dashboard reading the projects again when any of them moved, and the
   * events that waited going to it once it is turned on.
   */
  const configured = (
    project: ProjectRow,
    next: {
      attemptsHearComments: boolean;
      hearsTasks: boolean;
      mode: OfferedMode | null;
      on: boolean;
    },
    moves: {
      harness: HarnessKind | undefined;
      model: string | null;
      moved: boolean;
    }
  ): void => {
    db.setProjectCaw(project.id, {
      eventsOn: next.on,
      cawModel: moves.model,
      cawMode: next.mode,
      hearsTasks: next.hearsTasks,
      attemptsHearComments: next.attemptsHearComments,
      ...(moves.harness ? { cawHarness: moves.harness } : {}),
    });
    // Every dashboard's switch says where it stands now, not only the one
    // that flipped it.
    if (
      moves.moved ||
      next.on !== project.eventsOn ||
      next.mode !== project.cawMode ||
      next.hearsTasks !== project.hearsTasks ||
      next.attemptsHearComments !== project.attemptsHearComments
    ) {
      projectsChanged();
    }
    if (next.on && !project.eventsOn) {
      conversationStarted(project.id);
    }
  };

  /** {@link api.notice} for a project the hub keeps. */
  const noticeIn = (project: ProjectRow, note: ProjectNote): void => {
    const kept = db.projectNotes.add(
      project.id,
      project.conversationInstanceId,
      note
    );
    if (project.conversationInstanceId) {
      noted(project.conversationInstanceId, kept);
    }
  };

  const api = {
    /**
     * The session an attempt nobody asked for reports to (dispatch.ts): the
     * project's conversation, started for that attempt when it has none.
     * Undefined for the hub's attempt while the switch is off.
     */
    conversationFor: async (projectId: string, by: Origin) => {
      const project = projectOf(projectId);
      if (project instanceof ElysiaStatus) {
        return project;
      }
      const mode = modeFor(project, undefined);
      const conversation = await conversationFor(projectId, {
        by,
        first: (session) =>
          saidOf(project, session.cwd, {
            by: "event",
            kind: "delegate-report",
            trigger: `${by === "you" ? "the person" : "the hub"} started an attempt at one of its tasks`,
            text: "Its report comes to you when it ends.",
          }),
        ...(mode ? { mode } : {}),
      });
      return conversation instanceof ElysiaStatus
        ? conversation
        : conversation?.row;
    },
    tell,
    tellQuietly,
    tellYours,
    /**
     * The person sent project `projectId`'s setup page made by `instanceId`:
     * until that session's turn ends, its `folder_write` of AGENTS.md and
     * of a delegate type commits, their Send being the approval.
     */
    setupSent(projectId: string, instanceId: string): void {
      setupsSent.set(projectId, instanceId);
    },
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
    notice(projectId: string, note: ProjectNote) {
      const project = projectOf(projectId);
      if (project instanceof ElysiaStatus) {
        return project;
      }
      noticeIn(project, note);
    },

    /**
     * What the project has spent: today and this month in the hub's zone,
     * its conversation's share and each task's attempts.
     */
    spend(projectId: string) {
      const project = projectOf(projectId);
      if (project instanceof ElysiaStatus) {
        return project;
      }
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
      const ledger: ProjectSpend = {
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
      return ledger;
    },

    /**
     * Turns the switch on or off, or moves the conversation to another
     * harness or model, or sets the mode the hub starts it in (`mode`, null:
     * the fleet's). Off, with anything it started still running, needs
     * `initiated`: the ids that stop, the rest finish ({@link turnOff});
     * refused without it. A move ends the conversation it had. A harness of its own takes
     * its own default model unless the change names one. Turned on, the
     * inbound events that waited for it go to the conversation.
     * `hearsTasks` and `attemptsHearComments` are the switches of the
     * person's writing on tasks: whether the conversation reads it
     * (task-input.ts), and whether a comment reaches the task's attempt
     * (jev-tasks.ts).
     */
    configure(
      projectId: string,
      change: {
        attemptsHearComments?: boolean;
        harness?: string;
        hearsTasks?: boolean;
        initiated?: CawInitiated;
        mode?: OfferedMode | null;
        model?: string | null;
        on?: boolean;
      }
    ) {
      const project = projectOf(projectId);
      if (project instanceof ElysiaStatus) {
        return project;
      }
      const harness = harnessOf(change.harness);
      if (harness instanceof ElysiaStatus) {
        return harness;
      }
      const on = change.on ?? project.eventsOn;
      const rehomed = harness !== undefined && harness !== project.cawHarness;
      const model = modelAfter(project.cawModel, change.model, rehomed);
      const moved = rehomed || model !== project.cawModel;
      if (!on && project.eventsOn) {
        const held = turnOff(project, change.initiated);
        if (held) {
          return held;
        }
      }
      if (moved) {
        retire(project);
      }
      configured(
        project,
        {
          on,
          mode: change.mode === undefined ? project.cawMode : change.mode,
          hearsTasks: change.hearsTasks ?? project.hearsTasks,
          attemptsHearComments:
            change.attemptsHearComments ?? project.attemptsHearComments,
        },
        { model, harness, moved }
      );
      return view(projectId);
    },

    /**
     * How the person's start of the project's conversation goes (his
     * panel's first words, project/conversation.ts on the dashboard): as
     * every start of it does ({@link startOf}), in the project's mode.
     */
    start(projectId: string) {
      const project = projectOf(projectId);
      return project instanceof ElysiaStatus
        ? project
        : startOf(project, modeFor(project, undefined));
    },

    /**
     * Session `instanceId` is the project's conversation now: one his panel
     * started in the project (its first words the person's, project/
     * conversation.ts on the dashboard), so his events, notes and panel are
     * the one the person talks to him in, as a start of the hub's own makes
     * it ({@link startConversation}). The project's conversation is the one
     * its row names, on every surface (isProjectConversation): a session
     * merely in the project is not one. Refused for a session the hub does
     * not list, one of another project, or one discarded.
     */
    name(projectId: string, instanceId: string) {
      const project = projectOf(projectId);
      if (project instanceof ElysiaStatus) {
        return project;
      }
      const session = row(instanceId);
      if (!session || session.projectId !== project.id) {
        return problem(404, {
          code: "caw-session-not-in-project",
          detail: `Session ${instanceId} is not one of this project's.`,
        });
      }
      if (GONE.has(session.status)) {
        return problem(409, {
          code: "caw-session-discarded",
          detail: `Session ${instanceId} was discarded.`,
        });
      }
      if (project.conversationInstanceId !== instanceId) {
        startProblems.delete(project.id);
        setConversation(project.id, instanceId);
        if (project.eventsOn) {
          conversationStarted(project.id);
        }
      }
      return view(projectId);
    },

    /**
     * "Ask Caw for a view": your words to the project's conversation, the
     * whole of the message, with where you asked from beside them (a page's
     * end: its draft stands on that page as a proposed block; the strip: a
     * draft tab), and the project-view skill for how a view is written.
     * Answers the conversation's session.
     */
    async requestView(
      projectId: string,
      raw: string,
      place: ViewPlace | null = null
    ) {
      const words = bodyOf(raw);
      if (words instanceof ElysiaStatus) {
        return words;
      }
      const told = await tellYours(projectId, {
        by: "you",
        kind: "view-request",
        trigger: "the person asked for a view of the project",
        words,
        note: viewPlaceNote(place),
      });
      return told instanceof ElysiaStatus
        ? told
        : { instanceId: told.instanceId };
    },

    /**
     * "Ask Caw to change it", on a kept view: your words to the project's
     * conversation, the whole of the message, naming the view beside them.
     * Answers its session.
     */
    async askAboutView(projectId: string, name: string, raw: string) {
      const words = bodyOf(raw);
      if (words instanceof ElysiaStatus) {
        return words;
      }
      const kept = await views.view(projectId, name);
      if (kept instanceof ElysiaStatus) {
        return kept;
      }
      const told = await tellYours(projectId, {
        by: "you",
        kind: "view-request",
        trigger: `the person asked to change the view “${viewTitle(kept.name)}”`,
        words,
        note: `The view is kept: name "${kept.name}", its program views/${kept.name}.oui.`,
      });
      return told instanceof ElysiaStatus
        ? told
        : { instanceId: told.instanceId };
    },

    /**
     * A project made with Caw (New project, an accepted offer): its
     * conversation starts with the project-setup skill in its context. Made
     * from your words, its first message is your words alone; made from a
     * session's offer, it opens on CawCo's notice of your act (kept as the
     * project's first note too). Answers the conversation's session; a
     * conversation that cannot start says why on the project's head, and the
     * project stands either way.
     */
    async setup(
      projectId: string,
      ask: {
        /** The note a project without a prompt opens with (an offer's). */
        note?: ProjectNote;
        prompt?: string;
      }
    ) {
      const project = projectOf(projectId);
      if (project instanceof ElysiaStatus) {
        return project;
      }
      const prompt = ask.prompt?.trim();
      if (!prompt) {
        noticeIn(
          project,
          ask.note ?? {
            title: `Project · ${project.name} made`,
            event: { kind: "project", what: "made", name: project.name },
          }
        );
      }
      const told = await tell(
        projectId,
        prompt
          ? {
              by: "you",
              kind: "project-setup",
              trigger: "the person made the project with these words",
              words: prompt,
            }
          : {
              by: "act",
              kind: "project-setup",
              trigger: "the person made the project from a session's offer",
              origin: { name: ACT_ORIGIN, line: noticeWords.setupFromOffer },
              text: `The person made the project “${project.name}” from a session's offer. Set it up with them.`,
            },
        [EVENT_SKILLS["project-setup"]]
      );
      if (told instanceof ElysiaStatus) {
        console.warn(
          `[caw] ${project.name}: its setup did not reach its conversation: ${told.response.detail}`
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
          // A task that does not read sends nothing, as a failed read did.
          if ("kind" in waiting && waiting.kind === "you") {
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
      if (
        current?.projectId &&
        setupsSent.get(current.projectId) === instanceId
      ) {
        setupsSent.delete(current.projectId);
      }
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
      /** The calling session and its project, whose views, folder and Setup these are; discovery, with no session, executes nothing. */
      const ours = () => {
        const project = actor?.projectId
          ? db.project(actor.projectId)
          : undefined;
        return actor && project
          ? { actor, project }
          : problem(409, {
              code: "caw-tools-no-project",
              detail:
                "This session belongs to no project, so it has no project folder, views or Setup.",
            });
      };
      return [
        tool(
          "folder_read",
          "Read a file, or list a folder (no path: the root), of your project's folder on the hub.",
          { path: z.string().optional() },
          async ({ path }) => {
            const calling = ours();
            if (calling instanceof ElysiaStatus) {
              return calling;
            }
            const projectId = calling.project.id;
            const file = await readFolderFile(projectId, path ?? "");
            // No path, or a folder: its listing.
            return file instanceof ElysiaStatus &&
              (file.status === 400 || file.status === 409)
              ? await listFolder(projectId, path ?? "")
              : file;
          },
          folderReadWords
        ),
        tool(
          "folder_write",
          "Commit a file to your project's hub folder; bytes as base64. stages.md must parse; a delegates/ type waits for the person's approval unless their setup page's Send gave it.",
          {
            path: z.string().min(1),
            content: z.string().max(FOLDER_CONTENT_LIMIT),
            encoding: z.enum(FOLDER_ENCODINGS).optional(),
          },
          async ({ path, content, encoding }) => {
            const calling = ours();
            if (calling instanceof ElysiaStatus) {
              return calling;
            }
            const projectId = calling.project.id;
            const rel = folderPath(path);
            if (rel instanceof ElysiaStatus) {
              return rel;
            }
            // The setup page sent is the person's approval of AGENTS.md and
            // the delegate types its writer writes from it.
            const approved = setupsSent.get(projectId) === calling.actor.id;
            const theirs = notWriters(rel, approved);
            if (theirs) {
              return problem(403, {
                code: "caw-folder-write-barred",
                detail: `${rel} was not written: ${theirs}`,
              });
            }
            const body = folderContent(content, encoding);
            if (body instanceof ElysiaStatus) {
              return body;
            }
            return await fileWritten(calling, rel, body, approved, toolUseId);
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
            const calling = ours();
            if (calling instanceof ElysiaStatus) {
              return calling;
            }
            const by = boardTitle(calling.actor);
            const drafted = await draftView(
              calling.project.id,
              calling.actor.id,
              by,
              input
            );
            if (drafted instanceof ElysiaStatus) {
              return drafted;
            }
            noticeIn(calling.project, {
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
            const calling = ours();
            return calling instanceof ElysiaStatus
              ? calling
              : await views.query(calling.project.id, name, args ?? {});
          },
          viewQueryWords
        ),
        tool(
          "project_setup",
          "Facts for the project's setup page (project-setup skill).",
          {
            change: z
              .array(z.enum(SETUP_PARTS))
              .optional()
              .describe("Parts to ask again."),
          },
          async ({ change }) => {
            const calling = ours();
            return calling instanceof ElysiaStatus
              ? calling
              : await setupFacts(calling.project.id, change ?? []);
          },
          setupFactsWords
        ),
        tool(
          "project_name",
          "Name your project while it has its placeholder name.",
          { name: z.string().min(1).max(200) },
          async ({ name }) => {
            const calling = ours();
            if (calling instanceof ElysiaStatus) {
              return calling;
            }
            const now = calling.project.name;
            if (now !== projectWords.placeholderName) {
              return problem(409, {
                code: "caw-project-named",
                detail: `The project is named “${now}” already; the person renames it from its details or the setup page's name field.`,
              });
            }
            const renamed = await rename(calling.project.id, name);
            return typeof renamed === "string" ? { name: renamed } : renamed;
          },
          (named: { name: string }) => `Named the project “${named.name}”.`
        ),
        tool(
          "view_guide",
          "How a view's program is written.",
          {},
          async () => VIEW_PROMPT,
          sentence
        ),
        // Only names roles.ts lists: the hub routes those to this list and
        // scopes them to a project; any other is listed and never reached.
      ] satisfies (McpTool & { name: CawToolName })[];
    },
  };
  return api;
};

export type Caw = ReturnType<typeof createCaw>;

const HARNESS = t.UnionEnum(HARNESSES);
const BLOCK_PAGE = t.UnionEnum(BLOCK_PAGES);

/** The routes for a project's conversation and your asks for views. */
export const cawRoutes = (caw: Caw) =>
  new Elysia()
    .get("/api/projects/:id/caw", ({ params }) => caw.view(params.id))
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
          // Whether it reads what the person writes on its tasks (task-input.ts).
          hearsTasks: t.Optional(t.Boolean()),
          // Whether the person's comment on a task reaches its attempt (jev-tasks.ts).
          attemptsHearComments: t.Optional(t.Boolean()),
        }),
      },
      ({ params, body }) => caw.configure(params.id, body)
    )
    // How his panel starts the project's conversation (caw `start`): where,
    // on what and in which mode. It may make the project's folder, so it is
    // asked for, never read.
    .post("/api/projects/:id/caw/place", ({ params }) => caw.start(params.id))
    // A conversation his panel started is the project's conversation now.
    .post(
      "/api/projects/:id/caw/conversation",
      { body: t.Object({ instanceId: t.String({ minLength: 1 }) }) },
      ({ params, body }) => caw.name(params.id, body.instanceId)
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
    .get("/api/projects/:id/spend", ({ params }) => caw.spend(params.id))
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
        return await caw.requestView(
          params.id,
          body.text,
          body.page
            ? { page: body.page, position: body.position ?? null }
            : null
        );
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
        return await caw.askAboutView(params.id, params.name, body.text);
      }
    );
