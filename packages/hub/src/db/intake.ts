/**
 * The door's store (provider spec §2.5, hub intake.ts `take`): what one
 * read or delivery holds, written in one transaction. This and nothing else
 * inserts an inbound event, and the mirror's content comes in here alone:
 * every provider read and delivery, what the tracker sync itself read or
 * wrote of an issue ({@link IntakeDb.own}), and the empty row a link or a
 * record names before anything was read of it ({@link itemFor}).
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
 * - **A comment edited** since its event was stored (a later `editedAt`)
 *   rewrites that event's payload, and is handed back as edited: its entry
 *   on its task is rewritten, and nothing is routed again.
 * - **What the sync took in**: each mirror row's `synced_version`. A row
 *   whose `version` is past it is one the sync has still to take
 *   ({@link IntakeDb.unsynced}).
 */
import type {
  Ingested,
  ItemRevision,
  MirroredRef,
  MirrorState,
  SourceEvent,
} from "@cawco/providers/provider";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { z } from "zod";
import { type ItemRow, mirrorRefOf, takeRevision } from "./external-items";
import type { InboundEventRow } from "./ingress";
import { externalItems, inboundEvents } from "./schema";
import type { InboundVia } from "./stored-types";
import type { Tx } from "./tx";

/** What `routed_to` reads on an event held for the person on an item no task links (hub outsiders.ts). */
export const HELD_OUTSIDER = "outsider";

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

/** A revision the take wrote, and the item row it wrote. */
export interface StoredRevision {
  item: ItemRow;
  revision: ItemRevision;
}

/** What one take stored: its new events (oldest first), the comments edited since, the revisions it wrote, and the items whose state or title moved. */
export interface Taken {
  edited: StoredEvent[];
  events: StoredEvent[];
  moved: ItemRow[];
  revised: StoredRevision[];
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
  revised: StoredRevision[];
  written: Set<string>;
}

/** Each revision through the mirror's door, its move asked of its provider. */
const takeRevisions = (tx: Tx, input: TakeInput, now: Date): Revised => {
  const out: Revised = {
    items: new Map(),
    moved: new Map(),
    raised: [],
    revised: [],
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
    out.revised.push({ item: taken.item, revision });
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
): { edited: StoredEvent[]; stored: StoredEvent[] } => {
  const stored: StoredEvent[] = [];
  const edited: StoredEvent[] = [];
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
    } else if (!(row || input.baseline)) {
      const edit = editedOf(tx, input, event, item);
      if (edit) {
        edited.push(edit);
      }
    }
  }
  return { stored, edited };
};

/**
 * A comment event whose key is stored, edited on its source since (its
 * `editedAt` later than the stored one's): the stored payload rewritten
 * with its words, handed back; undefined for anything else.
 */
const editedOf = (
  tx: Tx,
  input: TakeInput,
  event: SourceEvent,
  item: ItemRow | undefined
): StoredEvent | undefined => {
  const editedAt = event.comment?.editedAt;
  if (editedAt === null || editedAt === undefined) {
    return;
  }
  const held = tx
    .select()
    .from(inboundEvents)
    .where(
      and(
        eq(inboundEvents.projectId, input.projectId),
        eq(inboundEvents.source, event.source),
        eq(inboundEvents.deliveryKey, event.key)
      )
    )
    .get();
  const was = held ? editedAtOf(held.payload) : undefined;
  if (!held || (was !== undefined && was !== null && was >= editedAt)) {
    return;
  }
  const row = tx
    .update(inboundEvents)
    .set({ payload: input.payloadOf(event) })
    .where(eq(inboundEvents.id, held.id))
    .returning()
    .get();
  return row && { event, item, row };
};

/** A stored payload's comment, as far as an edit reads it. */
const CommentPayloadSchema = z.object({
  comment: z.object({ editedAt: z.number().nullable() }),
});

/** The `comment.editedAt` a stored payload holds; undefined when it holds none. */
const editedAtOf = (payload: string): number | null | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    parsed = undefined;
  }
  const read = CommentPayloadSchema.safeParse(parsed);
  return read.success ? read.data.comment.editedAt : undefined;
};

/** The mirror row of `ref` for a project, made empty when it has none: what a link or a record names before anything was read of it. */
export const itemFor = (
  tx: Parameters<typeof takeRevision>[0],
  projectId: string,
  ref: MirroredRef
): ItemRow => takeRevision(tx, projectId, mirrorRefOf(ref), {}).item;

