/**
 * Caw, a project's lead (Projects spec §5.3, §5.6; D4, D13).
 *
 * - **A setting per project**: on or off, and the harness Caw runs on. On by
 *   default for a project made with Caw; off for every project from before.
 * - **You can always talk to him** (WORDS.md, Caw on / Caw off): your
 *   message in a thread, your ask for a view and the project's setup start
 *   his session whether he is on or off. Only a reason he cannot start (no
 *   machine for him, {@link problemOf}) or the project's spend cap refuses
 *   your words, each with its sentence. On means only that he ALSO acts on
 *   his own: events wake him and he leads dispatch.
 * - **The lead is P1's lead.** `projects.lead_instance_id` names Caw's
 *   session; the dispatcher's attempts report to it and work-items.ts makes
 *   it a co-parent of the project's items while he is on. Only the hub sets
 *   it: it starts the session on your words or, while Caw is on, the first
 *   event, on a checkout of the project on a machine that is online, with
 *   the role `lead`, so the `cawco` server lists it the lead's tools. Every
 *   spawn of its row (server.ts `bounded`) runs it inside its place's
 *   boundary ({@link leadPlaceRef}), and puts each of its shell and edit
 *   calls to the hub's gate (lead-gate.ts).
 * - **Woken by your words and, while on, by events**, never a timer: your
 *   message in a thread, your ask for a view; an attempt at a task landing
 *   or failing (its report, or a line from here while the project has no Caw
 *   session yet), a task entering a stage of kind `you`, a routine for the
 *   lead. Each wake is one message to its session through the one send path,
 *   which revives a session at rest. An event the person should read is also
 *   noted in a thread (`author: "event"`): the thread it belongs to, else the
 *   project's newest.
 * - **Off**: no event wakes him and nothing he would do on his own spends.
 *   His session stays, resting between turns (it costs nothing so), so your
 *   next words carry on his context. A turn an event started is cut when he
 *   is turned off; one your words are in runs to its end. Attempt reports go
 *   to their parent alone (work-items.ts `reportees`), asks with no session
 *   to take them and failed attempts to you (push.ts), and the dispatcher
 *   starts nothing on its own. A move of harness or model ends his session.
 * - **Threads**: conversations with Caw, kept here; Caw answers with
 *   `thread_reply`. A thread's status is derived, never stored: `working`
 *   while the lead is busy on a turn that thread woke, `needs-you` while a
 *   question the lead asked in it is parked, else `ready`. The lead's
 *   question is tagged with its thread (server.ts) and your answer lands in
 *   it. Every change reaches open dashboards as `thread.upsert` and
 *   `thread.message` frames.
 * - **Views**: Caw drafts a view with `view_draft` (views.ts), an OpenUI
 *   Lang program written to the prompt generated from CawCo's library
 *   (openui.ts `VIEW_PROMPT`, which your ask for a view carries), reading the
 *   view tools he can try with `view_query`; you keep or discard it.
 * - Each lead shows its spend: what every Caw session of the project has
 *   cost, from the usage buckets budgets already read.
 */

import { createHash } from "node:crypto";
import {
  BOARD_ONLY_DENIED_TOOLS,
  CAW_DENIED_TOOLS,
  type CawHarness,
  type CawInitiated,
  type CawRunning,
  type CawView,
  CURATOR_DENIED_TOOLS,
  type Envelope,
  type InstanceRow,
  type PermissionRequestFrame,
  type PermissionResult,
  type ProjectSpend,
  type ProjectStopFrame,
  questionsOf,
  type SendPayload,
  type SpawnPayload,
  type ThreadAnswer,
  type ThreadMessage,
  type ThreadMessageFrame,
  type ThreadRead,
  type ThreadSaid,
  type ThreadStatus,
  type ThreadSummary,
  type ThreadUpsertFrame,
  type UserAnswers,
  VIEW_TOOLS,
  type WorkspaceRef,
} from "@cawco/core";
import { LEAD_PLACE_SUFFIX } from "@cawco/core/workspace-policy";
import { Elysia, status, t } from "elysia";
import { z } from "zod";
import { tool } from "./admin-tools";
import { topsAtCaw } from "./caw-own";
import type {
  DbShape,
  ThreadListRow,
  ThreadMessageRow,
  ThreadRow,
  WorkItemRow,
} from "./db";
import type { Origin, WorkOrigin } from "./db/schema";
import { inboxText } from "./ingress";
import { MAKE_A_NOTE, personsTier, ROUTINE_ORIGIN } from "./memory";
import { VIEW_PROMPT } from "./openui";
import type { Caps } from "./project-caps";
import { readProjectTypes } from "./project-delegate-types";
import {
  FOLDER_FILE_LIMIT,
  FolderRefusal,
  folderPath,
  listFolder,
  readFolderFile,
  writeFolderFile,
} from "./project-folder";
import { setupEvent } from "./setup";
import {
  readStages,
  type StagesTemplate,
  TEMPLATES,
  templateText,
} from "./stages";
import type { TaskEvent, TaskView } from "./tasks";
import type { Views } from "./views";

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

/** The harnesses Caw runs on, in the order a picker offers them. */
export const CAW_HARNESSES = Object.keys(CAW_DENIED_TOOLS) as CawHarness[];

/** Caw's denied tools on `harness`; refused on a harness whose shell and edit calls the hub's gate cannot decide. */
export const cawDenied = (harness: string): readonly string[] => {
  if (!(harness in CAW_DENIED_TOOLS)) {
    throw new Error(
      `Caw does not run on ${harness}: it cannot put each of Caw's shell and edit calls to the hub first.`
    );
  }
  return CAW_DENIED_TOOLS[harness as CawHarness];
};

/** A fleet-watch triage run's denied tools on `harness` (core `BOARD_ONLY_DENIED_TOOLS`): the board alone. */
const boardOnlyDenied = (harness: string): readonly string[] => {
  if (!(harness in BOARD_ONLY_DENIED_TOOLS)) {
    throw new Error(
      `Fleet-watch triage does not run on ${harness}: it cannot deny its edit and shell tools.`
    );
  }
  return BOARD_ONLY_DENIED_TOOLS[harness as CawHarness];
};

/** A memory curator's denied tools on `harness` (core `CURATOR_DENIED_TOOLS`); refused on one that cannot deny them. */
const curatorDenied = (harness: string): readonly string[] => {
  if (!(harness in CURATOR_DENIED_TOOLS)) {
    throw new Error(
      `The memory curator does not run on ${harness}: it cannot deny the curator's edit, shell and web tools. Give the Memory curator routine a delegate type on Claude Code or OpenCode.`
    );
  }
  return CURATOR_DENIED_TOOLS[harness as CawHarness];
};

/**
 * A spawn as it reaches a machine: a lead row's (a project's Caw) also
 * denies Caw's subagent, Monitor and worktree tools on `harness` (his shell
 * and edit calls each go to the hub's gate, lead-gate.ts); an overseer row's
 * (a fleet-watch triage run, fleet-watch.ts) the board-only list; a curator
 * row's (a project's memory curator run) that and the web, whatever else it
 * denies. A lead's says so ({@link SpawnPayload.lead}): the machine asks the
 * hub before each of his shell and edit calls, and he has the fleet's MCP
 * servers as any session does. An overseer's and a curator's say they are
 * fenced ({@link SpawnPayload.fence}): CawCo's MCP server and no other. Any
 * other row's spawn says it is neither, whatever its caller sent.
 */
export const withCawDenials = (
  payload: SpawnPayload,
  row: Pick<InstanceRow, "role">,
  harness: string
): SpawnPayload => {
  const { lead: _callerLead, fence: _callerFence, ...asked } = payload;
  let denied: readonly string[];
  if (row.role === "lead") {
    denied = cawDenied(harness);
  } else if (row.role === "overseer") {
    denied = boardOnlyDenied(harness);
  } else if (row.role === "curator") {
    denied = curatorDenied(harness);
  } else {
    return asked;
  }
  return {
    ...asked,
    ...(row.role === "lead"
      ? { lead: true as const }
      : { fence: true as const }),
    denyTools: [...new Set([...(asked.denyTools ?? []), ...denied])],
  };
};

/**
 * The boundary of the place Caw runs in: his project's checkout, its folder
 * on the hub, or a folder of his own. Every spawn of his row carries it, as a
 * work item's carries its workspace, so his shell and file tools write only
 * there and in its scratch dir, read no credential store, reach no service
 * manager and see no other session's processes, exactly as a delegate's. Its
 * id names the project, machine and folder (the first 8 characters name its
 * scratch and door dirs, so they are the hash's), and ends
 * {@link LEAD_PLACE_SUFFIX}, which the machine's policy reads as a lead's
 * place (workspace-policy.ts `isLeadPlace`). None for any other row.
 */
export const leadPlaceRef = (
  row: Pick<InstanceRow, "role" | "projectId" | "machineId" | "cwd">
): WorkspaceRef | undefined =>
  row.role === "lead" && row.projectId
    ? {
        id: `${createHash("sha256")
          .update(`${row.projectId}\0${row.machineId}\0${row.cwd}`)
          .digest("hex")
          .slice(0, 8)}${LEAD_PLACE_SUFFIX}`,
        path: row.cwd,
      }
    : undefined;

/**
 * What wakes Caw: who it is from (`you`, the person's own words: a thread, a
 * view request, a project's setup, which reach him on or off; or an `event`:
 * an attempt, a needs-you task, a routine, the dispatcher, which wakes him
 * only while he is on), the words it reads, the thread the event
 * belongs to, and the note the person reads in that thread (none for your
 * own message, which is in the thread already).
 */
export interface CawEvent {
  by: Origin;
  note?: { body?: string; title: string };
  /** The routine whose run this wake is (routines.ts): its turn is that run's, and a note in it is tainted (memory.ts). */
  routine?: string;
  /**
   * The person's own send this wake carries ({@link Caw.personSent}): it
   * goes under that send's uuid, so the row their screen drew is the wake's
   * record, with what the send carried besides its words.
   */
  send?: PersonSend;
  text: string;
  /** Its thread: the note goes there, and that thread is `working` while the turn it wakes runs. */
  threadId?: string;
}

/**
 * Whose a wake is, for his gate (lead-gate.ts): your words alone are yours;
 * an event, a routine, or outside events riding on it make it outside.
 */
const sourceOf = (event: CawEvent, inboxed: number): "owner" | "outside" =>
  event.by === "you" && !event.routine && inboxed === 0 ? "owner" : "outside";

/** A person's send to Caw's session, as its wake carries it on: its uuid and what it carried besides its words. */
interface PersonSend {
  carried: Pick<SendPayload, "attachments" | "images" | "urgent">;
  uuid: string;
}

