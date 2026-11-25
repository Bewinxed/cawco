/**
 * The door (provider spec §2.5): everything CawCo reads from an outside
 * service comes in through {@link Intake.take}, once. The poll loop
 * (clock.ts), the relay's webhook receiver (relay.ts) and a task's link
 * reads (links.ts `readLinks`) all call it.
 *
 * THE INVARIANTS:
 * - **Stored once.** `take` stores one read or delivery in one transaction
 *   (db/intake.ts): each item revision on the item's one mirror row, where
 *   its version is newer than the one held; each event once per project on
 *   (source, key). A revision the mirror holds and an event whose key is
 *   there store nothing and wake nothing, so a poll and a webhook of one
 *   change land once, in either order. A baseline read (a watch's first)
 *   stores its revisions and keeps its events as already handled.
 * - **Answered at once.** `take` returns as soon as the store is done; a
 *   webhook is answered then, and the poll loop keeps its cursor only then.
 * - **In order, in the project's turn.** The subscribers run after, one
 *   project at a time ({@link Intake.turn}), per item, oldest event first:
 *   1. links: the tasks that link the item hear it moved, and a comment on
 *      a linked item is filed on its thread task (links.ts);
 *   2. sync: a revision of an issue on the project's syncing watch is filed
 *      as a task or reconciled with the task that holds it (sync.ts), and
 *      a board read lands before the items;
 *   3. lifecycle: a merged pull request an attempt opened moves its task
 *      (dispatch.ts);
 *   4. outsiders: an event from someone the service does not vouch for is
 *      held, or goes on, by the project's rule (outsiders.ts);
 *   5. routing last (event-routes.ts): a route's routine, else a trigger
 *      on the task that links the item (the one step 2 filed included),
 *      else on the item.
 *   So a new issue on a synced repository is one task before any route or
 *   trigger sees its event.
 * - **CawCo's own.** Before an item's events and revisions run, every write
 *   CawCo has under way to its container is recorded (writes.ts
 *   `settled`), and each event is marked `ours` when the write ledger names
 *   it CawCo's (db/writes.ts `originOf`): an item CawCo made for one of the
 *   project's tasks is linked to that task first (links.ts `adopt`), so no
 *   second task is filed for it; a comment CawCo posted is never filed as
 *   someone else's; and an event CawCo's own write caused raises no
 *   trigger, while routes still match it.
 * - **Run again after a stop.** Each event is marked `processed_at` once
 *   its subscribers ran to the end, and each mirror row `synced_version`
 *   once the sync took it in; what a stopped hub, or a step that stopped
 *   short, left runs again at the hub's start ({@link Intake.start}) and
 *   after the project's next take. Every subscriber is safe to repeat: a
 *   comment is filed once under its own id, an issue a task links files no
 *   task, a merge's move finds its task moved, and routing passes over an
 *   event a route or a trigger already took.
 * - **Written in Effect.** `take` is an Effect whose store is synchronous
 *   and whose subscribers run on a fiber of their own (`Effect.forkDetach`);
 *   the project's turn is a one-permit Semaphore per project
 *   (core keyed-lock.ts). The subscribers are promise code (links.ts,
 *   sync.ts, event-routes.ts, outsiders.ts, dispatch.ts), each run as one
 *   step whose rejection is a typed {@link SubscriberFailed}; `turn` is the
 *   promise edge the sync and the outsider rule take the turn by.
 */
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import { githubIngest } from "@cawco/providers/github/ingest";
import { linearIngest } from "@cawco/providers/linear/ingest";
import type {
  BoardRead,
  Ingested,
  ItemRevision,
  MirrorProvider,
  SourceEvent,
} from "@cawco/providers/provider";
import { Cause, Effect, Schema } from "effect";
import type { DbShape } from "./db";
import type { ItemRow } from "./db/external-items";
import type { InboundEventRow } from "./db/ingress";
import type { InboundOrigin, InboundVia } from "./db/stored-types";
import { type InboundEvent, storedEvent } from "./inbound-event";
import { PAYLOAD_MAX } from "./ingress-views";
import { type AnyProblem, isProblem } from "./refusal";

