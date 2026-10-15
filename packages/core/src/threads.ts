/**
 * A project's threads: your conversations with its Caw (Projects spec §5.6,
 * the hub's `caw.ts`). The shapes the routes answer, the `thread.upsert` and
 * `thread.message` frames carry, and the dashboard draws.
 */
import type { CawHarness } from "./delegate-types";
import type { UserAnswers, UserQuestion } from "./harness";

/** A project's Caw, as `GET`/`PATCH /api/projects/:id/caw` answer it. */
export interface CawView {
  /**
   * What his turn answers when no thread woke it ("Answering a report from
   * site#4f2a"): shown on his panel, as no thread is working on it; null
   * when he is at rest or a thread's turn.
   */
  answering: string | null;
  harness: CawHarness;
  /** Caw's session, once the hub has started one. */
  leadInstanceId: string | null;
  /** The model Caw's session runs; null: its harness's default. */
  model: string | null;
  on: boolean;
  /** Why Caw could not start now, on or off; null when he could. */
  problem: string | null;
  /**
   * What Caw started that still runs, as his off control lists it, each lead
   * row followed by its delegates: the sessions his work items run, and his
   * own turn while an event started it. Turning him off with any of these
   * running asks whether they finish or stop; off, what still finishes.
   */
  running: CawRunning[];
  /** Dollars every Caw session of the project has cost. */
  spendUsd: number;
}

/**
 * One thing Caw started that still runs: a session as a project's forget
 * lists it (project-stops `RunningSession`), and what it is.
 */
export interface CawRunning {
  cwd: string;
  id: string;
  /** An attempt at a task, a delegate of his, or his own turn an event started. */
  kind: "attempt" | "delegate" | "turn";
  machineId: string;
  /** Its machine is not connected: it stops when its machine is back. */
  offline: boolean;
  /** The nearest running row it is a delegate of; null for a top row. */
  parentId: string | null;
  /** Its task, for an attempt. */
  taskId: string | null;
  /** Its name (a turn's: what it answers); null names it by its folder. */
  title: string | null;
}

/** What happens to what Caw started as you turn him off: it runs to its end, or stops now. */
export type CawInitiated = "finish" | "stop";

/**
 * Where a thread stands, derived on every read and never stored: `working`
 * while the lead session is busy on a turn that thread woke, `needs-you`
 * while a question the lead asked in it is parked, else `ready`.
 */
export type ThreadStatus = "working" | "needs-you" | "ready";

/**
 * Caw's turn answering your words in a thread, before his reply lands: his
 * session, and the send his turn read your words as.
 */
export interface ThreadHearing {
  instanceId: string;
  send: string;
}

/** A thread as the project's list and the `thread.upsert` frame carry it. */
export interface ThreadSummary {
  /**
   * While his turn has read your words here and not yet answered them: what
   * he says in plain text after that send in his session is posted here as
   * his reply when the turn ends, so the thread draws it as he writes it.
   * Absent otherwise.
   */
  hearing?: ThreadHearing;
  id: string;
  /** When its newest message was added, ms epoch. */
  lastAt: number;
  projectId: string;
  /**
   * The project's Setup thread: the one New project opens with your prompt,
   * where Caw shows the setup page and lists what he wrote. Its replies that
   * name files offer "Open the board".
   */
  setup: boolean;
  status: ThreadStatus;
  title: string;
}

/** The questions the lead asked you in a thread (its AskUserQuestion). */
export interface ThreadQuestion {
  questions: UserQuestion[];
  /**
   * The lead's call that asked them: the parked card on the thread's
   * composer settles into the answered row that carries it.
   */
  toolUseId?: string;
}

/** How you answered them: your choices, or that you walked away from them. */
export type ThreadAnswer =
  | {
      /** Per-question notes (preview selections), keyed by question text. */
      annotations?: Record<string, { notes?: string; preview?: string }>;
      answers: UserAnswers;
      outcome: "answered";
    }
  | { outcome: "dismissed" };

interface ThreadMessageBase {
  createdAt: number;
  id: string;
  threadId: string;
}

/**
 * Yours: words you wrote, or your answer to the lead's question. An answer
 * carries `question` and `answer`, and `body` reads it in one line.
 */
export interface YourThreadMessage extends ThreadMessageBase {
  answer?: ThreadAnswer;
  author: "you";
  body: string;
  question?: ThreadQuestion;
}

