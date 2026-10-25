/**
 * Every session's transcript, built once, here.
 *
 * The hub folds each session's frames into blocks as they arrive — whether
 * or not anyone is watching — so opening a session is a page read off what is
 * already built, and every client renders the same blocks (`TranscriptBuilder`,
 * @cawco/core). A session the hub has not built since it started is read from
 * its machine on its first frame or its first page, its newest window alone,
 * and the frames that arrive during that read are held and folded in behind
 * it. Older windows are read as pages reach back past what is held, each put
 * in front of it (`TranscriptBuilder.prepend`), so opening or paging a
 * transcript costs its machine and the hub the window, never the whole
 * conversation. A transcript
 * read again (a rewind, a continuation folded in, frames lost, its machine's
 * agent on a new build) is merged into what is built, never put in its place
 * (`TranscriptBuilder.merge`): a row once served stays where it stands under
 * its id, and what the merge changed goes out as events like any fold's.
 *
 * What a fold changes goes out on the session's Ledger stream as one
 * `transcript` frame of events, sequenced like everything else the stream
 * carries: a client that fetched a page at `seq` applies the events after it
 * and has exactly what the hub has.
 */
import {
  type FramePayload,
  type HarnessKind,
  type HubLine,
  type NeutralMessage,
  type SendRecord,
  type SessionCommands,
  type SessionMessage,
  type SessionStreamFrame,
  type SessionTooling,
  STREAM_SO_FAR,
  TRANSCRIPT_PAGE,
  TranscriptBuilder,
  type TranscriptEvent,
  type TranscriptPage,
  type TranscriptStreamFrame,
  type TranscriptWhere,
} from "@cawco/core";
import type { HubLifetimeShape } from "./lifetime";

/**
 * Where the next older window of a transcript is read: in which of its
 * conversations (the ones it went on from, oldest first, then its own) and
 * before which entry there (null: that conversation's newest window).
 */
export interface HistoryCursor {
  before: string | null;
  conversation: number;
}

/** A stored transcript's newest window as its machine answered, or why it could not. */
export type HistoryRead =
  | {
      entries: SessionMessage[];
      /** The hub's own lines, placed by the builder after the rows each followed ({@link HubLine}). */
      lines: HubLine[];
      /** The window before this one; null when this one reaches the start. */
      older: HistoryCursor | null;
      records: Record<string, SendRecord>;
      where: TranscriptWhere;
    }
  | HistoryFault;

/** An older window of a stored transcript, or why it could not be read. */
export type OlderRead =
  | {
      entries: SessionMessage[];
      older: HistoryCursor | null;
      records: Record<string, SendRecord>;
    }
  | HistoryFault;

/** Why a stored transcript could not be read. */
export interface HistoryFault {
  fault: "missing" | "offline" | "timeout" | "failed";
  machineId?: string;
  message: string;
}

export interface TranscriptPorts {
  /**
   * Keeps where one of the hub's lines, `lineId`, stands: after the rows
   * `after` names, the nearest first, as it was first placed (live, or by a
   * read that placed it by its clock). Every later read puts it there.
   */
  readonly anchor: (
    instanceId: string,
    lineId: string,
    after: readonly string[]
  ) => void;
  /** The commit the agent on `machineId` runs, as it last registered. */
  readonly build: (machineId: string) => string | undefined;
  /**
   * What the session's newest `init` listed behind `/`, as its row keeps it
   * (db `instanceCommands`): a transcript built from its stored file, which
   * holds no `init` for a Claude session, starts from it.
   */
  readonly commands: (instanceId: string) => SessionCommands | undefined;
  /** Whether a dashboard follows the session's stream. */
  readonly followed: (instanceId: string) => boolean;
  /** The session's stream head: the seq a page is consistent with. */
  readonly head: (instanceId: string) => number;
  /** This hub's run, the numbering {@link head} counts in (`TranscriptPage.hubRun`). */
  readonly hubRun: string;
  /**
   * The hub's laws (laws.ts): a law broken while a frame folds fails that
   * frame (`hold`), while a stored transcript is built fails that read
   * (`raise`); either way it is logged by name and raised on every dashboard.
   */
  readonly laws: {
    readonly hold: <T>(read: () => T) => T | undefined;
    readonly raise: <T>(read: () => T) => T;
  };
  /** Runs the idle sweep until the hub closes. */
  readonly lifetime: HubLifetimeShape;
  /** Whether the session has a process the hub believes is running. */
  readonly live: (instanceId: string) => boolean;
  /** The session's newest stored window and the records of its sends, cut after `at` when given. */
  readonly readHistory: (
    instanceId: string,
    at?: string
  ) => Promise<HistoryRead>;
  /** The window of the session's stored transcript `cursor` names, and the records of its sends. */
  readonly readOlder: (
    instanceId: string,
    cursor: HistoryCursor
  ) => Promise<OlderRead>;
  /** One frame onto the session's Ledger stream. */
  readonly sequence: (instanceId: string, frame: SessionStreamFrame) => void;
  /**
   * The servers and tools the session's newest `init` announced, as its row
   * keeps them (db `instanceTooling`): the newest page says them, for the
   * `/` palette, whether or not the transcript read holds an `init`.
   */
  readonly tooling: (instanceId: string) => SessionTooling | undefined;
}

