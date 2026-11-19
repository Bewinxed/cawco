/**
 * BM25 search over transcript documents, backed by SQLite FTS5 (bun:sqlite).
 *
 * Subpath export: `@cawco/jsonl-parser/fts5`. Bun-only; the core parser
 * stays runtime-neutral.
 *
 * Layout: a `docs` content table plus an external-content FTS5 table
 * (`tokenize='porter unicode61'`) kept in sync by triggers, so text is
 * stored once and BM25/snippets come for free. A `files` table holds
 * per-file `(size, offset, lines)` checkpoints: Claude Code's and pi's
 * transcripts are append-only, so `sync()` re-parses only appended bytes.
 */

import { Database } from "bun:sqlite";
import { rmSync } from "node:fs";
import { FILE_HARNESSES, scanDocs, type TranscriptFile } from "./docs.ts";
import type { Checkpoint } from "./file.ts";
import { parseMany } from "./pool.ts";
import { section } from "./section.ts";
import {
  AUTHOR_RULES,
  type DocAuthor,
  type ExtractOptions,
  type PlaceKind,
  type TranscriptDoc,
  userAuthor,
} from "./text.ts";

/**
 * The prefix indexes the FTS table keeps (https://www.sqlite.org/fts5.html#prefix_indexes):
 * "querying for a prefix token can be slow, as it requires a range scan",
 * and FTS5 merges every term the range holds across the whole index before
 * a rowid range narrows it, so find in one conversation paid for the whole
 * machine. A prefix index answers a prefix of exactly its length from one
 * doclist, which FTS5 seeks to a conversation's rowids like any word's.
 *
 * Three letters only, measured on obelisk's 2,041,537 records (2026-11-19),
 * each table built whole: its FTS data 644 MB with none, 1,096 MB with
 * '3', 1,533 MB with '2 3', 1,917 MB with '2 3 4'. The phrase matched in a
 * 41,790-record conversation, median ms with none, '3', '2 3', '2 3 4':
 * "the"* 98, 25, 25, 28; "con"* 52, 17, 18, 17; "th"* 160, 104, 28, 37;
 * "file"* 24, 23, 23, 15; "erro"* 13, 13, 13, 10. A word shorter than
 * {@link PREFIX_MIN} is never matched as a prefix, so a two-letter index
 * answers nothing a search asks; a four-letter one ('3 4', 1,481 MB) saves
 * under 10 ms where four letters already cost under 25, for 35% more data.
 */
const FTS_PREFIX = "3";

/** The FTS table `name`, over `docs`, with the index's tokenizer and {@link FTS_PREFIX}. */
const ftsTable = (name: string): string => `CREATE VIRTUAL TABLE IF NOT EXISTS ${name} USING fts5(
  text, thinking, tools, output,
  content='docs', content_rowid='id',
  tokenize='porter unicode61', prefix='${FTS_PREFIX}'
);`;

/** `docs_fts` kept to `docs`: each record's words in as it is inserted, out as it is deleted. */
const FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts(rowid, text, thinking, tools, output) VALUES (new.id, new.text, new.thinking, new.tools, new.output);
END;
CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, text, thinking, tools, output) VALUES ('delete', old.id, old.text, old.thinking, old.tools, old.output);
END;
`;

/**
 * The `meta` key of the {@link FTS_PREFIX} `docs_fts` was made with: an
 * index whose value differs (an older one has none) builds its next table
 * ({@link TranscriptIndex.rebuildFts}), once.
 */
const FTS_LAYOUT = "fts_prefix";

/** The `meta` key of the {@link FTS_PREFIX} `docs_fts_next` is being built with. */
const FTS_NEXT_LAYOUT = "fts_next_prefix";

/**
 * The `meta` key of how far `docs_fts_next` is built: it holds every record
 * of `docs` whose rowid is at most this, and no other. The build takes the
 * next rowids above it; a record inserted or deleted at or below it
 * (a rowid freed by a forget and used again, a reattribution's delete) is
 * kept there by {@link FTS_NEXT_TRIGGERS}.
 */
const FTS_NEXT_THROUGH = "fts_next_through";

/** `docs_fts_next` kept to the records of `docs` it already holds ({@link FTS_NEXT_THROUGH}). */
const FTS_NEXT_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS docs_next_ai AFTER INSERT ON docs
WHEN new.id <= (SELECT CAST(value AS INTEGER) FROM meta WHERE key = '${FTS_NEXT_THROUGH}') BEGIN
  INSERT INTO docs_fts_next(rowid, text, thinking, tools, output) VALUES (new.id, new.text, new.thinking, new.tools, new.output);
END;
CREATE TRIGGER IF NOT EXISTS docs_next_ad AFTER DELETE ON docs
WHEN old.id <= (SELECT CAST(value AS INTEGER) FROM meta WHERE key = '${FTS_NEXT_THROUGH}') BEGIN
  INSERT INTO docs_fts_next(docs_fts_next, rowid, text, thinking, tools, output) VALUES ('delete', old.id, old.text, old.thinking, old.tools, old.output);
END;
`;

/**
 * A document is one record, deduplicated on its time, `doc_id` and harness
 * (`docs_key`): the same record, read again or copied into a resumed or
 * forked session, carries the same uuid and the same timestamp (Claude Code
 * 2.x rewrites only `sessionId` in a fork's copy). Leading with the time is
 * what keeps the index cheap to write: live records are the newest, so each
 * sync's entries land together at its right edge. Keyed on the random
 * `doc_id` alone, each new document dirtied a page of its own, and that page
 * was most of what a sync wrote. A record with no time is deduplicated on its
 * `doc_id`.
 *
 * `docs_author_ts` serves a listing with no words ({@link TranscriptIndex.listed}):
 * one author's documents newest first, read backwards off the index from the
 * window's end and stopped at its limit, never a scan of `docs`. Each author's
 * new documents are its newest, so a sync's entries land at the right edge of
 * that author's range: a handful of pages a sync, one per author written.
 *
 * `docs_conversation` serves find in one conversation ({@link TranscriptIndex.places}):
 * its records in time order with who said each, read off the index alone,
 * and the span of rowids they hold, which FTS5 seeks its doclists to.
 * Without it the phrase was matched across the whole machine and each
 * match's row read to learn its session: "the" in a 41,790-record
 * conversation of a 2,032,817-record index (obelisk, 2026-11-19) read
 * 824,000 rows for its 500 oldest places, 696 ms; through it, every one of
 * its 18,090 places and their counts, 268 ms, "dashboard" 203 ms to 56. An
 * index by session was dropped once (75f8254006), keyed by the session's
 * uuid as text; keyed by its `strings` id, a session's entries are ~40
 * bytes and land at its own right edge, one page a live session a sync, as
 * `docs_author_ts`'s land at each author's. On that index it is 88 MB, 3%
 * of the file, built in 2.6 s as the writer first opens it.
 *
 * The harness, session, role, author, cwd and model are the same few strings
 * on row after row, so a row holds each as the id of its one copy in
 * `strings`. As text they were ~100 of a row's ~320 bytes, and half the rows
 * (a tool call's record, found by its tool's name) carry no text at all:
 * written in full, they made the bulk of what a sync adds to the file.
 *
 * `author` is who the words are ({@link DocAuthor}): the person's own turns
 * are told apart from what a harness or CawCo put under the user's role, so
 * "said by me" is only the person, and a search weighs the person's words and
 * a delegate's report over the rest. `thinking` is apart from `text`, so a
 * match in what a model thought weighs less than one in what it said.
 * `output` is what the tools answered (text.ts `TOOL_OUTPUT_CHARS` of each
 * result), searched only when a search asks for it ({@link SearchOptions.toolOutput}).
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS strings (id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY,
  harness INTEGER NOT NULL,
  doc_id TEXT NOT NULL,
  session INTEGER NOT NULL,
  role INTEGER NOT NULL,
  author INTEGER NOT NULL,
  ts TEXT,
  cwd INTEGER,
  model INTEGER,
  sidechain INTEGER NOT NULL DEFAULT 0,
  tools TEXT,
  thinking TEXT,
  text TEXT NOT NULL,
  output TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS docs_key ON docs(coalesce(ts, ''), doc_id, harness);
CREATE INDEX IF NOT EXISTS docs_author_ts ON docs(author, ts);
CREATE INDEX IF NOT EXISTS docs_conversation ON docs(session, sidechain, ts, id, author);
${ftsTable("docs_fts")}
${FTS_TRIGGERS}
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  offset INTEGER NOT NULL,
  lines INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/**
 * Where a search marks its moments' words ({@link TranscriptIndex.#marked}):
 * a table of the connection's own, in memory (`temp_store`), with the
 * index's columns and tokenizer, holding the moments of one search at a time.
 */
const MARKING = `
CREATE VIRTUAL TABLE IF NOT EXISTS temp.marking USING fts5(
  text, thinking, tools, output,
  tokenize='porter unicode61'
);
`;

/**
 * How many of FTS5's segments on one level are merged together: its most
 * ("the minimum number of b-tree segments that will be merged together by a
 * 'merge' command with a positive parameter … The default value … is 4. The
 * minimum allowed value is 2, and the maximum 16",
 * https://www.sqlite.org/fts5.html#the_usermerge_configuration_option).
 * Each commit is a segment, and a merge writes its segments' postings again
 * and frees the old pages, which the next inserts reuse, and a rollback
 * journal copies out every reused page first. Measured on the disk probe's
 * corpus with FTS5's automatic merge at the same number, six ten-minute
 * syncs: 16.4 MB written at 4, 14.9 MB at 16; the first sync after a
 * catch-up (which merges the catch-up's segments) 4.8 MB at 4, 3.3 MB at 16.
 * A search reads every segment: 27 ms a query at 4, 29 at 16.
 */
const FTS_USERMERGE = 16;

/**
 * FTS5 merges nothing inside an insert: "Setting the 'automerge' parameter
 * to 0 disables the automatic incremental merging of b-trees altogether"
 * (#the_automerge_configuration_option), and the index merges itself in
 * bounded steps between its commits instead ({@link MERGE_PAGES}). Merged
 * inside an insert, one insert of a catch-up held an agent's loop 1.3 s
 * ("search index: documents inserted, 1342 ms" and "1276 ms", agent-loop
 * probe, 2026-10-24), first as a crisis merge, then as the automatic one.
 */
const FTS_AUTOMERGE = 0;

/**
 * How many segments on one level wait before an insert merges them all at
 * once: "an INSERT, UPDATE or DELETE that triggers a crisis-merge may take a
 * long time to complete"; "there is no maximum limit"
 * (#the_crisismerge_configuration_option). The index's own steps keep each
 * level under {@link FTS_USERMERGE}, so this is never reached. Our own call.
 */
const FTS_CRISISMERGE = 1024;

/**
 * Pages one merge step writes: "merges b-tree structures together until
 * roughly N pages of merged data have been written"
 * (#the_merge_command); a page is 4050 bytes by default (#the_pgsz_configuration_option).
 * Our own call: about a megabyte, a few tens of ms.
 */
const MERGE_PAGES = 256;

/**
 * How much a match weighs by whose words it is in: the person's own words
 * and a delegate's report are what a search is usually after (a request, a
 * decision, a conclusion), a model's prose next, and what a harness or CawCo
 * put under the user's role (notices, command echoes) least. Our own call,
 * from the task model's T3 and T6 (docs/tom/find-and-mention.md).
 */
const AUTHOR_WEIGHT: Record<DocAuthor, number> = {
  owner: 2,
  report: 1.6,
  agent: 1,
  injected: 0.3,
};

/**
 * BM25's weight of each FTS column, in the table's order (text, thinking,
 * tools, output): what a model thought counts for less than what was said, a
 * tool's name for less still, and what a tool answered least: it is long and
 * repeats what was said about it. Our own call.
 */
const COLUMN_WEIGHTS = "1.0, 0.35, 0.25, 0.2";

/** The columns a search reads unless it asks for what tools answered too. */
const SAID_COLUMNS = "{text thinking tools}";

