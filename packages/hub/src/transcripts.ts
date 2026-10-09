/**
 * Every session's transcript, built once, here.
 *
 * The hub folds each session's frames into blocks as they arrive — whether
 * or not anyone is watching — so opening a session is a page read off what is
 * already built, and every client renders the same blocks (`TranscriptBuilder`,
 * @cawco/core). A session the hub has not built since it started is read from
 * its machine once, on its first frame or its first page, and the frames that
 * arrive during that read are held and folded in behind it.
 *
 * What a fold changes goes out on the session's Ledger stream as one
 * `transcript` frame of events, sequenced like everything else the stream
 * carries: a client that fetched a page at `seq` applies the events after it
 * and has exactly what the hub has.
 */
import {
  type FramePayload,
  type NeutralMessage,
  type SendRecord,
  type SessionMessage,
  type SessionStreamFrame,
  TRANSCRIPT_PAGE,
  TranscriptBuilder,
  type TranscriptEvent,
  type TranscriptPage,
  type TranscriptStreamFrame,
  type TranscriptWhere,
} from "@cawco/core";
import type { HubLifetimeShape } from "./lifetime";

/** A stored transcript as its machine answered, or why it could not. */
export type HistoryRead =
  | {
      entries: SessionMessage[];
      records: Record<string, SendRecord>;
      where: TranscriptWhere;
    }
  | HistoryFault;

/** Why a stored transcript could not be read. */
export interface HistoryFault {
  fault: "missing" | "offline" | "timeout" | "failed";
  machineId?: string;
  message: string;
}

export interface TranscriptPorts {
  /** The commit the agent on `machineId` runs, as it last registered. */
  readonly build: (machineId: string) => string | undefined;
  /** Whether a dashboard follows the session's stream. */
  readonly followed: (instanceId: string) => boolean;
  /** The session's stream head: the seq a page is consistent with. */
  readonly head: (instanceId: string) => number;
  /** Runs the idle sweep until the hub closes. */
  readonly lifetime: HubLifetimeShape;
  /** Whether the session has a process the hub believes is running. */
  readonly live: (instanceId: string) => boolean;
  /** The session's whole stored transcript and the records of its sends, cut after `at` when given. */
  readonly readHistory: (
    instanceId: string,
    at?: string
  ) => Promise<HistoryRead>;
  /** One frame onto the session's Ledger stream. */
  readonly sequence: (instanceId: string, frame: SessionStreamFrame) => void;
}

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

interface Entry {
  /**
   * The commit of the agent that read this transcript from its machine: what
   * a read returns is that agent's to decide, so a transcript read by an
   * older one is read again when its machine registers a newer
   * (`machineRegistered`).
   */
  build: string | undefined;
  builder: TranscriptBuilder;
  held: TranscriptPayload[];
  /** The read in flight, while one is; frames meanwhile wait in `held`. */
  loading: Promise<HistoryRead> | null;
  usedAt: number;
  where: TranscriptWhere | null;
}

export interface TranscriptsShape {
  /** A session frame or a send's record, folded in; its changes go out on the stream. */
  readonly ingest: (instanceId: string, payload: TranscriptPayload) => void;
  /**
   * A machine's agent has registered, running `instanceIds`. One machine
   * read at a time:
   *
   * - Every transcript of that machine built through an agent on another
   *   commit is read again and replaced. What a read returns is the agent's
   *   to decide, and a session that ran through its agent's upgrade would
   *   otherwise keep what the old agent read for as long as it ran — a live
   *   transcript is never swept, and is never built twice. So is one whose
   *   read was in flight as the agent registered: the agent that answered it
   *   may be the one that went away.
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
  /** The session is being started again in place. */
  readonly noteRelaunch: (instanceId: string) => void;
  /** A page of the session's transcript, the newest when `before` is absent. */
  readonly page: (
    instanceId: string,
    limit: number | undefined,
    before: string | undefined
  ) => Promise<TranscriptPage | HistoryFault | { gone: string }>;
  /**
   * Read the session again from its machine — its stored transcript changed
   * under it — cut after the entry `at` when given (a rewind).
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

  /** One held or live payload into a built transcript. */
  const fold = (entry: Entry, payload: TranscriptPayload): TranscriptEvent[] =>
    payload.kind === "send"
      ? entry.builder.applyRecord(payload.record)
      : entry.builder.applyFrame(
          payload.message as NeutralMessage,
          payload.harness
        );

