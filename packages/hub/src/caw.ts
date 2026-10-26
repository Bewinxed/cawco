/**
 * Caw, a project's lead (Projects spec §5.3, §5.6; D4, D13).
 *
 * - **A setting per project**: on or off, and the harness Caw runs on. On by
 *   default for a project made with Caw; off for every project from before.
 * - **You can always talk to him** (Caw on / Caw off): your
 *   message in a thread, your ask for a view and the project's setup start
 *   his session whether he is on or off. Only a reason he cannot start (no
 *   machine for him, {@link problemOf}) or the project's spend cap refuses
 *   your words, each with its sentence. On means only that he ALSO acts on
 *   his own: events wake him and he leads dispatch.
 * - **The lead is P1's lead.** `projects.lead_instance_id` names Caw's
 *   session; the attempts it starts (the dispatcher's, yours from the
 *   dashboard) and his own delegates report to it, and no other session's
 *   work does (work-items.ts `reportees`); he may answer, steer and stop the
 *   project's items. Only the hub sets
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
 *   project's newest conversation (never a routine's own thread).
 * - **Off**: no event wakes him and nothing he would do on his own spends.
 *   His session stays, resting between turns (it costs nothing so), so your
 *   next words carry on his context. A turn an event started is cut when he
 *   is turned off; one your words are in runs to its end. Attempt reports go
 *   to their parent alone (work-items.ts `reportees`), asks with no session
 *   to take them and failed attempts to you (push.ts), and the dispatcher
 *   starts nothing on its own. A move of harness or model ends his session.
 * - **Threads**: conversations with Caw, kept here; Caw answers with
 *   `thread_reply`. A thread is a target his session reads: it is addressed
 *   as `thread:<id>`, your words there are sends through the hub's one send
 *   path ({@link Caw.sent}), each waking him under its own uuid, and the hub
 *   serves the thread as a transcript (thread-transcript.ts). A thread's
 *   status is derived, never stored: `working` while the lead is busy on a
 *   turn that thread woke, `needs-you` while a question the lead asked in it
 *   is parked, else `ready`. The lead's question is tagged with its thread
 *   (server.ts) and your answer lands in it. Every change reaches open
 *   dashboards as `thread.upsert` frames and on the thread's stream.
 * - **Views**: Caw drafts a view with `view_draft` (views.ts), an OpenUI
 *   Lang program written to the prompt generated from CawCo's library
 *   (openui.ts `VIEW_PROMPT`, which your ask for a view carries), reading the
 *   view tools he can try with `view_query`; you keep or discard it. Asked
 *   for from a page's end, his draft stands on that page as a proposed
 *   block (blocks.ts); asked to change a kept view (`view-change`), he drafts
 *   the change under its name, and keeping it keeps the view's place.
 * - Each lead shows its spend: what every Caw session of the project has
 *   cost, from the usage buckets budgets already read.
 */