/**
 * The tiers a search ranks in, newest first: the newest 2,000 documents,
 * then the newest 20,000, then the rest, each only while the tiers before it
 * leave the answer short. BM25 is computed for every document a query
 * matches and FTS5 has no early stop: a common word (in 87% of documents)
 * scored 350,000 matches in a 400,000-document index, 440 ms at p95, and
 * still 100 ms scored across a 20,000-document tier. A common word fills the
 * answer in the first tier for a few ms; a rare word walks on to the whole
 * history, paying only for its own few matches. Rowids grow with when a
 * document was written ({@link TranscriptIndex.sync} inserts a catch-up
 * oldest first), so a tier is the rowids above `max(id)` less its size, read
 * in constant time, and FTS5 seeks to it in each doclist. Recent first is
 * what a search is after (docs/tom/find-and-mention.md, T1 and T3).
 */
const RECENT_TIERS = [2000, 20_000];

/**
 * How long the word being typed must be to match as the start of longer
 * ones: two letters expand to thousands of terms while discriminating nothing.
 */
const PREFIX_MIN = 3;

/** How many moments of one conversation a search answers with. */
const MOMENTS_PER_CONVERSATION = 3;

/** How much each of a conversation's moments counts in its score, best first. */
const MOMENT_COUNTS = [1, 0.3, 0.15];

/**
 * How many matching documents a search ranks before it groups them by
 * conversation: enough that a conversation with many matching lines does not
 * crowd every other out of a short answer.
 */
const SCAN_PER_CONVERSATION = 12;

export interface SearchOptions {
  /** How many conversations to answer with (default 20). */
  limit?: number;
  /** Only documents by this author: `owner` is "said by me". */
  author?: DocAuthor;
  /** Only documents of these conversations, by session id. */
  sessions?: readonly string[];
  /** Only documents written at or before this ISO time; one with no time is left out. */
  before?: string;
  /** Match what tools answered too (`output`); otherwise only what was said, thought and called. */
  toolOutput?: boolean;
  /** Each moment carries the words around its snippet ({@link Moment.context}). */
  context?: boolean;
  /** The words are a finished query, not one being typed: a short last word is searched whole ({@link matchQueries}). */
  submitted?: boolean;
}

/** What a listing with no words asks for: one author's documents, newest first. */
export interface ListOptions {
  author: DocAuthor;
  /** How many documents to answer with, every conversation together. */
  limit: number;
  /** Only documents of these conversations, by session id. */
  sessions?: readonly string[];
  /** Only documents written at or after this ISO time. */
  since?: string;
  /** Only documents written at or before this ISO time. */
  before?: string;
  /** What tools answered is listed too; otherwise a document of a tool's answer alone is left out. */
  toolOutput?: boolean;
  /** Each moment carries the start of its words ({@link Moment.context}), {@link CONTEXT_CHARS} twice over. */
  context?: boolean;
}

/**
 * What `turns` reads: the records of a conversation around one of them, as
 * the index holds them, so a conversation's turns are read whatever its
 * stored transcript keeps now (a compaction or an account move drops records
 * from there; the index keeps every one it read).
 */
export interface TurnsOptions {
  /** The conversation, by every harness session id it went by. */
  sessions: readonly string[];
  /** The record at the centre, by its id or the start of it ({@link DOC_ID_PREFIX_MIN} characters or more); none: its latest turn. */
  docId?: string;
  /** When the centre was said, ms epoch, to the second: it is sought there, not walked to. */
  at?: number;
  /** How many turns either side of the centre. */
  side: number;
}

/**
 * What `places` reads: one window of the places in one conversation where
 * the words stand together, what tools answered included, oldest first, for
 * the person's find in that conversation to step through (core `FindPlace`).
 */
export interface PlacesOptions {
  /** The conversation, by every harness session id it went by. */
  sessions: readonly string[];
  /** The words, matched as one phrase, the last also as the start of a longer word. */
  words: string;
  /** Only the places of this kind; every place when absent. */
  kind?: PlaceKind;
  /** The window's first place, by its position among the places kept, from 0; absent: the newest `limit`, where find starts. */
  offset?: number;
  /**
   * The window round the place at this position among every place (the
   * first kept at or after it, else the last kept before it), in place of
   * `offset`: where a place stepped to stands among the places one
   * whose's words keep.
   */
  near?: number;
  /** The most places the window holds. */
  limit: number;
}

/** What `places` answers: how many places there are, and one window of them. */
export interface PlacesAnswer {
  /** How many places of each kind the conversation holds. */
  counts: Record<PlaceKind, number>;
  /** The position of the window's first place among the places kept. */
  offset: number;
  places: IndexedPlace[];
  /**
   * When the newest record of the conversation the index holds was said:
   * what was said after it is not in these places yet. Null when it holds
   * none with a time.
   */
  through: string | null;
}

/** One place `places` answers. */
export interface IndexedPlace {
  kind: PlaceKind;
  /** Its position among every place of the find, from 0. */
  n: number;
  /** Which of its columns holds the words. */
  column: "output" | "text" | "thinking";
  docId: string;
  /** The words round the match, the match between 「 and 」 (none when only a stem of them is there). */
  excerpt: string;
  timestamp: string | null;
}

/**
 * How many characters of a place's words stand before its match and after
 * it: little before, so a narrow row still shows the match.
 */
const PLACE_LEAD = 32;
const PLACE_TAIL = 96;

/** `column` cut round `at` (`length` long), the match marked as the engine marks it. */
function placeExcerpt(column: string, at: number, length: number): string {
  const from = Math.max(0, at - PLACE_LEAD);
  const to = Math.min(column.length, at + length + PLACE_TAIL);
  const flat = (text: string) => text.replace(SPACES, " ");
  return `${from > 0 ? "…" : ""}${flat(column.slice(from, at))}「${flat(column.slice(at, at + length))}」${flat(column.slice(at + length, to))}${to < column.length ? "…" : ""}`;
}

/**
 * The columns a place in what was said or thought is matched in: what a
 * tool was called by is not a place, its answer is (`output`).
 */
const SAID_PLACE_COLUMNS = "text thinking";

/**
 * How many finds' places a reader holds ({@link TranscriptIndex.#placeList}):
 * the find being stepped through and the words typed just before it, each
 * a few hundred KB at most (two numbers a place). Our own call.
 */
const PLACE_LISTS = 4;

/** Every place of one find in one conversation, oldest first, as `places` holds them between windows. */
interface PlaceList {
  /** The phrase's first word, as typed: where a stemmed match is cut round. */
  first: string;
  /** Each place's record, by rowid. */
  ids: number[];
  kinds: PlaceKind[];
  /** {@link PlacesAnswer.through}. */
  through: string | null;
  /** The words as typed. */
  typed: string;
  /** The index's `data_version` they were read at. */
  version: number;
}

/** One record of a conversation as `turns` answers it: its words, each column cut to {@link TURN_CHARS}. */
export interface IndexedTurn {
  author: DocAuthor;
  docId: string;
  output: string | null;
  role: string;
  /** Said inside a subagent (a sidechain): a neighbour never is; only a centre can be. */
  sidechain: boolean;
  text: string;
  thinking: string | null;
  timestamp: string | null;
  /** The tools it called, space-joined. */
  tools: string | null;
}

/** What `turns` answers: the turns, oldest first, the centre among them, and whether the conversation goes on either side; or why there are none. */
export type TurnsAnswer =
  | { centre: number; earlier: boolean; later: boolean; turns: IndexedTurn[] }
  | { missing: string };

/** The shortest start of a record's id that `turns` takes for it: a handle's eight characters, less a margin. */
const DOC_ID_PREFIX_MIN = 6;
/** Each column of a turn `turns` answers, cut to this: the hub shows 2,000 characters of one at most. */
const TURN_CHARS = 8000;
/**
 * How many records a walk through the time order reads for one side of
 * `turns`, at most: the index holds no order by conversation (see the
 * schema), so a conversation's neighbours are walked to through every
 * conversation's records written between them. Past this, the walk says
 * there is more without having found it.
 */
const WALK_MAX = 20_000;
/** How many records one step of a walk reads. */
const WALK_CHUNK = 1000;
/** How far either side of `TurnsOptions.at` the centre is sought, ms: `at` is to the second. */
const AT_MARGIN_MS = 2000;
/** Past every ISO time, as a walk's start from the newest. */
const END_KEY = "￿";

/** One record a walk passes: enough to tell whether it is the conversation's, and a turn. */
interface Step {
  docId: string;
  id: number;
  key: string;
  /** It has words or calls: a turn, not a tool's answer or a thought alone. */
  said: number;
  session: number;
  sidechain: number;
}

/** One place in a conversation that matched: where to open it, and why it matched. */
export interface Moment {
  docId: string;
  role: string;
  author: DocAuthor;
  timestamp: string | null;
  /** BM25 weighed by author; higher is better. */
  score: number;
  /** The matching words, terms between 「 and 」. */
  snippet: string;
  /**
   * The words around the moment's best match, when the search asked
   * (`context`): {@link CONTEXT_CHARS} either side of where the most of the
   * query's different terms stand together, each token the index matched
   * between 「 and 」 (FTS5 `highlight`, so by the index's own tokenizer and
   * stemmer, whole tokens only). What the hub cuts an agent's excerpt from
   * and its secret filter reads, since a password typed in prose is told by
   * a word that may stand outside the snippet. A listing's (no query) is the
   * start of its words, unmarked.
   */
  context?: string;
}

/** How many characters of a document a moment's context keeps either side of its best match. */
const CONTEXT_CHARS = 1000;
const MARK_OPEN = "「";
const MARK_CLOSE = "」";
/** Each token the index matched, between its marks. */
const MARKED_TOKEN = /「([^」]*)」/g;

/**
 * Where in `marked` (a column, its matched tokens marked) the most of the
 * query's different terms stand within {@link CONTEXT_CHARS} of each other,
 * and how many: a word as common as "the", matched all over a long turn,
 * counts once, so the place that holds the whole query wins over the place
 * that holds it again and again.
 */
function bestCluster(marked: string): { at: number; terms: number } {
  const marks = [...marked.matchAll(MARKED_TOKEN)].map((match) => ({
    at: match.index,
    term: (match[1] ?? "").toLowerCase(),
  }));
  let best = { at: 0, terms: 0 };
  let end = 0;
  for (const [start, mark] of marks.entries()) {
    end = Math.max(end, start);
    while (end < marks.length && (marks[end]?.at ?? 0) - mark.at <= CONTEXT_CHARS) {
      end++;
    }
    const terms = new Set(marks.slice(start, end).map((each) => each.term)).size;
    if (terms > best.terms) {
      best = { at: mark.at, terms };
    }
  }
  return best;
}

/** `marked` from `from` to `to`, moved out of any mark either edge would cut. */
function uncut(marked: string, from: number, to: number): string {
  const open = marked.lastIndexOf(MARK_OPEN, from);
  const start = open >= 0 && marked.lastIndexOf(MARK_CLOSE, from) < open ? open : from;
  const close = marked.indexOf(MARK_CLOSE, to);
  const reopen = marked.indexOf(MARK_OPEN, to);
  const end = close >= 0 && (reopen < 0 || close < reopen) ? close + 1 : to;
  return marked.slice(Math.max(0, start), end);
}

/**
 * A moment's context ({@link Moment.context}): its columns as the index
 * marked them, the one whose best place holds the most of the query's
 * terms, cut {@link CONTEXT_CHARS} either side of that place; undefined when
 * no column holds a mark (a match in the names of the tools it called).
 */
function contextOf(doc: {
  output: string | null;
  text: string;
  thinking: string | null;
}): string | undefined {
  let best: { at: number; marked: string; terms: number } | undefined;
  for (const marked of [doc.text, doc.thinking, doc.output]) {
    const found = marked ? bestCluster(marked) : { at: 0, terms: 0 };
    if (marked && found.terms > (best?.terms ?? 0)) {
      best = { ...found, marked };
    }
  }
  return best
    ? uncut(best.marked, Math.max(0, best.at - CONTEXT_CHARS), best.at + 2 * CONTEXT_CHARS)
    : undefined;
}

/** A conversation that matched, with its best few moments, best first. */
export interface ConversationHit {
  harness: string;
  sessionId: string;
  cwd: string | null;
  model: string | null;
  sidechain: boolean;
  /** Its best moment's score, with its next two counting a little; higher is better. */
  score: number;
  moments: Moment[];
}

/** One pass of a search: what it matches, in which rowids, and which words its excerpts mark. */
interface Pass {
  /** Its MATCH expression: every word required, in the columns searched. */
  match: string;
  /** What its excerpts mark: any of its words, in the same columns. */
  mark: string;
  /** The rowids it ranks in, as SQL on `docs_fts.rowid`. */
  within: string;
  /** Its words, lowercase: what a long column's marked stretch is chosen by. */
  words: readonly string[];
}