/** A send's words: its text, or the text blocks of its content. */
const wordsOf = (content: SendPayload["message"]["message"]["content"]) =>
  typeof content === "string"
    ? content
    : content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n");

const messageOf = (row: ThreadMessageRow): ThreadMessage => {
  const base = {
    id: row.id,
    threadId: row.threadId,
    createdAt: row.createdAt.getTime(),
  };
  switch (row.author) {
    case "event":
      return {
        ...base,
        author: "event",
        noteTitle: row.noteTitle ?? "",
        ...(row.body ? { body: row.body } : {}),
      };
    case "caw":
      return {
        ...base,
        author: "caw",
        body: row.body,
        ...(row.tasks?.length ? { tasks: row.tasks } : {}),
        ...(row.files?.length ? { files: row.files } : {}),
      };
    default:
      return {
        ...base,
        author: "you",
        body: row.body,
        ...(row.question ? { question: row.question } : {}),
        ...(row.answer ? { answer: row.answer } : {}),
      };
  }
};

/** How long a thread's title runs: the first line of its first message, cut. */
const TITLE_MAX = 60;
const FIRST_LINE = /\r?\n/;
const TASK_ID = /^tsk-\d{1,9}$/;

/** The most files one reply names. */
const FILES_MAX = 40;
const STAGES_FILE = "stages.md";
/** Attempts whose thread is kept for the other half of their end ({@link createCaw}'s `attemptThread`). */
const ATTEMPT_THREADS_KEPT = 200;

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

/** The files a reply names, each a file the project's folder has; refused naming one it has not. */
const folderFiles = async (
  projectId: string,
  files: string[]
): Promise<string[]> => {
  const paths = [...new Set(files.map((file) => folderPath(file)))];
  const listed = await folderCall(() => listFolder(projectId, "", true));
  const there = new Set(
    listed.entries
      .filter((entry) => entry.kind === "file")
      .map((entry) => entry.path)
  );
  const missing = paths.filter((path) => !there.has(path));
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not in the project's folder; name the files you wrote with folder_write.`
    );
  }
  return paths;
};