/** A transcript whose load took this long or longer says so in the log, read and build apart. */
const SLOW_LOAD_MS = 1000;

/** A transcript nobody follows and no process writes leaves memory after this. */
const IDLE_MS = 10 * 60_000;
/** At most this many such transcripts are kept, newest used first. */
const IDLE_KEEP = 40;
const SWEEP_MS = 60_000;

/** What a session says that changes its transcript: a frame, or a send's record. */
export type TranscriptPayload = Extract<
  FramePayload,
  { kind: "frame" | "send" }
>;

/** One of the hub's own lines, folded in as a frame is and anchored where it lands. */
interface LinePayload {
  harness: HarnessKind;
  kind: "line";
  message: NeutralMessage;
}

/** The session's process went with its turn under way and no frame that ends it ({@link TranscriptsShape.processGone}). */
interface GonePayload {
  kind: "gone";
}

/** What waits behind a read in flight: a session's frame or record, one of the hub's lines, or its process gone. */
type Held = TranscriptPayload | LinePayload | GonePayload;

/** A frame that paints the reply being written: a partial, or the reply so far re-sent whole. */
const partial = (message: NeutralMessage): boolean =>
  message.type === "stream_event" ||
  (message.type === "system" && message.subtype === STREAM_SO_FAR);

/**
 * A held payload after which the partials before it paint nothing: the main
 * loop's message written (its final frame, or its stream's end), the turn's
 * end, or the reply so far re-sent whole.
 */
const endsPartials = (payload: Held): boolean => {
  if (payload.kind === "gone") {
    return true;
  }
  if (payload.kind !== "frame") {
    return false;
  }
  const message = payload.message as NeutralMessage;
  switch (message.type) {
    case "assistant":
      return !message.parent_tool_use_id;
    case "result":
      return true;
    case "stream_event":
      return (
        message.event.type === "message_stop" && !message.parent_tool_use_id
      );
    case "system":
      return message.subtype === STREAM_SO_FAR;
    case "raw":
    case "user":
      break;
  }
  return false;
};

interface Entry {
  /**
   * The commit of the agent that read this transcript from its machine: what
   * a read returns is that agent's to decide, so a transcript read by an
   * older one is read again when its machine registers a newer
   * (`machineRegistered`).
   */
  build: string | undefined;
  builder: TranscriptBuilder;
  held: Held[];
  /** The read in flight, while one is; frames meanwhile wait in `held`. */
  loading: Promise<HistoryRead> | null;
  /** The window before what is held; null once the conversation's start is. */
  older: HistoryCursor | null;
  /** The older window's read in flight, while one is. */
  olderLoading: Promise<OlderRead> | null;
  /** Counts the reads merged in: an older read begun before one is not put in front of it. */
  reads: number;
  usedAt: number;
  where: TranscriptWhere | null;
}