/**
 * How many characters of each column of a moment's document its excerpt and
 * context are marked in, at most: the stretch where the most of the query's
 * different words stand together, {@link CONTEXT_CHARS} before it and the
 * rest after. FTS5's `snippet()` scores each match of the query's words in a
 * column against every other one (fts5_aux.c `fts5SnippetScore` walks every
 * instance for each instance), so its cost grows with the square of the
 * matches: a fifteen-word query from an agent's `find`, every word required,
 * ranks the longest documents first (only they hold every word), and on
 * obelisk's 1.47M-document index its excerpts took 13.5 s of a 17 s search,
 * 1.7 s for one 738 KB document; a 33-word one took 87 s; four in a row held
 * its agent 26 minutes (2026-10-25). Cut to this, each costs what this many
 * characters cost.
 */
const MARKED_CHARS = 4 * CONTEXT_CHARS;
/**
 * How many places of one word a column's stretch is chosen among: a word
 * found more often than this is taken to stand everywhere in the column (a
 * word as common as "the"), and the stretch is chosen by the rarer ones.
 */
const PLACES_PER_WORD = 512;
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Where in `column` its marked stretch starts ({@link MARKED_CHARS}): the
 * column's start when it is that short or holds none of `words` (lowercase);
 * else {@link CONTEXT_CHARS} before the place where the most of them start a
 * word within {@link CONTEXT_CHARS} of each other, the one with the most of
 * their places among equals, the first among those (as FTS5's `snippet`
 * weighs a window: each phrase it holds first, its repeats after). Found by
 * the words as written, not by the index's stemmer: a word only its stem
 * finds leaves the stretch where the others stand, and the stretch's marks
 * are the index's own.
 */
function stretchOf(column: string, words: readonly string[]): number {
  const lower = column.toLowerCase();
  let everywhere = 0;
  const places: { at: number; term: number }[] = [];
  for (const [term, word] of [...new Set(words)].entries()) {
    const found: { at: number; term: number }[] = [];
    for (let at = lower.indexOf(word); at >= 0; at = lower.indexOf(word, at + word.length)) {
      if (at > 0 && WORD_CHAR.test(lower[at - 1] ?? "")) {
        continue;
      }
      found.push({ at, term });
      if (found.length > PLACES_PER_WORD) {
        break;
      }
    }
    if (found.length > PLACES_PER_WORD) {
      everywhere += 1;
    } else {
      places.push(...found);
    }
  }
  places.sort((a, b) => a.at - b.at);
  let best = { at: 0, places: 0, terms: 0 };
  /** How many places of each word lie in the window from the current place to `end`. */
  const held = new Map<number, number>();
  let end = 0;
  for (const [start, place] of places.entries()) {
    for (; end < places.length && (places[end]?.at ?? 0) - place.at <= CONTEXT_CHARS; end++) {
      const term = places[end]?.term ?? 0;
      held.set(term, (held.get(term) ?? 0) + 1);
    }
    const terms = held.size + everywhere;
    if (terms > best.terms || (terms === best.terms && end - start > best.places)) {
      best = { at: place.at, places: end - start, terms };
    }
    const left = (held.get(place.term) ?? 1) - 1;
    if (left === 0) {
      held.delete(place.term);
    } else {
      held.set(place.term, left);
    }
  }
  return Math.max(0, best.at - CONTEXT_CHARS);
}

/** How far a stretch's edge moves to the nearest whitespace, at most. */
const EDGE_CHARS = 64;

/**
 * `column` cut to its marked stretch ({@link stretchOf}), each edge moved to
 * whitespace so no word is cut in two, and an ellipsis where words were cut
 * away (punctuation to the tokenizer: no token, no mark).
 */
function stretch(column: string | null, words: readonly string[]): string | null {
  if (column === null || column.length <= MARKED_CHARS) {
    return column;
  }
  const from = stretchOf(column, words);
  const after = from === 0 ? -1 : column.slice(from, from + EDGE_CHARS).search(/\s/);
  const start = after < 0 ? from : from + after + 1;
  const to = Math.min(column.length, from + MARKED_CHARS);
  const before = to === column.length ? -1 : column.slice(to - EDGE_CHARS, to).search(/\s\S*$/);
  const end = before < 0 ? to : to - EDGE_CHARS + before;
  return `${start > 0 ? "… " : ""}${column.slice(start, end)}${end < column.length ? " …" : ""}`;
}

/** A document a pass ranked: its id, its conversation by string ids, its score. */
interface Ranked {
  harness: number;
  id: number;
  pass: Pass;
  score: number;
  session: number;
}

/** A ranked document as an answer names it, with the start of its words. */
interface Described {
  author: DocAuthor;
  cwd: string | null;
  doc_id: string;
  gist: string;
  harness: string;
  id: number;
  model: string | null;
  role: string;
  session_id: string;
  sidechain: number;
  ts: string | null;
}

/** A moment's document as a search marked it ({@link TranscriptIndex.#marked}): its excerpt, and its columns' stretches with every token marked. */
interface Marked {
  output: string | null;
  snippet: string;
  text: string;
  thinking: string | null;
}

/** How much of a document's words tell two moments of a conversation apart. */
const GIST_CHARS = 160;
const SPACES = /\s+/g;

export interface SyncOptions {
  workers?: number;
  extract?: ExtractOptions;
  /** Documents from another source (opencode), indexed in the sync's last transaction. */
  docs?: TranscriptDoc[];
  /** `meta` values to keep, written in the same transaction, each only when it changed. */
  meta?: Record<string, string>;
  /**
   * `meta` values written with the sync's last commit, and only when that
   * commit writes something else: what says the sync ended, which a sync
   * that found nothing new does not write for.
   */
  ended?: Record<string, string>;
  /**
   * How far a catch-up has come, told after each of its commits but the
   * last: every transcript last written before this (ms epoch) is in the
   * index. The sync's own end says the rest.
   */
  progress?: (through: number) => void;
}

/**
 * How many documents one turn of the event loop inserts, at most: a catch-up
 * of one long transcript is tens of thousands of documents, and inserted in
 * one go it held the agent's only thread for seconds, its hub's search
 * unanswered meanwhile ("it didn't answer within 2 s"). Our own call: a few
 * tens of ms of FTS5 tokenising each.
 */
const INSERT_CHUNK = 500;

/**
 * How long one write transaction inserts, measured as it runs, before it
 * commits and the next begins. FTS5 holds a transaction's new terms until
 * its COMMIT, which writes them and their segment out in one call that never
 * yields: a 90 MB transcript's documents in one transaction held an agent's
 * loop over a second at its COMMIT (agent-loop probe's profile, 2026-10-24).
 * A transaction this long commits in a fraction of it. Our own call.
 */
const TRANSACTION_MS = 150;

/**
 * How long one step of the prefix build ({@link TranscriptIndex.rebuildFts})
 * aims to take, ms: its next step takes as many records as this one took
 * this long for. As long as a sync's transaction ({@link TRANSACTION_MS}),
 * so a sync waits on a step no longer than on its own commits.
 */
const FTS_BUILD_MS = TRANSACTION_MS;

/**
 * The bytes the first step of the prefix build takes, of records' words or
 * of the old table's pages. Each next step's are what this one took at its
 * pace for {@link FTS_BUILD_MS}, at most twice this one's and at least
 * {@link FTS_BUILD_BYTES_MIN}. In bytes, not records, since a record's
 * words run from none to a tool's whole answer (obelisk's 2,041,537
 * records hold 1.39 GB, 48 to 146 MB a hundred thousand of them), and a
 * step's cost is its bytes'. Our own call.
 */
const FTS_BUILD_BYTES = 1024 * 1024;

/** The fewest bytes one step of the prefix build takes. Our own call. */
const FTS_BUILD_BYTES_MIN = 64 * 1024;

/**
 * The most rows one step of the prefix build looks at for its bytes, so
 * finding where a step ends never reads far ahead. Our own call.
 */
const FTS_BUILD_ROWS_MAX = 20_000;

/** A record's words, in bytes, read off their lengths without their content. */
const DOC_BYTES =
  "octet_length(text) + coalesce(octet_length(thinking), 0) + coalesce(octet_length(tools), 0) + coalesce(octet_length(output), 0)";

export interface SyncResult {
  filesScanned: number;
  filesFull: number;
  filesTailed: number;
  filesUnchanged: number;
  docsAdded: number;
  errors: { path: string; error: string }[];
}

/**
 * The words of free text a search requires, each to be quoted in its MATCH
 * expressions (porter stemming matches its other forms), and whether the
 * last may also match as the start of longer ones: the word a person is
 * still typing, once it has {@link PREFIX_MIN} letters. A shorter last word
 * after others, while the query is being typed, is left out until it has
 * them (and returned as `dropped`, for the answer to say): half a word that
 * short says nothing yet, and required whole it would empty the answer
 * between keystrokes. A query that is not being typed (`submitted`: an
 * agent's, or one the person sent) searches a short last word whole, as a
 * lone short word always is.
 *
 * Only the last word is a prefix: FTS5 reads every term a prefix expands to
 * whole before a rowid range or another word narrows it, so a prefix costs
 * what all its expansions' documents cost (a common word's, 51 ms on 400,000
 * documents, where the same word whole in the newest tier cost 0.4 ms).
 */
export function matchQueries(
  text: string,
  submitted = false,
): { dropped: string | null; prefix: boolean; words: string[] } {
  const typed = text
    .split(/\s+/)
    .map((t) => t.replaceAll('"', ""))
    .filter((t) => t.length > 0);
  const last = typed.at(-1) ?? "";
  const drops = !submitted && typed.length > 1 && last.length < PREFIX_MIN;
  const words = drops ? typed.slice(0, -1) : typed;
  return {
    words,
    dropped: drops ? last : null,
    prefix: !drops && last.length >= PREFIX_MIN,
  };
}

/** `words` quoted as FTS5 phrases, the last also as a prefix when `prefix`, joined by `join`. */
const phrases = (words: readonly string[], prefix: boolean, join: " " | " OR "): string =>
  words.map((word, i) => `"${word}"${prefix && i === words.length - 1 ? "*" : ""}`).join(join);

/**
 * How many transcript bytes a full parse takes on at once. A parse returns
 * every doc of every file it was given, and those are held until indexed: a
 * first sync handed the whole corpus to one parse took an agent to 4.8 GB RSS
 * on a 7 GB corpus. Batches of this size are parsed and indexed in turn.
 */
const FULL_PARSE_BATCH_BYTES = 128 * 1024 * 1024;

/**
 * How many transcript bytes one write ({@link TranscriptIndex.#commit})
 * gathers, at most. A sync gathers every file's new documents and checkpoint
 * and writes them together: each commit writes the pages it touched (FTS5
 * writes a new segment, its structure record and the B-tree pages above
 * them), so one commit per file per sync cost ten times what one per sync
 * does with ten live sessions. Only a catch-up reaches this bound; it keeps
 * the documents held for a write to one bounded slice at a time, and the
 * write commits each {@link TRANSACTION_MS} of inserting.
 */
const WRITE_BATCH_BYTES = 32 * 1024 * 1024;

/** One transcript's new documents and where it was read up to. */
interface FileWrite {
  path: string;
  docs: TranscriptDoc[];
  checkpoint: Checkpoint;
  /** Transcript bytes consumed: what {@link WRITE_BATCH_BYTES} bounds. */
  bytes: number;
}

/**
 * `files` in order, as consecutive batches of at most `limit` bytes each; a
 * file larger than `limit` is a batch of its own.
 */
function byteBatches<F extends { size: number }>(files: F[], limit: number): F[][] {
  const batches: F[][] = [];
  let batch: F[] = [];
  let bytes = 0;
  for (const file of files) {
    if (batch.length > 0 && bytes + file.size > limit) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(file);
    bytes += file.size;
  }
  if (batch.length > 0) {
    batches.push(batch);
  }
  return batches;
}

/**
 * How an index is opened: by its one writer (a sync, a forget), which
 * brings its layout up to date as it opens, or by a reader, which only
 * searches and opens the file read-only, beside the writer's connection.
 */
