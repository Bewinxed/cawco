/**
 * The fleet's one finding engine (docs/tom/find-and-mention.md, the options
 * doc's shared ground): what "find anything" (⌘K, the phone's jump) and "name
 * something while writing" (`@` in a composer) both ask, answered from one
 * ranking at the hub.
 *
 * Two parts, two speeds. The names part reads what the hub holds (sessions,
 * threads, tasks, routines, projects, machines, artifacts, decisions, the
 * commits and files of delegates' work items) and answers in milliseconds:
 * every word of the query, in any order, has to match one of a result's
 * recognisers (find-names.ts). The transcripts part asks every machine's
 * index (`searchTranscripts`, agent search/index.ts), each within
 * {@link TRANSCRIPT_ANSWER_MS}, and folds what they say into conversations,
 * each with its best moments, and the threads' own messages (kept at the
 * hub) into threads; a machine that did not answer is named in the answer's
 * coverage, never dropped in silence.
 *
 * Ranking, one order for both parts: how well the words matched (a title
 * above a purpose above a project; in a transcript, your words above an
 * agent's above what was handed in), then how recently it moved, then its
 * live state (working and waiting on you above idle above asleep above
 * ended), then parentage (your own sessions, today's delegates of them).
 * Caw's own lead session is never a result: his threads stand for him.
 */