export interface TranscriptsShape {
  /** A session frame or a send's record, folded in; its changes go out on the stream. */
  readonly ingest: (instanceId: string, payload: TranscriptPayload) => void;
  /**
   * One of the hub's own lines (`message`, a system frame under its line's
   * id), folded in at the end of what is built, or said again in its place;
   * where it first lands is kept ({@link TranscriptPorts.anchor}).
   */
  readonly line: (
    instanceId: string,
    message: NeutralMessage,
    harness: HarnessKind
  ) => void;
  /**
   * A machine's agent has registered, running `instanceIds`. One machine
   * read at a time:
   *
   * - Every transcript of that machine built through an agent on another
   *   commit is read again and merged in. What a read returns is the agent's
   *   to decide, and a session that ran through its agent's upgrade would
   *   otherwise lack what only the new agent reads for as long as it ran — a
   *   live transcript is never swept, and is never built twice. A read in
   *   flight as the agent registered is waited for, never made again: the
   *   hub holds such a read for the agent coming back, which answers it.
   * - Every session it runs that has no transcript yet gets one, so opening
   *   it is a page off what is built, before any of them speaks.
   *
   * The same agent coming back on the same commit — a socket that dropped —
   * reads nothing again.
   */
  readonly machineRegistered: (
    machineId: string,
    instanceIds: readonly string[]
  ) => Promise<void>;
  /** An interrupt was carried to the session. */
  readonly noteInterrupt: (instanceId: string) => void;
  /** A page of the session's transcript, the newest when `before` is absent. */
  readonly page: (
    instanceId: string,
    limit: number | undefined,
    before: string | undefined
  ) => Promise<TranscriptPage | HistoryFault | { gone: string }>;
  /**
   * The session's process is gone (killed, crashed, ended): a turn it was
   * running ended with it, with no `result` frame to say so. Its tail stops
   * saying busy, as its pulse, which the hub forgets with the process, does.
   * A transcript not built is left unbuilt: one built later starts at rest.
   */
  readonly processGone: (instanceId: string) => void;
  /** One of the hub's own lines, `blockId`, taken back out of a built transcript. */
  readonly removeLine: (instanceId: string, blockId: string) => void;
  /**
   * Read the session again from its machine — its stored transcript changed
   * under it — and merge it in; cut after the entry `at` when given (a
   * rewind), when what is held after the read's last row goes.
   */
  readonly reread: (instanceId: string, at?: string) => void;
}