/**
 * Caw's, through `thread_reply`; `tasks` names the tasks it is about
 * (`tsk-12`), `files` the project folder's files it wrote (`stages.md`).
 */
export interface CawThreadMessage extends ThreadMessageBase {
  author: "caw";
  body: string;
  files?: string[];
  tasks?: string[];
}

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

/** How an attempt or a delegate's work item ended. */
export type ItemEnd = "done" | "failed" | "cancelled";

/**
 * What a thread's event is, as typed data: the ids the dashboard looks
 * things up by, and the words the hub had when it wrote it (a task's title,
 * a routine's name). A task or session is never named by its id in words.
 */
export type ThreadEvent =
  | {
      kind: "routine";
      name: string;
      /**
       * `started`: a lead run woke Caw; `delivered`: a run's output;
       * `failed`: its second failure, which needs you.
       */
      phase: "started" | "delivered" | "failed";
      routineId: string;
      runId: string;
      schedule: RoutineSchedule;
      /** The run's slot (a time, `test:…`, `now:…`, `event:…`, `inbox:…`). */
      slot: string;
      /** The slot in words: "09:00" in the routine's zone, "test", "by-hand", "event", "inbox". */
      slotLabel: string;
    }
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
  | {
      /** The command or file of one of Caw's gated calls; absent for a wake. */
      command?: string;
      kind: "caw";
      /** Your words that did not wake him: on every `not-woken` event, and only there. */
      notWoken?: CawNotWoken;
      what:
        | "not-woken"
        | "could-not-start"
        | "ran"
        | "edited"
        | "refused"
        | "denied"
        | "guard";
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
      /** The project memory file (`AGENTS.md`, `knowledge/<topic>.md`). */
      path: string;
      /** Its commit; null for a change you declined. */
      sha: string | null;
      /** Caw wrote it, or you answered his proposal for it. */
      what: "wrote" | "approved" | "declined";
    }
  | {
      commit: string | null;
      kind: "repo";
      machineId: string;
      /** The folder made a repository. */
      root: string;
    }
  | { kind: "hub"; what: "thread-repaired" }
  /**
   * Held back from the wire: an app that reads `event` closed (TestFlight
   * 20261015) cannot read it, so the hub sends it as
   * `EventThreadMessage.routineMade` beside a null `event` (hub caw.ts
   * `wireEvent`; the bridge in hub scripts/wire-compat.ts) until no
   * installable app needs that. Declared here so the apps built from now on
   * read it.
   */
  | RoutineMadeThreadEvent;

/**
 * A session made a routine with `routine_create` (routines.ts `announce`):
 * the notice in the thread its maker's turn was in, or the routine's own
 * thread when it was in none. Keep, Turn off and Open act on `routineId`
 * through `/api/routines/:id`.
 */
export interface RoutineMadeEvent {
  /** `caw`: the project's Caw made it; `delegate` or `session`: another session. */
  by: "caw" | "delegate" | "session";
  /** When it turns itself off unless kept, ms epoch; null when it was kept as it was made. */
  expiresAt: number | null;
  /** The session that made it. */
  instanceId: string;
  name: string;
  routineId: string;
  schedule: RoutineSchedule;
  /** What the making turn said just before the call, one paragraph; null when it said nothing. */
  why: string | null;
}

/** {@link RoutineMadeEvent} as a ThreadEvent kind. */
export interface RoutineMadeThreadEvent extends RoutineMadeEvent {
  kind: "routine-made";
}

/**
 * Why your words did not wake Caw: `no-machine`, no machine is online for
 * him; `capped`, the project is past its spend cap; `could-not-start`, his
 * session could not be started; `place`, his place's boundary could not be
 * held on his machine; `not-taken`, his session did not take the message;
 * `failed`, anything else (its words say what).
 */
export type CawNotWokenReason =
  | "no-machine"
  | "capped"
  | "could-not-start"
  | "place"
  | "not-taken"
  | "failed";

/**
 * Your words in a thread that did not wake Caw (a `not-woken` event): why,
 * the hub's sentence for it, and your message he has not read, which Try
 * again (`POST /api/projects/:id/threads/:threadId/wake`) wakes him with.
 */
export interface CawNotWoken {
  /** Your message in the thread he has not read. */
  message: string;
  reason: CawNotWokenReason;
  /** The cause, in the hub's words ("No machine is online, so Caw can't start."). */
  words: string;
}

