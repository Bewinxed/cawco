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
  /** One line: source, time and what, like "Routine · 08:55 · 3 new GitHub issues". */
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

/** Your message as the hub took it: the thread (new or moved) and the message. */
export interface ThreadSaid {
  message: ThreadMessage;
  thread: ThreadSummary;
}
