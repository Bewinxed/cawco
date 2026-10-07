/**
 * A project's threads: your conversations with its Caw (Projects spec §5.6,
 * the hub's `caw.ts`). The shapes the routes answer, the `thread.upsert` and
 * `thread.message` frames carry, and the dashboard draws.
 */
import type { CawHarness } from "./delegate-types";
import type { UserAnswers, UserQuestion } from "./harness";

/** A project's Caw, as `GET`/`PATCH /api/projects/:id/caw` answer it. */
export interface CawView {
  harness: CawHarness;
  /** Caw's session, once the hub has started one. */
  leadInstanceId: string | null;
  /** The model Caw's session runs; null: its harness's default. */
  model: string | null;
  on: boolean;
  /** Why Caw could not start now, while it is on; null when it could. */
  problem: string | null;
  /** Dollars every Caw session of the project has cost. */
  spendUsd: number;
}

/**
 * Where a thread stands, derived on every read and never stored: `working`
 * while the lead session is busy on a turn that thread woke, `needs-you`
 * while a question the lead asked in it is parked, else `ready`.
 */
export type ThreadStatus = "working" | "needs-you" | "ready";

/** A thread as the project's list and the `thread.upsert` frame carry it. */
export interface ThreadSummary {
  id: string;
  /** When its newest message was added, ms epoch. */
  lastAt: number;
  projectId: string;
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

/** Caw's, through `thread_reply`; `tasks` names the tasks it is about (`tsk-12`). */
export interface CawThreadMessage extends ThreadMessageBase {
  author: "caw";
  body: string;
  tasks?: string[];
}

/** Something that happened and woke Caw: a routine, an attempt landing, a task waiting for you. */
export interface EventThreadMessage extends ThreadMessageBase {
  author: "event";
  /** What happened, opened like a fold; absent when the title says it all. */
  body?: string;
  /**
   * One line: source and what, like "Routine · 3 new GitHub issues". The
   * time is not in it: a reader draws `createdAt` in their own time zone.
   */
  noteTitle: string;
}

export type ThreadMessage =
  | YourThreadMessage
  | CawThreadMessage
  | EventThreadMessage;

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