export interface IndexOpenOptions {
  /**
   * Opened read-only, for searching only: no layout is changed and nothing
   * is written, so a reader killed mid-query (agent search/process.ts) leaves
   * the index as it was. Its writer must have opened it first: that makes
   * the file and its WAL ("a read-only WAL-mode database file can be opened
   * if the -shm and -wal files already exist", https://www.sqlite.org/wal.html).
   */
  readonly?: boolean;
}

/**
 * How long a reader waits on a lock, ms: in WAL only the moment another
 * connection recovers the log after a crash, or resets it, holds a reader
 * ("Sometimes Queries Return SQLITE_BUSY In WAL Mode",
 * https://www.sqlite.org/wal.html). Our own call: well inside a search's
 * window.
 */
const READER_BUSY_MS = 1000;

export class TranscriptIndex {
  db: Database;
  /**
   * `strings`, each value's id: held whole by the writer; a reader holds
   * what it has looked up ({@link TranscriptIndex.#idOf}), since the writer
   * adds strings after the reader opened.
   */
  readonly #strings = new Map<string, number>();
  /** The places of the last few finds, by conversation and phrase ({@link TranscriptIndex.#placeList}). */
  readonly #placeLists = new Map<string, PlaceList>();
  /** {@link TranscriptIndex.close} was called: a build in the background stops. */
  #closed = false;

  constructor(path: string, options: IndexOpenOptions = {}) {
    if (options.readonly) {
      this.db = new Database(path, { readonly: true });
      this.db.exec(`PRAGMA busy_timeout = ${READER_BUSY_MS}; PRAGMA temp_store = MEMORY;`);
      this.db.exec(MARKING);
      return;
    }
    this.db = this.#open(path);
    if (this.#olderLayout()) {
      this.#rebuild(path);
    }
    const made =
      this.db.query("SELECT 1 FROM sqlite_master WHERE name = 'docs_fts'").get() === null;
    this.db.exec(SCHEMA);
    this.db.exec(MARKING);
    if (made) {
      this.#putMeta(FTS_LAYOUT, FTS_PREFIX);
    }
    this.#configure("docs_fts");
    if (this.meta(FTS_LAYOUT) !== FTS_PREFIX) {
      this.#beginNextFts();
    }
    this.#reloadStrings();
    this.#reattribute();
  }