  /**
   * Reads the stored transcript and folds it in, then whatever arrived while
   * it was read — minus partials (the turn's own frames land right behind
   * them) and frames the read already carried. A read that fails leaves no
   * transcript: the next frame or page reads again.
   */
  const load = (
    instanceId: string,
    entry: Entry,
    reset: boolean,
    at?: string
  ): Promise<HistoryRead> => {
    const loading = ports.readHistory(instanceId, at).then(
      (read) => {
        if (entries.get(instanceId) !== entry) {
          return read;
        }
        entry.loading = null;
        if ("fault" in read) {
          entries.delete(instanceId);
          return read;
        }
        entry.where = read.where;
        entry.build = ports.build(read.where.machineId);
        entry.builder.seed(read.entries, read.records);
        emit(instanceId, [
          ...(reset ? [{ type: "reset" } as const] : []),
          ...replayHeld(entry),
        ]);
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

  /** What arrived during a read, folded in behind it, less what it already carried. */
  const replayHeld = (entry: Entry): TranscriptEvent[] =>
    entry.held.splice(0).flatMap((payload) => {
      if (payload.kind === "frame") {
        const message = payload.message as { type?: string; uuid?: string };
        if (
          message.type === "stream_event" ||
          entry.builder.seen(message.uuid)
        ) {
          return [];
        }
      }
      return fold(entry, payload);
    });

  const entryFor = (instanceId: string): Entry => {
    const known = entries.get(instanceId);
    if (known) {
      known.usedAt = Date.now();
      return known;
    }
    const entry: Entry = {
      build: undefined,
      builder: new TranscriptBuilder(instanceId),
      loading: null,
      held: [],
      where: null,
      usedAt: Date.now(),
    };
    entries.set(instanceId, entry);
    load(instanceId, entry, false).catch((error) =>
      console.error(`[hub] transcript read for ${instanceId} failed:`, error)
    );
    return entry;
  };

  const ingest = (instanceId: string, payload: TranscriptPayload): void => {
    const entry = entryFor(instanceId);
    if (entry.loading !== null) {
      entry.held.push(payload);
      return;
    }
    emit(instanceId, fold(entry, payload));
  };

  const page: TranscriptsShape["page"] = async (instanceId, limit, before) => {
    const entry = entryFor(instanceId);
    if (entry.loading !== null) {
      const read = await entry.loading;
      if ("fault" in read) {
        return read;
      }
    }
    // Read and stamped in one tick: no frame can fold in between, so the page
    // is exactly the transcript at `seq`.
    const built = entry.builder.page(limit ?? TRANSCRIPT_PAGE, before);
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
      ...(before === undefined ? { seq: ports.head(instanceId) } : {}),
    };
  };

  const reread = (instanceId: string, at?: string): void => {
    const entry = entries.get(instanceId);
    if (!entry || entry.loading !== null) {
      return;
    }
    load(instanceId, entry, true, at).catch((error) =>
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
    page,
    noteInterrupt: (instanceId) =>
      entries.get(instanceId)?.builder.noteInterrupt(),
    noteRelaunch: (instanceId) =>
      entries.get(instanceId)?.builder.noteRelaunch(),
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
        const inFlight = entry.loading;
        // biome-ignore lint/performance/noAwaitInLoops: one machine read at a time, on purpose
        await settled(inFlight);
        const stale =
          entries.get(instanceId) === entry &&
          entry.where?.machineId === machineId &&
          (inFlight !== null || entry.build !== build);
        if (stale && !entry.loading) {
          await settled(load(instanceId, entry, true));
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
