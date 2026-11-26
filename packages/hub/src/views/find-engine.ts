/**
 * The fleet's one finding engine (docs/tom/find-and-mention.md, the options
 * doc's shared ground): what "find anything" (⌘K, the phone's jump) and "name
 * something while writing" (`@` in a composer) both ask, answered from one
 * ranking. It runs on the views thread (views/worker.ts), off the hub's own:
 * the hub's thread asks it by message (find.ts) and asks the machines for it.
 *
 * Two parts, two speeds. The names part reads what the hub holds (sessions,
 * tasks, routines, projects, machines, artifacts, decisions, the
 * commits and files of delegates' work items), kept by what moved
 * (views/find-index.ts), and answers in milliseconds:
 * every word of the query, in any order, has to match one of a result's
 * recognisers (find-names.ts). The transcripts part asks every machine's
 * index (`searchTranscripts`, agent search/index.ts), each within
 * {@link TRANSCRIPT_ANSWER_MS}, and folds what they say into conversations,
 * each with its best moments; a machine that did not answer is named in the answer's
 * coverage, never dropped in silence.
 *
 * Ranking, one order for both parts: how well the words matched (a title
 * above a purpose above a project; in a transcript, your words above an
 * agent's above what was handed in), then how recently it moved, then its
 * live state (working and waiting on you above idle above asleep above
 * ended), then parentage (your own sessions, today's delegates of them).
 */