  /** The FTS table `table` merged as the index merges ({@link FTS_AUTOMERGE}, {@link FTS_USERMERGE}, {@link FTS_CRISISMERGE}). */
  #configure(table: "docs_fts" | "docs_fts_next"): void {
    for (const [key, value] of [
      ["automerge", FTS_AUTOMERGE],
      ["usermerge", FTS_USERMERGE],
      ["crisismerge", FTS_CRISISMERGE],
    ] as const) {
      const held = this.db.query(`SELECT v FROM ${table}_config WHERE k = ?`).get(key) as {
        v: number;
      } | null;
      if (held?.v !== value) {
        this.db.query(`INSERT INTO ${table}(${table}, rank) VALUES (?, ?)`).run(key, value);
      }
    }
  }

  /** A `meta` value written in the caller's transaction, or its own. */
  #putMeta(key: string, value: string): void {
    this.db
      .query(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  /**
   * `docs_fts_next` made beside `docs_fts`, with {@link FTS_PREFIX}, empty
   * and its triggers in place, or kept as an earlier open left it, so
   * {@link TranscriptIndex.rebuildFts} goes on from where it stopped. FTS5
   * takes no new option on a table that exists, so an index made with
   * other prefix indexes builds a new table whole. One begun with another
   * {@link FTS_PREFIX} than this is dropped and begun again.
   */
  #beginNextFts(): void {
    const begin = this.db.transaction(() => {
      const building = this.meta(FTS_NEXT_LAYOUT);
      if (building !== null && building !== FTS_PREFIX) {
        this.db.exec(`
          DROP TRIGGER IF EXISTS docs_next_ai;
          DROP TRIGGER IF EXISTS docs_next_ad;
          DROP TABLE IF EXISTS docs_fts_next;
          DELETE FROM meta WHERE key IN ('${FTS_NEXT_LAYOUT}', '${FTS_NEXT_THROUGH}');
        `);
      }
      this.db.exec(ftsTable("docs_fts_next"));
      this.#putMeta(FTS_NEXT_LAYOUT, FTS_PREFIX);
      this.db
        .query("INSERT OR IGNORE INTO meta (key, value) VALUES (?, '0')")
        .run(FTS_NEXT_THROUGH);
      this.db.exec(FTS_NEXT_TRIGGERS);
    });
    begin();
    this.#configure("docs_fts_next");
  }

  /**
   * `docs_fts` built again with {@link FTS_PREFIX} when it was made without
   * it, in the background of the index's one writer, and swapped in: answers
   * whether it was. Searches read `docs_fts` throughout, so they answer from
   * the old table until the swap and from the new one after it.
   *
   * The new table is `docs_fts_next`, filled in rowid order, each step its
   * own transaction of as many bytes of records as take about
   * {@link FTS_BUILD_MS} ({@link FTS_BUILD_BYTES}),
   * its segments merged a step at a time between ({@link MERGE_PAGES}), with
   * a pause as long as the step after each, so a sync's inserts and commits
   * take their turns and the writer builds at most half its time. A step
   * never begins inside a sync's open transaction. Once it holds every
   * record, it is merged into one segment, a step at a time ("executing the
   * 'merge' command with a negative parameter until the before and after
   * difference in the return value of sqlite3_total_changes() is less than
   * two optimizes the FTS index in the same way as the FTS5 optimize
   * command … only the first call to 'merge' should specify a negative
   * parameter", https://www.sqlite.org/fts5.html#the_merge_command). Left as
   * the fill leaves it, every level held up to {@link FTS_USERMERGE} less one
   * segment, and the syncs after the swap merged the whole table again: on
   * obelisk's 2,041,537 records, 2.5 GB written by one sync, 2.9 GB over
   * 200, where the old table wrote 105 MB.
   *
   * Where it has come is `meta`'s {@link FTS_NEXT_THROUGH}, written with each
   * step, so a writer stopped mid-build goes on from its last step when it
   * opens again. The step that takes the newest records once the table is
   * merged swaps the tables in the same transaction: the old table and its
   * triggers dropped, the new one renamed `docs_fts` and given them, and
   * {@link FTS_LAYOUT} written, so it runs once per index. The drop is the
   * one statement no step can bound, so the old table is read through in
   * steps just before it ({@link TranscriptIndex.#readOldFts}).
   */
  async rebuildFts(): Promise<boolean> {
    if (this.meta(FTS_LAYOUT) === FTS_PREFIX) {
      return false;
    }
    const started = performance.now();
    const from = Number(this.meta(FTS_NEXT_THROUGH) ?? 0);
    console.info(
      `[search] transcript index: building its prefix index (prefix='${FTS_PREFIX}')${from > 0 ? `, going on from record ${from}` : ""}`,
    );
    /** The bytes the next step takes, of records' words and of the old table's pages. */
    const bytes = { fill: FTS_BUILD_BYTES, read: FTS_BUILD_BYTES };
    /** The next step's bytes, from how long this one took for `taken` of them. */
    const pace = (taken: number, at: number) =>
      Math.min(
        2 * taken,
        Math.max(
          FTS_BUILD_BYTES_MIN,
          Math.round((taken * FTS_BUILD_MS) / Math.max(1, performance.now() - at)),
        ),
      );
    let merging = false;
    let merged = false;
    /** The old table's pages read so far, by table, the last rowid read; null once all are. */
    let read: { at: number; table: number } | null = { at: Number.MIN_SAFE_INTEGER, table: 0 };
    let pause = 0;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, pause));
      if (this.#closed) {
        return false;
      }
      if (this.db.inTransaction) {
        // A sync's commit is between its inserts: the step waits for it.
        pause = TRANSACTION_MS;
        continue;
      }
      const at = performance.now();
      if (merging) {
        merging = section("search index: prefix build merge", () =>
          this.#mergeStep("docs_fts_next"),
        );
      } else if (merged && read !== null) {
        const from: { at: number; table: number } = read;
        read = section("search index: prefix build read", () => this.#readOldFts(from, bytes.read));
        bytes.read = pace(bytes.read, at);
      } else {
        const step = section("search index: prefix build step", () =>
          this.#buildStep(bytes.fill, merged),
        );
        if (step === "swapped") {
          console.info(
            `[search] transcript index: prefix index built and in use, ${Math.round((performance.now() - started) / 1000)} s`,
          );
          return true;
        }
        if (step === "whole" && !merged) {
          section("search index: prefix build merge", () =>
            this.#mergeStep("docs_fts_next", -MERGE_PAGES),
          );
          merged = true;
        }
        merging = true;
        bytes.fill = pace(bytes.fill, at);
      }
      pause = performance.now() - at;
    }
  }

  /**
   * The rows of `table` above `from` one step takes: from the first, each
   * whose bytes before it (`weight`, a row's size read off its length, never
   * its content) are under `bytes`, of the next {@link FTS_BUILD_ROWS_MAX};
   * the highest of their rowids, and whether rows are left above it. Null
   * when no row is above `from`.
   */
  #span(
    table: "docs" | "docs_fts_data" | "docs_fts_docsize",
    weight: string,
    from: number,
    bytes: number,
  ): { high: number; more: boolean } | null {
    const high =
      this.db
        .query<{ high: number | null }, [number, number, number]>(
          `SELECT max(id) AS high FROM (
             SELECT id, w, sum(w) OVER (ORDER BY id ROWS UNBOUNDED PRECEDING) AS run
             FROM (SELECT id, ${weight} AS w FROM ${table} WHERE id > ? ORDER BY id LIMIT ?)
           ) WHERE run - w < ?`,
        )
        .get(from, FTS_BUILD_ROWS_MAX, bytes)?.high ?? null;
    if (high === null) {
      return null;
    }
    const more = this.db.query(`SELECT 1 FROM ${table} WHERE id > ? LIMIT 1`).get(high) !== null;
    return { high, more };
  }

  /**
   * The old table's next `bytes` of rows read, from `from`, so the swap's
   * `DROP TABLE` finds its pages in the page cache: SQLite reads every page
   * it frees, overflow pages too, and a drop of obelisk's 643 MB held the
   * writer 6.4 s read from disk and 0.25 s read from memory (2026-11-19).
   * Only its pages of terms and of sizes are large; its own shadow tables
   * are read, as an FTS5 table's may be (only writing them is refused).
   * Answers where the next read starts, or null once every row is read.
   */
  #readOldFts(
    from: { at: number; table: number },
    bytes: number,
  ): { at: number; table: number } | null {
    const tables = [
      ["docs_fts_data", "block"],
      ["docs_fts_docsize", "sz"],
    ] as const;
    const read = tables[from.table];
    if (!read) {
      return null;
    }
    const [table, column] = read;
    const span = this.#span(table, `octet_length(${column})`, from.at, bytes);
    if (span) {
      // `count` of the column's end loads each row whole; its length alone would not.
      this.db
        .query(`SELECT count(substr(${column}, -1)) FROM ${table} WHERE id > ? AND id <= ?`)
        .get(from.at, span.high);
    }
    return span?.more
      ? { at: span.high, table: from.table }
      : { at: Number.MIN_SAFE_INTEGER, table: from.table + 1 };
  }

  /**
   * The next `bytes` of records above {@link FTS_NEXT_THROUGH} put in
   * `docs_fts_next`, in one transaction. Answers `more` while records are
   * left above them, else `whole`; or, when they were the last and `swap`
   * says the table is merged, `swapped`: the tables swapped in the same
   * transaction.
   */
  #buildStep(bytes: number, swap: boolean): "more" | "swapped" | "whole" {
    const step = this.db.transaction(() => {
      const through = Number(this.meta(FTS_NEXT_THROUGH) ?? 0);
      const span = this.#span("docs", DOC_BYTES, through, bytes);
      if (span) {
        this.db
          .query(
            `INSERT INTO docs_fts_next(rowid, text, thinking, tools, output)
             SELECT id, text, thinking, tools, output FROM docs WHERE id > ? AND id <= ?`,
          )
          .run(through, span.high);
        this.#putMeta(FTS_NEXT_THROUGH, String(span.high));
      }
      if (span?.more) {
        return "more";
      }
      if (!swap) {
        return "whole";
      }
      this.db.exec(`
        DROP TRIGGER docs_next_ai;
        DROP TRIGGER docs_next_ad;
        DROP TRIGGER docs_ai;
        DROP TRIGGER docs_ad;
        DROP TABLE docs_fts;
        ALTER TABLE docs_fts_next RENAME TO docs_fts;
        ${FTS_TRIGGERS}
        DELETE FROM meta WHERE key IN ('${FTS_NEXT_LAYOUT}', '${FTS_NEXT_THROUGH}');
      `);
      this.#putMeta(FTS_LAYOUT, FTS_PREFIX);
      return "swapped";
    });
    return step();
  }

  /**
   * Who said each of the person's and the injected documents, read again by
   * the rules of now (text.ts `userAuthor`, `AUTHOR_RULES`) once those rules
   * change: what they newly tell as a harness's or the hub's (a summariser's
   * prompt) stops being the person's, in place, and what they tell as a copy
   * of another session's words (text.ts `COPIED`) leaves the index. The
   * index is never rebuilt for it: a rebuild reads every transcript again,
   * hours on a large machine, while these documents are a small share of the
   * rows, read off `docs_author_ts`. Once per rules version.
   */
  #reattribute(): void {
    const done = this.db.query("SELECT value FROM meta WHERE key = 'author_rules'").get() as {
      value: string;
    } | null;
    if (done?.value === String(AUTHOR_RULES)) {
      return;
    }
    const authors = ["owner", "injected"].flatMap((name) => {
      const id = this.#strings.get(name);
      return id === undefined ? [] : [{ id, name }];
    });
    const reread = this.db.transaction(() => {
      let moved = 0;
      let copies = 0;
      const update = this.db.query("UPDATE docs SET author = ? WHERE id = ?");
      const drop = this.db.query("DELETE FROM docs WHERE id = ?");
      for (const { id, name } of authors) {
        const rows = this.db
          .query("SELECT id, text FROM docs INDEXED BY docs_author_ts WHERE author = ?")
          .all(id) as { id: number; text: string }[];
        for (const row of rows) {
          const said = userAuthor(row.text);
          if (said === null) {
            drop.run(row.id);
            copies += 1;
          } else if (said.author !== name) {
            update.run(this.#stringId(said.author), row.id);
            moved += 1;
          }
        }
      }
      this.#putMeta("author_rules", String(AUTHOR_RULES));
      return { copies, moved };
    });
    try {
      const { copies, moved } = reread();
      if (moved > 0) {
        console.info(`[search] ${moved} documents told again by who said them`);
      }
      if (copies > 0) {
        console.info(
          `[search] ${copies} documents that copied another session's words (the hub's summariser prompts) left the index`,
        );
      }
    } catch (error) {
      this.#reloadStrings();
      throw error;
    }
  }

  #open(path: string): Database {
    const db = new Database(path, { create: true });
    // journal_mode: WAL, since a reader (agent search/host.ts) searches
    // beside this writer: "readers do not block writers and a writer does
    // not block readers" (https://www.sqlite.org/wal.html). In the rollback
    // journal a commit shuts every reader out of the file: measured while a
    // 180 MB catch-up synced on a loaded 48-core machine, a commit held the
    // file 1,456 ms, searches waited up to 1,636 ms and 8 of 867 failed
    // "database is locked"; in WAL the same searches' slowest was 77 ms and
    // none failed, the sync as quick (18.2-18.6 s against 19.9-24.5 s). The
    // cost is disk writes: WAL writes every page twice (to the log, then back
    // at checkpoint), 9.5 KB/s against the rollback journal's 6.1 KB/s over
    // four simulated hours of ten sessions writing, synced every ten minutes.
    // synchronous: NORMAL, as "WAL mode is always consistent with
    // synchronous=NORMAL, but WAL mode does lose durability"
    // (https://www.sqlite.org/pragma.html#pragma_synchronous): a commit lost
    // to power loss takes its files' checkpoints with it, and the next sync
    // reads those transcripts again.
    // busy_timeout: another writer (the sqlite3 shell, a probe) holds the
    // write lock for its transaction's length; a commit waits that out, not
    // fails.
    // temp_store: FTS5 flushes its pending terms (and merges segments) in the
    // middle of an insert once they pass 1 MB, and SQLite journals every page
    // that statement touches, spilling past 64 KB to a temp file: measured, a
    // tenth of a sync's writes went to `etilqs_*` files. In memory, they cost
    // a few MB of RAM for the moment of the flush.
    db.exec(
      "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY;",
    );
    return db;
  }

  /**
   * Whether `docs` is an older index's: one without `author`, which cannot
   * tell the person's words from what was put under their role, nor a model's
   * thinking from what it said; or one without `output`, which never took in
   * what the tools answered.
   */
  #olderLayout(): boolean {
    const docs = this.db.query("SELECT 1 FROM sqlite_master WHERE name = 'docs'").get();
    const has = (column: string) =>
      this.db.query("SELECT 1 FROM pragma_table_info('docs') WHERE name = ?").get(column) !== null;
    return docs !== null && !(has("author") && has("output"));
  }

  /**
   * An older index, deleted and begun again empty: its rows hold neither who
   * said them, thinking apart nor what the tools answered, which only the
   * transcripts can tell, so
   * every transcript is read again by the next sync (a catch-up, which
   * {@link WRITE_BATCH_BYTES} and {@link FULL_PARSE_BATCH_BYTES} bound). The
   * index is a copy of the transcripts; nothing in it is lost. Once per index.
   */
  #rebuild(path: string): void {
    this.db.close();
    for (const file of [path, `${path}-journal`, `${path}-wal`, `${path}-shm`]) {
      rmSync(file, { force: true });
    }
    this.db = this.#open(path);
  }

  /** `value`'s id in `strings`, added in the caller's transaction when new. */
  #stringId(value: string): number {
    let id = this.#strings.get(value);
    if (id === undefined) {
      id = (
        this.db.query("INSERT INTO strings (value) VALUES (?) RETURNING id").get(value) as {
          id: number;
        }
      ).id;
      this.#strings.set(value, id);
    }
    return id;
  }

  /**
   * `value`'s id in `strings`, or undefined when no row names it: what a
   * search looks values up by. Held when found; a value not held is read
   * from the table, where the writer may have added it since this
   * connection opened. An id, once committed, never changes.
   */
  #idOf(value: string): number | undefined {
    const held = this.#strings.get(value);
    if (held !== undefined) {
      return held;
    }
    const row = this.db.query("SELECT id FROM strings WHERE value = ?").get(value) as {
      id: number;
    } | null;
    if (row) {
      this.#strings.set(value, row.id);
    }
    return row?.id;
  }

  /** `strings` read afresh: a transaction rolled back takes the ids it added with it. */
  #reloadStrings(): void {
    this.#strings.clear();
    for (const row of this.db.query("SELECT id, value FROM strings").all() as {
      id: number;
      value: string;
    }[]) {
      this.#strings.set(row.value, row.id);
    }
  }

  close(): void {
    this.#closed = true;
    this.db.close();
  }

  /**
   * Insert documents (deduplicated on `docs_key`) in one transaction,
   * returning how many were new.
   *
   * Counted off `RETURNING`, which yields a row only for an insert the
   * `OR IGNORE` let through, and never for the FTS trigger's writes. It used
   * to be the `count(*)` of `docs` before and after, and `count(*)` scans the
   * whole table: two scans per transcript on every sync, all on the daemon's
   * one thread. Measured on a 170 MB index: 11.6s of a 12.8s event-loop stall
   * were those scans, and a daemon that frozen hears its hub socket close only
   * when it thaws.
   */
  indexDocs(docs: TranscriptDoc[]): number {
    if (docs.length === 0) {
      return 0;
    }
    try {
      return this.db.transaction(() => this.#insertDocs(docs))();
    } catch (error) {
      this.#reloadStrings();
      throw error;
    }
  }

  /** Inserts `docs` in the caller's transaction; answers how many were new. */
  #insertDocs(docs: TranscriptDoc[]): number {
    const insert = this.db.query(
      `INSERT OR IGNORE INTO docs (harness, doc_id, session, role, author, ts, cwd, model, sidechain, tools, thinking, text, output)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    );
    let added = 0;
    for (const doc of docs) {
      const row = insert.get(
        this.#stringId(doc.harness),
        doc.id,
        this.#stringId(doc.sessionId),
        this.#stringId(doc.role),
        this.#stringId(doc.author),
        doc.timestamp ?? null,
        typeof doc.cwd === "string" ? this.#stringId(doc.cwd) : null,
        typeof doc.model === "string" ? this.#stringId(doc.model) : null,
        doc.sidechain ? 1 : 0,
        doc.tools ?? null,
        doc.thinking ?? null,
        doc.text,
        doc.output ?? null,
      );
      if (row) {
        added += 1;
      }
    }
    return added;
  }

  /**
   * Commits `writes`, then `docs` and the `meta` values that changed,
   * answering how many documents were new; `ended`'s values ride along with
   * the meta. Inserts take turns of the event loop, {@link INSERT_CHUNK}
   * documents each, and a transaction that has inserted for
   * {@link TRANSACTION_MS} commits, the loop takes a turn, and the next
   * begins: no one write holds the daemon's only thread, however large the
   * catch-up. A file's checkpoint is written after its last document, and
   * the meta after every document, so a commit cut short leaves documents
   * without their checkpoint, never a checkpoint without its documents: the
   * next sync reads the file again, and `INSERT OR IGNORE` keeps each
   * document once (`docs_key`). A transaction that would write nothing is
   * not begun.
   */
  async #commit(
    writes: FileWrite[],
    docs: TranscriptDoc[] = [],
    meta: Record<string, string> = {},
    ended: Record<string, string> = {},
  ): Promise<number> {
    const getMeta = this.db.query("SELECT value FROM meta WHERE key = ?");
    const changed = Object.entries(meta).filter(
      ([key, value]) => (getMeta.get(key) as { value: string } | null)?.value !== value,
    );
    if (writes.length === 0 && docs.length === 0 && changed.length === 0) {
      return 0;
    }
    changed.push(...Object.entries(ended));
    const putCheckpoint = this.db.query(
      `INSERT INTO files (path, size, offset, lines) VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET size = excluded.size, offset = excluded.offset, lines = excluded.lines`,
    );
    const putMeta = this.db.query(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    let added = 0;
    /** What the open transaction has spent inserting, ms. */
    let spent = 0;
    const turn = () => new Promise((resolve) => setImmediate(resolve));
    /** One chunk inserted, timed; past {@link TRANSACTION_MS}, its transaction commits and the next begins. */
    const insert = async (chunk: TranscriptDoc[]): Promise<void> => {
      await turn();
      const at = performance.now();
      added += section("search index: documents inserted", () => this.#insertDocs(chunk));
      spent += performance.now() - at;
      if (spent >= TRANSACTION_MS) {
        section("search index: commit", () => this.db.exec("COMMIT"));
        spent = 0;
        await this.#merge();
        this.db.exec("BEGIN");
      }
    };
    this.db.exec("BEGIN");
    try {
      for (const write of writes) {
        for (let at = 0; at < write.docs.length; at += INSERT_CHUNK) {
          await insert(write.docs.slice(at, at + INSERT_CHUNK));
        }
        putCheckpoint.run(
          write.path,
          write.checkpoint.size,
          write.checkpoint.offset,
          write.checkpoint.lines,
        );
      }
      for (let at = 0; at < docs.length; at += INSERT_CHUNK) {
        await insert(docs.slice(at, at + INSERT_CHUNK));
      }
      for (const [key, value] of changed) {
        putMeta.run(key, value);
      }
      section("search index: commit", () => this.db.exec("COMMIT"));
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.#reloadStrings();
      throw error;
    }
    await this.#merge();
    return added;
  }

  /**
   * The index's segments merged, {@link MERGE_PAGES} at a time, each step its
   * own transaction and a turn of the loop between, until a step finds
   * nothing to merge: "If the difference between the two values
   * [sqlite3_total_changes() before and after] is 2 or greater, then work was
   * performed … less than 2 … the 'merge' command was a no-op"
   * (https://www.sqlite.org/fts5.html#the_merge_command).
   */
  async #merge(): Promise<void> {
    for (;;) {
      await new Promise((resolve) => setImmediate(resolve));
      if (!section("search index: merge step", () => this.#mergeStep("docs_fts"))) {
        return;
      }
    }
  }

  /**
   * One merge step of `table`'s segments, `pages` of them ({@link MERGE_PAGES};
   * negative, every segment merged into one); answers whether it merged any.
   */
  #mergeStep(table: "docs_fts" | "docs_fts_next", pages = MERGE_PAGES): boolean {
    const changes = this.db.query<{ n: number }, []>("SELECT total_changes() AS n");
    const before = changes.get()?.n ?? 0;
    this.db.query(`INSERT INTO ${table}(${table}, rank) VALUES ('merge', ?)`).run(pages);
    return (changes.get()?.n ?? 0) - before >= 2;
  }

  /**
   * Index a set of transcript files incrementally. New files get a parallel
   * full parse; files with a valid checkpoint get an in-process tail read of
   * appended bytes only; unchanged files are skipped entirely. Everything a
   * sync found, `options.docs` and `options.meta` included, is committed
   * together ({@link WRITE_BATCH_BYTES}).
   */
  async sync(files: TranscriptFile[], options: SyncOptions = {}): Promise<SyncResult> {
    const getCheckpoint = this.db.query("SELECT size, offset, lines FROM files WHERE path = ?");
    const result: SyncResult = {
      filesScanned: files.length,
      filesFull: 0,
      filesTailed: 0,
      filesUnchanged: 0,
      docsAdded: 0,
      errors: [],
    };

    const fullFiles: (TranscriptFile & { mtime: number; size: number })[] = [];
    const tailFiles: { file: TranscriptFile; checkpoint: Checkpoint; mtime: number }[] = [];
    const { stat } = await import("node:fs/promises");
    await Promise.all(
      files.map(async (file) => {
        const { path } = file;
        const checkpoint = getCheckpoint.get(path) as Checkpoint | null;
        let size: number;
        let mtime: number;
        try {
          ({ size, mtimeMs: mtime } = await stat(path));
        } catch (error) {
          result.errors.push({
            path,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        if (!checkpoint || checkpoint.offset > size) {
          fullFiles.push({ ...file, mtime, size });
        } else if (checkpoint.offset < size) {
          tailFiles.push({ file, checkpoint, mtime });
        } else {
          result.filesUnchanged++;
        }
      }),
    );

    // New (or reset) files, the one written to longest ago first, so rowids
    // grow with when a document was written, as a search's recent tier reads
    // them ({@link RECENT_TIERS}); `fullRead` of them are gathered (or
    // failed), in that order.
    fullFiles.sort((a, b) => a.mtime - b.mtime);
    let fullRead = 0;
    const startedAt = Date.now();

    // The grown files, the one written to longest ago first, so the next
    // one to read is the oldest still out; `tailRead` of them are gathered
    // (or failed).
    tailFiles.sort((a, b) => a.mtime - b.mtime);
    let tailRead = 0;
    // Another source's documents in the order they were written, as a
    // catch-up's files are: the sync's last commit takes them all.
    const docs = options.docs?.toSorted((a, b) =>
      (a.timestamp ?? "").localeCompare(b.timestamp ?? ""),
    );
    // When the oldest of them was written: one with no time (sorted first)
    // could be of any time, so none is claimed before the last commit.
    const oldestDoc = docs?.[0];
    const docsFrom =
      oldestDoc === undefined ? startedAt : Date.parse(oldestDoc.timestamp ?? "") || 0;

    // What this sync will commit, flushed early only when a catch-up makes it
    // large (WRITE_BATCH_BYTES). After each early flush, every transcript
    // last written before the oldest of what is still out (a grown file or a
    // new one still to read, another source's documents, which only the last
    // commit takes) is in. It said the oldest new file alone, so a grown
    // file or an OpenCode session older than it was claimed before it was in.
    let pending: FileWrite[] = [];
    let pendingBytes = 0;
    const gather = async (write: FileWrite) => {
      pending.push(write);
      pendingBytes += write.bytes;
      if (pendingBytes >= WRITE_BATCH_BYTES) {
        result.docsAdded += await this.#commit(pending);
        pending = [];
        pendingBytes = 0;
        const out = Math.min(
          tailFiles[tailRead]?.mtime ?? startedAt,
          fullFiles[fullRead]?.mtime ?? startedAt,
          docsFrom,
        );
        options.progress?.(Math.min(startedAt, out - 1));
      }
    };

    // Grown files first: tail reads are small, run in-process, and they are
    // the live sessions, whose newest words a catch-up would otherwise keep
    // out of every search until it ends.
    for (const { file, checkpoint } of tailFiles) {
      tailRead++;
      let write: FileWrite;
      try {
        const tail = await scanDocs(file, { from: checkpoint, extract: options.extract });
        const docs = tail.items;
        result.filesTailed++;
        write = {
          path: file.path,
          docs,
          checkpoint: tail.checkpoint,
          bytes: tail.checkpoint.offset - checkpoint.offset,
        };
      } catch (error) {
        result.errors.push({
          path: file.path,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      await gather(write);
    }

    // The new files: parallel full parse in workers, a batch at a time, each
    // batch gathered before the next is parsed (FULL_PARSE_BATCH_BYTES).
    for (const batch of byteBatches(fullFiles, FULL_PARSE_BATCH_BYTES)) {
      const parses = await Promise.all(
        FILE_HARNESSES.map((harness) =>
          parseMany(
            batch.filter((file) => file.harness === harness).map((file) => file.path),
            { mode: "docs", harness, extract: options.extract, workers: options.workers },
          ),
        ),
      );
      const parsed = parses.flat();
      // Back in the batch's order: the workers answer shard by shard.
      const order = new Map(batch.map((file, i) => [file.path, i]));
      const inOrder = parsed.toSorted(
        (a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0),
      );
      for (const file of inOrder) {
        fullRead++;
        if (file.error !== undefined) {
          result.errors.push({ path: file.path, error: file.error });
          continue;
        }
        result.filesFull++;
        await gather({
          path: file.path,
          docs: file.docs ?? [],
          checkpoint: { size: file.stats.bytes, offset: file.stats.bytes, lines: file.stats.lines },
          bytes: file.stats.bytes,
        });
      }
    }

    result.docsAdded += await this.#commit(pending, docs, options.meta, options.ended);
    return result;
  }

  /** A `meta` value, or null when the index holds none. */
  meta(key: string): string | null {
    return (
      (this.db.query("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | null)
        ?.value ?? null
    );
  }

  /**
   * The best `scan` documents `match` finds among the rowids `within` says
   * (by author and conversation when `filters` say), as ids and scores only: BM25 weighed
   * by whose words they are, read off ids, never the strings table.
   */
  #ranked(pass: Pass, filters: string, params: (string | number)[], scan: number): Ranked[] {
    const weight = Object.entries(AUTHOR_WEIGHT)
      .flatMap(([author, w]) => {
        const id = this.#idOf(author);
        return id === undefined ? [] : [`WHEN ${id} THEN ${w}`];
      })
      .join(" ");
    const rows = this.db
      .prepare(
        `SELECT docs_fts.rowid AS id, d.harness AS harness, d.session AS session,
                -bm25(docs_fts, ${COLUMN_WEIGHTS}) * (CASE d.author ${weight} ELSE 1 END) AS score
         FROM docs_fts
         JOIN docs d ON d.id = docs_fts.rowid
         WHERE docs_fts MATCH ? ${filters} AND ${pass.within}
         ORDER BY score DESC
         LIMIT ?`,
      )
      .all(pass.match, ...params, scan) as Omit<Ranked, "pass">[];
    return rows.map((row) => ({ ...row, pass }));
  }

  /** What a search answers of each of `ids`: its record, its names, the start of its words. */
  #described(ids: number[]): Map<number, Described> {
    const rows = this.db
      .prepare(
        `SELECT d.id, h.value AS harness, d.doc_id, s.value AS session_id, r.value AS role,
                a.value AS author, d.ts, c.value AS cwd, m.value AS model, d.sidechain,
                substr(coalesce(nullif(d.text, ''), d.output, ''), 1, ${GIST_CHARS}) AS gist
         FROM json_each(?) AS k
         JOIN docs d ON d.id = k.value
         JOIN strings h ON h.id = d.harness
         JOIN strings s ON s.id = d.session
         JOIN strings r ON r.id = d.role
         JOIN strings a ON a.id = d.author
         LEFT JOIN strings c ON c.id = d.cwd
         LEFT JOIN strings m ON m.id = d.model`,
      )
      .all(JSON.stringify(ids)) as Described[];
    return new Map(rows.map((row) => [row.id, row]));
  }

  /**
   * Each of `ids`'s excerpt as `pass` marks it, its words between 「 and 」
   * (FTS5 `snippet`), and its columns of words with every token marked
   * (FTS5 `highlight`), what a moment's context is cut from: by the index's
   * own tokenizer and stemmer, whole tokens only, every word of the pass
   * wherever it stands. Marked in {@link MARKING}, each column cut to its
   * marked stretch ({@link MARKED_CHARS}), never in the index itself, whose
   * whole documents made `snippet` cost the square of their matches; what
   * tools answered only when the search matched it (`toolOutput`). A
   * document none of whose stretches holds a word of the pass (a match in
   * its tools' names alone) is not answered.
   */
  #marked(pass: Pass, ids: number[], toolOutput: boolean): Map<number, Marked> {
    const docs = this.db
      .prepare(
        `SELECT d.id, d.text, d.thinking, d.tools, d.output
         FROM json_each(?) AS k JOIN docs d ON d.id = k.value`,
      )
      .all(JSON.stringify(ids)) as {
      id: number;
      output: string | null;
      text: string;
      thinking: string | null;
      tools: string | null;
    }[];
    this.db.exec("DELETE FROM temp.marking");
    const put = this.db.query(
      "INSERT INTO temp.marking (rowid, text, thinking, tools, output) VALUES (?, ?, ?, ?, ?)",
    );
    for (const doc of docs) {
      put.run(
        doc.id,
        stretch(doc.text, pass.words) ?? "",
        stretch(doc.thinking, pass.words),
        doc.tools,
        toolOutput ? stretch(doc.output, pass.words) : null,
      );
    }
    const rows = this.db
      .prepare(
        `SELECT rowid AS id,
                snippet(marking, -1, '「', '」', '…', 16) AS snippet,
                highlight(marking, 0, '「', '」') AS text,
                highlight(marking, 1, '「', '」') AS thinking,
                highlight(marking, 3, '「', '」') AS output
         FROM temp.marking
         WHERE marking MATCH ?`,
      )
      .all(pass.mark) as (Marked & { id: number; text: string | null })[];
    this.db.exec("DELETE FROM temp.marking");
    return new Map(rows.map(({ id, text, ...rest }) => [id, { ...rest, text: text ?? "" }]));
  }

  /**
   * The conversations whose words match `query` (every word, in any order;
   * the last also as the start of longer ones), best first, each with its
   * best {@link MOMENTS_PER_CONVERSATION} moments: BM25 over what was said,
   * thought and called, and what tools answered when `toolOutput` asks
   * ({@link COLUMN_WEIGHTS}), weighed by whose words they
   * are ({@link AUTHOR_WEIGHT}), the newest documents ranked first
   * ({@link RECENT_TIERS}). Moments of a conversation that open with the same
   * words are one moment (a line said again and again). Ranked on ids and
   * scores, then named for those ranked, then excerpted for the moments kept:
   * an excerpt or a name read for every match would cost what the matches
   * cost, and the answer keeps a few.
   */
  search(query: string, options: SearchOptions = {}): ConversationHit[] {
    return section("search index: query", () => this.#searchNow(query, options));
  }

  #searchNow(query: string, options: SearchOptions): ConversationHit[] {
    const { words, prefix } = matchQueries(query, options.submitted);
    if (words.length === 0) {
      return [];
    }
    // What tools answered is matched only when asked for: else every phrase
    // reads what was said, thought and called alone.
    const scoped = (match: string) => (options.toolOutput ? match : `${SAID_COLUMNS} : (${match})`);
    const lower = words.map((word) => word.toLowerCase());
    const pass = (asPrefix: boolean) => ({
      match: scoped(phrases(words, asPrefix, " ")),
      mark: scoped(phrases(words, asPrefix, " OR ")),
      words: lower,
    });
    const limit = options.limit ?? 20;
    const params: (string | number)[] = [];
    let filters = "";
    if (options.author !== undefined) {
      // An author no row names has no id, and no hits.
      const id = this.#idOf(options.author);
      if (id === undefined) {
        return [];
      }
      filters = "AND d.author = ?";
      params.push(id);
    }
    if (options.sessions !== undefined) {
      // Filtered after the FTS match, as the author is.
      const ids = this.#sessionIds(options.sessions);
      if (ids === null) {
        return [];
      }
      filters += " AND d.session IN (SELECT value FROM json_each(?))";
      params.push(ids);
    }
    if (options.before !== undefined) {
      // Filtered after the FTS match, as the author is; ISO times compare
      // as text.
      filters += " AND d.ts <= ?";
      params.push(options.before);
    }
    const ranked = this.#rankedPasses(
      pass(false),
      prefix ? pass(true) : null,
      filters,
      params,
      limit,
    );
    const described = this.#described(ranked.map((row) => row.id));
    const kept = this.#moments(ranked, described);
    const marked = new Map<number, Marked>();
    for (const each of new Set(kept.flatMap((hit) => hit.moments.map((moment) => moment.pass)))) {
      const ids = kept.flatMap((hit) =>
        hit.moments.filter((moment) => moment.pass === each).map((moment) => moment.id),
      );
      const read = section("search index: moments marked", () =>
        this.#marked(each, ids, options.toolOutput === true),
      );
      for (const [id, one] of read) {
        marked.set(id, one);
      }
    }
    return kept
      .map((each) => ({
        ...each.hit,
        moments: each.moments.flatMap((moment): Moment[] => {
          const row = described.get(moment.id);
          if (!row) {
            return [];
          }
          const one = marked.get(moment.id);
          const snippet = one?.snippet ?? row.gist;
          const context = one && options.context ? contextOf(one) : undefined;
          return [
            {
              docId: row.doc_id,
              role: row.role,
              author: row.author,
              timestamp: row.ts,
              score: moment.score,
              snippet,
              ...(context === undefined ? {} : { context }),
            },
          ];
        }),
      }))
      .slice(0, limit);
  }

  /**
   * The ids of `sessions` as a JSON list for `json_each`: null when no row
   * names any of them (a session no row names has no id), which leaves no
   * hits.
   */
  #sessionIds(sessions: readonly string[]): string | null {
    const ids = sessions.flatMap((session) => {
      const id = this.#idOf(session);
      return id === undefined ? [] : [id];
    });
    return ids.length === 0 ? null : JSON.stringify(ids);
  }

  /** Every column of words of each of `ids`: a listing's context is the start of them. */
  #words(
    ids: number[],
  ): Map<number, { output: string | null; text: string; thinking: string | null }> {
    const rows = this.db
      .prepare(
        `SELECT d.id, d.text, d.thinking, d.output FROM json_each(?) AS k JOIN docs d ON d.id = k.value`,
      )
      .all(JSON.stringify(ids)) as {
      id: number;
      output: string | null;
      text: string;
      thinking: string | null;
    }[];
    return new Map(rows.map(({ id, ...doc }) => [id, doc]));
  }

  /**
   * One author's documents with no words to match, newest first: the newest
   * `limit` of them in the window (and conversations) asked, read backwards
   * off `docs_author_ts` and stopped at the limit. A document with no time is
   * in no window and is left out. Answered as conversations, newest first,
   * each with every listed moment of it, newest first; a moment's snippet is
   * the start of its words.
   */
  listed(options: ListOptions): ConversationHit[] {
    return section("search index: listed", () => this.#listedNow(options));
  }

  #listedNow(options: ListOptions): ConversationHit[] {
    const author = this.#idOf(options.author);
    if (author === undefined || options.limit < 1) {
      return [];
    }
    const params: (string | number)[] = [author];
    let filters = options.toolOutput
      ? ""
      : " AND NOT (d.output IS NOT NULL AND d.text = '' AND d.thinking IS NULL AND d.tools IS NULL)";
    if (options.since !== undefined) {
      filters += " AND d.ts >= ?";
      params.push(options.since);
    }
    if (options.before !== undefined) {
      filters += " AND d.ts <= ?";
      params.push(options.before);
    }
    if (options.sessions !== undefined) {
      const ids = this.#sessionIds(options.sessions);
      if (ids === null) {
        return [];
      }
      filters += " AND d.session IN (SELECT value FROM json_each(?))";
      params.push(ids);
    }
    const ids = (
      this.db
        .prepare(
          `SELECT d.id FROM docs d INDEXED BY docs_author_ts
           WHERE d.author = ? AND d.ts IS NOT NULL${filters}
           ORDER BY d.ts DESC, d.id DESC
           LIMIT ?`,
        )
        .all(...params, options.limit) as { id: number }[]
    ).map((row) => row.id);
    const described = this.#described(ids);
    const words = options.context
      ? this.#words(ids)
      : new Map<number, { output: string | null; text: string; thinking: string | null }>();
    const conversations = new Map<string, ConversationHit>();
    for (const id of ids) {
      const doc = described.get(id);
      if (!doc) {
        continue;
      }
      const said = words.get(id);
      // The column the gist was cut from, its start.
      const context = said
        ? (said.text || said.output || "").slice(0, 2 * CONTEXT_CHARS)
        : undefined;
      const key = `${doc.harness}\u0000${doc.session_id}`;
      const hit = conversations.get(key) ?? {
        harness: doc.harness,
        sessionId: doc.session_id,
        cwd: doc.cwd,
        model: doc.model,
        sidechain: doc.sidechain === 1,
        score: 0,
        moments: [],
      };
      conversations.set(key, hit);
      hit.moments.push({
        docId: doc.doc_id,
        role: doc.role,
        author: doc.author,
        timestamp: doc.ts,
        score: 0,
        snippet: doc.gist,
        ...(context === undefined ? {} : { context }),
      });
    }
    return [...conversations.values()];
  }

  /**
   * One window of the places in one conversation whose words hold `words`
   * together (an FTS5 phrase over what was said, thought and what tools
   * answered; the last word also as the start of a longer one), oldest
   * first, its own words and never a subagent's (a sidechain), with how
   * many there are of each kind. A place's kind is whose words hold the
   * phrase: what was said or thought first, a tool's answer only where
   * nothing said holds it. Each is cut round where the words stand in it,
   * as they were typed, else their first word. A tool's answer is named by
   * its own record (a Claude Code `tool_result` entry, a pi result entry,
   * the OpenCode message holding the call): the transcript a dashboard
   * reads keeps which call each result answered, by the call's own id, so
   * it opens the place at that very call (core transcript-rules
   * `applyToolResult`, `resultRecord`), however many calls ran beside it
   * and however long it took to answer.
   *
   * Every place is found from the index alone ({@link TranscriptIndex.#placeList}),
   * and only the window's records are read: their words are what an
   * excerpt is cut from.
   */
  places(options: PlacesOptions): PlacesAnswer {
    return section("search index: places", () => this.#placesNow(options));
  }

  #placesNow(options: PlacesOptions): PlacesAnswer {
    const counts: Record<PlaceKind, number> = { owner: 0, agent: 0, report: 0, output: 0 };
    const list = this.#placeList(options.sessions, options.words);
    if (list === null) {
      return { counts, offset: 0, places: [], through: null };
    }
    for (const kind of list.kinds) {
      counts[kind] += 1;
    }
    const { kind } = options;
    const kept =
      kind === undefined
        ? list.ids.map((_, i) => i)
        : list.kinds.flatMap((each, i) => (each === kind ? [i] : []));
    const limit = Math.max(0, Math.trunc(options.limit));
    const { near } = options;
    let from = options.offset === undefined ? kept.length - limit : Math.trunc(options.offset);
    if (near !== undefined) {
      const at = kept.findIndex((i) => i >= near);
      from = (at < 0 ? kept.length - 1 : at) - Math.floor(limit / 2);
    }
    const offset = Math.min(Math.max(0, from), Math.max(0, kept.length - 1));
    const window = kept.slice(offset, offset + limit);
    const rows = this.db
      .query<
        {
          doc_id: string;
          id: number;
          output: string | null;
          text: string;
          thinking: string | null;
          ts: string | null;
        },
        [string]
      >(
        `SELECT id, doc_id, ts, text, thinking, output FROM docs
         WHERE id IN (SELECT value FROM json_each(?))`,
      )
      .all(JSON.stringify(window.map((i) => list.ids[i])));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const needle = list.typed.replace(SPACES, " ").toLowerCase();
    const first = list.first.toLowerCase();
    const places = window.flatMap((i): IndexedPlace[] => {
      const row = byId.get(list.ids[i] ?? -1);
      const kind = list.kinds[i];
      if (!(row && kind)) {
        return [];
      }
      const columns =
        kind === "output"
          ? ([["output", row.output]] as const)
          : ([
              ["text", row.text],
              ["thinking", row.thinking],
            ] as const);
      const at = (word: string) =>
        word === ""
          ? undefined
          : columns
              .map(([name, column]) => ({
                name,
                column: column ?? "",
                at: column?.toLowerCase().indexOf(word) ?? -1,
                length: word.length,
              }))
              .find((each) => each.at >= 0);
      // Where the words stand as typed; else (a stemmed match) where their
      // first word does; else (a stem of the first alone) the start of the
      // column that holds them.
      const found = at(needle) ?? at(first);
      const [name, column] = columns.find(([, each]) => each) ?? columns[0];
      return [
        {
          kind,
          n: i,
          column: found?.name ?? name,
          docId: row.doc_id,
          excerpt: found
            ? placeExcerpt(found.column, found.at, found.length)
            : placeExcerpt(column ?? "", 0, 0).replace("「」", ""),
          timestamp: row.ts,
        },
      ];
    });
    return { counts, offset, places, through: list.through };
  }

  /**
   * Every place of `words` in the conversation `sessions` names, oldest
   * first, and the kind of each: found off the index, the conversation's
   * records' own rows read only where the phrase matched them. Its span of
   * rowids and its newest time are `docs_conversation`'s; the phrase is
   * matched twice, in what was said or thought and in what tools answered,
   * each sought within that span (FTS5 seeks every doclist to it) and kept
   * to the conversation's records; its records in time order, with who said
   * each, are `docs_conversation`'s again. Held for the next window of the
   * same find ({@link PLACE_LISTS}) until the index changes (`PRAGMA
   * data_version`: "the integer values returned by two invocations of
   * "PRAGMA data_version" from the same connection will be different if
   * changes were committed to the database by any other connection in the
   * interim", https://www.sqlite.org/pragma.html#pragma_data_version). Null
   * when there is nothing to match or no record of the conversation.
   */
  #placeList(sessions: readonly string[], typed: string): PlaceList | null {
    const { words, prefix } = matchQueries(typed);
    const ids = this.#sessionIds(sessions);
    if (words.length === 0 || ids === null) {
      return null;
    }
    const phrase = `"${words.join(" ")}"${prefix ? "*" : ""}`;
    const key = `${ids}\u0000${phrase}`;
    const version =
      this.db.query<{ data_version: number }, []>("PRAGMA data_version").get()?.data_version ?? 0;
    const held = this.#placeLists.get(key);
    this.#placeLists.delete(key);
    if (held && held.version === version) {
      this.#placeLists.set(key, held);
      return held;
    }
    // The conversation's span of rowids, and its newest time, off the index.
    const span = this.db
      .query<{ high: number | null; low: number | null; through: string | null }, [string]>(
        `SELECT min(id) AS low, max(id) AS high, max(ts) AS through
         FROM docs INDEXED BY docs_conversation
         WHERE session IN (SELECT value FROM json_each(?)) AND sidechain = 0`,
      )
      .get(ids);
    const list: PlaceList = {
      first: words[0] ?? "",
      ids: [],
      kinds: [],
      through: span?.through ?? null,
      typed: typed.trim(),
      version,
    };
    const { low, high } = span ?? {};
    // The phrase in `columns` (FTS5, stems and every word its last one
    // starts), kept to the records whose `held` hold its first word as
    // typed: a place is one whose words the transcript marks (find-marks.ts
    // marks the words as typed), so a match on a stem alone ("run" for
    // "running") is none. `lower` folds ASCII's case alone, on both sides
    // (LIKE folds the same, and was 7 ms quicker for "the" in the
    // conversation above, but ends a column at its first NUL, which tool
    // output holds).
    const typedFirst = words[0] ?? "";
    const matched = (columns: string, held: string) =>
      low === null || low === undefined || high === null || high === undefined
        ? new Set<number>()
        : new Set(
            this.db
              .query<{ id: number }, [string, number, number, string, string]>(
                `SELECT f.rowid AS id FROM docs_fts f JOIN docs d ON d.id = f.rowid
                 WHERE docs_fts MATCH ?1 AND f.rowid BETWEEN ?2 AND ?3
                   AND +f.rowid IN (
                     SELECT id FROM docs INDEXED BY docs_conversation
                     WHERE session IN (SELECT value FROM json_each(?4)) AND sidechain = 0
                   )
                   AND (${held})`,
              )
              .all(`{${columns}}: ${phrase}`, low, high, ids, typedFirst)
              .map(({ id }) => id),
          );
    const said = matched(
      SAID_PLACE_COLUMNS,
      "instr(lower(d.text), lower(?5)) > 0 OR instr(lower(d.thinking), lower(?5)) > 0",
    );
    const answered = matched("output", "instr(lower(d.output), lower(?5)) > 0");
    if (said.size + answered.size > 0) {
      // Whose words hold a place, by the author's id; `injected` holds none.
      const author = new Map<number, PlaceKind>(
        (["owner", "agent", "report"] as const satisfies readonly DocAuthor[]).flatMap((name) => {
          const id = this.#idOf(name);
          return id === undefined ? [] : [[id, name]];
        }),
      );
      // In time order, as the conversation was said.
      const records = this.db
        .query<{ author: number; id: number }, [string]>(
          `SELECT id, author FROM docs INDEXED BY docs_conversation
           WHERE session IN (SELECT value FROM json_each(?)) AND sidechain = 0
           ORDER BY ts, id`,
        )
        .all(ids);
      for (const { id, author: by } of records) {
        const kind = said.has(id) ? author.get(by) : answered.has(id) ? "output" : undefined;
        if (kind) {
          list.ids.push(id);
          list.kinds.push(kind);
        }
      }
    }
    this.#placeLists.set(key, list);
    for (const old of this.#placeLists.keys()) {
      if (this.#placeLists.size <= PLACE_LISTS) {
        break;
      }
      this.#placeLists.delete(old);
    }
    return list;
  }

  /**
   * A conversation's turns around one of its records, as the index holds
   * them ({@link TurnsOptions}): the centre sought at its time (or walked to
   * from the newest when no time is given), then up to `side` turns either
   * side of it, walked to along the index's time order ({@link WALK_MAX}).
   * A neighbour is a record with words or calls outside a subagent; a tool's
   * answer or a thought alone is a turn only at the centre.
   */
  turns(options: TurnsOptions): TurnsAnswer {
    return section("search index: turns", () => this.#turnsNow(options));
  }

  #turnsNow(options: TurnsOptions): TurnsAnswer {
    const sessions = new Set(
      options.sessions.flatMap((session) => {
        const id = this.#idOf(session);
        return id === undefined ? [] : [id];
      }),
    );
    if (sessions.size === 0) {
      return { missing: "its machine's index holds none of its words" };
    }
    const { docId } = options;
    const mine = (step: Step) => sessions.has(step.session);
    const turn = (step: Step) => mine(step) && step.sidechain === 0 && step.said === 1;
    const named = (step: Step) =>
      mine(step) &&
      docId !== undefined &&
      (step.docId === docId || (docId.length >= DOC_ID_PREFIX_MIN && step.docId.startsWith(docId)));
    const from =
      docId !== undefined && options.at !== undefined
        ? { key: new Date(options.at + AT_MARGIN_MS + 1000).toISOString(), docId: "" }
        : { key: END_KEY, docId: "" };
    const floor =
      docId !== undefined && options.at !== undefined
        ? new Date(options.at - AT_MARGIN_MS).toISOString()
        : "";
    const sought = this.#walk(from, "before", 1, docId === undefined ? turn : named, floor);
    const centre = sought.found[0];
    if (!centre) {
      return {
        missing:
          docId === undefined
            ? "its machine's index holds no turn of it"
            : `${docId} is not in its machine's index`,
      };
    }
    const side = Math.max(0, Math.trunc(options.side));
    const before = this.#walk(centre, "before", side, turn, "");
    const after = this.#walk(centre, "after", side, turn, "");
    const steps = [...before.found.toReversed(), centre, ...after.found];
    const read = this.#turnWords(steps.map((step) => step.id));
    const turns = steps.flatMap((step) => {
      const words = read.get(step.id);
      return words ? [words] : [];
    });
    return {
      turns,
      centre: turns.findIndex((each) => each.docId === centre.docId),
      earlier: before.more,
      later: after.more,
    };
  }

  /**
   * Up to `take` records `wanted` keeps, walked from `from` (not included)
   * one way along `docs_key`, the index's time order, never below `floor`;
   * and whether the walk left any behind: more of them, or records it did
   * not read ({@link WALK_MAX}).
   */
  #walk(
    from: { docId: string; key: string },
    way: "before" | "after",
    take: number,
    wanted: (step: Step) => boolean,
    floor: string,
  ): { found: Step[]; more: boolean } {
    const found: Step[] = [];
    if (take < 1) {
      return { found, more: false };
    }
    // The bound by time alone is what lets SQLite seek `docs_key` to it; the
    // row value then steps past the records of that same instant read before.
    const bounds =
      way === "before"
        ? "coalesce(d.ts, '') > ?1 AND coalesce(d.ts, '') <= ?2 AND (coalesce(d.ts, ''), d.doc_id) < (?2, ?3)"
        : "?1 IS NOT NULL AND coalesce(d.ts, '') >= ?2 AND (coalesce(d.ts, ''), d.doc_id) > (?2, ?3)";
    const order = way === "before" ? "DESC" : "ASC";
    const query = this.db.query(
      `SELECT d.id, coalesce(d.ts, '') AS key, d.doc_id AS docId, d.session, d.sidechain,
              (length(d.text) > 0 OR d.tools IS NOT NULL) AS said
       FROM docs d INDEXED BY docs_key
       WHERE ${bounds}
       ORDER BY coalesce(d.ts, '') ${order}, d.doc_id ${order}
       LIMIT ?4`,
    );
    let at = from;
    for (let read = 0; read < WALK_MAX; read += WALK_CHUNK) {
      const steps = query.all(floor, at.key, at.docId, WALK_CHUNK) as Step[];
      for (const step of steps) {
        if (wanted(step)) {
          if (found.length === take) {
            return { found, more: true };
          }
          found.push(step);
        }
      }
      const last = steps.at(-1);
      if (!last || steps.length < WALK_CHUNK) {
        return { found, more: false };
      }
      at = last;
    }
    return { found, more: true };
  }

  /** Each of `ids` as `turns` answers it, its columns cut to {@link TURN_CHARS}. */
  #turnWords(ids: number[]): Map<number, IndexedTurn> {
    const rows = this.db
      .prepare(
        `SELECT d.id, d.doc_id, r.value AS role, a.value AS author, d.ts, d.sidechain, d.tools,
                substr(d.text, 1, ${TURN_CHARS}) AS text,
                substr(d.thinking, 1, ${TURN_CHARS}) AS thinking,
                substr(d.output, 1, ${TURN_CHARS}) AS output
         FROM json_each(?) AS k
         JOIN docs d ON d.id = k.value
         JOIN strings r ON r.id = d.role
         JOIN strings a ON a.id = d.author`,
      )
      .all(JSON.stringify(ids)) as {
      author: DocAuthor;
      doc_id: string;
      id: number;
      output: string | null;
      role: string;
      sidechain: number;
      text: string;
      thinking: string | null;
      tools: string | null;
      ts: string | null;
    }[];
    return new Map(
      rows.map((row) => [
        row.id,
        {
          docId: row.doc_id,
          role: row.role,
          author: row.author,
          timestamp: row.ts,
          sidechain: row.sidechain === 1,
          text: row.text,
          thinking: row.thinking,
          tools: row.tools,
          output: row.output,
        },
      ]),
    );
  }

  /**
   * Every word whole, tier by tier, newest first ({@link RECENT_TIERS}); then
   * the last word as the start of longer ones. Each pass only while the
   * passes before it leave fewer than `limit` conversations; each document
   * once, best score first.
   */
  #rankedPasses(
    whole: Omit<Pass, "within">,
    typing: Omit<Pass, "within"> | null,
    filters: string,
    params: (string | number)[],
    limit: number,
  ): Ranked[] {
    const newest =
      (this.db.query("SELECT max(id) AS id FROM docs").get() as { id: number | null }).id ?? 0;
    const floors = [...RECENT_TIERS.map((size) => Math.max(0, newest - size)), 0].filter(
      (floor, i, all) => i === 0 || floor < (all[i - 1] ?? 0),
    );
    const passes: Pass[] = [
      ...floors.map((floor, i) => ({
        ...whole,
        within:
          i === 0
            ? `docs_fts.rowid > ${floor}`
            : `docs_fts.rowid > ${floor} AND docs_fts.rowid <= ${floors[i - 1]}`,
      })),
      ...(typing ? [{ ...typing, within: "1" }] : []),
    ];
    const rows = new Map<number, Ranked>();
    const conversations = new Set<string>();
    for (const pass of passes) {
      if (conversations.size >= limit) {
        break;
      }
      for (const row of this.#ranked(pass, filters, params, limit * SCAN_PER_CONVERSATION)) {
        if (!rows.has(row.id)) {
          rows.set(row.id, row);
          conversations.add(`${row.harness}:${row.session}`);
        }
      }
    }
    return [...rows.values()].toSorted((a, b) => b.score - a.score);
  }

  /**
   * The ranked documents gathered by conversation, best first: each
   * conversation's best {@link MOMENTS_PER_CONVERSATION} moments, near-same
   * ones folded, scored by its best moment with the next two counting a
   * little ({@link MOMENT_COUNTS}).
   */
  #moments(
    ranked: Ranked[],
    described: Map<number, Described>,
  ): { hit: Omit<ConversationHit, "moments">; moments: Ranked[] }[] {
    const conversations = new Map<
      string,
      { hit: Omit<ConversationHit, "moments">; moments: Ranked[]; said: Set<string> }
    >();
    for (const row of ranked) {
      const doc = described.get(row.id);
      if (!doc) {
        continue;
      }
      const key = `${doc.harness}\u0000${doc.session_id}`;
      const held = conversations.get(key) ?? {
        hit: {
          harness: doc.harness,
          sessionId: doc.session_id,
          cwd: doc.cwd,
          model: doc.model,
          sidechain: doc.sidechain === 1,
          score: 0,
        },
        moments: [],
        said: new Set<string>(),
      };
      conversations.set(key, held);
      const gist = doc.gist.replace(SPACES, " ").trim().toLowerCase();
      if (held.moments.length < MOMENTS_PER_CONVERSATION && !held.said.has(gist)) {
        held.said.add(gist);
        held.moments.push(row);
      }
    }
    return [...conversations.values()]
      .map(({ hit, moments }) => ({
        hit: {
          ...hit,
          score: moments.reduce(
            (sum, moment, i) => sum + moment.score * (MOMENT_COUNTS[i] ?? 0),
            0,
          ),
        },
        moments,
      }))
      .toSorted((a, b) => b.hit.score - a.hit.score);
  }

  /**
   * Forget a conversation whose transcript was deleted (a purge): every
   * document of `sessionId`, and the checkpoint of its transcript file (named
   * `<id>.jsonl` by Claude Code, `<timestamp>_<id>.jsonl` by pi), so no search
   * finds its words and no hit points at a file that is gone.
   * Synchronous, one transaction: run it between syncs, never inside one.
   * Answers how many documents went.
   */
  forgetSession(sessionId: string): number {
    const id = this.#strings.get(sessionId);
    const forget = this.db.transaction(() => {
      const gone =
        id === undefined
          ? 0
          : this.db.prepare("DELETE FROM docs WHERE session = ?").run(id).changes;
      this.db
        .prepare("DELETE FROM files WHERE path LIKE ? ESCAPE '\\'")
        .run(`%${sessionId.replace(/[\\%_]/g, (c) => `\\${c}`)}.jsonl`);
      return gone;
    });
    return forget();
  }

  /** Document count in the index. */
  count(): number {
    return (this.db.prepare("SELECT count(*) AS c FROM docs").get() as { c: number }).c;
  }
}
