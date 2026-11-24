/**
 * A project's conversation (Projects spec §5.6, the hub's `caw.ts`): the
 * session its events reach, a session like any other whose scope is the
 * project. The shapes its routes answer, the notes the hub keeps for the
 * person in its transcript, and what the project spends.
 */

import type { OnCap, ProjectCap } from "./areas";
import type { HarnessKind } from "./harness/kinds";
import type { OfferedMode, PermissionMode } from "./harness/modes";
import type { ItemEnd } from "./work-items";

/**
 * Why the project's conversation can't start when no machine is online, and
 * how to fix it, in the error formula's order (DESIGN.md, Voice): the hub's
 * refusal and the view's `problem`, the panel's alert, and an empty
 * Routines or Event sources page's reason. Its next step names no place and
 * no writing, as it stands where the composer may or may not.
 */
export const CAW_NO_MACHINE =
  "No machine is online, so the project's conversation can't start. Bring one online and it can.";

/**
 * How every start of a project's conversation goes, the hub's start and the
 * person's alike (hub caw.ts `startOf`, `POST /api/projects/:id/caw/place`):
 * where it runs, on the project's harness and model, in the project's mode
 * (its own, its area's, the fleet's), else the one the person last chose for
 * that harness on that machine. A null mode is no mode: the start is refused
 * with the machine and harness to ask one for (core `ModeAsk`).
 */
export interface CawStart {
  cwd: string;
  harness: HarnessKind;
  machineId: string;
  /** Null: the harness's default model. */
  model: string | null;
  permissionMode: PermissionMode | null;
}

/** A project's conversation, as `GET`/`PATCH /api/projects/:id/caw` answer it. */
export interface ProjectConversationView {
  /** Whether the person's comment on a task reaches its attempt, live or ended (hub jev-tasks.ts). */
  attemptsHearComments: boolean;
  /**
   * Whether the project's sessions, Caw among them, may change what his chat
   * and each kind of trigger run as (account, harness and model, mode:
   * hub project-settings.ts `set_caw`, `set_trigger`, `set_account`), the
   * settings Caw's settings panel holds; off, they read them only. The
   * panel's "Allow Caw to change these settings".
   */
  changesSettings: boolean;
  harness: HarnessKind;
  /**
   * Whether the conversation reads what the person writes on the project's
   * tasks: a comment, a to-do or a task they add (hub task-input.ts). On or
   * off, like the rest of their words.
   */
  hearsTasks: boolean;
  /** The conversation's session, once the hub has started one. */
  instanceId: string | null;
  /**
   * The permission mode the hub starts the project's conversation in, the
   * project's own; null: the fleet's, else the one the person last chose
   * for its harness on that machine. A routine's or an event route's own
   * wins over it.
   */
  mode: OfferedMode | null;
  /** The model Caw's session runs; null: its harness's default. */
  model: string | null;
  on: boolean;
  /** Why Caw could not start now, on or off, or why its last start failed; null when he could. */
  problem: string | null;
  /**
   * What Caw started that still runs, as his off control lists it, each lead
   * row followed by its delegates: the sessions his work items run, and his
   * own turn while an event started it. Turning him off with any of these
   * running names which stop; the rest finish.
   */
  running: CawRunning[];
  /** Dollars every Caw session of the project has cost. */
  spendUsd: number;
  /**
   * His conversation is being started now (a project just made with Caw: its
   * create answers once the project is made, and his start carries on).
   */
  starting: boolean;
  /**
   * The session his start is making, minted before its spawn is asked for,
   * while that start runs: his panel draws it as his conversation from the
   * first moment, its transcript read once the start has named it. Null
   * while no start runs.
   */
  startingId: string | null;
}

/**
 * One thing Caw started that still runs: a session as a project's forget
 * lists it (project-stops `RunningSession`), and what it is.
 */
export interface CawRunning {
  cwd: string;
  id: string;
  /** An attempt at a task, or a delegate of the conversation's. */
  kind: "attempt" | "delegate";
  machineId: string;
  /** Its machine is not connected: it stops when its machine is back. */
  offline: boolean;
  /** The nearest running row it is a delegate of; null for a top row. */
  parentId: string | null;
  /** Its task, for an attempt. */
  taskId: string | null;
  /** Its task's title, for an attempt, as the project's index has it. */
  taskTitle: string | null;
  /** Its name (a turn's: what it answers); null names it by its folder. */
  title: string | null;
}

/** What Caw started, as you turn him off: the ids that stop now; the rest run to their end. */
export interface CawInitiated {
  stop: string[];
}

/**
 * What Caw shows: the product's status words, each drawn as its own file,
 * assets/mascot/caw/<status>.riv. A conversation's live state (find.ts `FindLiveState`) are said in these words.
 */
const CAW_STATUSES = [
  "ready",
  "working",
  "needs-you",
  "idle",
  "done",
  "trying",
  "loading",
  "reconnecting",
  "sleeping",
  "compacted",
] as const;
export type CawStatus = (typeof CAW_STATUSES)[number];

/** The `noteKind` of a project note's line in its conversation's transcript (hub caw.ts `noteOwnAct`). */
export const CAW_EVENT_NOTE = "caw.event";

/** A routine's schedule as the person reads it: its cron in words, in its zone, and its next run. */
export interface RoutineSchedule {
  /** The cron expression, as written. */
  cron: string;
  /** When the next scheduled run is due, ms epoch; null for a routine that is off. */
  nextAt: number | null;
  timeZone: string;
  /** "At 03:00, every day (Europe/London)". */
  words: string;
}

/**
 * What a project note is about, as typed data: the ids the dashboard looks
 * things up by, and the words the hub had when it wrote it (a task's title,
 * a routine's name). A task or session is never named by its id in words.
 */