import {
  type AgentRow,
  type ArtifactNeedNoticePart,
  type ArtifactNeedsRead,
  artifactWords,
  FIND_KINDS,
  type FindAnswer,
  type FindConversation,
  type FindCoverage,
  type FindKind,
  type FindLiveState,
  type FindMachineCoverage,
  type FindMoment,
  type FindResult,
  type HarnessFailed,
  type HarnessUnanswered,
  type MomentAuthor,
  machineLabel,
  type NeutralSessionInfo,
  noticePartWords,
  reasonLine,
  type StageKind,
  type ThreadSummary,
  type TranscriptAnswer,
  type TranscriptQuery,
  unparked,
  type WaitingAnswer,
  type WaitingItem,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import {
  excerptOf,
  marksOf,
  matchOf,
  matchShape,
  parse,
  type Query,
  wordHit,
  wordsOf,
} from "@cawco/core/find-match";
import { DAY_MS } from "@cawco/core/time";
import { status, t } from "elysia";
import { checkoutOf, type DbShape } from "./db";
import type { FindInstanceRow, FindWorkItemRow } from "./db/find";
import {
  AUTHOR_POINTS,
  artifactEntry,
  changeEntries,
  changesOf,
  conversationEntry,
  type Entry,
  type ItemChanges,
  MOMENT_WEIGHT,
  machineEntry,
  ofKinds,
  projectEntry,
  rankOf,
  routineEntry,
  storedEntry,
  taskEntry,
  threadEntry,
} from "./find-names";
import { boardTitle, leafOf } from "./labels";

/**
 * How long the transcripts part waits on each machine: one query per
 * keystroke, so a slow machine is named as one that didn't answer rather than
 * holding every other machine's moments back (the 1.5 s the jump palette's
 * search had, `SEARCH_ANSWER_MS`).
 */
const TRANSCRIPT_ANSWER_MS = 1500;

/**
 * How stale the names part may be, ms: what it reads besides the sessions
 * (work items, tasks, routines, artifacts, plans, projects, machines, threads)
 * is read again once it is this old, so a burst of keystrokes reads it once.
 * Sessions are kept by the board's change log and are never stale.
 */
const NAMES_FRESH_MS = 1000;

/**
 * How old a machine's catalog of the sessions it keeps may be, ms, before
 * find asks for it again, in the background: sessions run from a terminal,
 * which the hub never started, are found by name from it.
 */
const STORED_FRESH_MS = 60_000;

/** A project's stage kinds as last read, and when; read again once this old, ms. */
const STAGES_FRESH_MS = 30_000;

/** How many results a page holds by default, and at most. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** How long an answer that asked the machines is kept for its next pages, ms. */
const PAGE_KEPT_MS = 60_000;
const PAGES_KEPT = 16;

/** How many moments of one thread an answer carries. */
const THREAD_MOMENTS = 3;

/**
 * How many of one author's words a listing (no words, a `by`) reads, newest
 * first: from each machine's index (agent search/index.ts, the same bound),
 * and from the threads kept at the hub. Older words are the next listing's,
 * asked `before` the last one read (find-tool.ts pages so).
 */
const LISTED_DOCS = 200;

/** How many characters of a thread message a listing's moment carries; an agent's find cuts its own from the whole message, which rides as its `context` when asked. */
const LISTED_CHARS = 240;

const SPACES = /\s+/gu;

/** A conversation's or thread's moments; none for anything else. */
const momentsOf = (result: FindResult): FindMoment[] =>
  result.kind === "conversation" || result.kind === "thread"
    ? result.moments
    : [];

/** A listed result's newest moment, ms epoch. */
const newestOf = (result: FindResult): number =>
  Math.max(0, ...momentsOf(result).map((moment) => moment.at ?? 0));

/**
 * How far back the waiting list looks for reports and tasks: what was
 * reported or moved to a stage of yours in this many days; the answer says
 * the window. Artifacts are Needs you's, whatever their age: they leave by
 * its rules (artifacts/needs.ts).
 */
const WAITING_DAYS = 14;

/**
 * What a find narrows to, beside its words and kinds: what an agent's `find`
 * (find-tool.ts) asks for. A project or a machine keeps the results that are
 * in it (a machine: the sessions on it, and the machine); `since` keeps what
 * moved since then, a conversation's or thread's moments the ones said since;
 * `before` keeps the evidence at or before it (past.dev's `queryTimestamp`:
 * "Evidence that occurred at or before that instant is eligible, and later
 * evidence is out of scope"), a conversation's or thread's moments said by
 * then, anything else only when nothing about it moved after.
 */
export interface FindWhere {
  /** ms epoch, the last instant kept. */
  before?: number;
  machineId?: string;
  projectId?: string;
  /** ms epoch. */
  since?: number;
  /**
   * An agent's find: a session the person purged (its transcript deleted,
   * db `purged_sessions`) is no result, though its machine's index may still
   * hold its words. The dashboard's Find, the person's, does not ask this.
   */
  unpurged?: true;
}

/** What a page of a find is asked for. */
export interface FindRequest {
  /** Only words said by this author (`by=me`: the person's own). */
  author?: MomentAuthor;
  /**
   * Who asks, in a few words ("the dashboard's Find", "the find tool of
   * session …"): what the hub's log names a machine's slow answer by.
   */
  caller: string;
  /**
   * Each moment carries the words around it ({@link HeldMoment}): the
   * person's Find asks while it hides secrets (find-secrets.ts), and an
   * agent's find always, its excerpts cut from them once the secret filter
   * read them (find-tool.ts).
   */
  context?: true;
  cursor?: string;
  kinds?: FindKind[];
  limit?: number;
  q: string;
  /**
   * Aborts once the asker no longer waits (the person typed on, closed
   * Find): the machines are told to stop the search (core `CONTROL_ABANDON`).
   */
  signal?: AbortSignal;
  /**
   * The machines match what tools answered too (core `TranscriptQuery`
   * `toolOutput`): an agent's `find` asks it (find-tool.ts); the person's
   * Find matches what was said, thought and called.
   */
  toolOutput?: true;
  /** Whether to ask the machines' transcripts; false answers from names alone. */
  transcripts: boolean;
  where?: FindWhere;
}

/**
 * A moment as the engine holds it: the words around its excerpt ride along
 * when asked (`FindRequest.context`, and a thread message's whole body), for
 * the person's secret filter to read (find-secrets.ts), which takes them off
 * before an answer leaves the hub.
 */
export type HeldMoment = FindMoment & { context?: string };

/** A purged session's key in {@link FindDeps.purged}: its machine and harness session id. */
const purgedKey = (machineId: string, sessionId: string): string =>
  `${machineId}:${sessionId}`;

/** Whether `at` (ms epoch, null for no time) falls in `where`'s window. */
const inWindow = (at: number | null, where: FindWhere): boolean =>
  (where.since === undefined || at === null || at >= where.since) &&
  (where.before === undefined || (at !== null && at <= where.before));

/** Whether `where` leaves `result` out as a session the person purged. */
const purgedOut = (
  result: FindResult,
  where: FindWhere,
  purged: ReadonlySet<string>
): boolean =>
  where.unpurged === true &&
  result.kind === "conversation" &&
  result.sessionId !== null &&
  purged.has(purgedKey(result.machine.id, result.sessionId));

/** `result` as `where` keeps it, or null when `where` leaves it out. */
const within = (
  result: FindResult,
  where: FindWhere,
  purged: ReadonlySet<string>
): FindResult | null => {
  if (
    (where.projectId && result.project?.id !== where.projectId) ||
    purgedOut(result, where, purged)
  ) {
    return null;
  }
  if (where.machineId) {
    let machineId: string | null = null;
    if (result.kind === "conversation") {
      machineId = result.machine.id;
    } else if (result.kind === "machine") {
      machineId = result.id;
    }
    if (machineId !== where.machineId) {
      return null;
    }
  }
  if (where.since === undefined && where.before === undefined) {
    return result;
  }
  const moved = result.lastActivity ?? 0;
  if (result.kind === "conversation" || result.kind === "thread") {
    const moments = result.moments.filter((moment) =>
      inWindow(moment.at, where)
    );
    const byWords = result.matched.some((field) => field !== "transcript");
    if (moments.length > 0 || (byWords && inWindow(moved, where))) {
      return { ...result, moments };
    }
    return null;
  }
  return inWindow(moved, where) ? result : null;
};

/**
 * One page of a find as the engine answers it in the hub: the route's
 * answer, and how many results it ranked in all, every page together, which
 * an agent's `find` says (find-tool.ts) and the route leaves out.
 */
export type FindPage = FindAnswer & { total: number };

/** The cursor that starts a page at `offset`. */
export const cursorAt = (offset: number): string =>
  Buffer.from(String(offset), "utf8").toString("base64url");

export interface FindDeps {
  /**
   * Needs you's artifacts and their notices (artifacts/needs.ts): what waits
   * on the person's eyes among the artifacts, by the one rule Needs you
   * lists them by.
   */
  artifactNeeds: () => ArtifactNeedsRead;
  /**
   * One machine's transcript answer, or why it gave none: given `timeoutMs`,
   * and the machine told to stop the search once that passes or `ask.signal`
   * aborts.
   */
  askMachine: (
    machineId: string,
    query: string,
    options: TranscriptQuery & { limit: number },
    timeoutMs: number,
    ask: Pick<FindRequest, "caller" | "signal">
  ) => Promise<TranscriptAnswer | { error: string }>;
  db: DbShape;
  /**
   * A machine's catalog of the sessions it keeps (`listSessions`), with the
   * harnesses that did not list in time or whose listing threw, or why it
   * gave none.
   */
  listStored: (machineId: string) => Promise<
    | {
        failed: HarnessFailed[];
        sessions: NeutralSessionInfo[];
        unanswered: HarnessUnanswered[];
      }
    | { error: string }
  >;
  /** The sessions waiting on the person: a permission or a question parked for them. */
  needsYou: () => ReadonlySet<string>;
  /** Whether the hub holds `machineId`'s socket now. */
  online: (machineId: string) => boolean;
  /** Every session the person purged, by {@link purgedKey}: what an agent's find leaves out. */
  purged: () => ReadonlySet<string>;
  /** Runs the instance change log, which hands the changed ids to {@link Find.instancesChanged}. */
  refreshInstances: () => void;
  /** A project's stages by name, each with its kind, as its stages.md reads (tasks.ts `stages`). */
  stageKinds: (projectId: string) => Promise<Map<string, StageKind>>;
  /**
   * The projects' tasks waiting in a stage of yours, read as the board reads
   * them, and a sentence for each project whose tasks could not be read.
   */
  tasksWaiting: () => Promise<{
    missing: string[];
    tasks: {
      id: string;
      projectId: string;
      since: number;
      stage: string;
      title: string;
    }[];
  }>;
  /** Every project's Caw threads, with Caw's state on each. */
  threads: () => Record<string, ThreadSummary[]>;
}

/** A thread message as the names part holds it, for a thread found by its words. */
interface ThreadLine {
  at: number;
  body: string;
  id: string;
  threadId: string;
  who: MomentAuthor;
  words: string[];
}

/** A conversation as the names part holds it: its row, its entry and the sessions it started. */
interface Held {
  children: string[];
  entry: Entry;
  row: FindInstanceRow;
}

/** Everything the names part holds, built at most every {@link NAMES_FRESH_MS}. */
interface Names {
  at: number;
  /** A harness session id (and each it went on from) to its session. */
  bySessionId: Map<string, string>;
  conversations: Map<string, Held>;
  entries: Entry[];
  /**
   * The hub's own conversations, by `machineId:sessionId` (db find.ts
   * `hubMade`): a summariser's, whose words are the hub's prompt quoting a
   * session and a model's summary of it. No find answers with them, the
   * person's nor an agent's: the session they quote is found by its own
   * words, and they are hidden from every board and catalog besides.
   */
  hubMade: ReadonlySet<string>;
  leads: ReadonlySet<string>;
  machines: Map<string, AgentRow>;
  /** Each session a machine keeps that the hub never started, by `machineId:sessionId`. */
  stored: Map<string, Entry>;
  threadLines: ThreadLine[];
  /** Each thread's entry, by thread id. */
  threads: Map<string, Entry>;
}

/** One machine's part in a find: its coverage, and its answer when it gave one. */
interface Asked {
  answer: TranscriptAnswer | null;
  coverage: FindMachineCoverage;
}

/** A session's live state as the board says it, from what the hub holds now. */
const stateOf = (
  row: FindInstanceRow,
  online: boolean,
  needsYou: ReadonlySet<string>
): FindLiveState => {
  if (row.status === "sleeping") {
    return online ? "sleeping" : "unknown";
  }
  if (row.status === "unknown") {
    return "unknown";
  }
  const live =
    row.status === "running" ||
    row.status === "starting" ||
    row.status === "moving";
  if (!live) {
    return "ended";
  }
  if (!online) {
    return "unknown";
  }
  if (needsYou.has(row.id)) {
    return "needs-you";
  }
  return row.turnOpenAt !== null || row.status !== "running"
    ? "working"
    : "idle";
};

/** The sessions that are a project's Caw: never results, never targets. */
const leadsOf = (
  projects: { leadInstanceId: string | null }[],
  rows: Map<string, FindInstanceRow>
): Set<string> => {
  const leads = new Set<string>();
  for (const project of projects) {
    if (project.leadInstanceId) {
      leads.add(project.leadInstanceId);
    }
  }
  for (const row of rows.values()) {
    if (row.role === "lead") {
      leads.add(row.id);
    }
  }
  return leads;
};

/** Each session's latest work item, each item by id, and each delegating session's newest report. */
const itemsOf = (items: FindWorkItemRow[]) => {
  const byId = new Map<string, FindWorkItemRow>();
  const latest = new Map<string, FindWorkItemRow>();
  const reportedTo = new Map<string, FindWorkItemRow>();
  for (const item of items) {
    byId.set(item.id, item);
    const before = latest.get(item.instanceId);
    if (!before || before.createdAt < item.createdAt) {
      latest.set(item.instanceId, item);
    }
    const told = reportedTo.get(item.parentInstanceId);
    const newer = !told?.endedAt || (item.endedAt ?? 0) > told.endedAt;
    if (item.headline && item.endedAt && newer) {
      reportedTo.set(item.parentInstanceId, item);
    }
  }
  return { byId, latest, reportedTo };
};

/** Each session's children that find holds, Caw's lead sessions aside. */
const childrenOf = (
  rows: Map<string, FindInstanceRow>,
  leads: ReadonlySet<string>
): Map<string, string[]> => {
  const children = new Map<string, string[]>();
  for (const row of rows.values()) {
    if (row.parentInstanceId && !leads.has(row.id)) {
      const siblings = children.get(row.parentInstanceId) ?? [];
      siblings.push(row.id);
      children.set(row.parentInstanceId, siblings);
    }
  }
  return children;
};

/** A harness session id, and each one a session went on from, to the session. */
const sessionIdsOf = (
  rows: Map<string, FindInstanceRow>
): Map<string, string> => {
  const bySessionId = new Map<string, string>();
  for (const row of rows.values()) {
    if (row.sessionId) {
      bySessionId.set(row.sessionId, row.id);
    }
    for (const prior of row.priorSessionIds) {
      bySessionId.set(prior, row.id);
    }
  }
  return bySessionId;
};

/** How well a thread message holds every one of `words` (0: not all), weighed by whose it is. */
const lineScore = (line: ThreadLine, words: string[]): number => {
  let sum = 0;
  for (const word of words) {
    const hit = wordHit(word, line.words);
    if (hit === 0) {
      return 0;
    }
    sum += hit;
  }
  return (sum / words.length) * MOMENT_WEIGHT[line.who];
};

/** What one moment of a machine's answer is in an answer. */
const momentOf = (
  moment: TranscriptAnswer["conversations"][number]["moments"][number]
): HeldMoment => ({
  docId: moment.docId,
  author: moment.author,
  at: moment.timestamp ? Date.parse(moment.timestamp) || null : null,
  excerpt: moment.snippet,
  ...(moment.context === undefined ? {} : { context: moment.context }),
});

/** A conversation the hub never started (a stored CLI session), as its machine's transcript has it. */
const storedConversation = (
  hit: TranscriptAnswer["conversations"][number],
  machine: { id: string; name: string },
  moments: FindMoment[]
): FindConversation => {
  const dir = hit.cwd ? leafOf(hit.cwd) : null;
  const last = Math.max(0, ...moments.map((moment) => moment.at ?? 0));
  return {
    kind: "conversation",
    id: `${machine.id}:${hit.sessionId}`,
    instanceId: null,
    sessionId: hit.sessionId,
    harness: hit.harness,
    handle: null,
    title: dir ?? hit.sessionId.slice(0, 8),
    purpose: null,
    lastReport: null,
    children: { count: 0, needsYou: 0 },
    task: null,
    project: null,
    machine,
    cwd: hit.cwd ?? "",
    dir,
    role: "session",
    parent: null,
    state: "unknown",
    lastActivity: last > 0 ? last : null,
    moments,
    matched: ["transcript"],
    score: 0,
  };
};

/** A result already found gains moments: its rank rises a little for them. */
const withMoments = <Result extends FindResult & { moments: FindMoment[] }>(
  before: Result,
  moments: FindMoment[],
  match: number
): Result => ({
  ...before,
  moments,
  matched: [...before.matched, "transcript"],
  score: before.score + 8 * match,
});

/**
 * The hub's match for a moment, by whose words it is: mostly how much of the
 * query it holds and whether as the phrase (core find-match.ts `matchShape`,
 * read off the tokens its machine's index marked in its words), a little how
 * its machine's BM25 weighs it against the best of every machine's. BM25
 * alone ranked a long agent turn that said the query's "the" again and again
 * over the person's line that said the query whole.
 */
const momentMatch = (
  moment: HeldMoment,
  relevance: number,
  words: readonly string[]
): number => {
  const shape = matchShape(marksOf(moment.context ?? moment.excerpt), words);
  return (
    0.15 +
    0.35 *
      MOMENT_WEIGHT[moment.author] *
      (0.2 * relevance + 0.5 * shape.covered + (shape.phrase ? 0.3 : 0))
  );
};

/** The offset a cursor this hub gave starts at; 0 for none. */
export const decodeCursor = (cursor: string | undefined): number => {
  if (!cursor) {
    return 0;
  }
  const offset = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Number.isInteger(offset) || offset < 0) {
    throw new FindRefusal(`"${cursor}" is not a cursor this hub gave.`);
  }
  return offset;
};

