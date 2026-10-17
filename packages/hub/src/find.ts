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
  type StageKind,
  type ThreadSummary,
  type TranscriptAnswer,
  type TranscriptAuthor,
  type WaitingAnswer,
  type WaitingItem,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { status, t } from "elysia";
import type { DbShape } from "./db";
import type { FindInstanceRow, FindWorkItemRow } from "./db/find";
import {
  artifactEntry,
  changeEntries,
  changesOf,
  conversationEntry,
  type Entry,
  excerptOf,
  type ItemChanges,
  MOMENT_WEIGHT,
  machineEntry,
  matchOf,
  ofKinds,
  parse,
  projectEntry,
  type Query,
  rankOf,
  routineEntry,
  storedEntry,
  taskEntry,
  threadEntry,
  wordHit,
  wordsOf,
} from "./find-names";
import { boardTitle, leafOf } from "./labels";

/**
 * How long the transcripts part waits on each machine: one query per
 * keystroke, so a slow machine is named as one that didn't answer rather than
 * holding every other machine's moments back (the 1.5 s the jump palette's
 * search had, `SEARCH_ANSWER_MS`).
 */
export const TRANSCRIPT_ANSWER_MS = 1500;

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
 * How far back the waiting list looks: what was made, revised, reported or
 * moved to a stage of yours in this many days. Nothing recorded which
 * revision of an artifact you had on screen before `opened_revision` did,
 * so an older artifact can't be told apart from one you looked at; the
 * answer says the window.
 */
export const WAITING_DAYS = 14;

/** What a page of a find is asked for. */
export interface FindRequest {
  /** Only words said by this author (`by=me`: the person's own). */
  author?: MomentAuthor;
  cursor?: string;
  kinds?: FindKind[];
  limit?: number;
  q: string;
  /** Whether to ask the machines' transcripts; false answers from names alone. */
  transcripts: boolean;
}