const DIGITS = /^\d+$/u;

/** Whether `held` is a later version than `version`: both the source's ms, compared as numbers. */
const newer = (held: string | null, version: string | null): boolean =>
  held !== null &&
  version !== null &&
  DIGITS.test(held) &&
  DIGITS.test(version) &&
  BigInt(held) > BigInt(version);

/** The rows the door keeps. */
export interface IntakeDb {
  /** Every event held for the person on an item no task links (outsiders.ts), not yet answered, oldest first. */
  readonly heldOutsiders: () => InboundEventRow[];
  /** One mirror row by its id, as it stands now. */
  readonly item: (id: string) => ItemRow | undefined;
  /**
   * What the tracker sync read or wrote of a project's issues itself (an
   * issue it read to reconcile, opened, or changed): each revision through
   * the mirror's door as a take's, no event, and each taken in by the sync
   * (`synced_version`) as it is written. Answers the items whose state or
   * title moved.
   */
  readonly own: (projectId: string, revisions: ItemRevision[]) => ItemRow[];
  /** The sync took the row in at `version` (provider spec §2.5): it is not run again for it; a later version it took in already stands. */
  readonly synced: (itemId: string, version: string | null) => void;
  /** One read or delivery stored, in one transaction. */
  readonly take: (input: TakeInput) => Taken;
  /** Every event whose subscribers have not run to the end, oldest first; a project's alone when named. */
  readonly unprocessed: (projectId?: string) => InboundEventRow[];
  /** Every mirror row whose `version` is past what the sync took in (`synced_version`); a project's alone when named. */
  readonly unsynced: (projectId?: string) => ItemRow[];
}

export const intakeDb = (db: BunSQLiteDatabase): IntakeDb => ({
  heldOutsiders: () =>
    db
      .select()
      .from(inboundEvents)
      .where(
        and(
          eq(inboundEvents.routedTo, HELD_OUTSIDER),
          isNull(inboundEvents.handledAt)
        )
      )
      .orderBy(asc(inboundEvents.receivedAt))
      .all(),
  item: (id) =>
    db.select().from(externalItems).where(eq(externalItems.id, id)).get(),
  unprocessed: (projectId) =>
    db
      .select()
      .from(inboundEvents)
      .where(
        and(
          isNull(inboundEvents.processedAt),
          projectId === undefined
            ? undefined
            : eq(inboundEvents.projectId, projectId)
        )
      )
      .orderBy(asc(inboundEvents.receivedAt))
      .all(),
  unsynced: (projectId) =>
    db
      .select()
      .from(externalItems)
      .where(
        and(
          isNotNull(externalItems.version),
          or(
            isNull(externalItems.syncedVersion),
            sql`${externalItems.syncedVersion} != ${externalItems.version}`
          ),
          projectId === undefined
            ? undefined
            : eq(externalItems.projectId, projectId)
        )
      )
      .all(),
  synced: (itemId, version) => {
    const held = db
      .select({ syncedVersion: externalItems.syncedVersion })
      .from(externalItems)
      .where(eq(externalItems.id, itemId))
      .get();
    // What the sync wrote itself since (`own`) is newer: it stands.
    if (held && !newer(held.syncedVersion, version)) {
      db.update(externalItems)
        .set({ syncedVersion: version })
        .where(eq(externalItems.id, itemId))
        .run();
    }
  },
  own: (projectId, revisions) =>
    db.transaction((tx) => {
      const now = new Date();
      const revised = takeRevisions(
        tx,
        {
          projectId,
          watchId: null,
          ingested: { revisions, events: [] },
          via: "poll",
          baseline: false,
          payloadOf: () => "",
        },
        now
      );
      const ids = revised.revised.map(({ item }) => item.id);
      if (ids.length > 0) {
        tx.update(externalItems)
          .set({ syncedVersion: sql`${externalItems.version}` })
          .where(inArray(externalItems.id, ids))
          .run();
      }
      return [...revised.moved.values()];
    }),
  take: (input) =>
    db.transaction((tx) => {
      const now = new Date();
      const revised = takeRevisions(tx, input, now);
      dropUnlisted(tx, input);
      const { stored, edited } = storeEvents(tx, input, revised, now);
      return {
        events: stored,
        edited,
        moved: [...revised.moved.values()],
        revised: revised.revised,
      };
    }),
});
