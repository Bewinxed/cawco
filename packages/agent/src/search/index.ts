/**
 * Transcript search service: keeps the transcript index (held on the
 * agent's stores thread, stores/search-host.ts) in sync with Claude Code
 * transcripts and OpenCode sessions, in the background and before a search,
 * and asks it each search. Nothing of the index's SQLite runs on the loop.
 */

import type {
  TranscriptAnswer,
  TranscriptQuery,
  TranscriptTurns,
  TranscriptTurnsQuery,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { inFlight } from "../loop-watch";
import { storeRead, storeWork } from "../stores/client";
import type { StoreAnswer, StoreArg, StoreOp } from "../stores/ops";

/**
 * How often the index takes in what the transcripts gained when nobody is
 * searching: one transaction each time. Each commit rewrites the pages at the
 * tails of the index's tables and B-trees and starts a new FTS5 segment,
 * whatever it adds, so the interval sets that share of the agent's disk
 * writes: measured over four simulated hours of ten sessions writing, a sync
 * every minute wrote 13.0 KB/s and every ten minutes 9.5 KB/s (in WAL; see
 * the journal mode in fts5.ts). Freshness is not this interval's job: a
 * search brings the index up to date first ({@link SEARCH_FRESH_MS}). It
 * bounds what that sync has to take in: ten minutes of ten busy sessions
 * took 150 ms, inside the hub's 1.5 s answer window.
 */
const SYNC_INTERVAL_MS = 10 * 60_000;
/**
 * How far behind the transcripts a search may answer. Search is the
 * dashboard's jump palette, for finding a session by what was said in it,
 * one query per keystroke (150 ms debounce): the first keystroke syncs, the
 * rest of a burst answer from that sync. A sync that finds nothing new
 * writes nothing.
 */
const SEARCH_FRESH_MS = 10_000;
/**
 * How long a search waits for the sync it starts, ms: inside the hub's 1.5 s
 * window for each machine. A sync still running past it answers from what
 * the index holds so far, saying how far that is ({@link
 * TranscriptAnswer.indexedThrough}), rather than every search timing out at
 * the hub; a search that finds a sync already running waits for none. A
 * sync that fails within it refuses the search with its reason.
 */
const SYNC_WAIT_MS = 1000;
const MAX_SEARCH_LIMIT = 50;
const DEFAULT_SEARCH_LIMIT = 20;
/** How many documents a listing (an author's words, no query) answers with at most. */
const MAX_LISTED_DOCS = 200;
/** The most turns either side of a centre `turns` answers with: `find`'s detailed `around` asks five. */
const MAX_TURNS_SIDE = 10;
/**
 * How long a question of the index (a search, a listing, a conversation's
 * turns) is given on the stores thread, ms. A sync running there takes turns
 * between its parts, so a question answers between them; a thread held past
 * this (a disk that does not answer) refuses the question rather than
 * leaving it owed. Our call: far past the hub's own window for a machine.
 */
const QUERY_MS = 10_000;

/** A failed sync in a few words: SQLite's own message, with its code when it has one. */
function syncFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const { code } = error as Error & { code?: unknown };
  return typeof code === "string" && !error.message.includes(code)
    ? `${error.message}, ${code}`
    : error.message;
}

/**
 * `op` asked of the index on the stores thread, given {@link QUERY_MS}:
 * its answer, or a refusal that says the index did not answer in time.
 */
const askIndex = async <K extends StoreOp>(
  op: K,
  arg: StoreArg<K>
): Promise<StoreAnswer<K>> => {
  const read = await storeRead(op, arg, QUERY_MS);
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        read.reason === "dead"
          ? "its index's thread ended before it answered"
          : `its index did not answer within ${Math.round(read.after / 1000)} s`
      );
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