export const createFind = (deps: FindDeps) => {
  const { db } = deps;
  /** Every findable session's row, by id: read whole once, then by the change log. */
  let rows: Map<string, FindInstanceRow> | null = null;
  /** Something the names were built from moved since they were built. */
  let stale = false;
  let names: Names | null = null;
  /** Each project's stage kinds, as last read. */
  const stageKinds = new Map<
    string,
    { at: number; kinds: Map<string, StageKind> }
  >();
  const stagesReading = new Set<string>();
  /**
   * Each machine's catalog of the sessions it keeps, as last read, and when;
   * with the harnesses that did not list in time, or whose listing threw, on
   * that read.
   */
  const storedCatalogs = new Map<
    string,
    {
      at: number;
      failed: HarnessFailed[];
      sessions: NeutralSessionInfo[];
      unanswered: HarnessUnanswered[];
    }
  >();
  const storedReading = new Set<string>();
  /**
   * A machine's catalog as last read; read again in the background once
   * stale. A harness that did not list in time, or whose listing threw,
   * keeps the sessions it listed last, and is said by name ("claude on
   * obelisk didn't answer within 10 s", "… couldn't list its sessions: …"):
   * never read as having none.
   */
  const catalogOf = (machine: AgentRow, now: number) => {
    const { machineId } = machine;
    const known = storedCatalogs.get(machineId);
    const due = !known || now - known.at > STORED_FRESH_MS;
    if (due && deps.online(machineId) && !storedReading.has(machineId)) {
      storedReading.add(machineId);
      detach(
        deps
          .listStored(machineId)
          .then((answer) => {
            if ("error" in answer) {
              throw new Error(answer.error);
            }
            const silent = new Set(
              [...answer.unanswered, ...answer.failed].map((one) => one.harness)
            );
            const kept = (known?.sessions ?? []).filter((info) =>
              silent.has(info.harness)
            );
            const keptOf = (harness: string) =>
              kept.filter((info) => info.harness === harness).length;
            const name = machineLabel(machine.hostname);
            for (const { harness, after } of answer.unanswered) {
              console.info(
                `[find] ${harness} on ${name} didn't answer within ${after / 1000} s; its stored sessions are kept as last read (${keptOf(harness)})`
              );
            }
            for (const { harness, error } of answer.failed) {
              console.info(
                `[find] ${harness} on ${name} couldn't list its sessions: ${error}; its stored sessions are kept as last read (${keptOf(harness)})`
              );
            }
            storedCatalogs.set(machineId, {
              at: Date.now(),
              failed: answer.failed,
              sessions: [...answer.sessions, ...kept],
              unanswered: answer.unanswered,
            });
            stale = true;
          })
          .finally(() => storedReading.delete(machineId)),
        `find: ${machineId}'s stored sessions`
      );
    }
    return known?.sessions ?? [];
  };
  /** Each ended work item's commits and files, parsed once: its report never changes. */
  const itemChanges = new Map<string, ItemChanges>();
  let changesAfter = 0;
  /** Answers that asked the machines, kept for their next pages. */
  const pages = new Map<
    string,
    {
      answer: FindResult[];
      at: number;
      coverage: FindCoverage;
      transcriptsMs: number | null;
    }
  >();

  /** A project's stage kinds as last read; read again in the background once stale. */
  const kindsOf = (projectId: string, now: number) => {
    const known = stageKinds.get(projectId);
    const due = !known || now - known.at > STAGES_FRESH_MS;
    if (due && !stagesReading.has(projectId)) {
      stagesReading.add(projectId);
      detach(
        deps
          .stageKinds(projectId)
          .then((kinds) => {
            stageKinds.set(projectId, { at: Date.now(), kinds });
            // The names hold the kinds they were built with: built again next.
            stale = true;
          })
          .finally(() => stagesReading.delete(projectId)),
        `find: ${projectId}'s stages`
      );
    }
    return known?.kinds;
  };

  const readRows = (): Map<string, FindInstanceRow> => {
    if (!rows) {
      rows = new Map(db.find.instances().map((row) => [row.id, row]));
      stale = true;
    }
    deps.refreshInstances();
    return rows;
  };

  /** The commits and files entries of every ended work item, parsed once each. */
  const changeEntriesOf = (
    held: Map<string, FindInstanceRow>,
    items: Map<string, FindWorkItemRow>,
    projectOf: (id: string | null) => { id: string; name: string } | null
  ): Entry[] => {
    for (const ended of db.find.results(changesAfter)) {
      itemChanges.set(ended.id, changesOf(ended.result));
      changesAfter = Math.max(changesAfter, ended.endedAt.getTime());
    }
    const branches = db.find.workspaceBranches();
    return [...itemChanges].flatMap(([itemId, changes]) => {
      const item = items.get(itemId);
      const maker = item ? held.get(item.instanceId) : undefined;
      return item && maker
        ? changeEntries(
            item,
            changes,
            maker,
            branches.get(item.workspaceId) ?? "",
            projectOf(item.projectId)
          )
        : [];
    });
  };

  const build = (now: number): Names => {
    const held = readRows();
    const projects = new Map(
      db.listProjects().map((project) => [project.id, project])
    );
    const machines = new Map(
      db.listAgents().map((agent) => [agent.machineId, agent])
    );
    const projectOf = (id: string | null) => {
      const project = id ? projects.get(id) : undefined;
      return project ? { id: project.id, name: project.name } : null;
    };
    const leads = leadsOf([...projects.values()], held);
    const items = itemsOf(db.find.workItems());
    const children = childrenOf(held, leads);
    const tasks = db.find.tasks();
    const sources = {
      items,
      leads,
      machineName: (id: string) =>
        machineLabel(machines.get(id)?.hostname ?? id),
      now,
      projectOf,
      reportedTo: items.reportedTo,
      rows: held,
      steps: db.find.planSteps(),
      taskTitles: new Map(
        tasks.map((task) => [`${task.projectId}:${task.id}`, task.title])
      ),
    };
    const conversations = new Map<string, Held>();
    for (const row of held.values()) {
      if (!leads.has(row.id)) {
        const mine = children.get(row.id) ?? [];
        conversations.set(row.id, {
          row,
          children: mine,
          entry: conversationEntry(row, sources, mine.length),
        });
      }
    }
    const threads = new Map<string, Entry>();
    for (const [projectId, list] of Object.entries(deps.threads())) {
      // Where its threads' board rows sit (the dashboard's `threadRowOf`):
      // the primary checkout, else its first place, else its hub folder.
      const project = projects.get(projectId);
      const place = project
        ? (checkoutOf(project) ?? project.places[0])
        : undefined;
      const cwd = place?.path ?? `projects/${projectId}`;
      for (const thread of list) {
        threads.set(thread.id, threadEntry(thread, projectOf(projectId), cwd));
      }
    }
    const artifacts = db.find.artifacts().flatMap((artifact) => {
      const maker =
        artifact.instanceId === null
          ? undefined
          : held.get(artifact.instanceId);
      return maker && !leads.has(maker.id)
        ? [
            artifactEntry(
              artifact,
              maker,
              projectOf(artifact.projectId ?? maker.projectId)
            ),
          ]
        : [];
    });
    const bySessionId = sessionIdsOf(held);
    const hubMade = db.find.hubMade();
    const stored = storedOf(machines, bySessionId, hubMade, now);
    names = {
      at: now,
      bySessionId,
      hubMade,
      stored,
      conversations,
      leads,
      machines,
      threads,
      threadLines: db.find.threadWords().map((line) => ({
        id: line.id,
        threadId: line.threadId,
        at: line.at.getTime(),
        who: line.author === "you" ? "owner" : "caw",
        body: line.body,
        words: wordsOf(line.body),
      })),
      entries: [
        ...[...conversations.values()].map((each) => each.entry),
        ...stored.values(),
        ...threads.values(),
        ...tasks.map((task) =>
          taskEntry(
            task,
            projectOf(task.projectId),
            kindsOf(task.projectId, now)?.get(task.stage) ?? null
          )
        ),
        ...db.find
          .routines()
          .map((routine) =>
            routineEntry(routine, projectOf(routine.projectId))
          ),
        ...[...projects.values()].map(projectEntry),
        ...[...machines.values()].map((machine) =>
          machineEntry(machine, deps.online(machine.machineId))
        ),
        ...artifacts,
        ...changeEntriesOf(held, items.byId, projectOf),
      ],
    };
    stale = false;
    return names;
  };

  /**
   * Each session a machine keeps that the hub never started, from the
   * machines' catalogs as last read ({@link catalogOf}), by
   * `machineId:sessionId`.
   */
  const storedOf = (
    machines: Map<string, AgentRow>,
    bySessionId: Map<string, string>,
    hubMade: ReadonlySet<string>,
    now: number
  ): Map<string, Entry> => {
    const stored = new Map<string, Entry>();
    for (const machine of machines.values()) {
      const where = {
        id: machine.machineId,
        name: machineLabel(machine.hostname),
      };
      for (const info of catalogOf(machine, now)) {
        const entry =
          bySessionId.has(info.sessionId) ||
          hubMade.has(purgedKey(machine.machineId, info.sessionId))
            ? null
            : storedEntry(info, where);
        if (entry) {
          stored.set(entry.result.id, entry);
        }
      }
    }
    return stored;
  };

  const namesNow = (now: number): Names => {
    readRows();
    if (!names || stale || now - names.at > NAMES_FRESH_MS) {
      return build(now);
    }
    return names;
  };

  /** A result's live fields filled in for this answer: a session's state and children, a machine's presence. */
  const live = (
    result: FindResult,
    held: Names,
    needsYou: ReadonlySet<string>
  ): FindResult => {
    if (result.kind === "machine") {
      return { ...result, online: deps.online(result.id) };
    }
    if (result.kind !== "conversation" || !result.instanceId) {
      return result;
    }
    const conversation = held.conversations.get(result.instanceId);
    if (!conversation) {
      return result;
    }
    return {
      ...result,
      state: stateOf(
        conversation.row,
        deps.online(conversation.row.machineId),
        needsYou
      ),
      children: {
        count: conversation.children.length,
        needsYou: conversation.children.filter((id) => needsYou.has(id)).length,
      },
    };
  };

  /** The names part: every entry that matches, ranked, live fields filled. */
  const findNames = (
    query: Query,
    kinds: ReadonlySet<FindKind> | null,
    now: number
  ) => {
    const held = namesNow(now);
    const needsYou = deps.needsYou();
    const found = new Map<string, FindResult>();
    for (const entry of held.entries) {
      if (!ofKinds(entry.result, kinds)) {
        continue;
      }
      const match = matchOf(entry, query);
      if (match.score <= 0) {
        continue;
      }
      const result = live(entry.result, held, needsYou);
      found.set(`${result.kind}:${result.id}`, {
        ...result,
        matched: match.fields,
        score: rankOf(match.score, result, entry.kin, now),
      });
    }
    return { found, held, needsYou };
  };

  /** The machines a full find would ask, none asked yet: offline ones say so. */
  const unasked = (machines: Map<string, AgentRow>): FindMachineCoverage[] =>
    [...machines.values()].map((machine) => ({
      machineId: machine.machineId,
      name: machineLabel(machine.hostname),
      answered: false,
      reason: deps.online(machine.machineId) ? null : "it is offline",
      indexAgeMs: null,
      indexedThrough: null,
      indexing: false,
      tookMs: null,
    }));

  /** One machine asked, and how it went: its answer, or why it gave none. */
  const askOne = async (
    machine: AgentRow,
    query: string,
    options: TranscriptQuery & { limit: number },
    ask: Pick<FindRequest, "caller" | "signal">
  ): Promise<Asked> => {
    const base = {
      machineId: machine.machineId,
      name: machineLabel(machine.hostname),
    };
    if (!deps.online(machine.machineId)) {
      return {
        coverage: {
          ...base,
          answered: false,
          reason: "it is offline",
          indexAgeMs: null,
          indexedThrough: null,
          indexing: false,
          tookMs: null,
        },
        answer: null,
      };
    }
    const started = performance.now();
    const answer = await deps.askMachine(
      machine.machineId,
      query,
      options,
      TRANSCRIPT_ANSWER_MS,
      ask
    );
    const tookMs = Math.round(performance.now() - started);
    if ("error" in answer) {
      return {
        coverage: {
          ...base,
          answered: false,
          reason: answer.error,
          indexAgeMs: null,
          indexedThrough: null,
          indexing: false,
          tookMs,
        },
        answer: null,
      };
    }
    return {
      coverage: {
        ...base,
        answered: true,
        reason: null,
        indexAgeMs:
          answer.indexedThrough > 0
            ? Math.max(0, Date.now() - answer.indexedThrough)
            : null,
        indexedThrough:
          answer.indexedThrough > 0 ? answer.indexedThrough : null,
        indexing: answer.catchingUp,
        tookMs,
      },
      answer,
    };
  };

  /**
   * Threads found by their messages' words (yours and Caw's, kept at the
   * hub): every word of the query, as a word or the start of one, in one
   * message. Each thread gains its best few messages as moments.
   */
  const foldThreads = (
    found: Map<string, FindResult>,
    words: string[],
    author: MomentAuthor | undefined,
    held: Names,
    now: number
  ) => {
    const byThread = new Map<string, { line: ThreadLine; score: number }[]>();
    for (const line of held.threadLines) {
      const score = !author || author === line.who ? lineScore(line, words) : 0;
      if (score > 0) {
        byThread.set(line.threadId, [
          ...(byThread.get(line.threadId) ?? []),
          { line, score },
        ]);
      }
    }
    for (const [threadId, lines] of byThread) {
      const entry = held.threads.get(threadId);
      if (entry?.result.kind !== "thread") {
        continue;
      }
      const best = lines
        .toSorted((a, b) => b.score - a.score || b.line.at - a.line.at)
        .slice(0, THREAD_MOMENTS);
      const moments = best.map(({ line }): HeldMoment => ({
        docId: line.id,
        author: line.who,
        at: line.at,
        excerpt: excerptOf(line.body, words),
        context: line.body,
      }));
      const match = 0.15 + 0.35 * (best[0]?.score ?? 0);
      const key = `thread:${threadId}`;
      const before = found.get(key);
      found.set(
        key,
        before?.kind === "thread"
          ? withMoments(before, moments, match)
          : {
              ...entry.result,
              moments,
              matched: ["transcript"],
              score: rankOf(match, entry.result, 0, now),
            }
      );
    }
  };

  /**
   * Folds the machines' moments into conversations: a session the hub holds
   * gains them; one it never started (a stored CLI session) is a
   * conversation of its own, named by its folder; Caw's lead session and a
   * session find leaves out (a discarded one) and the hub's own (a
   * summariser's, {@link Names.hubMade}) are left out. Every machine's
   * relevance is read against the best of all of them, weighed by whose
   * words the best moment is.
   */
  const foldTranscripts = (
    found: Map<string, FindResult>,
    asked: Asked[],
    held: Names,
    needsYou: ReadonlySet<string>,
    now: number,
    words: readonly string[]
  ) => {
    // The hub's own conversations are no hit, nor the measure of one.
    const hits = asked.map(({ coverage, answer }) => ({
      machine: { id: coverage.machineId, name: coverage.name },
      conversations: (answer?.conversations ?? []).filter(
        (hit) => !held.hubMade.has(purgedKey(coverage.machineId, hit.sessionId))
      ),
    }));
    const top = Math.max(
      0,
      ...hits.flatMap((each) => each.conversations.map((hit) => hit.score))
    );
    for (const { machine, conversations } of hits) {
      for (const hit of conversations) {
        foldHit(found, hit, machine, top, held, needsYou, now, words);
      }
    }
  };

  /** One conversation a machine matched, folded into the answer ({@link foldTranscripts}). */
  const foldHit = (
    found: Map<string, FindResult>,
    hit: TranscriptAnswer["conversations"][number],
    machine: { id: string; name: string },
    top: number,
    held: Names,
    needsYou: ReadonlySet<string>,
    now: number,
    words: readonly string[]
  ) => {
    // Its moments best first by the hub's match: the first is the excerpt shown.
    const relevance = top > 0 ? hit.score / top : 0;
    const matched = hit.moments
      .map(momentOf)
      .map((moment) => ({
        moment,
        match: momentMatch(moment, relevance, words),
      }))
      .toSorted((a, b) => b.match - a.match);
    const moments = matched.map((each) => each.moment);
    const match = matched[0]?.match ?? 0;
    // For the same match, the person's words above an agent's quoting them.
    const said = AUTHOR_POINTS[moments[0]?.author ?? "agent"];
    const instanceId = held.bySessionId.get(hit.sessionId);
    if (instanceId === undefined) {
      const kept = held.stored.get(`${machine.id}:${hit.sessionId}`);
      const stored =
        kept?.result.kind === "conversation"
          ? kept.result
          : storedConversation(hit, machine, moments);
      const key = `conversation:${stored.id}`;
      const before = found.get(key);
      found.set(
        key,
        before?.kind === "conversation"
          ? withMoments(before, moments, match)
          : {
              ...stored,
              moments,
              matched: ["transcript"],
              score: rankOf(match, stored, 0, now) + said,
            }
      );
      return;
    }
    const heldEntry = held.conversations.get(instanceId);
    const key = `conversation:${instanceId}`;
    const before = found.get(key);
    if (before?.kind === "conversation") {
      found.set(key, withMoments(before, moments, match));
      return;
    }
    const result = heldEntry
      ? live(heldEntry.entry.result, held, needsYou)
      : undefined;
    if (heldEntry && result?.kind === "conversation") {
      found.set(key, {
        ...result,
        moments,
        matched: ["transcript"],
        score: rankOf(match, result, heldEntry.entry.kin, now) + said,
      });
    }
  };

  /** The transcripts part: the threads' words, then (unless only Caw's are asked for) every machine's. */
  const findTranscripts = async (
    found: Map<string, FindResult>,
    request: FindRequest,
    query: Query,
    kinds: ReadonlySet<FindKind> | null,
    limit: number,
    matched: { held: Names; needsYou: ReadonlySet<string> },
    now: number
  ): Promise<FindCoverage> => {
    if (!kinds || kinds.has("thread")) {
      foldThreads(found, query.words, request.author, matched.held, now);
    }
    // Caw's words are his threads', kept at the hub: no machine is asked for them.
    if (request.author === "caw") {
      return { asked: false, machines: [] };
    }
    const asked = await askMachines(
      query.words.join(" "),
      request.author,
      request,
      request.where,
      matched.held,
      limit
    );
    if (!kinds || kinds.has("conversation")) {
      foldTranscripts(
        found,
        asked,
        matched.held,
        matched.needsYou,
        now,
        query.words
      );
    }
    return { asked: true, machines: asked.map((each) => each.coverage) };
  };

  /**
   * Every machine `request` reaches, asked for `words` (none: a listing of
   * its author's words, newest first, `limit` documents). Narrowed to a
   * machine, only it is asked; to a project, each machine for that project's
   * sessions on it, so its matches are never cut by other projects' ranking
   * above them.
   */
  const askMachines = (
    words: string,
    author: TranscriptQuery["author"],
    asks: Pick<FindRequest, "caller" | "context" | "signal" | "toolOutput">,
    where: FindWhere | undefined,
    held: Names,
    limit: number
  ): Promise<Asked[]> => {
    const machines = [...held.machines.values()].filter(
      (machine) => !where?.machineId || machine.machineId === where.machineId
    );
    const sessionsOn = (machineId: string): string[] =>
      [...held.conversations.values()].flatMap(({ row }) =>
        row.projectId === where?.projectId && row.machineId === machineId
          ? [row.sessionId, ...row.priorSessionIds].filter(
              (id): id is string => !!id
            )
          : []
      );
    return Promise.all(
      machines.map((machine) =>
        askOne(
          machine,
          words,
          {
            limit,
            ...(author ? { author } : {}),
            ...(asks.toolOutput ? { toolOutput: true } : {}),
            ...(asks.context ? { context: true } : {}),
            ...(where?.projectId
              ? { sessions: sessionsOn(machine.machineId) }
              : {}),
            // A listing reads its window from the index; a search keeps its
            // own `since` at the hub, over what it ranked.
            ...(words === "" && where?.since !== undefined
              ? { since: new Date(where.since).toISOString() }
              : {}),
            ...(where?.before === undefined
              ? {}
              : { before: new Date(where.before).toISOString() }),
          },
          asks
        )
      )
    );
  };

  /** A listing's thread messages: `author`'s in `where`'s window, the newest {@link LISTED_DOCS}, each thread with its own, newest first. */
  const listThreads = (
    found: Map<string, FindResult>,
    author: MomentAuthor,
    where: FindWhere,
    held: Names,
    context: true | undefined
  ) => {
    const lines = held.threadLines
      .filter((line) => line.who === author && inWindow(line.at, where))
      .toSorted((a, b) => b.at - a.at)
      .slice(0, LISTED_DOCS);
    for (const line of lines) {
      const entry = held.threads.get(line.threadId);
      if (entry?.result.kind !== "thread") {
        continue;
      }
      const key = `thread:${line.threadId}`;
      const before = found.get(key);
      const moment: HeldMoment = {
        docId: line.id,
        author: line.who,
        at: line.at,
        excerpt: line.body.replace(SPACES, " ").trim().slice(0, LISTED_CHARS),
        ...(context ? { context: line.body } : {}),
      };
      found.set(
        key,
        before?.kind === "thread"
          ? { ...before, moments: [...before.moments, moment] }
          : {
              ...entry.result,
              moments: [moment],
              matched: ["transcript"],
              score: 0,
            }
      );
    }
  };

  /**
   * A listing: no words, one author's (`by`). Their words newest first, the
   * threads' kept at the hub and each machine's off its index's author and
   * time ({@link LISTED_DOCS} of the window from each); each result holds its
   * listed moments, and the results are ordered by their newest.
   */
  const listAll = async (
    request: Omit<FindRequest, "cursor" | "limit" | "q"> & {
      author: MomentAuthor;
    },
    kinds: ReadonlySet<FindKind> | null,
    started: number
  ) => {
    const now = Date.now();
    const held = namesNow(now);
    const namesMs = Math.round((performance.now() - started) * 10) / 10;
    const where = request.where ?? {};
    const found = new Map<string, FindResult>();
    if (!kinds || kinds.has("thread")) {
      listThreads(found, request.author, where, held, request.context);
    }
    const askedAt = performance.now();
    // Caw's words are his threads', kept at the hub: no machine is asked for them.
    const { author } = request;
    const transcripts =
      request.transcripts &&
      author !== "caw" &&
      (!kinds || kinds.has("conversation"));
    const asked = transcripts
      ? await askMachines(
          "",
          author,
          {
            caller: request.caller,
            context: request.context,
            signal: request.signal,
          },
          where,
          held,
          LISTED_DOCS
        )
      : [];
    foldTranscripts(found, asked, held, deps.needsYou(), now, []);
    const purged = where.unpurged ? deps.purged() : new Set<string>();
    const ranked = [...found.values()]
      .flatMap((result) => within(result, where, purged) ?? [])
      .filter((result) => momentsOf(result).length > 0)
      .toSorted((a, b) => newestOf(b) - newestOf(a));
    return {
      ranked,
      coverage: transcripts
        ? { asked: true, machines: asked.map((each) => each.coverage) }
        : { asked: false, machines: unasked(held.machines) },
      namesMs,
      transcriptsMs: transcripts
        ? Math.round(performance.now() - askedAt)
        : null,
    };
  };

  /** Every result of a find, ranked: names, then transcripts when asked; kept for its next pages. */
  const rankAll = async (
    request: FindRequest,
    query: Query,
    kinds: ReadonlySet<FindKind> | null,
    limit: number,
    started: number
  ) => {
    if (query.tokens.length === 0 && request.author !== undefined) {
      return listAll({ ...request, author: request.author }, kinds, started);
    }
    const now = Date.now();
    const matched = findNames(query, kinds, now);
    const namesMs = Math.round((performance.now() - started) * 10) / 10;
    const askTranscripts =
      request.transcripts && query.words.join("").length >= 2;
    const { where } = request;
    const purged = where?.unpurged ? deps.purged() : new Set<string>();
    const kept = (results: Iterable<FindResult>): FindResult[] =>
      where
        ? [...results].flatMap((result) => within(result, where, purged) ?? [])
        : [...results];
    if (!askTranscripts) {
      // No words: what moved last, newest first.
      const order =
        query.tokens.length === 0
          ? (a: FindResult, b: FindResult) =>
              (b.lastActivity ?? 0) - (a.lastActivity ?? 0) || b.score - a.score
          : (a: FindResult, b: FindResult) => b.score - a.score;
      return {
        ranked: kept(matched.found.values()).toSorted(order),
        coverage: { asked: false, machines: unasked(matched.held.machines) },
        namesMs,
        transcriptsMs: null,
      };
    }
    const askedAt = performance.now();
    const coverage = await findTranscripts(
      matched.found,
      request,
      query,
      kinds,
      limit,
      matched,
      now
    );
    // Who said it narrows to what holds their words: a moment of theirs.
    const said = kept(matched.found.values()).filter(
      (result) =>
        !request.author ||
        ((result.kind === "conversation" || result.kind === "thread") &&
          result.moments.length > 0)
    );
    return {
      ranked: said.toSorted((a, b) => b.score - a.score),
      coverage,
      namesMs,
      transcriptsMs: Math.round(performance.now() - askedAt),
    };
  };

  /**
   * A find's ranked results: kept from its first page for the next pages
   * ({@link PAGE_KEPT_MS}) when it asked the machines, so paging does not ask
   * them again; ranked afresh otherwise.
   */
  const rankedFor = async (
    request: FindRequest,
    query: Query,
    kinds: ReadonlySet<FindKind> | null,
    limit: number,
    paging: boolean,
    started: number
  ) => {
    const key = JSON.stringify([
      query.tokens,
      request.kinds ?? [],
      request.author ?? "",
      request.transcripts,
      request.toolOutput ?? false,
      request.context ?? false,
      request.where ?? {},
    ]);
    const kept = paging ? pages.get(key) : undefined;
    if (kept && Date.now() - kept.at < PAGE_KEPT_MS) {
      return {
        ranked: kept.answer,
        coverage: kept.coverage,
        namesMs: 0,
        transcriptsMs: kept.transcriptsMs,
      };
    }
    const fresh = await rankAll(request, query, kinds, limit, started);
    if (fresh.transcriptsMs !== null) {
      pages.set(key, {
        answer: fresh.ranked,
        at: Date.now(),
        coverage: fresh.coverage,
        transcriptsMs: fresh.transcriptsMs,
      });
      while (pages.size > PAGES_KEPT) {
        pages.delete(pages.keys().next().value as string);
      }
    }
    return fresh;
  };

  return {
    /**
     * The board's change log named these sessions: their rows are read
     * again by key (gone when no longer findable), and the names rebuilt.
     */
    instancesChanged(ids: string[]): void {
      if (!rows || ids.length === 0) {
        return;
      }
      const fresh = new Map(db.find.instances(ids).map((row) => [row.id, row]));
      for (const id of ids) {
        const row = fresh.get(id);
        if (row) {
          rows.set(id, row);
        } else {
          rows.delete(id);
        }
      }
      stale = true;
    },

    /** One page of a find. */
    async find(request: FindRequest): Promise<FindPage> {
      const started = performance.now();
      const query = parse(request.q);
      const limit = Math.min(
        Math.max(1, request.limit ?? DEFAULT_LIMIT),
        MAX_LIMIT
      );
      const offset = decodeCursor(request.cursor);
      // No words: what moved last among sessions and threads, unless kinds say.
      const named = request.kinds?.length ? new Set(request.kinds) : null;
      const kinds =
        query.tokens.length === 0 && !named
          ? new Set<FindKind>(["conversation", "thread"])
          : named;
      // A narrowed find drops what the machines answer outside it: they are
      // asked for as many as a page holds, so a page is not left short.
      const fresh = await rankedFor(
        request,
        query,
        kinds,
        request.where ? MAX_LIMIT : Math.min(offset + limit, MAX_LIMIT),
        offset > 0,
        started
      );
      const page = fresh.ranked.slice(offset, offset + limit);
      const end = offset + page.length;
      return {
        query: query.words.join(" "),
        results: page,
        next: end < fresh.ranked.length ? cursorAt(end) : null,
        total: fresh.ranked.length,
        coverage: fresh.coverage,
        timing: { namesMs: fresh.namesMs, transcriptsMs: fresh.transcriptsMs },
      };
    },

    /**
     * A listing whole, unpaged: `request.author`'s words in its window,
     * newest first ({@link listAll}), for an agent's find to page moment by
     * moment (find-tool.ts).
     */
    async listing(
      request: Omit<FindRequest, "cursor" | "limit" | "q"> & {
        author: MomentAuthor;
      }
    ): Promise<{ coverage: FindCoverage; results: FindResult[] }> {
      const named = request.kinds?.length ? new Set(request.kinds) : null;
      const kinds = named ?? new Set<FindKind>(["conversation", "thread"]);
      const listed = await listAll(request, kinds, performance.now());
      return { results: listed.ranked, coverage: listed.coverage };
    },

    /**
     * What waits on the person's eyes, oldest first within the window
     * ({@link WAITING_DAYS}): artifacts not opened at their current
     * revision, decisions with picks to make, reports to their own sessions
     * they have not opened, tasks waiting in a stage of theirs.
     */
    async waiting(): Promise<WaitingAnswer> {
      const now = Date.now();
      const from = now - WAITING_DAYS * DAY_MS;
      const held = namesNow(now);
      const lookedAt = db.find.lookedAt();
      const titleOf = (id: string) => {
        const row = held.conversations.get(id)?.row;
        return row ? { id, title: boardTitle(row) } : null;
      };
      const waitingTasks = await deps.tasksWaiting();
      const items: WaitingItem[] = [
        ...artifactsWaiting(held, deps.artifactNeeds(), titleOf),
        ...reportsWaiting(db.find.workItems(), held, lookedAt, from, titleOf),
        ...waitingTasks.tasks
          .filter((task) => task.since >= from)
          .map((task): WaitingItem => {
            const project = db.project(task.projectId);
            return {
              kind: "task",
              id: `${task.projectId}:${task.id}`,
              title: task.title,
              project: project ? { id: project.id, name: project.name } : null,
              conversation: null,
              since: task.since,
              why: task.stage,
            };
          }),
      ];
      return {
        items: items.toSorted((a, b) => a.since - b.since),
        days: WAITING_DAYS,
        missing: waitingTasks.missing,
      };
    },
  };
};