const CUT = "[cut by the hub: the event was over 64 KB]";
const bytes = (text: string) => Buffer.byteLength(text, "utf8");
/** What a character cut in half decodes to, at the end of a cut. */
const TORN_CHARACTER = /�$/u;

/** `text` cut to at most `max` bytes, on a character boundary. */
const cutTo = (text: string, max: number): string => {
  const buffer = Buffer.from(text, "utf8");
  return buffer.length <= max
    ? text
    : buffer
        .subarray(0, Math.max(0, max))
        .toString("utf8")
        .replace(TORN_CHARACTER, "");
};

/** An event as the door stores it: what a route matches and a model reads. */
const payloadOf = (event: SourceEvent): InboundEvent => ({
  source: event.source,
  key: event.key,
  kind: event.kind,
  actor: event.actor?.login ?? null,
  author: event.actor,
  labels: event.labels,
  branch: event.branch,
  url: event.url,
  title: event.title,
  body: event.body,
  at: event.at,
  ...(event.number === undefined ? {} : { number: event.number }),
  ...(event.draft === undefined ? {} : { draft: event.draft }),
  ...(event.comment === undefined ? {} : { comment: event.comment }),
  ...(event.data === undefined ? {} : { data: event.data }),
});

/**
 * The event as stored: JSON of at most {@link PAYLOAD_MAX} bytes. Over it,
 * the body is cut first, with a marker; a record over it is kept as the
 * head of its JSON, marked.
 */
const storedPayload = (source: SourceEvent): string => {
  const event = payloadOf(source);
  const full = JSON.stringify(event);
  if (bytes(full) <= PAYLOAD_MAX) {
    return full;
  }
  const { data, body, ...rest } = event;
  const room = PAYLOAD_MAX - bytes(JSON.stringify(rest)) - 512;
  if (data === undefined && body !== null) {
    return JSON.stringify({ ...rest, body: `${cutTo(body, room)}\n${CUT}` });
  }
  return JSON.stringify({
    ...rest,
    body: body === null ? null : cutTo(body, Math.floor(room / 4)),
    cut: CUT,
    dataHead: cutTo(String(JSON.stringify(data)), Math.floor(room / 2)),
  });
};

/** The events a revision's move says, by the provider whose item it is (provider spec §2.3 `Ingest.moved`). */
const MOVED: Partial<
  Record<MirrorProvider, NonNullable<typeof githubIngest.moved>>
> = { github: githubIngest.moved, linear: linearIngest.moved };

/** Where a take comes from: its project, the watch it came through (none for a relay's generic delivery), and whose items it holds. */
export interface IntakeAt {
  projectId: string;
  provider: MirrorProvider;
  watchId: string | null;
}

/** One stored event as its subscribers read it. */
export interface Arrived {
  event: InboundEvent;
  row: InboundEventRow;
}

/** What the routing step knows from the steps before it. */
export interface Routing {
  /** The event's author is someone the service does not vouch for, and the project holds their events: no route, no trigger. */
  held: boolean;
  /** A merged pull request moved its task: no trigger. */
  lifecycle: boolean;
  /** CawCo's own write caused it (the write ledger says so, db/writes.ts): routes match it, and it raises no trigger. */
  ours: boolean;
  /** The item is an issue on the project's syncing watch: the sync took its revision in. */
  synced: boolean;
  /** The task the event is about; null when none links its item. */
  taskId: string | null;
}

/** What the sync step did with an item: the task it filed or that holds it, whether the item is the syncing watch's, and whether it took a version in now. */
export interface Synced {
  syncs: boolean;
  taskId: string | null;
  took: boolean;
}