export class TranscriptSearchService {
  #timer: ReturnType<typeof setInterval> | null = null;
  /** The sync in flight: one at a time, which the timer and searches share. */
  #syncing: Promise<void> | null = null;
  /** When the last sync that ended without error began; 0 before one has. */
  #syncedAt = 0;
  /**
   * Every transcript as it stood then is in the index, ms epoch: the start
   * of its last finished sync, kept across restarts ({@link INDEXED_THROUGH}),
   * or how far a catch-up has come (fts5.ts `SyncOptions.progress`); 0 when
   * it can say no time.
   */
  #indexedThrough = 0;
  /** A sync of this index has ever finished: else one running is a catch-up. */
  #whole = false;
  /** The last failed sync's reason, logged once; null once a sync succeeds. */
  #failing: string | null = null;
  readonly #firstSync = Promise.withResolvers<void>();
  /** Settles once the first sync has ended, however it ended. */
  readonly synced = this.#firstSync.promise;

  /** The service, its index opened on the stores thread, knowing how far that index is whole. */
  static async create(): Promise<TranscriptSearchService> {
    const svc = new TranscriptSearchService();
    const through = await storeWork("search.open", undefined);
    svc.#indexedThrough = through;
    svc.#whole = through > 0;
    return svc;
  }

  /**
   * Run one sync cycle, or join the one in flight: claude transcripts +
   * opencode, committed as one transaction, the opencode watermark written
   * only when it moved.
   */
  sync(): Promise<void> {
    if (!this.#syncing) {
      this.#syncing = inFlight("search index syncs", this.#syncOnce())
        .then(
          () => {
            if (this.#failing !== null) {
              console.info("[search] transcript index syncs again");
              this.#failing = null;
            }
          },
          (error: unknown) => {
            // Logged here, once per failure that differs from the last: the
            // timer and every search share this sync, and a broken disk would
            // otherwise say the same thing on every keystroke.
            const reason = syncFailure(error);
            if (reason !== this.#failing) {
              console.warn(
                `[search] transcript index sync failed: ${reason}. Searches on this machine are refused until a sync succeeds.`
              );
              this.#failing = reason;
            }
            throw error;
          }
        )
        .finally(() => {
          this.#syncing = null;
        });
    }
    return this.#syncing;
  }

