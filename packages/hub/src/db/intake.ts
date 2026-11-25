/**
 * The door's store (provider spec §2.5, hub intake.ts `take`): what one
 * read or delivery holds, written in one transaction. This and nothing else
 * inserts an inbound event; the mirror's content comes in here for every
 * provider read and delivery (the task links' own rows and the tracker
 * sync's record, until it subscribes, write it beside).
 *
 * - **Revisions** first, each through the mirror's door
 *   (db external-items.ts `takeRevision`): one whose version the mirror
 *   holds stores nothing of the item. Each one that moves the item past
 *   the state it held is asked of its provider for the events that move
 *   says (a reopen).
 * - **Events** next, each inserted once on (project, source, key): one
 *   whose key is there stores nothing. An event that is its revision's
 *   change (a connector poll's record) is stored only when its revision
 *   wrote. Each names its watch and its item's mirror row.
 * - **A whole listing** (a connector poll's answer) drops the container's
 *   records it no longer lists, so a record's return is new again.
 * - **A baseline** stores its events as already handled
 *   (`processed_at`), so nothing runs for them and a later read of the
 *   same window stores nothing.
 */
import type {
  Ingested,
  ItemRevision,
  MirroredRef,
  MirrorState,
  SourceEvent,
} from "@cawco/providers/provider";
import { and, asc, eq, isNull, notInArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { type ItemRow, mirrorRefOf, takeRevision } from "./external-items";
import type { InboundEventRow } from "./ingress";
import { externalItems, inboundEvents } from "./schema";
import type { InboundVia } from "./stored-types";
import type { Tx } from "./tx";

/** What one take stores, as the door hands it over. */
export interface TakeInput {
  baseline: boolean;
  ingested: Ingested;
  /** The events a revision's move over the state the mirror held says (its provider's `moved`). */
  moved?: (revision: ItemRevision, held: MirrorState | null) => SourceEvent[];
  /** An event as stored: JSON of at most 64 KB. */
  payloadOf: (event: SourceEvent) => string;
  projectId: string;
  via: InboundVia;
  watchId: string | null;
}

/** An event the take stored, and the item row it names. */
export interface StoredEvent {
  event: SourceEvent;
  item: ItemRow | undefined;
  row: InboundEventRow;
}

/** What one take stored: its new events (oldest first) and the items whose state or title moved. */
export interface Taken {
  events: StoredEvent[];
  moved: ItemRow[];
}

/** An item as one string, for the take's own bookkeeping. */
const itemKey = (
  ref: Pick<MirroredRef, "provider" | "host" | "container" | "kind" | "key">
) => JSON.stringify([ref.provider, ref.host, ref.container, ref.kind, ref.key]);

/** What the revisions of one take wrote: each item's row, those written, those moved, and the events their moves raise. */
interface Revised {
  items: Map<string, ItemRow>;
  moved: Map<string, ItemRow>;
  raised: SourceEvent[];
  written: Set<string>;
}

/** Each revision through the mirror's door, its move asked of its provider. */
const takeRevisions = (tx: Tx, input: TakeInput, now: Date): Revised => {
  const out: Revised = {
    items: new Map(),
    moved: new Map(),
    raised: [],
    written: new Set(),
  };
  for (const revision of input.ingested.revisions) {
    const { etag, item, snapshot, version } = revision;
    const taken = takeRevision(
      tx,
      input.projectId,
      mirrorRefOf(item),
      {
        externalId: snapshot.externalId,
        title: snapshot.title,
        state: snapshot.state,
        stateName: snapshot.stateName,
        author: snapshot.author,
        labels: snapshot.labels,
        version,
      },
      { readAt: now, problem: null, ...(etag === undefined ? {} : { etag }) }
    );
    const key = itemKey(item);
    out.items.set(key, taken.item);
    if (!taken.wrote) {
      continue;
    }
    out.written.add(key);
    if (taken.moved) {
      out.moved.set(taken.item.id, taken.item);
    }
    out.raised.push(...(input.moved?.(revision, taken.held) ?? []));
  }
  return out;
};

/** A whole listing's container keeps only the records it lists. */
const dropUnlisted = (tx: Tx, input: TakeInput): void => {
  const { revisions, whole } = input.ingested;
  if (!whole) {
    return;
  }
  const listed = revisions
    .filter((one) => one.item.container === whole.container)
    .map((one) => one.item.key);
  tx.delete(externalItems)
    .where(
      and(
        eq(externalItems.projectId, input.projectId),
        eq(externalItems.provider, "connection"),
        eq(externalItems.host, ""),
        eq(externalItems.container, whole.container),
        eq(externalItems.kind, "record"),
        listed.length > 0 ? notInArray(externalItems.key, listed) : undefined
      )
    )
    .run();
};

/** The mirror row of the item an event names, made when the take wrote none; undefined when it names none. */
const itemOfEvent = (
  tx: Tx,
  projectId: string,
  event: SourceEvent,
  items: Map<string, ItemRow>
): ItemRow | undefined => {
  const ref = event.item;
  if (!ref) {
    return;
  }
  const key = itemKey(ref);
  const known = items.get(key);
  if (known) {
    return known;
  }
  const { item } = takeRevision(tx, projectId, mirrorRefOf(ref), {});
  items.set(key, item);
  return item;
};

/** Each event inserted once on (project, source, key), oldest first: those stored, unless the take is a baseline. */
const storeEvents = (
  tx: Tx,
  input: TakeInput,
  revised: Revised,
  now: Date
): StoredEvent[] => {
  const stored: StoredEvent[] = [];
  const ordered = [...revised.raised, ...input.ingested.events].sort(
    (a, b) => a.at - b.at
  );
  for (const event of ordered) {
    if (
      event.change &&
      !(event.item && revised.written.has(itemKey(event.item)))
    ) {
      continue;
    }
    const item = itemOfEvent(tx, input.projectId, event, revised.items);
    const row = tx
      .insert(inboundEvents)
      .values({
        id: crypto.randomUUID(),
        source: event.source,
        deliveryKey: event.key,
        kind: event.kind,
        projectId: input.projectId,
        watchId: input.watchId,
        itemId: item?.id ?? null,
        origin: "outside",
        taskId: null,
        payload: input.payloadOf(event),
        receivedAt: now,
        via: input.via,
        routedTo: null,
        routeId: null,
        handledAt: null,
        processedAt: input.baseline ? now : null,
      })
      .onConflictDoNothing()
      .returning()
      .get();
    if (row && !input.baseline) {
      stored.push({ event, item, row });
    }
  }
  return stored;
};

/** The rows the door keeps. */
export interface IntakeDb {
  /** One read or delivery stored, in one transaction. */
  readonly take: (input: TakeInput) => Taken;
  /** Every event whose subscribers have not run to the end, oldest first. */
  readonly unprocessed: () => InboundEventRow[];
}

export const intakeDb = (db: BunSQLiteDatabase): IntakeDb => ({
  unprocessed: () =>
    db
      .select()
      .from(inboundEvents)
      .where(isNull(inboundEvents.processedAt))
      .orderBy(asc(inboundEvents.receivedAt))
      .all(),
  take: (input) =>
    db.transaction((tx) => {
      const now = new Date();
      const revised = takeRevisions(tx, input, now);
      dropUnlisted(tx, input);
      return {
        events: storeEvents(tx, input, revised, now),
        moved: [...revised.moved.values()],
      };
    }),
});