const titleFrom = (body: string): string => {
  const line = body.trim().split(FIRST_LINE)[0]?.trim() ?? "";
  return line.length > TITLE_MAX
    ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…`
    : line;
};

/** An attempt's end, in the word an event note reads. */
const ENDED: Record<string, string> = {
  done: "landed",
  failed: "failed",
  cancelled: "was cancelled",
};

/** Statuses a lead session cannot be woken from: its row is gone for good. */
const GONE: ReadonlySet<string> = new Set(["discarded"]);

/** A refusal a route answers with its status. */
export class CawRefusal extends Error {
  readonly status: 400 | 403 | 404 | 409;
  constructor(code: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.status = code;
  }
}

const refuse = (code: 400 | 403 | 404 | 409, message: string): never => {
  throw new CawRefusal(code, message);
};

/** What Caw reads first, before the event that started it. */
const briefOf = (projectName: string): string =>
  [
    `You are Caw, the lead of the project “${projectName}” in CawCo.`,
    "You have the project's board (task_read, task_create, task_update, task_link, task_start, task_retry, todo_write), its threads (thread_read, thread_reply), its views (view_draft, view_query), its folder on the hub (folder_read, folder_write: stages.md, delegates/, decisions/), decision pages (artifact_create with kind page builds decisions/<name>/page.html and shows it; artifact_read has the picks), delegate with the tools that steer the project's work (handoff, answer_delegate, stop_delegate, interrupt_delegate, set_item_checks), send_to_user, and the fleet's MCP tools every session has (web search and fetch among them).",
    "You have shell and edit tools, inside the boundary of your place, this folder: you write only here and in $TMPDIR, read no credential store, reach no service manager and see no other session's processes, and files only their owner may read are hidden from you. The hub decides each call before it runs. In a turn the person's own message woke, read-only commands (ls, cat, grep, find, wc, head, git that only reads) run without asking, and so do git init, git add <paths> and git commit where no one else works; every other shell or edit call raises an Approve card the person answers, wherever they are. In a turn anything else woke (an event, a routine, a report, outside text riding on your wake) every call raises the card, and so does every call after you read web content in a turn. In a shared checkout git checkout, switch, restore, reset, stash, clean, rebase and push, git add -A or git add ., and any git alias are refused: file a task. Your edits are docs, config and assets only, 5 files a wake at most: anything bigger, file a task. At most 20 shell or edit calls a wake: delegate the rest. Every call shows in your thread. A task whose only changes are your own passes review only once the person approved them.",
    "Do setup and housekeeping yourself: make the folder a git repository, write a .gitignore or a config file, look at what is there. Real task work goes to tasks and delegates. Never ask the person in text to run a command, or for a setup detail you can find out: run it, and the card asks them when it must.",
    "AGENTS.md and knowledge/ are your project's memory: write one with memory_propose (the file's whole new text and why); it commits as you and is noted in the thread. Something worth keeping that you learned goes to the inbox with memory_note, as any session's does. A task's `context` names the knowledge/ files its attempt's brief carries.",
    "Your project's settings are yours to change with project_settings: grant it a connection, link its GitHub repository, set where its work lands, or publish its place to a new private GitHub repository (create_repo, always an Approve card first). Each change applies at once and is noted in the thread. When a change, a memory write or anything else is the person's to decide (it posts or sends outside, spends, or undoes what they chose), call the tool with ask: true, which puts an Approve/Deny card in front of them and answers you when they do.",
    "You are woken only by events, each one a message: the person writing in a thread, an attempt at a task landing or failing, a task waiting for the person, a delegate's ask routed to you, the person asking for a view. Handle the event, then end your turn. Nothing wakes you on a timer. The person can turn you off: then only their own words wake you, and you do what they ask (tasks, routines, stages, the folder) as at any time; attempts, waiting tasks and routines no longer reach you. Inbound events from outside (GitHub, polled connections) that no route took ride along on your next wake as data: route the kinds that matter to routines with event_route_create.",
    "When the person writes in a thread, answer in that thread with thread_reply, and name the tasks a reply is about in its `tasks`. A turn their words started that ends without a thread_reply to their thread has what you said in plain text posted there as your reply, so say nothing in plain text you would not say to them.",
    "When you need the person's decision, ask with AskUserQuestion, with options; it shows as a card in the thread and their pick comes back to you. Never end a message with a question for them to answer in text. Never hand them shell commands or ask them for setup details in text: do it with your tools, or ask with the card.",
    "A view-request event is the person asking for a view of the project: it carries how to write one. Answer it with view_draft, then say in that thread what you drafted; the person keeps or discards it.",
    'Judgments go to Jev while the person has connected it; while Jev is off some are yours, and never about your own work. Mark a task `fields: { ready: "yes" }` when an agent can do it from its file alone: the dispatcher starts no other. Rank tasks with `rank`: the dispatcher starts them in that order. Triage the tasks a wake lists for triage. Judge an attempt\'s acceptance criteria when a wake asks you to.',
  ].join("\n\n");

export interface CawDeps {
  /** The asks parked on the hub now (pending.ts). */
  readonly asks: () => Envelope[];
  /** The project's spend cap and the fleet's default for it (project-caps.ts). */
  readonly caps: Pick<Caps, "capOf" | "quiets">;
  readonly db: Pick<
    DbShape,
    | "addThreadMessage"
    | "allThreads"
    | "bookCawTurn"
    | "createThread"
    | "dropLeadTurn"
    | "getInstancesByIds"
    | "cawSpentSince"
    | "ingress"
    | "leadTurns"
    | "listProjects"
    | "newestThread"
    | "project"
    | "projectSpend"
    | "projectThreads"
    | "putLeadTurn"
    | "setProjectCaw"
    | "spendOnCap"
    | "thread"
    | "threadMessages"
    | "threadMessage"
    | "threadOfTask"
    | "updateWorkItem"
    | "workItem"
  >;
  /** Ends a session (the lead, when Caw moves harness or model). */
  readonly end: (instanceId: string) => void;
  /** Whether the fleet's two choices were ever set (the setup page asks for them until they are). */
  readonly fleetChoicesSet: () => boolean;
  /** The project's folder changed under its tasks (stages.md, a task file). */
  readonly folderChanged: (projectId: string) => void;
  /** Whether a session is in a turn now, as its last pulse said. */
  readonly inTurn: (instanceId: string) => boolean;
  /** Cuts a session's turn in flight; the session keeps its state (the lead's event turn, when Caw is turned off). */
  readonly interrupt: (instanceId: string) => void;
  /**
   * Where Caw starts while no checkout of the project is online: its folder
   * on the hub when the hub's machine runs an agent, else a folder of his own
   * on another machine that is online; undefined while no machine is.
   */
  readonly leadHome: (
    projectId: string
  ) => Promise<{ machineId: string; cwd: string } | undefined>;
  /** "Make a note" (memory.ts): your words straight into the project's AGENTS.md, as your commit. */
  readonly makeNote: (
    projectId: string,
    text: string
  ) => Promise<{ sha: string }>;
  /** Whether a machine is connected now; without one, whether any is. */
  readonly online: (machineId?: string) => boolean;
  /**
   * Tells every open dashboard a thread changed, or (`project.stop`) that his
   * turn an event started stopped as he was turned off (the ledger's
   * broadcast).
   */
  readonly publish: (
    frame: ThreadUpsertFrame | ThreadMessageFrame | ProjectStopFrame
  ) => void;
  /**
   * Ensures a lead's place boundary on his machine again (server.ts
   * `ensureIdentityWorkspace`): the machine reads its policy anew and hands
   * over to a boundary of the new one when it changed. Refused when the
   * machine cannot hold it: the wake does not go out.
   */
  readonly refreshPlace: (lead: InstanceRow) => Promise<void>;
  /** Delivers one message to a session through the hub's one send path: whether the hub took it (its record `pending`). */
  readonly send: (envelope: Envelope<SendPayload>) => boolean;
  /** Starts a session, resolved once its machine says it is in place. */
  readonly spawn: (machineId: string, payload: SpawnPayload) => Promise<void>;
  /**
   * A project's forget stop path (project-stops.ts): its running sessions as
   * a tree, and their stop, each end reported as `project.stop` once its
   * machine confirms it (or deferred to an away machine's next register).
   */
  readonly stops: {
    running: (projectId: string) => Omit<CawRunning, "kind" | "taskId">[];
    stop: (projectId: string, ids: string[]) => void;
  };
  /** A task as its project's files have it. */
  readonly task: (projectId: string, id: string) => Promise<TaskView>;
  /**
   * Triage with Jev off (§5.9): the batch of the project's untriaged tasks
   * each wake carries, or nothing (jev-tasks.ts `triageFor`).
   */
  readonly triage: (projectId: string) => Promise<string | undefined>;
  /**
   * A session's turn ended (routines.ts `leadTurnEnded`): the lead runs whose
   * wake it read and that it gave no result fail, `why` when it is not the
   * plain end of a turn. `gone`, the project whose lead it was, when the
   * session itself is over.
   */
  readonly turnEnded: (instanceId: string, why?: string, gone?: string) => void;
  /** Writes Caw's draft views, and answers the view tools he tries (views.ts). */
  readonly views: Pick<Views, "draft" | "query">;
  /**
   * A wake went out as send `uuid`: your words alone (`owner`), or with
   * outside text, an event's or a routine's (`outside`). His gate reads it
   * when his harness reads the send (lead-gate.ts).
   */
  readonly wakeSent: (uuid: string, kind: "owner" | "outside") => void;
}

export const createCaw = ({
  asks,
  caps,
  db,
  end,
  fleetChoicesSet,
  folderChanged,
  inTurn,
  interrupt,
  leadHome,
  makeNote,
  online,
  publish,
  refreshPlace,
  send,
  spawn,
  stops,
  task,
  triage,
  turnEnded,
  views,
  wakeSent,
}: CawDeps) => {
  /**
   * Leads whose turn an event started was cut as Caw was turned off, by
   * session, with their project: the turn's row reads stopped once the idle
   * pulse after the cut confirms it.
   */
  const cut = new Map<string, string>();
  /** The turn cut from `instanceId` is over: its row reads stopped. */
  const cutConfirmed = (instanceId: string): void => {
    const projectId = cut.get(instanceId);
    if (projectId) {
      cut.delete(instanceId);
      publish({
        kind: "project.stop",
        projectId,
        instanceId,
        outcome: "stopped",
      });
    }
  };
  /** Lead sessions being started now, by project: one start per project at a time. */
  const starting = new Map<string, Promise<InstanceRow>>();
  /**
   * What each lead is answering, by lead session: the working copy of the
   * `lead_turns` rows ({@link keep} writes both), read back from them as the
   * hub starts, so it outlives a hub restart. Its one source is the hub's
   * sends to him ({@link sendLeft}): `waiting` are the sends that woke him
   * and that his harness has not read, by send uuid, with the thread each
   * woke (`""` for none); `reading` the threads whose wake the turn under
   * way read; `started` once that turn read a send. A thread is `working`
   * while either names it. The idle after a started turn ends that turn
   * ({@link endTurn}): its threads go `ready`, and what still waits keeps
   * the record. `by` is whose it is: `you` once your words are in it, `kept`
   * once you let his own turn finish as you turned him off, else `event`.
   * What he starts in it is that work's (work-items `origin`), and turning
   * him off asks about his own turn while yours runs to its end.
   * `threadId` is the thread it last answered (his questions, what he
   * starts, the turn's cost); one no thread woke (a question reaching him as
   * the lead) has none and says `what` it answers, on his panel.
   */
  interface Turn {
    by: WorkOrigin;
    projectId: string;
    reading: string[];
    started: boolean;
    threadId?: string;
    waiting: Record<string, string>;
    what?: string;
  }
  const turns = new Map<string, Turn>(
    db.leadTurns().map((stored) => [
      stored.instanceId,
      {
        by: stored.origin,
        projectId: stored.projectId,
        reading: stored.reading,
        started: stored.started,
        waiting: stored.waiting,
        ...(stored.threadId ? { threadId: stored.threadId } : {}),
        ...(stored.what ? { what: stored.what } : {}),
      },
    ])
  );

  /** A lead's turn as it now stands, in memory and stored. */
  const keep = (instanceId: string, turn: Turn): void => {
    turns.set(instanceId, turn);
    db.putLeadTurn({
      instanceId,
      projectId: turn.projectId,
      origin: turn.by,
      threadId: turn.threadId ?? null,
      what: turn.threadId ? null : (turn.what ?? null),
      reading: turn.reading,
      started: turn.started,
      waiting: turn.waiting,
    });
  };

  /** The threads a turn keeps `working`: those its turn under way read, and those its unread wakes woke. */
  const threadsOf = (turn: Turn): string[] => [
    ...new Set(
      [...turn.reading, ...Object.values(turn.waiting)].filter(Boolean)
    ),
  ];

  /** Whose a turn is when `next` joins it: yours over his kept own over an event's. */
  const RANK: Record<WorkOrigin, number> = { event: 0, kept: 1, you: 2 };
  const joined = (before: WorkOrigin | undefined, next: WorkOrigin) =>
    before && RANK[before] > RANK[next] ? before : next;

  /**
   * The thread each lead's latest turn answered, kept past the turn's idle
   * pulse: its result, which carries the turn's cost, can land after it.
   */
  const answered = new Map<string, string>();

  /**
   * Your words' wakes not yet read, by send uuid: the thread each woke. The
   * turn that reads one owes that thread what he says ({@link speech}).
   */
  const yourWakes = new Map<string, string>();
  /**
   * Each lead's turn under way, as far as his words go: `heard`, the threads
   * whose wake of your words it read; `words`, what he said in plain text in
   * it (main loop only); `replied`, the threads he answered with
   * thread_reply. A turn that read your words and ends without answering
   * their thread leaves what it said there, as his reply
   * ({@link answerUnreplied}): you read only the thread, so nothing he says
   * to you stays in his session alone.
   */
  const speech = new Map<
    string,
    { heard: Set<string>; replied: Set<string>; words: string[] }
  >();

  /**
   * His turn read a send: one that starts the turn (`started` false) starts
   * what it says over; one your words woke from `yours` owes that thread.
   */
  const heardIn = (
    instanceId: string,
    started: boolean,
    yours: string | undefined
  ): void => {
    const now = (started && speech.get(instanceId)) || {
      heard: new Set<string>(),
      replied: new Set<string>(),
      words: [],
    };
    if (yours) {
      now.heard.add(yours);
    }
    speech.set(instanceId, now);
  };

  /**
   * The turn under way ended: each thread whose your-words wake it read and
   * that it did not answer with thread_reply gets what he said in it, as his
   * message. A turn that said nothing in plain text leaves nothing.
   */
  const answerUnreplied = (instanceId: string): void => {
    const turn = speech.get(instanceId);
    speech.delete(instanceId);
    const body = turn?.words.join("\n\n").trim();
    if (!(turn && body)) {
      return;
    }
    for (const threadId of turn.heard) {
      if (turn.replied.has(threadId) || !db.thread(threadId)) {
        continue;
      }
      const added = db.addThreadMessage({ threadId, author: "caw", body });
      said(added.thread, added.message);
    }
  };

  const projectOf = (projectId: string) =>
    db.project(projectId) ??
    refuse(404, `The hub keeps no project ${projectId}.`);

  const row = (id: string): InstanceRow | undefined =>
    db.getInstancesByIds([id])[0] as InstanceRow | undefined;

  // --- status and frames ---------------------------------------------------

  const statusOf = (threadId: string): ThreadStatus => {
    if (
      asks().some(
        (ask) =>
          (ask.payload as { threadId?: unknown } | undefined)?.threadId ===
          threadId
      )
    ) {
      return "needs-you";
    }
    for (const turn of turns.values()) {
      if (threadsOf(turn).includes(threadId)) {
        return "working";
      }
    }
    return "ready";
  };

  const summaryOf = (thread: ThreadRow): ThreadSummary => ({
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    lastAt: thread.updatedAt.getTime(),
    setup: thread.setup,
    status: statusOf(thread.id),
  });

  const upsert = (thread: ThreadRow | undefined): void => {
    if (thread) {
      publish({ kind: "thread.upsert", thread: summaryOf(thread) });
    }
  };

  /**
   * A message added to a thread, to every dashboard: the message, then the
   * row it moved. `withRow: false` when a wake follows, which publishes the row
   * once with the turn's status, so it never reads `ready` for a moment.
   */
  const said = (
    thread: ThreadRow,
    added: ThreadMessageRow,
    withRow = true
  ): ThreadSaid => {
    const message = messageOf(added);
    publish({ kind: "thread.message", threadId: thread.id, message });
    if (withRow) {
      upsert(thread);
    }
    return { thread: summaryOf(thread), message };
  };

  /**
   * A send woke the lead (`sent`, its uuid): what woke it waits for his
   * harness to read it, and `threadId`, when it names one, is `working`
   * from now until the turn that reads it ends. A turn your words are in
   * stays yours when an event joins it ({@link joined}). Without a thread
   * it says `what` it answers, on his panel.
   */
  const follow = (
    leadId: string,
    projectId: string,
    by: WorkOrigin,
    sent: string,
    to: { threadId: string } | { what: string }
  ) => {
    const before = turns.get(leadId);
    const threadId = "threadId" in to ? to.threadId : before?.threadId;
    if ("threadId" in to) {
      answered.set(leadId, to.threadId);
      if (by === "you") {
        yourWakes.set(sent, to.threadId);
      }
    }
    keep(leadId, {
      by: joined(before?.by, by),
      projectId,
      reading: before?.reading ?? [],
      started: before?.started ?? false,
      waiting: {
        ...before?.waiting,
        [sent]: "threadId" in to ? to.threadId : "",
      },
      ...(threadId ? { threadId } : {}),
      ...("what" in to ? { what: to.what } : {}),
    });
    if ("threadId" in to) {
      upsert(db.thread(to.threadId));
    }
  };

  /** Publishes the rows of the threads a turn kept working that no longer are. */
  const released = (before: string[]): void => {
    for (const threadId of before) {
      upsert(db.thread(threadId));
    }
  };

  /** A lead's record is over: his session ended, his machine went, or he was replaced. */
  const unfollow = (instanceId: string): void => {
    speech.delete(instanceId);
    // Every stored turn is in the working copy: one it lacks has no row.
    const turn = turns.get(instanceId);
    if (!turn) {
      return;
    }
    turns.delete(instanceId);
    db.dropLeadTurn(instanceId);
    released(threadsOf(turn));
  };

  /**
   * The lead's turn under way ended (its idle, or it was cut): what he said
   * in it reaches the threads of yours he left unanswered
   * ({@link answerUnreplied}); the threads it read go `ready`; the wakes
   * still unread keep the record, and their threads `working`, for the turn
   * that reads them.
   */
  const endTurn = (instanceId: string): void => {
    answerUnreplied(instanceId);
    const turn = turns.get(instanceId);
    if (!turn) {
      return;
    }
    if (Object.keys(turn.waiting).length === 0) {
      unfollow(instanceId);
      return;
    }
    const before = threadsOf(turn);
    keep(instanceId, { ...turn, reading: [], started: false });
    released(before);
  };

  /**
   * A send to a session left `pending` (server.ts `changeSend`): `read` by
   * its harness, or never to be. A lead's wake read is his turn under way
   * reading it, and its thread is that turn's; one never read releases its
   * thread, and the record with it when nothing else holds it.
   */
  const sendLeft = (
    instanceId: string,
    uuid: string,
    wasRead: boolean
  ): void => {
    const yours = yourWakes.get(uuid);
    yourWakes.delete(uuid);
    const turn = turns.get(instanceId);
    if (!turn) {
      return;
    }
    if (wasRead) {
      heardIn(instanceId, turn.started, yours);
    }
    const woke = turn.waiting[uuid];
    if (woke === undefined) {
      // Another send read (your words straight into his session): the turn
      // under way is reading, so the idle after it ends it.
      if (wasRead && !turn.started) {
        keep(instanceId, { ...turn, started: true });
      }
      return;
    }
    const { [uuid]: _taken, ...waiting } = turn.waiting;
    const reading =
      wasRead && woke && !turn.reading.includes(woke)
        ? [...turn.reading, woke]
        : turn.reading;
    const next = {
      ...turn,
      waiting,
      reading,
      started: turn.started || wasRead,
    };
    if (!next.started && Object.keys(waiting).length === 0) {
      unfollow(instanceId);
      return;
    }
    keep(instanceId, next);
    if (woke) {
      upsert(db.thread(woke));
    }
  };

  /**
   * Notes an event in its thread, else the project's newest, else a thread
   * of its own; answers the thread it went to. `withRow` as {@link said}.
   * A project deleted since the event began has no threads to note it in.
   */
  const noteIn = (
    projectId: string,
    threadId: string | undefined,
    note: { body?: string; title: string },
    withRow = true
  ): string => {
    projectOf(projectId);
    const thread =
      (threadId ? db.thread(threadId) : undefined) ??
      db.newestThread(projectId);
    const event = {
      author: "event" as const,
      body: note.body?.trim() ?? "",
      noteTitle: note.title,
    };
    if (thread) {
      const added = db.addThreadMessage({ threadId: thread.id, ...event });
      said(added.thread, added.message, withRow);
      return thread.id;
    }
    const made = db.createThread({
      id: crypto.randomUUID(),
      projectId,
      title: titleFrom(note.title),
      first: event,
    });
    said(made.thread, made.message, withRow);
    return made.thread.id;
  };

  // --- the lead session ----------------------------------------------------

  /** The project's Caw session, when it has one the hub can still wake. */
  const standing = (
    project: ReturnType<typeof projectOf>
  ): InstanceRow | undefined => {
    const lead = project.leadInstanceId
      ? row(project.leadInstanceId)
      : undefined;
    return lead &&
      lead.role === "lead" &&
      lead.projectId === project.id &&
      !GONE.has(lead.status) &&
      online(lead.machineId)
      ? lead
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
   * Where Caw starts: a checkout that is online; before the project has one
   * online, its folder on the hub or a folder of his own ({@link leadHome}).
   */
  const placeFor = async (
    project: ReturnType<typeof projectOf>
  ): Promise<{ machineId: string; cwd: string } | undefined> => {
    const checkout = checkoutFor(project);
    return checkout
      ? { machineId: checkout.machineId, cwd: checkout.path }
      : await leadHome(project.id);
  };

  /** Why Caw could not start for the project now, on or off, or null. */
  const problemOf = (project: ReturnType<typeof projectOf>): string | null => {
    if (standing(project) || checkoutFor(project)) {
      return null;
    }
    return online()
      ? null
      : "No machine is online, so Caw can't start. Bring a machine online, then write here.";
  };

  /**
   * One message to Caw's session. A routine's wake says so in its origin
   * (`routine:<id>`): the turn it starts is that run's (memory.ts). A
   * person's send it carries ({@link PersonSend}) gives it its uuid and what
   * it carried. Answers the send's uuid when the hub took it, for
   * {@link follow}.
   */
  const message = (
    target: InstanceRow,
    content: string,
    routine?: string,
    person?: PersonSend
  ): string | undefined => {
    const uuid = person?.uuid ?? crypto.randomUUID();
    const taken = send({
      verb: "send",
      machineId: target.machineId,
      instanceId: target.id,
      payload: {
        ...person?.carried,
        instanceId: target.id,
        message: {
          type: "user",
          uuid,
          message: { role: "user", content },
          parent_tool_use_id: null,
          origin: {
            kind: "system",
            name: routine ? `${ROUTINE_ORIGIN}${routine}` : "caw",
          },
        },
      },
    });
    return taken ? uuid : undefined;
  };

  /**
   * Starts the project's Caw session, makes it the lead, and sends it its
   * brief with the event that started it: a session is only ever started by
   * an event.
   */
  const startLead = async (
    project: ReturnType<typeof projectOf>,
    event: string,
    routine?: string,
    person?: PersonSend
  ): Promise<{ lead: InstanceRow; sent: string | undefined }> => {
    const place =
      (await placeFor(project)) ??
      refuse(
        409,
        problemOf(project) ??
          "No machine is online, so Caw can't start. Bring a machine online, then write here."
      );
    const instanceId = crypto.randomUUID();
    cawDenied(project.cawHarness);
    await spawn(place.machineId, {
      instanceId,
      cwd: place.cwd,
      harness: project.cawHarness,
      ...(project.cawModel ? { model: project.cawModel } : {}),
      projectId: project.id,
      title: "Caw",
      role: "lead",
      requestId: crypto.randomUUID(),
    });
    db.setProjectCaw(project.id, { leadInstanceId: instanceId });
    const lead = row(instanceId);
    if (!lead) {
      throw new Error(`Caw's session ${instanceId} has no row on this hub.`);
    }
    const sent = message(
      lead,
      `${briefOf(project.name)}\n\n${event}`,
      routine,
      person
    );
    console.log(
      `[caw] ${project.name}: started Caw on ${project.cawHarness} (${instanceId})`
    );
    return { lead, sent };
  };

  /**
   * The project's Caw session: the one it has, or one started now for
   * `event` (its first message, after its brief): for your words on or off,
   * for an event while Caw is on. Undefined for an event while he is off.
   * Callers at once share one start; `started` says whether this call's
   * event went out with it, as the send `sent`.
   */
  const leadFor = async (
    projectId: string,
    event: string,
    by: Origin,
    routine?: string,
    person?: PersonSend
  ): Promise<
    | { row: InstanceRow; sent?: string | undefined; started: boolean }
    | undefined
  > => {
    const project = projectOf(projectId);
    if (by === "event" && !project.caw) {
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
    const start = startLead(project, event, routine, person).finally(() =>
      starting.delete(projectId)
    );
    const shared = start.then((made) => made.lead);
    // A start that fails is the starter's to answer; those sharing it hear it too.
    shared.catch(() => undefined);
    starting.set(projectId, shared);
    const begun = await start;
    return { row: begun.lead, sent: begun.sent, started: true };
  };

  /**
   * Past its spend cap the project's Caw takes no turn: true for an event,
   * which stays in its thread; your words are refused with the cap's
   * sentence (a thread's words are refused before they are kept,
   * `listening`). `settle` publishes the wake's thread row either way.
   */
  const capHolds = (
    projectId: string,
    by: Origin,
    settle: () => void
  ): boolean => {
    const capped = caps.quiets(projectId);
    if (capped === undefined) {
      return false;
    }
    settle();
    if (by === "you") {
      refuse(409, capped);
    }
    return true;
  };

  /**
   * What a wake says: the event, where it was noted, and, with Jev off, the
   * batch of the project's untriaged tasks every wake carries (§5.9 Triage).
   */
  const wakeWords = async (
    projectId: string,
    event: CawEvent,
    threadId: string | undefined
  ): Promise<string> => {
    const noted =
      event.note && threadId
        ? `${event.text}\n\n(Noted in thread ${threadId}; answer there with thread_reply when the person should hear of it.)`
        : event.text;
    const triaging = await triage(projectId).catch((error: unknown) => {
      console.warn(
        `[caw] ${projectId}: this wake carries no triage batch: the tasks did not read: ${error instanceof Error ? error.message : String(error)}`
      );
    });
    return triaging ? `${noted}\n\n---\n\n${triaging}` : noted;
  };

  /**
   * The one way anything wakes a project's Caw (§5.3: your message, your ask
   * for a view, the project's setup; an attempt landing or failing, a
   * needs-you item; routines, GitHub events and check results call it the
   * same way). Its note goes into its thread first; then one message to
   * Caw's session, starting the session when it has none, and that thread
   * follows the turn. Your words wake him on or off; an event, only while he
   * is on. There is no timer behind it. Answers whether a model was woken.
   */
  const wake = async (projectId: string, event: CawEvent): Promise<boolean> => {
    // The thread's row goes out once, with the status this wake leaves it in.
    const settle = (id: string | undefined) =>
      upsert(id ? db.thread(id) : undefined);
    if (event.by === "event" && !projectOf(projectId).caw) {
      settle(event.threadId);
      return false;
    }
    const threadId = event.note
      ? noteIn(projectId, event.threadId, event.note, false)
      : event.threadId;
    if (capHolds(projectId, event.by, () => settle(threadId))) {
      return false;
    }
    const words = await wakeWords(projectId, event, threadId);
    // Inbound events no route took ride on this wake (ingress.ts): taken
    // now, given back when the wake does not go out.
    const inbox = db.ingress.claimInbox(projectId, new Date());
    const text =
      inbox.length > 0 ? `${words}\n\n---\n\n${inboxText(inbox)}` : words;
    const giveBack = () =>
      db.ingress.releaseInbox(inbox.map((line) => line.id));
    let lead: Awaited<ReturnType<typeof leadFor>>;
    try {
      lead = await leadFor(
        projectId,
        text,
        event.by,
        event.routine,
        event.send
      );
      // His place's boundary read again before he reads this: what became
      // only its owner's since it started is hidden from him too.
      await placeFresh(lead);
    } catch (error) {
      giveBack();
      settle(threadId);
      throw error;
    }
    if (!lead) {
      giveBack();
      settle(threadId);
      return false;
    }
    const sent = lead.started
      ? lead.sent
      : message(lead.row, text, event.routine, event.send);
    if (!sent) {
      // His session refused it: nothing woke him, and the thread is not his.
      giveBack();
      settle(threadId);
      return false;
    }
    wakeSent(sent, sourceOf(event, inbox.length));
    if (threadId) {
      follow(lead.row.id, projectId, event.by, sent, { threadId });
    }
    return true;
  };

  /**
   * A standing lead's place boundary, ensured on his machine again
   * ({@link CawDeps.refreshPlace}): its policy is read anew, so files only
   * their owner may read that appeared since it started are hidden too. A
   * lead started for this wake has just had it ensured by his spawn.
   */
  const placeFresh = async (
    lead: Awaited<ReturnType<typeof leadFor>>
  ): Promise<void> => {
    if (lead && !lead.started) {
      await refreshPlace(lead.row);
    }
  };

  /** Logs a wake that failed: an event is never lost silently. */
  const wakeQuietly = (projectId: string, event: CawEvent): void => {
    wake(projectId, event).catch((error: unknown) =>
      console.warn(
        `[caw] ${projectId}: Caw was not woken: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

  /** Ends the project's Caw session and clears the lead: his harness or model moved. */
  const retire = (project: ReturnType<typeof projectOf>): void => {
    if (project.leadInstanceId) {
      unfollow(project.leadInstanceId);
      turnEnded(
        project.leadInstanceId,
        "Caw's session was replaced before he said how the run went",
        project.id
      );
      end(project.leadInstanceId);
    }
    db.setProjectCaw(project.id, { leadInstanceId: null });
  };

  /**
   * Caw's own turn now, when an event started it: his session is in a turn
   * none of your words are in (a busy lead with no turn followed here was
   * woken by a report or an ask reaching him as the lead). Your turn is not
   * his own: it runs to its end whatever becomes of him.
   */
  /** What a turn answers, in words: its thread, else who woke it; undefined when unknown. */
  const answering = (turn: Turn | undefined): string | undefined => {
    const thread = turn?.threadId ? db.thread(turn.threadId) : undefined;
    if (thread) {
      return `Answering “${thread.title}”`;
    }
    return turn?.what ? `Answering ${turn.what}` : undefined;
  };

  const eventTurn = (
    project: ReturnType<typeof projectOf>
  ): CawRunning | undefined => {
    const lead = standing(project);
    const turn = lead ? turns.get(lead.id) : undefined;
    if (!(lead && inTurn(lead.id)) || turn?.by === "you") {
      return;
    }
    return {
      id: lead.id,
      kind: "turn",
      title: answering(turn) ?? "Answering an event",
      cwd: lead.cwd,
      machineId: lead.machineId,
      offline: false,
      parentId: null,
      taskId: null,
    };
  };

  /**
   * What Caw started that still runs: the project's running sessions (as
   * its forget lists them) whose delegation chain tops at him, each with
   * what it is, and his own turn an event started. Rows under him stand at
   * the top.
   */
  const initiated = (project: ReturnType<typeof projectOf>): CawRunning[] => {
    const lead = project.leadInstanceId;
    const listed = stops.running(project.id).filter((session) => {
      const own = session.id === lead ? undefined : row(session.id);
      return Boolean(
        own?.parentInstanceId && topsAtCaw(db, own.parentInstanceId, project)
      );
    });
    const ids = new Set(listed.map((session) => session.id));
    const rows = listed.map((session): CawRunning => {
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
      };
    });
    const turn = eventTurn(project);
    return turn ? [turn, ...rows] : rows;
  };

  /** Cuts Caw's own turn: its row reads stopped at the idle pulse that follows. */
  const halt = (project: ReturnType<typeof projectOf>): void => {
    const turn = eventTurn(project);
    if (!turn) {
      return;
    }
    cut.set(turn.id, project.id);
    interrupt(turn.id);
    endTurn(turn.id);
    console.log(
      `[caw] ${project.name}: turned off; cut the turn an event started (${turn.id})`
    );
  };

  /**
   * Caw turned off: what he started that still runs finishes or stops, as
   * you choose; you are asked whenever something runs, so nothing is cut,
   * or left running, unseen. `finish` lets it all run to its end, his own
   * turn included: his own work is marked `kept`, so it is carried past an
   * account's limit and its end is noted in his thread without waking him.
   * `stop` stops those sessions through the forget's stop path, each row
   * confirmed as its machine ends it, and cuts his own turn. His session
   * stays, resting, for your next words (a session between turns costs
   * nothing).
   */
  const turnOff = (
    project: ReturnType<typeof projectOf>,
    choice: CawInitiated | undefined
  ): void => {
    const running = initiated(project);
    if (running.length > 0 && !choice) {
      refuse(
        409,
        `Caw started ${running.length === 1 ? "1 thing that is" : `${running.length} things that are`} still running. Choose whether they finish or stop, then turn him off.`
      );
    }
    const sessions = running.filter((one) => one.kind !== "turn");
    if (choice === "stop") {
      stops.stop(
        project.id,
        sessions.map((one) => one.id)
      );
      halt(project);
      return;
    }
    for (const one of sessions) {
      const itemId = row(one.id)?.workItemId;
      if (itemId && db.workItem(itemId)?.origin === "event") {
        db.updateWorkItem(itemId, { origin: "kept" });
      }
    }
    // His own turn finishes too: what he starts in it is kept work.
    if (running.some((one) => one.kind === "turn")) {
      keepTurn(project);
    }
  };

  /**
   * His own turn is kept as you turn him off, where it stands: on its
   * thread, or, woken by none, on his panel. A busy turn the hub had no
   * record of is recorded now, under way, so the idle after it ends it.
   */
  const keepTurn = (project: ReturnType<typeof projectOf>): void => {
    const lead = standing(project);
    if (!lead) {
      return;
    }
    const turn = turns.get(lead.id);
    keep(
      lead.id,
      turn
        ? { ...turn, by: joined(turn.by, "kept") }
        : {
            by: "kept",
            projectId: project.id,
            reading: [],
            started: true,
            waiting: {},
          }
    );
  };

  /**
   * The thread an attempt's end is noted in, and its report follows: the
   * one that named its task, else the project's newest; kept by item, as
   * its note ({@link attemptEnded}) and its report reaching Caw
   * ({@link heard}) come in either order: the second of them takes it.
   */
  const attemptThreads = new Map<string, string>();
  const attemptThread = (
    projectId: string,
    item: WorkItemRow
  ): string | undefined => {
    const known = attemptThreads.get(item.id);
    if (known) {
      attemptThreads.delete(item.id);
      return known;
    }
    const found =
      db.threadOfTask(projectId, item.taskId ?? "")?.id ??
      db.newestThread(projectId)?.id;
    if (found) {
      attemptThreads.set(item.id, found);
      // One whose other half never comes (a report that reached someone
      // else) is let go with the oldest.
      for (const old of attemptThreads.keys()) {
        if (attemptThreads.size <= ATTEMPT_THREADS_KEPT) {
          break;
        }
        attemptThreads.delete(old);
      }
    }
    return found;
  };

  /** What an item's end reads in a thread: its report, or why it failed. */
  const reportOf = (item: WorkItemRow): string =>
    (item.state === "done"
      ? (item.digest ?? item.result ?? "")
      : (item.error ?? "")
    )
      .trim()
      .slice(0, 2000);

  /** An item's end as the note in a thread: an attempt at its task, or a delegate. */
  const endNote = (item: WorkItemRow) => ({
    title: item.taskId
      ? `Attempt · ${item.taskId} ${ENDED[item.state] ?? item.state}`
      : `Delegate · ${item.title} ${ENDED[item.state] ?? item.state}`,
    body: reportOf(item),
  });

  /**
   * An attempt at a task ended: noted in the thread that named the task
   * ({@link attemptThread}), or Caw starts for it when he `hears` it and
   * has no session. With a session, its report reaching him is the wake
   * that thread follows ({@link heard}).
   */
  const attemptEnded = (
    project: ReturnType<typeof projectOf>,
    item: WorkItemRow,
    hears: boolean,
    by: Origin
  ): void => {
    const taskId = item.taskId ?? "";
    const report = reportOf(item);
    const event: CawEvent = {
      by,
      text: `The attempt at ${taskId} (“${item.title}”) ended ${item.state}.${report ? `\n\n${report}` : ""}`,
      threadId: db.threadOfTask(project.id, taskId)?.id,
      note: endNote(item),
    };
    if (hears && !project.leadInstanceId) {
      wakeQuietly(project.id, event);
      return;
    }
    noteIn(project.id, attemptThread(project.id, item), endNote(item));
  };

  const view = (projectId: string): CawView => {
    const project = projectOf(projectId);
    const turn = project.leadInstanceId
      ? turns.get(project.leadInstanceId)
      : undefined;
    return {
      on: project.caw,
      answering: turn && !turn.threadId ? (answering(turn) ?? null) : null,
      harness: project.cawHarness,
      model: project.cawModel,
      leadInstanceId: project.leadInstanceId,
      problem: problemOf(project),
      running: initiated(project),
      spendUsd: db.cawSpentSince(projectId, 0),
    };
  };

  /** The thread, refused when it is not the project's. */
  const threadIn = (projectId: string, threadId: string): ThreadRow => {
    const thread = db.thread(threadId);
    return thread && thread.projectId === projectId
      ? thread
      : refuse(404, `The project has no thread ${threadId}.`);
  };

  /** What Caw reads when you write: the thread, and your words. */
  const yourWords = (thread: ThreadRow, body: string, first: boolean) =>
    `${first ? "You started a thread" : "You wrote in the thread"} “${thread.title}” (thread ${thread.id}):\n\n${body}\n\nAnswer with thread_reply({ thread: "${thread.id}", body }).`;

  /** What Caw reads when you ask for a view: your words, then how a view is written. */
  const viewRequest = (thread: ThreadRow, body: string) =>
    `Event view-request: you asked for a view in the thread “${thread.title}” (thread ${thread.id}):\n\n${body}\n\nDraft it with view_draft({ name, source }), then tell the person in that thread with thread_reply.\n\n# How a view is written\n\n${VIEW_PROMPT}`;

  /**
   * Refuses your words before they are kept when Caw cannot read them: he
   * cannot start (no machine for him), or the project is past its spend cap.
   * On or off, anything else reaches him, so your words are always read.
   */
  const listening = (projectId: string) => {
    const project = projectOf(projectId);
    const problem = problemOf(project);
    if (problem) {
      refuse(409, problem);
    }
    const capped = caps.quiets(projectId);
    if (capped) {
      refuse(409, capped);
    }
  };

  const bodyOf = (body: string): string =>
    body.trim() || refuse(400, "A message needs words.");

  /** A project's threads, newest first. */
  const threads = (projectId: string): ThreadSummary[] => {
    projectOf(projectId);
    return db.projectThreads(projectId).map(summaryOf);
  };

  /** A thread and its messages, oldest first. */
  const read = (projectId: string, threadId: string): ThreadRead => {
    const thread = threadIn(projectId, threadId);
    return {
      thread: summaryOf(thread),
      messages: db.threadMessages(thread.id).map(messageOf),
    };
  };

  /**
   * "Make a note: …" in a thread: the rest of your words go straight into
   * AGENTS.md as your commit (memory.ts). No model is woken: there is
   * nothing for Caw to do with it. Answers the commit.
   */
  const noteInAgents = async (
    projectId: string,
    body: string
  ): Promise<string> => {
    try {
      return (await makeNote(projectId, body.replace(MAKE_A_NOTE, ""))).sha;
    } catch (error) {
      const code = (error as { status?: unknown }).status;
      if (code === 400 || code === 404 || code === 409) {
        return refuse(code, (error as Error).message);
      }
      throw error;
    }
  };

  /** The thread's word on a note you made. */
  const notedLine = (sha: string) => ({
    title: "AGENTS.md · noted",
    body: `Added to AGENTS.md as your commit ${sha.slice(0, 9)}.`,
  });

  /** A message id the dashboard chose is a new one: a second send of it is refused. */
  const unsaid = (id: string | undefined): void => {
    if (id && db.threadMessage(id)) {
      refuse(409, "That message is already in its thread.");
    }
  };

  /**
   * Starts a thread with your first message, to every dashboard; the wake
   * that follows publishes its row. `id` is the message's, when the
   * dashboard chose it (see `say`).
   */
  const open = (projectId: string, body: string, id?: string) => {
    const made = db.createThread({
      id: crypto.randomUUID(),
      projectId,
      title: titleFrom(body),
      first: { author: "you", body, ...(id ? { id } : {}) },
    });
    return { row: made.thread, said: said(made.thread, made.message, false) };
  };

  /**
   * Wakes the project's Caw with its setup event: your words (your prompt,
   * or the offer you accepted), so on or off. When Caw cannot start for a
   * reason the thread already states (no machine online: the thread's
   * composer says so), nothing is added; any other failure, the spend cap's
   * included, is noted in it. `machineOnline` tries again.
   */
  const wakeForSetup = (
    project: ReturnType<typeof projectOf>,
    threadId: string,
    from: "prompt" | "offer",
    template: StagesTemplate | null
  ): void => {
    wake(project.id, {
      by: "you",
      threadId,
      text: setupEvent({
        askFleet: !fleetChoicesSet(),
        from,
        projectName: project.name,
        template,
        threadId,
      }),
    }).catch((error: unknown) => {
      // No machine for him (the composer says so), or the project was
      // deleted meanwhile: nothing to say.
      if (!db.project(project.id)) {
        return;
      }
      if (
        error instanceof CawRefusal &&
        error.status === 409 &&
        !caps.quiets(project.id)
      ) {
        return;
      }
      noteIn(project.id, threadId, {
        title: "Caw · could not start",
        body: error instanceof Error ? error.message : String(error),
      });
    });
  };

  /** The template the project's stages.md is, word for word; null when it is its own or there is none. */
  const templateOf = async (
    projectId: string
  ): Promise<StagesTemplate | null> => {
    try {
      const { content } = await readFolderFile(projectId, STAGES_FILE);
      return TEMPLATES.find((name) => templateText(name) === content) ?? null;
    } catch (error) {
      if (error instanceof FolderRefusal && error.status === 404) {
        return null;
      }
      throw error;
    }
  };

  /** The lead session `actor` is, when it is its project's lead. */
  const leadOf = (actor: InstanceRow | undefined) => {
    const projectId = actor?.projectId;
    const project = projectId ? db.project(projectId) : undefined;
    return actor &&
      actor.role === "lead" &&
      project &&
      project.leadInstanceId === actor.id
      ? project
      : undefined;
  };

  /**
   * The thread your words sent straight to Caw's session belong to: the one
   * his parked question stands in (you are answering beside it), else the
   * one his turn under way answers, else the one he answered last, else the
   * project's newest; none when the project has no thread yet.
   */
  const threadOfLead = (
    leadId: string,
    projectId: string
  ): string | undefined => {
    const asked = asks().find((ask) => ask.instanceId === leadId)?.payload as
      | { threadId?: string }
      | undefined;
    return [
      asked?.threadId,
      turns.get(leadId)?.threadId,
      answered.get(leadId),
      db.newestThread(projectId)?.id,
    ].find(
      (id): id is string => !!id && db.thread(id)?.projectId === projectId
    );
  };

  const api = {
    /**
     * The lead an attempt nobody asked for reports to (dispatch.ts): its Caw
     * session, started for that attempt when it has none.
     */
    lead: async (
      projectId: string,
      by: Origin
    ): Promise<InstanceRow | undefined> =>
      (
        await leadFor(
          projectId,
          by === "you"
            ? "The person is starting an attempt at a task of the project; its report comes to you."
            : "The hub is starting an attempt at a task of the project; its report comes to you.",
          by
        )
      )?.row,
    wake,
    view,

    /**
     * Whose turn the project's Caw `instanceId` is in, for what he starts in
     * it (work-items `origin`): `you` once your words are in it, `kept` once
     * you let his own turn finish as you turned him off, else `event`;
     * undefined for a session that is no project's lead.
     */
    turnOrigin(instanceId: string): WorkOrigin | undefined {
      if (!leadOf(row(instanceId))) {
        return;
      }
      return turns.get(instanceId)?.by ?? "event";
    },

    /**
     * A routine's note (routines.ts) in the routine's own thread: `threadId`
     * while it is still one of the project's, else a new thread that opens
     * with the note. Wakes no model, Caw on or off. Answers the thread.
     */
    notice(
      projectId: string,
      threadId: string | null,
      note: { body?: string; title: string }
    ): string {
      projectOf(projectId);
      const thread = threadId ? db.thread(threadId) : undefined;
      if (thread && thread.projectId === projectId) {
        return noteIn(projectId, thread.id, note);
      }
      const made = db.createThread({
        id: crypto.randomUUID(),
        projectId,
        title: titleFrom(note.title),
        first: {
          author: "event",
          body: note.body?.trim() ?? "",
          noteTitle: note.title,
        },
      });
      said(made.thread, made.message);
      return made.thread.id;
    },

    /**
     * What the project has spent: today and this month in the hub's zone,
     * its Caw's share, each task's attempts and each thread's wakes.
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
        threads: spent.threads.filter(
          (thread) => thread.usd > 0 || thread.wakes > 0
        ),
        attempts: [...byTask.values()]
          .filter((attempt) => attempt.usd > 0 || attempt.lastAt >= monthStart)
          .sort((a, b) => b.lastAt - a.lastAt),
      };
    },

    /**
     * Turns Caw on or off, or moves it to another harness or model. Off,
     * with anything he started still running, needs `initiated`: it
     * finishes or stops ({@link turnOff}); refused without it. A move ends
     * the lead he had. A harness of its own takes its own default model
     * unless the change names one.
     */
    configure(
      projectId: string,
      change: {
        harness?: string;
        initiated?: CawInitiated;
        model?: string | null;
        on?: boolean;
      }
    ): CawView {
      const project = projectOf(projectId);
      if (change.harness !== undefined) {
        try {
          cawDenied(change.harness);
        } catch (error) {
          refuse(400, (error as Error).message);
        }
      }
      const harness = (change.harness as CawHarness | undefined) ?? undefined;
      const on = change.on ?? project.caw;
      const rehomed = harness !== undefined && harness !== project.cawHarness;
      const model = modelAfter(project.cawModel, change.model, rehomed);
      const moved = rehomed || model !== project.cawModel;
      if (!on && project.caw) {
        turnOff(project, change.initiated);
      }
      if (moved) {
        retire(project);
      }
      db.setProjectCaw(projectId, {
        caw: on,
        cawModel: model,
        ...(harness ? { cawHarness: harness } : {}),
      });
      return view(projectId);
    },

    threads,
    read,

    /** Every project's threads, newest first, by project: the fleet read the rail takes. */
    allThreads(): Record<string, ThreadSummary[]> {
      const byProject: Record<string, ThreadSummary[]> = {};
      for (const thread of db.allThreads()) {
        const list = byProject[thread.projectId] ?? [];
        list.push(summaryOf(thread));
        byProject[thread.projectId] = list;
      }
      return byProject;
    },

    /**
     * Starts a thread with your first message, and wakes Caw with it; "Make a
     * note: …" goes to AGENTS.md instead. `person`: the send to his session it
     * came as ({@link personSent}).
     */
    async start(
      projectId: string,
      raw: string,
      id?: string,
      person?: PersonSend
    ): Promise<ThreadSaid> {
      const body = bodyOf(raw);
      unsaid(id);
      if (MAKE_A_NOTE.test(body)) {
        projectOf(projectId);
        const sha = await noteInAgents(projectId, body);
        const opened = open(projectId, body, id);
        noteIn(projectId, opened.row.id, notedLine(sha));
        return { ...opened.said, thread: summaryOf(opened.row) };
      }
      listening(projectId);
      const opened = open(projectId, body, id);
      await wake(projectId, {
        by: "you",
        text: yourWords(opened.row, body, true),
        threadId: opened.row.id,
        ...(person ? { send: person } : {}),
      });
      return { ...opened.said, thread: summaryOf(opened.row) };
    },

    /**
     * Adds your message to a thread, and wakes Caw with it ("Make a note: …"
     * goes to AGENTS.md instead, waking nobody). `id` is the
     * message's when the dashboard chose it, as a session's composer does:
     * the row your words fly into is then the one they went out as, however
     * soon the hub's frame draws it. `person`: the send to his session it
     * came as ({@link personSent}).
     */
    async say(
      projectId: string,
      threadId: string,
      raw: string,
      id?: string,
      person?: PersonSend
    ): Promise<ThreadSaid> {
      const body = bodyOf(raw);
      threadIn(projectId, threadId);
      unsaid(id);
      if (MAKE_A_NOTE.test(body)) {
        const sha = await noteInAgents(projectId, body);
        const added = db.addThreadMessage({
          threadId,
          author: "you",
          body,
          ...(id ? { id } : {}),
        });
        const out = said(added.thread, added.message, false);
        noteIn(projectId, threadId, notedLine(sha));
        return { ...out, thread: summaryOf(added.thread) };
      }
      listening(projectId);
      const added = db.addThreadMessage({
        threadId,
        author: "you",
        body,
        ...(id ? { id } : {}),
      });
      const out = said(added.thread, added.message, false);
      await wake(projectId, {
        by: "you",
        text: yourWords(added.thread, body, false),
        threadId,
        ...(person ? { send: person } : {}),
      });
      return { ...out, thread: summaryOf(added.thread) };
    },

    /**
     * Your words sent straight to Caw's session (server.ts `deliverSend`):
     * his session's composer in the app, a push's Reply, Telegram, a relay.
     * Everything you say to him is a thread's, so they go into the thread he
     * is in ({@link threadOfLead}, a new one when the project has none) by
     * the thread's own path, and wake him from there under the send's uuid:
     * the row your screen drew of them is the wake's. Undefined when
     * `payload` is not to a project's Caw; resolved at once when its words
     * are in a thread already (the same send again).
     */
    personSent(payload: SendPayload): Promise<unknown> | undefined {
      const project = leadOf(row(payload.instanceId));
      if (!project) {
        return;
      }
      const sent = payload.message;
      if (db.threadMessage(sent.uuid)) {
        return Promise.resolve();
      }
      const person: PersonSend = {
        uuid: sent.uuid,
        carried: {
          ...(payload.images?.length ? { images: payload.images } : {}),
          ...(payload.attachments?.length
            ? { attachments: payload.attachments }
            : {}),
          ...(payload.urgent ? { urgent: true } : {}),
        },
      };
      const words = wordsOf(sent.message.content);
      const threadId = threadOfLead(payload.instanceId, project.id);
      return threadId
        ? api.say(project.id, threadId, words, sent.uuid, person)
        : api.start(project.id, words, sent.uuid, person);
    },

    /**
     * Words a session said in plain text, in its main loop (server.ts, each
     * assistant frame): a lead's, in a turn under way, are kept for the
     * threads of yours it may leave unanswered ({@link answerUnreplied}).
     */
    spoke(instanceId: string, words: string): void {
      speech.get(instanceId)?.words.push(words);
    },

    /**
     * Words said to and by Caw that missed their thread, written into it at
     * the times they were said, oldest first, through the thread's own
     * storage; then a note from the hub saying so (thread-repair.ts).
     */
    restore(
      threadId: string,
      lines: { at: Date; author: "you" | "caw"; body: string }[],
      note: { body: string; title: string }
    ): void {
      const thread = db.thread(threadId);
      if (!thread) {
        return;
      }
      for (const line of lines) {
        const added = db.addThreadMessage({
          threadId,
          author: line.author,
          body: line.body,
          createdAt: line.at,
        });
        said(added.thread, added.message);
      }
      noteIn(thread.projectId, threadId, note);
    },

    /** "Ask Caw for a view": a new thread with your words, and Caw woken by `view-request`. */
    async requestView(projectId: string, raw: string): Promise<ThreadSaid> {
      const body = bodyOf(raw);
      listening(projectId);
      const opened = open(projectId, body);
      await wake(projectId, {
        by: "you",
        text: viewRequest(opened.row, body),
        threadId: opened.row.id,
      });
      return { ...opened.said, thread: summaryOf(opened.row) };
    },

    /**
     * A project made with Caw (New project, an accepted offer): its Setup
     * thread, opened with your prompt (`promptId`, the id the dashboard sent
     * it as, so your words fly into their row) or a note of where it came
     * from, and Caw woken once to set the project up (setup.ts). A Caw that
     * cannot start is noted in the thread: the project stands either way.
     */
    setup(
      projectId: string,
      ask: {
        /** The note a project without a prompt opens with (an offer's). */
        note?: { body?: string; title: string };
        prompt?: string;
        promptId?: string;
        template: StagesTemplate | null;
      }
    ): ThreadSummary {
      const project = projectOf(projectId);
      const prompt = ask.prompt?.trim();
      unsaid(ask.promptId);
      const made = db.createThread({
        id: crypto.randomUUID(),
        projectId,
        title: `Set up ${project.name}`,
        setup: true,
        first: prompt
          ? {
              author: "you",
              body: prompt,
              ...(ask.promptId ? { id: ask.promptId } : {}),
            }
          : {
              author: "event",
              body: ask.note?.body?.trim() ?? "",
              noteTitle: ask.note?.title ?? `Project · ${project.name} made`,
            },
      });
      said(made.thread, made.message, false);
      wakeForSetup(
        project,
        made.thread.id,
        prompt ? "prompt" : "offer",
        ask.template
      );
      return summaryOf(made.thread);
    },

    /**
     * A machine came online: a project whose Setup thread Caw never answered
     * (none was online when it was made, or his session went with its
     * machine) is set up now, on or off: setting it up was your ask.
     */
    machineOnline(): void {
      for (const thread of db.allThreads()) {
        const project = thread.setup ? db.project(thread.projectId) : undefined;
        if (
          !project ||
          standing(project) ||
          starting.has(project.id) ||
          db.threadMessages(thread.id).some((each) => each.author === "caw")
        ) {
          continue;
        }
        const [first] = db.threadMessages(thread.id);
        templateOf(project.id).then(
          (template) =>
            wakeForSetup(
              project,
              thread.id,
              first?.author === "you" ? "prompt" : "offer",
              template
            ),
          (error: unknown) =>
            console.warn(
              `[caw] ${project.name}: its setup was not retried: ${error instanceof Error ? error.message : String(error)}`
            )
        );
      }
    },

    /**
     * A machine went away: the turns its leads were in are over, so no
     * thread of theirs reads `working`, and the routine runs they had fail.
     */
    machineGone(machineId: string): void {
      for (const instanceId of [...turns.keys()]) {
        if (row(instanceId)?.machineId === machineId) {
          unfollow(instanceId);
        }
      }
      for (const project of db.listProjects()) {
        const lead = project.leadInstanceId
          ? row(project.leadInstanceId)
          : undefined;
        if (lead?.machineId === machineId) {
          turnEnded(
            lead.id,
            "Caw's machine went away before he said how the run went",
            project.id
          );
        }
      }
      // A turn cut as Caw was turned off, on a machine gone before the cut
      // was confirmed: its row says so, rather than waiting for ever.
      for (const [instanceId, projectId] of [...cut]) {
        if (row(instanceId)?.machineId === machineId) {
          cut.delete(instanceId);
          publish({
            kind: "project.stop",
            projectId,
            instanceId,
            outcome: "failed",
            error:
              "His machine went away before his turn stopped; it may still be running there. Check the machine.",
          });
        }
      }
    },

    /**
     * A task changed: one that entered a stage of kind `you` by anyone but
     * Caw or you wakes Caw (a needs-you item), noted in the thread that
     * named the task.
     */
    taskChanged(event: TaskEvent): void {
      if (
        event.kind === "changed" ||
        event.actor.mover === "lead" ||
        event.actor.mover === "you" ||
        !db.project(event.projectId)?.caw
      ) {
        return;
      }
      const { projectId, id } = event;
      task(projectId, id)
        .then((waiting) => {
          if (waiting.kind === "you") {
            wakeQuietly(projectId, {
              by: "event",
              text: `${waiting.id} “${waiting.title}” now waits for the person in ${waiting.stage}.`,
              threadId: db.threadOfTask(projectId, waiting.id)?.id,
              note: {
                title: `Task · ${waiting.id} waits for you in ${waiting.stage}`,
                body: waiting.title,
              },
            });
          }
        })
        .catch(() => undefined);
    },

    /**
     * A work item of the project ended. Caw hears it when it is your work
     * (on or off), or while he is on.
     * - An attempt at a task is noted in the thread that named the task.
     *   With a Caw session, its report reaches him as the lead (work-items
     *   `reportees`), and that thread follows the turn; with none yet, he
     *   starts and hears it here.
     * - A delegate's report reaches him through the send path, which says
     *   whose turn it starts ({@link heard}).
     * - His own work you let finish as you turned him off (`kept`), ending
     *   while he is off: noted in its thread, waking nobody.
     */
    itemEnded(item: WorkItemRow): void {
      const project = item.projectId ? db.project(item.projectId) : undefined;
      if (!project) {
        return;
      }
      const by: Origin = item.origin === "you" ? "you" : "event";
      const hears = by === "you" || project.caw;
      if (item.taskId && (hears || item.origin === "kept")) {
        attemptEnded(project, item, hears, by);
      } else if (!hears && item.origin === "kept") {
        noteIn(project.id, undefined, endNote(item));
      }
    },

    /**
     * A report or a question from `from` reached `leadId` (server.ts
     * `reportTo`, `deliverDelegateAsk`): when `leadId` is a project's Caw,
     * the turn it starts, or joins, is that work's (its item's origin; a
     * session's own ask is yours), and its send (`sent`, when the hub took
     * it) waits to be read as any wake does. An attempt's report is the wake
     * of the thread its end is noted in ({@link attemptThread}), which reads
     * `working` until the turn that reads it ends; anything else says `what`
     * it answers on his panel, never on a thread it would only be guessed
     * from.
     */
    heard(
      leadId: string,
      from: InstanceRow,
      what: string,
      sent: string | undefined,
      report: boolean
    ): void {
      const project = leadOf(row(leadId));
      if (!(project && sent)) {
        return;
      }
      const item = from.workItemId ? db.workItem(from.workItemId) : undefined;
      const by = item?.origin ?? "you";
      const threadId =
        report && item?.taskId && (item.origin === "you" || project.caw)
          ? attemptThread(project.id, item)
          : undefined;
      follow(leadId, project.id, by, sent, threadId ? { threadId } : { what });
    },

    /**
     * The thread a session's question goes to, when the session is its
     * project's lead: the one whose message woke this turn, else the
     * project's newest. Undefined for any other session.
     */
    askThread(asker: InstanceRow): string | undefined {
      const project = leadOf(asker);
      return project
        ? (turns.get(asker.id)?.threadId ?? db.newestThread(project.id)?.id)
        : undefined;
    },

    /**
     * One of his shell or edit calls, noted in the thread his turn answers,
     * else the project's newest (lead-gate.ts): nothing for a session that
     * is no project's lead.
     */
    noteCall(instanceId: string, note: { body?: string; title: string }): void {
      const project = leadOf(row(instanceId));
      if (!project) {
        return;
      }
      noteIn(
        project.id,
        turns.get(instanceId)?.threadId ?? answered.get(instanceId),
        note
      );
    },

    /** A question tagged to a thread was parked or settled: its status moved. */
    asksChanged(threadId: string): void {
      upsert(db.thread(threadId));
    },

    /** Your answer to the lead's question, as your message in its thread: the questions, and your choices or that you walked away. */
    answered(parked: Envelope, result: PermissionResult): void {
      const ask = parked.payload as PermissionRequestFrame;
      const thread = ask.threadId ? db.thread(ask.threadId) : undefined;
      const questions = questionsOf(ask.toolName, ask.input);
      if (!(thread && questions)) {
        return;
      }
      let answer: ThreadAnswer = { outcome: "dismissed" };
      let body = "";
      if (result.behavior === "allow") {
        const input = (result.updatedInput ?? {}) as {
          annotations?: Record<string, { notes?: string; preview?: string }>;
          answers?: UserAnswers;
        };
        const answers = input.answers ?? {};
        answer = {
          outcome: "answered",
          answers,
          ...(input.annotations ? { annotations: input.annotations } : {}),
        };
        body = Object.values(answers).flat().join(", ");
      }
      const added = db.addThreadMessage({
        threadId: thread.id,
        author: "you",
        body,
        question: {
          questions,
          ...(ask.toolUseId ? { toolUseId: ask.toolUseId } : {}),
        },
        answer,
      });
      said(added.thread, added.message);
    },

    /**
     * A session's idle pulse: a lead's turn that read a send ends
     * ({@link endTurn}), and so do the routine runs whose wake it read
     * (routines.ts). An idle before any read ends nothing: what woke him is
     * still to be read.
     */
    pulse(instanceId: string, busy: boolean): void {
      if (busy) {
        return;
      }
      turnEnded(
        instanceId,
        cut.has(instanceId)
          ? "Caw was turned off before he said how the run went"
          : undefined
      );
      cutConfirmed(instanceId);
      if (turns.get(instanceId)?.started) {
        endTurn(instanceId);
      }
    },

    sendLeft,

    /**
     * The thread a session started by the project's Caw works for: an
     * attempt at a task, the thread that named the task; anything else his
     * turn starts, the thread that turn answers. Undefined when `parentId`
     * is not a project's lead.
     */
    spawnThread(parentId: string, workItemId?: string): string | undefined {
      const project = leadOf(row(parentId));
      if (!project) {
        return;
      }
      const taskId = workItemId ? db.workItem(workItemId)?.taskId : undefined;
      const named = taskId
        ? db.threadOfTask(project.id, taskId)?.id
        : undefined;
      return named ?? turns.get(parentId)?.threadId ?? answered.get(parentId);
    },

    /**
     * A lead's turn completed with the session's cumulative cost so far
     * (`total_cost_usd`, called once per completed turn): the difference
     * from what was booked before is this turn's, and goes to the thread
     * that woke it. A session whose count started over (a resumed process)
     * books what it reports. A turn no thread woke, or one that is not a
     * thread's at all (`book` off: the cache keep-alive's), is booked to
     * none, and the baseline still moves, so the next turn's cost is its own.
     */
    turnCost(instanceId: string, totalUsd: number, book = true): void {
      const project = leadOf(row(instanceId));
      if (!(project && Number.isFinite(totalUsd))) {
        return;
      }
      const seen = project.leadCostSeen;
      const spent = totalUsd >= seen ? totalUsd - seen : totalUsd;
      db.setProjectCaw(project.id, { leadCostSeen: totalUsd });
      if (!book) {
        return;
      }
      // The turn this result closes: the one in flight, else the one whose
      // idle pulse came first. Spent once booked, so a later turn no thread
      // woke is never booked to this one.
      const threadId =
        turns.get(instanceId)?.threadId ?? answered.get(instanceId);
      answered.delete(instanceId);
      if (spent > 0) {
        db.bookCawTurn({
          harness: row(instanceId)?.harness ?? project.cawHarness,
          projectId: project.id,
          threadId: threadId ?? null,
          usd: spent,
        });
      }
    },

    /** A session's process ended: a lead's turn ends with it, and the routine runs it had. */
    sessionEnded(instanceId: string): void {
      unfollow(instanceId);
      turnEnded(
        instanceId,
        "Caw's session ended before he said how the run went",
        leadOf(row(instanceId))?.id
      );
      cutConfirmed(instanceId);
    },

    /** Caw's thread and view tools, for the session `actor`; refused to any session but its project's lead. */
    tools(actor: InstanceRow | undefined) {
      const mine = (): string => {
        const project = leadOf(actor);
        if (!project) {
          throw new Error(
            "Threads and views are the project lead's: this session is not its project's Caw."
          );
        }
        return project.id;
      };
      const ok = (data: unknown) => ({
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
      });
      return [
        tool(
          "thread_read",
          "Read your threads with the person: all, newest first with each last message; or one `thread`'s messages, oldest first.",
          { thread: z.string().optional() },
          ({ thread }) => {
            const projectId = mine();
            return Promise.resolve(
              ok(
                thread
                  ? read(projectId, thread)
                  : db
                      .projectThreads(projectId)
                      .map((listed: ThreadListRow) => ({
                        ...summaryOf(listed),
                        last: listed.last,
                      }))
              )
            );
          }
        ),
        tool(
          "thread_reply",
          "Answer the person in a thread: they read only what you say here.",
          {
            thread: z.string().describe("Its id."),
            body: z.string().trim().min(1).describe("Markdown."),
            tasks: z
              .array(z.string().regex(TASK_ID))
              .optional()
              .describe("Its tasks (tsk-12), shown as cards."),
            files: z
              .array(z.string().min(1))
              .max(FILES_MAX)
              .optional()
              .describe("Folder files you wrote."),
          },
          async ({ thread, body, tasks, files }) => {
            const projectId = mine();
            threadIn(projectId, thread);
            const named = files?.length
              ? await folderFiles(projectId, files)
              : [];
            // Awaited above: the thread again, in the step that writes to it.
            threadIn(projectId, thread);
            const added = db.addThreadMessage({
              threadId: thread,
              author: "caw",
              body,
              ...(tasks?.length ? { tasks: [...new Set(tasks)] } : {}),
              ...(named.length ? { files: named } : {}),
            });
            said(added.thread, added.message);
            if (actor) {
              speech.get(actor.id)?.replied.add(thread);
            }
            return ok({ ok: true, message: added.message.id });
          }
        ),
        tool(
          "folder_read",
          "Read a file, or list a folder (no path: the root), of your project's folder on the hub.",
          { path: z.string().optional() },
          async ({ path }) => {
            const projectId = mine();
            return ok(
              await folderCall(() =>
                readFolderFile(projectId, path ?? "").catch(
                  (error: unknown) => {
                    // No path, or a folder: its listing.
                    if (
                      error instanceof FolderRefusal &&
                      (error.status === 400 || error.status === 409)
                    ) {
                      return listFolder(projectId, path ?? "");
                    }
                    throw error;
                  }
                )
              )
            );
          }
        ),
        tool(
          "folder_write",
          "Write a text file to your project's folder on the hub, as a commit. stages.md must read cleanly.",
          {
            path: z.string().min(1),
            content: z.string().max(FOLDER_FILE_LIMIT),
          },
          async ({ path, content }) => {
            const projectId = mine();
            const rel = await folderCall(() => folderPath(path));
            const theirs = personsTier(rel);
            if (theirs) {
              throw new Error(`${rel} was not written: ${theirs}`);
            }
            if (rel === STAGES_FILE) {
              const reading = readStages(content);
              if (!reading.ok) {
                throw new Error(
                  `stages.md was not written: ${reading.problems.join(" ")}`
                );
              }
            }
            const written = await folderCall(() =>
              writeFolderFile(projectId, rel, content, {
                author: { name: "Caw" },
              })
            );
            folderChanged(projectId);
            const problems = rel.startsWith("delegates/")
              ? readProjectTypes(projectId).problems.filter(
                  (problem) => problem.path === rel
                )
              : [];
            return ok({
              ok: true,
              path: rel,
              sha: written.sha,
              ...(problems.length
                ? {
                    problems: problems.map((problem) => problem.problem),
                    note: `${rel} was written but does not make a delegate type yet; fix it and write it again.`,
                  }
                : {}),
            });
          }
        ),
        tool(
          "view_draft",
          "Draft a view for the person to keep or discard, written as the view-request event says. Components outside CawCo's library are dropped and named in the answer.",
          {
            name: z.string().describe("Like weekly-review."),
            source: z.string().min(1).describe("openui-lang, no fences."),
          },
          async ({ name, source }) => {
            const projectId = mine();
            const drafted = await folderCall(() =>
              views.draft(projectId, name, source, { name: "Caw" })
            );
            noteIn(
              projectId,
              actor ? turns.get(actor.id)?.threadId : undefined,
              { title: `View · Caw drafted “${drafted.name}”` }
            );
            return ok({
              ok: true,
              view: drafted.name,
              draft: true,
              ...(drafted.dropped.length
                ? {
                    dropped: drafted.dropped,
                    note: `CawCo's views have no ${drafted.dropped.join(", ")}: ${drafted.dropped.length > 1 ? "they are" : "it is"} left out of the view. Use only the components listed.`,
                  }
                : {}),
            });
          }
        ),
        tool(
          "view_query",
          "What a view's Query(tool, args) reads, for your project.",
          {
            tool: z.enum(VIEW_TOOLS),
            args: z.record(z.string(), z.unknown()).optional(),
          },
          async ({ tool: name, args }) => {
            const projectId = mine();
            return ok(
              await folderCall(() => views.query(projectId, name, args ?? {}))
            );
          }
        ),
      ];
    },
  };
  return api;
};

export type Caw = ReturnType<typeof createCaw>;

const answer = (error: unknown) => {
  if (error instanceof CawRefusal) {
    return status(error.status, error.message);
  }
  return status(502, error instanceof Error ? error.message : String(error));
};

const HARNESS = t.Union(CAW_HARNESSES.map((harness) => t.Literal(harness)));

/** Your words to Caw, and the id the dashboard sent them as (its own, like a session's). */
const YOUR_WORDS = t.Object({
  body: t.String(),
  id: t.Optional(t.String({ format: "uuid" })),
});

/** The routes for a project's Caw, its threads and your asks for views. */
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
          // Turning Caw off with what he started still running: it finishes or stops.
          initiated: t.Optional(
            t.Union([t.Literal("finish"), t.Literal("stop")])
          ),
          harness: t.Optional(HARNESS),
          model: t.Optional(t.Nullable(t.String())),
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
    .get("/api/projects/:id/spend", ({ params }) => {
      try {
        return caw.spend(params.id);
      } catch (error) {
        return answer(error);
      }
    })
    .get("/api/threads", () => caw.allThreads())
    .get("/api/projects/:id/threads", ({ params }) => {
      try {
        return caw.threads(params.id);
      } catch (error) {
        return answer(error);
      }
    })
    .post(
      "/api/projects/:id/threads",
      { body: YOUR_WORDS },
      async ({ params, body, request, server }) => {
        // Caw's session may be starting on a machine; that can take a while.
        server?.timeout(request, 0);
        try {
          return await caw.start(params.id, body.body, body.id);
        } catch (error) {
          return answer(error);
        }
      }
    )
    .get("/api/projects/:id/threads/:threadId", ({ params }) => {
      try {
        return caw.read(params.id, params.threadId);
      } catch (error) {
        return answer(error);
      }
    })
    .post(
      "/api/projects/:id/threads/:threadId/messages",
      { body: YOUR_WORDS },
      async ({ params, body, request, server }) => {
        server?.timeout(request, 0);
        try {
          return await caw.say(params.id, params.threadId, body.body, body.id);
        } catch (error) {
          return answer(error);
        }
      }
    )
    .post(
      "/api/projects/:id/view-requests",
      { body: t.Object({ text: t.String() }) },
      async ({ params, body, request, server }) => {
        server?.timeout(request, 0);
        try {
          return await caw.requestView(params.id, body.text);
        } catch (error) {
          return answer(error);
        }
      }
    );