  async #syncOnce(): Promise<void> {
    const startedAt = Date.now();
    await storeWork("search.sync", startedAt, (through) => {
      this.#indexedThrough = Math.max(this.#indexedThrough, Number(through));
    });
    this.#syncedAt = startedAt;
    this.#indexedThrough = startedAt;
    this.#whole = true;
  }

  /**
   * A transcript was deleted (a purge, from the dashboard or a spin-off
   * discarded): its words leave the index, once the sync in flight, if any,
   * has ended, so the dashboard's Find and every agent's stop finding them.
   */
  async forget(sessionId: string): Promise<void> {
    await this.#syncing?.catch(() => undefined);
    const gone = await storeWork("search.forget", sessionId);
    console.info(
      `[search] transcript ${sessionId} deleted: ${gone} indexed document${gone === 1 ? "" : "s"} forgotten`
    );
  }

  /** Start the background sync loop. First sync is kicked off immediately. */
  start(): void {
    // Fire-and-forget initial sync — must not block startup.
    this.sync()
      .catch(() => {
        // Logged in sync(); a failed initial sync is not fatal.
      })
      .finally(() => this.#firstSync.resolve());
    this.#timer = setInterval(() => {
      this.sync().catch(() => {
        // Logged in sync(); a periodic sync failure must not kill the daemon.
      });
    }, SYNC_INTERVAL_MS);
  }

  /**
   * Search the index, brought up to date first when its last sync began
   * more than {@link SEARCH_FRESH_MS} ago: the conversations that match, each
   * with its best moments, how old the index it answered from is, and what
   * the sync and the query each took.
   */
  async search(
    query: string,
    options?: TranscriptQuery
  ): Promise<TranscriptAnswer> {
    const started = performance.now();
    await this.#fresh();
    const queried = performance.now();
    const limit = Math.min(
      options?.limit ?? DEFAULT_SEARCH_LIMIT,
      MAX_SEARCH_LIMIT
    );
    // No words and an author: that author's words, newest first, off the
    // index's author-and-time order (fts5.ts `listed`), never a scan.
    const conversations = await this.#conversations(query, limit, options);
    return {
      conversations,
      // Only a sync of an index that was never whole is a catch-up: a slow
      // sync of a whole one answers from it, as far as `indexedThrough`.
      catchingUp: this.#syncing !== null && !this.#whole,
      indexedThrough: this.#indexedThrough,
      syncMs: Math.round(queried - started),
      queryMs: Math.round(performance.now() - queried),
    };
  }

  /**
   * The index brought up to date when its last sync began more than
   * {@link SEARCH_FRESH_MS} ago and none is running: waited for up to
   * {@link SYNC_WAIT_MS}, then answered from as far as it has come. A sync
   * already running is never waited for: in a catch-up, every search waited
   * its whole second for a sync that ran on for hours. A sync that fails
   * within the wait refuses, with the reason the hub names this machine by.
   */
  async #fresh(): Promise<void> {
    if (
      this.#syncing !== null ||
      Date.now() - this.#syncedAt <= SEARCH_FRESH_MS
    ) {
      return;
    }
    const outcome = await readWithin(SYNC_WAIT_MS, () =>
      this.sync().then(
        () => undefined,
        (error: unknown) => ({ error })
      )
    );
    switch (outcome.kind) {
      case "answered":
        if (outcome.value) {
          throw new Error(
            `its index couldn't update (${syncFailure(outcome.value.error)})`,
            { cause: outcome.value.error }
          );
        }
        return;
      case "unanswered":
        // Still syncing: answered from what is indexed so far.
        return;
      default: {
        const unhandled: never = outcome;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  /**
   * A conversation's turns around one of its records, as the index holds
   * them (fts5.ts `turns`), brought up to date first as a search is: what an
   * agent's `find` reads a hit's turns from, whatever its stored transcript
   * keeps now.
   */
  async turns(query: TranscriptTurnsQuery): Promise<TranscriptTurns> {
    await this.#fresh();
    return askIndex("search.turns", {
      sessions: query.sessions,
      side: Math.min(Math.max(0, query.side), MAX_TURNS_SIDE),
      ...(query.docId ? { docId: query.docId } : {}),
      ...(query.at === undefined ? {} : { at: query.at }),
    });
  }

  /**
   * What the index answers `query`: its matches, best first; with no words
   * and an author, that author's words newest first, off the index's author
   * and time order (fts5.ts `listed`), never a scan.
   */
  #conversations(query: string, limit: number, options?: TranscriptQuery) {
    const author = options?.author;
    const narrowed = {
      ...(options?.sessions ? { sessions: options.sessions } : {}),
      ...(options?.before ? { before: options.before } : {}),
    };
    if (query.trim() === "" && author !== undefined) {
      return askIndex("search.listed", {
        author,
        limit: Math.min(options?.limit ?? MAX_LISTED_DOCS, MAX_LISTED_DOCS),
        ...narrowed,
        ...(options?.since ? { since: options.since } : {}),
        ...(options?.toolOutput ? { toolOutput: true } : {}),
        ...(options?.context ? { context: true } : {}),
      });
    }
    return askIndex("search.search", {
      query,
      options: {
        limit,
        ...(author ? { author } : {}),
        ...narrowed,
        ...(options?.toolOutput ? { toolOutput: true } : {}),
        ...(options?.context ? { context: true } : {}),
      },
    });
  }

  /** Document count in the index. */
  count(): Promise<number> {
    return askIndex("search.count", undefined);
  }

  close(): Promise<void> {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    return storeWork("search.close", undefined);
  }
}