export type Find = ReturnType<typeof createFind>;

type TitleOf = (id: string) => { id: string; title: string } | null;

/**
 * Artifacts and decisions no view had on screen at their revision while the
 * person looked (`artifacts.opened_revision`), or with picks to make, made or
 * revised since `from`.
 */
/** A notice's part as Jump's row says it beside its name. */
const partWhy = (part: ArtifactNeedNoticePart, name: string): string => {
  switch (part.kind) {
    case "changed":
      return artifactWords.changedCount(part.count);
    case "closed":
      return artifactWords.newAnswers(part.count);
    case "ended":
      return noticePartWords(part, name);
    default: {
      const unhandled: never = part;
      throw new Error(`unhandled notice: ${JSON.stringify(unhandled)}`);
    }
  }
};

const artifactsWaiting = (
  held: Names,
  lane: ArtifactNeedsRead,
  titleOf: TitleOf
): WaitingItem[] => {
  const found = new Map(
    held.entries.flatMap(({ result }) =>
      result.kind === "artifact" || result.kind === "decision"
        ? [[result.id, result] as const]
        : []
    )
  );
  /** One of them as Jump names it: the find engine's own result, else the lane's words. */
  const named = (
    id: string,
    instanceId: string | null,
    name: string
  ): Omit<WaitingItem, "since" | "why"> => {
    const result = found.get(id);
    return result
      ? {
          kind: result.kind,
          artifactKind: result.artifactKind,
          id,
          title: result.title,
          project: result.project,
          conversation: titleOf(result.conversation.id),
        }
      : {
          kind: "artifact",
          id,
          title: name,
          project: null,
          conversation: instanceId ? titleOf(instanceId) : null,
        };
  };
  return [
    ...unparked(lane.needs).map((need): WaitingItem => ({
      ...named(need.artifactId, need.instanceId, need.name),
      artifactKind: need.artifactKind,
      since: need.raisedAt,
      why: reasonLine(need.pending),
    })),
    ...lane.notices.map((notice): WaitingItem => ({
      ...named(notice.artifactId, notice.instanceId, notice.name),
      artifactKind: notice.artifactKind,
      since: notice.at,
      why: notice.parts.map((part) => partWhy(part, notice.name)).join(" · "),
    })),
  ];
};

