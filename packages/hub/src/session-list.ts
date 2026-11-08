/**
 * `list_sessions`: the fleet's sessions, on every machine, as an
 * orchestrator asks of them (whose they are, which stopped at a usage limit,
 * most recently touched first), answered from what the hub stores, so a
 * machine that is offline or whose transcripts the hub does not hold is
 * answered the same.
 *
 * - `role`: `main`, the person's own sessions (no parent session, no work
 *   item); `delegate`, every session another session started; `all`.
 * - `stopped: "limit"`: sessions whose latest turn a usage limit ended and
 *   that nothing carried on since (db at-limit.ts `standingStops`), asleep or
 *   not, whatever the turn was: a stop is a stop, a recap's too. Without it,
 *   the live sessions (running, starting, or on a machine the hub can't
 *   reach), as the tool has always listed them.
 * - `sort`: `active`, by last activity (the default: the board's order the
 *   tool answered in before has no meaning, its rows as the hub first read
 *   them); `interacted`, by the person's last message to it; `created`.
 * - `since`, a page size and a cursor, as `find` takes them.
 *
 * Every caller sees every other session in the fleet, a delegate too, as
 * the tool always let it: it is how a session finds the one that owns the
 * work. Never itself, never a continuation's summariser.
 */
import { accountNameAmong } from "@cawco/core/accounts";
import type { InstanceRow } from "@cawco/core/protocol";
import type {
  NeutralOrigin,
  NeutralUserMessage,
} from "@cawco/core/session-messages";
import { refusedUntil } from "./at-limit";
import type { DbShape, SentMessageRow } from "./db";
import { redactSecrets } from "./secret-filter";

export const SESSION_ROLES = ["main", "delegate", "all"] as const;
export type SessionRole = (typeof SESSION_ROLES)[number];
export const SESSION_SORTS = ["active", "interacted", "created"] as const;
export type SessionSort = (typeof SESSION_SORTS)[number];
export const SESSION_LIST_LIMIT = 20;
export const SESSION_LIST_MAX = 50;

export interface SessionListQuery {
  limit: number;
  /** Where the page starts, in the sorted list. */
  offset: number;
  role: SessionRole;
  /** The first ms of a day: sessions active since (with `stopped`, stopped since). */
  since?: number;
  sort: SessionSort;
  stopped?: "limit";
}

/** The message a session last read, as a row says it. */
export interface SessionSaid {
  at: number;
  /** Who sent it: "the person", a session's name, "CawCo (back-recap)". */
  from: string;
  /** Its words, through the secret filter, cut short. */
  words: string;
}

/** What the hub stores of one session past its row, for `list_sessions`. */
export interface SessionFacts {
  /** The account it runs on, named; null: the machine's own sign-in, or a harness without accounts. */
  account: string | null;
  /** When the person last wrote to it; null: never. */
  interactedAt: number | null;
  /** The newest turn it read: what it was last doing. Null: it read none. */
  lastRead: SessionSaid | null;
  /** The person's last words to it, when they are not {@link lastRead}'s. */
  personSaid: SessionSaid | null;
  /** Its standing stop at a usage limit; null when it has none. */
  stop: {
    at: number;
    /** When it can go on: epoch ms, `now` (its account has room again), or null when nothing says. */
    resumes: number | "now" | null;
  } | null;
}

/** Why a session is not running a turn, when something stopped it. */
export type StopReason =
  | { kind: "limit"; at: number; words?: string }
  | { kind: "account"; words: string }
  | { kind: "error"; words: string };

export interface SessionListRow {
  account: string | null;
  activeAt: number | null;
  createdAt: number | null;
  dir: string;
  harness: string;
  id: string;
  interactedAt: number | null;
  /** Its listing tag (`sessionLabel`). */
  label: string;
  lastRead: SessionSaid | null;
  machine: string;
  /** Paused by the owner until then, epoch ms. */
  machinePausedUntil?: number;
  model: string | null;
  personSaid: SessionSaid | null;
  /** How it stands to the caller, when it does. */
  relation?: "your delegate" | "you started it" | "your parent session";
  /** When it can go on, for a session stopped at its limit or held. */
  resumes: number | "now" | null;
  role: "main" | "delegate";
  spinOff?: true;
  /** Its status as the hub sees it now (`unknown`: its machine is not connected). */
  state: string;
  stop: StopReason | null;
  title: string;
}