export const createTranscripts = (ports: TranscriptPorts): TranscriptsShape => {
  const entries = new Map<string, Entry>();

  const emit = (instanceId: string, events: TranscriptEvent[]): void => {
    if (events.length === 0) {
      return;
    }
    ports.sequence(instanceId, {
      kind: "transcript",
      instanceId,
      events,
    } satisfies TranscriptStreamFrame);
  };

  /** One held or live payload into a built transcript; a line's anchor kept where it lands. */
  const fold = (
    instanceId: string,
    entry: Entry,
    payload: Held
  ): TranscriptEvent[] => {
    if (payload.kind === "gone") {
      return entry.builder.endTurn();
    }
    if (payload.kind === "line") {
      const { events, after } = entry.builder.applyLine(
        payload.message,
        payload.harness
      );
      const id = "uuid" in payload.message ? payload.message.uuid : undefined;
      if (after && id) {
        ports.anchor(instanceId, id, after);
      }
      return events;
    }
    return payload.kind === "send"
      ? entry.builder.applyRecord(payload.record)
      : entry.builder.applyFrame(
          payload.message as NeutralMessage,
          payload.harness
        );
  };

  /**
   * Reads the stored transcript and merges it in, then whatever arrived
   * while it was read ({@link replayHeld}). A first read that fails leaves no
   * transcript: the next frame or page reads again; a later one leaves what
   * is built as it was, and folds in what arrived meanwhile.
   */
  const load = (
    instanceId: string,
    entry: Entry,
    at?: string
  ): Promise<HistoryRead> => {
    const began = Date.now();
    const loading = ports.readHistory(instanceId, at).then(
      (read) => {
        const readIn = Date.now() - began;
        if (entries.get(instanceId) !== entry) {
          return read;
        }
        entry.loading = null;
        if ("fault" in read) {
          if (entry.where === null) {
            entries.delete(instanceId);
          } else {
            emit(instanceId, replayHeld(instanceId, entry));
          }
          return read;
        }
        entry.where = read.where;
        entry.build = ports.build(read.where.machineId);
        // A law broken building it leaves no half-built transcript: the read
        // fails by the law's name, and the next frame or page reads again.
        const building = Date.now();
        try {
          ports.laws.raise(() => {
            const { events, placed, front } = entry.builder.merge(
              read.entries,
              read.records,
              read.lines,
              at !== undefined,
              read.older === null
            );
            // The first read, or one that now opens the transcript (a rewind
            // to before what was held), says where the older windows are.
            if (front) {
              entry.older = read.older;
            }
            entry.reads += 1;
            for (const line of placed) {
              ports.anchor(instanceId, line.id, line.after);
            }
            emit(instanceId, [...events, ...replayHeld(instanceId, entry)]);
          });
        } catch (error) {
          entries.delete(instanceId);
          throw error;
        }
        const builtIn = Date.now() - building;
        if (readIn + builtIn >= SLOW_LOAD_MS) {
          console.info(
            `[transcripts] ${instanceId.slice(0, 8)}: ${read.entries.length} stored entries read in ${readIn} ms, built in ${builtIn} ms`
          );
        }
        return read;
      },
      // A read that threw is a read that failed: no transcript is left
      // holding frames behind a promise that will never resolve.
      (error: unknown) => {
        if (entries.get(instanceId) === entry) {
          entries.delete(instanceId);
        }
        throw error;
      }
    );
    entry.loading = loading;
    return loading;
  };

  /**
   * What arrived during a read, folded in behind it, less what it already
   * carried. A read holds no partial (a harness stores a message once it is
   * written, or opencode what it had so far, which a re-sent reply replaces),
   * so the partials of the message still being written as the read ended are
   * folded: those after the last frame held that ends a message or re-sends
   * the reply whole. Those before it are dropped: what they painted is in the
   * read, or in what came after them.
   */
  const replayHeld = (instanceId: string, entry: Entry): TranscriptEvent[] => {
    const held = entry.held.splice(0);
    const settled = held.findLastIndex(endsPartials);
    return held.flatMap((payload, index) => {
      if (payload.kind === "frame") {
        const message = payload.message as NeutralMessage;
        if (
          partial(message) ? index < settled : entry.builder.seen(message.uuid)
        ) {
          return [];
        }
      }
      return fold(instanceId, entry, payload);
    });
  };

  const entryFor = (instanceId: string): Entry => {
    const known = entries.get(instanceId);
    if (known) {
      known.usedAt = Date.now();
      return known;
    }
    const builder = new TranscriptBuilder(instanceId);
    const commands = ports.commands(instanceId);
    if (commands) {
      builder.carryCommands(commands);
    }
    const tooling = ports.tooling(instanceId);
    if (tooling) {
      builder.carryTooling(tooling);
    }
    const entry: Entry = {
      build: undefined,
      builder,
      loading: null,
      held: [],
      older: null,
      olderLoading: null,
      reads: 0,
      where: null,
      usedAt: Date.now(),
    };
    entries.set(instanceId, entry);
    load(instanceId, entry).catch((error) =>
      console.error(`[hub] transcript read for ${instanceId} failed:`, error)
    );
    return entry;
  };

  const ingest = (instanceId: string, payload: Held): void => {
    const entry = entryFor(instanceId);
    if (entry.loading !== null) {
      entry.held.push(payload);
      return;
    }
    emit(
      instanceId,
      ports.laws.hold(() => fold(instanceId, entry, payload)) ?? []
    );
  };

  /**
   * The window before what is held, read and put in front of it, once: a
   * second asker waits for the same read. A read again of the newest window
   * meanwhile (a rewind) leaves what this read finds out of it.
   */
  const readOlder = (
    instanceId: string,
    entry: Entry,
    cursor: HistoryCursor
  ): Promise<OlderRead> => {
    if (entry.olderLoading !== null) {
      return entry.olderLoading;
    }
    const { reads } = entry;
    const loading = ports
      .readOlder(instanceId, cursor)
      .then((read) => {
        if (
          "fault" in read ||
          entries.get(instanceId) !== entry ||
          entry.reads !== reads ||
          entry.older !== cursor
        ) {
          return read;
        }
        ports.laws.raise(() => {
          const { events, placed } = entry.builder.prepend(
            read.entries,
            read.records,
            read.older === null
          );
          entry.older = read.older;
          for (const line of placed) {
            ports.anchor(instanceId, line.id, line.after);
          }
          emit(instanceId, events);
        });
        return read;
      })
      .finally(() => {
        entry.olderLoading = null;
      });
    entry.olderLoading = loading;
    return loading;
  };

  /**
   * Older windows, read until a page of `span` blocks before `before` can be
   * cut from what is held, or the conversation's start is in: a page asked
   * before a block not read yet (a reader's cursor from before the hub last
   * built it) reads back to it. Why a window could not be read, if one
   * could not.
   */
  const readBack = async (
    instanceId: string,
    entry: Entry,
    span: number,
    before: string | undefined
  ): Promise<HistoryFault | undefined> => {
    while (!entry.builder.holds(span, before) && entry.older !== null) {
      const cursor = entry.older;
      // biome-ignore lint/performance/noAwaitInLoops: each window names the one before it
      const read = await readOlder(instanceId, entry, cursor);
      if ("fault" in read) {
        return read;
      }
      // A read another read overtook put nothing in front: the page is
      // what is held.
      if (entry.older === cursor) {
        return;
      }
    }
  };

  const page: TranscriptsShape["page"] = async (instanceId, limit, before) => {
    const entry = entryFor(instanceId);
    if (entry.loading !== null) {
      const read = await entry.loading;
      // A read again that failed leaves what is built as it was: that is
      // the page.
      if ("fault" in read && entry.where === null) {
        return read;
      }
    }
    const span = limit ?? TRANSCRIPT_PAGE;
    const fault = await readBack(instanceId, entry, span, before);
    if (fault) {
      return fault;
    }
    // Read and stamped in one tick: no frame can fold in between, so the page
    // is exactly the transcript at `seq`.
    const built = entry.builder.page(span, before);
    if (!built) {
      return { gone: before ?? "" };
    }
    return {
      ...built,
      where: entry.where ?? {
        machineId: "",
        sessionKey: "",
        cwd: "",
        harness: "claude",
      },
      ...(before === undefined
        ? { seq: ports.head(instanceId), hubRun: ports.hubRun }
        : {}),
    };
  };

  const reread = (instanceId: string, at?: string): void => {
    const entry = entries.get(instanceId);
    if (!entry || entry.loading !== null) {
      return;
    }
    load(instanceId, entry, at).catch((error) =>
      console.error(`[hub] transcript reread for ${instanceId} failed:`, error)
    );
  };

  /**
   * Drops what nobody follows and nothing writes: idle past {@link IDLE_MS},
   * or past the newest {@link IDLE_KEEP} such. A live session's transcript is
   * kept for as long as its process runs, so opening it is never a read.
   */
  const sweep = (): void => {
    const now = Date.now();
    const idle = [...entries]
      .filter(
        ([id, entry]) =>
          !(entry.loading || ports.live(id) || ports.followed(id))
      )
      .sort(([, a], [, b]) => b.usedAt - a.usedAt);
    idle.forEach(([id, entry], index) => {
      if (index >= IDLE_KEEP || now - entry.usedAt > IDLE_MS) {
        entries.delete(id);
      }
    });
  };
  ports.lifetime.every(SWEEP_MS, sweep);

  return {
    ingest,
    line: (instanceId, message, harness) =>
      ingest(instanceId, { kind: "line", message, harness }),
    page,
    noteInterrupt: (instanceId) =>
      entries.get(instanceId)?.builder.noteInterrupt(),
    processGone: (instanceId) => {
      if (entries.has(instanceId)) {
        ingest(instanceId, { kind: "gone" });
      }
    },
    removeLine: (instanceId, blockId) => {
      const entry = entries.get(instanceId);
      if (entry && entry.loading === null) {
        emit(instanceId, entry.builder.removeLine(blockId));
      }
    },
    reread,
    machineRegistered: async (machineId, instanceIds) => {
      const build = ports.build(machineId);
      // One transcript's read failing is that transcript's: the rest of the
      // machine's are still read.
      const settled = (read: Promise<HistoryRead> | null): Promise<unknown> =>
        Promise.resolve(read).catch((error: unknown) =>
          console.error(`[hub] transcript read on ${machineId} failed:`, error)
        );
      for (const [instanceId, entry] of [...entries]) {
        // biome-ignore lint/performance/noAwaitInLoops: one machine read at a time, on purpose
        await settled(entry.loading);
        const stale =
          entries.get(instanceId) === entry &&
          entry.where?.machineId === machineId &&
          entry.build !== build;
        if (stale && !entry.loading) {
          await settled(load(instanceId, entry));
        }
      }
      for (const instanceId of instanceIds) {
        if (!entries.has(instanceId)) {
          // biome-ignore lint/performance/noAwaitInLoops: one machine read at a time, on purpose — a register names every session it runs
          await settled(entryFor(instanceId).loading);
        }
      }
    },
  };
};