/**
 * Reports to one of the person's own sessions they have not looked at
 * since: neither the reporting session nor the one it reported to was in
 * front of them after the report came (`instances.seen_at`, the look every
 * device marks). A delegate's report to its parent delegate is that
 * parent's to read, and Caw's go to his threads.
 */
const reportsWaiting = (
  items: FindWorkItemRow[],
  held: Names,
  lookedAt: Map<string, number>,
  from: number,
  titleOf: TitleOf
): WaitingItem[] =>
  items.flatMap((item): WaitingItem[] => {
    const ended = item.endedAt?.getTime() ?? 0;
    const reported = item.state === "done" || item.state === "failed";
    const parent = held.conversations.get(item.parentInstanceId)?.row;
    const yours =
      parent !== undefined &&
      parent.parentInstanceId === null &&
      !held.leads.has(parent.id);
    const looked = Math.max(
      lookedAt.get(item.instanceId) ?? 0,
      lookedAt.get(item.parentInstanceId) ?? 0
    );
    if (ended < from || !reported || !yours || looked >= ended) {
      return [];
    }
    return [
      {
        kind: "report",
        id: item.id,
        title: item.headline ?? item.title,
        project: null,
        conversation: titleOf(item.instanceId),
        since: ended,
        why: item.state === "failed" ? "unread, failed" : "unread",
      },
    ];
  });