export type ProjectNoteEvent =
  | {
      /** The session the attempt ran in. */
      instanceId: string;
      kind: "attempt";
      /** `ended`: the attempt ended (`state`); `judge`: its acceptance criteria wait for Caw. */
      phase: "ended" | "judge";
      /** Its outcome, once ended; null while its criteria wait. */
      state: ItemEnd | null;
      taskId: string;
      /** The task's title as the hub had it. */
      title: string;
      /** Which try at the task this was, 1 for the first. */
      try: number;
      workItemId: string;
    }
  | {
      /** The delegate's session. */
      instanceId: string;
      kind: "delegate";
      state: ItemEnd;
      title: string;
      workItemId: string;
    }
  | {
      kind: "task";
      /** The stage of kind `you` it now waits in. */
      stage: string;
      taskId: string;
      title: string;
    }
  | { kind: "view"; name: string }
  | { kind: "agents"; sha: string }
  | {
      /** The session fleet watch nudged about. */
      instanceId: string;
      kind: "fleet";
      /** The session's name as fleet watch had it. */
      name: string;
    }
  | {
      kind: "phone";
      /** The task the sentence is about, and its title; null for none. */
      task: { id: string; title: string } | null;
    }
  | {
      kind: "project";
      /** The offer or session the project was made from, in words; absent when it had none. */
      from?: string;
      name: string;
      what:
        "made" | "settings-changed" | "settings-approved" | "settings-declined";
    }
  | {
      kind: "file";
      /** The project memory file (`AGENTS.md`, `knowledge/<topic>.md`), or the fleet memory document a fleet proposal changes. */
      path: string;
      /** Its commit, or a fleet document's hash; null for a change you declined. */
      sha: string | null;
      /** Caw wrote it, or you answered his proposal for it. */
      what: "wrote" | "approved" | "declined";
    };

/** Who made a routine: a delegate, or a session in conversation. */
export type RoutineMadeBy = "delegate" | "session";

/** Where a project's design offer stands (`GET /api/projects/:id/design-offer`). */
export interface DesignOfferState {
  /** `open` while unanswered; `built`: Build filed the task; `dismissed`: Not now. */
  answer: "open" | "built" | "dismissed";
  /** The task Build filed. */
  builtTaskId: string | null;
}

/**
 * An offer of the hub's waiting on the person's answer, as Needs you lists
 * it (hub offers-waiting.ts): never a line in the project's Caw chat.
 *
 * - `design`: a design-shaped task entered an active stage in a project with
 *   no design system (hub design-offers.ts); Build and Not now answer it
 *   through `/api/projects/:id/design-offer`.
 * - `lfs-refused`: a checkout's `.lfsconfig` names an LFS server the project
 *   never declared, so its large files stayed pointers (hub routes/lfs.ts);
 *   declared in the project's settings, or put away with Dismiss through
 *   `/api/lfs-refusals/dismiss`.
 */
export type WaitingOffer =
  | {
      kind: "design";
      /** When it was raised, ms epoch. */
      offeredAt: number;
      projectId: string;
      /** What the build would read, in words: "the repository's styles and components". */
      sources: string[];
      /** The task whose move raised it. */
      taskId: string;
    }
  | {
      /** The LFS server its `.lfsconfig` names. */
      endpoint: string;
      kind: "lfs-refused";
      machineId: string | null;
      offeredAt: number;
      projectId: string;
      /** The checkout whose large files stayed pointers; null when it was not said. */
      root: string | null;
    };

/** Hub-originated: every offer waiting on the person, whole, on each change. */
export interface OffersWaitingFrame {
  instanceId?: undefined;
  kind: "offers.waiting";
  offers: WaitingOffer[];
}

/** A note of the hub's to the person about a project, as its writers give it: one line, its fold, and what it is. */
export interface ProjectNote {
  body?: string;
  event: ProjectNoteEvent;
  title: string;
}

/** The cap holds back what it says now: reached, and its period still running. */
export const capHolds = (
  cap: ProjectCap | null | undefined,
  now: number
): boolean => cap?.reached === true && now < cap.resetsAt;

/**
 * What a project has spent, as `GET /api/projects/:id/spend` answers it, in
 * dollars, read now. Each part is its sessions' usage as their machines
 * reported it: its conversations', its attempts' and every other session's.
 * The parts add up: `monthUsd` is the conversations' month, every attempt's
 * month and the others' month. Days and months are the hub's own (its
 * zone, as every "today" CawCo shows). What a project's cap counts.
 */
export interface ProjectSpend {
  /** Every task attempted this month, newest activity first: its attempts' month summed. */
  attempts: {
    /** How many attempts the task has had. */
    attempts: number;
    /** When its newest attempt was made or ended, ms epoch. */
    lastAt: number;
    /** Its newest attempt's state (`done`, `failed`, `running`…). */
    state: string;
    taskId: string;
    title: string;
    /** The delegate type its newest attempt ran, if one was named. */
    type: string | null;
    usd: number;
  }[];
  /** What an attempt may spend where its task says nothing; null: no limit. */
  budget: { minutes?: number; turns?: number; usd?: number } | null;
  /** The project's spend cap; null: it has none, and no limit. */
  cap: ProjectCap | null;
  /** The project's conversations: what their sessions reported. */
  caw: { monthUsd: number; todayUsd: number };
  /** What reaching a cap does when the project sets nothing: the fleet's default. */
  fleetOnCap: OnCap;
  /** The first of this month, ms epoch. */
  monthStart: number;
  monthUsd: number;
  /** Every session of the project that is neither its Caw nor an attempt. */
  others: { monthUsd: number; todayUsd: number };
  /** Midnight today, ms epoch. */
  todayStart: number;
  /** Every session of the project. */
  todayUsd: number;
}
