/**
 * The Exchange (decision surface, option 3): every asking session is a
 * thread, and its asks, his picks and notes, the agent's replies, revisions,
 * settlements, defaults and endings are messages in time order. These are
 * the shapes the screens draw, fed by `records.ts`.
 */

import type { BuiltInKind, MemberType } from "@cawco/core/decides";

/** Where a kind of decision goes (Who decides). */
export type Route = Extract<MemberType, "you" | "advisor" | "practice">;

/** A decision's kind, as the product names them; none means it is his. */
export type Kind = BuiltInKind;

export interface Option {
  /** What it costs. */
  cost: string;
  id: string;
  label: string;
  /** What it gets him. */
  line: string;
  recommended: boolean;
}

/** How a decision was decided when not by him. */
interface Settlement {
  at: string;
  by: Extract<MemberType, "advisor" | "practice" | "agent">;
  /** Who, as the record names them ("Advisor"). */
  name: string;
  sources: string[];
  why: string;
}

export interface Decision {
  /** The decision in the same ask this one only makes sense after. */
  after?: string;
  /** What was chosen, once decided. */
  chosen?: string[];
  id: string;
  kind: Kind | null;
  multiple?: boolean;
  /** His note on it, once sent. */
  note?: string;
  options: Option[];
  /** A picture the decision refers to; a tap opens it live beside the thread. */
  picture?: { title: string; caption: string };
  question: string;
  settled?: Settlement;
  why: string;
}

export type Message =
  | {
      kind: "ask";
      id: string;
      at: string;
      /** Stops work until he answers; otherwise the agent went on. */
      blocking: boolean;
      /** What a group is about, said once. */
      topic?: string;
      decisions: Decision[];
      /** What waits on it: tasks not started, a step, money not spent. */
      waits: string[];
    }
  | {
      kind: "you";
      id: string;
      at: string;
      picks: { question: string; label: string }[];
      note?: string;
      /** The send failed: his words stay, with Try again. */
      failed?: string;
    }
  | { kind: "agent"; id: string; at: string; text: string }
  | {
      kind: "revised";
      id: string;
      at: string;
      changed: string;
      kept: string;
    }
  | {
      kind: "settled";
      id: string;
      at: string;
      decision: Decision;
      settlement: Settlement;
    }
  | {
      kind: "ahead";
      id: string;
      at: string;
      decision: Decision;
      /** The default the agent named and took. */
      chosen: string;
      since: string;
    }
  | {
      kind: "ended";
      id: string;
      at: string;
      neverPicked: string[];
      takenBy: string;
    }
  | {
      /** The agent's account of what changing a decision costs. */
      kind: "cost";
      id: string;
      at: string;
      about: string;
      text: string;
      touches: string[];
    }
  | { kind: "missing"; id: string; count: number };

type Harness = "Claude Code" | "OpenCode" | "pi";

/** Where a thread stands, which orders the list. */
export type Standing = "stopped" | "ahead" | "quiet" | "ended" | "aside";

export interface Thread {
  /** What the session is doing now. */
  doing: string;
  harness: Harness;
  id: string;
  isNew?: boolean;
  /** Its state line, after the state word. */
  line: string;
  machine: string;
  messages: Message[];
  /** The words of its newest ask or line. */
  newest: string;
  /** Asks still open in it. */
  open: number;
  project: string;
  /** The session's title. */
  session: string;
  /** Its machine has not reported since this time. */
  silentSince?: string;
  /** When it stopped, went ahead or went quiet. */
  since: string;
  standing: Standing;
}

/**
 * Where a thread stands as he works it: what he picked and wrote, whether
 * it was sent and answered, Pick again, Correct it, and how it was read.
 * Each field is a state a story can force.
 */
export interface Moment {
  /** Correct it, on a default the agent went ahead with, is open. */
  correcting?: boolean;
  /** The agent's account of what changing it costs. */
  costAccount?: { text: string; touches: string[] };
  draft?: string;
  /** The send did not reach the hub. */
  failed?: boolean;
  /** Reading the thread: drawn, still being read, or the read failed. */
  load?: "ready" | "loading" | "failed";
  /** Messages the hub could not fetch, at the thread's start. */
  missing?: number;
  /** Pick again on a decided one: not asked, asked, or answered with its cost. */
  pickAgain?: "none" | "asked" | "answered";
  /** The decision Pick again was pressed on. */
  pickAgainOn?: string;
  picks?: Record<string, string[]>;
  /** The agent's line after his send has arrived. */
  replied?: boolean;
  /** What the agent said back; by default it resumes with his picks. */
  reply?: string;
  /** The ask the agent revised after his words. */
  revision?: { changed: string; kept: string };
  /** His picks and words have gone. */
  sent?: boolean;
}

/** The clock every fixture is read against: 31 Oct 2026, 14:50 UTC. */
const NOW = Date.parse("2026-10-31T14:50:00Z");

/** "4h 54m", "12m", "2d 3h": how long since `iso`. */
export function since(iso: string, now = NOW): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const DAY = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

/** A message's time: its clock today, its day before. */
export function clock(iso: string, now = NOW): string {
  const at = new Date(iso);
  const today = new Date(now).toDateString() === at.toDateString();
  return today ? CLOCK.format(at) : `${DAY.format(at)}, ${CLOCK.format(at)}`;
}

/** A record's day, for search results. */
export function day(iso: string): string {
  return DAY.format(new Date(iso));
}

/** How the list orders threads: what their delay costs, then age. */
const RANK: Record<Standing, number> = {
  stopped: 0,
  ahead: 1,
  quiet: 2,
  ended: 3,
  aside: 4,
};

export function byCost(a: Thread, b: Thread): number {
  return RANK[a.standing] - RANK[b.standing] || a.since.localeCompare(b.since);
}