export interface SessionList {
  has_more: boolean;
  machines: {
    online: { id: string; name: string }[];
    paused: { id: string; name: string; until: number }[];
  };
  next_cursor: string | null;
  query: {
    role: SessionRole;
    since?: string;
    sort: SessionSort;
    stopped?: "limit";
  };
  sessions: SessionListRow[];
  total: number;
}

/** A session's role as `role` reads it: the person's own (no parent session, no work item), else another session's. */
export const sessionRole = (
  row: Pick<InstanceRow, "parentInstanceId" | "workItemId">
): "main" | "delegate" =>
  row.parentInstanceId || row.workItemId ? "delegate" : "main";

const ms = (at: string | number | Date | null | undefined): number | null => {
  if (at === null || at === undefined) {
    return null;
  }
  const value = new Date(at).getTime();
  return Number.isFinite(value) ? value : null;
};

/** When it last moved: its activity or status (`updatedAt`), its last turn's end, or its stop. */
export const activeAt = (
  row: Pick<InstanceRow, "turnEndedAt" | "updatedAt">,
  facts: SessionFacts | undefined
): number | null => {
  const times = [
    ms(row.updatedAt),
    ms(row.turnEndedAt),
    facts?.stop?.at ?? null,
  ].filter((at): at is number => at !== null);
  return times.length > 0 ? Math.max(...times) : null;
};

/** The time `sort` orders by; null sorts last. */
const sortTime = (
  sort: SessionSort,
  row: InstanceRow,
  facts: SessionFacts | undefined
): number | null => {
  switch (sort) {
    case "active":
      return activeAt(row, facts);
    case "interacted":
      return facts?.interactedAt ?? null;
    case "created":
      return ms(row.createdAt);
  }
};

/**
 * The page of `rows` the query asks for: narrowed by role and `since`,
 * sorted newest first by `sort` (none last, then by id), cut at the page.
 */
export const pageOf = (
  rows: readonly InstanceRow[],
  facts: ReadonlyMap<string, SessionFacts>,
  query: SessionListQuery
): { page: InstanceRow[]; total: number } => {
  const { since } = query;
  const kept = rows.filter((row) => {
    if (query.role !== "all" && sessionRole(row) !== query.role) {
      return false;
    }
    if (since === undefined) {
      return true;
    }
    const one = facts.get(row.id);
    const at = query.stopped ? (one?.stop?.at ?? null) : activeAt(row, one);
    return at !== null && at >= since;
  });
  const sorted = kept
    .map((row) => ({
      row,
      at: sortTime(query.sort, row, facts.get(row.id)),
    }))
    .toSorted(
      (a, b) =>
        (b.at ?? Number.NEGATIVE_INFINITY) -
          (a.at ?? Number.NEGATIVE_INFINITY) || a.row.id.localeCompare(b.row.id)
    )
    .map((one) => one.row);
  return {
    page: sorted.slice(query.offset, query.offset + query.limit),
    total: sorted.length,
  };
};

/** Why `row` is not running a turn, when something stopped it. */
export const stopOf = (
  row: InstanceRow,
  facts: SessionFacts | undefined
): StopReason | null => {
  if (facts?.stop) {
    return {
      kind: "limit",
      at: facts.stop.at,
      ...(row.stalled ? { words: row.stalled.words } : {}),
    };
  }
  if (row.stalled) {
    return { kind: "account", words: row.stalled.words };
  }
  if (row.status === "error" && row.lastError) {
    return { kind: "error", words: clip(row.lastError, 200) };
  }
  return null;
};