/** A find refused for what was asked: its status, and the sentence that says why. */
export class FindRefusal extends Error {
  readonly status: 400 | 404;
  constructor(message: string, refusal: 400 | 404 = 400) {
    super(message);
    this.status = refusal;
  }
}

/** `by=me` and its kin read into a moment's author; anything else is refused by the schema. */
const AUTHOR_OF: Record<"me" | "agent" | "report" | "caw", MomentAuthor> = {
  me: "owner",
  agent: "agent",
  report: "report",
  caw: "caw",
};

/** A refusal thrown as its status; anything else as it was. */
const refused = (error: unknown): never => {
  if (error instanceof FindRefusal) {
    throw status(error.status, error.message);
  }
  throw error;
};

/**
 * `GET /api/find`'s query: one page of a find. `transcripts=0` answers from
 * the names alone (what the hub holds, in milliseconds); otherwise every
 * machine's transcripts are asked too, and the answer's coverage says which
 * answered. The routes sit inline in the hub's chain (server.ts): a plugin
 * of their own took the chain's type past TypeScript's instantiation depth.
 */
export const FIND_QUERY = t.Object({
  q: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
  kinds: t.Optional(t.String()),
  by: t.Optional(
    t.Union([
      t.Literal("me"),
      t.Literal("agent"),
      t.Literal("report"),
      t.Literal("caw"),
    ])
  ),
  transcripts: t.Optional(t.Union([t.Literal("0"), t.Literal("1")])),
});