import {
  type ArtifactNeedNoticePart,
  type ArtifactNeedsRead,
  unparked,
} from "@cawco/core/artifact-needs";
import { detach } from "@cawco/core/detach";
import {
  type FindAnswer,
  type FindConversation,
  type FindCoverage,
  type FindKind,
  type FindLeftOut,
  type FindLiveState,
  type FindMachineCoverage,
  type FindMoment,
  type FindResult,
  type MomentAuthor,
  TRANSCRIPT_ANSWER_MS,
  type TranscriptAnswer,
  type TranscriptQuery,
  type WaitingAnswer,
  type WaitingItem,
} from "@cawco/core/find";
import {
  marksOf,
  matchOf,
  matchShape,
  parse,
  type Query,
} from "@cawco/core/find-match";
import { harnessLabel } from "@cawco/core/harness/kinds";
import { recordLimitReading } from "@cawco/core/limit-readings";
import { machineLabel } from "@cawco/core/machine-names";
import { shortId } from "@cawco/core/short-id";
import { DAY_MS, secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { noticePartWords, reasonLine } from "@cawco/core/words/artifact-needs";
import { artifactWords } from "@cawco/core/words/artifacts";
import { catalogWords } from "@cawco/core/words/catalog";
import type { FindInstanceRow, FindWorkItemRow } from "../db/find";
import { AUTHOR_POINTS, MOMENT_WEIGHT, ofKinds, rankOf } from "../find-names";
import { boardTitle, leafOf } from "../labels";
import type { Catalogs } from "./catalogs";
import { type FindIndex, type Names, sessionKey } from "./find-index";
import { cursorAt, DEFAULT_LIMIT } from "./pages";
import type { ViewMachine } from "./read";

// @limit measured: a page; the next page's cursor rides the answer. 50 is the rows one page returns
const MAX_LIMIT = 50;

/** How long an answer that asked the machines is kept for its next pages, ms. */
// @limit recording: hub.find-page-age-ms until 2026-12-10
const PAGE_KEPT_MS = 60_000;
// @limit recording: hub.find-pages-held until 2026-12-03
const PAGES_KEPT = 16;

/**
 * How many of one author's words a listing (no words, a `by`) reads, newest
 * first: the page it asks each machine's index for. Older words are the next
 * listing's, asked `before` the last one read (find-tool.ts pages so).
 */
// @limit measured: a page; the next page's cursor rides the answer. 200 is the documents one listing reads
const LISTED_DOCS = 200;

/** A conversation's moments; none for anything else. */
const momentsOf = (result: FindResult): FindMoment[] =>
  result.kind === "conversation" ? result.moments : [];

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
 * moved since then, a conversation's moments the ones said since;
 * `before` keeps the evidence at or before it (past.dev's `queryTimestamp`:
 * "Evidence that occurred at or before that instant is eligible, and later
 * evidence is out of scope"), a conversation's moments said by
 * then, anything else only when nothing about it moved after.
 */
export interface FindWhere {
  /** ms epoch, the last instant kept. */
  before?: number;
  machineId?: string;
  projectId?: string;
  /** ms epoch. */
  since?: number;
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
   * The machine whose stored sessions are listed again before the find
   * answers, however fresh its listing: Try again on its left-out line
   * (FindAnswer `leftOut`).
   */
  relist?: string;
  /**
   * The hub's own number for this find, by which the machines' searches it
   * asks for are tied to its asker: they are told to stop once the asker no
   * longer waits (the person typed on, closed Find; core `CONTROL_ABANDON`).
   */
  requestId: number;
  /**
   * The words are a finished query, not one being typed (core
   * `TranscriptQuery.submitted`): an agent's `find` says so, so a short last
   * word is searched and not left out.
   */
  submitted?: true;
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
 * when asked (`FindRequest.context`), for
 * the person's secret filter to read (find-secrets.ts), which takes them off
 * before an answer leaves the hub.
 */
export type HeldMoment = FindMoment & { context?: string };

/** What the hub's thread knows now and the views thread does not: which machines it holds a socket of, and which sessions wait on the person. */
export interface Live {
  /** The sessions waiting on the person (core `waitingOnYou`): an ask parked for them, or an artifact of it in Needs you. */
  needsYou: ReadonlySet<string>;
  /** The machines whose socket the hub holds now. */
  online: ReadonlySet<string>;
}

/** Whether `at` (ms epoch, null for no time) falls in `where`'s window. */
const inWindow = (at: number | null, where: FindWhere): boolean =>
  (where.since === undefined || at === null || at >= where.since) &&
  (where.before === undefined || (at !== null && at <= where.before));

/**
 * Whether `result` is a session the person purged (its transcript deleted,
 * db `purged_sessions`): no find answers with it, the person's or an
 * agent's, though its machine's index may still hold its words.
 */
const purgedOut = (result: FindResult, purged: ReadonlySet<string>): boolean =>
  result.kind === "conversation" &&
  result.sessionId !== null &&
  purged.has(sessionKey(result.machine.id, result.sessionId));

/** `result` as `where` keeps it, or null when `where` leaves it out. */
const within = (
  result: FindResult,
  where: FindWhere,
  purged: ReadonlySet<string>
): FindResult | null => {
  if (
    (where.projectId && result.project?.id !== where.projectId) ||
    purgedOut(result, purged)
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
  if (result.kind === "conversation") {
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
    title: dir ?? shortId(hit.sessionId),
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

/** The offset a cursor this hub gave starts at; 0 for none; null for one it did not give. */
const offsetOf = (cursor: string | undefined): number | null => {
  if (!cursor) {
    return 0;
  }
  const offset = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  return Number.isInteger(offset) && offset >= 0 ? offset : null;
};

export interface EngineDeps {
  /**
   * One machine's transcript answer, or why it gave none: asked of the hub's
   * thread, which holds its socket, given `timeoutMs`, and the machine told
   * to stop the search once that passes or the find's asker goes.
   */
  askMachine: (
    machineId: string,
    query: string,
    options: TranscriptQuery & { limit: number },
    timeoutMs: number,
    ask: Pick<FindRequest, "caller" | "requestId">
  ) => Promise<TranscriptAnswer | { error: string }>;
  catalogs: Catalogs;
  index: FindIndex;
}

/** What Jump's waiting list reads beside the names: Needs you's artifacts and the tasks waiting in a stage of yours, as the hub's thread holds them. */
export interface WaitingFrom {
  lane: ArtifactNeedsRead;
  tasks: {
    missing: string[];
    tasks: {
      id: string;
      projectId: string;
      since: number;
      stage: string;
      title: string;
    }[];
  };
}

export const createFindEngine = (deps: EngineDeps) => {
  const { index, catalogs } = deps;
  /** Answers that asked the machines, kept for their next pages. */
  const pages = new Map<
    string,
    {
      answer: FindResult[];
      /** How many conversations each machine was asked for. */
      asked: number;
      at: number;
      /** How many more conversations the machines that filled their ask match, beyond it. */
      beyond: number;
      coverage: FindCoverage;
      transcriptsMs: number | null;
    }
  >();

  /**
   * The names as they stand; a machine online whose catalog was never read
   * is read now, in the background (views/catalogs.ts).
   */
  const namesNow = (now: number, live: Live): Names => {
    for (const machineId of index.machineIds()) {
      if (!catalogs.known(machineId) && live.online.has(machineId)) {
        detach(
          catalogs.relist(machineId),
          `find: ${machineId}'s stored sessions`
        );
      }
    }
    return index.names(now);
  };

  /**
   * Each online machine whose last listing left a harness out, a sentence
   * for each in the words the person reads (core words/catalog.ts).
   */
  const leftOutNow = (live: Live): FindLeftOut[] =>
    index.machineIds().flatMap((machineId) => {
      const known = catalogs.leftOut(machineId);
      if (!(known && live.online.has(machineId))) {
        return [];
      }
      const name = machineLabel(index.hostname(machineId));
      // A harness that never listed has no sessions it listed last.
      const never = (harness: string) => known.neverListed.has(harness);
      const words = [
        ...known.unanswered.map(({ harness, after }) =>
          (never(harness)
            ? catalogWords.harnessDidntAnswerYet
            : catalogWords.harnessDidntAnswer)(
            harnessLabel(harness),
            name,
            secondsOf(after)
          )
        ),
        ...known.failed.map(({ harness, error }) =>
          (never(harness)
            ? catalogWords.harnessCouldntListYet
            : catalogWords.harnessCouldntList)(
            harnessLabel(harness),
            name,
            error
          )
        ),
      ];
      return words.length > 0 ? [{ machineId, words }] : [];
    });

  /** A result's live fields filled in for this answer: a session's state and children, a machine's presence. */
  const liveFields = (
    result: FindResult,
    held: Names,
    now: Live
  ): FindResult => {
    if (result.kind === "machine") {
      return { ...result, online: now.online.has(result.id) };
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
        now.online.has(conversation.row.machineId),
        now.needsYou
      ),
      children: {
        count: conversation.children.length,
        needsYou: conversation.children.filter((id) => now.needsYou.has(id))
          .length,
      },
    };
  };

  /** The names part: every entry that matches, ranked, live fields filled. */
  const findNames = (
    query: Query,
    kinds: ReadonlySet<FindKind> | null,
    now: number,
    liveNow: Live
  ) => {
    const held = namesNow(now, liveNow);
    const found = new Map<string, FindResult>();
    for (const entry of held.entries) {
      if (!ofKinds(entry.result, kinds)) {
        continue;
      }
      const match = matchOf(entry, query);
      if (match.score <= 0) {
        continue;
      }
      const result = liveFields(entry.result, held, liveNow);
      found.set(`${result.kind}:${result.id}`, {
        ...result,
        matched: match.fields,
        score: rankOf(match.score, result, entry.kin, now),
      });
    }
    return { found, held };
  };

  /** The machines a full find would ask, none asked yet: offline ones say so. */
  const unasked = (
    machines: ReadonlyMap<string, ViewMachine>,
    liveNow: Live
  ): FindMachineCoverage[] =>
    [...machines.values()].map((machine) => ({
      machineId: machine.machineId,
      name: machineLabel(machine.hostname),
      answered: false,
      reason: liveNow.online.has(machine.machineId) ? null : "it is offline",
      indexAgeMs: null,
      indexedThrough: null,
      indexing: false,
      tookMs: null,
      unreadTranscripts: 0,
    }));

  /** The coverage of machines asked: each one's, and the short last word a typed query left out of what they searched. */
  const askedCoverage = (asked: Asked[]): FindCoverage => {
    const dropped = asked.find((each) => each.answer?.dropped)?.answer?.dropped;
    return {
      asked: true,
      machines: asked.map((each) => each.coverage),
      ...(dropped ? { droppedWord: dropped } : {}),
    };
  };

  /** One machine asked, and how it went: its answer, or why it gave none. */
  const askOne = async (
    machine: ViewMachine,
    query: string,
    options: TranscriptQuery & { limit: number },
    ask: Pick<FindRequest, "caller" | "requestId">,
    liveNow: Live
  ): Promise<Asked> => {
    const base = {
      machineId: machine.machineId,
      name: machineLabel(machine.hostname),
    };
    if (!liveNow.online.has(machine.machineId)) {
      return {
        coverage: {
          ...base,
          answered: false,
          reason: "it is offline",
          indexAgeMs: null,
          indexedThrough: null,
          indexing: false,
          tookMs: null,
          unreadTranscripts: 0,
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
          unreadTranscripts: 0,
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
        unreadTranscripts: answer.unreadTranscripts ?? 0,
      },
      answer,
    };
  };

  /**
   * Folds the machines' moments into conversations: a session the hub holds
   * gains them; one it never started (a stored CLI session) is a
   * conversation of its own, named by its folder; Caw's conversation session and a
   * session find leaves out (a discarded one) and the hub's own (a
   * summariser's, {@link Names.hubMade}) are left out. Every machine's
   * relevance is read against the best of all of them, weighed by whose
   * words the best moment is.
   */
  const foldTranscripts = (
    found: Map<string, FindResult>,
    asked: Asked[],
    held: Names,
    liveNow: Live,
    now: number,
    words: readonly string[]
  ) => {
    // The hub's own conversations are no hit, nor the measure of one.
    const hits = asked.map(({ coverage, answer }) => ({
      machine: { id: coverage.machineId, name: coverage.name },
      conversations: (answer?.conversations ?? []).filter(
        (hit) =>
          !held.hubMade.has(sessionKey(coverage.machineId, hit.sessionId))
      ),
    }));
    const top = Math.max(
      0,
      ...hits.flatMap((each) => each.conversations.map((hit) => hit.score))
    );
    for (const { machine, conversations } of hits) {
      for (const hit of conversations) {
        foldHit(found, hit, machine, top, held, liveNow, now, words);
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
    liveNow: Live,
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
      ? liveFields(heldEntry.entry.result, held, liveNow)
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

  /** How the words are asked, as the machines' query carries it: what tools answered too, the words around each moment, a finished query. */
  const askedHow = (
    asks: Pick<FindRequest, "context" | "submitted" | "toolOutput">
  ): Pick<TranscriptQuery, "context" | "submitted" | "toolOutput"> => ({
    ...(asks.toolOutput ? { toolOutput: true } : {}),
    ...(asks.context ? { context: true } : {}),
    ...(asks.submitted ? { submitted: true } : {}),
  });

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
    asks: Pick<
      FindRequest,
      "caller" | "context" | "requestId" | "submitted" | "toolOutput"
    >,
    where: FindWhere | undefined,
    held: Names,
    limit: number,
    liveNow: Live
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
            ...askedHow(asks),
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
          asks,
          liveNow
        )
      )
    );
  };

  /**
   * A listing: no words, one author's (`by`). Their words newest first, the
   * each machine's off its index's author and
   * time ({@link LISTED_DOCS} of the window from each); each result holds its
   * listed moments, and the results are ordered by their newest.
   */
  const listAll = async (
    request: Omit<FindRequest, "cursor" | "limit" | "q"> & {
      author: MomentAuthor;
    },
    kinds: ReadonlySet<FindKind> | null,
    started: number,
    liveNow: Live
  ) => {
    const now = Date.now();
    const held = namesNow(now, liveNow);
    const namesMs = Math.round((performance.now() - started) * 10) / 10;
    const where = request.where ?? {};
    const found = new Map<string, FindResult>();
    const askedAt = performance.now();
    const { author } = request;
    const transcripts =
      request.transcripts && (!kinds || kinds.has("conversation"));
    const asked = transcripts
      ? await askMachines(
          "",
          author,
          {
            caller: request.caller,
            context: request.context,
            requestId: request.requestId,
          },
          where,
          held,
          LISTED_DOCS,
          liveNow
        )
      : [];
    foldTranscripts(found, asked, held, liveNow, now, []);
    const purged = index.purged();
    const ranked = [...found.values()]
      .flatMap((result) => within(result, where, purged) ?? [])
      .filter((result) => momentsOf(result).length > 0)
      .toSorted((a, b) => newestOf(b) - newestOf(a));
    return {
      ranked,
      beyond: 0,
      // A machine that gave all it may leaves older words unread: the
      // listing's reader pages on from before its last (find-tool.ts).
      atLimit: asked.some(
        (each) =>
          (each.answer?.conversations.reduce(
            (sum, conversation) => sum + conversation.moments.length,
            0
          ) ?? 0) >= LISTED_DOCS
      ),
      coverage: transcripts
        ? askedCoverage(asked)
        : { asked: false, machines: unasked(held.machines, liveNow) },
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
    started: number,
    liveNow: Live
  ) => {
    if (query.tokens.length === 0 && request.author !== undefined) {
      return listAll(
        { ...request, author: request.author },
        kinds,
        started,
        liveNow
      );
    }
    const now = Date.now();
    const matched = findNames(query, kinds, now, liveNow);
    const namesMs = Math.round((performance.now() - started) * 10) / 10;
    const askTranscripts =
      request.transcripts && query.words.join("").length >= 2;
    const { where } = request;
    const purged = index.purged();
    const kept = (results: Iterable<FindResult>): FindResult[] =>
      [...results].flatMap(
        (result) => within(result, where ?? {}, purged) ?? []
      );
    if (!askTranscripts) {
      // No words: what moved last, newest first.
      const order =
        query.tokens.length === 0
          ? (a: FindResult, b: FindResult) =>
              (b.lastActivity ?? 0) - (a.lastActivity ?? 0) || b.score - a.score
          : (a: FindResult, b: FindResult) => b.score - a.score;
      return {
        ranked: kept(matched.found.values()).toSorted(order),
        beyond: 0,
        coverage: {
          asked: false,
          machines: unasked(matched.held.machines, liveNow),
        },
        namesMs,
        transcriptsMs: null,
      };
    }
    const askedAt = performance.now();
    const asked = await askMachines(
      query.words.join(" "),
      request.author,
      request,
      request.where,
      matched.held,
      limit,
      liveNow
    );
    if (!kinds || kinds.has("conversation")) {
      foldTranscripts(
        matched.found,
        asked,
        matched.held,
        liveNow,
        now,
        query.words
      );
    }
    // Who said it narrows to what holds their words: a moment of theirs.
    const said = kept(matched.found.values()).filter(
      (result) =>
        !request.author ||
        (result.kind === "conversation" && result.moments.length > 0)
    );
    return {
      ranked: said.toSorted((a, b) => b.score - a.score),
      // A machine that filled its ask has more than it gave: the next page asks for them.
      beyond: asked.reduce(
        (sum, each) =>
          each.answer?.matched !== undefined &&
          each.answer.conversations.length >= limit
            ? sum + each.answer.matched - each.answer.conversations.length
            : sum,
        0
      ),
      coverage: askedCoverage(asked),
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
    started: number,
    liveNow: Live
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
    if (kept) {
      // A next page asked of a kept answer: how long after it was kept.
      recordLimitReading("hub.find-page-age-ms", Date.now() - kept.at);
    }
    // Kept while it holds what the page asks for: a machine that filled its ask has more, asked again for as many as this page reaches.
    if (
      kept &&
      Date.now() - kept.at < PAGE_KEPT_MS &&
      (kept.beyond === 0 || kept.asked >= limit || kept.answer.length >= limit)
    ) {
      // A session purged since the first page is on none after it.
      const purged = index.purged();
      return {
        ranked: kept.answer.filter((result) => !purgedOut(result, purged)),
        beyond: kept.beyond,
        coverage: kept.coverage,
        namesMs: 0,
        transcriptsMs: kept.transcriptsMs,
      };
    }
    const fresh = await rankAll(request, query, kinds, limit, started, liveNow);
    if (fresh.transcriptsMs !== null) {
      pages.set(key, {
        answer: fresh.ranked,
        asked: limit,
        at: Date.now(),
        beyond: fresh.beyond,
        coverage: fresh.coverage,
        transcriptsMs: fresh.transcriptsMs,
      });
      recordLimitReading("hub.find-pages-held", pages.size);
      while (pages.size > PAGES_KEPT) {
        const [oldest] = pages.keys();
        pages.delete(oldest);
      }
    }
    return fresh;
  };

  return {
    /** One page of a find; `cursor` names one this hub did not give when it is not one. */
    async find(
      request: FindRequest,
      liveNow: Live
    ): Promise<FindPage | { cursor: string }> {
      const { relist: again } = request;
      if (again && liveNow.online.has(again)) {
        // Its listing as it stands now, whatever the last one left out.
        await catalogs
          .relist(again)
          .catch((error: unknown) =>
            console.warn(
              `[find] listing ${again}'s stored sessions again failed: ${error instanceof Error ? error.message : String(error)}`
            )
          );
      }
      const started = performance.now();
      const query = parse(request.q);
      const limit = Math.min(
        Math.max(1, request.limit ?? DEFAULT_LIMIT),
        MAX_LIMIT
      );
      const offset = offsetOf(request.cursor);
      if (offset === null) {
        return { cursor: request.cursor ?? "" };
      }
      // No words: what moved last among sessions, unless kinds say.
      const named = request.kinds?.length ? new Set(request.kinds) : null;
      const kinds =
        query.tokens.length === 0 && !named
          ? new Set<FindKind>(["conversation"])
          : named;
      // A narrowed find drops what the machines answer outside it: they are
      // asked for as many as a page holds, so a page is not left short.
      const fresh = await rankedFor(
        request,
        query,
        kinds,
        request.where ? Math.max(MAX_LIMIT, offset + limit) : offset + limit,
        offset > 0,
        started,
        liveNow
      );
      const page = fresh.ranked.slice(offset, offset + limit);
      const end = offset + page.length;
      // What the machines matched in all, not only what they gave: the page's next asks for more of it.
      const total = fresh.ranked.length + fresh.beyond;
      const found: FindPage = {
        query: query.words.join(" "),
        results: page,
        next: end < total ? cursorAt(end) : null,
        total,
        coverage: fresh.coverage,
        leftOut: leftOutNow(liveNow),
        timing: { namesMs: fresh.namesMs, transcriptsMs: fresh.transcriptsMs },
      };
      return found;
    },

    /**
     * A listing whole, unpaged: `request.author`'s words in its window,
     * newest first ({@link listAll}), for an agent's find to page moment by
     * moment (find-tool.ts).
     */
    async listing(
      request: Omit<FindRequest, "cursor" | "limit" | "q"> & {
        author: MomentAuthor;
      },
      liveNow: Live
    ): Promise<{
      atLimit: boolean;
      coverage: FindCoverage;
      results: FindResult[];
    }> {
      const named = request.kinds?.length ? new Set(request.kinds) : null;
      const kinds = named ?? new Set<FindKind>(["conversation"]);
      const listed = await listAll(request, kinds, performance.now(), liveNow);
      return {
        atLimit: listed.atLimit,
        results: listed.ranked,
        coverage: listed.coverage,
      };
    },

    /**
     * The sessions these names name, each as find answers it (its live
     * fields filled), or null when it names none: a session's full id, or
     * its handle or a short id of six or more characters that names only
     * one (core references.ts; the hub's own resolver, delegation-actions.ts).
     * Keyed: each name reads the sessions held by id.
     */
    named(
      names: readonly string[],
      liveNow: Live
    ): Record<string, FindConversation | null> {
      const held = index.names(Date.now());
      const answered: Record<string, FindConversation | null> = {};
      for (const name of names) {
        const id = namedId(held, name);
        const one = id ? held.conversations.get(id) : undefined;
        const result = one
          ? liveFields(one.entry.result, held, liveNow)
          : undefined;
        answered[name] = result?.kind === "conversation" ? result : null;
      }
      return answered;
    },

    /**
     * What waits on the person's eyes, oldest first within the window
     * ({@link WAITING_DAYS}): artifacts not opened at their current
     * revision, decisions with picks to make, reports to their own sessions
     * they have not opened, tasks waiting in a stage of theirs.
     */
    waiting(from: WaitingFrom, liveNow: Live): WaitingAnswer {
      const now = Date.now();
      const since = now - WAITING_DAYS * DAY_MS;
      const held = namesNow(now, liveNow);
      const titleOf = (id: string) => {
        const row = held.conversations.get(id)?.row;
        return row ? { id, title: boardTitle(row) } : null;
      };
      const items: WaitingItem[] = [
        ...artifactsWaiting(held, from.lane, titleOf),
        ...reportsWaiting(index.workItems(), held, since, titleOf),
        ...from.tasks.tasks
          .filter((task) => task.since >= since)
          .map((task): WaitingItem => {
            const project = index.project(task.projectId);
            return {
              kind: "task",
              id: `${task.projectId}:${task.id}`,
              title: task.title,
              project: project ?? null,
              conversation: null,
              since: task.since,
              why: task.stage,
            };
          }),
      ];
      return {
        items: items.toSorted((a, b) => a.since - b.since),
        days: WAITING_DAYS,
        missing: from.tasks.missing,
      };
    },
  };
};

/** The shortest id part that names a session (the hub's resolver's own). */
const SHORT_ID = 6;

/** The id a session's name names among the held conversations: its full id, its handle, or a short id that names only one. */
const namedId = (held: Names, name: string): string | null => {
  if (held.conversations.has(name)) {
    return name;
  }
  const hash = name.lastIndexOf("#");
  const part = hash >= 0 ? name.slice(hash + 1) : name;
  if (part.length < SHORT_ID) {
    return null;
  }
  const starting = [...held.conversations.values()].filter(({ row }) =>
    row.id.startsWith(part)
  );
  if (starting.length === 1) {
    return starting[0].row.id;
  }
  const handled = starting.filter(
    ({ entry }) =>
      entry.result.kind === "conversation" && entry.result.handle === name
  );
  return handled.length === 1 ? handled[0].row.id : null;
};

type TitleOf = (id: string) => { id: string; title: string } | null;

/** When the person last looked at session `id` (`instances.seen_at`, the look every device marks), ms epoch; 0 for never. */
const lookedAt = (held: Names, id: string): number =>
  held.conversations.get(id)?.row.seenAt?.getTime() ?? 0;

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
    default:
      unhandled("notice", part);
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
      ...named(need.artifactId, need.instanceId, need.title),
      artifactKind: need.artifactKind,
      since: need.raisedAt,
      why: reasonLine(need.pending),
    })),
    ...lane.notices.map((notice): WaitingItem => ({
      ...named(notice.artifactId, notice.instanceId, notice.title),
      artifactKind: notice.artifactKind,
      since: notice.at,
      why: notice.parts.map((part) => partWhy(part, notice.title)).join(" · "),
    })),
  ];
};

/**
 * Reports to one of the person's own sessions they have not looked at
 * since: neither the reporting session nor the one it reported to was in
 * front of them after the report came (`instances.seen_at`, the look every
 * device marks). A delegate's report to its parent delegate is that
 * parent's to read.
 */
const reportsWaiting = (
  items: Iterable<FindWorkItemRow>,
  held: Names,
  from: number,
  titleOf: TitleOf
): WaitingItem[] =>
  [...items].flatMap((item): WaitingItem[] => {
    const ended = item.endedAt?.getTime() ?? 0;
    const reported = item.state === "done" || item.state === "failed";
    const parent = held.conversations.get(item.parentInstanceId)?.row;
    const yours = parent !== undefined && parent.parentInstanceId === null;
    const looked = Math.max(
      lookedAt(held, item.instanceId),
      lookedAt(held, item.parentInstanceId)
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