/** When `row` can go on: its hold's end, else its stop's. */
export const resumesOf = (
  row: InstanceRow,
  facts: SessionFacts | undefined
): number | "now" | null => row.stalled?.until ?? facts?.stop?.resumes ?? null;

const SPACES = /\s+/gu;
const WORDS_MAX = 160;

const clip = (text: string, max: number): string => {
  const line = text.replace(SPACES, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** Who sent a message, in a row's words. */
const fromOf = (origin: NeutralOrigin | undefined): string => {
  switch (origin?.kind) {
    case "human":
    case undefined:
      return "the person";
    case "peer":
      return origin.name ?? origin.from ?? "another session";
    case "system":
      return origin.name ? `CawCo (${origin.name})` : "CawCo";
  }
};

/** A send's words: a CawCo notice by its one line, else what it says. */
const wordsOf = (body: NeutralUserMessage): string => {
  if (body.origin?.kind === "system" && body.origin.line) {
    return body.origin.line;
  }
  const { content } = body.message;
  return typeof content === "string"
    ? content
    : content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join(" ");
};

const saidOf = async (
  send: SentMessageRow,
  at: number
): Promise<SessionSaid> => ({
  at,
  from: fromOf(send.body.origin),
  words: clip(await redactSecrets(wordsOf(send.body)), WORDS_MAX),
});

/**
 * What the hub stores of `rows` past their rows (their account, what they
 * last read, the person's last message, a standing stop at a usage limit
 * and when it can go on), by id; `stops` the standing stops by id.
 */
const sessionFacts = async (
  db: Pick<DbShape, "accounts" | "latestSends">,
  rows: readonly InstanceRow[],
  stops: ReadonlyMap<string, { accountId: string | null; at: number }>,
  now: number
): Promise<Map<string, SessionFacts>> => {
  const accounts = db.accounts.list();
  const readings = db.accounts.readings();
  const bench = db.accounts.bench(now);
  const nameOf = (id: string | null | undefined): string | null => {
    const account = id ? accounts.find((one) => one.id === id) : undefined;
    return account ? accountNameAmong(account, accounts) : null;
  };
  const out = new Map<string, SessionFacts>();
  for (const row of rows) {
    const sends = db.latestSends(row.id);
    const readAt = ms(sends.read?.readAt);
    const personAt = ms(sends.person?.acceptedAt);
    const stop = stops.get(row.id);
    const refusing = stop?.accountId ?? null;
    out.set(row.id, {
      account: nameOf(row.accountId),
      interactedAt: personAt,
      lastRead:
        sends.read && readAt !== null ? await saidOf(sends.read, readAt) : null,
      personSaid:
        sends.person &&
        personAt !== null &&
        sends.person.uuid !== sends.read?.uuid
          ? await saidOf(sends.person, personAt)
          : null,
      stop: stop
        ? {
            at: stop.at,
            resumes: refusing
              ? (refusedUntil(
                  bench,
                  readings.find((one) => one.accountId === refusing),
                  refusing,
                  row.model ?? null,
                  now
                ) ??
                (readings.some((one) => one.accountId === refusing)
                  ? "now"
                  : null))
              : null,
          }
        : null,
    });
  }
  return out;
};

/**
 * The two reads `list_sessions` makes of the hub past the board (delegation
 * actions `Fleet`): the sessions stopped at a usage limit, in any state,
 * `overlay` laying on them what the board lays on its rows (presence, a
 * stall's words); and what the hub stores of rows past them.
 */
export const sessionReads = (
  db: Pick<
    DbShape,
    "accounts" | "atLimit" | "getInstancesByIds" | "latestSends"
  >,
  overlay: (rows: InstanceRow[]) => InstanceRow[]
) => {
  const stops = () =>
    new Map(db.atLimit.standingStops().map((stop) => [stop.instanceId, stop]));
  return {
    limitStopped: (): InstanceRow[] =>
      overlay(db.getInstancesByIds([...stops().keys()]) as InstanceRow[]),
    facts: (rows: readonly InstanceRow[]) =>
      sessionFacts(db, rows, stops(), Date.now()),
  };
};
