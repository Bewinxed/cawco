/**
 * Transcript search service: keeps the transcript index in sync with Claude
 * Code and pi transcripts and OpenCode sessions, in the background and
 * before a search, and asks it each search. Nothing of the index's SQLite
 * runs in the agent: its writer and its two readers (a person's typing, and
 * agents' `find`) are processes of their own (search/host.ts,
 * search/process.ts). A sync runs in the writer to its end
 * whatever happens to the searches; a question that runs past its limit, or
 * that its asker lets go, ends with the reader that ran it, and the next
 * question is answered by the reader started in its place.
 */

import { readWithin } from "@cawco/core/bounded";
import {
  TRANSCRIPT_SYNC_WAIT_MS,
  type TranscriptAnswer,
  type TranscriptPlaces,
  type TranscriptPlacesQuery,
  type TranscriptQuery,
  type TranscriptTurns,
  type TranscriptTurnsQuery,
} from "@cawco/core/find";
import { inFlight } from "@cawco/core/loop-watch";
import { unhandled } from "@cawco/core/unhandled";
import {
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Schedule,
} from "effect";
import { SearchProcess } from "./process";

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
 * dashboard's Find and the app's Jump, for finding a session by what was
 * said in it, asked once typing settles (250 ms after the last keystroke;
 * the app's, 150 ms), each newer one letting the last go (hub find.ts
 * `FindRequest.signal`), and agents' `find`: the first search syncs, the
 * rest of a burst answer from that sync. A sync that finds nothing new
 * writes nothing.
 */
const SEARCH_FRESH_MS = 10_000;

/** A failed sync in a few words: SQLite's own message, with its code when it has one. */
function syncFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const code = "code" in error ? error.code : undefined;
  return typeof code === "string" && !error.message.includes(code)
    ? `${error.message}, ${code}`
    : error.message;
}