/** The subscribers that run for what the door stored, in order (provider spec §2.5). */
export interface IntakeSubscribers {
  /** An item CawCo made for one of the project's tasks, linked to it before anything else reads it (links.ts `adopt`). */
  readonly adopt: (projectId: string, item: ItemRow) => Promise<void>;
  /** A merged pull request an attempt opened moves its task: the task, when it is this project's. */
  readonly lifecycle: (arrived: Arrived) => Promise<string | undefined>;
  /** The thread task of the event's item, its comment filed there (links.ts `onEvent`); the task's refusal of the comment. */
  readonly links: (arrived: Arrived) => Promise<string | null | AnyProblem>;
  /** The items whose state or title a take moved: the tasks that link them look again (links.ts `moved`). */
  readonly linksMoved: (projectId: string, items: readonly ItemRow[]) => void;
  /** Whether an event's author is held by the project's outsider rule, its task or item held for the person (outsiders.ts `hold`). */
  readonly outsiders: (
    arrived: Arrived,
    taskId: string | null,
    synced: boolean
  ) => Promise<boolean>;
  /** Routes, then a trigger (event-routes.ts `route`). */
  readonly route: (arrived: Arrived, routing: Routing) => Promise<void>;
  /** The tracker sync (sync.ts). */
  readonly sync: {
    /** A board read of the project's syncing watch: its tasks' Status taken in. */
    readonly board: (
      projectId: string,
      watchId: string,
      board: BoardRead
    ) => Promise<void>;
    /** A mirror row past what the sync took in: filed or reconciled when it is an issue of the syncing watch, from `revision` when the take holds it, else read now; its refusal leaves the row to run again. */
    readonly revision: (
      projectId: string,
      item: ItemRow,
      revision: ItemRevision | undefined
    ) => Promise<Synced | AnyProblem>;
  };
  /** Whether an item is an issue of the project's syncing watch (sync.ts `syncs`). */
  readonly syncs: (projectId: string, itemId: string | null) => boolean;
}

export interface IntakeDeps {
  readonly db: Pick<DbShape, "ingress" | "intake" | "writes">;
  /** An event landed for a project, stored once: its starters are asked again (project-starters.ts). */
  readonly eventLanded: (projectId: string) => void;
  readonly subscribers: IntakeSubscribers;
  /** The write door: what CawCo writes to a container is recorded before the door reads that container's events (writes.ts `settled`). */
  readonly writes: {
    readonly settled: (host: string, container: string) => Promise<void>;
  };
}

/** What one project's run of the subscribers takes: events, edited comments, revisions and rows to sync, moved items and board reads. */
interface Batch {
  boards: { board: BoardRead; watchId: string }[];
  /** It carries what the project left to run: the next batch of the project may carry it again once this one starts. */
  carriesLeft?: true;
  edited: InboundEventRow[];
  moved: ItemRow[];
  rows: InboundEventRow[];
  /** Each item to sync, by its id, with the revision the take holds of it, when it does. */
  unsynced: Map<string, { item: ItemRow; revision?: ItemRevision }>;
}

const wordsOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** A subscriber (promise code: links.ts, sync.ts, event-routes.ts, outsiders.ts, dispatch.ts) that threw: its step and its words. */
class SubscriberFailed extends Schema.TaggedError<SubscriberFailed>()(
  "SubscriberFailed",
  { step: Schema.String, words: Schema.String }
) {}

/** One subscriber's promise as a step of the door: its rejection a {@link SubscriberFailed}. */
const step = <A>(
  name: string,
  run: () => Promise<A>
): Effect.Effect<A, SubscriberFailed> =>
  Effect.tryPromise({
    try: run,
    catch: (error) =>
      new SubscriberFailed({ step: name, words: wordsOf(error) }),
  });

/** What stopped a run, in words: a subscriber's failure, or what threw. */
const causeWords = (cause: Cause.Cause<SubscriberFailed>): string => {
  const failed = Cause.squash(cause);
  return failed instanceof SubscriberFailed
    ? `${failed.step}: ${failed.words}`
    : wordsOf(failed);
};