import { createHash } from "node:crypto";
import {
  BLOCK_PAGE_TITLES,
  BLOCK_PAGES,
  type BlockPage,
  BOARD_ONLY_DENIED_TOOLS,
  CAW_DENIED_TOOLS,
  CAW_NO_MACHINE,
  type CawInitiated,
  type CawRunning,
  type CawView,
  type ConnectionView,
  CURATOR_DENIED_TOOLS,
  type Envelope,
  type HarnessKind,
  handoffMarker,
  type InstanceRow,
  type ItemEnd,
  type NeutralOrigin,
  type PermissionMode,
  type ProjectSpend,
  type ProjectStopFrame,
  type ProjectView,
  type RelayProvider,
  type SendPayload,
  type SpawnPayload,
  STAGES_TEMPLATES,
  type StagesTemplate,
  sessionLink,
  type ThreadEvent,
  type ThreadNote,
  type ThreadStatus,
  type ThreadSummary,
  type ThreadUpsertFrame,
  taskLink,
  threadTargetOf,
  VIEW_TOOLS,
  type ViewAsked,
  viewTitle,
  type WorkspaceRef,
} from "@cawco/core";
import { sayNestedBoundaryFix } from "@cawco/core/boundary-nesting";
import { PLACE_SUFFIX } from "@cawco/core/workspace-policy";
import { Elysia, status, t } from "elysia";
import { z } from "zod";
import type { Blocks } from "./blocks";
import { topsAtCaw } from "./caw-own";
import type {
  DbShape,
  SentMessageRow,
  ThreadListRow,
  ThreadMessageRow,
  ThreadRow,
  WorkItemRow,
} from "./db";
import type { Origin, WorkOrigin } from "./db/schema";
import { sendWords } from "./db/words";
import { byHandle } from "./handles";
import { inboxText } from "./ingress";
import type { WakeSource } from "./lead-gate";
import { sentence, tool } from "./mcp-tool";
import { mediaBase64 } from "./media";
import { MAKE_A_NOTE, personsTier, ROUTINE_ORIGIN } from "./memory";
import { VIEW_PROMPT } from "./openui";
import {
  folderReadWords,
  folderWrittenWords,
  type ThreadLine,
  type ThreadLines,
  threadReadWords,
  threadRepliedWords,
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
import { roleOf } from "./roles";
import {
  type RelayOffer,
  SETUP_PARTS,
  type SetupAsk,
  type SetupPart,
  setupEvent,
} from "./setup";
import { readStages, templateText } from "./stages";
import type { TaskEvent, TaskView } from "./tasks";
import type { Views } from "./views";

/** A thread's handle as find and a chip write it: `thread#1a2b3c4d`. */
const THREAD_HANDLE_PREFIX = /^thread#/u;
/**
 * Where a view asked for from a page's end stands once drafted: that page,
 * at `position` in its order (null: its end).
 */
interface ViewPlace {
  page: BlockPage;
  position: number | null;
}

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
const CAW_HARNESSES = Object.keys(CAW_DENIED_TOOLS) as HarnessKind[];

/** Caw's denied tools on `harness`; refused on a harness whose shell and edit calls the hub's gate cannot decide. */
const cawDenied = (harness: string): readonly string[] => {
  if (!(harness in CAW_DENIED_TOOLS)) {
    throw new Error(
      `Caw does not run on ${harness}: it cannot put each of Caw's shell and edit calls to the hub first.`
    );
  }
  return CAW_DENIED_TOOLS[harness as HarnessKind];
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
 * {@link PLACE_SUFFIX}, which the machine's policy reads as a place
 * (workspace-policy.ts `isPlace`). None for any other row.
 */
export const leadPlaceRef = (
  row: Pick<InstanceRow, "role" | "projectId" | "machineId" | "cwd">
): WorkspaceRef | undefined =>
  row.role === "lead" && row.projectId
    ? {
        id: `${createHash("sha256")
          .update(`${row.projectId}\0${row.machineId}\0${row.cwd}`)
          .digest("hex")
          .slice(0, 8)}${PLACE_SUFFIX}`,
        path: row.cwd,
      }
    : undefined;

/**
 * The place a sheet's stage is named by for a session with no workspace of
 * its own (live components): Caw's place ({@link leadPlaceRef}); for any
 * other session, a place over the folder it works in, on its machine. The
 * machine runs the stage in that place's stage clone (agent stage-clone.ts):
 * a clone of the checkout at its HEAD with its uncommitted changes, kept in
 * step with it, in a boundary of its own, so the toolchain writes its own
 * tree and never the person's, while the session's own commands stay on the
 * host. Its id names the machine and folder, so every session there shares
 * one stage.
 */
export const stagePlaceRef = (
  row: Pick<InstanceRow, "role" | "projectId" | "machineId" | "cwd">
): WorkspaceRef =>
  leadPlaceRef(row) ?? {
    id: `${createHash("sha256")
      .update(`${row.machineId}\0${row.cwd}`)
      .digest("hex")
      .slice(0, 8)}${PLACE_SUFFIX}`,
    path: row.cwd,
  };

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
  /** What rode with your words (pictures, pastes, files), as a send carries it to his session. */
  carried?: Carried;
  note?: ThreadNote;
  /** The routine whose run this wake is (routines.ts): its turn is that run's, and a note in it is tainted (memory.ts). */
  routine?: string;
  /**
   * The person's own send this wake carries, by its uuid ({@link Caw.sent}):
   * the wake goes under it, so the send's record is the wake's.
   */
  send?: string;
  text: string;
  /** Its thread: the note goes there, and that thread is `working` while the turn it wakes runs. */
  threadId?: string;
}

/**
 * Whose a wake is, for his gate (lead-gate.ts): your words alone are yours;
 * an event, a routine, or outside events riding on it make it outside, and
 * an ask in its turn names which.
 */
const sourceOf = (event: CawEvent, inboxed: number): WakeSource => {
  if (event.routine) {
    return "routine";
  }
  if (event.by !== "you") {
    return "event";
  }
  return inboxed === 0 ? "owner" : "inbox";
};

/** What a send carries besides its words: pictures (base64) and attachments. */
export type Carried = Pick<SendPayload, "attachments" | "images">;

/** What a wake's message carries: the uuid of the person's send it is, and what rode with your words. */
interface Carry {
  carried?: Carried;
  uuid?: string;
}

/** What a wake's message carries, from its event. */
const carryOf = (event: CawEvent): Carry => ({
  ...(event.send ? { uuid: event.send } : {}),
  ...(event.carried ? { carried: event.carried } : {}),
});

/** A send's words: its text, or the text blocks of its content. */
const wordsOf = (content: SendPayload["message"]["message"]["content"]) =>
  typeof content === "string"
    ? content
    : content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n");

/** How long a thread's title runs: the first line of its first message, cut. */
const TITLE_MAX = 60;
const FIRST_LINE = /\r?\n/u;
const TASK_ID = /^tsk-\d{1,9}$/u;

/** The most files one reply names. */
const FILES_MAX = 40;
const STAGES_FILE = "stages.md";
/** A project's delegate types: Caw's write there is a proposal the person approves (memory.ts `proposeType`). */
const DELEGATES_DIR = "delegates/";
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

/** stages.md as Caw writes it, refused with what does not read. */
const stagesRead = (body: string | Uint8Array): void => {
  const reading = readStages(
    typeof body === "string" ? body : new TextDecoder().decode(body)
  );
  if (!reading.ok) {
    throw new Error(`stages.md was not written: ${reading.problems.join(" ")}`);
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

/** A note as a thread message's row: its line, its fold, and what it is. */
const eventRow = (note: ThreadNote) => ({
  author: "event" as const,
  body: note.body?.trim() ?? "",
  noteTitle: note.title,
  event: note.event,
});

/** A note as a wake carries it: its title over its body. */
const openedOf = (line: ThreadMessageRow): string =>
  [line.noteTitle, line.body].filter(Boolean).join("\n\n");

/**
 * The pictures a send carried, back as a wake carries them: each one's
 * bytes out of the media store (server.ts `envelopeOf` reads a pending send
 * the same way). Undefined when one is no longer stored. Its pastes and
 * files are in its words already, as its record keeps them.
 */
const picturesOf = (send: SentMessageRow): Carried | undefined => {
  const content = send.body?.message.content;
  const images: { mediaType: string; data: string }[] = [];
  for (const block of typeof content === "string" ? [] : (content ?? [])) {
    const { source } = block as {
      source?: { type?: string; url?: string; media_type?: string };
    };
    if (block.type !== "image" || source?.type !== "url" || !source.url) {
      continue;
    }
    const data = mediaBase64(source.url);
    if (!(data && source.media_type)) {
      return;
    }
    images.push({ mediaType: source.media_type, data });
  }
  return images.length > 0 ? { images } : {};
};

/** An attempt's end, in the word an event note reads. */
const ENDED: Record<ItemEnd, string> = {
  done: "landed",
  failed: "failed",
  cancelled: "was cancelled",
};

/** Which try at its task an attempt is, among the project's attempts: 1 for the first. */
export const attemptTry = (
  attempts: readonly WorkItemRow[],
  item: WorkItemRow
): number =>
  attempts.filter(
    (each) =>
      each.taskId === item.taskId &&
      each.createdAt.getTime() <= item.createdAt.getTime()
  ).length;

/** An ended item's state as its end; an item still live has none to note. */
const endOf = (item: WorkItemRow): ItemEnd => {
  if (item.state in ENDED) {
    return item.state as ItemEnd;
  }
  throw new Error(`work item ${item.id} is ${item.state}, not ended`);
};

/** Statuses a lead session cannot be woken from: its row is gone for good. */
const GONE: ReadonlySet<string> = new Set(["discarded"]);

/** What a thrown error says. */
const errorWords = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Why an event's wake goes no further while Caw is off. */
const CAW_OFF = "Caw is off: only your own words wake him.";

/** A thread's own row as `thread_read` reads it: Caw's reply, a note, or your answer to his question. */
const lineOf = (message: ThreadMessageRow): ThreadLine => {
  const at = message.createdAt.getTime();
  switch (message.author) {
    case "caw":
      return {
        at,
        author: "caw",
        body: message.body,
        ...(message.tasks?.length ? { tasks: message.tasks } : {}),
        ...(message.files?.length ? { files: message.files } : {}),
      };
    case "event":
      return {
        at,
        author: "event",
        noteTitle: message.noteTitle ?? "",
        ...(message.body ? { body: message.body } : {}),
      };
    case "you":
      break;
  }
  return { at, author: "you", body: message.body, answer: true };
};

/** A refusal a route answers with its status. */
class CawRefusal extends Error {
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
    "You have the project's board (task_read, task_create, task_update, task_link, task_start, task_retry, todo_write), its threads (thread_read, thread_reply), its views (view_draft, view_query), its folder on the hub (folder_read, folder_write: stages.md, decisions/, and delegates/, where a type you write is a proposal the person approves or declines before it is committed), decision pages (the decision-page skill: write decisions/<name>/page.oui, a program over the decision library, or decisions/<name>/page.html when a pick is not an option (a machine and folder from cawco.pickPlace, a field they edit), then artifact_create with kind page, the name, does: pick and an ask (one line in the person's words) builds and shows it; artifact_read has the picks; artifact_update's statements revise it; a decision's after naming another page's decision (page#id) links the two pages on the Decisions tab), delegate with the tools that steer the project's work (handoff, answer_delegate, stop_delegate, interrupt_delegate), send_to_user, and the fleet's MCP tools every session has (web search and fetch among them).",
    "You have shell and edit tools, inside the boundary of your place, this folder: you write only here and in $TMPDIR, read no credential store, reach no service manager and see no other session's processes, and files only their owner may read are hidden from you. The hub decides each call before it runs. Read-only commands (ls, cat, grep, find, file, stat, du, wc, head, tail, git that only reads, chained with ; && || or |, output only into /dev/null or 2>&1) run without asking whatever woke you. In a turn the person's own message woke, so do git init, git add <paths> and git commit where no one else works; every other shell or edit call raises an Approve card the person answers, wherever they are. In a turn anything else woke (an event, a routine, a report, outside text riding on your wake) every call but a read-only command raises the card, and so does every such call after you read web content in a turn. In a shared checkout git checkout, switch, restore, reset, stash, clean, rebase and push, git add -A or git add ., and any git alias are refused: file a task. Your edits are docs, config and assets only, 5 files a wake at most: anything bigger, file a task. At most 20 shell or edit calls a wake: delegate the rest. Every call shows in your thread. A task whose only changes are your own passes review only once the person approved them.",
    "Do setup and housekeeping yourself: make the folder a git repository, write a .gitignore or a config file, look at what is there. Real task work goes to tasks and delegates. Never ask the person in text to run a command, or for a setup detail you can find out: run it, and the card asks them when it must. Whenever the person asks you to set the project up, in any thread and in their own words (the first time, again, or one part of it), call project_setup with that thread and follow its steps there.",
    "AGENTS.md and knowledge/ are your project's memory: write one with memory_propose (the file's whole new text and why); it commits as you and is noted in the thread. Something worth keeping that you learned goes to the inbox with memory_note, as any session's does. A task's `context` names the knowledge/ files its attempt's brief carries.",
    "Your project's settings are yours to change with project_settings: rename it, grant it a connection, link its GitHub repository, set where its work lands, publish its place to a new private GitHub repository (create_repo), or turn Review before done on or off (set_review: whether every task waits for the person before done is theirs to choose, so it and create_repo are always an Approve card first). Each other change applies at once and is noted in the thread. A task whose work landed some other way than its attempt you close yourself: move it to done with a reason naming the commit. When a change, a memory write or anything else is the person's to decide (it posts or sends outside, spends, or undoes what they chose), call the tool with ask: true, which puts an Approve/Deny card in front of them and answers you when they do.",
    "You are woken only by events, each one a message: the person writing in a thread, an attempt at a task landing or failing, a task waiting for the person, a delegate's ask routed to you, the person asking for a view. Handle the event, then end your turn. Nothing wakes you on a timer. The person can turn you off: then only their own words wake you, and you do what they ask (tasks, routines, stages, the folder) as at any time; attempts, waiting tasks and routines no longer reach you. Inbound events from outside (GitHub, polled connections) that no route took ride along on your next wake as data: route the kinds that matter to routines with event_route_create.",
    "When the person writes in a thread, answer them in plain text: what you say in the turn after reading their words is posted in that thread as your reply when the turn ends, and they watch it in the thread as you write it, so say nothing in plain text you would not say to them. When a reply names tasks (its `tasks`, shown as cards) or files you wrote, or belongs in another thread, send it with thread_reply instead: a thread_reply to their thread is your reply there, and what you say in plain text after it stays in your session.",
    'Every choice that reaches the person is a decision card on a page, never AskUserQuestion, which is refused to you. Ask it as a decision page with one card, or a few for one topic (the decision-page skill): write decisions/<name>/page.oui with folder_write, give each Decision its kind from Who decides (look, behaviour, scope, approach, rules, tools), then artifact_create with kind page, the name, does: pick and an ask. Name each card in your reply by the link artifact_create answers for it: the thread draws it as the card\'s chip. Then end your turn; the card waits. One routed to the person waits on them; an advisor\'s or common practice\'s is settled by the delegate the hub starts; one routed to you, settle yourself. When the picks come ("The page … has new responses"), read them with artifact_read and answer: your turn answers the thread you asked in. Work that rests on a card waits on it (waits_on: "<page>#<card>"). Never end a message with a question for them to answer in text. Never hand them shell commands or ask them for setup details in text: do it with your tools, or ask with a card.',
    "A view-request event is the person asking for a view of the project: it carries how to write one, and the page to stand it on when they asked from one. Answer it with view_draft, then say in that thread what you drafted; the person keeps or discards it. A view-change event is the person asking to change a kept view: it carries the view's program; draft the change under the same name.",
    "When the person asks for a design system, file one task with task_create, its title “Build the design system” and nothing else (a stage only if they named one): the hub writes its description and acceptance, the design-system skill's steps with its decision page among them, and refuses it when the project already has a system or a build is open. Refused because it has one, answer: \"This project has one; say what to change.\" Filed, say what the build will read (the repository's styles and components, the site named in knowledge/, the brand kit in knowledge/brand/, the fonts and pictures in assets/: the ones the project has) and that you filed it. Never build one yourself, and never start one the person did not ask for: the hub asks them once when the work needs one.",
    "A project with no code yet starts as real code from its first screen. When the person asks for a screen, a component or a design to look at and the repository has no app, name the stack: the one they named, or ask once with a one-card decision page (SvelteKit, Vite with React or Vue, Astro, Nuxt). Then file one task that scaffolds it with that framework's own creator and builds the first screen as a real component with its sheet, its description naming the stack and the screen skill.",
    'Judgments go to Jev while the person has connected it; while Jev is off some are yours, and never about your own work. Mark a task `fields: { ready: "yes" }` when an agent can do it from its file alone: the dispatcher starts no other. Rank tasks with `rank`: the dispatcher starts them in that order. Triage the tasks a wake lists for triage. Judge an attempt\'s acceptance criteria when a wake asks you to.',
  ].join("\n\n");

export interface CawDeps {
  /** The asks parked on the hub now (pending.ts). */
  readonly asks: () => Envelope[];
  /** Stands a draft Caw writes for a page there, as a proposed block (blocks.ts). */
  readonly blocks: Pick<Blocks, "propose">;
  /** The project's spend cap and the fleet's default for it (project-caps.ts). */
  readonly caps: Pick<Caps, "capOf" | "quiets">;
  readonly db: Pick<
    DbShape,
    | "addThreadMessage"
    | "allThreads"
    | "archiveThread"
    | "bookCawTurn"
    | "createThread"
    | "dropLeadTurn"
    | "getInstancesByIds"
    | "cawSpentSince"
    | "ingress"
    | "leadTurns"
    | "listProjects"
    | "makeThread"
    | "newestConversation"
    | "project"
    | "projectAttempts"
    | "projectSpend"
    | "projectThreads"
    | "putLeadTurn"
    | "sendRecord"
    | "setProjectCaw"
    | "setSetupThread"
    | "spendOnCap"
    | "thread"
    | "threadMessages"
    | "threadOfTask"
    | "threadSends"
    | "touchThread"
    | "updateKeepAlive"
    | "updateWorkItem"
    | "workItem"
  >;
  /** Ends a session (the lead, when Caw moves harness or model). */
  readonly end: (instanceId: string) => void;
  /** Whether the fleet's delegates choice was ever set (the setup page asks for it until it is). */
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
  /** One of a thread's own rows added, onto its transcript (thread-transcript.ts `line`). */
  readonly posted: (row: ThreadMessageRow) => void;
  /** Every dashboard and the app read the projects again: his switch, harness or model moved. */
  readonly projectsChanged: () => void;
  /**
   * His `folder_write` of a `delegates/` file, parked as the person's
   * proposal in his thread and drawn at the call `toolUseId` (memory.ts
   * `proposeType`): nothing is committed until they approve it.
   */
  readonly proposeType: (
    actor: InstanceRow,
    path: string,
    content: string,
    toolUseId: string | undefined
  ) => Promise<{ id: string; path: string; waiting: string }>;
  /**
   * Tells every open dashboard a thread changed, or (`project.stop`) that his
   * turn an event started stopped as he was turned off (the ledger's
   * broadcast).
   */
  readonly publish: (frame: ThreadUpsertFrame | ProjectStopFrame) => void;
  /**
   * Ensures a lead's place boundary on his machine again (server.ts
   * `ensureIdentityWorkspace`): the machine reads its policy anew and hands
   * over to a boundary of the new one when it changed. Refused when the
   * machine cannot hold it: the wake does not go out.
   */
  readonly refreshPlace: (lead: InstanceRow) => Promise<void>;
  /** The setup page's stream relay card, while it is to be asked (with the domain the person last reached CawCo through); null once the fleet has a relay or a journey, or the card was answered and not asked `again`. */
  readonly relayOffer: (again: boolean) => RelayOffer | null;
  /** Caw replied in a thread: the person's phone hears it, unless they looked at the thread since (push.ts `threadReply`). */
  readonly replied: (thread: ThreadRow, reply: ThreadMessageRow) => void;
  /** Delivers one message to a session through the hub's one send path: whether the hub took it (its record `pending`). */
  readonly send: (envelope: Envelope<SendPayload>) => boolean;
  /**
   * The records of the person's sends in a thread (server.ts): `record`
   * keeps one as it was written, pending, or failed with `failed`, the
   * hub's sentence; `fail` fails one still pending that no wake carried;
   * `read` marks one read that needed no wake ("Make a note"); `claim`
   * makes a send to Caw's own session the thread's, read at `at`.
   */
  readonly sends: {
    claim: (uuid: string, threadId: string, at: Date) => void;
    fail: (uuid: string, reason: string) => void;
    read: (uuid: string) => void;
    record: (
      payload: SendPayload,
      threadId: string,
      failed?: string
    ) => SentMessageRow;
  };
  /** Starts a session in `mode` where its harness has modes, resolved once its machine says it is in place. */
  readonly spawn: (
    machineId: string,
    payload: SpawnPayload,
    mode: PermissionMode
  ) => Promise<void>;
  /**
   * A project's forget stop path (project-stops.ts): its running sessions as
   * a tree, and their stop, each end reported as `project.stop` once its
   * machine confirms it (or deferred to an away machine's next register).
   */
  readonly stops: {
    running: (projectId: string) => Omit<CawRunning, "kind" | "taskId">[];
    stop: (projectId: string, ids: string[]) => void;
  };
  /**
   * The live tail of a thread's transcript (thread-transcript.ts `tail`):
   * busy while his turn is on it, and his words in it as he writes them.
   */
  readonly tail: (
    threadId: string,
    patch: { busy?: boolean; streaming?: string }
  ) => void;
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
  /** Whether the fleet's upstream choice was ever answered (the setup page asks it until it is). */
  readonly upstreamAnswered: () => boolean;
  /**
   * Writes Caw's draft views, answers the view tools he tries, and reads a
   * kept view to change (views.ts).
   */
  readonly views: Pick<Views, "draft" | "kept" | "query" | "view">;
  /**
   * A wake went out as send `uuid`: your words alone (`owner`), or outside
   * text: an event's, a routine's, or outside events riding on your words.
   * His gate reads it when his harness reads the send (lead-gate.ts).
   */
  readonly wakeSent: (uuid: string, source: WakeSource) => void;
}

export const createCaw = ({
  asks,
  blocks,
  caps,
  db,
  end,
  fleetChoicesSet,
  relayOffer,
  upstreamAnswered,
  folderChanged,
  inTurn,
  interrupt,
  leadHome,
  posted,
  makeNote,
  online,
  projectsChanged,
  proposeType,
  publish,
  refreshPlace,
  replied,
  send,
  sends,
  spawn,
  stops,
  tail,
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
   * `threadId` is the thread it last answered (his Approve cards, what he
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
   * Each lead's turn under way, as far as his words go: `words`, what he
   * said in plain text in it (main loop only); `heard`, by thread, where in
   * `words` he stood when the turn read your newest words in it (`from`),
   * and the send it read them as (`send`, the row his session's transcript
   * has of it); `replied`, the threads he has answered with thread_reply
   * since. A turn that read your words and ends without answering them
   * leaves what it said after reading them in their thread, as his reply
   * ({@link answerUnreplied}): you read only the thread, so nothing he says
   * to you stays in his session alone. Until it does, the thread's tail
   * carries his words as he writes them ({@link spokeInto}).
   */
  const speech = new Map<
    string,
    {
      heard: Map<string, { from: number; send: string }>;
      replied: Set<string>;
      words: string[];
    }
  >();

  /**
   * His turn read the send `uuid`: one that starts the turn (`started`
   * false) starts what it says over; your words in a thread (`yours`, its
   * id), read even mid-turn, are owed an answer from here on, whatever
   * answered that thread before.
   */
  const heardIn = (
    instanceId: string,
    started: boolean,
    yours: string | undefined,
    uuid: string
  ): void => {
    const now = (started && speech.get(instanceId)) || {
      heard: new Map<string, { from: number; send: string }>(),
      replied: new Set<string>(),
      words: [],
    };
    if (yours) {
      now.heard.set(yours, { from: now.words.length, send: uuid });
      now.replied.delete(yours);
    }
    speech.set(instanceId, now);
  };

  /**
   * What the lead's turn has said in plain text since it read your words in
   * each thread it owes an answer, onto that thread's tail: the thread draws
   * his words as he writes them, until his reply stands in their place.
   */
  const spokeInto = (instanceId: string): void => {
    const turn = speech.get(instanceId);
    for (const [threadId, { from }] of turn?.heard ?? []) {
      if (!turn?.replied.has(threadId)) {
        tail(threadId, {
          streaming: turn?.words.slice(from).join("\n\n") ?? "",
        });
      }
    }
  };

  /**
   * The turn under way ended: each thread whose your-words wake it read and
   * that it did not answer with thread_reply after reading it gets what he
   * said since, as his message. Nothing said, nothing left.
   */
  const answerUnreplied = (instanceId: string): void => {
    const turn = speech.get(instanceId);
    speech.delete(instanceId);
    if (!turn) {
      return;
    }
    for (const [threadId, { from }] of turn.heard) {
      tail(threadId, { streaming: "" });
      const body = turn.words.slice(from).join("\n\n").trim();
      if (!body || turn.replied.has(threadId) || !db.thread(threadId)) {
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
    ...(thread.archivedAt ? { archivedAt: thread.archivedAt.getTime() } : {}),
  });

  /**
   * A thread's row, to every dashboard, and its transcript's tail busy
   * while his turn is on it: the thread reads as a session at work.
   */
  const upsert = (thread: ThreadRow | undefined): void => {
    if (thread) {
      const summary = summaryOf(thread);
      publish({ kind: "thread.upsert", thread: summary });
      tail(thread.id, { busy: summary.status === "working" });
    }
  };

  /**
   * A message added to a thread, onto its transcript, then the row it
   * moved; a reply of Caw's reaches the person's phone. `withRow: false`
   * when a wake follows, which publishes the row once with the turn's
   * status, so it never reads `ready` for a moment.
   */
  const said = (
    thread: ThreadRow,
    added: ThreadMessageRow,
    withRow = true
  ): void => {
    posted(added);
    if (withRow) {
      upsert(thread);
    }
    if (added.author === "caw") {
      replied(thread, added);
    }
  };

  /**
   * A send woke the lead (`sent`, its uuid): what woke it waits for his
   * harness to read it, and `threadId`, when it names one, is `working`
   * from now until the turn that reads it ends. A turn your words are in
   * stays yours when an event joins it ({@link joined}). Without a thread
   * it says `what` it answers, on his panel, and the turn answers no thread
   * from then on: it never carries on the thread of the turn it joined (a
   * routine run's, say), which would take its asks and notes.
   */
  const follow = (
    leadId: string,
    projectId: string,
    by: WorkOrigin,
    sent: string,
    to: { threadId: string } | { what: string }
  ) => {
    const before = turns.get(leadId);
    const threadId = "threadId" in to ? to.threadId : undefined;
    if ("threadId" in to) {
      answered.set(leadId, to.threadId);
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
      heardIn(instanceId, turn.started, yours, uuid);
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
   * Notes an event in its thread, else the project's newest conversation, else a thread
   * of its own; answers the thread it went to. `withRow` as {@link said}.
   * A project deleted since the event began has no threads to note it in.
   */
  const noteIn = (
    projectId: string,
    threadId: string | undefined,
    note: ThreadNote,
    withRow = true
  ): string => {
    projectOf(projectId);
    const thread =
      (threadId ? db.thread(threadId) : undefined) ??
      db.newestConversation(projectId);
    const event = eventRow(note);
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

  /**
   * The project's Caw session is now `instanceId` (null: none). Every
   * dashboard and the app read the projects again: a thread draws its lead's
   * preview and plan beside it from the project's row, so the row it opens
   * with names him.
   */
  const setLead = (projectId: string, instanceId: string | null): void => {
    db.setProjectCaw(projectId, { leadInstanceId: instanceId });
    projectsChanged();
  };

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
    return online() ? null : CAW_NO_MACHINE;
  };

  /**
   * One message to Caw's session. One that carries your words is yours
   * (`human`), as a session's composer sends it: it wakes him stopped, and
   * at his account's limit it is moved or continued as any person's turn is.
   * Any other is CawCo's word (`system`): a routine's says so in its origin
   * (`routine:<id>`), the turn it starts that run's (memory.ts). `carry`
   * gives it a person's send's uuid, and what rode with your words. Answers
   * the send's uuid when the hub took it, for {@link follow}.
   */
  const message = (
    target: InstanceRow,
    content: string,
    by: Origin,
    routine?: string,
    carry?: Carry
  ): string | undefined => {
    const uuid = carry?.uuid ?? crypto.randomUUID();
    const origin: NeutralOrigin =
      by === "you"
        ? { kind: "human" }
        : {
            kind: "system",
            name: routine ? `${ROUTINE_ORIGIN}${routine}` : "caw",
          };
    const taken = send({
      verb: "send",
      machineId: target.machineId,
      instanceId: target.id,
      payload: {
        ...carry?.carried,
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

  /**
   * Starts the project's Caw session, makes it the lead, and sends it its
   * brief with the event that started it: a session is only ever started by
   * an event.
   */
  const startLead = async (
    project: ReturnType<typeof projectOf>,
    event: string,
    by: Origin,
    routine?: string,
    carry?: Carry
  ): Promise<{ lead: InstanceRow; sent: string | undefined }> => {
    const place =
      (await placeFor(project)) ??
      refuse(409, problemOf(project) ?? CAW_NO_MACHINE);
    const instanceId = crypto.randomUUID();
    cawDenied(project.cawHarness);
    await spawn(
      place.machineId,
      {
        instanceId,
        cwd: place.cwd,
        harness: project.cawHarness,
        ...(project.cawModel ? { model: project.cawModel } : {}),
        projectId: project.id,
        title: "Caw",
        role: "lead",
        requestId: crypto.randomUUID(),
      },
      // Caw's own mode: no tool ask parks for a person, as every shell and
      // edit call of his is put to the hub's gate instead (lead-gate.ts).
      "bypassPermissions"
    );
    setLead(project.id, instanceId);
    // A Claude lead's context is the project's whole history, and an idle
    // hour costs it a full rewrite: kept warm, under keep-alive's cap of one
    // rewrite's worth of pings (caw-cost.md: $1.01 of pings against $10.18
    // of rewrites over 10-15/16).
    if (project.cawHarness === "claude") {
      db.updateKeepAlive(instanceId, {
        keepAliveEnabled: true,
        keepAliveStopped: null,
        keepAliveSent: 0,
      });
    }
    const lead = row(instanceId);
    if (!lead) {
      throw new Error(`Caw's session ${instanceId} has no row on this hub.`);
    }
    const sent = message(
      lead,
      `${briefOf(project.name)}\n\n${event}`,
      by,
      routine,
      carry
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
    carry?: Carry
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
    const start = startLead(project, event, by, routine, carry).finally(() =>
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
   * What one wake came to: a model woken, or not and why (`why`, the hub's
   * sentence a send it carried fails with), with what was thrown when
   * something refused it.
   */
  type Woke =
    | { woke: true }
    | {
        thrown?: unknown;
        why: string;
        woke: false;
      };

  /**
   * The one way anything wakes a project's Caw (§5.3: your message, your ask
   * for a view, the project's setup; an attempt landing or failing, a
   * needs-you item; routines, GitHub events and check results call it the
   * same way). Its note goes into its thread first; then one message to
   * Caw's session, starting the session when it has none, and that thread
   * follows the turn. Your words wake him on or off; an event, only while he
   * is on. There is no timer behind it. Answers what came of it ({@link Woke});
   * {@link wake} is its answer as the other wakers take it.
   */
  const wakeOnce = async (
    projectId: string,
    event: CawEvent
  ): Promise<Woke> => {
    // The thread's row goes out once, with the status this wake leaves it in.
    const settle = (id: string | undefined) =>
      upsert(id ? db.thread(id) : undefined);
    if (event.by === "event" && !projectOf(projectId).caw) {
      settle(event.threadId);
      return { woke: false, why: CAW_OFF };
    }
    const threadId = event.note
      ? noteIn(projectId, event.threadId, event.note, false)
      : event.threadId;
    // Past its spend cap the project's Caw takes no turn: an event stays in
    // its thread; your words are refused with the cap's sentence (a thread's
    // words are refused before they are kept, `listening`).
    const capped = caps.quiets(projectId);
    if (capped !== undefined) {
      settle(threadId);
      return {
        woke: false,
        why: capped,
        ...(event.by === "you" ? { thrown: new CawRefusal(409, capped) } : {}),
      };
    }
    const words = await wakeWords(projectId, event, threadId);
    // Inbound events no route took ride on this wake (ingress.ts): taken
    // now, given back when the wake does not go out.
    const inbox = db.ingress.claimInbox(projectId, new Date());
    const text =
      inbox.length > 0 ? `${words}\n\n---\n\n${inboxText(inbox)}` : words;
    return deliver(projectId, event, threadId, text, inbox.length, (why) => {
      db.ingress.releaseInbox(inbox.map((each) => each.id));
      settle(threadId);
      return why;
    });
  };

  /**
   * A wake's message to his session, its words ready: his session (started
   * for it when he has none), his place's boundary read again, the message,
   * and its thread following the turn. `notOut` gives back what the wake
   * took and answers why it went no further.
   */
  const deliver = async (
    projectId: string,
    event: CawEvent,
    threadId: string | undefined,
    text: string,
    inboxed: number,
    notOut: (why: Woke & { woke: false }) => Woke
  ): Promise<Woke> => {
    const failed = (why: string, thrown?: unknown): Woke =>
      notOut({
        woke: false,
        why,
        ...(thrown === undefined ? {} : { thrown }),
      });
    const carry = carryOf(event);
    let lead: Awaited<ReturnType<typeof leadFor>>;
    try {
      lead = await leadFor(projectId, text, event.by, event.routine, carry);
    } catch (error) {
      return failed(errorWords(error), error);
    }
    if (!lead) {
      return failed(CAW_OFF);
    }
    try {
      // His place's boundary read again before he reads this: what became
      // only its owner's since it started is hidden from him too.
      await placeFresh(lead);
    } catch (error) {
      return failed(errorWords(error), error);
    }
    const sent = lead.started
      ? lead.sent
      : message(lead.row, text, event.by, event.routine, carry);
    if (!sent) {
      // His session refused it: nothing woke him, and the thread is not his.
      return failed("His session didn't take the message.");
    }
    wakeSent(sent, sourceOf(event, inboxed));
    if (threadId) {
      followWake(lead.row.id, projectId, event.by, sent, threadId);
    }
    return { woke: true };
  };

  /** {@link wakeOnce}, as the wakers that only ask whether he woke take it: what refused it is thrown. */
  const wake = async (projectId: string, event: CawEvent): Promise<boolean> => {
    const woke = await wakeOnce(projectId, event);
    if (!woke.woke && woke.thrown !== undefined) {
      throw woke.thrown;
    }
    return woke.woke;
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

  /**
   * A wake went out to the lead as `sent`: its thread follows the turn
   * ({@link follow}), and one of your words (a thread's message, your setup,
   * your ask for a view) owes that thread what the turn that reads it says.
   */
  const followWake = (
    leadId: string,
    projectId: string,
    by: Origin,
    sent: string,
    threadId: string
  ): void => {
    if (by === "you") {
      yourWakes.set(sent, threadId);
    }
    follow(leadId, projectId, by, sent, { threadId });
  };

  /**
   * Your send in a thread wakes Caw behind the answer that keeps it: its
   * record is kept pending and answered at once, and the wake (his session
   * started, moved or busy, his account at its limit) runs behind it under
   * the send's own uuid, so the record is the wake's. A wake that does not
   * go out fails the record with the hub's sentence; its row's Try again
   * sends it again (`replaces`).
   */
  const wakeForYou = (
    projectId: string,
    threadId: string,
    uuid: string,
    event: CawEvent
  ): void => {
    const notWoken = (why: string) => {
      console.warn(
        `[caw] ${projectId}: your words in thread ${threadId} did not wake Caw: ${why}`
      );
      sayNestedBoundaryFix(why);
      sends.fail(uuid, why);
    };
    wakeOnce(projectId, { ...event, send: uuid }).then(
      (woke) => {
        if (!woke.woke) {
          notWoken(woke.why);
        }
      },
      (error: unknown) => notWoken(errorWords(error))
    );
  };

  /** Logs a wake that failed: an event is never lost silently. */
  const wakeQuietly = (projectId: string, event: CawEvent): void => {
    wake(projectId, event).catch((error: unknown) => {
      const why = error instanceof Error ? error.message : String(error);
      console.warn(`[caw] ${projectId}: Caw was not woken: ${why}`);
      sayNestedBoundaryFix(why);
    });
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
    setLead(project.id, null);
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
   * one that named its task, else the project's newest conversation; kept by item, as
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
      db.newestConversation(projectId)?.id;
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

  const tryOf = (projectId: string, item: WorkItemRow): number =>
    attemptTry(db.projectAttempts(projectId), item);

  /** An item's end as the note in a thread: an attempt at its task, or a delegate. */
  const endNote = (projectId: string, item: WorkItemRow): ThreadNote => {
    const state = endOf(item);
    const event: ThreadEvent = item.taskId
      ? {
          kind: "attempt",
          phase: "ended",
          taskId: item.taskId,
          title: item.title,
          workItemId: item.id,
          instanceId: item.instanceId,
          state,
          try: tryOf(projectId, item),
        }
      : {
          kind: "delegate",
          title: item.title,
          workItemId: item.id,
          instanceId: item.instanceId,
          state,
        };
    return {
      title: `${item.taskId ? "Attempt" : "Delegate"} · ${item.title} ${ENDED[state]}`,
      body: reportOf(item),
      event,
    };
  };

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
    const note = endNote(project.id, item);
    const event: CawEvent = {
      by,
      text: `The attempt at ${taskLink(project.id, taskId, item.title)} ended ${item.state}.${report ? `\n\n${report}` : ""}`,
      threadId: db.threadOfTask(project.id, taskId)?.id,
      note,
    };
    if (hears && !project.leadInstanceId) {
      wakeQuietly(project.id, event);
      return;
    }
    noteIn(project.id, attemptThread(project.id, item), note);
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

  /** The id of the project's thread `asked` names: its id, its handle, or its title (handles.ts). */
  const threadNamed = (projectId: string, asked: string): string =>
    byHandle(
      asked.replace(THREAD_HANDLE_PREFIX, ""),
      db.projectThreads(projectId),
      {
        id: (thread) => thread.id,
        names: (thread) => [thread.title],
        said: (thread) => `“${thread.title}” ${thread.id.slice(0, 8)}`,
      },
      "thread"
    ).id;

  /** What Caw reads when you write: the thread, and your words. */
  const yourWords = (thread: ThreadRow, body: string, first: boolean) =>
    `${first ? "You started a thread" : "You wrote in the thread"} “${thread.title}” (thread ${thread.id}):\n\n${body}\n\nAnswer in plain text: it is posted in this thread as your reply, and the person watches it as you write it. When your reply names tasks or files, send it with thread_reply({ thread: "${thread.id}", body, tasks, files }) instead.`;

  /**
   * What Caw reads when you ask for a view: your words, where you asked
   * from (a page's end: the draft stands there as a proposed block; the
   * strip: a draft tab), then how a view is written.
   */
  const viewRequest = (
    thread: ThreadRow,
    body: string,
    place: ViewPlace | null
  ) => {
    const draft = place
      ? `You asked from the ${BLOCK_PAGE_TITLES[place.page]} page: draft it with view_draft({ name, source, page: "${place.page}"${place.position === null ? "" : `, position: ${place.position}`} }), and it stands there as a block the person keeps or removes.`
      : "Draft it with view_draft({ name, source }).";
    return `Event view-request: you asked for a view in the thread “${thread.title}” (thread ${thread.id}):\n\n${body}\n\n${draft} Then tell the person in that thread with thread_reply.\n\n# How a view is written\n\n${VIEW_PROMPT}`;
  };

  /** What Caw reads when you ask him to change a kept view: your words, its program, then how a view is written. */
  const viewChange = (thread: ThreadRow, kept: ProjectView, body: string) =>
    `Event view-change: you asked to change the view “${viewTitle(kept.name)}” (views/${kept.name}.oui) in the thread “${thread.title}” (thread ${thread.id}):\n\n${body}\n\nIts program now:\n\n${kept.source}\n\nDraft the change with view_draft({ name: "${kept.name}", source }): the person keeps it where the view stands, or discards it. Then tell the person in that thread with thread_reply.\n\n# How a view is written\n\n${VIEW_PROMPT}`;

  /**
   * Caw's draft written (`view_draft`), as view_draft answers it. For a
   * page, a name that is a kept view's is refused (a change keeps the view's
   * place, so it is drafted without one); with a page, the draft stands
   * there as a proposed block.
   */
  const draftView = async (
    projectId: string,
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
      views.draft(projectId, input.name, input.source, { name: "Caw" })
    );
    const proposed = input.page
      ? blocks.propose(
          projectId,
          drafted.name,
          input.page,
          input.position ?? null,
          "Caw"
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

  /**
   * A thread and what was said in it, oldest first, as `thread_read` reads
   * it: the person's sends where you read them (one not read yet last),
   * your replies, the notes and the person's answers to your questions.
   */
  const read = (projectId: string, threadId: string): ThreadLines => {
    const thread = threadIn(projectId, threadId);
    const lines: ThreadLine[] = [
      ...db.threadMessages(thread.id).map(lineOf),
      ...db
        .threadSends(thread.id)
        .filter((one) => one.state === "read" || one.state === "pending")
        .map((one): ThreadLine => ({
          at: (one.readAt ?? one.acceptedAt).getTime(),
          author: "you",
          body: sendWords(one.body),
          ...(one.state === "pending" ? { unread: true } : {}),
        })),
    ];
    return {
      thread: summaryOf(thread),
      lines: lines.sort((a, b) => a.at - b.at),
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
  const notedLine = (sha: string): ThreadNote => ({
    title: "AGENTS.md · noted",
    body: `Added to AGENTS.md as your commit ${sha.slice(0, 9)}.`,
    event: { kind: "agents", sha },
  });

  /**
   * Setup's steps for `project` in `threadId` as the fleet stands now
   * ({@link setupEvent}), the one source of both its paths: the wake a new
   * project's Setup thread opens with ({@link wakeForSetup}) and
   * `project_setup`, the person's ask in any thread. The fleet's choices,
   * its upstream answer and the relay card are asked while unanswered, and
   * again when the person asked to change them (`change`); the place card
   * while the project has no checkout, or when they asked to move it.
   */
  const setupText = (
    project: ReturnType<typeof projectOf>,
    threadId: string,
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
      threadId,
    });

  /**
   * Wakes the project's Caw with its setup event: your words (your prompt,
   * or the offer you accepted), so on or off. The Setup thread's first send
   * (`first`, the prompt) goes with it as it reads, under its own uuid, with
   * the pictures it carried. When Caw cannot start for want of a machine,
   * the prompt waits, queued, and `machineOnline` tries again; any other
   * failure, the spend cap's included, fails the prompt's record, or, with
   * no prompt, is noted in the thread.
   */
  const wakeForSetup = (
    project: ReturnType<typeof projectOf>,
    threadId: string,
    from: "prompt" | "offer",
    template: StagesTemplate | null,
    first?: SentMessageRow
  ): void => {
    const pending = first?.state === "pending" ? first : undefined;
    const carried = pending ? picturesOf(pending) : undefined;
    const couldNot = (why: string): void => {
      if (pending) {
        sends.fail(pending.uuid, why);
        return;
      }
      noteIn(project.id, threadId, {
        title: "Caw · could not start",
        body: why,
        event: { kind: "caw", what: "could-not-start" },
      });
    };
    if (pending && !carried) {
      // A picture the prompt carried is no longer stored (a setup tried
      // again long after): it can't go to him as it was written.
      couldNot(
        "A picture your message carried is no longer kept on the hub, so it can't go to Caw again. Write to him again with it."
      );
      return;
    }
    const opened = first
      ? sendWords(first.body)
      : (() => {
          const [note] = db.threadMessages(threadId);
          return note ? openedOf(note) : undefined;
        })();
    wake(project.id, {
      by: "you",
      threadId,
      text: setupText(project, threadId, from, template, {
        ...(opened === undefined ? {} : { opened }),
      }),
      ...(pending ? { send: pending.uuid } : {}),
      ...(carried?.images ? { carried } : {}),
    }).then(
      (woke) => {
        if (
          !woke &&
          pending &&
          db.sendRecord(pending.uuid)?.state === "pending"
        ) {
          couldNot(CAW_OFF);
        }
      },
      (error: unknown) => {
        // The project was deleted meanwhile: nothing to say.
        if (!db.project(project.id)) {
          return;
        }
        // No machine for him: the prompt waits for one, queued.
        if (
          error instanceof CawRefusal &&
          error.status === 409 &&
          !caps.quiets(project.id)
        ) {
          return;
        }
        couldNot(errorWords(error));
      }
    );
  };

  /** The project's stages.md as it stands; undefined while it has none. */
  const stagesOf = async (projectId: string): Promise<string | undefined> => {
    try {
      return (await readFolderFile(projectId, STAGES_FILE)).content;
    } catch (error) {
      if (error instanceof FolderRefusal && error.status === 404) {
        return;
      }
      throw error;
    }
  };

  /**
   * The template the project's stages.md is, word for word; null when it is
   * its own. With no stages.md, the code template when the project was made
   * from it (the hub reads it with no file), else null.
   */
  const templateOf = async (
    projectId: string
  ): Promise<StagesTemplate | null> => {
    const content = await stagesOf(projectId);
    if (content === undefined) {
      return db.project(projectId)?.template === "code" ? "code" : null;
    }
    return (
      STAGES_TEMPLATES.find((name) => templateText(name) === content) ?? null
    );
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
   * his parked ask on your card stands in (you are answering beside it),
   * else the one his turn under way answers, else the one he answered last,
   * else the project's newest conversation; none when it has none yet.
   */
  const threadOfLead = (
    leadId: string,
    projectId: string
  ): string | undefined => {
    const asked = asks().find((ask) => ask.instanceId === leadId)?.payload as
      { threadId?: string } | undefined;
    return [
      asked?.threadId,
      turns.get(leadId)?.threadId,
      answered.get(leadId),
      db.newestConversation(projectId)?.id,
    ].find(
      (id): id is string => !!id && db.thread(id)?.projectId === projectId
    );
  };

  /**
   * The thread a send is written in: the one its id names, else made now
   * under that id in the send's project (the project's Setup thread when it
   * has none). `first`: nothing was said in it before this send. Refused
   * for a thread that is not there and no project to make it in.
   */
  const sentTo = (
    threadId: string,
    payload: SendPayload,
    body: string
  ): {
    first: boolean;
    project: ReturnType<typeof projectOf>;
    setup: boolean;
    thread: ThreadRow;
  } => {
    const had = db.thread(threadId);
    const projectId =
      had?.projectId ??
      payload.projectId ??
      refuse(404, "This thread is not on this hub any more.");
    const project = projectOf(projectId);
    if (had) {
      return {
        project,
        thread: had,
        setup: false,
        first: !(
          db.threadSends(threadId).length > 0 ||
          db.threadMessages(threadId).some((one) => one.author !== "event")
        ),
      };
    }
    const setup = db.projectThreads(projectId).length === 0;
    const thread = db.makeThread({
      id: threadId,
      projectId,
      title: setup ? `Set up ${project.name}` : titleFrom(body),
      setup,
    });
    return { project, thread, setup, first: true };
  };

  /**
   * A new thread of the project's opened by your words: the thread, made
   * under a new id, and your words its first send, kept pending for the
   * wake that follows to carry under its uuid (`uuid`, when the device
   * chose it).
   */
  const openWith = (
    projectId: string,
    body: string,
    uuid: string = crypto.randomUUID(),
    made: { setup?: boolean; title?: string } = {}
  ): { send: SentMessageRow; thread: ThreadRow } => {
    const thread = db.makeThread({
      id: crypto.randomUUID(),
      projectId,
      title: made.title ?? titleFrom(body),
      ...(made.setup ? { setup: true } : {}),
    });
    const opening = sends.record(
      {
        instanceId: threadTargetOf(thread.id),
        message: {
          type: "user",
          uuid,
          message: { role: "user", content: body },
          parent_tool_use_id: null,
          origin: { kind: "human" },
        },
      },
      thread.id
    );
    return {
      send: opening,
      thread: db.touchThread(thread.id, opening.acceptedAt) ?? thread,
    };
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
    wakeOnce,
    view,

    /**
     * §5.5: "Caw offers the relay when you connect a push-only service". The
     * project now has `connection` signed in, whose service pushes its
     * events and is never polled, and no relay for `provider`: an event wake
     * (so only while he is on) on the project's newest conversation, whose
     * words ask him to offer one with relay_create. It carries no note: he
     * makes the offer there himself, as a one-card decision page.
     */
    offerRelay(
      projectId: string,
      connection: Pick<ConnectionView, "account" | "name" | "service">,
      provider: RelayProvider
    ): void {
      const threadId = db.newestConversation(projectId)?.id;
      wakeQuietly(projectId, {
        by: "event",
        ...(threadId ? { threadId } : {}),
        text: `Event connection: the person signed in the connection “${connection.name}” (${connection.service}, ${connection.account}) for this project. ${connection.service} pushes its events instead of being polled, so none of them reach the project until it has a relay. Offer one: ask the person${threadId ? ` in thread ${threadId}` : ""} with a one-card decision page whether to open a public webhook path for it. On yes, call relay_create({ provider: "${provider}" }), which puts the opening in front of them as an Approve card, then tell them in the thread what to register at ${connection.service}. On no, leave it: polling stays as it is.`,
      });
    },

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
     * The thread the project's Caw `instanceId` is in a turn for, for where
     * what he makes in it was made (routines.ts `madeIn`); undefined for a
     * session that is no project's lead, or a turn no thread woke.
     */
    turnThread(instanceId: string): string | undefined {
      return leadOf(row(instanceId))
        ? turns.get(instanceId)?.threadId
        : undefined;
    },

    /**
     * A routine's note (routines.ts) in the routine's own thread: `threadId`
     * while it is still one of the project's, else a new thread that opens
     * with the note. Wakes no model, Caw on or off. Answers the thread.
     */
    notice(
      projectId: string,
      threadId: string | null,
      note: ThreadNote
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
        first: eventRow(note),
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
      const harness = (change.harness as HarnessKind | undefined) ?? undefined;
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
      // Every dashboard's switch says where he stands now, not only the one
      // that flipped it.
      if (on !== project.caw || moved || rehomed) {
        projectsChanged();
      }
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
     * Archives one of the project's threads (`archived`), or brings it back:
     * the rails leave an archived thread and the sessions under it out, and
     * a new message in it brings it back. Every dashboard hears the thread
     * as it stands then.
     */
    archive(
      projectId: string,
      threadId: string,
      archived: boolean
    ): ThreadSummary {
      threadIn(projectId, threadId);
      const thread = db.archiveThread(threadId, archived ? new Date() : null);
      if (!thread) {
        return refuse(404, "This thread is not on this hub any more.");
      }
      upsert(thread);
      return summaryOf(thread);
    },

    /**
     * The person's send to a thread (server.ts `deliverSend`, its target
     * `thread:<id>`): every word they write to Caw, from a thread's composer,
     * his own session's, a push's Reply or a relay. Kept as a send's record
     * under its uuid, with the thread's id, and answered at once; Caw is
     * woken with it behind that answer, under the same uuid
     * ({@link wakeForYou}), so the record is the wake's and moves as his
     * harness reads it. A thread not made yet is made under its id in
     * `payload.projectId`, the project's Setup thread when it has none.
     * "Make a note: …" goes to AGENTS.md, waking nobody. A send Caw cannot
     * read now (no machine for him, the spend cap) is kept failed with the
     * hub's sentence; its row's Try again sends it again. The same uuid
     * again is the same send: its record as it stands. Refused, before
     * anything is kept, for a thread that is not there and no project to
     * make it in, or a send with no words.
     */
    sent(threadId: string, payload: SendPayload): SentMessageRow {
      const known = db.sendRecord(payload.message.uuid);
      if (known) {
        return known;
      }
      const body = wordsOf(payload.message.message.content).trim();
      if (!(body || payload.images?.length || payload.attachments?.length)) {
        refuse(400, "A message needs words.");
      }
      const { project, thread, setup, first } = sentTo(threadId, payload, body);
      const projectId = project.id;
      const kept = (failed?: string): SentMessageRow => {
        const record = sends.record(payload, threadId, failed);
        upsert(db.touchThread(threadId, record.acceptedAt) ?? thread);
        return record;
      };
      if (MAKE_A_NOTE.test(body)) {
        const record = kept();
        noteInAgents(projectId, body).then(
          (sha) => {
            sends.read(record.uuid);
            noteIn(projectId, threadId, notedLine(sha));
          },
          (error: unknown) => sends.fail(record.uuid, errorWords(error))
        );
        return record;
      }
      const refused = problemOf(project) ?? caps.quiets(projectId);
      if (refused) {
        return kept(refused);
      }
      const record = kept();
      if (setup) {
        // A project's first words to him, where nothing opened its Setup
        // thread (one made from a folder): they open it, and wake him to
        // set the project up, as New project's prompt does.
        wakeForSetup(project, threadId, "prompt", project.template, record);
        return record;
      }
      const carried: Carried = {
        ...(payload.images?.length ? { images: payload.images } : {}),
        ...(payload.attachments?.length
          ? { attachments: payload.attachments }
          : {}),
      };
      wakeForYou(projectId, threadId, record.uuid, {
        by: "you",
        text: yourWords(thread, body, first),
        threadId,
        ...(carried.images || carried.attachments ? { carried } : {}),
      });
      return record;
    },

    /**
     * The thread your words sent straight to a project's Caw's own session
     * belong to (server.ts `toCawThread`): the one he is in
     * ({@link threadOfLead}), else a new one of the project's. Undefined
     * when `instanceId` is not a project's Caw.
     */
    leadThread(
      instanceId: string
    ): { projectId: string; threadId: string } | undefined {
      const project = leadOf(row(instanceId));
      if (!project) {
        return;
      }
      return {
        projectId: project.id,
        threadId: threadOfLead(instanceId, project.id) ?? crypto.randomUUID(),
      };
    },

    /**
     * A session's hand-off to a thread (delegation-actions.ts `handoff`, a
     * `@Title <thread#id8>` mention): Caw is woken for that thread with its
     * words under the hand-off marker, as an outside event, never as yours.
     * Refused while he is off, or cannot be woken: the words would reach no
     * one. Answers what became of it.
     */
    async handed(
      threadId: string,
      from: { instanceId: string; name: string },
      words: string
    ): Promise<string> {
      const into = db.thread(threadId) ?? refuse(404, `No thread ${threadId}.`);
      const project = projectOf(into.projectId);
      if (!project.caw) {
        refuse(
          409,
          `${project.name}'s Caw is off, so nothing reads the thread “${into.title}”. Nothing was handed; turn Caw on, or hand it to a session.`
        );
      }
      const woke = await wake(project.id, {
        by: "event",
        threadId: into.id,
        text: `${handoffMarker(from.name, from.instanceId)}For the thread “${into.title}” (thread ${into.id}):\n\n${words}\n\nWhen the person should see your answer, post it there with thread_reply({ thread: "${into.id}", body }).`,
      });
      if (!woke) {
        refuse(
          409,
          `Caw could not be woken for the thread “${into.title}” in ${project.name}. Nothing was handed.`
        );
      }
      return `Handed to Caw in the thread ${sessionLink(into.id, into.title)} (${project.name}).`;
    },

    /**
     * Words a session said in plain text, in its main loop (server.ts, each
     * assistant frame): a lead's, in a turn under way, are kept for the
     * threads of yours it may leave unanswered ({@link answerUnreplied}).
     */
    spoke(instanceId: string, words: string): void {
      const turn = speech.get(instanceId);
      if (turn) {
        turn.words.push(words);
        spokeInto(instanceId);
      }
    },

    /**
     * Words said to and by Caw that missed their thread, written into it at
     * the times they were said, oldest first, through the thread's own
     * storage; then a note from the hub saying so (thread-repair.ts).
     */
    restore(
      threadId: string,
      lines: (
        | { at: Date; author: "you"; send: string }
        | { at: Date; author: "caw"; body: string }
      )[],
      note: ThreadNote
    ): void {
      const thread = db.thread(threadId);
      if (!thread) {
        return;
      }
      for (const one of lines) {
        if (one.author === "you") {
          sends.claim(one.send, threadId, one.at);
          continue;
        }
        const added = db.addThreadMessage({
          threadId,
          author: "caw",
          body: one.body,
          createdAt: one.at,
        });
        said(added.thread, added.message);
      }
      noteIn(thread.projectId, threadId, note);
    },

    /**
     * "Ask Caw for a view": a new thread with your words as its first send,
     * answered once kept, and Caw woken by `view-request` behind it under
     * that send's uuid. Asked from a page's end (`place`), his draft stands
     * on that page as a proposed block; from the strip, it is a draft tab.
     * The same `id` again is the same ask: its thread.
     */
    requestView(
      projectId: string,
      raw: string,
      place: ViewPlace | null = null,
      id?: string
    ): { thread: ThreadSummary } {
      const again = id ? db.sendRecord(id) : undefined;
      const asked = again?.threadId ? db.thread(again.threadId) : undefined;
      if (asked) {
        return { thread: summaryOf(asked) };
      }
      const body = bodyOf(raw);
      listening(projectId);
      const opened = openWith(projectId, body, id);
      wakeForYou(projectId, opened.thread.id, opened.send.uuid, {
        by: "you",
        text: viewRequest(opened.thread, body, place),
        threadId: opened.thread.id,
      });
      return { thread: summaryOf(opened.thread) };
    },

    /**
     * "Ask Caw to change it", on a kept view: a new thread with your words
     * as its first send, and Caw woken by `view-change` behind it with the
     * view's program. Your words wake him on or off, as they always do
     * (off is never "can't be messaged"); only a Caw who cannot
     * start, or the spend cap, refuses them, before they are kept. Answers
     * the thread, and whether he is on, which the page says.
     */
    async askAboutView(
      projectId: string,
      name: string,
      raw: string
    ): Promise<ViewAsked> {
      const body = bodyOf(raw);
      listening(projectId);
      const kept = await views.view(projectId, name).catch(refusedBy);
      const opened = openWith(projectId, body);
      wakeForYou(projectId, opened.thread.id, opened.send.uuid, {
        by: "you",
        text: viewChange(opened.thread, kept, body),
        threadId: opened.thread.id,
      });
      return {
        thread: summaryOf(opened.thread),
        caw: projectOf(projectId).caw ? "on" : "off",
      };
    },

    /**
     * A project made with Caw (New project, an accepted offer): its Setup
     * thread, opened with your prompt as its first send (`promptId`, the
     * uuid the dashboard sent it as, so your words fly into their row) or a
     * note of where it came from, and Caw woken once to set the project up
     * (setup.ts). A Caw that cannot start leaves the prompt queued for a
     * machine, or says why: the project stands either way.
     */
    setup(
      projectId: string,
      ask: {
        /** The note a project without a prompt opens with (an offer's). */
        note?: ThreadNote;
        prompt?: string;
        promptId?: string;
        template: StagesTemplate | null;
      }
    ): ThreadSummary {
      const project = projectOf(projectId);
      const prompt = ask.prompt?.trim();
      if (ask.promptId && db.sendRecord(ask.promptId)) {
        refuse(409, "That message is already in its thread.");
      }
      if (prompt) {
        const opened = openWith(projectId, prompt, ask.promptId, {
          title: `Set up ${project.name}`,
          setup: true,
        });
        wakeForSetup(
          project,
          opened.thread.id,
          "prompt",
          ask.template,
          opened.send
        );
        return summaryOf(opened.thread);
      }
      const made = db.createThread({
        id: crypto.randomUUID(),
        projectId,
        title: `Set up ${project.name}`,
        setup: true,
        first: eventRow(
          ask.note ?? {
            title: `Project · ${project.name} made`,
            event: { kind: "project", what: "made", name: project.name },
          }
        ),
      });
      said(made.thread, made.message, false);
      wakeForSetup(project, made.thread.id, "offer", ask.template);
      return summaryOf(made.thread);
    },

    /**
     * A machine came online: a project whose Setup thread Caw never answered
     * (none was online when it was made, or his session went with its
     * machine) is set up now, on or off: setting it up was your ask. A
     * prompt still queued goes under its own uuid.
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
        const [first] = db.threadSends(thread.id);
        templateOf(project.id).then(
          (template) =>
            wakeForSetup(
              project,
              thread.id,
              first ? "prompt" : "offer",
              template,
              first
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
                title: `Task · ${waiting.title} waits for you in ${waiting.stage}`,
                event: {
                  kind: "task",
                  taskId: waiting.id,
                  title: waiting.title,
                  stage: waiting.stage,
                },
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
        noteIn(project.id, undefined, endNote(project.id, item));
      }
    },

    /**
     * A report or a question from `from` reached `leadId` (server.ts
     * `reportTo`, `deliverDelegateAsk`): when `leadId` is a project's Caw,
     * the turn it starts, or joins, is that work's (its item's origin; a
     * session's own ask is yours), and its send (`sent`, when the hub took
     * it) waits to be read as any wake does. An attempt's report is the wake
     * of the thread its end is noted in ({@link attemptThread}), which reads
     * `working` until the turn that reads it ends; any other session's
     * report or question is the wake of the thread it works for, recorded on
     * it at its spawn (`spawnThread`), else of the project's newest
     * conversation (never a routine's own thread); with none, it says `what`
     * it answers on his panel. It never takes the thread of the turn it
     * joins ({@link follow}): a routine run's thread holds that run alone.
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
      const attempt =
        report && item?.taskId && (item.origin === "you" || project.caw)
          ? attemptThread(project.id, item)
          : undefined;
      const recorded = from.threadId ? db.thread(from.threadId) : undefined;
      const threadId =
        attempt ??
        (recorded?.projectId === project.id ? recorded.id : undefined) ??
        db.newestConversation(project.id)?.id;
      follow(leadId, project.id, by, sent, threadId ? { threadId } : { what });
    },

    /**
     * Your picks on a page Caw asked in `threadId` (artifacts/service.ts
     * `send`, `meta.asked.thread`) reached him as `sent`: that thread follows
     * the turn that reads them, as your words in it do ({@link followWake}),
     * so what he says there is his reply in it. Nothing for a session that is
     * no project's lead, or a thread not of his project.
     */
    picked(leadId: string, sent: string, threadId: string): void {
      const project = leadOf(row(leadId));
      if (project && db.thread(threadId)?.projectId === project.id) {
        followWake(leadId, project.id, "you", sent, threadId);
      }
    },

    /**
     * The thread a session's ask on your card goes to, when the session is its
     * project's lead: the one whose message woke this turn, else the
     * project's newest conversation (never a routine's own thread, which
     * only notes its runs). Undefined for any other session.
     */
    askThread(asker: InstanceRow): string | undefined {
      const project = leadOf(asker);
      return project
        ? (turns.get(asker.id)?.threadId ??
            db.newestConversation(project.id)?.id)
        : undefined;
    },

    /**
     * One of his shell or edit calls, noted in the thread his turn answers,
     * else the project's newest conversation (lead-gate.ts): nothing for a session that
     * is no project's lead.
     */
    noteCall(instanceId: string, note: ThreadNote): void {
      const project = leadOf(row(instanceId));
      if (!project) {
        return;
      }
      // A turn under way answers its own thread, or none (the project's
      // newest conversation); only a call after its turn's record ended
      // goes where that turn answered.
      const turn = turns.get(instanceId);
      noteIn(project.id, turn ? turn.threadId : answered.get(instanceId), note);
    },

    /** An ask tagged to a thread was parked or settled: its status moved. */
    asksChanged(threadId: string): void {
      upsert(db.thread(threadId));
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

    /**
     * Caw's thread, view and folder tools, for the session
     * `actor` and its call `toolUseId` (where a proposal it parks is drawn);
     * refused to any session but its project's lead.
     */
    tools(actor: InstanceRow | undefined, toolUseId?: string) {
      const mine = (): string => {
        const project = leadOf(actor);
        if (!project) {
          throw new Error(
            "Threads and views are the project lead's: this session is not its project's Caw."
          );
        }
        return project.id;
      };
      /** The lead calling: discovery, with no session, executes nothing. */
      const me = (): InstanceRow => {
        if (!actor) {
          throw new Error("Discovery cannot execute tools");
        }
        return actor;
      };
      /**
       * The project whose folder `folder_read` reads: the lead's, or a
       * delegate's own project (roles.ts), what one delegate hands in for the
       * next to read on any machine. Never another's.
       */
      const readsFolder = (): string => {
        if (actor && roleOf(actor) === "delegate") {
          if (!(actor.projectId && db.project(actor.projectId))) {
            throw new Error(
              "This delegate belongs to no project, so it has no project folder to read."
            );
          }
          return actor.projectId;
        }
        return mine();
      };
      return [
        tool(
          "thread_read",
          "Read your threads with the person: all, newest first with each last message; or one `thread`'s messages, oldest first.",
          { thread: z.string().optional() },
          ({ thread }) => {
            const projectId = mine();
            return Promise.resolve(
              thread
                ? read(projectId, threadNamed(projectId, thread))
                : db.projectThreads(projectId).map((listed: ThreadListRow) => ({
                    ...summaryOf(listed),
                    last: listed.last,
                  }))
            );
          },
          threadReadWords
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
          async ({ thread: asked, body, tasks, files }) => {
            const projectId = mine();
            const thread = threadNamed(projectId, asked);
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
            // His reply stands where his words as he wrote them were.
            if (actor) {
              speech.get(actor.id)?.replied.add(thread);
            }
            tail(thread, { streaming: "" });
            said(added.thread, added.message);
            return { ok: true, message: added.message.id };
          },
          threadRepliedWords
        ),
        tool(
          "folder_read",
          "Read a file, or list a folder (no path: the root), of your project's folder on the hub.",
          { path: z.string().optional() },
          async ({ path }) => {
            const projectId = readsFolder();
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
            const projectId = mine();
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
                author: { name: "Caw" },
              })
            );
            folderChanged(projectId);
            return { ok: true, path: rel, sha: written.sha };
          },
          folderWrittenWords
        ),
        tool(
          "view_draft",
          "Draft a view for the person to keep or discard, as the event says. Components outside CawCo's library are dropped and named in the answer.",
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
            const projectId = mine();
            const drafted = await draftView(projectId, input);
            noteIn(
              projectId,
              actor ? turns.get(actor.id)?.threadId : undefined,
              {
                title: `View · Caw drafted “${drafted.view}”`,
                event: { kind: "view", name: drafted.view },
              }
            );
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
            const projectId = mine();
            return await folderCall(() =>
              views.query(projectId, name, args ?? {})
            );
          },
          viewQueryWords
        ),
        tool(
          "project_setup",
          "Setup's steps, to follow in `thread` whenever the person asks you to set the project up: the first time, again, or one part.",
          {
            thread: z.string().describe("Its id."),
            change: z
              .array(z.enum(SETUP_PARTS))
              .optional()
              .describe("Answered parts to ask again."),
          },
          async ({ thread: asked, change }) => {
            const projectId = mine();
            const thread = threadNamed(projectId, asked);
            threadIn(projectId, thread);
            const stages = await folderCall(() => stagesOf(projectId));
            const template = await folderCall(() => templateOf(projectId));
            // Awaited above: the thread again, in the step that marks it.
            threadIn(projectId, thread);
            // Setup runs here now: the thread is a Setup thread, so its
            // reply naming the files he wrote offers "Open the board".
            upsert(db.setSetupThread(thread));
            return setupText(projectOf(projectId), thread, "ask", template, {
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

const answer = (error: unknown) => {
  if (error instanceof CawRefusal) {
    return status(error.status, error.message);
  }
  return status(502, error instanceof Error ? error.message : String(error));
};

const HARNESS = t.Union(CAW_HARNESSES.map((harness) => t.Literal(harness)));
const BLOCK_PAGE = t.Union(BLOCK_PAGES.map((page) => t.Literal(page)));

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
    // Archive a thread: the rails leave it and what it started out; a new
    // message in it, or Unarchive, brings it back.
    .post("/api/projects/:id/threads/:threadId/archive", ({ params }) => {
      try {
        return caw.archive(params.id, params.threadId, true);
      } catch (error) {
        return answer(error);
      }
    })
    .post("/api/projects/:id/threads/:threadId/unarchive", ({ params }) => {
      try {
        return caw.archive(params.id, params.threadId, false);
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
          /** The ask's id, chosen by its device: the same id again is the same ask. */
          id: t.Optional(t.String()),
        }),
      },
      ({ params, body, request, server }) => {
        server?.timeout(request, 0);
        try {
          return caw.requestView(
            params.id,
            body.text,
            body.page
              ? { page: body.page, position: body.position ?? null }
              : null,
            body.id
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