export class TranscriptSearchService {
  /** The sync every {@link SYNC_INTERVAL_MS}, once started: interrupted at {@link close}. */
  #ticks: Fiber.Fiber<unknown> | null = null;
  /** The sync in flight: one at a time, which the timer and searches share. */
  #syncing: Promise<void> | null = null;
  /** When the last sync that ended without error began; 0 before one has. */
  #syncedAt = 0;
  /**
   * Every transcript as it stood then is in the index, ms epoch: the start
   * of its last finished sync, kept across restarts (`INDEXED_THROUGH`),
   * or how far a catch-up has come (fts5.ts `SyncOptions.progress`); 0 when
   * it can say no time.
   */
  #indexedThrough = 0;
  /** A sync of this index has ever finished: else one running is a catch-up. */
  #whole = false;
  /** How many transcripts the last finished sync could not read. */
  #unread = 0;
  /** The last failed sync's reason, logged once; null once a sync succeeds. */
  #failing: string | null = null;
  readonly #firstSync = Deferred.makeUnsafe<void>();
  /** The promise edge of the first sync's end: settles once it has ended, however it ended. */
  readonly synced = Effect.runPromise(Deferred.await(this.#firstSync));
  /** Each process that opens the index says how far it is whole. */
  readonly #heardOpen = (through: number): void => {
    this.#indexedThrough = Math.max(this.#indexedThrough, through);
    this.#whole ||= through > 0;
  };
  /** The index's one writer, in its own process: syncs and forgets, never stopped for a search. */
  readonly #writer = new SearchProcess("write", this.#heardOpen);
  /**
   * The index's reader for a person typing (Find, Jump, a mention, find in
   * a conversation), in its own process: killed with a question past its
   * limit or let go.
   */
  readonly #reader = new SearchProcess(
    "read",
    this.#heardOpen,
    this.#writer.firstOpen
  );
  /**
   * The index's reader for agents' `find` (core `TranscriptQuery.call`, and
   * a hit's turns), in a process of its own, started at its first question.
   * The hub waits out an agent's search as long as this machine works on it
   * (core `TRANSCRIPT_CALL_MS`), and a reader answers one question at a
   * time: on one reader, a search that ran for seconds held every keystroke
   * of the person's Find behind it.
   */
  readonly #callReader = new SearchProcess(
    "read",
    this.#heardOpen,
    this.#writer.firstOpen
  );

  /**
   * Run one sync cycle, or join the one in flight: claude and pi transcripts +
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
    this.#unread = await this.#writer.work("sync", startedAt, (through) => {
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
    const gone = await this.#writer.work("forget", sessionId);
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
      .finally(() => Deferred.doneUnsafe(this.#firstSync, Exit.void));
    // The next SYNC_INTERVAL_MS on, then at that rate: a sync that runs
    // longer is followed at once, and syncs never pile up.
    this.#ticks = Effect.runFork(
      Effect.sleep(SYNC_INTERVAL_MS).pipe(
        Effect.andThen(
          Effect.repeat(
            Effect.promise(() =>
              this.sync().catch(() => {
                // Logged in sync(); a periodic sync failure must not kill the daemon.
              })
            ),
            Schedule.fixed(SYNC_INTERVAL_MS)
          )
        )
      )
    );
  }

  /**
   * Search the index, brought up to date first when its last sync began
   * more than {@link SEARCH_FRESH_MS} ago: the conversations that match, each
   * with its best moments, how old the index it answered from is, and what
   * the sync and the query each took.
   */
  async search(
    query: string,
    options: TranscriptQuery,
    signal?: AbortSignal
  ): Promise<TranscriptAnswer> {
    const started = performance.now();
    await this.#fresh();
    const queried = performance.now();
    // No words and an author: that author's words, newest first, off the
    // index's author-and-time order (fts5.ts `listed`), never a scan.
    const { conversations, dropped, matched } = await this.#conversations(
      query,
      options,
      signal
    );
    return {
      conversations,
      ...(matched === undefined ? {} : { matched }),
      ...(dropped === null ? {} : { dropped }),
      unreadTranscripts: this.#unread,
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
   * {@link TRANSCRIPT_SYNC_WAIT_MS} (a sync of the few turns ten busy
   * sessions add in ten minutes takes 150 ms), then answered from as far as
   * it has come ({@link TranscriptAnswer.indexedThrough}), the sync going on
   * in the writer. A sync already running is never waited for: in a
   * catch-up, every search waited its whole second for a sync that ran on
   * for hours. A sync that fails within the wait refuses, with the reason
   * the hub names this machine by.
   */
  async #fresh(): Promise<void> {
    if (
      this.#syncing !== null ||
      Date.now() - this.#syncedAt <= SEARCH_FRESH_MS
    ) {
      return;
    }
    const outcome = await readWithin(TRANSCRIPT_SYNC_WAIT_MS, () =>
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
      default:
        unhandled("read", outcome);
    }
  }

  /**
   * A conversation's turns around one of its records, as the index holds
   * them (fts5.ts `turns`), brought up to date first as a search is: what an
   * agent's `find` reads a hit's turns from, whatever its stored transcript
   * keeps now.
   */
  async turns(
    query: TranscriptTurnsQuery,
    signal?: AbortSignal
  ): Promise<TranscriptTurns> {
    await this.#fresh();
    return this.#callReader.read(
      "turns",
      {
        sessions: query.sessions,
        side: query.side,
        ...(query.docId ? { docId: query.docId } : {}),
        ...(query.at === undefined ? {} : { at: query.at }),
      },
      signal
    );
  }

  /**
   * One window of the places in one conversation where the words stand
   * (fts5.ts `places`), oldest first, and how many there are, brought up to
   * date first as a search is when it asks for the newest (where find
   * starts): what the person's find in that conversation steps through. A
   * window further in (a step or a scroll) is read as the index stands, so
   * the find it belongs to keeps its places where they were.
   */
  async places(
    query: TranscriptPlacesQuery,
    signal?: AbortSignal
  ): Promise<TranscriptPlaces> {
    if (query.offset === undefined && query.near === undefined) {
      await this.#fresh();
    }
    return this.#reader.read(
      "places",
      {
        sessions: query.sessions,
        words: query.words,
        limit: query.limit,
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.offset === undefined ? {} : { offset: query.offset }),
        ...(query.near === undefined ? {} : { near: query.near }),
      },
      signal
    );
  }

  /**
   * What the index answers `query`: its matches, best first; with no words
   * and an author, that author's words newest first, off the index's author
   * and time order (fts5.ts `listed`), never a scan.
   */
  async #conversations(
    query: string,
    options: TranscriptQuery,
    signal: AbortSignal | undefined
  ) {
    const { author, limit } = options;
    const reader = options.call ? this.#callReader : this.#reader;
    const narrowed = {
      ...(options.sessions ? { sessions: options.sessions } : {}),
      ...(options.before ? { before: options.before } : {}),
    };
    if (query.trim() === "" && author !== undefined) {
      const { conversations } = await reader.read(
        "listed",
        {
          author,
          limit,
          ...narrowed,
          ...(options.since ? { since: options.since } : {}),
          ...(options.toolOutput ? { toolOutput: true } : {}),
          ...(options.context ? { context: true } : {}),
        },
        signal
      );
      return { conversations, dropped: null, matched: undefined };
    }
    return await reader.read(
      "search",
      {
        query,
        options: {
          limit,
          ...(author ? { author } : {}),
          ...narrowed,
          ...(options.toolOutput ? { toolOutput: true } : {}),
          ...(options.context ? { context: true } : {}),
          ...(options.submitted ? { submitted: true } : {}),
        },
      },
      signal
    );
  }

  close(): void {
    if (this.#ticks) {
      Effect.runFork(Fiber.interrupt(this.#ticks));
      this.#ticks = null;
    }
    this.#reader.close();
    this.#callReader.close();
    this.#writer.close();
  }
}

/** The machine's transcript search ({@link TranscriptSearchService}). */
export class TranscriptSearch extends Context.Service<
  TranscriptSearch,
  TranscriptSearchService
>()("TranscriptSearch") {}

/**
 * Transcript search: FTS5-backed BM25 search over transcripts, in a process
 * of its own (process.ts). Made and started as the agent's layer is built
 * (agent-layer.ts), it syncs every ten minutes in the background and before
 * a search, outlives reconnects, and closes as the layer's scope does.
 */
export const TranscriptSearchLayer = Layer.effect(TranscriptSearch)(
  Effect.acquireRelease(
    Effect.sync(() => {
      const search = new TranscriptSearchService();
      search.start();
      return search;
    }),
    (search) => Effect.sync(() => search.close())
  )
);