export interface FindDeps {
  /** One machine's transcript answer, or why it gave none. */
  askMachine: (
    machineId: string,
    query: string,
    options: { author?: TranscriptAuthor; limit: number },
    timeoutMs: number
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
): FindMoment => ({
  docId: moment.docId,
  author: moment.author,
  at: moment.timestamp ? Date.parse(moment.timestamp) || null : null,
  excerpt: moment.snippet,
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

/** The hub's match for a moment: how relevant against the best of every machine, by whose words. */
const momentMatch = (score: number, top: number, author: MomentAuthor) =>
  0.15 + 0.35 * (top > 0 ? score / top : 0) * MOMENT_WEIGHT[author];

const decodeCursor = (cursor: string | undefined): number => {
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
      for (const thread of list) {
        threads.set(thread.id, threadEntry(thread, projectOf(projectId)));
      }
    }
    const artifacts = db.find.artifacts().flatMap((artifact) => {
      const maker = held.get(artifact.instanceId);
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
    const stored = storedOf(machines, bySessionId, now);
    names = {
      at: now,
      bySessionId,
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
    now: number
  ): Map<string, Entry> => {
    const stored = new Map<string, Entry>();
    for (const machine of machines.values()) {
      const where = {
        id: machine.machineId,
        name: machineLabel(machine.hostname),
      };
      for (const info of catalogOf(machine, now)) {
        const entry = bySessionId.has(info.sessionId)
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
      indexing: false,
      tookMs: null,
    }));

  /** One machine asked, and how it went: its answer, or why it gave none. */
  const askOne = async (
    machine: AgentRow,
    query: string,
    options: { author?: TranscriptAuthor; limit: number }
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
      TRANSCRIPT_ANSWER_MS
    );
    const tookMs = Math.round(performance.now() - started);
    if ("error" in answer) {
      return {
        coverage: {
          ...base,
          answered: false,
          reason: answer.error,
          indexAgeMs: null,
          indexing: false,
          tookMs,
        },
        answer: null,
      };
    }
    const indexAgeMs =
      answer.syncedAt > 0 ? Math.max(0, Date.now() - answer.syncedAt) : null;
    return {
      coverage: {
        ...base,
        answered: true,
        reason: null,
        indexAgeMs,
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
      const moments = best.map(({ line }): FindMoment => ({
        docId: line.id,
        author: line.who,
        at: line.at,
        excerpt: excerptOf(line.body, words),
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
   * session find leaves out (a discarded one) are left out. Every machine's
   * relevance is read against the best of all of them, weighed by whose
   * words the best moment is.
   */
  const foldTranscripts = (
    found: Map<string, FindResult>,
    asked: Asked[],
    held: Names,
    needsYou: ReadonlySet<string>,
    now: number
  ) => {
    const top = Math.max(
      0,
      ...asked.flatMap((each) =>
        (each.answer?.conversations ?? []).map((hit) => hit.score)
      )
    );
    for (const { coverage, answer } of asked) {
      const machine = { id: coverage.machineId, name: coverage.name };
      for (const hit of answer?.conversations ?? []) {
        foldHit(found, hit, machine, top, held, needsYou, now);
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
    now: number
  ) => {
    const moments = hit.moments.map(momentOf);
    const match = momentMatch(hit.score, top, moments[0]?.author ?? "agent");
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
              score: rankOf(match, stored, 0, now),
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
        score: rankOf(match, result, heldEntry.entry.kin, now),
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
    const { author } = request;
    const asked = await Promise.all(
      [...matched.held.machines.values()].map((machine) =>
        askOne(machine, query.words.join(" "), {
          limit,
          ...(author ? { author } : {}),
        })
      )
    );
    if (!kinds || kinds.has("conversation")) {
      foldTranscripts(found, asked, matched.held, matched.needsYou, now);
    }
    return { asked: true, machines: asked.map((each) => each.coverage) };
  };

  /** Every result of a find, ranked: names, then transcripts when asked; kept for its next pages. */
  const rankAll = async (
    request: FindRequest,
    query: Query,
    kinds: ReadonlySet<FindKind> | null,
    limit: number,
    started: number
  ) => {
    const now = Date.now();
    const matched = findNames(query, kinds, now);
    const namesMs = Math.round((performance.now() - started) * 10) / 10;
    const askTranscripts =
      request.transcripts && query.words.join("").length >= 2;
    if (!askTranscripts) {
      return {
        ranked: [...matched.found.values()].toSorted(
          (a, b) => b.score - a.score
        ),
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
    const said = [...matched.found.values()].filter(
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
    async find(request: FindRequest): Promise<FindAnswer> {
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
      const fresh = await rankedFor(
        request,
        query,
        kinds,
        Math.min(offset + limit, MAX_LIMIT),
        offset > 0,
        started
      );
      const page = fresh.ranked.slice(offset, offset + limit);
      const end = offset + page.length;
      return {
        query: query.words.join(" "),
        results: page,
        next:
          end < fresh.ranked.length
            ? Buffer.from(String(end), "utf8").toString("base64url")
            : null,
        coverage: fresh.coverage,
        timing: { namesMs: fresh.namesMs, transcriptsMs: fresh.transcriptsMs },
      };
    },

    /**
     * What waits on the person's eyes, oldest first within the window
     * ({@link WAITING_DAYS}): artifacts not opened at their current
     * revision, decisions with picks to make, reports to their own sessions
     * they have not opened, tasks waiting in a stage of theirs.
     */
    async waiting(): Promise<WaitingAnswer> {
      const now = Date.now();
      const from = now - WAITING_DAYS * 24 * 3_600_000;
      const held = namesNow(now);
      // What the person has seen is read as it stands, not as the names
      // held it: a look or a `shown` ack a moment ago counts at once.
      const artifactRows = new Map(
        db.find.artifacts().map((row) => [row.id, row])
      );
      const lookedAt = db.find.lookedAt();
      const titleOf = (id: string) => {
        const row = held.conversations.get(id)?.row;
        return row ? { id, title: boardTitle(row) } : null;
      };
      const waitingTasks = await deps.tasksWaiting();
      const items: WaitingItem[] = [
        ...artifactsWaiting(held, artifactRows, from, titleOf),
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
const artifactsWaiting = (
  held: Names,
  rows: Map<string, { openedRevision: number | null; revision: number }>,
  from: number,
  titleOf: TitleOf
): WaitingItem[] =>
  held.entries.flatMap((entry): WaitingItem[] => {
    const { result } = entry;
    if (result.kind !== "artifact" && result.kind !== "decision") {
      return [];
    }
    const row = rows.get(result.id);
    if (!row || (result.lastActivity ?? 0) < from) {
      return [];
    }
    const opened = row.openedRevision;
    const unopened = opened === null || opened < row.revision;
    if (!(unopened || result.picksToMake)) {
      return [];
    }
    let why = "picks to make";
    if (unopened) {
      why = opened === null ? "unseen" : "new revision";
    }
    return [
      {
        kind: result.kind,
        artifactKind: result.artifactKind,
        id: result.id,
        title: result.title,
        project: result.project,
        conversation: titleOf(result.conversation.id),
        revision: row.revision,
        since: result.lastActivity ?? Date.now(),
        why,
      },
    ];
  });

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
export const kindsOf = (raw: string | undefined): FindKind[] | undefined => {
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
  }
): Promise<FindAnswer> => {
  try {
    return await find.find({
      q: query.q ?? "",
      ...(query.limit ? { limit: Number(query.limit) || DEFAULT_LIMIT } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.by ? { author: AUTHOR_OF[query.by] } : {}),
      kinds: kindsOf(query.kinds),
      transcripts: query.transcripts !== "0",
    });
  } catch (error) {
    return refused(error);
  }
};