export const createIntake = ({
  db,
  eventLanded,
  subscribers,
  writes,
}: IntakeDeps) => {
  /** Each project's turn: what came through the door, and the sync's own work, run one at a time. */
  const turns = makeKeyedLock<string>();
  /** The projects whose queued batch carries what they left to run: one read's several takes carry it once. */
  const leftQueued = new Set<string>();

  /** Runs `work` in the project's turn: nothing else of the project's door or sync runs meanwhile. */
  const turn = <T>(projectId: string, work: () => Promise<T>): Promise<T> =>
    turns.run(projectId, work);

  /** Step 2 for an item, once: undefined when it has nothing to sync, else what the sync did, or its refusal. */
  const syncItem = Effect.fnUntraced(function* (
    batch: Batch,
    projectId: string,
    itemId: string | null
  ): Effect.fn.Return<Synced | AnyProblem | undefined, SubscriberFailed> {
    const due = itemId ? batch.unsynced.get(itemId) : undefined;
    if (!(due && itemId)) {
      return;
    }
    batch.unsynced.delete(itemId);
    const said = `[intake] ${due.item.provider} ${due.item.ref}`;
    yield* settledOwn(projectId, due.item);
    const synced = yield* step("sync", () =>
      subscribers.sync.revision(projectId, due.item, due.revision)
    );
    if (isProblem(synced)) {
      console.warn(
        `${said}: the sync stopped short, and runs again after the project's next read: ${synced.response.detail}`
      );
    } else if (synced.took) {
      console.log(
        `${said}: sync${synced.taskId ? `, its task ${synced.taskId}` : ", no task"}`
      );
    }
    return synced;
  });

  /**
   * What CawCo writes to the item's container recorded first (a session's
   * issue a webhook brings back at once), then an item it made for one of
   * the project's tasks linked to that task: so nothing after reads CawCo's
   * own as someone else's, and no second task is filed for it.
   */
  const settledOwn = Effect.fnUntraced(function* (
    projectId: string,
    item: ItemRow | undefined
  ): Effect.fn.Return<void, SubscriberFailed> {
    if (!item || item.provider === "connection") {
      return;
    }
    yield* step("writes", () => writes.settled(item.host, item.container));
    yield* step("adopt", () => subscribers.adopt(projectId, item));
  });

  /**
   * Who caused a stored event, as the write ledger says once CawCo's writes
   * to its item's container are recorded: one recorded since the event was
   * stored is CawCo's own all the same. Kept on the event.
   */
  const originNow = Effect.fnUntraced(function* (
    row: InboundEventRow,
    event: InboundEvent
  ): Effect.fn.Return<InboundOrigin, SubscriberFailed> {
    const item = row.itemId ? db.intake.item(row.itemId) : undefined;
    yield* settledOwn(row.projectId, item);
    const origin = db.writes.origin({
      item: item ?? null,
      kind: event.kind,
      key: row.deliveryKey,
      ...(event.comment ? { comment: event.comment } : {}),
    });
    if (origin !== row.origin) {
      db.ingress.setEvent(row.id, { origin });
    }
    return origin;
  });

  /** Steps 1 and 2 for one stored event: its thread task, and what the sync did with its item; undefined when either stopped short (the event stays unprocessed). */
  const linkAndSync = Effect.fnUntraced(function* (
    batch: Batch,
    arrived: Arrived,
    said: string
  ): Effect.fn.Return<
    { linked: string | null; synced: Synced | undefined } | undefined,
    SubscriberFailed
  > {
    const { row } = arrived;
    const linked = yield* step("links", () => subscribers.links(arrived));
    if (isProblem(linked)) {
      console.warn(
        `${said} stays unprocessed, and runs again after the project's next read: ${linked.response.detail}`
      );
      return;
    }
    console.log(
      `${said}: links${linked ? `, linked to ${linked}` : ", linked to no task"}`
    );
    const synced = yield* syncItem(batch, row.projectId, row.itemId);
    if (synced !== undefined && isProblem(synced)) {
      console.warn(
        `${said} stays unprocessed, and runs again after the project's next read`
      );
      return;
    }
    return { linked, synced };
  });

  /** The five steps for one stored event, in order; marked processed once they all ran. */
  const runOne = Effect.fnUntraced(function* (
    batch: Batch,
    stored: InboundEventRow
  ): Effect.fn.Return<void, SubscriberFailed> {
    const row = db.ingress.event(stored.id) ?? stored;
    if (row.processedAt !== null) {
      return;
    }
    const said = `[intake] ${row.source} ${row.deliveryKey}`;
    const event = storedEvent(row);
    const origin = yield* originNow(row, event);
    const ours = origin === "ours";
    const arrived: Arrived = { event, row: { ...row, origin } };
    const before = yield* linkAndSync(batch, arrived, said);
    if (before === undefined) {
      return;
    }
    const { linked, synced } = before;
    let taskId = linked ?? synced?.taskId ?? null;
    const syncs = synced?.syncs ?? subscribers.syncs(row.projectId, row.itemId);
    const moved = yield* step("lifecycle", () =>
      subscribers.lifecycle(arrived)
    );
    if (moved) {
      taskId = moved;
    }
    console.log(
      `${said}: lifecycle${moved ? ` moved ${moved}` : ", nothing moved"}`
    );
    if (taskId !== row.taskId) {
      db.ingress.setEvent(row.id, { taskId });
    }
    // CawCo's own write is no outsider's.
    const held = ours
      ? false
      : yield* step("outsiders", () =>
          subscribers.outsiders(arrived, taskId, syncs)
        );
    if (held) {
      console.log(`${said}: outsiders, held for the person`);
    }
    const fresh = db.ingress.event(row.id) ?? row;
    yield* step("route", () =>
      subscribers.route(
        { event, row: { ...fresh, taskId } },
        { taskId, lifecycle: moved !== undefined, synced: syncs, held, ours }
      )
    );
    console.log(`${said}: routing done`);
    db.ingress.setEvent(row.id, { processedAt: new Date() });
  });

  /** Comments edited since their events were stored: each entry rewritten on its task (links.ts `fileComment`), nothing routed. */
  const fileEdits = Effect.fnUntraced(function* (
    rows: readonly InboundEventRow[]
  ): Effect.fn.Return<void, SubscriberFailed> {
    for (const row of rows) {
      const linked = yield* step("links", () =>
        subscribers.links({ event: storedEvent(row), row })
      );
      if (isProblem(linked)) {
        console.warn(
          `[intake] ${row.source} ${row.deliveryKey}: its edit was not filed: ${linked.response.detail}`
        );
      }
    }
  });

  /** A batch's events, per item, oldest first: a group stops at the first that throws. */
  const runEvents = Effect.fnUntraced(function* (
    batch: Batch
  ): Effect.fn.Return<void> {
    const atOf = (row: InboundEventRow): number => {
      const { at } = storedEvent(row);
      return at > 0 ? at : row.receivedAt.getTime();
    };
    const byItem = new Map<string, InboundEventRow[]>();
    for (const row of [...batch.rows].sort((a, b) => atOf(a) - atOf(b))) {
      const key = row.itemId ?? row.id;
      byItem.set(key, [...(byItem.get(key) ?? []), row]);
    }
    for (const group of byItem.values()) {
      yield* Effect.forEach(group, (row) => runOne(batch, row), {
        discard: true,
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() =>
            console.warn(
              `[intake] an event on item ${group[0]?.itemId ?? "none"} stays unprocessed, and runs again after the project's next read: ${causeWords(cause)}`
            )
          )
        )
      );
    }
  });

  /** The rows left to sync that no event named. */
  const runUnsynced = Effect.fnUntraced(function* (
    projectId: string,
    batch: Batch
  ): Effect.fn.Return<void> {
    for (const itemId of [...batch.unsynced.keys()]) {
      const synced = yield* syncItem(batch, projectId, itemId).pipe(
        Effect.catchCause((cause) =>
          Effect.sync((): undefined => {
            console.warn(
              `[intake] item ${itemId}: the sync stopped short, and runs again after the project's next read: ${causeWords(cause)}`
            );
          })
        )
      );
      if (synced !== undefined && isProblem(synced)) {
        console.log(
          `[intake] item ${itemId} runs again after the project's next read`
        );
      }
    }
  });

  /** One project's batch, in its turn: boards, edits, then per item, oldest event first, then the items with no event. */
  const process = (projectId: string, batch: Batch) =>
    turns.withLock(
      projectId,
      Effect.gen(function* () {
        if (batch.carriesLeft) {
          leftQueued.delete(projectId);
        }
        if (batch.moved.length > 0) {
          subscribers.linksMoved(projectId, batch.moved);
        }
        for (const { watchId, board } of batch.boards) {
          yield* step("board", () =>
            subscribers.sync.board(projectId, watchId, board)
          );
        }
        yield* fileEdits(batch.edited);
        yield* runEvents(batch);
        yield* runUnsynced(projectId, batch);
      })
    );

  /** Runs a project's batch on a fiber of its own: a take answers before it runs. */
  const later = (projectId: string, batch: Batch): Effect.Effect<void> => {
    if (
      batch.rows.length === 0 &&
      batch.moved.length === 0 &&
      batch.edited.length === 0 &&
      batch.boards.length === 0 &&
      batch.unsynced.size === 0
    ) {
      return Effect.sync(() => {
        if (batch.carriesLeft) {
          leftQueued.delete(projectId);
        }
      });
    }
    return Effect.asVoid(
      Effect.forkDetach(
        process(projectId, batch).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() =>
              console.warn(
                `[intake] project ${projectId}'s events did not run: ${causeWords(cause)}`
              )
            )
          )
        )
      )
    );
  };

  /** What a project left to run (an event unprocessed, a row unsynced), beside `batch`, unless a batch of the project queued already carries it: a step that stopped short runs again, once a read. */
  const withLeft = (projectId: string, batch: Batch): Batch => {
    if (leftQueued.has(projectId)) {
      return batch;
    }
    leftQueued.add(projectId);
    const known = new Set(batch.rows.map((row) => row.id));
    const rows = [
      ...batch.rows,
      ...db.intake.unprocessed(projectId).filter((row) => !known.has(row.id)),
    ];
    const unsynced = new Map(batch.unsynced);
    for (const item of db.intake.unsynced(projectId)) {
      if (!unsynced.has(item.id)) {
        unsynced.set(item.id, { item });
      }
    }
    return { ...batch, rows, unsynced, carriesLeft: true };
  };

  /**
   * THE door: one read or delivery stored once, then its subscribers run
   * in the project's turn, on a fiber of their own, with whatever the
   * project left to run. Answers how many events it stored, once the store
   * is done and before any subscriber runs.
   */
  const take = Effect.fnUntraced(function* (
    at: IntakeAt,
    ingested: Ingested,
    via: InboundVia,
    baseline: boolean
  ): Effect.fn.Return<number> {
    const moved = MOVED[at.provider];
    const taken = db.intake.take({
      projectId: at.projectId,
      watchId: at.watchId,
      ingested,
      via,
      baseline,
      payloadOf: storedPayload,
      ...(moved ? { moved } : {}),
    });
    for (const { row } of taken.events) {
      console.log(
        `[intake] ${row.source} ${row.deliveryKey} landed via ${via}`
      );
    }
    if (taken.events.length > 0) {
      eventLanded(at.projectId);
    }
    yield* later(
      at.projectId,
      withLeft(at.projectId, {
        rows: taken.events.map(({ row }) => row),
        edited: taken.edited.map(({ row }) => row),
        moved: taken.moved,
        boards:
          ingested.board && at.watchId
            ? [{ watchId: at.watchId, board: ingested.board }]
            : [],
        unsynced: new Map(
          taken.revised.map(({ item, revision }) => [
            item.id,
            { item, revision },
          ])
        ),
      })
    );
    return taken.events.length;
  });

  /** Hub start: every event a stopped hub left unprocessed, and every row the sync has not taken in, runs again in its project's turn. */
  const start = (): void => {
    const left = db.intake.unprocessed();
    const unsynced = db.intake.unsynced();
    if (left.length > 0 || unsynced.length > 0) {
      console.log(
        `[intake] a stopped hub left ${left.length} event${left.length === 1 ? "" : "s"} unprocessed and ${unsynced.length} item${unsynced.length === 1 ? "" : "s"} the sync had not taken in: they run again`
      );
    }
    const projects = new Set([
      ...left.map((row) => row.projectId),
      ...unsynced.map((item) => item.projectId),
    ]);
    Effect.runSync(
      Effect.forEach(
        projects,
        (projectId) =>
          later(
            projectId,
            withLeft(projectId, {
              rows: [],
              edited: [],
              moved: [],
              boards: [],
              unsynced: new Map(),
            })
          ),
        { discard: true }
      )
    );
  };

  /** Done once every project's events taken so far have run: for a caller that reads what they did. */
  const settled = (projectId: string): Effect.Effect<void> =>
    turns.withLock(projectId, Effect.void);

  return { settled, start, take, turn };
};

export type Intake = ReturnType<typeof createIntake>;