/** `kinds=conversation,task` read into kinds, or the refusal naming the unknown one. */
const kindsOf = (raw: string | undefined): FindKind[] | undefined => {
  if (!raw?.trim()) {
    return;
  }
  const kinds = raw
    .split(",")
    .map((each) => each.trim())
    .filter(Boolean);
  const unknown = kinds.filter(
    (kind) => !(FIND_KINDS as readonly string[]).includes(kind)
  );
  if (unknown.length > 0) {
    throw new FindRefusal(
      `${unknown.map((kind) => `"${kind}"`).join(", ")} is not a kind find answers with. Kinds: ${FIND_KINDS.join(", ")}.`
    );
  }
  return kinds as FindKind[];
};

/** `GET /api/find`'s answer, or its refusal thrown as a status. */
export const answerFind = async (
  find: Find,
  query: {
    by?: "me" | "agent" | "report" | "caw";
    cursor?: string;
    kinds?: string;
    limit?: string;
    q?: string;
    transcripts?: "0" | "1";
  },
  /** Each moment carries the words around it, for the secret filter (find-secrets.ts). */
  context: boolean,
  /** Who asks, and the request's signal, which aborts once its asker goes (a newer keystroke). */
  ask: Pick<FindRequest, "caller" | "signal">
): Promise<FindAnswer> => {
  try {
    const { total: _total, ...answer } = await find.find({
      q: query.q ?? "",
      ...ask,
      ...(context ? { context: true as const } : {}),
      ...(query.limit ? { limit: Number(query.limit) || DEFAULT_LIMIT } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.by ? { author: AUTHOR_OF[query.by] } : {}),
      kinds: kindsOf(query.kinds),
      transcripts: query.transcripts !== "0",
    });
    return answer;
  } catch (error) {
    return refused(error);
  }
};
