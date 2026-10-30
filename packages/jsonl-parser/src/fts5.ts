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
  type TranscriptDoc,
  userAuthor,
} from "./text.ts";

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
 * Nothing is indexed by the session: search filters on it after the FTS
 * match, never through an index, and `docs_session` cost each live session a
 * page split every other sync.
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
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  text, thinking, tools, output,
  content='docs', content_rowid='id',
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts(rowid, text, thinking, tools, output) VALUES (new.id, new.text, new.thinking, new.tools, new.output);
END;
CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, text, thinking, tools, output) VALUES ('delete', old.id, old.text, old.thinking, old.tools, old.output);
END;
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
 * after others is left out until it has them: half a word that short says
 * nothing yet, and required whole it would empty the answer between
 * keystrokes. Alone, a short word is searched as itself.
 *
 * Only the last word is a prefix: FTS5 reads every term a prefix expands to
 * whole before a rowid range or another word narrows it, so a prefix costs
 * what all its expansions' documents cost (a common word's, 51 ms on 400,000
 * documents, where the same word whole in the newest tier cost 0.4 ms).
 */
export function matchQueries(text: string): { prefix: boolean; words: string[] } {
  const typed = text
    .split(/\s+/)
    .map((t) => t.replaceAll('"', ""))
    .filter((t) => t.length > 0);
  const last = typed.at(-1) ?? "";
  const words = typed.length > 1 && last.length < PREFIX_MIN ? typed.slice(0, -1) : typed;
  return { words, prefix: words.length === typed.length && last.length >= PREFIX_MIN };
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

export class TranscriptIndex {
  db: Database;
  /** `strings`, held whole: each value's id. */
  readonly #strings = new Map<string, number>();

  constructor(path: string) {
    this.db = this.#open(path);
    if (this.#olderLayout()) {
      this.#rebuild(path);
    }
    this.db.exec(SCHEMA);
    this.db.exec(MARKING);
    for (const [key, value] of [
      ["automerge", FTS_AUTOMERGE],
      ["usermerge", FTS_USERMERGE],
      ["crisismerge", FTS_CRISISMERGE],
    ] as const) {
      const held = this.db.query("SELECT v FROM docs_fts_config WHERE k = ?").get(key) as {
        v: number;
      } | null;
      if (held?.v !== value) {
        this.db.query("INSERT INTO docs_fts(docs_fts, rank) VALUES (?, ?)").run(key, value);
      }
    }
    this.#reloadStrings();
    this.#reattribute();
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
      this.db
        .query(
          "INSERT INTO meta (key, value) VALUES ('author_rules', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(String(AUTHOR_RULES));
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
    // journal_mode: the index only grows, and a rollback journal writes a
    // page added past the end of the file once, where WAL writes every page
    // twice (to the log, then back at checkpoint). Only the few existing pages
    // a sync changes are journaled. Measured over four simulated hours of ten
    // sessions writing, synced every ten minutes: 9.5 KB/s in WAL, 6.1 KB/s
    // with this. The agent is the index's one connection, so WAL's readers
    // beside a writer bought nothing.
    // synchronous: FULL is the rollback journal's default and what keeps it
    // from corrupting on power loss; NORMAL there is "Maybe not consistent"
    // (https://www.sqlite.org/pragma.html#pragma_synchronous). Its extra syncs
    // write no extra pages.
    // busy_timeout: a reader from outside (the sqlite3 shell, a probe) holds
    // its lock for a query's length; a commit waits that out, not fails.
    // temp_store: FTS5 flushes its pending terms (and merges segments) in the
    // middle of an insert once they pass 1 MB, and SQLite journals every page
    // that statement touches, spilling past 64 KB to a temp file: measured, a
    // tenth of a sync's writes went to `etilqs_*` files. In memory, they cost
    // a few MB of RAM for the moment of the flush.
    db.exec(
      "PRAGMA journal_mode = TRUNCATE; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY;",
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
    const changes = this.db.query("SELECT total_changes() AS n");
    const merge = this.db.query("INSERT INTO docs_fts(docs_fts, rank) VALUES ('merge', ?)");
    for (;;) {
      await new Promise((resolve) => setImmediate(resolve));
      const before = (changes.get() as { n: number }).n;
      section("search index: merge step", () => merge.run(MERGE_PAGES));
      if ((changes.get() as { n: number }).n - before < 2) {
        return;
      }
    }
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
    const tailFiles: { file: TranscriptFile; checkpoint: Checkpoint }[] = [];
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
          tailFiles.push({ file, checkpoint });
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

    // What this sync will commit, flushed early only when a catch-up makes it
    // large (WRITE_BATCH_BYTES). After each early flush, every transcript
    // last written before the oldest full file still to read is in: the
    // grown ones were read first, below.
    let pending: FileWrite[] = [];
    let pendingBytes = 0;
    const gather = async (write: FileWrite) => {
      pending.push(write);
      pendingBytes += write.bytes;
      if (pendingBytes >= WRITE_BATCH_BYTES) {
        result.docsAdded += await this.#commit(pending);
        pending = [];
        pendingBytes = 0;
        options.progress?.(Math.min(startedAt, (fullFiles[fullRead]?.mtime ?? startedAt) - 1));
      }
    };

    // Grown files first: tail reads are small, run in-process, and they are
    // the live sessions, whose newest words a catch-up would otherwise keep
    // out of every search until it ends.
    for (const { file, checkpoint } of tailFiles) {
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

    // Another source's documents in the order they were written, as a
    // catch-up's files are.
    const docs = options.docs?.toSorted((a, b) =>
      (a.timestamp ?? "").localeCompare(b.timestamp ?? ""),
    );
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
        const id = this.#strings.get(author);
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
    const { words, prefix } = matchQueries(query);
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
      const id = this.#strings.get(options.author);
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
      const id = this.#strings.get(session);
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
    const author = this.#strings.get(options.author);
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
        const id = this.#strings.get(session);
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