/** A note in a thread as its writers give it: one line, its fold, and what it is. */
export interface ThreadNote {
  body?: string;
  event: ThreadEvent;
  title: string;
}

/** Something that happened and woke Caw: a routine, an attempt landing, a task waiting for you. */
export interface EventThreadMessage extends ThreadMessageBase {
  author: "event";
  /** What happened, opened like a fold; absent when the title says it all. */
  body?: string;
  /**
   * What happened, as typed data; null on a note stored before events were
   * typed, and on one whose kind is held back from it ({@link routineMade}).
   */
  event: ThreadEvent | null;
  /**
   * One line: source and what, like "Routine · Triage issues · 09:00". The
   * time is not in it: a reader draws `createdAt` in their own time zone.
   */
  noteTitle: string;
  /**
   * A session made a routine, with `event` null: the ThreadEvent kind
   * `routine-made`, held back while an installable app reads `event` closed
   * (a bridge, hub scripts/wire-compat.ts BRIDGES).
   */
  routineMade?: RoutineMadeEvent;
}

export type ThreadMessage =
  YourThreadMessage | CawThreadMessage | EventThreadMessage;

/** A thread and its messages, oldest first: `GET /api/projects/:id/threads/:threadId`. */
export interface ThreadRead {
  messages: ThreadMessage[];
  thread: ThreadSummary;
}

/**
 * What reaching a project's spend cap does (Projects spec §5.3): `pause`
 * starts no new attempts at its tasks, `quiet` books what would wake its Caw
 * without a turn, `both` does both. The fleet has a default (Configure,
 * Spend); a project may set its own.
 */
export type OnCap = "pause" | "quiet" | "both";

/** The span a project's cap counts over, in the hub's own zone. */
export type CapPeriod = "day" | "month";

/**
 * A project's spend cap as it stands now: what the period has spent
 * against it, and what reaching it does. Spend is every session of the
 * project's (its Caw and its attempts) since the period began.
 */
export interface ProjectCap {
  /** `onCap` is the fleet default, not the project's own. */
  inherited: boolean;
  /** What reaching it does: the project's own, else the fleet's. */
  onCap: OnCap;
  period: CapPeriod;
  /** Spent at or past the cap. Read with `resetsAt`: past it, the cap is not reached. */
  reached: boolean;
  /** When the next period begins, ms epoch; the cap counts from zero then. */
  resetsAt: number;
  spentUsd: number;
  /** When this period began, ms epoch. */
  startsAt: number;
  usd: number;
}

/** The cap holds back what it says now: reached, and its period still running. */
export const capHolds = (
  cap: ProjectCap | null | undefined,
  now: number
): boolean => cap?.reached === true && now < cap.resetsAt;

/**
 * What a project has spent, as `GET /api/projects/:id/spend` answers it, in
 * dollars, read now. Each part has one source: its Caw's turns as they were
 * booked (each turn's cost, from its result), its attempts' and other
 * sessions' usage as their machines reported it (a lead's sessions are not
 * counted twice). The parts add up: `monthUsd` is Caw's month, every
 * attempt's month and the others' month; Caw's month is its threads' month
 * and the turns no thread woke. Days and months are the hub's own (its
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
  /** The project's Caw: its booked turns; `unthreadedMonthUsd`, this month's no thread woke. */
  caw: { monthUsd: number; todayUsd: number; unthreadedMonthUsd: number };
  /** What reaching a cap does when the project sets nothing: the fleet's default. */
  fleetOnCap: OnCap;
  /** The first of this month, ms epoch. */
  monthStart: number;
  monthUsd: number;
  /** Every session of the project that is neither its Caw nor an attempt. */
  others: { monthUsd: number; todayUsd: number };
  /**
   * Each thread that moved this month, newest first: how many times it
   * woke Caw this month (your messages and events) and what those turns
   * cost (each turn's cost, booked to the thread that woke it).
   */
  threads: {
    id: string;
    lastAt: number;
    title: string;
    usd: number;
    wakes: number;
  }[];
  /** Midnight today, ms epoch. */
  todayStart: number;
  /** Every session of the project. */
  todayUsd: number;
}

/** Your message as the hub took it: the thread (new or moved) and the message. */
export interface ThreadSaid {
  message: ThreadMessage;
  thread: ThreadSummary;
}
