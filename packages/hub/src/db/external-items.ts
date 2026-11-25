/**
 * The hub's mirror of outside items (schema `external_items`, provider spec
 * §2.3): one row per project and item, and THE writer of it. Every path
 * that learns what an item holds writes it here and nowhere else, through
 * the door's store (db/intake.ts, by {@link takeRevision}): a provider's
 * read or delivery, what the tracker sync read or wrote of an issue, and
 * the empty row a task's link or record names before it was read
 * (db/intake.ts `itemFor`). A link read that stopped short writes only its
 * problem and time (links.ts `readLinks`, {@link writeItemById}).
 *
 * A revision carries a `version` (the source's updated-at in ms, or a
 * record's version) when it knows one: one older than the version held
 * writes none of what it says of the item, only what it says of the read
 * (`readAt`, `etag`, `problem`), so an event read late never puts an older
 * state over a newer one.
 */
import type { MirroredRef } from "@cawco/providers/provider";
import { and, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { externalItems } from "./schema";

export type ItemRow = typeof externalItems.$inferSelect;

type Writer = Pick<BunSQLiteDatabase, "insert" | "select" | "update">;

/** An item as the mirror keys it: one a URL names, or a connector poll's record. */
export type MirrorRef = MirroredRef;

/** What one read, event or sync says of an item; a field left out stays as held. */
export type ItemPatch = Partial<
  Omit<ItemRow, keyof MirrorRef | "id" | "projectId">
>;

/** The fields a revision says of the item itself, which an older version never writes. */
const SNAPSHOT: ReadonlySet<string> = new Set<keyof ItemPatch>([
  "externalId",
  "title",
  "state",
  "stateName",
  "author",
  "labels",
  "version",
]);

const DIGITS = /^\d+$/u;

/** Whether `version` is older than `held`: both the source's ms, compared as numbers. A record's version (its poll's own) is never older, only other: the writer never asks. */
const older = (
  held: string | null,
  version: string | null | undefined
): boolean =>
  typeof version === "string" &&
  held !== null &&
  DIGITS.test(version) &&
  DIGITS.test(held) &&
  BigInt(version) < BigInt(held);

/** An item as the mirror keys it, whatever else its value carries. */
export const mirrorRefOf = (item: MirroredRef): MirrorRef => ({
  provider: item.provider,
  host: item.host,
  container: item.container,
  kind: item.kind,
  key: item.key,
  ref: item.ref,
  url: item.url,
});

/** What a write did: the row as it now stands, and whether its state or title moved. */
export interface ItemWritten {
  item: ItemRow;
  moved: boolean;
}

/** `revision` over the row `held`: its snapshot unless older, its read always. */
const writeOver = (
  tx: Writer,
  held: ItemRow,
  revision: ItemPatch
): ItemWritten => {
  const patch: ItemPatch =
    held.kind !== "record" && older(held.version, revision.version)
      ? Object.fromEntries(
          Object.entries(revision).filter(([field]) => !SNAPSHOT.has(field))
        )
      : revision;
  const moved =
    (patch.state !== undefined && patch.state !== held.state) ||
    (patch.title !== undefined && patch.title !== held.title);
  if (Object.keys(patch).length === 0) {
    return { item: held, moved };
  }
  const item =
    tx
      .update(externalItems)
      .set(patch)
      .where(eq(externalItems.id, held.id))
      .returning()
      .get() ?? held;
  return { item, moved };
};

/** The project's mirror row of `ref`, or undefined while it has none. */
const itemOf = (
  tx: Pick<BunSQLiteDatabase, "select">,
  projectId: string,
  ref: Omit<MirrorRef, "ref" | "url">
): ItemRow | undefined =>
  tx
    .select()
    .from(externalItems)
    .where(
      and(
        eq(externalItems.projectId, projectId),
        eq(externalItems.provider, ref.provider),
        eq(externalItems.host, ref.host),
        eq(externalItems.container, ref.container),
        eq(externalItems.kind, ref.kind),
        eq(externalItems.key, ref.key)
      )
    )
    .get();

/**
 * THE writer: the project's mirror row of `ref`, made when it has none,
 * with `revision` written over it (nothing, when it says nothing).
 */
const writeItem = (
  tx: Writer,
  projectId: string,
  ref: MirrorRef,
  revision: ItemPatch = {}
): ItemWritten => {
  const held = itemOf(tx, projectId, ref);
  if (held) {
    return writeOver(tx, held, revision);
  }
  const item = tx
    .insert(externalItems)
    .values({ id: crypto.randomUUID(), projectId, ...ref, ...revision })
    .returning()
    .get();
  return {
    item,
    moved: item.state !== null || item.title !== "",
  };
};

/** THE writer, for a row already held, by its id; undefined when it is gone. */
export const writeItemById = (
  tx: Writer,
  id: string,
  revision: ItemPatch
): ItemWritten | undefined => {
  const held = tx
    .select()
    .from(externalItems)
    .where(eq(externalItems.id, id))
    .get();
  return held && writeOver(tx, held, revision);
};

/** What the door's write of one revision did: the row as it stands, the state it held before, and whether the revision was new. */
export interface RevisionTaken {
  /** The state the mirror held before; null when it held none (or no row). */
  held: ItemRow["state"];
  item: ItemRow;
  moved: boolean;
  /** Whether the revision was newer than the one held: it wrote the item. */
  wrote: boolean;
}

/**
 * The door's write of one revision (hub intake.ts `take`): a revision whose
 * version the mirror holds (or one older) writes nothing of the item, only
 * what `read` says of the read that found it; a newer one writes the item
 * through {@link writeItem}.
 */
export const takeRevision = (
  tx: Writer,
  projectId: string,
  ref: MirrorRef,
  revision: ItemPatch,
  read: Pick<ItemPatch, "etag" | "problem" | "readAt"> = {}
): RevisionTaken => {
  const held = itemOf(tx, projectId, ref);
  const version = revision.version ?? null;
  const known =
    held !== undefined &&
    held.version !== null &&
    version !== null &&
    (held.version === version ||
      (held.kind !== "record" && older(held.version, version)));
  if (held && known) {
    const kept =
      Object.keys(read).length > 0 ? writeOver(tx, held, read).item : held;
    return { item: kept, held: held.state, moved: false, wrote: false };
  }
  const written = writeItem(tx, projectId, ref, { ...revision, ...read });
  return {
    item: written.item,
    held: held?.state ?? null,
    moved: written.moved,
    wrote: true,
  };
};
